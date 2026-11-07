import React, { useState, useEffect, useRef } from 'react';
import * as pvpCache from './pvpCache';
import { API_URL, authFetch } from '../lib/api';
const ORANGE = '#ff9900';
const RED = '#ef4444';
const imgSrc = (u) => (u && u.startsWith('/') ? `${API_URL}${u}` : u);
const PANEL = { background: '#191926', padding: '20px', borderRadius: '10px', border: '1px solid #333' };
const INFINITE_COOLDOWN_MS = 20000;

// ---------- Cartão de resultado de batalha ----------
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

function buildEnemy(wave) {
  // Preserva o estado inicial original da onda 1; ondas seguintes escalam de forma consistente.
  if (wave === 1) {
    return {
      name: 'Bandido da Névoa',
      vida: 600,
      maxVida: 600,
      tai: 80,
      nin: 50
    };
  }
  const maxVida = 600 + (wave * 150);
  return {
    name: `Ninja Renegado Nvl ${wave}`,
    vida: maxVida,
    maxVida,
    tai: 80 + (wave * 30),
    nin: 50 + (wave * 20)
  };
}

function predictedReward(wave, bestWave) {
  const isRecord = wave > (bestWave || 0);
  const ryos = isRecord ? wave * 150 : Math.round(wave * 150 * 0.25);
  const diamonds = isRecord ? Math.max(1, Math.floor(wave / 10)) : 0;
  return { ryos, diamonds, isRecord };
}

function InlineNotice({ notice }) {
  if (!notice || !notice.text) return null;
  const isErr = notice.type === 'error';
  return (
    <div style={{
      marginBottom: '12px',
      padding: '10px 12px',
      borderRadius: '8px',
      fontSize: '13px',
      background: isErr ? '#3b0d0d' : '#12351d',
      border: `1px solid ${isErr ? RED : '#22c55e'}`,
      color: isErr ? '#fca5a5' : '#86efac',
      textAlign: 'left'
    }}>
      {notice.text}
    </div>
  );
}

function MiniCard({ card }) {
  if (!card) return null;
  return (
    <div style={{ background: '#121212', border: '1px solid #333', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
      {card.image_url && <img src={imgSrc(card.image_url)} alt={card.name} style={{ width: '72px', height: '90px', objectFit: 'cover', borderRadius: '6px', marginBottom: '6px' }} />}
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: ORANGE, marginBottom: '2px' }}>{card.name}</div>
      <div style={{ fontSize: '11px', color: '#aaa' }}>❤️ {card.vida} · ⚔️ {card.tai}{card.nin != null ? ` · 🌀 ${card.nin}` : ''}</div>
    </div>
  );
}

export default function PvpArena({ user, setUser }) {
  const userId = Number(user.id_user || user.id);

  const cached = (key) => pvpCache.peek(userId, key);
  const cachedUser = cached('user');
  const cachedInventory = cached('inventory');

  const [tab, setTab] = useState('ranking');
  const [ranking, setRanking] = useState(() => cached('ranking') || []);
  const [myDefense, setMyDefense] = useState(() => (cachedUser && cachedUser.defenseCards) || []);
  const [inventory, setInventory] = useState(() => cachedInventory || []);
  const [inventoryStatus, setInventoryStatus] = useState(() =>
    cachedInventory ? (cachedInventory.length > 0 ? 'ok' : 'empty') : 'loading'
  );
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

  const deckDirty = useRef(false);

  // Estados do Modo Infinito
  const [infiniteWave, setInfiniteWave] = useState(1);
  const [infiniteActive, setInfiniteActive] = useState(false);
  const [enemyWaveCard, setEnemyWaveCard] = useState(() => buildEnemy(1));
  const [autoMode, setAutoMode] = useState(false);
  const [isFighting, setIsFighting] = useState(false);
  const [battleLogs, setBattleLogs] = useState([]);
  const [infMaxWave, setInfMaxWave] = useState(0);
  const [infBestWave, setInfBestWave] = useState(0);
  const [infResetsRemaining, setInfResetsRemaining] = useState(null);
  const [infMessage, setInfMessage] = useState(null);
  const [cooldownEndAt, setCooldownEndAt] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [infProgressLoaded, setInfProgressLoaded] = useState(false);
  const [infRanking, setInfRanking] = useState([]);
  const [infRankPage, setInfRankPage] = useState(1);
  const [infRankPages, setInfRankPages] = useState(1);
  const [infRankTotal, setInfRankTotal] = useState(0);
  const [infRankLoading, setInfRankLoading] = useState(false);
  const [infResetting, setInfResetting] = useState(false);

  const readCoins = () => {
    try { return JSON.parse(localStorage.getItem('user')).coins; } catch { return null; }
  };

  // ---------- Carregamento ----------
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

  const loadInfiniteProgress = async (force = false) => {
    if (infProgressLoaded && !force) return;
    try {
      const res = await authFetch(`${API_URL}/api/infinite/progress`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar progresso do infinito.');
      setInfMaxWave(Number(data.maxWave || 0));
      setInfBestWave(Number(data.bestWave || 0));
      setInfResetsRemaining(data.resetsRemaining != null ? Number(data.resetsRemaining) : null);
      setInfProgressLoaded(true);
    } catch (err) {
      setInfMessage({ type: 'error', text: `Não foi possível carregar o progresso: ${err.message}` });
    }
  };

  const loadInfiniteRanking = async (page = 1) => {
    setInfRankLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/infinite/ranking?page=${page}&limit=10`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao carregar ranking do infinito.');
      setInfRanking(Array.isArray(data.entries) ? data.entries : []);
      setInfRankPage(Number(data.page || page));
      setInfRankPages(Number(data.pages || 1));
      setInfRankTotal(Number(data.total || 0));
    } catch (err) {
      setInfMessage({ type: 'error', text: `Não foi possível carregar o ranking: ${err.message}` });
    } finally {
      setInfRankLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    if (tab === 'ranking') { loadRanking(); loadUser(); }
    if (tab === 'defense') { loadUser(); loadInventory(); }
    if (tab === 'history') { loadHistory(); loadUser(); }
    if (tab === 'infinite') { loadUser(); loadInfiniteProgress(); loadInfiniteRanking(infRankPage); }
  }, [tab]);

  // Contagem decrescente do cooldown
  useEffect(() => {
    if (!cooldownEndAt) {
      setCooldownLeft(0);
      return undefined;
    }
    const tick = () => {
      const left = Math.max(0, Math.ceil((cooldownEndAt - Date.now()) / 1000));
      setCooldownLeft(left);
      if (left <= 0) setCooldownEndAt(0);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [cooldownEndAt]);

  // Loop do Modo Automático (respeita cooldown >= 20s)
  useEffect(() => {
    let timer;
    if (autoMode && infiniteActive && !isFighting && cooldownLeft <= 0) {
      timer = setTimeout(() => {
        handleInfiniteFight(true);
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [autoMode, infiniteActive, isFighting, infiniteWave, cooldownLeft]);

  const handleMarkRead = () => {
    authFetch(`${API_URL}/api/pvp/notifications/${userId}/read`, { method: 'POST' })
      .then(res => {
        if (!res.ok) throw new Error('Erro ao marcar como lidas.');
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

    const cleanCardIds = selectedDefense.map(id => parseInt(id, 10)).filter(id => !isNaN(id));

    try {
      const res = await authFetch(`${API_URL}/api/pvp/defense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardIds: cleanCardIds })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar o deck no servidor.');

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
      const res = await authFetch(`${API_URL}/api/pvp/battle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defenderId: opponent.id_user })
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

  const pushBattleLog = (entry) => {
    setBattleLogs(prev => {
      const next = [...prev, entry];
      return next.length > 60 ? next.slice(-60) : next;
    });
  };

  const applyCooldown = (retryAfterSec) => {
    const ms = (Number(retryAfterSec) > 0 ? Number(retryAfterSec) * 1000 : INFINITE_COOLDOWN_MS);
    setCooldownEndAt(Date.now() + ms);
  };

  const handleInfiniteFight = async (shouldAttack) => {
    if (!shouldAttack) {
      setInfiniteActive(false);
      setAutoMode(false);
      setIsFighting(false);
      setBattleLogs([]);
      setInfiniteWave(1);
      setEnemyWaveCard(buildEnemy(1));
      setCooldownEndAt(0);
      setCooldownLeft(0);
      setShowResetConfirm(false);
      setInfMessage(null);
      return;
    }

    if (isFighting || cooldownLeft > 0) return;

    setIsFighting(true);
    setInfMessage(null);
    setBattleLogs([]);

    try {
      pushBattleLog({ text: `⚔️ Iniciaste o combate contra ${enemyWaveCard.name}!`, type: 'info' });

      await new Promise(r => setTimeout(r, 350));
      pushBattleLog({ text: '💥 Atacaste com o teu deck e causaste grande impacto!', type: 'player' });

      await new Promise(r => setTimeout(r, 350));
      pushBattleLog({ text: `🛡️ ${enemyWaveCard.name} contra-atacou mas a tua defesa resistiu!`, type: 'enemy' });

      const res = await authFetch(`${API_URL}/api/infinite/reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wave: infiniteWave })
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        let errData = {};
        try { errData = await res.json(); } catch { /* sem corpo */ }
        applyCooldown(retryAfter || errData.retryAfter);
        const waitSec = Number(retryAfter || errData.retryAfter) || Math.ceil(INFINITE_COOLDOWN_MS / 1000);
        pushBattleLog({ text: `⏳ Cooldown ativo. Aguarda ${waitSec}s para a próxima recompensa.`, type: 'enemy' });
        setInfMessage({ type: 'error', text: `Cooldown ativo (${waitSec}s). O auto-farm/manual retomam quando terminar.` });
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao processar recompensa.');

      applyCooldown();

      const ryos = Number(data.rewardRyos || 0);
      const diamonds = Number(data.rewardDiamonds || 0);
      const rewardText = diamonds > 0
        ? `✨ Vencedor! Ganhaste ${ryos} Ryos e 💎 ${diamonds} na Onda #${infiniteWave}!`
        : `✨ Vencedor! Ganhaste ${ryos} Ryos na Onda #${infiniteWave}!`;
      pushBattleLog({ text: rewardText, type: 'info' });
      if (data.isRecord) pushBattleLog({ text: '🏅 Novo recorde nesta onda!', type: 'info' });

      if (data.newCoins !== undefined || data.newDiamonds !== undefined) {
        setUser(prev => ({
          ...prev,
          ...(data.newCoins !== undefined ? { coins: data.newCoins } : {}),
          ...(data.newDiamonds !== undefined ? { diamonds: data.newDiamonds } : {})
        }));
      }

      if (data.maxWave != null) setInfMaxWave(Number(data.maxWave));
      if (data.bestWave != null) setInfBestWave(Number(data.bestWave));

      await new Promise(r => setTimeout(r, 350));

      const nextWave = infiniteWave + 1;
      setInfiniteWave(nextWave);
      setEnemyWaveCard(buildEnemy(nextWave));
      setInfMessage(null);
    } catch (err) {
      console.error(err);
      pushBattleLog({ text: `❌ Falha no combate: ${err.message}`, type: 'enemy' });
      setInfMessage({ type: 'error', text: err.message || 'Falha no combate.' });
      setAutoMode(false);
    } finally {
      setIsFighting(false);
    }
  };

  const handleInfiniteReset = async () => {
    if (infResetsRemaining === 0 || infResetting) return;
    setInfResetting(true);
    setInfMessage(null);
    try {
      const res = await authFetch(`${API_URL}/api/infinite/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao reiniciar o modo infinito.');

      setAutoMode(false);
      setIsFighting(false);
      setInfiniteWave(1);
      setEnemyWaveCard(buildEnemy(1));
      setBattleLogs([{ text: '🔄 Farm reiniciado. O ranking (best wave) mantém-se.', type: 'info' }]);
      setCooldownEndAt(0);
      setCooldownLeft(0);
      setShowResetConfirm(false);
      if (data.maxWave != null) setInfMaxWave(Number(data.maxWave));
      if (data.bestWave != null) setInfBestWave(Number(data.bestWave));
      if (data.resetsRemaining != null) setInfResetsRemaining(Number(data.resetsRemaining));
      setInfMessage({ type: 'success', text: `Reiniciado com sucesso. Restam ${data.resetsRemaining ?? infResetsRemaining} reset(s) hoje.` });
      loadInfiniteProgress(true);
    } catch (err) {
      setInfMessage({ type: 'error', text: err.message || 'Falha ao reiniciar.' });
    } finally {
      setInfResetting(false);
      setShowResetConfirm(false);
    }
  };

  const tabStyle = (id) => ({ padding: '10px 20px', background: tab === id ? ORANGE : '#222', color: tab === id ? '#000' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' });
  const top3 = ranking.slice(0, 3);
  const MEDALS = ['🥇', '🥈', '🥉'];
  const rewardPreview = predictedReward(infiniteWave, infBestWave);

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

      {/* TAB 1: RANKING */}
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

      {/* TAB 3: HISTÓRICO */}
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

      {/* TAB 4: MODO INFINITO (FM3) */}
      {tab === 'infinite' && (
        <div style={{ ...PANEL, maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <h3 style={{ color: ORANGE, margin: 0 }}>🌀 Modo Infinito (Farm)</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#aaa', background: '#121212', border: '1px solid #333', padding: '6px 10px', borderRadius: '999px' }}>
                Melhor onda: <strong style={{ color: ORANGE }}>#{infBestWave || 0}</strong> · Máx. sessão: <strong style={{ color: '#fff' }}>#{infMaxWave || 0}</strong> · Resets: <strong style={{ color: infResetsRemaining === 0 ? RED : '#22c55e' }}>{infResetsRemaining ?? '…'}</strong>/dia
              </span>
              {infiniteActive && (
                <button
                  onClick={() => setAutoMode(!autoMode)}
                  disabled={isFighting}
                  style={{
                    background: autoMode ? '#eab308' : '#334155',
                    color: autoMode ? '#111' : '#fff',
                    border: 'none',
                    padding: '7px 12px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: isFighting ? 'not-allowed' : 'pointer',
                    boxShadow: autoMode ? '0 0 10px rgba(234, 179, 8, 0.35)' : 'none'
                  }}
                >
                  {autoMode ? '⚡ Auto-Farm: LIGADO' : '⏸️ Auto-Farm: DESLIGADO'}
                </button>
              )}
            </div>
          </div>

          <InlineNotice notice={infMessage} />

          {!infiniteActive ? (
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <p style={{ color: '#aaa', marginBottom: '18px', lineHeight: '1.5', maxWidth: '620px', margin: '0 auto 18px' }}>
                Enfrenta vagas contínuas para ganhar Ryos e 💎. Em ondas recorde recebes recompensa total; em ondas repetidas, recompensa reduzida. O cooldown entre recompensas é respeitado automaticamente.
              </p>
              <button
                onClick={() => { setInfiniteActive(true); setInfMessage(null); loadInfiniteProgress(true); loadUser(); }}
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
              {/* Estado + controlos */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: '12px' }}>
                <div style={{ flex: '1 1 220px', background: '#121212', border: '1px solid #27272a', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '16px' }}>Onda atual: #{infiniteWave}</div>
                  <div style={{ color: '#eab308', fontSize: '13px', marginTop: '4px', fontWeight: 'bold' }}>
                    Recompensa prevista: {rewardPreview.ryos} Ryos{rewardPreview.diamonds > 0 ? ` + 💎 ${rewardPreview.diamonds}` : ' + 💎 0'}
                  </div>
                  <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>
                    {rewardPreview.isRecord ? 'Recorde: recompensa total' : 'Repetição: recompensa reduzida'}
                  </div>
                </div>
                <div style={{ flex: '1 1 220px', background: '#121212', border: '1px solid #27272a', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '13px', color: '#ddd', marginBottom: '8px' }}>Gestão do farm</div>
                  {!showResetConfirm ? (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      disabled={infResetsRemaining === 0 || infResetting || isFighting}
                      style={{
                        width: '100%',
                        background: infResetsRemaining === 0 ? '#3f3f46' : '#7c2d12',
                        color: '#fff',
                        border: '1px solid #9a3412',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: (infResetsRemaining === 0 || infResetting || isFighting) ? 'not-allowed' : 'pointer',
                        opacity: (infResetsRemaining === 0 || infResetting || isFighting) ? 0.65 : 1
                      }}
                    >
                      Reiniciar (2x/dia){infResetsRemaining != null ? ` · restam ${infResetsRemaining}` : ''}
                    </button>
                  ) : (
                    <div style={{ background: '#2a1712', border: '1px solid #9a3412', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '12px', color: '#fed7aa', marginBottom: '8px' }}>Reiniciar volta a onda 1 e consome 1 reset hoje. O teu melhor recorde/ranking mantém-se. Confirmar?</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleInfiniteReset} disabled={infResetting} style={{ flex: 1, background: '#ea580c', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', fontWeight: 'bold', cursor: infResetting ? 'wait' : 'pointer' }}>{infResetting ? 'A reiniciar...' : 'Confirmar'}</button>
                        <button onClick={() => setShowResetConfirm(false)} disabled={infResetting} style={{ flex: 1, background: '#333', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                      </div>
                    </div>
                  )}
                  {cooldownLeft > 0 && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#facc15' }}>⏳ A aguardar cooldown: <strong>{cooldownLeft}s</strong></div>
                  )}
                </div>
              </div>

              {/* 2 decks lado a lado */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'stretch', marginBottom: '12px' }}>
                <div style={{ flex: '1 1 280px', background: '#121212', border: '1px solid #27272a', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ color: ORANGE, fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>🛡️ O meu deck de batalha</div>
                  {myDefense.length === 0 ? (
                    <div style={{ background: '#1b1b27', border: '1px dashed #444', borderRadius: '8px', padding: '12px', color: '#aaa', fontSize: '13px' }}>
                      Não tens deck de batalha configurado. Podes continuar no farm, mas o combate usa a tua progressão base. Configura o deck para refletir as tuas cartas.
                      <div style={{ marginTop: '10px' }}>
                        <button type="button" onClick={() => setTab('defense')} style={{ background: ORANGE, color: '#000', border: 'none', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Configurar Defesa</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px' }}>
                      {myDefense.map((c, i) => <MiniCard key={`${c.id_card}-${i}`} card={c} />)}
                    </div>
                  )}
                </div>
                <div style={{ alignSelf: 'center', color: RED, fontWeight: 'bold', fontSize: '20px', flex: '0 0 auto', padding: '0 4px' }}>VS</div>
                <div style={{ flex: '1 1 280px', background: '#121212', border: '1px solid #7f1d1d', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ color: '#fca5a5', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>☠️ Inimigo da onda #{infiniteWave}</div>
                  <MiniCard card={enemyWaveCard} />
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ width: '100%', background: '#27272a', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, (enemyWaveCard.vida / enemyWaveCard.maxVida) * 100))}%`, background: '#ef4444', height: '100%', transition: 'width 0.3s ease' }} />
                    </div>
                    <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px' }}>HP: {enemyWaveCard.vida} / {enemyWaveCard.maxVida}</div>
                  </div>
                </div>
              </div>

              {/* Combat Log */}
              <div style={{
                background: '#09090b',
                border: '1px solid #27272a',
                borderRadius: '8px',
                padding: '12px',
                height: '150px',
                overflowY: 'auto',
                textAlign: 'left',
                marginBottom: '12px',
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
                  <div style={{ color: '#52525b', textAlign: 'center', paddingTop: '45px' }}>
                    Pronto para iniciar o combate da Onda #{infiniteWave}...
                  </div>
                )}
              </div>

              {/* Ações */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleInfiniteFight(true)}
                  disabled={isFighting || autoMode || cooldownLeft > 0}
                  style={{
                    background: (isFighting || autoMode || cooldownLeft > 0) ? '#4b5563' : '#22c55e',
                    color: '#fff',
                    border: 'none',
                    padding: '11px 20px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: (isFighting || autoMode || cooldownLeft > 0) ? 'not-allowed' : 'pointer',
                    opacity: (isFighting || autoMode || cooldownLeft > 0) ? 0.7 : 1,
                    minWidth: '180px'
                  }}
                >
                  {isFighting ? 'A Combater... ⚔️' : cooldownLeft > 0 ? `Cooldown (${cooldownLeft}s)` : autoMode ? 'Auto-Farm ativo' : 'Atacar Onda ⚔️'}
                </button>

                <button
                  onClick={() => handleInfiniteFight(false)}
                  disabled={isFighting}
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '11px 20px',
                    borderRadius: '8px',
                    fontWeight: 'bold',
                    cursor: isFighting ? 'not-allowed' : 'pointer',
                    opacity: isFighting ? 0.7 : 1
                  }}
                >
                  Fugir / Desistir
                </button>
              </div>
            </div>
          )}

          {/* Ranking global paginado */}
          <div style={{ marginTop: '18px', borderTop: '1px solid #333', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <h4 style={{ color: ORANGE, margin: 0 }}>🏆 Ranking Global do Infinito</h4>
              <button type="button" onClick={() => loadInfiniteRanking(infRankPage)} disabled={infRankLoading} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '6px 12px', borderRadius: '6px', cursor: infRankLoading ? 'wait' : 'pointer', fontSize: '12px' }}>
                {infRankLoading ? 'A carregar...' : 'Atualizar'}
              </button>
            </div>
            {infRankLoading && infRanking.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '13px' }}>A carregar ranking...</div>
            ) : infRanking.length === 0 ? (
              <div style={{ color: '#aaa', fontSize: '13px' }}>Sem entradas no ranking ainda.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {infRanking.map((e) => {
                  const isMe = Number(e.id_user) === userId;
                  return (
                    <div key={`${e.rank}-${e.id_user}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isMe ? '#3a1d12' : '#121212', border: isMe ? `1px solid ${ORANGE}` : '1px solid #242433', borderRadius: '8px', padding: '9px 12px' }}>
                      <div style={{ fontSize: '14px' }}>
                        <strong style={{ color: isMe ? ORANGE : '#fff' }}>#{e.rank} {e.name}{isMe ? ' (tu)' : ''}</strong>
                      </div>
                      <div style={{ fontSize: '13px', color: '#ddd' }}>Melhor onda: <strong style={{ color: ORANGE }}>{e.bestWave}</strong></div>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '12px', color: '#888' }}>Página {infRankPage} de {Math.max(1, infRankPages)} · {infRankTotal} registos</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => loadInfiniteRanking(Math.max(1, infRankPage - 1))} disabled={infRankLoading || infRankPage <= 1} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '6px 12px', borderRadius: '6px', cursor: (infRankLoading || infRankPage <= 1) ? 'not-allowed' : 'pointer', opacity: infRankPage <= 1 ? 0.6 : 1 }}>Anterior</button>
                <button type="button" onClick={() => loadInfiniteRanking(Math.min(infRankPages || 1, infRankPage + 1))} disabled={infRankLoading || infRankPage >= (infRankPages || 1)} style={{ background: '#222', color: '#fff', border: '1px solid #444', padding: '6px 12px', borderRadius: '6px', cursor: (infRankLoading || infRankPage >= (infRankPages || 1)) ? 'not-allowed' : 'pointer', opacity: infRankPage >= (infRankPages || 1) ? 0.6 : 1 }}>Seguinte</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {battleResult && <BattleResultModal battle={battleResult} onClose={() => setBattleResult(null)} />}
    </div>
  );
}
