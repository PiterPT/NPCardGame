const { Pool } = require('pg');
require('dotenv').config();

// Pool de ligações seguro utilizando variáveis de ambiente
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: true } // Necessário para bases de dados online modernas (Render, Supabase, Neon)
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};