const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { computeStatValue } = require('../config/statRanks');

// ==========================================
// CONFIGURAÇÃO / FÓRMULAS
// ==========================================

// Inclui as classes usadas no painel de admin (E, R, SR, SSR, UR) e as antigas (D, C, B, A, S).
const SELL_RYOS = { E: 100, D: 250, C: 500, B: 1000, A: 2500, S: 5000, R: 120, SR: 220, SSR: 600, UR: 1500 };
const FEED_XP   = { E: 50,  D: 100, C: 250, B: 500,  A: 1000, S: 2000, R: 250, SR: 750,  SSR: 2000, UR: 5000 };
const STAT_GROWTH_PER_LEVEL = 0.05; // +5% dos atributos base por nível ganho

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const classOf = (card) => String(card.classe || 'E').trim().toUpperCase();
const levelOf = (card) => Math.max(1, toInt(card.level, 1));

// Aceita array, valor único ou lixo; devolve inteiros positivos únicos.
const normalizeIds = (ids) => {
  const arr = Array.isArray(ids) ? ids : (ids === undefined || ids === null ? [] : [ids]);
  return [...new Set(arr.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
};

function calculateSellRyos(card) {
  const base = SELL_RYOS[classOf(card)] || SELL_RYOS.E;
  return base + levelOf(card) * 50;
}

function calculateFeedXp(card) {
  const base = FEED_XP[classOf(card)] || FEED_XP.E;
  // CORREÇÃO: os atributos vêm como texto ("500"); antes eram concatenados em vez de somados.
  const statusSum =
    toInt(card.vidastatus ?? card.vida) +
    toInt(card.taistatus ?? card.tai) +
    toInt(card.chakrastatus ?? card.nin);
  return base + Math.floor(statusSum * 0.5) + levelOf(card) * 100;
}

// Aplica XP e devolve nível/xp finais. XP necessário para subir = nível * 1000.
function applyXp(level, xp, gained) {
  let currentLevel = level;
  let currentXp = xp + gained;
  let xpNeeded = currentLevel * 1000;
  while (currentXp >= xpNeeded) {
    currentXp -= xpNeeded;
    currentLevel += 1;
    xpNeeded = currentLevel * 1000;
  }
  return { level: currentLevel, xp: currentXp, xpNeeded };
}

// R1-C4: valor final = computeStatValue(levelBase, statMult), preservando ranks (não re-rola no feed).
// levelBase = cardmodelBase * (1 + 5%*(level-1)) (molde × crescimento por nível).
// Fallback de dedução considera statMult: base ≈ current / ((1 + 5%*(oldLevel-1)) * statMult).
function scaleStat(card, statKey, baseKey, multKey, oldLevel, newLevel) {
  const current = toInt(card[statKey]);
  const rawMult = card && card[multKey];
  const statMult = (rawMult !== null && rawMult !== undefined && Number.isFinite(Number(rawMult)))
    ? Number(rawMult)
    : 1.0;
  const levelBase = (card[baseKey] !== null && card[baseKey] !== undefined)
    ? toInt(card[baseKey]) * (1 + STAT_GROWTH_PER_LEVEL * (newLevel - 1))
    : (statMult > 0
        ? (current / ((1 + STAT_GROWTH_PER_LEVEL * (oldLevel - 1)) * statMult)) * (1 + STAT_GROWTH_PER_LEVEL * (newLevel - 1))
        : current);
  return computeStatValue(levelBase, statMult);
}

function computeFeed(target, sacrifices) {
  const totalXpGanha = sacrifices.reduce((sum, c) => sum + calculateFeedXp(c), 0);
  const oldLevel = levelOf(target);
  const res = applyXp(oldLevel, toInt(target.xp), totalXpGanha);
  const stats = {
    vida: scaleStat(target, 'vidastatus', 'base_vida', 'vida_rank_mult', oldLevel, res.level),
    tai:  scaleStat(target, 'taistatus',  'base_tai',  'tai_rank_mult', oldLevel, res.level),
    nin:  scaleStat(target, 'chakrastatus', 'base_nin', 'nin_rank_mult', oldLevel, res.level)
  };
  return { totalXpGanha, newLevel: res.level, newXp: res.xp, xpNeeded: res.xpNeeded, stats };
}

// R1-C4: ranks da instância (retrocompatível; defaults D+/1.0 se ausentes).
function statRanksOf(card, values) {
  if (!card) return undefined;
  const v = values || {
    vida: toInt(card.vidastatus ?? card.vida),
    tai: toInt(card.taistatus ?? card.tai),
    nin: toInt(card.chakrastatus ?? card.nin)
  };
  return {
    vida: {
      pos: card.vida_rank_pos ?? 6,
      code: card.vida_rank_code ?? 'D+',
      mult: Number(card.vida_rank_mult ?? 1.0),
      value: v.vida
    },
    tai: {
      pos: card.tai_rank_pos ?? 6,
      code: card.tai_rank_code ?? 'D+',
      mult: Number(card.tai_rank_mult ?? 1.0),
      value: v.tai
    },
    nin: {
      pos: card.nin_rank_pos ?? 6,
      code: card.nin_rank_code ?? 'D+',
      mult: Number(card.nin_rank_mult ?? 1.0),
      value: v.nin
    },
    overall: {
      pos: card.stat_rank_pos ?? 6,
      code: card.stat_rank_code ?? 'D+',
      mult: Number(card.stat_rank_mult ?? 1.0)
    }
  };
}

// Cartas pertencentes ao utilizador. Com lock=true bloqueia as linhas (evita cliques duplos / pedidos concorrentes).
async function getOwnedCards(db, userId, ids, lock = false) {
  if (ids.length === 0) return [];
  const result = await db.query(
    `SELECT c.*, cm.classe,
            cm.vida AS base_vida, cm.tai AS base_tai, cm.nin AS base_nin
       FROM inventario i
       JOIN cards c ON c.id_card = i.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
      WHERE i.id_user = $1 AND i.id_card = ANY($2::int[])
      ORDER BY c.id_card ${lock ? 'FOR UPDATE OF c' : ''}`,
    [userId, ids]
  );
  return result.rows;
}

// O userId passou a vir do token (ver middleware/auth.js). Um "userId" do corpo é ignorado,
// senão qualquer cliente podia vender/fazer feed de cartas de outra pessoa.
const requireUserId = (req) => req.user.id;

// ==========================================
// PREVIEWS
// ==========================================

router.post('/preview-sell', requireAuth, async (req, res) => {
  const userId = requireUserId(req);
  const cardIds = normalizeIds(req.body.cardIds);
  if (cardIds.length === 0) return res.json({ totalRyos: 0, perCard: {} });

  try {
    const cards = await getOwnedCards(pool, userId, cardIds);
    const perCard = {};
    let totalRyos = 0;
    cards.forEach((card) => {
      const value = calculateSellRyos(card);
      perCard[card.id_card] = value;
      totalRyos += value;
    });
    res.json({ totalRyos, perCard });
  } catch (error) {
    console.error('Erro no preview de venda:', error);
    res.status(500).json({ error: 'Erro ao calcular preview de venda.' });
  }
});

router.post('/preview-feed', requireAuth, async (req, res) => {
  const userId = requireUserId(req);
  const targetCardId = Number(req.body.targetCardId);
  const sacrificeIds = normalizeIds(req.body.sacrificeCardIds).filter((id) => id !== targetCardId);
  if (!targetCardId || sacrificeIds.length === 0) {
    return res.json({ totalXpGanha: 0, previewLevel: 1, previewXp: 0, xpNeeded: 1000 });
  }

  try {
    const [target] = await getOwnedCards(pool, userId, [targetCardId]);
    if (!target) return res.status(404).json({ error: 'Carta alvo não encontrada.' });
    const sacrifices = await getOwnedCards(pool, userId, sacrificeIds);

    const r = computeFeed(target, sacrifices);
    res.json({
      totalXpGanha: r.totalXpGanha,
      previewLevel: r.newLevel,
      previewXp: r.newXp,
      xpNeeded: r.xpNeeded,
      previewStats: r.stats,
      targetStatRanks: statRanksOf(target, r.stats)
    });
  } catch (error) {
    console.error('Erro no preview de feed:', error);
    res.status(500).json({ error: 'Erro ao calcular preview de feed.' });
  }
});

// ==========================================
// SELL (uma ou várias cartas, numa única transação)
// ==========================================

router.post('/sell', requireAuth, async (req, res) => {
  const userId = requireUserId(req);
  // Aceita cardIds (lote) e cardId (compatibilidade com a versão anterior)
  const cardIds = normalizeIds(req.body.cardIds !== undefined ? req.body.cardIds : req.body.cardId);

  if (cardIds.length === 0) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios (userId ou cardIds).' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const cards = await getOwnedCards(client, userId, cardIds, true);
    // Tudo ou nada: se alguma carta não for do utilizador, nada é vendido.
    if (cards.length !== cardIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uma ou mais cartas não foram encontradas no teu inventário.' });
    }

    const totalRyos = cards.reduce((sum, c) => sum + calculateSellRyos(c), 0);

    await client.query('DELETE FROM inventario WHERE id_card = ANY($1::int[]) AND id_user = $2', [cardIds, userId]);
    await client.query('DELETE FROM cards WHERE id_card = ANY($1::int[])', [cardIds]);
    const coinsRes = await client.query(
      'UPDATE users SET coins = COALESCE(coins, 0) + $1 WHERE id_user = $2 RETURNING coins',
      [totalRyos, userId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `${cardIds.length} carta(s) vendida(s) por ${totalRyos} Ryos!`,
      ryosGanhos: totalRyos,
      totalRyos,
      soldIds: cardIds,
      newCoins: coinsRes.rows[0].coins
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao vender carta(s):', error);
    return res.status(500).json({ error: 'Erro interno ao vender a(s) carta(s).' });
  } finally {
    client.release();
  }
});

// ==========================================
// FEED
// ==========================================

router.post('/feed', requireAuth, async (req, res) => {
  const userId = requireUserId(req);
  const targetCardId = Number(req.body.targetCardId);
  const requestedIds = normalizeIds(req.body.sacrificeCardIds);

  if (!Number.isInteger(targetCardId) || targetCardId <= 0 || requestedIds.length === 0) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios para o feed.' });
  }
  if (requestedIds.includes(targetCardId)) {
    return res.status(400).json({ error: 'Uma carta não se pode alimentar a si própria.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const [target] = await getOwnedCards(client, userId, [targetCardId], true);
    if (!target) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Carta alvo não encontrada.' });
    }

    const sacrifices = await getOwnedCards(client, userId, requestedIds, true);
    if (sacrifices.length !== requestedIds.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Alguma carta de sacrifício não foi encontrada no teu inventário.' });
    }

    const r = computeFeed(target, sacrifices);

    // Só são apagadas as cartas validadas (pertencem ao utilizador)
    await client.query('DELETE FROM inventario WHERE id_card = ANY($1::int[]) AND id_user = $2', [requestedIds, userId]);
    await client.query('DELETE FROM cards WHERE id_card = ANY($1::int[])', [requestedIds]);

    // Nível, XP e atributos da carta principal
    const upd = await client.query(
      `UPDATE cards
          SET level = $1, xp = $2, vidastatus = $3, taistatus = $4, chakrastatus = $5
        WHERE id_card = $6`,
      [r.newLevel, r.newXp, String(r.stats.vida), String(r.stats.tai), String(r.stats.nin), targetCardId]
    );
    if (upd.rowCount !== 1) throw new Error('Falha ao atualizar a carta principal.');

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Feed concluído! Ganhaste ${r.totalXpGanha} XP${r.newLevel > levelOf(target) ? ` e a carta subiu para o nível ${r.newLevel}` : ''}.`,
      totalXpGanha: r.totalXpGanha,
      newLevel: r.newLevel,
      newXp: r.newXp,
      xpNeeded: r.xpNeeded,
      newStats: r.stats,
      targetStatRanks: statRanksOf(target, r.stats),
      deletedIds: requestedIds
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro ao realizar feed em lote:', error);
    return res.status(500).json({ error: 'Erro interno ao processar o feed.' });
  } finally {
    client.release();
  }
});

module.exports = router;
