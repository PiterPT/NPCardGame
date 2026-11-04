import React, { useState, useEffect } from 'react';

export default function PvpArena({ user, setUser }) {
  const [tab, setTab] = useState('ranking'); // 'ranking', 'defense', 'infinite'
  const [ranking, setRanking] = useState([]);
  const [myDefense, setMyDefense] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [selectedDefense, setSelectedDefense] = useState([]);
  const [battleLog, setBattleLog] = useState(null);

  // Modo Infinito States
  const [infiniteWave, setInfiniteWave] = useState(1);
  const [infiniteActive, setInfiniteActive] = useState(false);
  const [enemyWaveCard, setEnemyWaveCard] = useState({ name: 'Bandido da Névoa', vida: 600, tai: 80, nin: 50 });

  const userId = user.id_user || user.id;
  const API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';

  useEffect(() => {
    fetchRanking();
    fetchInventoryAndDefense();
  }, []);

  const fetchRanking = () => {
    fetch(`${API_URL}/api/pvp/ranking`)
      .then(res => {
        if (!res.ok) throw new Error('Erro na resposta do servidor');
        return res.json();
      })
      .then(data => {
        // Garante que só define no estado se o resultado for um Array
        if (Array.isArray(data)) {
          setRanking(data);
        } else {
          setRanking([]);
        }
      })
      .catch(err => {
        console.error('Erro no fetch do ranking:', err);
        setRanking([]);
      });
  };

  const fetchInventoryAndDefense = () => {
    fetch(`${API_URL}/api/user/${userId}/profile`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.cards)) {
          setInventory(data.cards);
        }
      })
      .catch(err => console.error(err));

    fetch(`${API_URL}/api/pvp/user/${userId}`)
      .then(res => {
        if (!res.ok) throw new Error('Erro na defesa');
        return res.json();
      })
      .then(data => {
        if (data && Array.isArray(data.defenseCards)) {
          setMyDefense(data.defenseCards);
          setSelectedDefense(data.defenseCards.map(c => c.id_card));
        }
      })
      .catch(err => console.error(err));
  };
const handleSaveDefense = async () => {
    if (selectedDefense.length === 0) {
      alert('Seleciona pelo menos uma carta para a tua defesa!');
      return;
    }

    if (selectedDefense.length > 5) {
      alert('Máximo de 5 cartas na equipa de defesa!');
      return;
    }

    // Garante que só envia IDs numéricos válidos
    const cleanCardIds = selectedDefense.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    try {
      const res = await fetch(`${API_URL}/api/pvp/defense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: parseInt(userId, 10), cardIds: cleanCardIds })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar defesa no servidor.');
      }

      alert(data.message || 'Equipa de defesa guardada com sucesso!');
      fetchInventoryAndDefense();
    } catch (err) {
      console.error('Erro ao guardar defesa:', err);
      alert(`Falha ao guardar: ${err.message}`);
    }
  };

  const handleChallenge = (opponent) => {
    if (myDefense.length === 0) {
      alert('Tens de configurar a tua Equipa de Defesa / Ataque primeiro!');
      return;
    }

    const attackerCardIds = myDefense.map(c => c.id_card);

    fetch(`${API_URL}/api/pvp/battle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attackerId: userId, defenderId: opponent.id_user, attackerCardIds })
    })
      .then(res => res.json())
      .then(data => {
        setBattleLog(data.message);
        fetchRanking();
      })
      .catch(err => alert('Erro ao realizar combate PvP.'));
  };

  // Modo Infinito
  const handleInfiniteFight = (win) => {
    if (win) {
      fetch(`${API_URL}/api/infinite/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, wave: infiniteWave })
      })
        .then(res => res.json())
        .then(data => {
          alert(`Vitória na Onda ${infiniteWave}! Ganhaste ${data.rewardRyos} Ryos.`);
          setUser(prev => ({ ...prev, coins: data.newCoins }));
          setInfiniteWave(prev => prev + 1);
          setEnemyWaveCard({
            name: `Ninja Renegado Nvl ${infiniteWave + 1}`,
            vida: 600 + (infiniteWave * 150),
            tai: 80 + (infiniteWave * 30),
            nin: 50 + (infiniteWave * 20)
          });
        });
    } else {
      alert(`Derrota na Onda ${infiniteWave}! O modo infinito terminou.`);
      setInfiniteActive(false);
      setInfiniteWave(1);
    }
  };

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: '#ff9900', textAlign: 'center', marginBottom: '20px' }}>⚔️ Arena PvP & Modo Infinito</h2>


{/* Exemplo corrigido das Tabs na PvpArena.jsx */}
<div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px' }}>
  <button type="button" onClick={() => setTab('ranking')} style={{ padding: '10px 20px', background: tab === 'ranking' ? '#ff9900' : '#222', color: tab === 'ranking' ? '#000' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>🏆 Ranking & Top 5</button>
  <button type="button" onClick={() => setTab('defense')} style={{ padding: '10px 20px', background: tab === 'defense' ? '#ff9900' : '#222', color: tab === 'defense' ? '#000' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>🛡️ Equipa de Defesa (AFK)</button>
  <button type="button" onClick={() => setTab('infinite')} style={{ padding: '10px 20px', background: tab === 'infinite' ? '#ff9900' : '#222', color: tab === 'infinite' ? '#000' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>🌀 Modo Infinito (Farm)</button>
</div>

      {/* TAB 1: RANKING & TOP 5 */}
      {tab === 'ranking' && (
        <div style={{ background: '#191926', padding: '20px', borderRadius: '10px', border: '1px solid #333' }}>
          <h3 style={{ color: '#ff9900', marginBottom: '15px' }}>Top Shinobis da Arena</h3>
          {battleLog && <div style={{ background: '#22c55e', color: '#000', padding: '10px', borderRadius: '6px', marginBottom: '15px', fontWeight: 'bold' }}>{battleLog}</div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ranking.map((op, index) => (
              <div key={op.id_user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: index < 5 ? '#2a2a3a' : '#121212', padding: '12px 20px', borderRadius: '8px', border: index === 0 ? '2px solid #ffd700' : 'none' }}>
                <div>
                  <strong style={{ fontSize: '16px', color: index < 5 ? '#ff9900' : '#fff' }}>#{index + 1} {op.name}</strong>
                  <div style={{ fontSize: '12px', color: '#aaa' }}>Pontos de Arena: {op.points}</div>
                </div>
                {op.id_user !== userId && (
                  <button onClick={() => handleChallenge(op)} style={{ background: '#ff9900', color: '#000', border: 'none', padding: '8px 15px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Desafiar ⚔️
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 2: EQUIPA DE DEFESA AFK */}
      {tab === 'defense' && (
        <div style={{ background: '#191926', padding: '20px', borderRadius: '10px', border: '1px solid #333' }}>
          <h3 style={{ color: '#ff9900', marginBottom: '10px' }}>Configurar Equipa de Defesa (Máx 5 Cartas)</h3>
          <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px' }}>Esta é a equipa que defenderá a tua posição automaticamente enquanto estiveres AFK quando outros jogadores te atacarem.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            {inventory.map(card => {
              const isSelected = selectedDefense.includes(card.id_card);
              return (
                <div 
                  key={card.id_card}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedDefense(prev => prev.filter(id => id !== card.id_card));
                    } else {
                      if (selectedDefense.length >= 5) {
                        alert('Máximo de 5 cartas atingido!');
                        return;
                      }
                      setSelectedDefense(prev => [...prev, card.id_card]);
                    }
                  }}
                  style={{ background: isSelected ? '#2e1065' : '#121212', border: isSelected ? '2px solid #a855f7' : '1px solid #444', padding: '10px', borderRadius: '8px', textAlign: 'center', cursor: 'pointer' }}
                >
                  <img src={card.image_url} alt={card.name} style={{ width: '80px', height: '100px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '5px', color: '#ff9900' }}>{card.name}</div>
                  <div style={{ fontSize: '11px', color: '#aaa' }}>❤️ {card.vida} | ⚔️ {card.tai}</div>
                </div>
              );
            })}
          </div>

          <button onClick={handleSaveDefense} style={{ width: '100%', background: '#22c55e', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
            Guardar Equipa de Defesa ({selectedDefense.length}/5)
          </button>
        </div>
      )}

      {/* TAB 3: MODO INFINITO */}
      {tab === 'infinite' && (
        <div style={{ background: '#191926', padding: '20px', borderRadius: '10px', border: '1px solid #333', textAlign: 'center' }}>
          <h3 style={{ color: '#ff9900', marginBottom: '10px' }}>🌀 Modo Infinito (Farm de Ryos)</h3>
          {!infiniteActive ? (
            <div>
              <p style={{ color: '#aaa', marginBottom: '20px' }}>Enfrenta vagas contínuas de cartas inimigas para acumular recompensas em Ryos cada vez maiores.</p>
              <button onClick={() => setInfiniteActive(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '12px 25px', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}>
                Iniciar Modo Infinito 🚀
              </button>
            </div>
          ) : (
            <div>
              <div style={{ background: '#121212', padding: '15px', borderRadius: '8px', display: 'inline-block', marginBottom: '20px' }}>
                <h4 style={{ color: '#22c55e' }}>Onda Atual: #{infiniteWave}</h4>
                <p style={{ color: '#ff9900' }}>Inimigo: {enemyWaveCard.name}</p>
                <div style={{ fontSize: '13px', color: '#aaa' }}>❤️ HP: {enemyWaveCard.vida} | ⚔️ Tai: {enemyWaveCard.tai}</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
                <button onClick={() => handleInfiniteFight(true)} style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Atacar & Vencer Onda ⚔️
                </button>
                <button onClick={() => handleInfiniteFight(false)} style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                  Fugir / Desistir
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}