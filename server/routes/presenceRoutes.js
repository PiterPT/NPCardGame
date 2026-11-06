const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});
pool.on('error', (err) => console.error('Erro no pool de presenca (ligacao inativa):', err.message));

// ==========================================
// CONFIGURACAO
// ==========================================
const TTL_MINUTES = Math.max(1, parseInt(process.env.PRESENCE_TTL_MINUTES || '10', 10)); // duracao do "online"
const WRITE_THROTTLE_SECONDS = 30;  // sinais mais frequentes que isto nao escrevem na BD
const SWEEP_INTERVAL_MS = 60_000;   // de quanto em quanto tempo o status 'connect' expirado passa a 'disconnect'
const MAX_IDS = 200;

const toInt = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 && String(n) === String(v).trim() ? n : null;
};

// Online = ultimo sinal ha menos de TTL_MINUTES. Calculado na hora da consulta, por isso e sempre exato.
const ONLINE_SQL = `(last_seen IS NOT NULL AND last_seen > now() - ($2::int * interval '1 minute'))`;

// ==========================================
// SINAL DE VIDA ("renovar"): coloca o jogador online durante TTL_MINUTES
// ==========================================
router.post('/presence/heartbeat', async (req, res) => {
  const userId = toInt(req.body && req.body.userId);
  if (!userId) return res.status(400).json({ error: 'userId inválido.' });

  try {
    // So escreve se passaram >= 30 s (ou se estava marcado offline): evita uma escrita por cada sinal.
    const upd = await pool.query(
      `UPDATE users SET last_seen = now(), status = 'connect'
        WHERE id_user = $1
          AND (last_seen IS NULL OR status IS DISTINCT FROM 'connect'
               OR last_seen < now() - ($2::int * interval '1 second'))
        RETURNING last_seen`,
      [userId, WRITE_THROTTLE_SECONDS]
    );

    let lastSeen = upd.rows[0] && upd.rows[0].last_seen;
    if (!lastSeen) {
      // Nada escrito: ou o sinal foi muito recente (continua online) ou o jogador nao existe.
      const cur = await pool.query('SELECT last_seen FROM users WHERE id_user = $1', [userId]);
      if (cur.rows.length === 0) return res.status(404).json({ error: 'Jogador não encontrado.' });
      lastSeen = cur.rows[0].last_seen;
    }
    res.json({ online: true, lastSeen, ttlMinutes: TTL_MINUTES });
  } catch (err) {
    console.error('Erro no heartbeat de presenca:', err);
    res.status(500).json({ error: 'Erro ao registar presença.' });
  }
});

// ==========================================
// CONSULTA: GET /api/presence?ids=1,2,3  ->  [{ id_user, online, last_seen }]
// ==========================================
router.get('/presence', async (req, res) => {
  const raw = String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = raw.map(toInt);
  if (ids.length === 0 || ids.some((id) => id === null)) {
    return res.status(400).json({ error: 'Indica ids válidos separados por vírgula (ids=1,2,3).' });
  }
  if (ids.length > MAX_IDS) {
    return res.status(400).json({ error: `No máximo ${MAX_IDS} jogadores por pedido.` });
  }

  try {
    const r = await pool.query(
      `SELECT id_user, last_seen, ${ONLINE_SQL} AS online
         FROM users WHERE id_user = ANY($1::int[]) ORDER BY id_user`,
      [ids, TTL_MINUTES]
    );
    res.json(r.rows);
  } catch (err) {
    console.error('Erro ao consultar presenca:', err);
    res.status(500).json({ error: 'Erro ao consultar presença.' });
  }
});

// ==========================================
// EXPIRACAO: quem ficou TTL_MINUTES sem renovar passa a status 'disconnect'
// (as consultas ja calculam o online pela hora; isto mantem a coluna status coerente)
// ==========================================
async function sweepExpired(db = pool) {
  const r = await db.query(
    `UPDATE users SET status = 'disconnect'
      WHERE status = 'connect' AND (last_seen IS NULL OR last_seen < now() - ($1::int * interval '1 minute'))`,
    [TTL_MINUTES]
  );
  return r.rowCount;
}

let lastSweepError = null;
const sweeper = setInterval(() => {
  sweepExpired().then(
    () => { lastSweepError = null; },
    (err) => {
      // Ex.: migracao ainda nao executada. Regista uma vez, nao de minuto a minuto.
      if (err.message !== lastSweepError) console.error('Presenca: erro na expiracao:', err.message);
      lastSweepError = err.message;
    }
  );
}, SWEEP_INTERVAL_MS);
sweeper.unref(); // nao impede o processo de terminar

module.exports = router;
module.exports.sweepExpired = sweepExpired;
module.exports.TTL_MINUTES = TTL_MINUTES;
