// ============================================================================
// CONFIGURAÇÃO CENTRAL DO GACHA — única fonte de verdade.
// A lógica do sorteio (server/routes/gachaRoutes.js) NÃO pode ter taxas nem
// limiares espalhados: tudo vem daqui. Alterar economia = alterar SÓ este ficheiro.
//
// DECISÕES APROVADAS (PLANO_CORRECAO.md):
//  - UR nunca sai do gacha (obtém-se só por evolução) — bloqueado em duas camadas
//    (validação do config + filtragem da query em gachaRoutes).
//  - Classe E fora: não existem cartas E na coleção. O sorteio é R / SR / SSR.
//  - O roll é pago em DIAMANTES (nova moeda; coluna users.diamonds, default 0).
//  - Pity contado em DIAMANTES gastos desde o último SSR, por banner e por
//    utilizador; reinicia ao sair SSR.
//  - Economia de venda (A2) entra em fase própria (F5), a partir de SELL_PRICES.
// ============================================================================

// Classes que o gacha PODE devolver. Qualquer outra (UR, E, D, C, B, A, S) é
// inatingível pelo sorteio — mesmo que existam na tabela cardmodel.
// (D/C/B/A/S mantêm-se ativas para venda/feed por A4; não são apagadas de lado nenhum.)
const GACHABLE_CLASSES = ['R', 'SR', 'SSR'];

// Classe final do jogo — nunca sai do gacha nem entra em pool de qualquer banner.
const FORBIDDEN_GACHA_CLASSES = ['UR'];

// Tabela de venda em Ryos (A2 — aprovada; aplicada ao SELL_RYOS do cardRoutes na F5).
// NOTA: venda dá sempre RYOS, nunca diamantes (diamantes só entram, não saem em venda).
const SELL_PRICES = {
  E: 100, D: 250, C: 500, B: 1000, A: 2500, S: 5000,   // classes antigas: inalteradas (A4)
  R: 120, SR: 220, SSR: 600, UR: 1500                  // SR 250 → 220 (ajuste F2, opç. 3)
};

// BANNERS — custos em DIAMANTES por roll. A progressão relativa dos custos é a
// mesma que tinham os custos em Ryos (200/350/600, desconto ~10% no x10).
// Conversão de pity (diamantes -> rolls, usando o custo/roll):
//   B1: 9000/200 = 45 rolls (1x) · 9000/180 = 50 rolls (x10)   [ajuste F2, opç. 3]
//   B2: soft 4800/350 ≈ 14 (1x) · 4800/320 = 15 (x10) · hard 9600 → ~27–30 rolls
//   B3: 8250/600 ≈ 14 (1x) · 8250/550 = 15 (x10)
const BANNERS = {
  1: {
    id: 1,
    name: 'Festival Standard',
    cost1x: 200,   // diamantes por roll individual
    cost10x: 1800, // diamantes por 10 pulls (180/roll)
    probabilities: { R: 0.60, SR: 0.37, SSR: 0.03 },  // soma = 1.0
    pity: {
      hardDiamonds: 9000
      // sem soft pity neste banner — ajuste F2 (opção 3): 3000 → 9000 para fechar
      // a arbitragem do x10 (sim: EV 1x 87.9% · x10 97.3% do custo).
    },
    // pools de cartas: null = todas as cartas ativas (cardmodel) da classe.
    // Ex.: SSR: [12, 18] restringe a estas id_modelcard (configuração opcional,
    // para quando se quiser um pool de banner próprio em vez de todas as cartas da classe).
    pools: { R: null, SR: null, SSR: null }
  },
  2: {
    id: 2,
    name: 'Ultra Festival (Aniversário)',
    cost1x: 350,
    cost10x: 3200, // 320/roll
    probabilities: { R: 0.60, SR: 0.36, SSR: 0.04 },
    pity: {
      softDiamonds: 4800,  // a partir daqui, taxa SSR sobe softRateStep por roll
      softRateStep: 0.004, // +0,4% por roll (acumulativo)
      hardDiamonds: 9600   // SSR garantido
    },
    pools: { R: null, SR: null, SSR: null }
  },
  3: {
    id: 3,
    name: 'Iniciantes',
    cost1x: 600,
    cost10x: 5500, // 550/roll
    probabilities: { R: 0.55, SR: 0.42, SSR: 0.03 },
    pity: {
      hardDiamonds: 8250
    },
    pools: { R: null, SR: null, SSR: null }
  }
};

// Índice das classes mais raras: usadas nas garantias de pity ("SSR ou melhor").
// Como UR está fora do gacha, "melhor" = SSR. Se um dia a evolução devolver a UR
// ao pool do gacha (não é o caso atual), basta trocar esta lista aqui.
const PITY_TOP_CLASSES = ['SSR'];

// Rate limit do gacha (A3): 20 pedidos/minuto por UTILIZADOR (não por IP).
const RATE_LIMIT_PER_MINUTE = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

// ============================================================================
// VALIDAÇÃO (executada no arranque do servidor — index.js).
// Lança erro se a config estiver inválida: é melhor apanhar em 2 segundos
// do que descobrir por probabilidades degeneradas em produção.
// ============================================================================
function validateGachaConfig() {
  for (const [id, banner] of Object.entries(BANNERS)) {
    const probs = banner.probabilities;

    // 1. Soma das taxas = 1.0 (±1e-9)
    const sum = Object.values(probs).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 1e-9) {
      throw new Error(`GACHA: banner ${id} (${banner.name}) tem taxas que somam ${sum} — deve somar 1.0.`);
    }

    // 2. Nenhuma classe proibida (UR/E/antigas) pode existir nesta config
    for (const classe of Object.keys(probs)) {
      if (!GACHABLE_CLASSES.includes(classe)) {
        throw new Error(`GACHA: banner ${id} tem classe '${classe}' fora do pool autorizado (GACHABLE_CLASSES).`);
      }
      if (FORBIDDEN_GACHA_CLASSES.includes(classe.toUpperCase())) {
        throw new Error(`GACHA: banner ${id} — classe proibida '${classe}' no sorteio.`);
      }
    }

    // 3. Taxas em valores válidos
    for (const [classe, prob] of Object.entries(probs)) {
      if (typeof prob !== 'number' || !Number.isFinite(prob) || prob <= 0 || prob > 1) {
        throw new Error(`GACHA: banner ${id} — taxa da classe '${classe}' inválida (${prob}).`);
      }
    }

    // 4. Pity coerente
    if (!banner.pity || !Number.isFinite(banner.pity.hardDiamonds) || banner.pity.hardDiamonds <= 0) {
      throw new Error(`GACHA: banner ${id} — pity.hardDiamonds em falta ou inválido.`);
    }
    if (banner.pity.softDiamonds !== undefined) {
      if (banner.pity.softDiamonds <= 0 || banner.pity.softDiamonds >= banner.pity.hardDiamonds) {
        throw new Error(`GACHA: banner ${id} — softDiamonds deve estar entre 0 e hardDiamonds.`);
      }
      if (!(banner.pity.softRateStep > 0) || banner.pity.softRateStep >= 1) {
        throw new Error(`GACHA: banner ${id} — softRateStep inválido.`);
      }
    }

    // 5. Custos coerentes e com desconto no x10 (nunca mais caro que 10x o 1x)
    if (!(banner.cost1x > 0) || !(banner.cost10x > 0)) {
      throw new Error(`GACHA: banner ${id} — custos de diamantes inválidos.`);
    }
    if (banner.cost10x > banner.cost1x * 10) {
      throw new Error(`GACHA: banner ${id} — x10 não pode custar mais que 10 rolls individuais.`);
    }
    // O contador de pity em diamantes precisa de custo por roll inteiro no x10,
    // senão acumula frações (a BD guarda INTEGER).
    if (banner.cost10x % 10 !== 0) {
      throw new Error(`GACHA: banner ${id} — cost10x deve ser divisível por 10 (custo/roll inteiro para o pity).`);
    }
  }
  return true;
}

module.exports = {
  GACHABLE_CLASSES,
  FORBIDDEN_GACHA_CLASSES,
  PITY_TOP_CLASSES,
  SELL_PRICES,
  BANNERS,
  RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  validateGachaConfig
};
