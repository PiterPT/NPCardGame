const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requireSelf } = require('../middleware/auth');

// As imagens das cartas estao na BD em base64 (varios MB cada). Nunca vao dentro do JSON:
// o JSON leva o URL da rota de imagens (com cache do navegador). PUBLIC_API_URL e opcional.
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || 'https://npcardgame.onrender.com').replace(/\/$/, '');
const cardImageUrl = (idModel) => (idModel ? `${PUBLIC_API_URL}/api/pvp/card-image/${idModel}` : null);

// GET /api/user/:id/profile - Obtém Perfil e Inventário com JOIN completo
// Exigia antes apenas o id na URL (qualquer um via perfil dos outros): agora o id tem
// de ser igual ao do token e o perfil usa-o do token, nunca do parâmetro em si.
router.get('/user/:id/profile', requireAuth, requireSelf('id'), async (req, res) => {
  const userId = req.user.id;

  try {
    // 1. Buscar os dados do utilizador
    const userResult = await pool.query(
      'SELECT id_user, name, email, coins FROM users WHERE id_user = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shinobi não encontrado.' });
    }

    const user = userResult.rows[0];

    // 2. Buscar inventário fazendo JOIN entre inventario -> cards -> cardmodel
    const cardsResult = await pool.query(
      `SELECT c.id_card,
              c.name,
              c.vidastatus as vida,
              c.taistatus as tai,
              c.chakrastatus as nin,
              c.level,
              c.xp,
              c.id_cardmodel,
              cm.classe
       FROM inventario i
       JOIN cards c ON i.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE i.id_user = $1`,
      [userId]
    );

    res.json({
      id_user: user.id_user,
      name: user.name,
      email: user.email,
      coins: user.coins,
      cards: cardsResult.rows.map(({ id_cardmodel, ...card }) => ({
        ...card,
        image_url: cardImageUrl(id_cardmodel)
      }))
    });

  } catch (error) {
    console.error('Erro ao procurar perfil do Shinobi:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao carregar perfil.' });
  }
});

module.exports = router;
