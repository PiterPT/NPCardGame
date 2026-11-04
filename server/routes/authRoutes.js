const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const SALT_ROUNDS = 10;

// ==========================================
// ROTA DE REGISTO (Com Encriptação de Senha)
// ==========================================
router.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  try {
    const client = await pool.connect();

    // 1. Verificar se o email já existe
    const existingUser = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: 'Este email já está registado.' });
    }

    // 2. Encriptar a palavra-passe com bcrypt
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 3. Inserir utilizador com a senha encriptada e moedas iniciais (ex: 1000 Ryo)
    const result = await client.query(
      'INSERT INTO users (name, email, password, coins) VALUES ($1, $2, $3, $4) RETURNING id_user, name, email, coins',
      [name, email, hashedPassword, 1000]
    );

    client.release();

    res.status(201).json({
      message: 'Registo efetuado com sucesso!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro no registo:', error);
    res.status(500).json({ error: 'Erro interno ao criar conta.' });
  }
});

// ==========================================
// ROTA DE LOGIN (Verificação da Senha Hash)
// ==========================================
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Preencha o email e a palavra-passe.' });
  }

  try {
    const client = await pool.connect();

    // 1. Procurar o utilizador pelo email
    const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      client.release();
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const user = result.rows[0];

    // 2. Comparar a palavra-passe introduzida com o hash na base de dados
    const isPasswordValid = await bcrypt.compare(password, user.password);

    client.release();

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // 3. Retornar dados seguros do utilizador (excluindo a palavra-passe)
    res.json({
      message: 'Login bem-sucedido!',
      user: {
        id_user: user.id_user,
        name: user.name,
        email: user.email,
        coins: user.coins,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno ao efetuar login.' });
  }
});

module.exports = router;