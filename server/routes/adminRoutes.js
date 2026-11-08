const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const b2Upload = require('../lib/b2Upload');

// Middleware para verificar se o utilizador tem o cargo de Admin.
// MIGRAÇÃO: antes bastava um cabeçalho "admin-id" forjado pelo cliente (IDs sequenciais,
// enumeráveis). Agora: JWT válido (requireAuth) + role lido FRESCO da base de dados (requireAdmin).
const verifyAdmin = [requireAuth, requireAdmin];

// CORREÇÃO: a verificação aplica-se APENAS a /admin/*.
// Antes, router.use(verifyAdmin) sem caminho intercetava TODOS os pedidos /api/* que passassem
// por este router (perfil, cards/sell, cards/feed, gacha...) e devolvia "Acesso negado" a utilizadores normais.
router.use('/admin', verifyAdmin);

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

// ==========================================
// UPLOAD DE IMAGEM PARA B2
// ==========================================
// Endpoint para fazer upload de uma imagem para o Backblaze B2.
// Body aceita: { image_base64: "data:image/...;base64,..." }
// Retorna: { image_url: "https://..." } — URL pública para guardar na coluna image_url da cardmodel
router.post('/admin/card-image-upload', async (req, res) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64) {
      return res.status(400).json({ error: 'Campo image_base64 é obrigatório.' });
    }
    if (!b2Upload.isBase64Image(image_base64)) {
      return res.status(400).json({ error: 'O campo image_base64 deve ser um data URL de imagem (data:image/...;base64,...).' });
    }
    // Extrair o buffer removendo o prefixo data:
    const base64Data = image_base64.replace(/^data:image\/[a-z0-9.+\-]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const imageUrl = await b2Upload.uploadImageBuffer(buffer, 'card-upload-' + Date.now());
    res.json({ image_url: imageUrl });
  } catch (err) {
    console.error('Erro no upload de imagem B2:', err.message);
    res.status(500).json({ error: 'Falha no upload para Backblaze B2: ' + err.message });
  }
});

module.exports = router;