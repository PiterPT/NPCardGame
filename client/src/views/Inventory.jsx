import React, { useState, useEffect } from 'react';

export default function Inventory({ user }) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const userId = user.id_user || user.id;

    fetch(`https://npcardgame.onrender.com:3000/api/user/${userId}/profile`)
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

  if (loading) return <div style={{ color: '#fff', padding: '20px' }}>A abrir pergaminhos de inventário...</div>;

  return (
    <div style={{ padding: '20px', color: '#fff', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>📜 Inventário de Cartas do Shinobi</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px', marginTop: '20px' }}>
        {cards.length === 0 ? (
          <p style={{ color: '#aaa' }}>Nenhuma carta encontrada no teu inventário. Visita o Portal de Invocação (Gacha) para conseguires cartas!</p>
        ) : (
          cards.map((card, index) => (
            <div
              key={card.id_card || index}
              style={{
                background: '#1e1e2e',
                border: card.classe === 'UR' ? '2px solid #ffd700' : '1px solid #ff9900',
                borderRadius: '10px',
                padding: '15px',
                textAlign: 'center',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                display: 'flex',
                direction: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ background: card.classe === 'UR' ? '#ffd700' : '#444', color: card.classe === 'UR' ? '#000' : '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>
                    {card.classe || 'E'}
                  </span>
                </div>

                {card.image_url ? (
                  <img src={card.image_url} alt={card.name} style={{ width: '110px', height: '140px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', border: '1px solid #444' }} />
                ) : (
                  <div style={{ width: '110px', height: '140px', background: '#2a2a2a', margin: '0 auto 10px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: '#777', fontSize: '12px' }}>Sem Imagem</div>
                )}

                <h4 style={{ color: '#ff9900', margin: '0 0 10px 0', fontSize: '15px' }}>{card.name}</h4>
                <div style={{ fontSize: '12px', color: '#ddd', display: 'flex', justifyContent: 'space-around', margin: '5px 0' }}>
                  <span>❤️ {card.vida}</span>
                  <span>⚔️ {card.tai}</span>
                  <span>🌀 {card.nin}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}