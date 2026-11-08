import React, { useState, useEffect, useMemo } from 'react';
import Loader from '../components/Loader';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';

export default function Inventory({ user, setUser }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('view'); // 'view', 'sell', 'feed'
  const [selectedCards, setSelectedCards] = useState([]);
  const [targetCardForFeed, setTargetCardForFeed] = useState(null);
  const [notification, setNotification] = useState(null);

  // Estados de Filtro, Ordenação e Paginação
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name-asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8; // Quantidade de cards por página

  // Previsões em tempo real
  const [sellPreview, setSellPreview] = useState(0);
  const [feedPreview, setFeedPreview] = useState(null);
  const [sellValues, setSellValues] = useState({});
  const [processing, setProcessing] = useState(false);

  const showNotice = (text, type = 'info') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const getUserId = () => {
    if (!user) return null;
    return user.id_user || user.id || null;
  };

  const fetchInventory = async (userId) => {
    const res = await authFetch(`${API_URL}/api/user/${userId}/profile`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao carregar o inventário.');
    setCards(prev => {
      const locked = new Set(prev.filter(c => c.is_locked).map(c => c.id_card));
      return (data.cards || []).map(c => ({ ...c, is_locked: locked.has(c.id_card) }));
    });
    return data;
  };

  const syncCoins = (coins) => {
    if (typeof coins !== 'number') return;
    if (typeof setUser === 'function') setUser(prev => ({ ...prev, coins }));
    try {
      const stored = JSON.parse(localStorage.getItem('user')) || {};
      stored.coins = coins;
      localStorage.setItem('user', JSON.stringify(stored));
    } catch (e) {}
  };

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setLoading(false);
      showNotice('Acesso negado. Sem identificação.', 'error');
      return;
    }

    fetchInventory(userId)
      .catch((err) => {
        console.error('Erro ao carregar inventário:', err);
        showNotice('Erro ao carregar o inventário do servidor.', 'error');
      })
      .finally(() => setLoading(false));
  }, [user]);

  // Hierarquia real de raridades/classes
  const classRank = { 'E': 1, 'R': 2, 'SR': 3, 'SSR': 4, 'UR': 5 };

  // Processamento unificado: Pesquisa -> Ordenação -> Paginação
  const processedCards = useMemo(() => {
    let result = [...cards];

    // 1. Pesquisa por nome (ignorando maiúsculas/minúsculas e espaços)
    if (searchTerm.trim() !== '') {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(c => c.name && c.name.toLowerCase().includes(term));
    }

    // 2. Ordenação
    result.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      if (sortBy === 'rarity-asc') {
        return (classRank[a.classe] || 1) - (classRank[b.classe] || 1);
      }
      if (sortBy === 'rarity-desc') {
        return (classRank[b.classe] || 1) - (classRank[a.classe] || 1);
      }
      if (sortBy === 'level-asc') {
        return (a.level || 1) - (b.level || 1);
      }
      if (sortBy === 'level-desc') {
        return (b.level || 1) - (a.level || 1);
      }
      return 0;
    });

    return result;
  }, [cards, searchTerm, sortBy]);

  // Paginação com reposicionamento automático para a página 1 ao filtrar/ordenar
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, sortBy]);

  const totalPages = Math.ceil(processedCards.length / pageSize) || 1;
  const paginatedCards = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedCards.slice(start, start + pageSize);
  }, [processedCards, currentPage]);

  // Previsões dinâmicas
  useEffect(() => {
    const userId = getUserId();
    if (!userId) return;
    let cancelled = false;

    const postJson = async (path, body) => {
      const res = await authFetch(`${API_URL}/api/cards/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no servidor.');
      return data;
    };

    if (mode === 'sell') {
      if (selectedCards.length === 0) {
        setSellPreview(0);
        setSellValues({});
        return;
      }
      postJson('preview-sell', { userId, cardIds: selectedCards })
        .then(data => {
          if (cancelled) return;
          setSellPreview(Number(data.totalRyos) || 0);
          setSellValues(data.perCard || {});
        })
        .catch(err => { if (!cancelled) showNotice(`Erro ao calcular venda: ${err.message}`, 'error'); });
    } else if (mode === 'feed' && targetCardForFeed) {
      const sacrificeCardIds = selectedCards.filter(id => id !== targetCardForFeed.id_card);
      if (sacrificeCardIds.length === 0) {
        setFeedPreview(null);
        return;
      }
      postJson('preview-feed', { userId, targetCardId: targetCardForFeed.id_card, sacrificeCardIds })
        .then(data => { if (!cancelled) setFeedPreview(data); })
        .catch(err => { if (!cancelled) showNotice(`Erro no preview feed: ${err.message}`, 'error'); });
    } else {
      setFeedPreview(null);
    }

    return () => { cancelled = true; };
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
      showNotice('🔒 Esta carta está trancada!', 'warning');
      return;
    }
    if (selectedCards.includes(card.id_card)) {
      setSelectedCards(prev => prev.filter(id => id !== card.id_card));
    } else {
      setSelectedCards(prev => [...prev, card.id_card]);
    }
  };

  const handleSelectAllUnlocked = () => {
    const unlockedIds = processedCards.filter(c => !c.is_locked).map(c => c.id_card);
    const allUnlockedSelected = unlockedIds.every(id => selectedCards.includes(id));

    if (allUnlockedSelected) {
      // Se todas as desbloqueadas já estão selecionadas, remove-as da seleção
      setSelectedCards(prev => prev.filter(id => !unlockedIds.includes(id)));
    } else {
      // Caso contrário, adiciona todas as desbloqueadas à seleção atual (sem duplicados)
      setSelectedCards(prev => Array.from(new Set([...prev, ...unlockedIds])));
    }
  };

  const handleConfirmSell = async () => {
    const userId = getUserId();
    if (!userId || selectedCards.length === 0 || processing) return;
    setProcessing(true);

    try {
      const res = await authFetch(`${API_URL}/api/cards/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cardIds: selectedCards })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro na venda.');

      syncCoins(data.newCoins);
      setSelectedCards([]);
      setSellPreview(0);
      setSellValues({});
      await fetchInventory(userId);
      showNotice(`💰 Venda concluída! +${data.totalRyos} Ryos.`, 'success');
    } catch (err) {
      showNotice(err.message || 'Erro ao vender.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmFeed = async () => {
    const userId = getUserId();
    if (!userId || !targetCardForFeed || processing) return;
    const sacrificeCardIds = selectedCards.filter(id => id !== targetCardForFeed.id_card);
    if (sacrificeCardIds.length === 0) return;
    setProcessing(true);

    try {
      const res = await authFetch(`${API_URL}/api/cards/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, targetCardId: targetCardForFeed.id_card, sacrificeCardIds })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erro no feed.');

      setSelectedCards([]);
      setTargetCardForFeed(null);
      setFeedPreview(null);
      setMode('view');
      await fetchInventory(userId);
      showNotice(data.message, 'success');
    } catch (err) {
      showNotice(err.message || 'Erro no feed.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <Loader text="A carregar o inventário..." />;

  return (
    <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>📜 Inventário de Cartas do Shinobi</h2>

      {notification && (
        <div style={{ padding: '12px 20px', borderRadius: '8px', marginBottom: '15px', fontWeight: 'bold', background: notification.type === 'success' ? '#15803d' : '#b91c1c', color: '#fff' }}>
          {notification.text}
        </div>
      )}

      {/* Painel de Modos */}
      <div style={{ display: 'flex', gap: '15px', margin: '15px 0', background: '#1e1e2e', padding: '15px', borderRadius: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 'bold', color: '#ff9900' }}>Modo:</span>
        <button onClick={() => { setMode('view'); setSelectedCards([]); setTargetCardForFeed(null); }} style={{ padding: '8px 15px', background: mode === 'view' ? '#ff9900' : '#333', color: mode === 'view' ? '#000' : '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>👁️ Ver</button>
        <button onClick={() => { setMode('sell'); setSelectedCards([]); setTargetCardForFeed(null); }} style={{ padding: '8px 15px', background: mode === 'sell' ? '#ef4444' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>💰 Vender</button>
        <button onClick={() => { setMode('feed'); setSelectedCards([]); setTargetCardForFeed(null); }} style={{ padding: '8px 15px', background: mode === 'feed' ? '#3b82f6' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>✨ Feed</button>

        {mode === 'sell' && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
            <span style={{ color: '#22c55e', fontWeight: 'bold' }}>Total: 💰 {sellPreview} Ryos</span>
            {selectedCards.length > 0 && (
              <button onClick={handleConfirmSell} disabled={processing} style={{ padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                {processing ? '⏳ A processar...' : `Vender (${selectedCards.length})`}
              </button>
            )}
          </div>
        )}

        {mode === 'feed' && targetCardForFeed && selectedCards.filter(id => id !== targetCardForFeed.id_card).length > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {feedPreview && (() => {
              const previewStats = feedPreview.previewStats || {};
              const previewCard = {
                vida: previewStats.vida ?? feedPreview.targetStatRanks?.vida?.value,
                tai:  previewStats.tai  ?? feedPreview.targetStatRanks?.tai?.value,
                nin:  previewStats.nin  ?? feedPreview.targetStatRanks?.nin?.value,
                statRanks: feedPreview.targetStatRanks
              };
              const levelUp = (feedPreview.previewLevel || 1) > (targetCardForFeed.level || 1);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', background: '#111827', border: '1px solid #334155', borderRadius: '8px', padding: '8px 10px' }}>
                  <span style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 'bold' }}>
                    ✨ +{feedPreview.totalXpGanha || 0} XP
                    {levelUp ? ` · Nvl ${targetCardForFeed.level || 1} → ${feedPreview.previewLevel}` : ` · Nvl ${feedPreview.previewLevel || 1}`}
                  </span>
                  <OverallRankBadge card={previewCard} />
                  <CardStatsCompact card={previewCard} fontSize="11px" gap="6px" />
                </div>
              );
            })()}
            <button onClick={handleConfirmFeed} disabled={processing} style={{ padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
              {processing ? '⏳ A processar...' : 'Alimentar'}
            </button>
          </div>
        )}
      </div>

      {/* Barra de Pesquisa, Ordenação e Botão Select All */}
      <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap', background: '#191926', padding: '15px', borderRadius: '8px', border: '1px solid #333', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <input
            type="text"
            placeholder="🔍 Pesquisar card por nome..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', background: '#121212', color: '#fff', border: '1px solid #444', borderRadius: '6px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        
        {mode !== 'view' && (
          <div>
            <button
              onClick={handleSelectAllUnlocked}
              style={{ padding: '10px 15px', background: '#4b5563', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ☑️ Selecionar Desbloqueadas
            </button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#aaa' }}>Ordenar:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{ padding: '10px', background: '#121212', color: '#ff9900', border: '1px solid #444', borderRadius: '6px', fontWeight: 'bold', outline: 'none' }}
          >
            <option value="name-asc">Nome (A–Z)</option>
            <option value="name-desc">Nome (Z–A)</option>
            <option value="rarity-desc">Raridade (Decrescente)</option>
            <option value="rarity-asc">Raridade (Crescente)</option>
            <option value="level-desc">Level (Decrescente)</option>
            <option value="level-asc">Level (Crescente)</option>
          </select>
        </div>
      </div>

      {/* Grid de Cards Paginar */}
      {paginatedCards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#1e1e2e', borderRadius: '8px', color: '#aaa' }}>
          {cards.length === 0 ? 'Nenhuma carta encontrada no teu inventário.' : 'Nenhum resultado corresponde à tua pesquisa.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
          {paginatedCards.map((card) => {
            const currentLevel = card.level || 1;
            const currentXp = card.xp || 0;
            const xpNeeded = currentLevel * 1000;
            const isChecked = selectedCards.includes(card.id_card);
            const isTarget = targetCardForFeed?.id_card === card.id_card;

            return (
              <div
                key={card.id_card}
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
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  cursor: (mode === 'feed' && !targetCardForFeed && !card.is_locked) ? 'pointer' : 'default'
                }}
              >
                <button
                  onClick={(e) => toggleLock(e, card.id_card)}
                  style={{ position: 'absolute', top: '8px', left: '8px', background: card.is_locked ? '#ef4444' : 'rgba(0,0,0,0.4)', border: 'none', borderRadius: '50%', width: '26px', height: '26px', cursor: 'pointer', color: '#fff', zIndex: 2 }}
                >
                  {card.is_locked ? '🔒' : '🔓'}
                </button>

                {mode !== 'view' && (!isTarget || mode === 'sell') && (
                  <input
                    type="checkbox"
                    checked={isChecked}
                    disabled={card.is_locked}
                    onChange={() => handleCheckboxToggle(card)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ position: 'absolute', top: '10px', right: '10px', width: '18px', height: '18px', cursor: 'pointer', accentColor: '#a855f7', zIndex: 2 }}
                  />
                )}

                <div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginBottom: '8px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ background: card.classe === 'UR' ? '#ffd700' : '#444', color: card.classe === 'UR' ? '#000' : '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      {card.classe || 'E'}
                    </span>
                    <span style={{ background: '#22c55e', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                      Nvl {currentLevel}
                    </span>
                    <OverallRankBadge card={card} />
                  </div>

                  {card.image_url ? (
                    <img src={card.image_url} alt={card.name} style={{ width: '110px', height: '140px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', border: '1px solid #444' }} />
                  ) : (
                    <div style={{ width: '110px', height: '140px', background: '#2a2a2a', margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#777', fontSize: '12px' }}>Sem Imagem</div>
                  )}

                  <h4 style={{ color: '#ff9900', margin: '0 0 4px 0', fontSize: '15px' }}>{card.name}</h4>
                  <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>XP: {currentXp} / {xpNeeded}</div>
                  
                  {mode === 'sell' && isChecked && sellValues[card.id_card] !== undefined && (
                    <div style={{ fontSize: '12px', color: '#22c55e', fontWeight: 'bold', marginBottom: '6px' }}>💰 {sellValues[card.id_card]} Ryos</div>
                  )}

                  <div style={{ margin: '5px 0' }}>
                    <CardStatsCompact card={card} fontSize="11px" gap="5px" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Controlo de Paginação */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '25px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            style={{ padding: '8px 16px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: '14px', color: '#ccc' }}>
            Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({processedCards.length} cartas encontradas)
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            style={{ padding: '8px 16px', background: '#2a2a2a', color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
          >
            Seguinte →
          </button>
        </div>
      )}
    </div>
  );
}