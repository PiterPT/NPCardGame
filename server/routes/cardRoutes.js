const express = require('express');
const router = express.Router();
const pool = require('../index'); // Ajustado para apontar para o ficheiro principal onde está a pool (ex: index.js ou db.js)

// ==========================================
// FÓRMULAS DE CÁLCULO (BACKEND REGRAS)
// ==========================================

function calculateSellRyos(card) {
  const rarityRyos = { E: 100, D: 250, C: 500, B: 1000, A: 2500, S: 5000, UR: 15000 };
  const baseRyos = rarityRyos[card.classe] || 100;
  const levelBonus = (card.level || 1) * 50;
  return baseRyos + levelBonus;
}

function calculateFeedXp(sacrificedCard) {
  const rarityMultipliers = { E: 50, D: 100, C: 250, B: 500, A: 1000, S: 2000, UR: 5000 };
  const baseMultiplier = rarityMultipliers[sacrificedCard.classe] || 50;
  
  const statusSum = (sacrificedCard.vida || 0) + (sacrificedCard.tai || 0) + (sacrificedCard.nin || 0);
  const levelBonus = (sacrificedCard.level || 1) * 100;

  return baseMultiplier + Math.floor(statusSum * 0.5) + levelBonus;
}

// ==========================================
// ROTAS DA API
// ==========================================

/**
 * @route   POST /api/cards/sell
 * @desc    Vende uma carta do inventário do utilizador
 */
router.post('/sell', async (req, res) => {
  const { userId, cardId } = req.body;

  if (!userId || !cardId) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios (userId ou cardId).' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Validar se a carta pertence ao utilizador através da tabela inventario
    const invCheck = await client.query(
      `SELECT c.*, cm.classe FROM inventario i
       JOIN cards c ON i.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE i.id_card = $1 AND i.id_user = $2`,
      [cardId, userId]
    );

    if (invCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Carta não encontrada no teu inventário.' });
    }

    const card = invCheck.rows[0];
    const ryosGanhos = calculateSellRyos(card);

    // 2. Apagar o registo da tabela inventario (remover da posse do user)
    await client.query('DELETE FROM inventario WHERE id_card = $1 AND id_user = $2', [cardId, userId]);

    // 3. Apagar também da tabela cards se já não pertencer a mais ninguém (opcional, dependendo da tua lógica)
    await client.query('DELETE FROM cards WHERE id_card = $1', [cardId]);

    // 4. Adicionar as moedas (ryos/coins) ao utilizador
    await client.query(
      'UPDATE users SET coins = COALESCE(coins, 0) + $1 WHERE id_user = $2',
      [ryosGanhos, userId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Carta vendida com sucesso por ${ryosGanhos} Ryos!`,
      ryosGanhos
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao vender carta:', error);
    return res.status(500).json({ error: 'Erro interno ao vender a carta.' });
  } finally {
    client.release();
  }
});

/**
 * @route   POST /api/cards/feed
 * @desc    Sacrifica cartas para dar XP a outra carta do inventário
 */
router.post('/feed', async (req, res) => {
  const { userId, targetCardId, sacrificeCardIds } = req.body;

  if (!userId || !targetCardId || !sacrificeCardIds || sacrificeCardIds.length === 0) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios para o feed.' });
  }

  if (sacrificeCardIds.includes(targetCardId)) {
    return res.status(400).json({ error: 'Uma carta não se pode alimentar a si própria.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Obter a carta alvo validando a tabela inventario
    const targetRes = await client.query(
      `SELECT c.*, cm.classe FROM inventario i
       JOIN cards c ON i.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE i.id_card = $1 AND i.id_user = $2`,
      [targetCardId, userId]
    );

    if (targetRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Carta alvo não encontrada.' });
    }

    const targetCard = targetRes.rows[0];

    // 2. Obter as cartas de sacrifício
    const sacrificesRes = await client.query(
      `SELECT c.*, cm.classe FROM inventario i
       JOIN cards c ON i.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE i.id_card = ANY($1::int[]) AND i.id_user = $2`,
      [sacrificeCardIds, userId]
    );

    if (sacrificesRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Nenhuma carta de sacrifício válida encontrada.' });
    }

    // 3. Calcular XP total ganho
    let totalXpGanha = 0;
    for (const sacrificeCard of sacrificesRes.rows) {
      const rarityMultipliers = { E: 50, D: 100, C: 250, B: 500, A: 1000, S: 2000, UR: 5000 };
      const baseMultiplier = rarityMultipliers[sacrificeCard.classe] || 50;
      const statusSum = (sacrificeCard.vidastatus || 0) + (sacrificeCard.taistatus || 0) + (sacrificeCard.chakrastatus || 0);
      const levelBonus = (sacrificeCard.level || 1) * 100;
      
      totalXpGanha += baseMultiplier + Math.floor(statusSum * 0.5) + levelBonus;
    }

    // 4. Calcular Nível e XP com barra acumulada e resto
    let currentLevel = targetCard.level || 1;
    let currentXp = (targetCard.xp || 0) + totalXpGanha;
    let xpNeeded = currentLevel * 1000;

    while (currentXp >= xpNeeded) {
      currentXp -= xpNeeded;
      currentLevel += 1;
      xpNeeded = currentLevel * 1000;
    }

    // 5. Remover as cartas sacrificadas do inventário e da tabela cards
    await client.query(
      'DELETE FROM inventario WHERE id_card = ANY($1::int[]) AND id_user = $2',
      [sacrificeCardIds, userId]
    );
    await client.query(
      'DELETE FROM cards WHERE id_card = ANY($1::int[])',
      [sacrificeCardIds]
    );

    // 6. Atualizar a carta alvo com o novo nível e o XP restante
    await client.query(
      'UPDATE cards SET level = $1, xp = $2 WHERE id_card = $3',
      [currentLevel, currentXp, targetCardId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Feed concluído! Ganhaste ${totalXpGanha} XP no total.`,
      newLevel: currentLevel,
      newXp: currentXp,
      deletedIds: sacrificeCardIds
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao realizar feed em lote:', error);
    return res.status(500).json({ error: 'Erro interno ao processar o feed.' });
  } finally {
    client.release();
  }
});

module.exports = router;