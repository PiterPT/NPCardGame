// ============================================================================
// SIMULAÇÃO OFFLINE DO GACHA v2 — prova as taxas/pity ANTES de tocar na rota.
// Usa EXATAMENTE o mesmo motor (config/gachaEngine.js) e config
// (config/gachaConfig.js) que a rota /api/gacha/pull vai usar na F3.
//
// Uso (PowerShell):
//   node scripts/simulateGacha.js            → simula os 3 banners
//   node scripts/simulateGacha.js 1          → só o banner 1
//   node scripts/simulateGacha.js 1 200000   → banner 1 com 200k rolls
//
// Para cada banner imprime:
//   - % real de cada raridade vs % configurada
//   - rolls / diamantes até ao 1.º SSR (média, mediana, p90)
//   - EV de venda por roll (preços SELL_PRICES) vs custo do roll → veredicto
//     SEM ARBITRAGEM / ARBITRAGEM — separado para 1x e x10
//   - se houver arbitragem: testa ajustes candidatos (limiar ×1.5/×2/×4;
//     venda SR 250→220→200) e imprime o efeito de cada um, para decisão.
// ============================================================================

const crypto = require('crypto');
const { BANNERS, SELL_PRICES, validateGachaConfig } = require('../config/gachaConfig');
const { rollClass } = require('../config/gachaEngine');

validateGachaConfig(); // mesma garantia do arranque do servidor

// rand01 em [0,1) — fonte prevista para a rota: crypto.randomInt.
const rand01 = () => crypto.randomInt(0, 1_000_000_000) / 1_000_000_000;

// Custo por roll no modo indicado ('1x' | 'x10'). No x10 cada roll paga 1/10 do pack.
const costPerRoll = (banner, mode) => (mode === 'x10' ? banner.cost10x / 10 : banner.cost1x);

const pct = (x) => `${(x * 100).toFixed(2)}%`;
const pp = (x) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}pp`;
const f1 = (x) => x.toLocaleString('pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = (x) => Math.round(x).toLocaleString('pt-PT');

// ---------------------------------------------------------------------------
// Núcleos de simulação
// ---------------------------------------------------------------------------

// Sequência longa com pity acumulado (distribuição em regime permanente).
// O custo do roll é adicionado ao contador ANTES do roll — "diamantes gastos
// desde o último SSR" inclui o gasto do roll atual.
function simulateRun(banner, mode, nRolls, counts) {
  let pity = 0;
  for (let i = 0; i < nRolls; i++) {
    pity += costPerRoll(banner, mode);
    const { classe } = rollClass({ banner, diamondsSinceSsr: pity, rand01 });
    counts[classe]++;
    if (classe === 'SSR') pity = 0; // reinício do pity ao sair SSR
  }
}

// Uma tentativa até ao 1.º SSR.
function firstSsrTrial(banner, mode) {
  let pity = 0;
  let rolls = 0;
  for (;;) {
    pity += costPerRoll(banner, mode);
    rolls++;
    const { classe } = rollClass({ banner, diamondsSinceSsr: pity, rand01 });
    if (classe === 'SSR') return { rolls, diamonds: pity };
  }
}

function stats(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { mean, median: at(0.5), p90: at(0.9) };
}

// EV de venda por roll a partir de contagens.
function evPerRoll(counts, nRolls, prices) {
  const total = Object.entries(counts).reduce((acc, [classe, n]) => acc + n * (prices[classe] || 0), 0);
  return total / nRolls;
}

// ---------------------------------------------------------------------------
// Relatório por banner
// ---------------------------------------------------------------------------

const ROLLS_SSR_TRIALS = 20_000; // tentativas para estatística do 1.º SSR

function reportBanner(banner, nRolls) {
  const line = '─'.repeat(74);
  console.log(`\n=== BANNER ${banner.id} — ${banner.name} ===`);
  const soft = banner.pity.softDiamonds !== undefined
    ? ` · soft a partir de ${f0(banner.pity.softDiamonds)} diamantes (+${(banner.pity.softRateStep * 100).toFixed(1)}%/roll)`
    : '';
  console.log(
    `Custo/roll: ${f0(banner.cost1x)} (1x) · ${f0(costPerRoll(banner, 'x10'))} (x10) | ` +
    `pity duro: ${f0(banner.pity.hardDiamonds)} diamantes ` +
    `(~${Math.ceil(banner.pity.hardDiamonds / banner.cost1x)} rolls de 1x)${soft}`
  );

  const percentiles = { rolls: [null, null, null], diamonds: [null, null, null] };

  for (const mode of ['1x', 'x10']) {
    // 1) Distribuição em regime permanente
    const counts = { R: 0, SR: 0, SSR: 0 };
    simulateRun(banner, mode, nRolls, counts);

    console.log(`\n─ ${'─'.repeat(40)} modo ${mode} (custo ${f1(costPerRoll(banner, mode))}/roll)`);
    for (const classe of ['R', 'SR', 'SSR']) {
      const real = counts[classe] / nRolls;
      // config sem pity vs real (o real sobe acima da config por causa do pity)
      const cfg = banner.probabilities[classe];
      const ref = classe === 'SSR' ? 'config' : 'config';
      console.log(`  [${classe}] ${ref} ${pct(cfg).padStart(7)} | real ${pct(real).padStart(7)} | ${pp((real - cfg) * 100)}`);
    }

    // 2) EV de venda por roll vs custo
    const ev = evPerRoll(counts, nRolls, SELL_PRICES);
    const cost = costPerRoll(banner, mode);
    const ratio = ev / cost;
    const verdict = ratio >= 1
      ? `⚠️ ARBITRAGEM (EV = ${(ratio * 100).toFixed(1)}% do custo)`
      : `✅ SEM ARBITRAGEM (EV = ${(ratio * 100).toFixed(1)}% do custo)`;
    console.log(`  EV de venda/roll: ${f1(ev)} vs custo ${f1(cost)} → ${verdict}`);

    // 3) Estatística do 1.º SSR (só no modo 1x para não duplicar)
    if (mode === '1x') {
      const trials = [];
      for (let t = 0; t < ROLLS_SSR_TRIALS; t++) trials.push(firstSsrTrial(banner, mode));
      const rolls = stats(trials.map((t) => t.rolls));
      const diamonds = stats(trials.map((t) => t.diamonds));
      percentiles.rolls = [rolls.mean, rolls.median, rolls.p90];
      percentiles.diamonds = [diamonds.mean, diamonds.median, diamonds.p90];
      console.log(`  Até ao 1.º SSR (${ROLLS_SSR_TRIALS.toLocaleString('pt-PT')} tentativas):`);
      console.log(`    rolls     média ${f1(rolls.mean)} · mediana ${f0(rolls.median)} · p90 ${f0(rolls.p90)}`);
      console.log(`    diamantes média ${f1(diamonds.mean)} · mediana ${f0(diamonds.median)} · p90 ${f0(diamonds.p90)}`);
    }
  }

  return percentiles;
}

// ---------------------------------------------------------------------------
// Ajustes candidatos (só impressos se houver arbitragem)
// ---------------------------------------------------------------------------

const THRESHOLD_FACTORS = [1.5, 2, 4];      // multiplicadores do pity duro
const SR_PRICE_CANDIDATES = [220, 200];     // venda SR (A2: 250)

function testAdjustments(banner, nRolls, baseVerdicts) {
  const arbitrage = Object.values(baseVerdicts).some((r) => r >= 1);
  if (!arbitrage) return false;

  console.log(`\n  ⚠️ ARBITRAGEM DETETADA no banner ${banner.id} — candidatos a ajuste:`);

  // (a) subir o limiar de pity duro
  for (const factor of THRESHOLD_FACTORS) {
    const adjusted = {
      ...banner,
      pity: { ...banner.pity, hardDiamonds: Math.round(banner.pity.hardDiamonds * factor) }
    };
    const out = [];
    for (const mode of ['1x', 'x10']) {
      const counts = { R: 0, SR: 0, SSR: 0 };
      simulateRun(adjusted, mode, nRolls, counts);
      const ratio = evPerRoll(counts, nRolls, SELL_PRICES) / costPerRoll(banner, mode);
      out.push(`${mode}: EV/custo = ${(ratio * 100).toFixed(1)}%${ratio >= 1 ? ' (ainda arbitragem)' : ' ✅'}`);
    }
    console.log(`    (a) pity ${f0(banner.pity.hardDiamonds)} ×${factor} = ${f0(adjusted.pity.hardDiamonds)} → ${out.join(' | ')}`);
  }

  // (b) baixar a venda de SR
  for (const srPrice of SR_PRICE_CANDIDATES) {
    const prices = { ...SELL_PRICES, SR: srPrice };
    const out = [];
    for (const mode of ['1x', 'x10']) {
      const counts = { R: 0, SR: 0, SSR: 0 };
      simulateRun(banner, mode, nRolls, counts);
      const ratio = evPerRoll(counts, nRolls, prices) / costPerRoll(banner, mode);
      out.push(`${mode}: EV/custo = ${(ratio * 100).toFixed(1)}%${ratio >= 1 ? ' (ainda arbitragem)' : ' ✅'}`);
    }
    console.log(`    (b) venda SR ${SELL_PRICES.SR} → ${srPrice} → ${out.join(' | ')}`);
  }

  console.log('  ⏸ SIMULAÇÃO PARADA — caso haja arbitragem, escolher ajuste antes da F3.');
  return true;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

const argBanner = process.argv[2] !== undefined ? Number(process.argv[2]) : null;
const argRolls = process.argv[3] !== undefined ? Number(process.argv[3]) : 100_000;

const ids = argBanner === null ? Object.keys(BANNERS) : [String(argBanner)];
if (argBanner !== null && !BANNERS[String(argBanner)]) {
  console.error(`Banner inválido: '${process.argv[2]}' (válidos: ${Object.keys(BANNERS).join(', ')})`);
  process.exit(1);
}
if (!Number.isFinite(argRolls) || argRolls < 1000) {
  console.error('Número de rolls inválido (mínimo 1000).');
  process.exit(1);
}

for (const id of ids) {
  const banner = BANNERS[id];
  reportBanner(banner, argRolls);

  // veredictos por modo, para a deteção de arbitragem
  const verdicts = {};
  for (const mode of ['1x', 'x10']) {
    const counts = { R: 0, SR: 0, SSR: 0 };
    simulateRun(banner, mode, argRolls, counts);
    verdicts[mode] = evPerRoll(counts, argRolls, SELL_PRICES) / costPerRoll(banner, mode);
  }
  testAdjustments(banner, argRolls, verdicts);
}

console.log('\n(node scripts/simulateGacha.js — motor: config/gachaEngine.js · config: config/gachaConfig.js)');
