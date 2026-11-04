const express = require('express');
const router = express.Router();
const pool = require('../index'); // Pool do PostgreSQL

// ==========================================
// 1. EQUIPA DE DEFESA DO JOGADOR
// ==========================================

// Guardar/Atualizar equipa de defesa (máx 5 cartas)
router.post('/pvp/defense', async (req, res) => {
  const { userId, cardIds } = req.body;
  if (!userId || !cardIds || !Array.isArray(cardIds)) {
    return res.status(400).json({ error: 'Dados inválidos.' });
  }

  if (cardIds.length > 5) {
    return res.status(400).json({ error: 'A equipa de defesa pode ter no máximo 5 cartas.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Remove a defesa anterior
    await client.query('DELETE FROM pvp_defense WHERE id_user = $1', [userId]);

    // Insere as novas cartas de defesa
    for (const cardId of cardIds) {
      await client.query(
        'INSERT INTO pvp_defense (id_user, id_card) VALUES ($1, $2)',
        [userId, cardId]
      );
    }

    await client.query('COMMIT');
    client.release();
    res.json({ success: true, message: 'Equipa de defesa atualizada com sucesso!' });
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    console.error('Erro ao guardar defesa:', err);
    res.status(500).json({ error: 'Erro interno ao guardar equipa de defesa.' });
  }
});

// Obter equipa de defesa e ranking do utilizador
router.get('/pvp/user/:id', async (req, res) => {
  const userId = req.params.id;
  try {
    const rankRes = await pool.query('SELECT rank, points FROM pvp_ranking WHERE id_user = $1', [userId]);
    const defenseRes = await pool.query(
      `SELECT c.*, cm.image_url, cm.classe FROM pvp_defense d
       JOIN cards c ON d.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE d.id_user = $1`,
      [userId]
    );

    let rankData = rankRes.rows[0];
    if (!rankData) {
      // Se não estiver no ranking, insere com pontuação inicial
      const insertRank = await pool.query(
        'INSERT INTO pvp_ranking (id_user, points, rank) VALUES ($1, 1000, 999) RETURNING rank, points',
        [userId]
      );
      rankData = insertRank.rows[0];
    }

    res.json({
      rank: rankData.rank,
      points: rankData.points,
      defenseCards: defenseRes.rows
    });
  } catch (err) {
    console.error('Erro ao buscar dados pvp:', err);
    res.status(500).json({ error: 'Erro ao carregar dados de PvP.' });
  }
});

// ==========================================
// 2. RANKING E TOP 5
// ==========================================

// GET /api/pvp/ranking
router.get('/pvp/ranking', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(r.rank, 999) as rank, COALESCE(r.points, 1000) as points, u.id_user, u.name 
       FROM users u
       LEFT JOIN pvp_ranking r ON u.id_user = r.id_user
       ORDER BY COALESCE(r.points, 1000) DESC LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao buscar ranking:', err);
    res.status(500).json({ error: 'Erro ao carregar ranking.' });
  }
});

// ==========================================
// 3. COMBATE PVP (Desafiar o oponente acima)
// ==========================================

router.post('/pvp/battle', async (req, res) => {
  const { attackerId, defenderId, attackerCardIds } = req.body;

  if (!attackerId || !defenderId || !attackerCardIds || attackerCardIds.length === 0) {
    return res.status(400).json({ error: 'Dados de combate incompletos.' });
  }

  const client = await pool.connect();
  try {
    // 1. Buscar status das cartas do atacante
    const attackerCardsRes = await client.query(
      `SELECT * FROM cards WHERE id_card = ANY($1::int[])`,
      [attackerCardIds]
    );
    const attackerCards = attackerCardsRes.rows;

    // 2. Buscar cartas de defesa do oponente
    const defenderCardsRes = await client.query(
      `SELECT c.* FROM pvp_defense d
       JOIN cards c ON d.id_card = c.id_card
       WHERE d.id_user = $1`,
      [defenderId]
    );
    let defenderCards = defenderCardsRes.rows;

    // Se o defensor não tiver equipa de defesa montada, gera cartas automáticas base
    if (defenderCards.length === 0) {
      defenderCards = [{ name: 'Ninja Renegado', vidastatus: 800, taistatus: 100, chakrastatus: 100 }];
    }

    // 3. Cálculo de Poder Total baseado nos Status (Vida + Taijutsu + Ninjutsu)
    const calculatePower = (cards) => {
      return cards.reduce((acc, c) => {
        return acc + (parseInt(c.vidastatus || c.vida || 500) + parseInt(c.taistatus || c.tai || 50) + parseInt(c.chakrastatus || c.nin || 50));
      }, 0);
    };

    const attackerPower = calculatePower(attackerCards);
    const defenderPower = calculatePower(defenderCards);

    // Simulação de combate com base nos status reais
    const playerWins = attackerPower >= defenderPower;

    if (playerWins) {
      // Trocar de posição no ranking se aplicável
      res.json({ success: true, winner: 'attacker', message: 'Vitória gloriosa na Arena! Subiste no ranking.' });
    } else {
      res.json({ success: true, winner: 'defender', message: 'Foste derrotado pelo oponente!' });
    }
  } catch (err) {
    console.error('Erro na batalha PvP:', err);
    res.status(500).json({ error: 'Erro ao processar batalha PvP.' });
  }
});

// ==========================================
// 4. MODO INFINITO (Farm de Ryos e Ondeando Inimigos)
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