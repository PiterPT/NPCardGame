const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// JWT_SECRET é obrigatório: sem ele os pedidos não podiam ser assinados.
// A verificação falha logo no arranque em vez de aceitar tokens como válidos.
if (!process.env.JWT_SECRET) {
  console.error('FALTA JWT_SECRET no ambiente — a API não pode assinar nem validar tokens.');
  process.exit(1);
}

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias

// Assina um token de identidade. O payload é mínimo; o role nunca é fidado do token
// (requireAdmin vai sempre buscá-lo fresco à base de dados).
function signToken(user) {
  return jwt.sign(
    { sub: String(user.id_user ?? user.id), role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL_SECONDS }
  );
}

// Verifica o cabeçalho "Authorization: Bearer <token>" e anexa req.user = { id, role }.
// Nota: o id do utilizador passa SEMPRE a vir do token, nunca do corpo do pedido.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Autenticação necessária.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const id = parseInt(payload.sub, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(401).json({ error: 'Token inválido.' });
    }
    req.user = { id, role: payload.role || null };
    return next();
  } catch (err) {
    return res.status(401).json({
      error: err.name === 'TokenExpiredError' ? 'Sessão expirada. Volta a entrar.' : 'Token inválido.'
    });
  }
}

// Administração: além do token, o role é lido fresco da base de dados.
// Antes, bastava um cabeçalho "admin-id" forjado pelo cliente.
async function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Autenticação necessária.' });

  try {
    const result = await pool.query('SELECT role FROM users WHERE id_user = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    req.user.role = 'admin'; // valor fresco da BD, não o do token
    return next();
  } catch (err) {
    console.error('Erro no requireAdmin:', err);
    return res.status(500).json({ error: 'Erro ao verificar permissões.' });
  }
}

// Garante que o utilizador autenticado só acede a recursos com o próprio id.
function requireSelf(paramKey) {
  return (req, res, next) => {
    const requestedId = parseInt(req.params[paramKey], 10);
    if (!Number.isInteger(requestedId) || requestedId <= 0) {
      return res.status(400).json({ error: 'ID inválido.' });
    }
    if (requestedId !== req.user.id) {
      return res.status(403).json({ error: 'Acesso negado. Só podes consultar a tua própria conta.' });
    }
    return next();
  };
}

module.exports = { signToken, requireAuth, requireAdmin, requireSelf, TOKEN_TTL_SECONDS };
