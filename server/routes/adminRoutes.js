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
  ssl: { rejectUnauthorized: false }
});

// Middleware para verificar se o utilizador tem o cargo de Admin
const verifyAdmin = async (req, res, next) => {
  const adminId = req.headers['admin-id'];
  
  if (!adminId) {
    return res.status(401).json({ error: 'Acesso negado. Sem identificação.' });
  }

  try {
    const result = await pool.query('SELECT role FROM Users WHERE id_user = $1', [adminId]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    next();
  } catch (err) {
    console.error('Erro no verifyAdmin:', err);
    res.status(500).json({ error: 'Erro ao verificar permissões.' });
  }
};

// Aplica a verificação a todas as rotas deste ficheiro
router.use(verifyAdmin);

// ==========================================
// GESTÃO DE UTILIZADORES
// ==========================================

// Listar todos os utilizadores
router.get('/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id_user, name, email, coins, role FROM Users ORDER BY id_user ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar utilizadores:', err);
    res.status(500).json({ error: 'Erro ao carregar lista de utilizadores.' });
  }
});

// Atualizar utilizador (moedas ou cargo)
router.put('/admin/users/:id', async (req, res) => {
  const { coins, role } = req.body;
  const { id } = req.params;
  try {
    await pool.query('UPDATE Users SET coins = $1, role = $2 WHERE id_user = $3', [coins, role, id]);
    res.json({ message: 'Utilizador atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar utilizador:', err);
    res.status(500).json({ error: 'Erro ao guardar alterações do utilizador.' });
  }
});

// Eliminar utilizador
router.delete('/admin/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM Users WHERE id_user = $1', [id]);
    res.json({ message: 'Utilizador removido com sucesso!' });
  } catch (err) {
    console.error('Erro ao eliminar utilizador:', err);
    res.status(500).json({ error: 'Erro ao remover utilizador da base de dados.' });
  }
});

// ==========================================
// GESTÃO DE MODELOS DE CARTAS (cardmodel)
// ==========================================

// Listar todas as cartas modelo
router.get('/admin/cards', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cardmodel ORDER BY id_modelcard ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar modelos de cartas:', err);
    res.status(500).json({ error: 'Erro ao carregar modelos de cartas.' });
  }
});

// Adicionar nova carta modelo (com o campo classe)
router.post('/admin/cards', async (req, res) => {
  const { name, vida, tai, nin, image_url, classe } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO cardmodel (name, vida, tai, nin, image_url, classe) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, vida, tai, nin, image_url, classe || 'E']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Erro ao adicionar carta modelo:', err);
    res.status(500).json({ error: 'Erro ao inserir novo modelo de carta.' });
  }
});

// Editar carta modelo existente (com o campo classe)
router.put('/admin/cards/:id', async (req, res) => {
  const { name, vida, tai, nin, image_url, classe } = req.body;
  const { id } = req.params;
  try {
    await pool.query(
      `UPDATE cardmodel 
       SET name = $1, vida = $2, tai = $3, nin = $4, image_url = $5, classe = $6 
       WHERE id_modelcard = $7`,
      [name, vida, tai, nin, image_url, classe || 'E', id]
    );
    res.json({ message: 'Modelo de carta atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar carta modelo:', err);
    res.status(500).json({ error: 'Erro ao guardar alterações da carta.' });
  }
});

// Remover carta modelo
router.delete('/admin/cards/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM cardmodel WHERE id_modelcard = $1', [id]);
    res.json({ message: 'Modelo de carta removido com sucesso!' });
  } catch (err) {
    console.error('Erro ao remover carta modelo:', err);
    res.status(500).json({ error: 'Erro ao eliminar modelo de carta.' });
  }
});

module.exports = router;