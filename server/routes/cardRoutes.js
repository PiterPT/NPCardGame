const express = require('express');
const router = express.Router();
const pool = require('../db'); // Ajusta o caminho de acordo com a tua estrutura (ex: db.js ou pool)

// ==========================================
// FÓRMULAS DE CÁLCULO (BACKEND REGRAS)
// ==========================================

// Função para calcular os Ryos obtidos ao vender a carta
function calculateSellRyos(card) {
  const rarityRyos = { E: 100, D: 250, C: 500, B: 1000, A: 2500, S: 5000, UR: 15000 };
  const baseRyos = rarityRyos[card.classe] || 100;
  const levelBonus = (card.level || 1) * 50;

  return baseRyos + levelBonus;
}

// Função para calcular o XP fornecido pela carta sacrificada
function calculateFeedXp(sacrificedCard) {
  const rarityMultipliers = { E: 50, D: 100, C: 250, B: 500, A: 1000, S: 2000, UR: 5000 };
  const baseMultiplier = rarityMultipliers[sacrificedCard.classe] || 50;
  
  // Soma dos status base da carta sacrificada
  const statusSum = (sacrificedCard.vida || 0) + (sacrificedCard.tai || 0) + (sacrificedCard.nin || 0);
  const levelBonus = (sacrificedCard.level || 1) * 100;

  return baseMultiplier + Math.floor(statusSum * 0.5) + levelBonus;
}

// ==========================================
// ROTAS DA API
// ==========================================

/**
 * @route   POST /api/cards/sell
 * @desc    Vende uma carta do utilizador e adiciona Ryos à conta dele
 */
router.post('/sell', async (req, res) => {
  const { userId, cardId } = req.body;

  if (!userId || !cardId) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios (userId ou cardId).' });
  }

  const client = await pool.connect();

  try {
    // Iniciar Transação SQL para garantir segurança nos dados
    await client.query('BEGIN');

    // 1. Validar se a carta pertence realmente a este utilizador
    const cardRes = await client.query(
      'SELECT * FROM cards WHERE id_card = $1 AND id_user = $2',
      [cardId, userId]
    );

    if (cardRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Carta não encontrada no teu inventário.' });
    }

    const card = cardRes.rows[0];
    const ryosGanhos = calculateSellRyos(card);

    // 2. Apagar a carta do inventário
    await client.query('DELETE FROM cards WHERE id_card = $1', [cardId]);

    // 3. Atualizar os Ryos do utilizador na tabela users
    await client.query(
      'UPDATE users SET ryos = COALESCE(ryos, 0) + $1 WHERE id_user = $2',
      [ryosGanhos, userId]
    );

    // Confirmar Transação
    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `Carta ${card.name} vendida com sucesso por ${ryosGanhos} Ryos!`,
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
 * @desc    Sacrifica uma carta para dar XP e subir o nível de outra carta
 */
router.post('/feed', async (req, res) => {
  const { userId, targetCardId, sacrificeCardId } = req.body;

  if (!userId || !targetCardId || !sacrificeCardId) {
    return res.status(400).json({ error: 'Faltam dados obrigatórios para o feed.' });
  }

  if (targetCardId === sacrificeCardId) {
    return res.status(400).json({ error: 'Uma carta não se pode alimentar a si própria.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Procurar a carta alvo (que vai subir de nível)
    const targetRes = await client.query(
      'SELECT * FROM cards WHERE id_card = $1 AND id_user = $2',
      [targetCardId, userId]
    );

    // 2. Procurar a carta sacrificada
    const sacrificeRes = await client.query(
      'SELECT * FROM cards WHERE id_card = $1 AND id_user = $2',
      [sacrificeCardId, userId]
    );

    if (targetRes.rows.length === 0 || sacrificeRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Uma ou ambas as cartas não foram encontradas no teu inventário.' });
    }

    const targetCard = targetRes.rows[0];
    const sacrificeCard = sacrificeRes.rows[0];

    // 3. Calcular quanto XP a carta sacrificada fornece
    const xpGanho = calculateFeedXp(sacrificeCard);

    // 4. Lógica de Level Up da Carta Alvo com retenção de excedente (resto de XP)
    let currentLevel = targetCard.level || 1;
    let currentXp = (targetCard.xp || 0) + xpGanho;
    let xpNeeded = currentLevel * 1000; // Regra de XP necessário por nível

    while (currentXp >= xpNeeded) {
      currentXp -= xpNeeded;
      currentLevel += 1;
      xpNeeded = currentLevel * 1000;
    }

    // 5. Eliminar a carta sacrificada
    await client.query('DELETE FROM cards WHERE id_card = $1', [sacrificeCardId]);

    // 6. Atualizar a carta alvo com o novo nível e XP acumulado
    await client.query(
      'UPDATE cards SET level = $1, xp = $2 WHERE id_card = $3',
      [currentLevel, currentXp, targetCardId]
    );

    await client.query('COMMIT');

    return res.json({
      success: true,
      message: `${targetCard.name} recebeu ${xpGanho} XP e ${sacrificeCard.name} foi consumida!`,
      xpGanho,
      newLevel: currentLevel,
      newXp: currentXp
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao realizar feed:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar o feed da carta.' });
  } finally {
    client.release();
  }
});

module.exports = router;