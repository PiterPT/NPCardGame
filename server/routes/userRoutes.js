const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requireSelf } = require('../middleware/auth');

// As imagens das cartas são servidas via endpoint /api/pvp/card-image/:id (B2/backblaze).
// O JSON leva o URL da rota de imagens (com cache do navegador). PUBLIC_API_URL e opcional.
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
      'SELECT id_user, name, email, coins, diamonds FROM users WHERE id_user = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Shinobi não encontrado.' });
    }

    const user = userResult.rows[0];

    // 2. Buscar inventário fazendo JOIN entre inventario -> cards -> cardmodel
    // R1-C4: inclui ranks/mults/geral da instância (valores efetivos + ranks; retrocompatível).
    const cardsResult = await pool.query(
      `SELECT c.id_card,
              c.name,
              c.vidastatus as vida,
              c.taistatus as tai,
              c.chakrastatus as nin,
              c.level,
              c.xp,
              c.id_cardmodel,
              c.vida_rank_pos, c.vida_rank_code, c.vida_rank_mult,
              c.tai_rank_pos, c.tai_rank_code, c.tai_rank_mult,
              c.nin_rank_pos, c.nin_rank_code, c.nin_rank_mult,
              c.stat_rank_pos, c.stat_rank_code, c.stat_rank_mult,
              cm.classe
       FROM inventario i
       JOIN cards c ON i.id_card = c.id_card
       LEFT JOIN cardmodel cm ON c.id_cardmodel = cm.id_modelcard
       WHERE i.id_user = $1`,
      [userId]
    );

    const toInt = (v, fb = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fb; };
    const num = (v, fb) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };

    res.json({
      id_user: user.id_user,
      name: user.name,
      email: user.email,
      coins: user.coins,
      diamonds: user.diamonds ?? 0,
      cards: cardsResult.rows.map(({ id_cardmodel, ...card }) => {
        const vida = toInt(card.vida);
        const tai = toInt(card.tai);
        const nin = toInt(card.nin);
        return {
          ...card,
          vida,
          tai,
          nin,
          image_url: cardImageUrl(id_cardmodel),
          statRanks: {
            vida: { pos: card.vida_rank_pos ?? 6, code: card.vida_rank_code ?? 'D+', mult: num(card.vida_rank_mult, 1.0), value: vida },
            tai: { pos: card.tai_rank_pos ?? 6, code: card.tai_rank_code ?? 'D+', mult: num(card.tai_rank_mult, 1.0), value: tai },
            nin: { pos: card.nin_rank_pos ?? 6, code: card.nin_rank_code ?? 'D+', mult: num(card.nin_rank_mult, 1.0), value: nin },
            overall: { pos: card.stat_rank_pos ?? 6, code: card.stat_rank_code ?? 'D+', mult: num(card.stat_rank_mult, 1.0) }
          }
        };
      })
    });

  } catch (error) {
    console.error('Erro ao procurar perfil do Shinobi:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao carregar perfil.' });
  }
});

module.exports = router;
