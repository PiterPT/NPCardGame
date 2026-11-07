const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { signToken } = require('../middleware/auth');

const SALT_ROUNDS = 10;

// Helper: liga, executa o handler e GARANTE o release do cliente, mesmo em erro.
// Antes, um erro a meio deixa a ligacao pendurada no pool (que esgota por volta das 10 falhas).
async function withClient(handler) {
  const client = await pool.connect();
  try {
    return await handler(client);
  } finally {
    client.release();
  }
}

// ==========================================
// ROTA DE REGISTO (Com Encriptação de Senha)
// ==========================================
router.post('/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Por favor, preencha todos os campos.' });
  }

  try {
    const result = await withClient(async (client) => {
      // 1. Verificar se o email já existe
      const existingUser = await client.query('SELECT id_user FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return { conflict: true };
      }

      // 2. Encriptar a palavra-passe com bcrypt
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // 3. Inserir utilizador com a senha encriptada e moedas iniciais (ex: 1000 Ryo)
      return client.query(
        'INSERT INTO users (name, email, password, coins) VALUES ($1, $2, $3, $4) RETURNING id_user, name, email, coins, diamonds, role',
        [name, email, hashedPassword, 1000]
      );
    });

    if (result.conflict) {
      return res.status(400).json({ error: 'Este email já está registado.' });
    }

    const user = result.rows[0];

    res.status(201).json({
      message: 'Registo efetuado com sucesso!',
      // Registo entra logo com sessão ativa (mesma resposta do login).
      token: signToken(user),
      user: {
        id_user: user.id_user,
        name: user.name,
        email: user.email,
        coins: user.coins,
        diamonds: user.diamonds ?? 0,
        role: user.role
      }
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
    const user = await withClient(async (client) => {
      // 1. Procurar o utilizador pelo email
      const result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    });

    // 2. Comparar a palavra-passe introduzida com o hash na base de dados.
    //    O bcrypt corre sempre (mesmo sem user) para não revelar por timing se o email existe.
    const isPasswordValid = user
      ? await bcrypt.compare(password, user.password)
      : await bcrypt.compare(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');

    if (!user || !isPasswordValid) {
      // Mensagem única: não revela se o email existe ou se a senha está errada.
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // 3. Retornar o token e dados seguros do utilizador (excluindo a palavra-passe)
    res.json({
      message: 'Login bem-sucedido!',
      token: signToken(user),
      user: {
        id_user: user.id_user,
        name: user.name,
        email: user.email,
        coins: user.coins,
        diamonds: user.diamonds ?? 0,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno ao efetuar login.' });
  }
});

// ==========================================
// ROTA DE PEDIDO DE RECUPERAÇÃO DE PALAVRA-PASSE
// ==========================================
router.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Por favor, introduz o teu email.' });
  }

  try {
    const user = await withClient(async (client) => {
      const result = await client.query('SELECT id_user, email FROM users WHERE email = $1', [email]);
      return result.rows[0] || null;
    });

    // Por razões de segurança, não revelamos se o email existe ou não na BD
    if (!user) {
      return res.json({ message: 'Se o email existir, as instruções foram enviadas.' });
    }

    // TODO: Gerar token de recuperação, guardar na BD (com expiração) e enviar email (ex: Nodemailer / SendGrid)

    res.json({ message: 'Se o email existir, as instruções foram enviadas.' });
  } catch (error) {
    console.error('Erro no pedido de recuperação:', error);
    res.status(500).json({ error: 'Erro interno ao processar recuperação.' });
  }
});

// ==========================================
// ROTA DE REDEFINIÇÃO DE PALAVRA-PASSE
// ==========================================
router.post('/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Dados incompletos para redefinição.' });
  }

  try {
    // 1. Validar o token de recuperação (verificar se é válido e não expirou)
    // 2. Encriptar a nova palavra-passe com bcrypt.hash(newPassword, SALT_ROUNDS)
    // 3. Atualizar na tabela 'users' e invalidar o token

    res.json({ message: 'Palavra-passe alterada com sucesso!' });
  } catch (error) {
    console.error('Erro ao redefinir palavra-passe:', error);
    res.status(500).json({ error: 'Erro interno ao redefinir palavra-passe.' });
  }
});

module.exports = router;
