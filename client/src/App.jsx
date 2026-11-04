import React, { useState, useEffect } from 'react';

export default function Inventory({ user, setUser }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('view'); // 'view', 'sell', 'feed'
  const [selectedCards, setSelectedCards] = useState([]);
  const [targetCardForFeed, setTargetCardForFeed] = useState(null);
  const [notification, setNotification] = useState(null);

  // Previsões em tempo real
  const [sellPreview, setSellPreview] = useState(0);
  const [feedPreview, setFeedPreview] = useState(null);

  const showNotice = (text, type = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Obtenção segura e normalizada do ID do utilizador
  const getUserId = () => {
    if (!user) return null;
    return user.id_user || user.id || null;
  };

  // Carregar inventário do servidor
  const fetchInventory = () => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      showNotice('Acesso negado. Sem identificação.', 'error');
      return;
    }

    const API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';

    fetch(`${API_URL}/api/user/${userId}/profile`)
      .then((res) => res.json())
      .then((data) => {
        if (data.cards) {
          const formattedCards = data.cards.map(c => ({ ...c, is_locked: c.is_locked || false }));
          setCards(formattedCards);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao carregar inventário:', err);
        setLoading(false);
        showNotice('Erro ao carregar o inventário do servidor.', 'error');
      });
  };

  useEffect(() => {
    fetchInventory();
  }, [user]);

  // Atualização dinâmica das previsões (Preview)
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;

    const API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';

    if (mode === 'sell') {
      if (selectedCards.length === 0) {
        setSellPreview(0);
        return;
      }
      fetch(`${API_URL}/api/cards/preview-sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cardIds: selectedCards })
      })
        .then(res => res.json())
        .then(data => setSellPreview(data.totalRyos || 0))
        .catch(err => console.error('Erro no preview sell:', err));
    } else if (mode === 'feed' && targetCardForFeed) {
      const sacrificeCardIds = selectedCards.filter(id => id !== targetCardForFeed.id_card);
      if (sacrificeCardIds.length === 0) {
        setFeedPreview(null);
        return;
      }
      fetch(`${API_URL}/api/cards/preview-feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, targetCardId: targetCardForFeed.id_card, sacrificeCardIds })
      })
        .then(res => res.json())
        .then(data => setFeedPreview(data))
        .catch(err => console.error('Erro no preview feed:', err));
    } else {
      setFeedPreview(null);
    }
  }, [selectedCards, targetCardForFeed, mode, user]);

  const toggleLock = (e, cardId) => {
    e.stopPropagation();
    setCards(prev => prev.map(c => {
      if (c.id_card === cardId) {
        const newStatus = !c.is_locked;
        showNotice(newStatus ? '📌 Carta trancada!' : '🔓 Carta destrancada.', newStatus ? 'warning' : 'info');
        return { ...c, is_locked: newStatus };
      }
      return c;
    }));
  };

  const handleCheckboxToggle = (card) => {
    if (card.is_locked) {
      showNotice('🔒 Esta carta está trancada! Destranca-a primeiro.', 'warning');
      return;
    }

    if (selectedCards.includes(card.id_card)) {
      setSelectedCards(prev => prev.filter(id => id !== card.id_card));
    } else {
      setSelectedCards(prev => [...prev, card.id_card]);
    }
  };

  const handleConfirmSell = () => {
    const userId = getUserId();
    if (!userId) {
      showNotice('Acesso negado. Sem identificação.', 'error');
      return;
    }

    if (selectedCards.length === 0) {
      showNotice('Seleciona pelo menos uma carta para vender.', 'warning');
      return;
    }

    const API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';

    Promise.all(
      selectedCards.map(cardId =>
        fetch(`${API_URL}/api/cards/sell`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, cardId })
        }).then(res => res.json())
      )
    )
    .then(results => {
      const totalRyos = results.reduce((acc, curr) => acc + (curr.ryosGanhos || 0), 0);
      
      // Atualizar cartas locais e saldo global do utilizador
      setCards(prev => prev.filter(c => !selectedCards.includes(c.id_card)));
      setSelectedCards([]);
      setSellPreview(0);

      if (setUser) {
        setUser({ coins: (user.coins || 0) + totalRyos });
      }

      showNotice(`💰 Venda concluída! Vendeste ${results.length} carta(s) e recebeste ${totalRyos} Ryos.`, 'success');
    })
    .catch(() => showNotice('Erro ao processar a venda.', 'error'));
  };

  const handleConfirmFeed = () => {
    const userId = getUserId();
    if (!userId) {
      showNotice('Acesso negado. Sem identificação.', 'error');
      return;
    }

    if (!targetCardForFeed) {
      showNotice('Escolhe a carta principal que vai receber a experiência.', 'warning');
      return;
    }

    const sacrificeCardIds = selectedCards.filter(id => id !== targetCardForFeed.id_card);
    if (sacrificeCardIds.length === 0) {
      showNotice('Seleciona pelo menos uma carta de sacrifício.', 'warning');
      return;
    }

    const API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';

    fetch(`${API_URL}/api/cards/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        targetCardId: targetCardForFeed.id_card,
        sacrificeCardIds
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        setCards(prev => prev.filter(c => !sacrificeCardIds.includes(c.id_card)).map(c => {
          if (c.id_card === targetCardForFeed.id_card) {
            return { ...c, level: data.newLevel, xp: data.newXp };
          }
          return c;
        }));

        setSelectedCards([]);
        setTargetCardForFeed(null);
        setFeedPreview(null);
        setMode('view');
        showNotice(data.message, 'success');
      } else {
        showNotice(data.error || 'Erro ao processar o feed.', 'error');
      }
    })
    .catch(err => {
      console.error(err);
      showNotice('Erro de ligação ao servidor.', 'error');
    });
  };

  if (loading) return <div style={{ color: '#fff', padding: '20px', textAlign: 'center' }}>A carregar o inventário...</div>;

  return (
    <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>📜 Inventário de Cartas do Shinobi</h2>

      {notification && (
        <div style={{
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '15px',
          fontWeight: 'bold',
          background: notification.type === 'success' ? '#15803d' : notification.type === 'warning' ? '#b45309' : '#1e293b',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          {notification.text}
        </div>
      )}

      {/* Painel de Modos */}
      <div style={{ display: 'flex', gap: '15px', margin: '20px 0', background: '#1e1e2e', padding: '15px', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', color: '#ff9900' }}>Modo:</span>
        <button 
          onClick={() => { setMode('view'); setSelectedCards([]); setTargetCardForFeed(null); setFeedPreview(null); }}
          style={{ padding: '8px 15px', background: mode === 'view' ? '#ff9900' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          👁️ Ver Inventário
        </button>
        <button 
          onClick={() => { setMode('sell'); setSelectedCards([]); setTargetCardForFeed(null); setFeedPreview(null); }}
          style={{ padding: '8px 15px', background: mode === 'sell' ? '#ef4444' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          💰 Vender Cartas
        </button>
        <button 
          onClick={() => { setMode('feed'); setSelectedCards([]); setTargetCardForFeed(null); setFeedPreview(null); }}
          style={{ padding: '8px 15px', background: mode === 'feed' ? '#3b82f6' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          ✨ Feed (Subir Nível)
        </button>

        {/* Botão e Preview Vender */}
        {mode === 'sell' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Valor total: 💰 {sellPreview} Ryos</span>
            {selectedCards.length > 0 && (
              <button 
                onClick={handleConfirmSell}
                style={{ padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                Confirmar Venda ({selectedCards.length})
              </button>
            )}
          </div>
        )}

        {/* Botão e Preview Feed */}
        {mode === 'feed' && targetCardForFeed && selectedCards.filter(id => id !== targetCardForFeed.id_card).length > 0 && (
          <button 
            onClick={handleConfirmFeed}
            style={{ marginLeft: 'auto', padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
            Alimentar Carta
          </button>
        )}
      </div>

      {/* Caixa Informativa e Previsões do Feed */}
      {mode === 'feed' && (
        <div style={{ background: '#2d3748', padding: '12px 15px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', borderLeft: '4px solid #3b82f6' }}>
          {targetCardForFeed ? (
            <div>
              <span>Carta Alvo: <strong style={{ color: '#ff9900' }}>{targetCardForFeed.name} (Nvl {targetCardForFeed.level || 1})</strong>. </span>
              {feedPreview ? (
                <div style={{ marginTop: '6px', color: '#68d391', fontWeight: 'bold' }}>
                  ✨ XP Ganho: +{feedPreview.totalXpGanha || 0} | 📈 Nível Previsto: Nvl {feedPreview.previewLevel || 1} ({feedPreview.previewXp || 0} / {feedPreview.xpNeeded || 1000} XP)
                </div>
              ) : (
                <span style={{ color: '#cbd5e0', display: 'block', marginTop: '4px' }}>Seleciona as cartas para sacrificar em baixo para ver a previsão de nível.</span>
              )}
            </div>
          ) : (
            <span style={{ color: '#ff9900', fontWeight: 'bold' }}>Modo Feed: Clica na carta principal do teu inventário que queres **subir de nível**.</span>
          )}
        </div>
      )}

      {/* Grid do Inventário */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
        {cards.length === 0 ? (
          <p style={{ color: '#aaa' }}>Nenhuma carta encontrada no teu inventário.</p>
        ) : (
          cards.map((card, index) => {
            const currentLevel = card.level || 1;
            const currentXp = card.xp || 0;
            const xpNeeded = currentLevel * 1000;
            const isChecked = selectedCards.includes(card.id_card);
            const isTarget = targetCardForFeed?.id_card === card.id_card;

            return (
              <div
                key={card.id_card || index}
                onClick={() => {
                  if (mode === 'feed' && !targetCardForFeed && !card.is_locked) {
                    setTargetCardForFeed(card);
                  }
                }}
                style={{
                  background: isTarget ? '#1e3a8a' : isChecked ? '#2e1065' : '#1e1e2e',
                  border: isTarget ? '2px solid #60a5fa' : isChecked ? '2px solid #a855f7' : (card.classe === 'UR' ? '2px solid #ffd700' : '1px solid #ff9900'),
                  borderRadius: '10px',
                  padding: '15px',
                  textAlign: 'center',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  opacity: card.is_locked ? 0.85 : 1,
                  cursor: (mode === 'feed' && !targetCardForFeed && !card.is_locked) ? 'pointer' : 'default'
                }}
              >
                {/* Botão Lock */}
                <button
                  onClick={(e) => toggleLock(e, card.id_card)}
                  title={card.is_locked ? "Carta Trancada" : "Trancar Carta"}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    background: card.is_locked ? '#ef4444' : 'rgba(0,0,0,0.4)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '26px',
                    height: '26px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2
                  }}
                >
                  {card.is_locked ? '🔒' : '🔓'}
                </button>

                {/* Checkbox */}
                {mode !== 'view' && (!isTarget || mode === 'sell') && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={card.is_locked}
                    onChange={() => handleCheckboxToggle(card)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '18px',
                      height: '18px',
                      cursor: card.is_locked ? 'not-allowed' : 'pointer',
                      accentColor: '#a855f7',
                      zIndex: '2'
                    }}
                  />
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '8px', marginTop: '10px' }}>
                    <span style={{ background: card.classe === 'UR' ? '#ffd700' : '#444', color: card.classe === 'UR' ? '#000' : '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      {card.classe || 'E'}
                    </span>
                    <span style={{ background: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      Nvl {currentLevel}
                    </span>
                  </div>

                  {card.image_url ? (
                    <img src={card.image_url} alt={card.name} style={{ width: '110px', height: '140px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', border: '1px solid #444' }} />
                  ) : (
                    <div style={{ width: '110px', height: '140px', background: '#2a2a2a', margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#777', fontSize: '12px' }}>Sem Imagem</div>
                  )}

                  <h4 style={{ color: '#ff9900', margin: '0 0 4px 0', fontSize: '15px' }}>{card.name}</h4>
                  
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
                    XP: {currentXp} / {xpNeeded}
                  </div>

                  <div style={{ fontSize: '12px', color: '#ddd', display: 'flex', justifyContent: 'space-around', margin: '5px 0' }}>
                    <span>❤️ {card.vida}</span>
                    <span>⚔️ {card.tai}</span>
                    <span>🌀 {card.nin}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}