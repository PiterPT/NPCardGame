'use strict';

const crypto = require('crypto');

/**
 * Sistema de ranks de estatísticas (statRank) — fonte única.
 * 25 ranks, pos 0 (F) → 24 (SSS+). Pesos inteiros, unidade 0,00001%.
 * Sorteio: crypto.randomInt(0, TOTAL_WEIGHT) no servidor. Nunca no cliente.
 *
 * Multiplicadores: seguem a **curva balanceada aprovada (R1-BAL-1)**, divergindo da
 * tabela original `.opencode/sistema_de_ranks_e_multiplicadores (1).md`. Pesos, posições,
 * códigos, nomes, dropPercent e total 10.000.000 (D+ +209, B2) mantêm-se intactos.
 * Âmbito R1-BAL-1: aplica-se apenas a rolagens futuras (sem migração/recálculo de cartas existentes).
 *
 * Nomenclatura: statRank/statRanks. NUNCA "rarity" para isto (raridade R/SR/SSR/UR é outra coisa).
 */

// Nomes canónicos das 3 stats numéricas e mapeamento para colunas da instância (tabela cards)
const STATS = Object.freeze(['vida', 'tai', 'nin']);
const STAT_INSTANCE_KEYS = Object.freeze({
  vida: 'vidastatus',
  tai: 'taistatus',
  nin: 'chakrastatus',
});

// 25 ranks: pos 0-24 (F → SSS+). Pesos finais (B2): D+ ajustado +209, total 10.000.000.
// Multiplicadores: curva balanceada aprovada R1-BAL-1 (diverge da tabela .md original).
const STAT_RANKS = Object.freeze([
  Object.freeze({ pos: 0,  code: 'F',    name: 'Maligno / Maldito',         rarityLabel: 'Maligno / Maldito',         dropPercent: 0.01,     weight: 1000,    multiplier: 0.70 }),
  Object.freeze({ pos: 1,  code: 'E-',   name: 'Péssimo',                   rarityLabel: 'Péssimo',                   dropPercent: 0.1,      weight: 10000,   multiplier: 0.75 }),
  Object.freeze({ pos: 2,  code: 'E',    name: 'Muito Fraquejado',          rarityLabel: 'Muito Fraquejado',          dropPercent: 0.5,      weight: 50000,   multiplier: 0.80 }),
  Object.freeze({ pos: 3,  code: 'E+',   name: 'Fraquejado',                rarityLabel: 'Fraquejado',                dropPercent: 2.0,      weight: 200000,  multiplier: 0.85 }),
  Object.freeze({ pos: 4,  code: 'D-',   name: 'Deficiente',                rarityLabel: 'Deficiente',                dropPercent: 5.0,      weight: 500000,  multiplier: 0.90 }),
  Object.freeze({ pos: 5,  code: 'D',    name: 'Sub-comum',                 rarityLabel: 'Sub-comum',                 dropPercent: 15.0,     weight: 1500000, multiplier: 0.95 }),
  Object.freeze({ pos: 6,  code: 'D+',   name: 'Comum / Padrão',            rarityLabel: 'Comum / Padrão',            dropPercent: 40.0,     weight: 4000209, multiplier: 1.00 }), // B2: +209
  Object.freeze({ pos: 7,  code: 'C-',   name: 'Incomum -',                 rarityLabel: 'Incomum -',                 dropPercent: 15.0,     weight: 1500000, multiplier: 1.05 }),
  Object.freeze({ pos: 8,  code: 'C',    name: 'Incomum',                   rarityLabel: 'Incomum',                   dropPercent: 10.0,     weight: 1000000, multiplier: 1.10 }),
  Object.freeze({ pos: 9,  code: 'C+',   name: 'Incomum +',                 rarityLabel: 'Incomum +',                 dropPercent: 5.0,      weight: 500000,  multiplier: 1.15 }),
  Object.freeze({ pos: 10, code: 'B-',   name: 'Raro -',                    rarityLabel: 'Raro -',                    dropPercent: 3.0,      weight: 300000,  multiplier: 1.20 }),
  Object.freeze({ pos: 11, code: 'B',    name: 'Raro',                      rarityLabel: 'Raro',                      dropPercent: 2.0,      weight: 200000,  multiplier: 1.28 }),
  Object.freeze({ pos: 12, code: 'B+',   name: 'Raro +',                    rarityLabel: 'Raro +',                    dropPercent: 1.0,      weight: 100000,  multiplier: 1.36 }),
  Object.freeze({ pos: 13, code: 'A-',   name: 'Épico -',                   rarityLabel: 'Épico -',                   dropPercent: 0.6,      weight: 60000,   multiplier: 1.45 }),
  Object.freeze({ pos: 14, code: 'A',    name: 'Épico',                     rarityLabel: 'Épico',                     dropPercent: 0.4,      weight: 40000,   multiplier: 1.55 }),
  Object.freeze({ pos: 15, code: 'A+',   name: 'Épico +',                   rarityLabel: 'Épico +',                   dropPercent: 0.2,      weight: 20000,   multiplier: 1.65 }),
  Object.freeze({ pos: 16, code: 'S-',   name: 'Lendário -',                rarityLabel: 'Lendário -',                dropPercent: 0.1,      weight: 10000,   multiplier: 1.80 }),
  Object.freeze({ pos: 17, code: 'S',    name: 'Lendário',                  rarityLabel: 'Lendário',                  dropPercent: 0.05,     weight: 5000,    multiplier: 1.95 }),
  Object.freeze({ pos: 18, code: 'S+',   name: 'Lendário +',                rarityLabel: 'Lendário +',                dropPercent: 0.02,     weight: 2000,    multiplier: 2.10 }),
  Object.freeze({ pos: 19, code: 'SS-',  name: 'Mítico -',                  rarityLabel: 'Mítico -',                  dropPercent: 0.01,     weight: 1000,    multiplier: 2.30 }),
  Object.freeze({ pos: 20, code: 'SS',   name: 'Mítico',                    rarityLabel: 'Mítico',                    dropPercent: 0.005,    weight: 500,     multiplier: 2.55 }),
  Object.freeze({ pos: 21, code: 'SS+',  name: 'Mítico +',                  rarityLabel: 'Mítico +',                  dropPercent: 0.002,    weight: 200,     multiplier: 2.85 }),
  Object.freeze({ pos: 22, code: 'SSS-', name: 'Transcendental',            rarityLabel: 'Transcendental',            dropPercent: 0.0008,   weight: 80,      multiplier: 3.20 }),
  Object.freeze({ pos: 23, code: 'SSS',  name: 'Divino',                    rarityLabel: 'Divino',                    dropPercent: 0.0001,   weight: 10,      multiplier: 3.60 }),
  Object.freeze({ pos: 24, code: 'SSS+', name: 'Absoluto / Singularidade',  rarityLabel: 'Absoluto / Singularidade',  dropPercent: 0.00001,  weight: 1,       multiplier: 4.00 }),
]);

const TOTAL_WEIGHT = 10000000;
const SSS_MULTIPLIER = 4.0; // R1-BAL-1 (curva balanceada; tabela .md original: 100.0)

// Pesos cumulativos (pré-computados) para roll O(n) com n=25 (trivial).
const CUMULATIVE_WEIGHTS = (() => {
  const out = [];
  let acc = 0;
  for (const r of STAT_RANKS) {
    acc += r.weight;
    out.push(acc);
  }
  return out;
})();

// Validação em load: soma dos pesos tem de ser exatamente TOTAL_WEIGHT.
(function validateOnLoad() {
  const sum = STAT_RANKS.reduce((s, r) => s + r.weight, 0);
  if (sum !== TOTAL_WEIGHT) {
    throw new Error(`[statRanks] Soma dos pesos inválida: ${sum} !== ${TOTAL_WEIGHT}`);
  }
  if (STAT_RANKS.length !== 25) {
    throw new Error(`[statRanks] Esperados 25 ranks, obtidos ${STAT_RANKS.length}`);
  }
  if (CUMULATIVE_WEIGHTS[CUMULATIVE_WEIGHTS.length - 1] !== TOTAL_WEIGHT) {
    throw new Error('[statRanks] Peso cumulativo final incoerente.');
  }
})();

function getRankByPos(pos) {
  const p = Math.max(0, Math.min(24, Math.trunc(Number(pos))));
  return STAT_RANKS[p] || STAT_RANKS[6];
}

function getRankByCode(code) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  return STAT_RANKS.find((r) => r.code.toUpperCase() === c) || null;
}

/**
 * Sorteia um rank por estatística (servidor apenas).
 * @param {function(number, number): number} [randInt=crypto.randomInt] - retorna inteiro em [min, max)
 * @returns {{ pos: number, code: string, multiplier: number, weight: number }}
 */
function rollStatRank(randInt = crypto.randomInt) {
  const n = randInt(0, TOTAL_WEIGHT); // 0 <= n < TOTAL_WEIGHT
  for (let i = 0; i < CUMULATIVE_WEIGHTS.length; i++) {
    if (n < CUMULATIVE_WEIGHTS[i]) {
      const r = STAT_RANKS[i];
      return { pos: r.pos, code: r.code, multiplier: r.multiplier, weight: r.weight };
    }
  }
  // fallback defensivo (nunca deve ocorrer)
  const r = STAT_RANKS[STAT_RANKS.length - 1];
  return { pos: r.pos, code: r.code, multiplier: r.multiplier, weight: r.weight };
}

/**
 * Rank geral da carta = média das POSIÇÕES das stats, Math.round (half-up para positivos), clamp 0-24.
 * B8: média das posições, NÃO dos multiplicadores. Pura/testável.
 * @param {number[]} statPositions - posições (0-24), tipicamente 3 (vida,tai,nin)
 * @returns {{ pos: number, code: string, name: string, rarityLabel: string, dropPercent: number, weight: number, multiplier: number }}
 */
function computeCardRank(statPositions) {
  const arr = Array.isArray(statPositions) ? statPositions : [];
  if (arr.length === 0) return getRankByPos(6);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += Math.max(0, Math.min(24, Number(arr[i])));
  }
  const mean = sum / arr.length;
  const rounded = Math.round(mean); // half-up para valores positivos
  const pos = Math.max(0, Math.min(24, rounded));
  return getRankByPos(pos);
}

/**
 * Valor final de uma stat = round(base * multiplicador), mínimo 1.
 */
function computeStatValue(base, multiplier) {
  const b = Number(base);
  const m = Number(multiplier);
  const v = Math.round(b * m);
  return Math.max(1, Number.isFinite(v) ? v : 1);
}

module.exports = {
  STAT_RANKS,
  STATS,
  STAT_INSTANCE_KEYS,
  TOTAL_WEIGHT,
  SSS_MULTIPLIER,
  CUMULATIVE_WEIGHTS,
  rollStatRank,
  computeCardRank,
  getRankByPos,
  getRankByCode,
  computeStatValue,
  // aliases úteis
  rollStat: rollStatRank,
};
