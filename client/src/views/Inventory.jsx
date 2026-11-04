import React, { useState, useEffect } from 'react';

export default function Inventory({ user }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState('view'); // 'view', 'sell', 'feed'
  const [selectedCardForFeed, setSelectedCardForFeed] = useState(null); // Carta principal que vai receber o XP

  useEffect(() => {
    if (!user) return;
    const userId = user.id_user || user.id;

    fetch(`https://npcardgame.onrender.com/api/user/${userId}/profile`)
      .then((res) => res.json())
      .then((data) => {
        if (data.cards) {
          setCards(data.cards);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Erro ao carregar inventário:', err);
        setLoading(false);
      });
  }, [user]);

  // Função para lidar com o clique numa carta dependendo do modo ativo
  const handleCardClick = (card) => {
    if (mode === 'sell') {
      if (window.confirm(`Tens a certeza que queres vender a carta ${card.name}?`)) {
        // TODO: Enviar pedido para o backend para vender a carta
        alert(`Carta ${card.name} vendida com sucesso!`);
      }
    } else if (mode === 'feed') {
      if (!selectedCardForFeed) {
        setSelectedCardForFeed(card);
        alert(`Selecionaste a carta ${card.name} para receber o XP. Agora escolhe a carta que queres usar como sacrifício (feed).`);
      } else if (selectedCardForFeed.id_card === card.id_card) {
        alert('Não podes usar a mesma carta para alimentar a si própria!');
      } else {
        if (window.confirm(`Queres usar ${card.name} para alimentar ${selectedCardForFeed.name}?`)) {
          // TODO: Enviar pedido para o backend para processar o feed (remover a carta sacrificada e somar XP à principal)
          alert(`Carta ${card.name} consumida com sucesso!`);
          setSelectedCardForFeed(null);
          setMode('view');
        }
      }
    }
  };

  if (loading) return <div style={{ color: '#fff', padding: '20px' }}>A abrir pergaminhos de inventário...</div>;

  return (
    <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>📜 Inventário de Cartas do Shinobi</h2>

      {/* Opções no Topo */}
      <div style={{ display: 'flex', gap: '15px', margin: '20px 0', background: '#1e1e2e', padding: '15px', borderRadius: '8px', alignItems: 'center' }}>
        <span style={{ fontWeight: 'bold', color: '#ff9900' }}>Ação:</span>
        <button 
          onClick={() => { setMode('view'); setSelectedCardForFeed(null); }}
          style={{ padding: '8px 15px', background: mode === 'view' ? '#ff9900' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          👁️ Ver Inventário
        </button>
        <button 
          onClick={() => { setMode('sell'); setSelectedCardForFeed(null); }}
          style={{ padding: '8px 15px', background: mode === 'sell' ? '#ef4444' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          💰 Vender Card
        </button>
        <button 
          onClick={() => { setMode('feed'); setSelectedCardForFeed(null); }}
          style={{ padding: '8px 15px', background: mode === 'feed' ? '#3b82f6' : '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
          ✨ Dar Feed (Power-up)
        </button>
      </div>

      {mode === 'feed' && (
        <div style={{ background: '#2d3748', padding: '10px 15px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', borderLeft: '4px solid #3b82f6' }}>
          {selectedCardForFeed ? (
            <span>Carta Alvo: <strong style={{ color: '#ff9900' }}>{selectedCardForFeed.name} (Nvl {selectedCardForFeed.level || 1})</strong>. Agora clica na carta que queres sacrificar.</span>
          ) : (
            <span>Modo Feed Ativo: Clica primeiro na carta que **vais upar** (alvo).</span>
          )}
        </div>
      )}
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
        {cards.length === 0 ? (
          <p style={{ color: '#aaa' }}>Nenhuma carta encontrada no teu inventário. Visita o Portal de Invocação (Gacha) para conseguires cartas!</p>
        ) : (
          cards.map((card, index) => {
            const currentLevel = card.level || 1;
            const currentXp = card.xp || 0;
            const xpNeeded = currentLevel * 1000;
            const isSelected = selectedCardForFeed?.id_card === card.id_card;

            return (
              <div
                key={card.id_card || index}
                onClick={() => handleCardClick(card)}
                style={{
                  background: isSelected ? '#2b6cb0' : '#1e1e2e',
                  border: isSelected ? '2px solid #63b3ed' : (card.classe === 'UR' ? '2px solid #ffd700' : '1px solid #ff9900'),
                  borderRadius: '10px',
                  padding: '15px',
                  textAlign: 'center',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: mode !== 'view' ? 'pointer' : 'default',
                  transition: 'transform 0.2s',
                  transform: isSelected ? 'scale(1.03)' : 'scale(1)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
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