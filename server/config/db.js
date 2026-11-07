const { Pool } = require('pg');
const path = require('path');

// Caminho EXPLÍCITO do .env (pasta server/), como no index.js: garante as credenciais
// corretas quer se corra dentro de server/, quer da raiz (`npm run testServer`).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Pool ÚNICO do servidor: todos os routers importam este módulo.
// Antes existiam ~6 cópias de new Pool(...) com configurações divergentes (algumas sem
// tratamento de erros), o que esgotava ligações e derrubava o processo.
const ssl = process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false };

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl,
  family: 4 // Força IPv4 para evitar problemas de ligação em alguns alojamentos cloud
});

// Sem este handler, um erro numa ligacao inativa (ex.: reinicio da BD) mata o processo Node.
pool.on('error', (err) => {
  console.error('Erro no pool de ligações (ligação inativa):', err.message);
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
