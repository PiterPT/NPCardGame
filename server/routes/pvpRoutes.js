const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requireSelf } = require('../middleware/auth');

// ==========================================
// CONFIGURACAO PvP (valores A CONFIRMAR)
// ==========================================
const POINTS_WIN = parseInt(process.env.PVP_POINTS_WIN || '20', 10);   // pontos ganhos pelo vencedor
const POINTS_LOSS = parseInt(process.env.PVP_POINTS_LOSS || '10', 10); // pontos perdidos pelo derrotado (minimo 0)
const MAX_DECK = 5;                    // limite ja existente no codigo
const INITIAL_POINTS = 1000;           // valor inicial ja existente no codigo
const RANK_LOCK_KEY = 782001;          // advisory lock: serializa qualquer alteracao de posicoes
const CARD_OWNER_COLUMN = 'id_user';   // A CONFIRMAR: coluna de cards que indica o dono da carta

// ==========================================
// HELPERS
// ==========================================
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const cardView = (c) => ({
  id_card: c.id_card,
  name: c.name,
  vida: num(c.vidastatus ?? c.vida),
  tai: num(c.taistatus ?? c.tai),
  nin: num(c.chakrastatus ?? c.nin),
  // Caminho curto para a rota de imagens (as imagens estao na BD como base64 de varios MB: nunca vao no JSON).
  image_url: c.id_cardmodel ? `/api/pvp/card-image/${c.id_cardmodel}` : null,
  classe: c.classe ?? null
});
// Mesmo calculo de poder que ja existia: vida + taijutsu + ninjutsu.
const totalPower = (cards) => cards.reduce((acc, c) => acc + c.vida + c.tai + c.nin, 0);

const sendError = (res, err, fallback) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(fallback, err);
  return res.status(500).json({ error: fallback });
};

// Garante que o jogador tem posicao no ranking (entra no ultimo lugar). Requer lock ativo.
async function ensureRanking(client, userId) {
  const user = await client.query('SELECT name FROM users WHERE id_user = $1', [userId]);
  if (user.rows.length === 0) throw new HttpError(404, 'Jogador não encontrado.');

  let r = await client.query('SELECT rank, points FROM pvp_ranking WHERE id_user = $1', [userId]);
  if (r.rows.length === 0) {
    r = await client.query(
      `INSERT INTO pvp_ranking (id_user, points, rank)
       VALUES ($1, $2, (SELECT COALESCE(MAX(rank), 0) + 1 FROM pvp_ranking))
       RETURNING rank, points`,
      [userId, INITIAL_POINTS]
    );
  }
  return { rank: r.rows[0].rank, points: r.rows[0].points, name: user.rows[0].name };
}

async function getDeck(db, userId) {
  const r = await db.query(
    `SELECT c.*, cm.classe FROM pvp_defense d
     JOIN cards c ON d.id_card = c.id_card
     LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
     WHERE d.id_user = $1
     ORDER BY d.id_defense`,
    [userId]
  );
  return r.rows;
}

// Cartas do inventario de um jogador (sem imagens). Usado para o deck automatico do defensor.
async function getInventoryCards(db, userId) {
  const r = await db.query(
    `SELECT c.*, cm.classe FROM inventario i
     JOIN cards c ON i.id_card = c.id_card
     LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
     WHERE i.id_user = $1`,
    [userId]
  );
  return r.rows;
}

// Deck automatico: as MAX_DECK cartas mais fortes (determinista, nunca aleatorio). Nao e gravado.
const autoDeck = (cards) =>
  [...cards]
    .sort((a, b) => (b.vida + b.tai + b.nin) - (a.vida + a.tai + a.nin) || a.id_card - b.id_card)
    .slice(0, MAX_DECK);

async function getStats(db, userId) {
  const r = await db.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE winner_id = $1)::int AS wins,
            COUNT(*) FILTER (WHERE winner_id <> $1)::int AS losses
     FROM pvp_battles WHERE attacker_id = $1 OR defender_id = $1`,
    [userId]
  );
  const s = r.rows[0];
  return { ...s, winRate: s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0 };
}

const formatBattle = (r) => ({
  id: r.id_battle,
  createdAt: r.created_at,
  winnerId: r.winner_id,
  attacker: {
    id: r.attacker_id,
    name: r.attacker_name,
    rankBefore: r.attacker_rank_before,
    rankAfter: r.attacker_rank_after,
    pointsDelta: r.attacker_points_delta,
    power: r.attacker_power,
    cards: r.attacker_cards
  },
  defender: {
    id: r.defender_id,
    name: r.defender_name,
    rankBefore: r.defender_rank_before,
    rankAfter: r.defender_rank_after,
    pointsDelta: r.defender_points_delta,
    power: r.defender_power,
    cards: r.defender_cards
  }
});

const BATTLE_SELECT = `
  SELECT b.*, ua.name AS attacker_name, ud.name AS defender_name
  FROM pvp_battles b
  JOIN users ua ON ua.id_user = b.attacker_id
  JOIN users ud ON ud.id_user = b.defender_id`;

// ==========================================
// 1. DECK DE BATALHA (tabela pvp_defense ja existente)
// ==========================================

// Guardar/Atualizar deck (max 5 cartas)
router.post('/pvp/defense', requireAuth, async (req, res) => {
  // O deck é sempre do utilizador autenticado: o "userId" do corpo é ignorado.
  const userId = req.user.id;
  const { cardIds } = req.body;

  if (!Array.isArray(cardIds)) {
    return res.status(400).json({ error: 'Dados inválidos (userId ou cardIds ausentes).' });
  }
  const ids = cardIds.map(toInt);
  if (ids.some((id) => id === null)) {
    return res.status(400).json({ error: 'IDs de cartas inválidos.' });
  }
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: 'O deck não pode ter cartas repetidas.' });
  }
  if (ids.length > MAX_DECK) {
    return res.status(400).json({ error: `O deck pode ter no máximo ${MAX_DECK} cartas.` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Apenas cartas do proprio jogador.
    if (ids.length > 0) {
      const owned = await client.query(
        `SELECT COUNT(*)::int AS n FROM cards WHERE id_card = ANY($1::int[]) AND ${CARD_OWNER_COLUMN} = $2`,
        [ids, userId]
      );
      if (owned.rows[0].n !== ids.length) {
        throw new HttpError(403, 'Só podes usar cartas que te pertencem.');
      }
    }

    await client.query('DELETE FROM pvp_defense WHERE id_user = $1', [userId]);
    for (const cardId of ids) {
      await client.query('INSERT INTO pvp_defense (id_user, id_card) VALUES ($1, $2)', [userId, cardId]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, message: 'Deck guardado com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    return sendError(res, err, 'Erro interno ao guardar o deck.');
  } finally {
    client.release();
  }
});

// Dados do jogador: posicao, pontos, deck e estatisticas
// (autenticado, e apenas os dados do próprio utilizador — antes, ":id" podia ser de quem fosse)
router.get('/pvp/user/:id', requireAuth, requireSelf('id'), async (req, res) => {
  const userId = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [RANK_LOCK_KEY]);
    const me = await ensureRanking(client, userId);
    await client.query('COMMIT');

    const defenseCards = (await getDeck(client, userId)).map(cardView);
    const stats = await getStats(client, userId);
    res.json({ rank: me.rank, points: me.points, defenseCards, stats });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, 'Erro ao carregar dados de PvP.');
  } finally {
    client.release();
  }
});

// ==========================================
// 2. RANKING COMPLETO (ordenado por posicao)
// ==========================================

// GET /api/pvp/ranking?limit=500&offset=0  (requer autenticação)
router.get('/pvp/ranking', requireAuth, async (req, res) => {
  const limit = Math.min(toInt(req.query.limit) || 500, 1000);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  try {
    const result = await pool.query(
      `SELECT r.rank, r.points, u.id_user, u.name,
              (SELECT COUNT(*)::int FROM pvp_battles b WHERE b.winner_id = u.id_user) AS wins,
              (SELECT COUNT(*)::int FROM pvp_battles b
                WHERE (b.attacker_id = u.id_user OR b.defender_id = u.id_user)
                  AND b.winner_id <> u.id_user) AS losses
       FROM pvp_ranking r
       JOIN users u ON u.id_user = r.id_user
       ORDER BY r.rank ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar ranking:', err);
    res.status(500).json({ error: 'Erro ao carregar ranking.' });
  }
});

// ==========================================
// 3. BATALHA 1x1 (so contra o jogador imediatamente acima)
// ==========================================

router.post('/pvp/battle', requireAuth, async (req, res) => {
  // O atacante é sempre o utilizador autenticado; o "attackerId" do corpo é ignorado
  // (antes, qualquer um podia batalhar em nome de outro jogador).
  const attackerId = req.user.id;
  const defenderId = toInt(req.body.defenderId);

  if (!attackerId || !defenderId) {
    return res.status(400).json({ error: 'Dados de combate incompletos.' });
  }
  if (attackerId === defenderId) {
    return res.status(400).json({ error: 'Não podes desafiar-te a ti próprio.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializa todas as alteracoes de posicoes: dois desafios nunca correm em simultaneo.
    await client.query('SELECT pg_advisory_xact_lock($1)', [RANK_LOCK_KEY]);

    const att = await ensureRanking(client, attackerId);
    if (att.rank <= 1) {
      throw new HttpError(409, 'O primeiro classificado não pode desafiar ninguém.');
    }

    const above = await client.query(
      `SELECT r.id_user, r.rank, r.points, u.name
       FROM pvp_ranking r JOIN users u ON u.id_user = r.id_user
       WHERE r.rank = $1`,
      [att.rank - 1]
    );
    if (above.rows.length === 0) {
      throw new HttpError(409, 'Ranking inconsistente: não existe jogador na posição acima. Contacta um administrador.');
    }
    const def = above.rows[0];
    if (def.id_user !== defenderId) {
      throw new HttpError(409, `Só podes desafiar o jogador imediatamente acima de ti (#${att.rank - 1}).`);
    }

    const attackerCards = (await getDeck(client, attackerId)).map(cardView);
    if (attackerCards.length === 0) {
      throw new HttpError(409, 'Tens de guardar um deck antes de desafiar.');
    }

    // Defensor sem deck guardado: defende com as suas cartas mais fortes (nada e gravado nem escolhido ao acaso).
    let defenderCards = (await getDeck(client, defenderId)).map(cardView);
    if (defenderCards.length === 0) {
      defenderCards = autoDeck((await getInventoryCards(client, defenderId)).map(cardView));
    }
    if (defenderCards.length === 0) {
      throw new HttpError(409, 'O adversário não tem cartas para defender a posição.');
    }

    const attackerPower = totalPower(attackerCards);
    const defenderPower = totalPower(defenderCards);
    // Regra ja existente: em empate vence o atacante.
    const attackerWins = attackerPower >= defenderPower;

    const attDelta = attackerWins ? POINTS_WIN : -Math.min(POINTS_LOSS, att.points);
    const defDelta = attackerWins ? -Math.min(POINTS_LOSS, def.points) : POINTS_WIN;
    await client.query('UPDATE pvp_ranking SET points = points + $1 WHERE id_user = $2', [attDelta, attackerId]);
    await client.query('UPDATE pvp_ranking SET points = points + $1 WHERE id_user = $2', [defDelta, defenderId]);

    let attackerRankAfter = att.rank;
    let defenderRankAfter = def.rank;
    if (attackerWins) {
      // Troca de posicoes (via valor temporario para respeitar a unicidade de rank).
      attackerRankAfter = def.rank;
      defenderRankAfter = att.rank;
      await client.query('UPDATE pvp_ranking SET rank = -1 WHERE id_user = $1', [attackerId]);
      await client.query('UPDATE pvp_ranking SET rank = $1 WHERE id_user = $2', [att.rank, defenderId]);
      await client.query('UPDATE pvp_ranking SET rank = $1 WHERE id_user = $2', [def.rank, attackerId]);
    }

    const ins = await client.query(
      `INSERT INTO pvp_battles
        (attacker_id, defender_id, winner_id,
         attacker_rank_before, attacker_rank_after, defender_rank_before, defender_rank_after,
         attacker_points_delta, defender_points_delta, attacker_power, defender_power,
         attacker_cards, defender_cards)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)
       RETURNING id_battle`,
      [
        attackerId, defenderId, attackerWins ? attackerId : defenderId,
        att.rank, attackerRankAfter, def.rank, defenderRankAfter,
        attDelta, defDelta, attackerPower, defenderPower,
        JSON.stringify(attackerCards), JSON.stringify(defenderCards)
      ]
    );
    const battleId = ins.rows[0].id_battle;

    await client.query('INSERT INTO pvp_notifications (id_user, id_battle) VALUES ($1, $2)', [defenderId, battleId]);

    const full = await client.query(`${BATTLE_SELECT} WHERE b.id_battle = $1`, [battleId]);
    await client.query('COMMIT');

    res.json({
      success: true,
      winner: attackerWins ? 'attacker' : 'defender',
      message: attackerWins
        ? `Vitória! Subiste para a posição #${attackerRankAfter}.`
        : `Derrota. Manténs a posição #${att.rank}.`,
      battle: formatBattle(full.rows[0])
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, 'Erro ao processar batalha PvP.');
  } finally {
    client.release();
  }
});

// ==========================================
// 4. HISTORICO DE BATALHAS
// ==========================================

router.get('/pvp/history/:id', requireAuth, requireSelf('id'), async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(toInt(req.query.limit) || 20, 50);
  try {
    const r = await pool.query(
      `${BATTLE_SELECT}
       WHERE b.attacker_id = $1 OR b.defender_id = $1
       ORDER BY b.created_at DESC, b.id_battle DESC
       LIMIT $2`,
      [userId, limit]
    );
    res.json(r.rows.map(formatBattle));
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    res.status(500).json({ error: 'Erro ao carregar histórico.' });
  }
});

// ==========================================
// 5. NOTIFICACOES (apenas desafios/batalhas)
// ==========================================

router.get('/pvp/notifications/:id', requireAuth, requireSelf('id'), async (req, res) => {
  const userId = req.user.id;
  try {
    const r = await pool.query(
      `SELECT n.id_notification, n.is_read, n.created_at, n.id_battle,
              ua.name AS attacker_name, (b.winner_id = b.attacker_id) AS attacker_won
       FROM pvp_notifications n
       JOIN pvp_battles b ON b.id_battle = n.id_battle
       JOIN users ua ON ua.id_user = b.attacker_id
       WHERE n.id_user = $1
       ORDER BY n.created_at DESC, n.id_notification DESC
       LIMIT 30`,
      [userId]
    );
    res.json({
      unread: r.rows.filter((n) => !n.is_read).length,
      notifications: r.rows
    });
  } catch (err) {
    console.error('Erro ao buscar notificações:', err);
    res.status(500).json({ error: 'Erro ao carregar notificações.' });
  }
});

router.post('/pvp/notifications/:id/read', requireAuth, requireSelf('id'), async (req, res) => {
  const userId = req.user.id;
  try {
    await pool.query('UPDATE pvp_notifications SET is_read = TRUE WHERE id_user = $1 AND is_read = FALSE', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao marcar notificações:', err);
    res.status(500).json({ error: 'Erro ao atualizar notificações.' });
  }
});

// ==========================================
// 5b. CARTAS DO JOGADOR (leve, sem imagens) E IMAGENS DAS CARTAS
// ==========================================

// Lista as cartas do inventario sem o campo de imagem (que pode ter varios MB em base64).
router.get('/pvp/cards/:id', requireAuth, requireSelf('id'), async (req, res) => {
  const userId = req.user.id;
  try {
    const r = await pool.query(
      `SELECT c.id_card, c.id_cardmodel, c.name, c.vidastatus, c.taistatus, c.chakrastatus, c.level, cm.classe
       FROM inventario i
       JOIN cards c ON i.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE i.id_user = $1
       ORDER BY c.id_card`,
      [userId]
    );
    res.json(r.rows.map((row) => ({ ...cardView(row), level: row.level ?? 1 })));
  } catch (err) {
    console.error('Erro ao listar cartas:', err);
    res.status(500).json({ error: 'Erro ao carregar cartas.' });
  }
});

// Serve a imagem de um modelo de carta como ficheiro (o navegador guarda-a em cache).
router.get('/pvp/card-image/:id', async (req, res) => {
  const id = toInt(req.params.id);
  if (!id) return res.status(400).end();
  try {
    const r = await pool.query('SELECT image_url FROM cardmodel WHERE id_modelcard = $1', [id]);
    const src = r.rows[0] && r.rows[0].image_url;
    if (!src) return res.status(404).end();

    const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(src);
    if (m) {
      res.set({
        'Content-Type': m[1],
        'Cache-Control': 'public, max-age=86400',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      });
      return res.send(Buffer.from(m[2], 'base64'));
    }
    if (/^https?:\/\//i.test(src)) return res.redirect(302, src);
    return res.status(404).end();
  } catch (err) {
    console.error('Erro ao servir imagem:', err);
    res.status(500).end();
  }
});

// ==========================================
// 6. MODO INFINITO (Farm de Ryos e Ondeando Inimigos)
// ==========================================

// Antes: o cliente mandava "wave" livre e recebia wave*150 Ryos, sem validacao de
// progresso nem limite — o modo infinito era uma fonte inesgotavel de moedas.
// Agora o progresso (maior onda alcancada) e guardado na BD e o pedido tem cooldown,
// pelo que repeticoes nao acumulam moedas indefinidamente.

const MAX_WAVE = 10_000;            // cap absoluto por pedido
const FARM_RATIO = 0.25;            // repeticao da onda paga 25% da recompensa do recorde
const CLAIM_COOLDOWN_SECONDS = 20;  // minimo entre reclamacoes de recompensa

// FM1: cache em memória por userId (otimização de leituras). BD é SEMPRE a fonte
// de verdade na transação de claim (FOR UPDATE). Não persistida; TTL curto.
const INFINITE_CACHE_TTL_MS = 60_000;
const infiniteProgressCache = new Map();

function getInfiniteCache(userId) {
  const entry = infiniteProgressCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > INFINITE_CACHE_TTL_MS) {
    infiniteProgressCache.delete(userId);
    return null;
  }
  return entry;
}

function setInfiniteCache(userId, data) {
  infiniteProgressCache.set(userId, { ...data, ts: Date.now() });
}

function invalidateInfiniteCache(userId) {
  infiniteProgressCache.delete(userId);
}

router.post('/infinite/reward', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const wave = Number(req.body && req.body.wave);

  if (!Number.isInteger(wave) || wave < 1 || wave > MAX_WAVE) {
    return res.status(400).json({ error: 'Onda inválida.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Progresso do jogador (linha criada a zero na primeira chamada).
    // FOR UPDATE: dois pedidos concorrentes nao podem reclamar a mesma onda nova em paralelo.
    // BD é a fonte de verdade (cache em memória só para leituras; ignorado aqui).
    await client.query(
      `INSERT INTO infinite_progress (id_user, max_wave) VALUES ($1, 0)
       ON CONFLICT (id_user) DO NOTHING`,
      [userId]
    );
    const prog = await client.query(
      'SELECT max_wave, best_wave, last_claim_at, resets_today, resets_day FROM infinite_progress WHERE id_user = $1 FOR UPDATE',
      [userId]
    );
    if (prog.rows.length === 0) throw new Error('progresso ausente');

    const maxWave = prog.rows[0].max_wave || 0;
    const bestWave = prog.rows[0].best_wave || 0;
    const lastClaim = prog.rows[0].last_claim_at;
    const resetsToday = prog.rows[0].resets_today || 0;
    const resetsDay = prog.rows[0].resets_day || null;

    if (wave > maxWave + 1) {
      // Nao se pode saltar ondas: so se alcanca a onda N depois de passar pela N-1 (progressão da run).
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Progresso inconsistente: complete primeiro a onda #${maxWave + 1}.` });
    }

    if (lastClaim && new Date() - new Date(lastClaim) < CLAIM_COOLDOWN_SECONDS * 1000) {
      const waitMs = CLAIM_COOLDOWN_SECONDS * 1000 - (new Date() - new Date(lastClaim));
      await client.query('ROLLBACK');
      return res.set('Retry-After', Math.ceil(waitMs / 1000)).status(429).json({
        error: `Aguarda ${Math.ceil(waitMs / 1000)} s antes da próxima recompensa.`
      });
    }

    // FM1 (Opção 1, A): recorde absoluto = wave > best_wave.
    // Recorde: Ryos completos + diamantes max(1, floor(wave/10)).
    // Repeat (inclui waves <= best_wave, mesmo após reset com max_wave a 0): Ryos 25%, 0 diamantes.
    const isRecordReward = wave > bestWave;
    const rewardRyos = isRecordReward ? wave * 150 : Math.round(wave * 150 * FARM_RATIO);
    const rewardDiamonds = isRecordReward ? Math.max(1, Math.floor(wave / 10)) : 0;

    const newBestWave = Math.max(bestWave, wave);
    const newMaxWave = Math.max(maxWave, wave);

    // Atualização atómica: coins + diamonds na mesma transação.
    const upd = await client.query(
      'UPDATE users SET coins = COALESCE(coins, 0) + $1, diamonds = COALESCE(diamonds, 0) + $2 WHERE id_user = $3 RETURNING coins, diamonds',
      [rewardRyos, rewardDiamonds, userId]
    );
    if (upd.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Jogador não encontrado.' });
    }

    await client.query(
      'UPDATE infinite_progress SET max_wave = $1, best_wave = $2, last_claim_at = now() WHERE id_user = $3',
      [newMaxWave, newBestWave, userId]
    );

    await client.query('COMMIT');

    // Atualiza cache em memória após claim bem-sucedido (BD continua a ser a fonte de verdade).
    setInfiniteCache(userId, {
      max_wave: newMaxWave,
      best_wave: newBestWave,
      last_claim_at: new Date().toISOString(),
      resets_today: resetsToday,
      resets_day: resetsDay
    });

    // Resposta retrocompatível + novos campos FM1.
    res.json({
      success: true,
      rewardRyos,
      rewardDiamonds,
      isRecord: isRecordReward,
      newCoins: upd.rows[0].coins,
      newDiamonds: upd.rows[0].diamonds,
      maxWave: newMaxWave,
      bestWave: newBestWave
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao atribuir recompensa do modo infinito:', err);
    res.status(500).json({ error: 'Erro ao atribuir recompensa do modo infinito.' });
  } finally {
    client.release();
  }
});

// FM2: reinicia a run (posição) mantendo best_wave/ranking. Limite 2x/dia no servidor (BD).
router.post('/infinite/reset', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Garante linha de progresso; FOR UPDATE serializa resets/claims concorrentes.
    await client.query(
      `INSERT INTO infinite_progress (id_user, max_wave) VALUES ($1, 0)
       ON CONFLICT (id_user) DO NOTHING`,
      [userId]
    );
    const prog = await client.query(
      `SELECT max_wave, best_wave, last_claim_at, resets_today, resets_day,
              CURRENT_DATE AS today,
              CASE WHEN resets_day IS NULL OR resets_day <> CURRENT_DATE THEN 0 ELSE resets_today END AS effective_resets_today
       FROM infinite_progress WHERE id_user = $1 FOR UPDATE`,
      [userId]
    );
    if (prog.rows.length === 0) throw new Error('progresso ausente');

    const row = prog.rows[0];
    const effectiveResetsToday = row.effective_resets_today || 0;
    const bestWave = row.best_wave || 0;
    const lastClaim = row.last_claim_at || null;

    if (effectiveResetsToday >= 2) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Já usaste os 2 reinícios de hoje. Tenta amanhã.',
        resetsRemaining: 0
      });
    }

    const resetsUsed = effectiveResetsToday + 1;
    // Reset da run (max_wave) apenas; best_wave e last_claim_at (cooldown) mantêm-se.
    const upd = await client.query(
      `UPDATE infinite_progress
       SET max_wave = 0, resets_today = $1, resets_day = CURRENT_DATE
       WHERE id_user = $2
       RETURNING max_wave, best_wave, resets_today, resets_day`,
      [resetsUsed, userId]
    );
    if (upd.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Jogador não encontrado.' });
    }

    await client.query('COMMIT');

    const out = upd.rows[0];
    setInfiniteCache(userId, {
      max_wave: 0,
      best_wave: bestWave,
      last_claim_at: lastClaim,
      resets_today: out.resets_today,
      resets_day: out.resets_day
    });

    return res.json({
      success: true,
      maxWave: 0,
      bestWave,
      resetsUsed,
      resetsRemaining: 2 - resetsUsed
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao reiniciar modo infinito:', err);
    return res.status(500).json({ error: 'Erro ao reiniciar modo infinito.' });
  } finally {
    client.release();
  }
});

// FM2: ranking do modo infinito (recorde best_wave). Apenas dados públicos.
router.get('/infinite/ranking', requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  try {
    const totalRes = await pool.query(
      'SELECT COUNT(*)::int AS total FROM infinite_progress WHERE best_wave > 0'
    );
    const total = totalRes.rows[0] ? totalRes.rows[0].total : 0;

    const r = await pool.query(
      `SELECT ip.best_wave, ip.max_wave, u.id_user, u.name
       FROM infinite_progress ip
       JOIN users u ON u.id_user = ip.id_user
       WHERE ip.best_wave > 0
       ORDER BY ip.best_wave DESC, ip.max_wave DESC, ip.id_user ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const entries = r.rows.map((row, index) => ({
      rank: offset + index + 1,
      id_user: row.id_user,
      name: row.name,
      bestWave: row.best_wave
    }));

    res.json({
      entries,
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });
  } catch (err) {
    console.error('Erro ao buscar ranking infinito:', err);
    res.status(500).json({ error: 'Erro ao carregar ranking do modo infinito.' });
  }
});

// FM2/FM3: estado atual do utilizador no modo infinito (leitura; BD como fonte de verdade).
router.get('/infinite/progress', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const cached = getInfiniteCache(userId);
    let base;
    if (cached) {
      // Cache hit: calcula resets efetivos com base no CURRENT_DATE do BD (evita drift de fuso).
      const eff = await pool.query(
        `SELECT CASE WHEN $1::date IS NULL OR $1::date <> CURRENT_DATE THEN 0 ELSE $2::int END AS effective_resets_today`,
        [cached.resets_day || null, cached.resets_today || 0]
      );
      const effectiveResetsToday = (eff.rows[0] && eff.rows[0].effective_resets_today) || 0;
      base = {
        max_wave: cached.max_wave || 0,
        best_wave: cached.best_wave || 0,
        effective_resets_today: effectiveResetsToday
      };
    } else {
      // Cache miss: lê BD (sem mutação). Garante linha para utilizadores novos.
      await pool.query(
        `INSERT INTO infinite_progress (id_user, max_wave) VALUES ($1, 0)
         ON CONFLICT (id_user) DO NOTHING`,
        [userId]
      );
      const r = await pool.query(
        `SELECT max_wave, best_wave, last_claim_at, resets_today, resets_day,
                CASE WHEN resets_day IS NULL OR resets_day <> CURRENT_DATE THEN 0 ELSE resets_today END AS effective_resets_today
         FROM infinite_progress WHERE id_user = $1`,
        [userId]
      );
      if (r.rows.length === 0) {
        return res.json({ maxWave: 0, bestWave: 0, resetsToday: 0, resetsRemaining: 2 });
      }
      const row = r.rows[0];
      base = {
        max_wave: row.max_wave || 0,
        best_wave: row.best_wave || 0,
        effective_resets_today: row.effective_resets_today || 0
      };
      setInfiniteCache(userId, {
        max_wave: row.max_wave || 0,
        best_wave: row.best_wave || 0,
        last_claim_at: row.last_claim_at || null,
        resets_today: row.resets_today || 0,
        resets_day: row.resets_day || null
      });
    }

    return res.json({
      maxWave: base.max_wave,
      bestWave: base.best_wave,
      resetsToday: base.effective_resets_today,
      resetsRemaining: Math.max(0, 2 - base.effective_resets_today)
    });
  } catch (err) {
    console.error('Erro ao carregar progresso do modo infinito:', err);
    return res.status(500).json({ error: 'Erro ao carregar progresso do modo infinito.' });
  }
});

module.exports = router;
