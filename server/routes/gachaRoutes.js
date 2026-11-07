const express = require('express');
const crypto = require('crypto');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const {
  GACHABLE_CLASSES,
  BANNERS,
  RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS
} = require('../config/gachaConfig');
const { rollClass } = require('../config/gachaEngine');
const { rollStatRank, computeCardRank, computeStatValue } = require('../config/statRanks');

const router = express.Router();

// As imagens estao na BD em base64 (varios MB cada): nao se carregam para a memoria nem vao no JSON.
// O JSON leva o URL da rota de imagens (com cache do navegador). PUBLIC_API_URL e opcional.
const PUBLIC_API_URL = (process.env.PUBLIC_API_URL || 'https://npcardgame.onrender.com').replace(/\/$/, '');
const cardImageUrl = (idModel) => (idModel ? `${PUBLIC_API_URL}/api/pvp/card-image/${idModel}` : null);

// rand01 em [0,1) — mesma fonte probada na simulacao (scripts/simulateGacha.js).
const rand01 = () => crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;

// ---------------------------------------------------------------------------
// Rate limit (A3): 20 pedidos/minuto POR UTILIZADOR (e nao por IP).
// Em memoria: 1 pedido = 1 verificacao (x1 e x10 contam igual).
// ---------------------------------------------------------------------------
const rateBuckets = new Map();

function gcRateBuckets(now) {
  for (const [key, bucket] of rateBuckets) {
    if (now - bucket.start >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(key);
  }
}

function gachaRateLimiter(req, res, next) {
  const key = req.user.id;
  const now = Date.now();

  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start >= RATE_LIMIT_WINDOW_MS) {
    if (rateBuckets.size > 10_000) gcRateBuckets(now);
    bucket = { start: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;

  if (bucket.count > RATE_LIMIT_PER_MINUTE) {
    const retryAfterSec = Math.ceil((bucket.start + RATE_LIMIT_WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: `Muitos sorteios seguidos — espera ${retryAfterSec}s antes de voltar a puxar.`
    });
  }
  return next();
}

// ---------------------------------------------------------------------------
// Pools de cartas por classe, respeitando as restricoes do config.
// A garantia "UR nunca sai" e dupla: (1) a query so carrega GACHABLE_CLASSES,
// (2) rollClass do motor nunca devolve classes fora do config.
// ---------------------------------------------------------------------------
async function loadClassPools(client, banner) {
  // $1 -> ['R','SR','SSR']: classes autorizadas, vindo do config (nunca do pedido).
  const result = await client.query(
    `SELECT id_modelcard, name, vida, tai, nin, classe
       FROM cardmodel
      WHERE UPPER(TRIM(classe)) = ANY($1::text[])`,
    [GACHABLE_CLASSES]
  );

  const pools = new Map(); // classe -> [modelcard]
  for (const row of result.rows) {
    const classe = String(row.classe).toUpperCase().trim();
    const allowed = banner.pools[classe];
    // banner.pools[classe] === null -> todas as cartas da classe; senao, so os id_modelcard listados.
    if (allowed !== undefined && allowed !== null && !allowed.includes(row.id_modelcard)) continue;
    if (!pools.has(classe)) pools.set(classe, []);
    pools.get(classe).push(row);
  }
  return pools;
}

// Escolhe uma carta do pool com crypto.randomInt (nunca Math.random).
function pickCard(poolCards) {
  return poolCards[crypto.randomInt(0, poolCards.length)];
}

// ---------------------------------------------------------------------------
// POST /api/gacha/pull
// body: { bannerId: 1|2|3, times: 1|10 }
// Uma unica transacao por pedido: debito de diamantes + pity + cartas + log.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// GET /api/gacha/banners — transparência: taxas reais, custos em diamantes e
// progresso do pity do utilizador autenticado (por banner).
// ---------------------------------------------------------------------------
router.get('/gacha/banners', requireAuth, async (req, res) => {
  try {
    const pityRows = await pool.query(
      'SELECT banner_id, diamonds_since_ssr FROM gacha_pity WHERE id_user = $1',
      [req.user.id]
    );
    const pityByBanner = new Map(pityRows.rows.map((r) => [r.banner_id, r.diamonds_since_ssr]));

    const banners = Object.values(BANNERS).map((b) => ({
      id: b.id,
      name: b.name,
      cost1x: b.cost1x,
      cost10x: b.cost10x,
      probabilities: b.probabilities, // ex.: { R: 0.60, SR: 0.37, SSR: 0.03 }
      pity: {
        hardDiamonds: b.pity.hardDiamonds,
        softDiamonds: b.pity.softDiamonds || null,
        softRateStep: b.pity.softRateStep || null,
        hardRolls: Math.ceil(b.pity.hardDiamonds / b.cost1x),
        softRolls: b.pity.softDiamonds ? Math.ceil(b.pity.softDiamonds / b.cost1x) : null,
        diamondsSinceSsr: pityByBanner.get(b.id) || 0
      }
    }));

    res.json({ banners, gachableClasses: GACHABLE_CLASSES });
  } catch (error) {
    console.error('Erro ao ler configuração do gacha:', error);
    res.status(500).json({ error: 'Erro ao carregar os banners.' });
  }
});

router.post('/gacha/pull', requireAuth, gachaRateLimiter, async (req, res) => {
  const { bannerId, times } = req.body;
  const id_user = req.user.id;

  // Validacao ANTES de qualquer acesso a DB ou a config por chave dinamica
  // (bloqueia prototype pollution tipo bannerId="__proto__").
  if (!Number.isInteger(bannerId) || !Object.prototype.hasOwnProperty.call(BANNERS, bannerId)) {
    return res.status(400).json({ error: 'Banner inválido.' });
  }
  if (times !== 1 && times !== 10) {
    return res.status(400).json({ error: 'Sorteio inválido (tem de ser 1 ou 10 pulls).' });
  }

  const banner = BANNERS[bannerId];
  const totalCost = times === 1 ? banner.cost1x : banner.cost10x;
  const perRollCost = times === 1 ? banner.cost1x : banner.cost10x / 10; // inteiro (validado no arranque)

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Debito ATOMICO em diamantes: valida saldo e gasta numa unica query.
    //    Deixa "remainingCoins" intacto (moeda de Ryos nao e tocada pelo gacha).
    const spend = await client.query(
      'UPDATE users SET diamonds = diamonds - $1 WHERE id_user = $2 AND diamonds >= $3 RETURNING diamonds, coins',
      [totalCost, id_user, totalCost]
    );
    if (spend.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Diamantes insuficientes para realizar o sorteio!' });
    }

    // 2. Pity por (utilizador, banner): garante a linha e LOCKA-A ate ao commit.
    //    Contas novas/existentes ficam a 0 (default) — nada de dados antigos e tocado.
    const pityRow = await client.query(
      `INSERT INTO gacha_pity (id_user, banner_id, diamonds_since_ssr)
            VALUES ($1, $2, 0)
       ON CONFLICT (id_user, banner_id)
         DO UPDATE SET diamonds_since_ssr = gacha_pity.diamonds_since_ssr
       RETURNING diamonds_since_ssr`,
      [id_user, bannerId]
    );
    let pity = pityRow.rows[0].diamonds_since_ssr;

    // 3. Pools por classe (so classes autorizadas no config).
    const pools = await loadClassPools(client, banner);
    if (pools.size === 0) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Sem cartas elegiveis para o sorteio (config/BD inconsistentes).' });
    }
    const fallbackClasses = [...pools.keys()]; // para o caso improvavel de pool vazio de uma classe

    const pulledCards = [];
    let forcedSsrMissing = false;

    // 4. Rolls individuais, cada um com o pity aplicado (mesmo motor da simulacao).
    for (let i = 0; i < times; i++) {
      pity += perRollCost; // "diamantes gastos desde o ultimo SSR" inclui o gasto deste roll

      const { classe: selectedClass, forced } = rollClass({ banner, diamondsSinceSsr: pity, rand01 });

      let poolCards = pools.get(selectedClass);
      if (!poolCards || poolCards.length === 0) {
        if (forced) { forcedSsrMissing = true; break; } // pity duro sem pool de SSR = config/BD errada
        poolCards = pools.get(fallbackClasses[crypto.randomInt(0, fallbackClasses.length)]);
      }

      const card = pickCard(poolCards);

      // R1-C3: 3 ranks independentes por stat (servidor, crypto); valores finais e rank geral na mesma tx.
      const vidaRank = rollStatRank();
      const taiRank = rollStatRank();
      const ninRank = rollStatRank();
      const vidaValue = computeStatValue(card.vida, vidaRank.multiplier);
      const taiValue = computeStatValue(card.tai, taiRank.multiplier);
      const ninValue = computeStatValue(card.nin, ninRank.multiplier);
      const overallRank = computeCardRank([vidaRank.pos, taiRank.pos, ninRank.pos]);

      // A. Nova instancia de carta para o utilizador (valores finais + ranks; tx atómica).
      const cardInsert = await client.query(
        `INSERT INTO cards (
           id_user, id_cardmodel, name,
           vidastatus, taistatus, chakrastatus,
           vida_rank_pos, vida_rank_code, vida_rank_mult,
           tai_rank_pos, tai_rank_code, tai_rank_mult,
           nin_rank_pos, nin_rank_code, nin_rank_mult,
           stat_rank_pos, stat_rank_code, stat_rank_mult
         ) VALUES (
           $1, $2, $3,
           $4, $5, $6,
           $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15,
           $16, $17, $18
         ) RETURNING id_card`,
        [
          id_user, card.id_modelcard, card.name,
          String(vidaValue), String(taiValue), String(ninValue),
          vidaRank.pos, vidaRank.code, vidaRank.multiplier,
          taiRank.pos, taiRank.code, taiRank.multiplier,
          ninRank.pos, ninRank.code, ninRank.multiplier,
          overallRank.pos, overallRank.code, overallRank.multiplier
        ]
      );

      // B. Inventario.
      await client.query(
        'INSERT INTO inventario (id_user, id_card) VALUES ($1, $2)',
        [id_user, cardInsert.rows[0].id_card]
      );

      // C. Log de auditoria: 1 linha por carta puxada.
      await client.query(
        `INSERT INTO gacha_pulls
              (id_user, banner_id, times, cost, dropped_class, dropped_card_id, diamonds_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [id_user, bannerId, times, perRollCost, selectedClass, card.id_modelcard, pity]
      );

      pulledCards.push({
        name: card.name,
        // Valores finais da instância (retrocompatível: vida/tai/nin = finais, não molde)
        vida: vidaValue,
        tai: taiValue,
        nin: ninValue,
        image_url: cardImageUrl(card.id_modelcard),
        classe: selectedClass,
        statRanks: {
          vida: { pos: vidaRank.pos, code: vidaRank.code, mult: vidaRank.multiplier, value: vidaValue },
          tai: { pos: taiRank.pos, code: taiRank.code, mult: taiRank.multiplier, value: taiValue },
          nin: { pos: ninRank.pos, code: ninRank.code, mult: ninRank.multiplier, value: ninValue },
          overall: { pos: overallRank.pos, code: overallRank.code, mult: overallRank.multiplier }
        }
      });

      if (selectedClass === 'SSR') pity = 0; // pity reinicia ao sair SSR
    }

    if (forcedSsrMissing) {
      // ROLLBACK total: nada e cobrado, nada e entregue — sinaliza configuracao mal feita.
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Pity de SSR sem cartas SSR no pool (config/BD inconsistentes).' });
    }

    // 5. Guarda o contador final do pity (dias desde o ultimo SSR).
    await client.query(
      'UPDATE gacha_pity SET diamonds_since_ssr = $1 WHERE id_user = $2 AND banner_id = $3',
      [pity, id_user, bannerId]
    );

    await client.query('COMMIT');

    const final = spend.rows[0];
    return res.json({
      message: 'Sorteio realizado com sucesso!',
      remainingCoins: final.coins,                       // Ryos: inalterado (compatibilidade)
      remainingDiamonds: final.diamonds,                 // nova moeda do gacha
      pity: {
        bannerId,
        diamondsSinceSsr: pity,
        hardDiamonds: banner.pity.hardDiamonds,
        softDiamonds: banner.pity.softDiamonds || null
      },
      pulledCards
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Erro no processo de Gacha:', error);
    return res.status(500).json({ error: 'Erro interno ao processar o sorteio.' });
  } finally {
    client.release();
  }
});

module.exports = router;
