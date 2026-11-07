const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Caminho EXPLÍCITO do .env (pasta server/): garante as credenciais corretas
// quer se corra `npm start` dentro de server/, quer `npm run testServer` da raiz.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { pool } = require('./config/db');
const { validateGachaConfig } = require('./config/gachaConfig');
const app = express();

// Habilita confiança em X-Forwarded-For quando atrás de proxy (Render, Vercel, etc.),
// caso contrário o rate limit não consegue distinguir IPs reais.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.set('x-powered-by', false);

// Segurança de headers HTTP básica.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS com origem configurável: CORS_ORIGIN aceita uma lista separada por vírgulas.
// Sem a variável, permite tudo mas avisa — Bearer tokens no header não criam risco
// de CSRF, mas convém restringir em produção.
const clientOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: clientOrigins.length > 0 ? clientOrigins : true
}));
if (clientOrigins.length === 0) {
  console.warn('AVISO: CORS_ORIGIN não definido — CORS está aberto. Define a origem do frontend.');
}

// Limite de express-rate-limit para quem repetidamente falha no login (clientes portaria)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30, // registo/login: pouca gente precisa de mais que isto em todos cinco minutos
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas. Aguarda alguns minutos e volta a tentar.' }
});

app.use('/api/auth', authLimiter);

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240, // evita que um único cliente inunde a API
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos. Aguarda um momento.' }
});

app.use('/api', verifyLimiter);

// Janela de JSON por defeito a 100KB: é suficiente para os pedidos de jogo.
const jsonDefault = express.json({ limit: '100kb' });
app.use(jsonDefault);

// 10MB apenas para o CRUD de modelos de cartas no painel admin, onde a imagem vem
// em base64 dentro do corpo. As outras rotas continuam limitadas a 100KB.
const jsonCardUpload = express.json({ limit: '10mb' });
app.use('/api/admin/cards', jsonCardUpload);

// Importar rotas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gachaRoutes = require('./routes/gachaRoutes');
const adminRoutes = require('./routes/adminRoutes');
const cardRoutes = require('./routes/cardRoutes');
const pvpRoutes = require('./routes/pvpRoutes');
const presenceRoutes = require('./routes/presenceRoutes');

// Registar rotas com os prefixos corretos
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', gachaRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api', pvpRoutes);
app.use('/api', presenceRoutes);
app.use('/api', adminRoutes);

// Middleware global de erros: em vez de os pedidos feature ficarem pendentes,
// qualquer exceção não apanhada devolve 500 sem expor stack ao cliente.
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  if (res.headersSent) return next(err);
  res.status(err.type === 'entity.too.large' ? 413 : 500)
    .json({ error: err.type === 'entity.too.large' ? 'Payload demasiado grande.' : 'Erro interno do servidor.' });
});

// Migração principal (idempotente: criada/modificada apenas quando falta).
// - infinite_progress: progresso do Modo Infinito.
// - gacha_pity: pity por (utilizador, banner) em diamantes gastos desde o último SSR.
// - gacha_pulls: log de auditoria — 1 linha por carta puxada.
// - users.diamonds: moeda nova do gacha (sem valor por defeito: os diamantes são
//   distribuídos pelo admin / futuras recompensas; contas existentes ficam a 0).
// - Validação do gachaConfig: config inválida impede o arranque (throw apanha aqui embaixo).
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS infinite_progress (
        id_user INTEGER PRIMARY KEY REFERENCES users(id_user) ON DELETE CASCADE,
        max_wave INTEGER NOT NULL DEFAULT 0,
        last_claim_at TIMESTAMPTZ
      )
    `);

    // FM1 (Modo Infinito/Farm) — migração aditiva e idempotente do progresso.
    // best_wave = recorde absoluto (ranking/diamantes); max_wave = progressão da run atual.
    await pool.query('ALTER TABLE infinite_progress ADD COLUMN IF NOT EXISTS best_wave INT NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE infinite_progress ADD COLUMN IF NOT EXISTS resets_today INT NOT NULL DEFAULT 0');
    await pool.query('ALTER TABLE infinite_progress ADD COLUMN IF NOT EXISTS resets_day DATE');
    await pool.query('UPDATE infinite_progress SET best_wave = max_wave WHERE best_wave < max_wave');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_infinite_best_wave ON infinite_progress (best_wave DESC)');

    // Nova moeda "diamantes" (gacha). Aditiva: nenhuma coluna/saldo existente é alterado.
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS diamonds INT NOT NULL DEFAULT 0');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gacha_pity (
        id_user INTEGER NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
        banner_id SMALLINT NOT NULL,
        diamonds_since_ssr INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (id_user, banner_id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS gacha_pulls (
        id BIGSERIAL PRIMARY KEY,
        id_user INTEGER NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
        banner_id SMALLINT NOT NULL,
        times SMALLINT NOT NULL,
        cost INTEGER NOT NULL,
        dropped_class TEXT NOT NULL,
        dropped_card_id INTEGER NOT NULL,
        diamonds_total INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      'CREATE INDEX IF NOT EXISTS idx_gacha_pulls_user ON gacha_pulls (id_user, banner_id, created_at DESC)'
    );

    // Config do gacha tem de ser válida antes do primeiro pull da vida do servidor.
    validateGachaConfig();
    console.log('✅ Migrações de BD aplicadas e gachaConfig validada.');
  } catch (err) {
    // Config invalida ou BD inacessível: não levantar o serviço a meio do jogo.
    console.error('❌ Falha no arranque (migrações/validação do gacha):', err.message);
    process.exit(1);
  }
})();

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => console.log(`🚀 Servidor Ninja Legends ativo na porta ${PORT}`));

// Encerramento limpo (CTRL+C ou sinal da plataforma): fecha o servidor antes de o pool morrer.
async function shutdown(signal) {
  console.log(`\n${signal} recebido — a encerrar...`);
  server.close(async () => {
    try { await pool.end(); } catch { /* já fechado */ }
    process.exit(0);
  });
  // Garantia: se algum pedido demorar a morrer, força a saída ao fim de 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
