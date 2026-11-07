// ============================================================================
// MOTOR DE SORTEIO DO GACHA (puro, sem BD, sem servidor).
// Usado por: server/routes/gachaRoutes.js (F3) e server/scripts/simulateGacha.js (F2).
// Regras que descreve — ÚNICA implementação autorizada:
//   1. UR nunca sai (GACHABLE_CLASSES no config; nada aqui devolve UR).
//   2. Pity duro: diamonds_since_ssr >= hardDiamonds => SSR garantido (forced).
//   3. Pity suave (banner 2): a partir de softDiamonds, taxa de SSR sobe
//      softRateStep por "roll equivalente" (1x cost) — ver nota abaixo.
//   4. O roll é pago em DIAMANTES; quem contabiliza é quem chama (rota/script).
//
// NOTA sobre pity suave em diamantes: a tabela de pity guarda DIAMANTES desde o
// último SSR. Como os rolls podem vir em x10 (custo/roll diferente), a conversão
// para "número de rolls" usa banner.cost1x como divisor canónico — diferenças de
// ±1 roll face à contagem exata são aceitáveis e documentadas.
// ============================================================================

const EPS = 1e-9;

/** Taxa efetiva de SSR depois do pity suave (sem mutar a config). */
function effectiveSsrRate(banner, diamondsSinceSsr) {
  let ssrRate = banner.probabilities.SSR;
  const pity = banner.pity || {};
  if (pity.softDiamonds !== undefined && diamondsSinceSsr >= pity.softDiamonds) {
    const extraRolls = 1 + Math.floor((diamondsSinceSsr - pity.softDiamonds) / banner.cost1x);
    ssrRate = Math.min(1, ssrRate + pity.softRateStep * extraRolls);
  }
  return ssrRate;
}

/**
 * Realiza UM roll de raridade.
 * @param {object}  opts
 * @param {object}  opts.banner           objeto de BANNERS (gachaConfig).
 * @param {number}  opts.diamondsSinceSsr diamantes gastos desde o último SSR (pity).
 * @param {function} opts.rand01          função [0,1) — crypto.randomInt no servidor.
 * @returns {{ classe: 'R'|'SR'|'SSR', forced: boolean, ssrRate: number }}
 */
function rollClass({ banner, diamondsSinceSsr, rand01 }) {
  const pity = banner.pity || {};

  // Pity duro: SSR garantido.
  if (diamondsSinceSsr >= pity.hardDiamonds) {
    return { classe: 'SSR', forced: true, ssrRate: 1 };
  }

  // Pity suave: SSR cresce e o resto redistribui PROPORTIONALMENTE (mantém soma 1).
  const ssrRate = effectiveSsrRate(banner, diamondsSinceSsr);
  const restTotal = banner.probabilities.R + banner.probabilities.SR;
  const srRate = restTotal > EPS ? (banner.probabilities.SR / restTotal) * (1 - ssrRate) : 0;
  const rRate = (1 - ssrRate) - srRate;

  const roll = rand01();
  if (roll < ssrRate - EPS) return { classe: 'SSR', forced: false, ssrRate };
  if (roll < ssrRate + srRate - EPS) return { classe: 'SR', forced: false, ssrRate };
  return { classe: 'R', forced: false, ssrRate };
}

module.exports = { rollClass, effectiveSsrRate };
