import React, { useState } from 'react';

export default function Gacha({ user, setUser }) {
  const [selectedBanner, setSelectedBanner] = useState(1);
  const [loading, setLoading] = useState(false);
  const [pulledCards, setPulledCards] = useState(null);
  const [animating, setAnimating] = useState(false);

  // Definição visual e de custos dos 3 banners no frontend
  const banners = {
    1: {
      name: "Portal Gennin (Iniciante)",
      description: "Banner ideal para novos ninjas. Maior probabilidade de cartas comuns.",
      cost1x: 200,
      cost10x: 1800,
      color: "from-cyan-600 to-blue-700",
      borderColor: "border-cyan-500/40",
      probabilities: [
        { rarity: 'Comum', pct: '60%' },
        { rarity: 'Incomum', pct: '25%' },
        { rarity: 'Rara', pct: '10%' },
        { rarity: 'Épica', pct: '4%' },
        { rarity: 'Lendária', pct: '1%' }
      ]
    },
    2: {
      name: "Portal Chunnin (Equilibrado)",
      description: "Probabilidades equilibradas com melhores chances para cartas Raras e Épicas.",
      cost1x: 350,
      cost10x: 3200,
      color: "from-emerald-600 to-teal-700",
      borderColor: "border-emerald-500/40",
      probabilities: [
        { rarity: 'Comum', pct: '40%' },
        { rarity: 'Incomum', pct: '30%' },
        { rarity: 'Rara', pct: '20%' },
        { rarity: 'Épica', pct: '8%' },
        { rarity: 'Lendária', pct: '2%' }
      ]
    },
    3: {
      name: "Portal Hokage (Lendário)",
      description: "Banner de elite focado em cartas de alta raridade (Épicas e Lendárias).",
      cost1x: 600,
      cost10x: 5500,
      color: "from-amber-600 to-orange-700",
      borderColor: "border-amber-500/40",
      probabilities: [
        { rarity: 'Comum', pct: '20%' },
        { rarity: 'Incomum', pct: '25%' },
        { rarity: 'Rara', pct: '30%' },
        { rarity: 'Épica', pct: '15%' },
        { rarity: 'Lendária', pct: '10%' }
      ]
    }
  };

  const currentBanner = banners[selectedBanner];

const handlePull = async (times) => {
  const cost = times === 1 ? currentBanner.cost1x : currentBanner.cost10x;
  
  if (user.coins < cost) {
    alert("Ryo insuficiente para realizar esta invocação!");
    return;
  }

  setLoading(true);
  setAnimating(true);
  setPulledCards(null);

  try {
    const response = await fetch('https://npcardgame.onrender.com/api/gacha/pull', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'admin-id': String(user.id_user || user.id || '') // 👈 Adicionado para evitar rejeições do middleware
      },
      body: JSON.stringify({
        id_user: user.id_user || user.id,
        bannerId: selectedBanner,
        times
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao realizar o sorteio.');
    }

    setTimeout(() => {
      setPulledCards(data.pulledCards);
      setUser(prev => ({ ...prev, coins: data.remainingCoins }));
      
      const stored = JSON.parse(localStorage.getItem('user')) || {};
      stored.coins = data.remainingCoins;
      localStorage.setItem('user', JSON.stringify(stored));
      
      setAnimating(false);
      setLoading(false);
    }, 1200);

  } catch (err) {
    alert(err.message);
    setAnimating(false);
    setLoading(false);
  }
};

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '900px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#ff9900', textAlign: 'center', marginBottom: '20px' }}>🔮 Portal de Invocação Gacha</h2>

      {/* Seletor de Banners */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
        {[1, 2, 3].map(id => (
          <button
            key={id}
            onClick={() => { setSelectedBanner(id); setPulledCards(null); }}
            style={{
              padding: '10px 20px',
              background: selectedBanner === id ? '#ff9900' : '#1e1e2e',
              color: selectedBanner === id ? '#000' : '#fff',
              border: '1px solid #ff9900',
              borderRadius: '8px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            {banners[id].name}
          </button>
        ))}
      </div>

      {/* Caixa do Banner Ativo */}
      <div style={{ background: '#1e1e2e', border: '2px solid #ff9900', borderRadius: '12px', padding: '25px', textAlign: 'center', marginBottom: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}>
        <h3 style={{ color: '#ff9900', fontSize: '22px', marginBottom: '10px' }}>{currentBanner.name}</h3>
        <p style={{ color: '#aaa', fontSize: '14px', marginBottom: '20px' }}>{currentBanner.description}</p>

        {/* Tabela de Probabilidades */}
        <div style={{ background: '#121212', padding: '12px', borderRadius: '8px', marginBottom: '20px', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '10px' }}>
          {currentBanner.probabilities.map((p, idx) => (
            <div key={idx} style={{ fontSize: '13px' }}>
              <span style={{ color: '#aaa', display: 'block' }}>{p.rarity}</span>
              <strong style={{ color: '#ff9900' }}>{p.pct}</strong>
            </div>
          ))}
        </div>

        {/* Saldo e Botões de Sorteio */}
        <div style={{ marginBottom: '15px', fontSize: '15px' }}>
          💰 O teu Saldo: <strong style={{ color: '#ff9900' }}>{user.coins} Ryo</strong>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap' }}>
          <button
            disabled={loading}
            onClick={() => handlePull(1)}
            style={{ padding: '12px 25px', background: '#00bcd4', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {animating ? '✨ A invocar...' : `Invocação x1 (${currentBanner.cost1x} Ryo)`}
          </button>
          <button
            disabled={loading}
            onClick={() => handlePull(10)}
            style={{ padding: '12px 25px', background: '#ff9900', color: '#000', fontWeight: 'bold', border: 'none', borderRadius: '8px', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {animating ? '✨ A invocar...' : `Invocação x10 (${currentBanner.cost10x} Ryo)`}
          </button>
        </div>
      </div>

      {/* Animação / Resultados da Invocação */}
      {pulledCards && (
        <div style={{ background: '#1e1e2e', border: '1px solid #00bcd4', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
          <h3 style={{ color: '#00bcd4', marginBottom: '15px' }}>📜 Resultado da Invocação Ninja:</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px' }}>
            {pulledCards.map((card, i) => (
              <div key={i} style={{ background: '#121212', border: card.classe === 'Lendária' || card.classe === 'Épica' ? '2px solid #ffd700' : '1px solid #444', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                <span style={{ fontSize: '11px', background: '#333', padding: '2px 6px', borderRadius: '4px', color: '#ff9900', fontWeight: 'bold' }}>{card.classe}</span>
                {card.image_url ? (
                  <img src={card.image_url} alt={card.name} style={{ width: '90px', height: '110px', objectFit: 'cover', borderRadius: '4px', margin: '8px auto', display: 'block' }} />
                ) : (
                  <div style={{ width: '90px', height: '110px', background: '#222', margin: '8px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#777' }}>Sem Img</div>
                )}
                <div style={{ fontWeight: 'bold', fontSize: '13px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{card.name}</div>
                <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>❤️ {card.vida} | ⚔️ {card.tai}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}