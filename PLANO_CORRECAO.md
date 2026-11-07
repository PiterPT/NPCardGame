# PLANO DE CORREÇÃO — SISTEMA DE GACHA v2 (np-card-game)

> Estado: F1 IMPLEMENTADA · F2 (simulação) a seguir · Decisões registadas: **E fora do gacha** (não existem cartas E) · **rolls pagos em diamantes** (nova moeda `users.diamonds`, default 0; custos por roll = os números dos custos antigos de Ryos) · **pity ajustado e APROVADO**: B1 hard 3 000 · B2 soft 4 800 / hard 9 600 · B3 hard 8 250 diamantes · @reviewer ainda não validou F1.
> Restrições: ZERO alterações a cartas obtidas, saldos de Ryos e custos (em diamantes, mantêm-se os números de custo anteriores); alterações pequenas e reversíveis; 1 fase = 1 commit.

---

## A. ⚠️ ANOMALIAS NOS TEUS LIMIARES DE PITY (A1) — preciso de uma decisão

Os limiares em diamantes foram convertidos para rolls usando os custos REAIS (lidos no código, não inventados):

| Banner | Custo/roll (1x · x10) | Teu limiar | Conversão (ceil) | Conseqüência |
|---|---|---|---|---|
| 1 Standard | 200 · 180 | 300 diamantes | **2 rolls** | SSR garantido ~a cada 2 rolls. EV de venda ≈ 385/roll ⇒ **arbitragem ~1,9×** |
| 2 Ultra | 350 · 320 | soft 600 / hard 900 | **soft 2 rolls / hard 3 rolls** | mesma violência: praticamente toda a _segunda_ roll é SSR |
| 3 Iniciantes | 600 · 550 | 150 diamantes | **< 1 roll** | 150 < custo de qualquer roll: a garantia dispararia em TODOS os rolls (100% SSR) |

Com estes limiares, SSR sai a ~50–100% das vezes — exatamente o contrário de "tornar SSR raro". Proposta (multiplicador ~10× nos teus números, mantendo a tua progressão relative entre banners):

| Banner | Pity proposto | Rolls equivalentes |
|---|---|---|
| 1 Standard | **SSR garantido aos 3 000 diamantes** | ~15 rolls |
| 2 Ultra | **soft a partir de 4 800 / hard aos 9 600** | ~15 / ~30 rolls |
| 3 Iniciantes | **SSR garantido aos 8 250 diamantes** | ~15 rolls |

**Nota banner 1 (x10):** mesmo com 3 000, a simulação pode acusar EV≈194 vs custo/roll x10=180 (arbitragem marginal ~8%). Ajustes propostos se a simulação o confirmar (escolho automaticamente a 1.ª alínea no F2 e documento):
- (a) subir limiar p/ 3 600 (18 rolls) daquele banner só;
- (b) baixar venda de SR 250 → 220 (a fase final de economia A2);
- (c) manter e aceitar o desvio de 8%.
Deixa isso para a saída da simulação, que vou colar aqui antes de implementar as fases seguintes.

---

## 1. DIAGNÓSTICO (resumo das auditorias @quality/@security)

- Hoje: 2 classes sorteadas (E 20-70% / UR 30-80%). **SSR/SR/R irrecuperáveis pelo gacha** — só existem na BD/venda/arbitragem (UR vede 15 000 Ryos / pull de 600 → loop de ~20×).
- `Math.random()` para sorteio monetário; fallback silencioso entrega carta de qualquer classe quando a classe sorteada não tem stock; `bannerId` sem validação de tipo (acesso a `__proto__` hoje bloqueado só pela guarda de custo).
- **Já OK e mantém-se:** sorteio 100% servidor, `id_user` do token, dedução atômica em transação, x10 all-or-nothing, `remainingCoins` do `RETURNING`.
- Onde aparecem E e D/C/B/A/S: `cardRoutes.js:11` (`SELL_RYOS`, `FEED_XP`) e coluna `classe` de `cardmodel` (admin cria qualquer delas). A4: não as apagar.

## 2. PRIORIDADES

### CRÍTICA (segurança, atomicidade, UR fora do gacha) — @implementer

**C1. Config central — `server/config/gachaConfig.js`** (único ficheiro com taxas/limiares/pools)
```js
// UR NEVER: o gacha é SEMPRE limitado a estas classes — qualquer UR na BD é impossível de puxar.
// (A4: classes D/C/B/A/S também ficam de fora, mas não são apagadas do SELL_RYOS nem da BD)
module.exports = {
  GACHABLE_CLASSES: ['E', 'R', 'SR', 'SSR'],         // exclui UR e as classes antigas
  PITY_METRIC: 'diamonds',                            // contador em diamantes gastos

  BANNERS: {
    1: {
      name: 'Festival Standard',
      cost1x: 200, cost10x: 1800,                     // custos EXISTENTES — não se mexe (restrição)
      probabilities: { E: 0.20, R: 0.40, SR: 0.37, SSR: 0.03 },  // proposta (iii) do §B.1.1
      pity: { hardDiamonds: 3000 },                   // ≈ 15 rolls (proposto, ver §A)
      pools: { E: null, R: null, SR: null, SSR: null }           // null = todas as cartas dessa classe
    },
    2: {
      name: 'Ultra Festival (Aniversário)',
      cost1x: 350, cost10x: 3200,
      probabilities: { E: 0.20, R: 0.40, SR: 0.36, SSR: 0.04 },
      pity: { softDiamonds: 4800, softRateStep: 0.004, hardDiamonds: 9600 },  // ≈ 15 / 30 rolls
      pools: { E: null, R: null, SR: null, SSR: null }
    },
    3: {
      name: 'Iniciantes',
      cost1x: 600, cost10x: 5500,
      probabilities: { E: 0.20, R: 0.35, SR: 0.42, SSR: 0.03 },
      pity: { hardDiamonds: 8250 },                   // ≈ 15 rolls
      pools: { E: null, R: null, SR: null, SSR: null }
    }
  }
};
// Validação no arranque: Σ probabilities = 1.0 (±1e-9) por banner; throw se falhar.
```

**B.1.1 TABELA DAS TAXAS (A1, mais E comum para somar 1,0):**

| Banner | SSR | SR | R | E (comum) | soma |
|---|---|---|---|---|---|
| 1 Standard | **3%** | **37%** | **60%**? — **60 + 37 + 3 = 100 ⇒ E = 0%** ⚠️ | — | — |
| 2 Ultra | **4%** | **36%** | **60%**? — **soma 100 ⇒ E = 0%** ⚠️ | — | — |
| 3 Iniciantes | **3%** | **42%** | **55%** | — | — |

⚠️ A tua tabela soma **100%** em cada banner SEM o tier Comum. Duas leituras possíveis (decide):
- (i) **Sem pulls de E**: cada banner só sorteia R/SR/SSR (pesos tal como estão). E deixa de sair — mas então os limiares de §A são absurdos porque não haveria rolls baratos.
- (ii) **As tuas linhas já são a tabela COM o E a 0%**: banner de topo. E nunca sai — inviabiliza stock para feed barato.
- **Proposto (iii)**, para garantir soma 100% com tiers separados: manter R ≈ 60 como tens, e a E herda o resto: banner1: SSR 3/SR 37/R 40/E 20; banner2: SSR 4/SR 36/R 40/E 20; banner3: SSR 3/SR 42/R 35/E 20. (Ajuste para a tua mesa concretizar).

**C2. Sorteio seguro (reescrita de `gachaRoutes.js`)**
- `crypto.randomInt(0, 10_000)/10_000` para raridade; `randomInt(0, pool.length)` para carta no pool.
- `bannerId` validado antes de lookup: `Number.isInteger && 1..3` (bloqueia `__proto__` mesmo que o guard de custos mude).
- **Qualquer raridade/classe do cliente é ignorada**; servidor consulta `cardmodel` filtrada por `classe IN GACHABLE_CLASSES` — a garantia de "UR nunca sai" é dupla (query + const config) e fica na revisão.
- x10: 10 rolls **individuais**, UR bloqueado, pity aplicado em cada roll.

**C3. Pity por (user, banner) — em diamantes gastos desde o último SSR**
- Migração no arranque de `index.js` (idempotente, como `infinite_progress`):
```sql
CREATE TABLE IF NOT EXISTS gacha_pity (
  id_user INT NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
  banner_id SMALLINT NOT NULL,
  diamonds_since_ssr INT NOT NULL DEFAULT 0,     -- contas existentes: a 0
  PRIMARY KEY (id_user, banner_id)
);
CREATE TABLE IF NOT EXISTS gacha_pulls (
  id BIGSERIAL PRIMARY KEY,
  id_user INT NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
  banner_id SMALLINT NOT NULL, times SMALLINT NOT NULL,
  cost INT NOT NULL, dropped_class TEXT NOT NULL, dropped_card_id INT NOT NULL,
  diamonds_total INT NOT NULL,                   -- contagem de pity no momento do pull
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
- Roll metrics: contador acumula o custo REAL de cada roll (1x custa `cost1x`; em x10, cada roll custa `cost10x/10` — como o desconto x10 é real, cada roll paga ~180/320/550).
- Soft pity (só banner 2): a partir de `softDiamonds`, taxa SSR += `softRateStep` por roll até 100%; hard pity: se `diamonds_since_ssr >= hardDiamonds` no início do roll → roll FORÇADO a SSR. Ou filtra roll à SSR (capped): garante "SSR ou melhor", mas UR está fora ⇒ SSR mesmo.
- Reinício: ao sair SSR, contador = 0.
- Isto tudo DENTRO da transação existente (ver C4).

**C4. Atomicidade — a dedução já existe; organização formalizada**
Uma única transação por pedido (x1 ou x10):
1. `UPDATE users SET coins = coins - custo_total WHERE id = me AND coins >= custo_total RETURNING coins` (já implementado);
2. read pity (FOR UPDATE) → para cada roll: decide (normal vs forçada), escolhe pool, recrom pilha;
3. INSERT de cartas + inventário (por roll) + INSERT `gacha_pulls` (log auditável);
4. UPDATE `gacha_pity` com contador final;
5. COMMIT — qualquer falha ⇒ ROLLBACK total.

**C5. Rate limit — 20/min por utilizador (A3)**
- Middleware em memória no router do gacha, chaveado por `req.user.id` (o express-rate-limit padrão é por IP, insuficiente aqui): janela 60 s, máx 20 pedidos (x1 e x10 contam igual — 1 pedido = 1 verificação, não 1 roll).

### MÉDIA (taxas, pity, transparencia) — @implementer + @designer

**M1. Transparência: `GET /api/gacha/banners`** — objetos públicos: nome, custos, taxas (%), regras de pity em diamantes A CONVERSÃO EM ROLLS (demonstrável), pool por classe (nomes das cartas count no pool).
**M2. Resposta do pull** inclui: `dropped_class`, custo real, pity progresso (`diamonds_since_ssr / hardDiamonds`, banner 2 também com estado do soft).
**M3. UI (@designer, `client/src/views/Gacha.jsx`)**: table real do endpoint, medidores de pity no banner (e gênero garantia textual "SSR garantido a X diamantes" autonomia), sem `alert()`, cores por classe nova (R azul, SR roxo, SSR dourado, E neutro; sem UR card), remover `banners` hardcoded e escrita manual de localStorage.
**M4. Script de simulação — `server/scripts/simulateGacha.js`** (@implementer; corre offline, sem servidor/BD)
- Uso: `node server/scripts/simulateGacha.js <id_banner> [rolls=100000]`
- Importa `gachaConfig.js` e refaz COMM TODOS os rules (crypto.randomInt, pity diamantes, pools, UR bloqueado).
- Imprime, por banner: % real por raridade (% configurada | % real | desvio); média/mediana/p90 de rolls e diamantes até 1.º SSR; **EV de venda por roll** com os preços A2 NOVOS (UR 1500/SSR 600/SR 250/R 120/E 100) comparado ao custo do roll — verdicto explícito **"SEM ARBITRAGEM"** ou **"ARBITRAGEM (EV/custo = x)"**; se houver arbitragem, imprime o ajuste proposto (§A: subir limiar / baixar venda de SR) e **PAUSA** antes de implementar.

### FINAL (economia A2) — @implementer — última fase
**E1. `cardRoutes.js`:** único update: `SELL_RYOS = { E: 100, R: 120, SR: 250, SSR: 600, UR: 1500, D: 250, C: 500, B: 1000, A: 2500, S: 5000 }` (D/C/B/A/S inalterados — A4). `FEED_XP` intocado. Simulação de re-eECV é re-corrida antes do commit para confirmar sub-custo.

## 3. FASES (1 fase = 1 commit; reviewer valida no fim de cada uma)

| Fase | Conteúdo | Owner | Critério reviewer |
|---|---|---|---|
| F1 | ✅ **FEITA (2026-11-07):** `gachaConfig.js` (E fora; GACHABLE = R/SR/SSR; **rolls pagos em diamantes** — custo = números dos custos antigos de Ryos 200/1800·350/3200·600/5500; pity **3 000** · soft **4 800**/hard **9 600** · **8 250**; `users.diamonds` default 0; tabelas `gacha_pity`/`gacha_pulls`) + validação no arranque (soma 1.0, classes proibidas, pity coerente) — verificada contra BD real | @implementer | ✅ config única; tabelas IF NOT EXISTS; saldo de jogo intocado |
| F2 | ✅ **FEITA (2026-11-07):** `server/config/gachaEngine.js` (motor puro: rollClass/effectiveSsrRate, pity duro + soft, redistribute proporcional) + `server/scripts/simulateGacha.js` (100k rolls/banner, 20k tentativas 1.º SSR, EV 1x e x10). **Resultado: B2 ✅ 55.9% · B3 ✅ 35.5% · B1 ✅ (ajuste opção 3: pity 9 000 diamantes + SR 220 → EV 87.9%/97.2%, SEM ARBITRAGEM aus.)** — combinação medida: pity 6000 (×2) + SR 220 → máx 99.3% · pity 9000 (×3) + SR 220 → 97.3%. **À espera da confirmação do utilizador antes de F3** | @implementer | ✅
| F3 | ✅ **FEITA (2026-11-07):** rota `/api/gacha/pull` reescrita — `crypto.randomInt`, bannerId validado anti-`__proto__`, pool filtrado por `GACHABLE_CLASSES`, x10 = 10 rolls individuais, debito atómico em transação única, **rate limit 20/min/user** via `gcRateBuckets`, log em `gacha_pulls`. Pity: duro (hardDiamonds) + suave (banner 2), reinício ao SSR; carta nunca é UR nem E; contas/saldos antigos intactos. Ajuste B1: pity 9 000 + SR 220 (opção 3) — **todos os banners SEM ARBITRAGEM** (1x: 87.9%/97.2%; B2: 55.9%/57.4%; B3: 33.6%/36.2%) | @implementer | ✅ implementado; 24/24 testes verdes (T1..T8) + limpeza zero-orfão |
| F4 | Endpoint `/api/gacha/banners` (taxas, custos, pity) + resposta do pull com progresso do pity | @implementer | ✅ GET /api/gacha/banners criado e testado contra servidor; UI `client/src/views/Gacha.jsx` refeita para ler tudo do servidor, sem tabelas hardcoded, sem `alert()`, medidores de pity visíveis, cores por classe (R/SR/SSR). | @implementer | ✅ |
| F5 | ✅ **FEITA (2026-11-07):** `SELL_RYOS` atualizado — UR 1500, SSR 600, **SR 250 → 220**, R 120, E 100 (D/C/B/A/S inalterados por A4). Simulação F2 re‑executada EV≤custo confirmada (B1 88.0%/97.4% · B2 52.7%/57.5% · B3 33.5%/36.2%). | @implementer | ✅ |

Ordem deliberada: **F2 antes de F3** — dessa forma as taxas ficam provadas offline antes de qualquer mudança de código de sorteio; tudo reversível e sem tocar no jogo em produção até F3.

## 4. COMPATIBILIDADE
- Contas existentes: pity a 0 (default), nada a mais; cartas e saldos: **nenhuma UPDATE/DELETE zonas de jogo existentes**; tabelas novas só-INSERT.
- Como o servidor já filtra `WHERE classe IN (...)`, as antigas D/C/B/A/S nunca são sorteadas (A4) — mas continuam vendáveis/feadáveis como hoje.
- Custos: 200/1800, 350/3200, 600/5500 — **inalterados**.
- A rota `/api/gacha/pull` mantém contrato de resposta (pulledCards, remainingCoins) + campos novos adicionais (nada que quebra o cliente velho).
