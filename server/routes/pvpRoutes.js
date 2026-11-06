const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

// CORRECAO: o pool deixou de vir de require('../index'). O index.js nao exporta nada (e a importacao seria circular),
// pelo que pool.connect() falhava e todas as rotas PvP davam erro. Passa a ser criado aqui, como nos outros ficheiros de rotas.
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});
// Sem este handler, um erro numa ligacao inativa (ex.: reinicio da BD) mata o processo Node.
pool.on('error', (err) => console.error('Erro no pool PvP (ligacao inativa):', err.message));

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
router.post('/pvp/defense', async (req, res) => {
  const userId = toInt(req.body.userId);
  const { cardIds } = req.body;

  if (!userId || !Array.isArray(cardIds)) {
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS pvp_defense (
        id_defense SERIAL PRIMARY KEY,
        id_user INT NOT NULL,
        id_card INT NOT NULL
      )
    `);

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
router.get('/pvp/user/:id', async (req, res) => {
  const userId = toInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido.' });

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

// GET /api/pvp/ranking?limit=500&offset=0
router.get('/pvp/ranking', async (req, res) => {
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

router.post('/pvp/battle', async (req, res) => {
  const attackerId = toInt(req.body.attackerId);
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

router.get('/pvp/history/:id', async (req, res) => {
  const userId = toInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido.' });
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

router.get('/pvp/notifications/:id', async (req, res) => {
  const userId = toInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido.' });
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

router.post('/pvp/notifications/:id/read', async (req, res) => {
  const userId = toInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido.' });
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
router.get('/pvp/cards/:id', async (req, res) => {
  const userId = toInt(req.params.id);
  if (!userId) return res.status(400).json({ error: 'ID inválido.' });
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
//    -- Fora do ambito do PvP: mantido exatamente como estava --
// ==========================================

router.post('/infinite/reward', async (req, res) => {
  const { userId, wave } = req.body;
  const rewardRyos = wave * 150; // Recompensa aumenta por cada onda

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET coins = COALESCE(coins, 0) + $1 WHERE id_user = $2', [rewardRyos, userId]);
    
    const userRes = await client.query('SELECT coins FROM users WHERE id_user = $1', [userId]);
    await client.query('COMMIT');
    client.release();

    res.json({ success: true, rewardRyos, newCoins: userRes.rows[0].coins });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    res.status(500).json({ error: 'Erro ao atribuir recompensa do modo infinito.' });
  }
});

module.exports = router;
