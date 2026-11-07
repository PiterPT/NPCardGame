import React, { useState, useEffect, useRef } from 'react';
import * as pvpCache from './pvpCache';

const ORANGE = '#ff9900';
const RED = '#ef4444';
const API_BASE = import.meta.env.API_URL || 'https://npcardgame.onrender.com';
// As imagens vem de uma rota propria (com cache do navegador); o JSON so traz o caminho.
const imgSrc = (u) => (u && u.startsWith('/') ? `${API_BASE}${u}` : u);
const PANEL = { background: '#191926', padding: '20px', borderRadius: '10px', border: '1px solid #333' };

// ---------- Cartao de resultado de batalha ----------
function PlayerResultCard({ side, isWinner }) {
  const border = isWinner ? ORANGE : '#7f1d1d';
  const delta = side.pointsDelta;
  return (
    <div style={{ flex: 1, minWidth: '260px', background: '#121212', border: `2px solid ${border}`, borderRadius: '10px', padding: '15px', opacity: isWinner ? 1 : 0.85, boxShadow: isWinner ? '0 0 18px rgba(255,153,0,0.35)' : 'none' }}>
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '28px' }}>{isWinner ? '🏆' : '☠️'}</div>
        <strong style={{ fontSize: '18px', color: isWinner ? ORANGE : '#fca5a5' }}>{side.name}</strong>
        <div style={{ fontSize: '12px', fontWeight: 'bold', color: isWinner ? ORANGE : RED }}>{isWinner ? 'VENCEDOR' : 'DERROTADO'}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '13px', marginBottom: '12px', color: '#ddd' }}>
        <div>Posição<br /><strong>#{side.rankBefore}{side.rankAfter !== side.rankBefore ? ` → #${side.rankAfter}` : ''}</strong></div>
        <div>Pontos<br /><strong style={{ color: delta >= 0 ? '#22c55e' : RED }}>{delta >= 0 ? `+${delta}` : delta}</strong></div>
        <div>Poder<br /><strong>{side.power}</strong></div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(side.cards || []).map((c, i) => (
          <div key={`${c.id_card}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#1d1d2b', borderRadius: '6px', padding: '6px' }}>
            {c.image_url && <img src={imgSrc(c.image_url)} alt={c.name} style={{ width: '36px', height: '46px', objectFit: 'cover', borderRadius: '4px' }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: ORANGE }}>{c.name}</div>
              <div style={{ fontSize: '11px', color: '#aaa' }}>❤️ {c.vida} · ⚔️ {c.tai} · 🌀 {c.nin}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BattleResultModal({ battle, onClose }) {
  const attackerWon = battle.winnerId === battle.attacker.id;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0d0d14', border: `1px solid ${RED}`, borderRadius: '12px', padding: '20px', maxWidth: '760px', width: '100%' }}>
        <h3 style={{ textAlign: 'center', color: ORANGE, marginBottom: '15px' }}>⚔️ Resultado da Batalha</h3>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'stretch' }}>
          <PlayerResultCard side={battle.attacker} isWinner={attackerWon} />
          <div style={{ alignSelf: 'center', color: RED, fontWeight: 'bold', fontSize: '22px' }}>VS</div>
          <PlayerResultCard side={battle.defender} isWinner={!attackerWon} />
        </div>
        <div style={{ textAlign: 'center', marginTop: '18px' }}>
          <button onClick={onClose} style={{ background: ORANGE, color: '#000', border: 'none', padding: '10px 30px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function PvpArena({ user, setUser }) {
  const userId = Number(user.id_user || user.id);
  const API_URL = import.meta.env.API_URL || 'https://npcardgame.onrender.com';

  // O que ja esta em cache (mesmo desatualizado) aparece logo; o servidor so e consultado se for preciso.
  const cached = (key) => pvpCache.peek(userId, key);
  const cachedUser = cached('user');
  const cachedInventory = cached('inventory');

  const [tab, setTab] = useState('ranking'); // 'ranking', 'defense', 'history', 'infinite'
  const [ranking, setRanking] = useState(() => cached('ranking') || []);
  const [myDefense, setMyDefense] = useState(() => (cachedUser && cachedUser.defenseCards) || []);
  const [inventory, setInventory] = useState(() => cachedInventory || []);
  const [inventoryStatus, setInventoryStatus] = useState(() =>
    cachedInventory ? (cachedInventory.length > 0 ? 'ok' : 'empty') : 'loading'
  ); // 'loading' | 'ok' | 'empty' | 'error:<motivo>'
  const [selectedDefense, setSelectedDefense] = useState(() =>
    ((cachedUser && cachedUser.defenseCards) || []).map(c => c.id_card)
  );

  // Estado PvP do jogador
  const [myRank, setMyRank] = useState(() => (cachedUser ? cachedUser.rank : null));
  const [myPoints, setMyPoints] = useState(() => (cachedUser ? cachedUser.points : null));
  const [stats, setStats] = useState(() => (cachedUser && cachedUser.stats) || null);
  const [history, setHistory] = useState(() => cached('history') || []);
  const [notifications, setNotifications] = useState(() => cached('notifications') || { unread: 0, notifications: [] });
  const [battleResult, setBattleResult] = useState(null);
  const [challenging, setChallenging] = useState(false);

  // Impede que uma atualizacao em segundo plano apague a selecao de cartas que o jogador esta a editar.
  const deckDirty = useRef(false);

  // Modo Infinito States
  const [infiniteWave, setInfiniteWave] = useState(1);
  const [infiniteActive, setInfiniteActive] = useState(false);
  const [enemyWaveCard, setEnemyWaveCard] = useState({ name: 'Bandido da Névoa', vida: 600, tai: 80, nin: 50 });

  // Gacha e Inventario gravam o saldo em localStorage; se mudou, o inventario em cache ja nao e fiavel.
  const readCoins = () => {
    try { return JSON.parse(localStorage.getItem('user')).coins; } catch { return null; }
  };

  // ---------- Carregamento (sempre via cache) ----------
  const loadRanking = (force = false) =>
    pvpCache.load(userId, 'ranking', `${API_URL}/api/pvp/ranking`, {
      force,
      parse: (d) => { if (!Array.isArray(d)) throw new Error('resposta inválida'); return d; },
      onData: setRanking,
      onError: (err) => console.error('Erro no fetch do ranking:', err)
    });

  const loadUser = (force = false) =>
    pvpCache.load(userId, 'user', `${API_URL}/api/pvp/user/${userId}`, {
      force,
      onData: (d) => {
        setMyRank(d.rank);
        setMyPoints(d.points);
        setStats(d.stats || null);
        if (Array.isArray(d.defenseCards)) {
          setMyDefense(d.defenseCards);
          if (!deckDirty.current) setSelectedDefense(d.defenseCards.map(c => c.id_card));
        }
      },
      onError: (err) => console.error('Erro ao carregar dados PvP:', err)
    });

  const loadInventory = (force = false) =>
    pvpCache.load(userId, 'inventory', `${API_URL}/api/pvp/cards/${userId}`, {
      force,
      fingerprint: readCoins(),
      parse: (body) => {
        if (!Array.isArray(body)) throw new Error('a resposta não tem a lista de cartas');
        return body;
      },
      onData: (cards) => {
        setInventory(cards);
        setInventoryStatus(cards.length > 0 ? 'ok' : 'empty');
      },
      onError: (err, hadCache) => {
        console.error(err);
        if (!hadCache) setInventoryStatus(`error:${err.message}`);
      }
    });

  const loadHistory = (force = false) =>
    pvpCache.load(userId, 'history', `${API_URL}/api/pvp/history/${userId}`, {
      force,
      parse: (d) => (Array.isArray(d) ? d : []),
      onData: setHistory,
      onError: (err) => console.error(err)
    });

  const loadNotifications = (force = false) =>
    pvpCache.load(userId, 'notifications', `${API_URL}/api/pvp/notifications/${userId}`, {
      force,
      parse: (d) => ({ unread: (d && d.unread) || 0, notifications: (d && Array.isArray(d.notifications)) ? d.notifications : [] }),
      onData: setNotifications,
      onError: (err) => console.error(err)
    });

  // So se carrega o que o separador visivel precisa (e so se estiver desatualizado).
  useEffect(() => {
    loadNotifications(); // contador do separador "Histórico"
    if (tab === 'ranking') { loadRanking(); loadUser(); }
    if (tab === 'defense') { loadUser(); loadInventory(); }
    if (tab === 'history') { loadHistory(); loadUser(); }
  }, [tab]);

  const handleMarkRead = () => {
    fetch(`${API_URL}/api/pvp/notifications/${userId}/read`, { method: 'POST' })
      .then(res => {
        if (!res.ok) throw new Error('Erro ao marcar como lidas.');
        // Atualiza localmente, sem novo pedido.
        const next = { unread: 0, notifications: notifications.notifications.map(n => ({ ...n, is_read: true })) };
        setNotifications(next);
        pvpCache.set(userId, 'notifications', next);
      })
      .catch(err => console.error(err));
  };

  const handleSaveDefense = async () => {
    if (selectedDefense.length === 0) {
      alert('Seleciona pelo menos uma carta para o teu deck!');
      return;
    }

    if (selectedDefense.length > 5) {
      alert('Máximo de 5 cartas no deck!');
      return;
    }

    // Garante que só envia IDs numéricos válidos
    const cleanCardIds = selectedDefense.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    try {
      const res = await fetch(`${API_URL}/api/pvp/defense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cardIds: cleanCardIds })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar o deck no servidor.');
      }

      alert(data.message || 'Deck guardado com sucesso!');
      deckDirty.current = false;
      pvpCache.invalidate(userId, 'user');
      loadUser(true);
    } catch (err) {
      console.error('Erro ao guardar deck:', err);
      alert(`Falha ao guardar: ${err.message}`);
    }
  };

  const handleChallenge = async (opponent) => {
    if (challenging) return;
    if (myDefense.length === 0) {
      alert('Tens de guardar o teu deck de batalha primeiro!');
      return;
    }

    setChallenging(true);
    try {
      const res = await fetch(`${API_URL}/api/pvp/battle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackerId: userId, defenderId: opponent.id_user })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao realizar combate PvP.');
      setBattleResult(data.battle);
    } catch (err) {
      alert(err.message);
    } finally {
      setChallenging(false);
      pvpCache.invalidate(userId, ['ranking', 'user', 'history']);
      loadRanking(true);
      loadUser(true);
    }
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

  const tabStyle = (id) => ({ padding: '10px 20px', background: tab === id ? ORANGE : '#222', color: tab === id ? '#000' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' });
  const top3 = ranking.slice(0, 3);
  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ padding: '20px', color: '#fff', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: ORANGE, textAlign: 'center', marginBottom: '20px' }}>⚔️ Arena PvP & Modo Infinito</h2>

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTab('ranking')} style={tabStyle('ranking')}>🏆 Ranking</button>
        <button type="button" onClick={() => setTab('defense')} style={tabStyle('defense')}>🛡️ Deck de Batalha</button>
        <button type="button" onClick={() => setTab('history')} style={tabStyle('history')}>
          📜 Histórico{notifications.unread > 0 ? ` (${notifications.unread})` : ''}
        </button>
        <button type="button" onClick={() => setTab('infinite')} style={tabStyle('infinite')}>🌀 Modo Infinito (Farm)</button>
      </div>

      {/* TAB 1: PAGINA PRINCIPAL DA ARENA - TOP 3 + RANKING COMPLETO */}
      {tab === 'ranking' && (
        <div style={PANEL}>
          <h3 style={{ color: ORANGE, marginBottom: '15px', textAlign: 'center' }}>🏆 Top 3 da Arena</h3>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '25px' }}>
            {top3.map((p, i) => (
              <div key={p.id_user} style={{ flex: '1 1 200px', maxWidth: '300px', background: '#121212', border: `2px solid ${i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : '#cd7f32'}`, borderRadius: '10px', padding: '15px', textAlign: 'center', boxShadow: i === 0 ? '0 0 18px rgba(255,153,0,0.35)' : 'none' }}>
                <div style={{ fontSize: '34px' }}>{MEDALS[i]}</div>
                <strong style={{ fontSize: '17px', color: ORANGE }}>#{p.rank} {p.name}</strong>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>{p.points} pts · {p.wins}V / {p.losses}D</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#121212', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '10px 15px', marginBottom: '15px', fontSize: '14px' }}>
            {myRank === null
              ? 'A carregar a tua posição...'
              : myRank === 1
                ? <>🏆 Estás no <strong style={{ color: ORANGE }}>topo do ranking</strong> ({myPoints} pts). Não há ninguém acima de ti para desafiar.</>
                : <>A tua posição: <strong style={{ color: ORANGE }}>#{myRank}</strong> ({myPoints} pts). Só podes desafiar o jogador <strong style={{ color: ORANGE }}>#{myRank - 1}</strong>.</>}
          </div>

          <h3 style={{ color: ORANGE, marginBottom: '10px' }}>Ranking completo</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ranking.map((op) => {
              const isMe = op.id_user === userId;
              const canChallenge = myRank !== null && op.rank === myRank - 1;
              return (
                <div key={op.id_user} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isMe ? '#3a1d12' : op.rank <= 3 ? '#2a2a3a' : '#121212', padding: '10px 18px', borderRadius: '8px', border: isMe ? `1px solid ${ORANGE}` : canChallenge ? `1px solid ${RED}` : '1px solid transparent' }}>
                  <div>
                    <strong style={{ fontSize: '15px', color: op.rank <= 3 ? ORANGE : '#fff' }}>#{op.rank} {op.name}{isMe ? ' (tu)' : ''}</strong>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Pontos: {op.points} · {op.wins}V / {op.losses}D</div>
                  </div>
                  {canChallenge && (
                    <button onClick={() => handleChallenge(op)} disabled={challenging} style={{ background: ORANGE, color: '#000', border: 'none', padding: '8px 15px', borderRadius: '5px', fontWeight: 'bold', cursor: challenging ? 'wait' : 'pointer', opacity: challenging ? 0.6 : 1 }}>
                      Desafiar ⚔️
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: DECK DE BATALHA */}
      {tab === 'defense' && (
        <div style={PANEL}>
          <h3 style={{ color: ORANGE, marginBottom: '10px' }}>Deck de Batalha (Máx 5 Cartas)</h3>
          <p style={{ color: '#aaa', fontSize: '13px', marginBottom: '20px' }}>Este deck é usado quando desafias o jogador acima de ti e quando outros te desafiam. Clica numa carta para a adicionar ou remover.</p>

          {inventoryStatus === 'loading' && <div style={{ color: '#aaa', marginBottom: '20px' }}>A carregar as tuas cartas...</div>}
          {inventoryStatus === 'empty' && <div style={{ color: '#aaa', marginBottom: '20px' }}>Não tens cartas disponíveis.</div>}
          {inventoryStatus.startsWith('error:') && (
            <div style={{ background: '#3b0d0d', border: `1px solid ${RED}`, borderRadius: '6px', padding: '10px', marginBottom: '20px', fontSize: '13px' }}>
              Não foi possível carregar as tuas cartas: {inventoryStatus.slice(6)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            {inventory.map(card => {
              const isSelected = selectedDefense.includes(card.id_card);
              return (
                <div 
                  key={card.id_card}
                  onClick={() => {
                    deckDirty.current = true;
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
                  <img src={imgSrc(card.image_url)} alt={card.name} style={{ width: '80px', height: '100px', objectFit: 'cover', borderRadius: '4px' }} />
                  <div style={{ fontSize: '13px', fontWeight: 'bold', marginTop: '5px', color: ORANGE }}>{card.name}</div>
                  <div style={{ fontSize: '11px', color: '#aaa' }}>❤️ {card.vida} | ⚔️ {card.tai}</div>
                </div>
              );
            })}
          </div>

          <button onClick={handleSaveDefense} style={{ width: '100%', background: '#22c55e', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}>
            Guardar Deck ({selectedDefense.length}/5)
          </button>
        </div>
      )}

      {/* TAB 3: HISTORICO, ESTATISTICAS E NOTIFICACOES */}
      {tab === 'history' && (
        <div style={PANEL}>
          <h3 style={{ color: ORANGE, marginBottom: '12px' }}>📊 Estatísticas</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '25px' }}>
            {[
              ['Combates', stats ? stats.total : '-'],
              ['Vitórias', stats ? stats.wins : '-'],
              ['Derrotas', stats ? stats.losses : '-'],
              ['Taxa de vitória', stats ? `${stats.winRate}%` : '-']
            ].map(([label, value]) => (
              <div key={label} style={{ flex: '1 1 130px', background: '#121212', border: '1px solid #7f1d1d', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: 'bold', color: ORANGE }}>{value}</div>
                <div style={{ fontSize: '12px', color: '#aaa' }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ color: ORANGE }}>🔔 Desafios recebidos</h3>
            {notifications.unread > 0 && (
              <button onClick={handleMarkRead} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '6px 12px', borderRadius: '5px', cursor: 'pointer' }}>Marcar como lidas</button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '25px' }}>
            {notifications.notifications.length === 0 && <div style={{ color: '#aaa', fontSize: '13px' }}>Sem desafios recebidos.</div>}
            {notifications.notifications.map(n => (
              <div key={n.id_notification} style={{ background: n.is_read ? '#121212' : '#3a1d12', border: n.is_read ? '1px solid transparent' : `1px solid ${ORANGE}`, borderRadius: '6px', padding: '8px 12px', fontSize: '13px' }}>
                <strong>{n.attacker_name}</strong> desafiou-te e {n.attacker_won ? <span style={{ color: RED }}>venceu</span> : <span style={{ color: '#22c55e' }}>perdeu</span>}.
                <span style={{ color: '#888' }}> {new Date(n.created_at).toLocaleString('pt-PT')}</span>
              </div>
            ))}
          </div>

          <h3 style={{ color: ORANGE, marginBottom: '10px' }}>📜 Histórico de batalhas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {history.length === 0 && <div style={{ color: '#aaa', fontSize: '13px' }}>Ainda não tens batalhas.</div>}
            {history.map(b => {
              const iAmAttacker = b.attacker.id === userId;
              const me = iAmAttacker ? b.attacker : b.defender;
              const foe = iAmAttacker ? b.defender : b.attacker;
              const won = b.winnerId === userId;
              return (
                <div key={b.id} onClick={() => setBattleResult(b)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#121212', borderLeft: `4px solid ${won ? '#22c55e' : RED}`, borderRadius: '6px', padding: '10px 15px', cursor: 'pointer' }}>
                  <div>
                    <strong style={{ color: won ? '#22c55e' : RED }}>{won ? '🏆 Vitória' : '☠️ Derrota'}</strong>
                    <span style={{ color: '#ddd' }}> vs {foe.name} · {iAmAttacker ? 'desafiaste' : 'foste desafiado'}</span>
                    <div style={{ fontSize: '12px', color: '#aaa' }}>
                      {me.pointsDelta >= 0 ? `+${me.pointsDelta}` : me.pointsDelta} pts · #{me.rankBefore}{me.rankAfter !== me.rankBefore ? ` → #${me.rankAfter}` : ''} · {new Date(b.createdAt).toLocaleString('pt-PT')}
                    </div>
                  </div>
                  <span style={{ color: ORANGE, fontSize: '12px' }}>Ver detalhes ›</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: MODO INFINITO (APRIMORADO) */}
{tab === 'infinite' && (
  <div style={{ ...PANEL, textAlign: 'center', maxWidth: '650px', margin: '0 auto' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
      <h3 style={{ color: ORANGE, margin: 0 }}>🌀 Modo Infinito (Farm de Ryos)</h3>
      
      {/* Botão de Toggle do Modo Automático */}
      {infiniteActive && (
        <button
          onClick={() => setAutoMode(!autoMode)}
          style={{
            background: autoMode ? '#eab308' : '#334155',
            color: '#fff',
            border: 'none',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: autoMode ? '0 0 10px rgba(234, 179, 8, 0.4)' : 'none'
          }}
        >
          {autoMode ? '⚡ Auto-Farm: LIGADO' : '⏸️ Auto-Farm: DESLIGADO'}
        </button>
      )}
    </div>

    {!infiniteActive ? (
      <div style={{ padding: '20px 0' }}>
        <p style={{ color: '#aaa', marginBottom: '20px', lineHeight: '1.5' }}>
          Enfrenta vagas contínuas de cartas inimigas para acumular recompensas em Ryos cada vez maiores.
        </p>
        <button 
          onClick={() => setInfiniteActive(true)} 
          style={{ 
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', 
            color: '#fff', 
            border: 'none', 
            padding: '14px 28px', 
            borderRadius: '8px', 
            fontWeight: 'bold', 
            fontSize: '16px', 
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
          }}
        >
          Iniciar Modo Infinito 🚀
        </button>
      </div>
    ) : (
      <div>
        {/* Card do Inimigo & Informação da Onda */}
        <div style={{ 
          background: '#121212', 
          border: '1px solid #27272a',
          padding: '18px', 
          borderRadius: '12px', 
          marginBottom: '15px' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '16px' }}>
              Onda Atual: #{infiniteWave}
            </span>
            <span style={{ color: '#eab308', fontSize: '13px', fontWeight: 'bold' }}>
              💰 Recompensa: {infiniteWave * 150} Ryos
            </span>
          </div>

          <h4 style={{ color: ORANGE, fontSize: '18px', margin: '5px 0' }}>{enemyWaveCard.name}</h4>
          
          {/* Barra de Vida Visual */}
          <div style={{ width: '100%', background: '#27272a', borderRadius: '6px', height: '10px', margin: '10px 0', overflow: 'hidden' }}>
            <div style={{ 
              width: `${Math.max(0, Math.min(100, (enemyWaveCard.vida / enemyWaveCard.maxVida) * 100))}%`, 
              background: '#ef4444', 
              height: '100%', 
              transition: 'width 0.3s ease' 
            }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '13px', color: '#aaa', marginTop: '8px' }}>
            <span>❤️ HP: <strong style={{ color: '#fff' }}>{enemyWaveCard.vida}</strong></span>
            <span>⚔️ Taijutsu: <strong style={{ color: '#fff' }}>{enemyWaveCard.tai}</strong></span>
          </div>
        </div>

        {/* Histórico / Combat Log */}
        <div style={{
          background: '#09090b',
          border: '1px solid #27272a',
          borderRadius: '8px',
          padding: '12px',
          height: '140px',
          overflowY: 'auto',
          textAlign: 'left',
          marginBottom: '15px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}>
          {battleLogs && battleLogs.length > 0 ? (
            battleLogs.map((log, index) => (
              <div key={index} style={{ color: log.type === 'player' ? '#60a5fa' : log.type === 'enemy' ? '#f87171' : '#facc15', marginBottom: '4px' }}>
                {log.text}
              </div>
            ))
          ) : (
            <div style={{ color: '#52525b', textAlign: 'center', paddingTop: '40px' }}>
              Pronto para iniciar o combate da Onda #{infiniteWave}...
            </div>
          )}
        </div>

        {/* Ações */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <button 
            onClick={() => handleInfiniteFight(true)} 
            disabled={isFighting || autoMode}
            style={{ 
              background: isFighting || autoMode ? '#4b5563' : '#22c55e', 
              color: '#fff', 
              border: 'none', 
              padding: '10px 20px', 
              borderRadius: '6px', 
              fontWeight: 'bold', 
              cursor: isFighting || autoMode ? 'not-allowed' : 'pointer',
              opacity: isFighting || autoMode ? 0.6 : 1
            }}
          >
            {isFighting ? 'A Combater... ⚔️' : 'Atacar Onda ⚔️'}
          </button>

          <button 
            onClick={() => handleInfiniteFight(false)} 
            disabled={isFighting}
            style={{ 
              background: '#ef4444', 
              color: '#fff', 
              border: 'none', 
              padding: '10px 20px', 
              borderRadius: '6px', 
              fontWeight: 'bold', 
              cursor: isFighting ? 'not-allowed' : 'pointer' 
            }}
          >
            Fugir / Desistir
          </button>
        </div>
      </div>
    )}
  </div>
)}

      {battleResult && <BattleResultModal battle={battleResult} onClose={() => setBattleResult(null)} />}
    </div>
  );
}
const [autoMode, setAutoMode] = useState(false);
const [isFighting, setIsFighting] = useState(false);
const [battleLogs, setBattleLogs] = useState([]);

// Loop do Modo Automático
useEffect(() => {
  let timer;
  if (autoMode && infiniteActive && !isFighting) {
    timer = setTimeout(() => {
      handleInfiniteFight(true);
    }, 1500); // Aguarda 1.5s entre cada vaga no modo auto
  }
  return () => clearTimeout(timer);
}, [autoMode, infiniteActive, isFighting, infiniteWave]);

// Função de Luta com Combate por Turnos / Log Gradual
const handleInfiniteFight = async (shouldAttack) => {
  if (!shouldAttack) {
    // Lógica para desistir/fugir
    setInfiniteActive(false);
    setAutoMode(false);
    setBattleLogs([]);
    return;
  }

  setIsFighting(true);
  setBattleLogs([]);

  // Simulação de Turnos (exemplo de 2 ataques)
  setBattleLogs(prev => [...prev, { text: `⚔️ Iniciaste o combate contra ${enemyWaveCard.name}!`, type: 'info' }]);
  
  await new Promise(r => setTimeout(r, 600));
  setBattleLogs(prev => [...prev, { text: `💥 Usaste [Rasengan] e causaste ${myCard.tai * 1.5} de dano!`, type: 'player' }]);

  await new Promise(r => setTimeout(r, 600));
  setBattleLogs(prev => [...prev, { text: `🛡️ ${enemyWaveCard.name} contra-atacou causando ${enemyWaveCard.tai} de dano!`, type: 'enemy' }]);

  await new Promise(r => setTimeout(r, 600));
  setBattleLogs(prev => [...prev, { text: `✨ Derrotaste ${enemyWaveCard.name}! Ganhaste ${infiniteWave * 150} Ryos!`, type: 'info' }]);

  // Avança para a próxima onda
  setInfiniteWave(prev => prev + 1);
  setIsFighting(false);
};