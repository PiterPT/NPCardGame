import React, { useState, useEffect, useRef } from 'react';
import * as pvpCache from './pvpCache';
import { API_URL, authFetch } from '../lib/api';
import { OverallRankBadge, CardStatsCompact } from '../lib/statRank';
import '../styles/pvp.css';
import PlayerResultCard from '../components/PlayerResultCard';
import BattleResultModal from '../components/BattleResultModal';
import InlineNotice from '../components/InlineNotice';
import MiniCard from '../components/MiniCard';

const imgSrc = (u) => (u && u.startsWith('/') ? `${API_URL}${u}` : u);
const INFINITE_COOLDOWN_MS = 20000;

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

  const top3 = ranking.slice(0, 3);
  const MEDALS = ['🥇', '🥈', '🥉'];
  const rewardPreview = predictedReward(infiniteWave, infBestWave);

  // --- Apresentação: aba Deck de Batalha (derivação de exibição, sem alterar lógica de negócio) ---
  const teamCards = selectedDefense
    .map((id) => inventory.find((c) => String(c.id_card) === String(id)))
    .filter(Boolean);
  const cardPower = (c) => Number(c.tai || 0) + Number(c.nin || 0);
  const teamPower = teamCards.reduce((sum, c) => sum + cardPower(c), 0);
  // Poder do inimigo não está disponível nesta aba (apenas apresentação); preenchido quando houver dados do adversário.
  const enemyPower = 0;
  const powerDiff = teamPower - enemyPower;
  const diffClass =
    powerDiff > 0 ? 'power-diff--advantage' : powerDiff < 0 ? 'power-diff--disadvantage' : 'power-diff--tie';
  const diffSign = powerDiff > 0 ? '+' : powerDiff < 0 ? '-' : '';

  return (
    <div className="pvp-container">
      <h2 className="pvp-section-title">⚔️ Arena PvP & Modo Infinito</h2>

      <div className="pvp-tabs">
        <button type="button" onClick={() => setTab('ranking')} className={`pvp-tab ${tab === 'ranking' ? 'pvp-tab--active' : ''}`}>🏆 Ranking</button>
        <button type="button" onClick={() => setTab('defense')} className={`pvp-tab ${tab === 'defense' ? 'pvp-tab--active' : ''}`}>🛡️ Deck de Batalha</button>
        <button type="button" onClick={() => setTab('history')} className={`pvp-tab ${tab === 'history' ? 'pvp-tab--active' : ''}`}>
          📜 Histórico{notifications.unread > 0 ? ` (${notifications.unread})` : ''}
        </button>
        <button type="button" onClick={() => setTab('infinite')} className={`pvp-tab ${tab === 'infinite' ? 'pvp-tab--active' : ''}`}>🌀 Modo Infinito (Farm)</button>
      </div>

      {/* TAB 1: RANKING */}
      {tab === 'ranking' && (
        <div className="pvp-panel">
          <h3 className="pvp-section-title">🏆 Top 3 da Arena</h3>
          <div className="pvp-ranking-cards">
            {top3.map((p, i) => (
              <div key={p.id_user} className={`pvp-ranking-card pvp-ranking-card--${i === 0 ? 'gold' : i === 1 ? 'silver' : 'bronze'}`}>
                <span className="pvp-ranking-medal" aria-hidden="true">{MEDALS[i]}</span>
                <strong className="pvp-ranking-card__name">#{p.rank} {p.name}</strong>
                <div className="pvp-ranking-card__meta">{p.points} pts · {p.wins}V / {p.losses}D</div>
              </div>
            ))}
          </div>

          <div className="pvp-my-position">
            {myRank === null
              ? 'A carregar a tua posição...'
              : myRank === 1
                ? <>🏆 Estás no <strong className="pvp-my-position__top">topo do ranking</strong> ({myPoints} pts). Não há ninguém acima de ti para desafiar.</>
                : <>A tua posição: <strong className="pvp-my-position__rank">#{myRank}</strong> ({myPoints} pts). Só podes desafiar o jogador <strong className="pvp-my-position__rank">#{myRank - 1}</strong>.</>}
          </div>

          <h3 className="pvp-section-title">Ranking completo</h3>
          <div className="pvp-ranking-list">
            {ranking.map((op) => {
              const isMe = op.id_user === userId;
              const canChallenge = myRank !== null && op.rank === myRank - 1;
              return (
                <div key={op.id_user} className={`pvp-ranking-row ${isMe ? 'pvp-ranking-row--me' : ''} ${canChallenge ? 'pvp-ranking-row--challengeable' : ''}`}>
                  <div className="pvp-ranking-row__info">
                    <strong className={`pvp-ranking-row__name ${op.rank <= 3 ? 'pvp-ranking-row__name--top' : ''}`}>#{op.rank} {op.name}{isMe ? ' (tu)' : ''}</strong>
                    <div className="pvp-ranking-row__meta">Pontos: {op.points} · {op.wins}V / {op.losses}D</div>
                  </div>
                  {canChallenge && (
                    <button onClick={() => handleChallenge(op)} disabled={challenging} className="btn btn--primary pvp-challenge-btn" aria-label={`Desafiar ${op.name}`}>
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
        <div className="pvp-panel">
          <h3 className="pvp-section-title">Deck de Batalha (Máx 5 Cartas)</h3>
          <p className="pvp-deck-intro">Este deck é usado quando desafias o jogador acima de ti e quando outros te desafiam. Clica numa carta para a adicionar ou remover.</p>

          {inventoryStatus === 'loading' && <div className="state">A carregar as tuas cartas...</div>}
          {inventoryStatus === 'empty' && <div className="state">Não tens cartas disponíveis.</div>}
          {inventoryStatus.startsWith('error:') && (
            <div className="inline-notice inline-notice--error">
              Não foi possível carregar as tuas cartas: {inventoryStatus.slice(6)}
            </div>
          )}
          {/* Comparador de poder — "Poder total vs. Poder inimigo" (centrado) */}
          <div className="power-comparator">
            <div className="power-comparator--mine">
              <span className="power-label">Teu poder</span>
              <span className="power-total">{teamPower}</span>
            </div>
            <span className="power-vs" aria-hidden="true">VS</span>
            <div className="power-comparator--enemy">
              <span className="power-label">Poder inimigo</span>
              <span className="power-total">{enemyPower}</span>
            </div>
            <span className={`power-diff ${diffClass}`}>{diffSign}{Math.abs(powerDiff)}</span>
          </div>

          {/* Slots da equipa em linha com marcadores MAIN / SUB (dentro de .panel, cards .card na horizontal) */}
          <div className="panel team-row">
            {teamCards.map((card, i) => {
              const isMain = i === 0;
              return (
                <div
                  key={String(card.id_card)}
                  className={`team-slot ${isMain ? 'team-slot--main' : 'team-slot--sub'}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${isMain ? 'Carta principal' : 'Carta reserva'}: ${card.name}`}
                  onClick={() => {
                    deckDirty.current = true;
                    setSelectedDefense((prev) => prev.filter((id) => String(id) !== String(card.id_card)));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      deckDirty.current = true;
                      setSelectedDefense((prev) => prev.filter((id) => String(id) !== String(card.id_card)));
                    }
                  }}
                >
                  <div className="team-slot-label">{isMain ? 'MAIN' : 'SUB'}</div>
                  <div className="team-slot-card card" data-rarity={String(card.classe || 'e').toLowerCase()}>
                    <div className="card__art">
                      {card.image_url ? (
                        <img src={imgSrc(card.image_url)} alt={card.name} />
                      ) : (
                        <div className="card__art--placeholder">Sem Imagem</div>
                      )}
                    </div>
                    <div className="card__header">
                      <h4 className="card__title">{card.name}</h4>
                      <span className="badge badge--level">Nvl {card.level || 1}</span>
                    </div>
                    <div className="card__stats">
                      <CardStatsCompact card={card} fontSize="10px" gap="4px" />
                    </div>
                  </div>
                </div>
              );
            })}
            {Array.from({ length: Math.max(0, 5 - teamCards.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="team-slot team-slot--sub team-slot--empty" aria-label="Slot vazio">
                <div className="team-slot-label">SUB</div>
                <div className="team-slot-card card">
                  <span aria-hidden="true" style={{ opacity: 0.4 }}>
                    +
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="pvp-deck-grid">
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
                  className={`pvp-deck-card ${isSelected ? 'pvp-deck-card--selected' : ''}`} role="button" tabIndex={0}
                >
                  <div className="pvp-deck-card__badges">
                    <OverallRankBadge card={card} />
                  </div>
                  <img src={imgSrc(card.image_url)} alt={card.name} className="pvp-deck-card__img" />
                  <div className="pvp-deck-card__name">{card.name}</div>
                  <div className="pvp-deck-card__stats">
                    <CardStatsCompact card={card} fontSize="10px" gap="4px" />
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={handleSaveDefense} className="btn btn--success pvp-save-deck">
            Guardar Deck ({selectedDefense.length}/5)
          </button>
        </div>
      )}

      {/* TAB 3: HISTÓRICO */}
      {tab === 'history' && (
        <div className="pvp-panel">
          <h3 className="pvp-section-title">📊 Estatísticas</h3>
          <div className="pvp-stat-grid">
            {[
              ['Combates', stats ? stats.total : '-'],
              ['Vitórias', stats ? stats.wins : '-'],
              ['Derrotas', stats ? stats.losses : '-'],
              ['Taxa de vitória', stats ? `${stats.winRate}%` : '-']
            ].map(([label, value]) => (
              <div key={label} className="pvp-stat-card">
                <div className="pvp-stat-value">{value}</div>
                <div className="pvp-stat-label">{label}</div>
              </div>
            ))}
          </div>

          <div className="pvp-notifications-header">
            <h3 className="pvp-section-title">🔔 Desafios recebidos</h3>
            {notifications.unread > 0 && (
              <button onClick={handleMarkRead} className="btn btn--ghost btn--sm" aria-label="Marcar desafios como lidos">Marcar como lidas</button>
            )}
          </div>
          <div className="pvp-notification-list">
            {notifications.notifications.length === 0 && <div className="pvp-empty">Sem desafios recebidos.</div>}
            {notifications.notifications.map(n => (
              <div key={n.id_notification} className={`pvp-notification-item ${!n.is_read ? 'pvp-notification-item--unread' : ''}`}>
                <strong>{n.attacker_name}</strong> desafiou-te e {n.attacker_won ? <span className="pvp-notification-result--enemy-won">venceu</span> : <span className="pvp-notification-result--enemy-lost">perdeu</span>}.
                <span className="pvp-notification-date"> {new Date(n.created_at).toLocaleString('pt-PT')}</span>
              </div>
            ))}
          </div>

          <h3 className="pvp-section-title">📜 Histórico de batalhas</h3>
          <div className="pvp-history-list">
            {history.length === 0 && <div className="pvp-empty">Ainda não tens batalhas.</div>}
            {history.map(b => {
              const iAmAttacker = b.attacker.id === userId;
              const me = iAmAttacker ? b.attacker : b.defender;
              const foe = iAmAttacker ? b.defender : b.attacker;
              const won = b.winnerId === userId;
              return (
                <div key={b.id} onClick={() => setBattleResult(b)} className={`pvp-history-row ${won ? 'pvp-history-row--won' : 'pvp-history-row--lost'}`} role="button" tabIndex={0} aria-label={`Ver detalhes da batalha vs ${foe.name}`}>
                  <div>
                    <strong className="pvp-history-row__result">{won ? '🏆 Vitória' : '☠️ Derrota'}</strong>
                    <span className="pvp-history-row__foe"> vs {foe.name} · {iAmAttacker ? 'desafiaste' : 'foste desafiado'}</span>
                    <div className="pvp-history-row__meta">
                      {me.pointsDelta >= 0 ? `+${me.pointsDelta}` : me.pointsDelta} pts · #{me.rankBefore}{me.rankAfter !== me.rankBefore ? ` → #${me.rankAfter}` : ''} · {new Date(b.createdAt).toLocaleString('pt-PT')}
                    </div>
                  </div>
                  <span className="pvp-history-row__detail">Ver detalhes ›</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: MODO INFINITO (FM3) */}
      {tab === 'infinite' && (
        <div className="pvp-infinite">
          <div className="pvp-panel">
            <div className="pvp-infinite-header">
              <h3 className="pvp-section-title">🌀 Modo Infinito (Farm)</h3>
              <div className="pvp-infinite-stats">
                <span className="pvp-infinite-stat">
                  Melhor onda: <strong className="pvp-infinite-stat-value">#{infBestWave || 0}</strong> · Máx. sessão: <strong className="pvp-infinite-stat-value">#{infMaxWave || 0}</strong> · Resets: <strong className={`pvp-infinite-stat-value ${infResetsRemaining === 0 ? 'pvp-infinite-stat-value--danger' : 'pvp-infinite-stat-value--success'}`}>{infResetsRemaining ?? '…'}</strong>/dia
                </span>
                {infiniteActive && (
                  <button
                    onClick={() => setAutoMode(!autoMode)}
                    disabled={isFighting}
                    className={`pvp-infinite-btn pvp-infinite-btn--auto ${autoMode ? 'pvp-infinite-btn--auto--on' : ''}`}
                  >
                    {autoMode ? '⚡ Auto-Farm: LIGADO' : '⏸️ Auto-Farm: DESLIGADO'}
                  </button>
                )}
              </div>
            </div>

            <InlineNotice notice={infMessage} />

            {!infiniteActive ? (
              <div className="pvp-infinite-intro">
                <p className="pvp-infinite-intro__text">
                  Enfrenta vagas contínuas para ganhar Ryos e 💎. Em ondas recorde recebes recompensa total; em ondas repetidas, recompensa reduzida. O cooldown entre recompensas é respeitado automaticamente.
                </p>
                <button
                  onClick={() => { setInfiniteActive(true); setInfMessage(null); loadInfiniteProgress(true); loadUser(); }}
                  className="pvp-infinite-start-btn"
                >
                  Iniciar Modo Infinito 🚀
                </button>
              </div>
            ) : (
              <div>
                {/* Estado + controlos */}
                <div className="pvp-infinite-controls">
                  <div className="pvp-infinite-wave">
                    <div className="pvp-infinite-wave-label">Onda atual</div>
                    <div className="pvp-infinite-wave-value">#{infiniteWave}</div>
                    <div className="pvp-infinite-wave-reward">
                      Recompensa prevista: {rewardPreview.ryos} Ryos{rewardPreview.diamonds > 0 ? ` + 💎 ${rewardPreview.diamonds}` : ' + 💎 0'}
                    </div>
                    <div className="pvp-infinite-wave-note">
                      {rewardPreview.isRecord ? 'Recorde: recompensa total' : 'Repetição: recompensa reduzida'}
                    </div>
                  </div>
                  <div className="pvp-infinite-farm">
                    <div className="pvp-infinite-farm-label">Gestão do farm</div>
                    {!showResetConfirm ? (
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        disabled={infResetsRemaining === 0 || infResetting || isFighting}
                        className={`pvp-infinite-reset ${infResetsRemaining === 0 ? 'pvp-infinite-reset--disabled' : 'pvp-infinite-reset--enabled'}`}
                      >
                        Reiniciar (2x/dia){infResetsRemaining != null ? ` · restam ${infResetsRemaining}` : ''}
                      </button>
                    ) : (
                      <div className="pvp-infinite-reset-confirm">
                        <div className="pvp-infinite-reset-confirm__text">
                          Reiniciar volta a onda 1 e consome 1 reset hoje. O teu melhor recorde/ranking mantém-se. Confirmar?
                        </div>
                        <div className="pvp-infinite-reset-confirm__actions">
                          <button onClick={handleInfiniteReset} disabled={infResetting} className="pvp-infinite-reset-confirm__btn pvp-infinite-reset-confirm__btn--confirm">{infResetting ? 'A reiniciar...' : 'Confirmar'}</button>
                          <button onClick={() => setShowResetConfirm(false)} disabled={infResetting} className="pvp-infinite-reset-confirm__btn pvp-infinite-reset-confirm__btn--cancel">Cancelar</button>
                        </div>
                      </div>
                    )}
                    {cooldownLeft > 0 && (
                      <div className="pvp-infinite-cooldown">⏳ A aguardar cooldown: <strong>{cooldownLeft}s</strong></div>
                    )}
                  </div>
                </div>

                {/* 2 decks lado a lado */}
                <div className="pvp-infinite-decks">
                  <div className="pvp-infinite-deck my-deck">
                    <div className="pvp-infinite-deck__label pvp-infinite-deck__label--my">🛡️ O meu deck de batalha</div>
                    {myDefense.length === 0 ? (
                      <div className="pvp-infinite-no-deck">
                        Não tens deck de batalha configurado. Podes continuar no farm, mas o combate usa a tua progressão base. Configura o deck para refletir as tuas cartas.
                        <div className="pvp-infinite-no-deck__action">
                          <button type="button" onClick={() => setTab('defense')} className="btn btn--primary btn--sm">Configurar Defesa</button>
                        </div>
                      </div>
                    ) : (
                      <div className="pvp-infinite-deck-grid">
                        {myDefense.map((c, i) => <MiniCard key={`${c.id_card}-${i}`} card={c} />)}
                      </div>
                    )}
                  </div>
                  <div className="pvp-vs" aria-hidden="true">VS</div>
                  <div className="pvp-infinite-deck enemy-deck">
                    <div className="pvp-infinite-deck__label pvp-infinite-deck__label--enemy">☠️ Inimigo da onda #{infiniteWave}</div>
                    <MiniCard card={enemyWaveCard} />
                    <div className="pvp-infinite-hp-wrapper">
                      <div className="pvp-infinite-hp-bar">
                        <div className="pvp-infinite-hp-fill" style={{ width: `${Math.max(0, Math.min(100, (enemyWaveCard.vida / enemyWaveCard.maxVida) * 100))}%` }} />
                      </div>
                      <div className="pvp-infinite-hp-text">HP: {enemyWaveCard.vida} / {enemyWaveCard.maxVida}</div>
                    </div>
                  </div>
                </div>

                {/* Combat Log */}
                <div className="pvp-infinite-log">
                  {battleLogs && battleLogs.length > 0 ? (
                    battleLogs.map((log, index) => (
                      <div key={index} className={`pvp-infinite-log-entry pvp-infinite-log-entry--${log.type}`}>{log.text}</div>
                    ))
                  ) : (
                    <div className="pvp-infinite-log-empty">Pronto para iniciar o combate da Onda #{infiniteWave}...</div>
                  )}
                </div>

                {/* Ações */}
                <div className="pvp-infinite-actions">
                  <button
                    onClick={() => handleInfiniteFight(true)}
                    disabled={isFighting || autoMode || cooldownLeft > 0}
                    className={`pvp-infinite-btn pvp-infinite-btn--fight ${(isFighting || autoMode || cooldownLeft > 0) ? 'pvp-infinite-btn--disabled' : ''}`}
                  >
                    {isFighting ? 'A Combater... ⚔️' : cooldownLeft > 0 ? `Cooldown (${cooldownLeft}s)` : autoMode ? 'Auto-Farm ativo' : 'Atacar Onda ⚔️'}
                  </button>

                  <button
                    onClick={() => handleInfiniteFight(false)}
                    disabled={isFighting}
                    className={`pvp-infinite-btn pvp-infinite-btn--flee ${isFighting ? 'pvp-infinite-btn--disabled' : ''}`}
                  >
                    Fugir / Desistir
                  </button>
                </div>
              </div>
            )}

            {/* Ranking global paginado */}
            <div className="pvp-infinite-ranking">
              <div className="pvp-infinite-ranking__header">
                <h4 className="pvp-section-title">🏆 Ranking Global do Infinito</h4>
                <button type="button" onClick={() => loadInfiniteRanking(infRankPage)} disabled={infRankLoading} className="btn btn--ghost btn--sm pvp-infinite-pagination-btn">
                  {infRankLoading ? 'A carregar...' : 'Atualizar'}
                </button>
              </div>
              {infRankLoading && infRanking.length === 0 ? (
                <div className="pvp-empty">A carregar ranking...</div>
              ) : infRanking.length === 0 ? (
                <div className="pvp-empty">Sem entradas no ranking ainda.</div>
              ) : (
                <div className="pvp-infinite-ranking-list">
                  {infRanking.map((e) => {
                    const isMe = Number(e.id_user) === userId;
                    return (
                      <div key={`${e.rank}-${e.id_user}`} className={`pvp-infinite-ranking-row ${isMe ? 'pvp-infinite-ranking-row--me' : ''}`}>
                        <div className="pvp-infinite-ranking-row__name">
                          <strong className={`pvp-infinite-ranking-row__name ${isMe ? 'pvp-infinite-ranking-row__name--me' : ''}`}>#{e.rank} {e.name}{isMe ? ' (tu)' : ''}</strong>
                        </div>
                        <div className="pvp-infinite-ranking-row__wave">Melhor onda: <strong className="pvp-infinite-ranking-row__wave-value">{e.bestWave}</strong></div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="pvp-infinite-pagination">
                <div className="pvp-infinite-pagination__info">Página {infRankPage} de {Math.max(1, infRankPages)} · {infRankTotal} registos</div>
                <div className="pvp-infinite-pagination__controls">
                  <button type="button" onClick={() => loadInfiniteRanking(Math.max(1, infRankPage - 1))} disabled={infRankLoading || infRankPage <= 1} className={`pvp-infinite-pagination-btn ${infRankLoading || infRankPage <= 1 ? 'pvp-infinite-pagination-btn--disabled' : ''}`}>Anterior</button>
                  <button type="button" onClick={() => loadInfiniteRanking(Math.min(infRankPages || 1, infRankPage + 1))} disabled={infRankLoading || infRankPage >= (infRankPages || 1)} className={`pvp-infinite-pagination-btn ${infRankLoading || infRankPage >= (infRankPages || 1) ? 'pvp-infinite-pagination-btn--disabled' : ''}`}>Seguinte</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {battleResult && <BattleResultModal battle={battleResult} onClose={() => setBattleResult(null)} />}
    </div>
  );
}
