const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');

// Configuração dos Banners com as classes reais da base de dados ('E', 'UR', etc.)
const BANNERS = {
  1: {
    name: "Portal Gennin (Iniciante)",
    cost1x: 200,
    cost10x: 1800,
    probabilities: { 'E': 0.70, 'UR': 0.30 }
  },
  2: {
    name: "Portal Chunnin (Equilibrado)",
    cost1x: 350,
    cost10x: 3200,
    probabilities: { 'E': 0.50, 'UR': 0.50 }
  },
  3: {
    name: "Portal Hokage (Lendário)",
    cost1x: 600,
    cost10x: 5500,
    probabilities: { 'E': 0.20, 'UR': 0.80 }
  }
};

// As imagens estao na BD em base64 (varios MB cada): nao se carregam para a memoria nem vao no JSON.
// O JSON leva o URL da rota de imagens (com cache do navegador). PUBLIC_API_URL e opcional.
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || 'https://npcardgame.onrender.com').replace(/\/$/, '');
const cardImageUrl = (idModel) => (idModel ? `${PUBLIC_API_URL}/api/pvp/card-image/${idModel}` : null);

function rollRarity(probabilities) {
  const rand = Math.random();
  let cumulative = 0;
  for (const [classe, prob] of Object.entries(probabilities)) {
    cumulative += prob;
    if (rand <= cumulative) return classe;
  }
  return 'E';
}

router.post('/gacha/pull', requireAuth, async (req, res) => {
  const { bannerId, times } = req.body;
  // O usário identificador de destino é o do token: nunca aceitamos "id_user" do corpo,
  // senão qualquer pessoa podia invocar em nome de outro jogador.
  const id_user = req.user.id;

  if (!bannerId || (times !== 1 && times !== 10)) {
    return res.status(400).json({ error: 'Dados inválidos para o sorteio.' });
  }

  const banner = BANNERS[bannerId];
  if (!banner) {
    return res.status(404).json({ error: 'Banner não encontrado.' });
  }

  const totalCost = times === 1 ? banner.cost1x : banner.cost10x;

  if (typeof totalCost !== 'number' || totalCost <= 0) {
    return res.status(400).json({ error: 'Configuração de banner inválida (custo). Contacte um administrador.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Dedução ATÓMICA do saldo: uma única query que valida saldo e gasta.
    //    Antes o saldo era lido e depois escrito como valor absoluto — dois pedidos
    //    concorrentes passavam ambos a validação (race condition) e podiam deduzir duas
    //    vezes ou deixar saldo negativo. "WHERE coins >= custo" fecha a porta.
    const spend = await client.query(
      'UPDATE users SET coins = coins - $1 WHERE id_user = $2 AND coins >= $3 RETURNING coins',
      [totalCost, id_user, totalCost]
    );

    if (spend.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Ryo insuficiente para realizar o sorteio!' });
    }

    // 2. Buscar modelos de cartas disponíveis
    const modelsResult = await client.query(`SELECT id_modelcard, name, vida, tai, nin, classe FROM cardmodel`);
    const allModels = modelsResult.rows;

    if (allModels.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Não existem cartas configuradas na base de dados.' });
    }

    const pulledCards = [];

    // 3. Executar o sorteio e realizar a inserção atómica
    for (let i = 0; i < times; i++) {
      const selectedClasse = rollRarity(banner.probabilities);

      let matchingCards = allModels.filter(m => (m.classe || 'E').toUpperCase() === selectedClasse.toUpperCase());
      if (matchingCards.length === 0) {
        matchingCards = allModels;
      }

      const randomCard = matchingCards[Math.floor(Math.random() * matchingCards.length)];

      // A. Inserir na tabela 'cards' vinculando ao id_cardmodel
      const cardInsert = await client.query(
        `INSERT INTO cards (id_user, id_cardmodel, name, vidastatus, taistatus, chakrastatus)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_card`,
        [
          id_user,
          randomCard.id_modelcard,
          randomCard.name,
          String(randomCard.vida),
          String(randomCard.tai),
          String(randomCard.nin)
        ]
      );

      const generatedIdCard = cardInsert.rows[0].id_card;

      // B. Inserir na tabela 'inventario' vinculando o id_user ao id_card
      await client.query(
        `INSERT INTO inventario (id_user, id_card) VALUES ($1, $2)`,
        [id_user, generatedIdCard]
      );

      pulledCards.push({
        name: randomCard.name,
        vida: randomCard.vida,
        tai: randomCard.tai,
        nin: randomCard.nin,
        image_url: cardImageUrl(randomCard.id_modelcard),
        classe: randomCard.classe || selectedClasse
      });
    }

    await client.query('COMMIT');

    res.json({
      message: 'Sorteio realizado com sucesso!',
      remainingCoins: spend.rows[0].coins,
      pulledCards
    });

  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro no processo de Gacha:', error);
    res.status(500).json({ error: 'Erro interno ao processar o sorteio.' });
  } finally {
    client.release();
  }
});

module.exports = router;
