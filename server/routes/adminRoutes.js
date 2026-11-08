const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const b2Upload = require('../lib/b2Upload');

// JWT válido (requireAuth) + role lido FRESCO da base de dados (requireAdmin).
const verifyAdmin = [requireAuth, requireAdmin];

// A verificação aplica-se APENAS a /admin/*.
router.use('/admin', verifyAdmin);

// ==========================================
// FUNÇÃO AUXILIAR: processar image_url para B2
// ==========================================

// Limite máximo de imagem (2MB) — igual ao frontend
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Erro com código HTTP para as rotas responderem corretamente
class ImageError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Processa o campo image_url vindo do corpo do pedido.
 *  - vazio/undefined/null      -> devolve null (sem imagem nova)
 *  - URL externa (http/https)  -> mantém
 *  - data URL base64           -> valida, faz upload para B2 e devolve a URL pública
 *  - qualquer outra coisa      -> ImageError 400
 * Se o upload falhar lança ImageError 502 (nunca grava base64 nem apaga a imagem existente).
 */
async function processImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return imageUrl;

  if (b2Upload.isBase64Image(imageUrl)) {
    let parsed;
    try {
      parsed = b2Upload.parseImageDataUrl(imageUrl);
    } catch (err) {
      throw new ImageError(err.message, 400);
    }
    const { buffer, mime, ext } = parsed;
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new ImageError(
        `Imagem demasiado grande (${(buffer.length / 1024 / 1024).toFixed(2)} MB). Máximo: 2 MB.`,
        400
      );
    }
    try {
      return await b2Upload.uploadImageBuffer(buffer, 'card-' + Date.now() + ext, mime);
    } catch (err) {
      console.error('⚠️ Erro ao fazer upload da imagem para B2:', err.message);
      throw new ImageError('Falha ao enviar a imagem para o armazenamento (B2).', 502);
    }
  }

  throw new ImageError('image_url inválido: use um URL http(s) ou um data URL de imagem.', 400);
}

// ==========================================
// GESTÃO DE UTILIZADORES
// ==========================================

router.get('/admin/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id_user, name, email, coins, role FROM Users ORDER BY id_user ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar utilizadores:', err);
    res.status(500).json({ error: 'Erro ao carregar lista de utilizadores.' });
  }
});

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

router.get('/admin/cards', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM cardmodel ORDER BY id_modelcard ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Erro ao listar modelos de cartas:', err);
    res.status(500).json({ error: 'Erro ao carregar modelos de cartas.' });
  }
});

// Adicionar nova carta modelo
router.post('/admin/cards', async (req, res) => {
  const { name, vida, tai, nin, image_url, classe } = req.body;
  try {
    // Falha de upload => erro claro (não cria a carta sem imagem em silêncio)
    const processedImageUrl = await processImageUrl(image_url);
    const result = await pool.query(
      `INSERT INTO cardmodel (name, vida, tai, nin, image_url, classe)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, vida, tai, nin, processedImageUrl, classe || 'E']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err instanceof ImageError) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao adicionar carta modelo:', err.message, err.type);
    res.status(500).json({ error: 'Erro ao inserir novo modelo de carta.' });
  }
});

// Editar carta modelo existente
router.put('/admin/cards/:id', async (req, res) => {
  const { name, vida, tai, nin, image_url, classe } = req.body;
  const { id } = req.params;
  try {
    const processedImageUrl = await processImageUrl(image_url);
    // COALESCE: se não veio imagem nova, mantém a que já existe (nunca apaga por engano)
    const result = await pool.query(
      `UPDATE cardmodel
       SET name = $1, vida = $2, tai = $3, nin = $4,
           image_url = COALESCE($5, image_url), classe = $6
       WHERE id_modelcard = $7`,
      [name, vida, tai, nin, processedImageUrl, classe || 'E', id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Modelo de carta não encontrado.' });
    }
    res.json({ message: 'Modelo de carta atualizado com sucesso!' });
  } catch (err) {
    if (err instanceof ImageError) return res.status(err.status).json({ error: err.message });
    console.error('Erro ao atualizar carta modelo:', err.message, err.type);
    res.status(500).json({ error: 'Erro ao guardar alterações da carta.' });
  }
});

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
// Body: { image_base64: "data:image/...;base64,..." }
// Retorna: { image_url: "https://..." }
router.post('/admin/card-image-upload', async (req, res) => {
  try {
    const { image_base64 } = req.body;
    if (!image_base64) {
      return res.status(400).json({ error: 'Campo image_base64 é obrigatório.' });
    }
    if (!b2Upload.isBase64Image(image_base64)) {
      return res.status(400).json({ error: 'O campo image_base64 deve ser um data URL de imagem (data:image/...;base64,...).' });
    }
    const imageUrl = await processImageUrl(image_base64);
    res.json({ image_url: imageUrl });
  } catch (err) {
    if (err instanceof ImageError) return res.status(err.status).json({ error: err.message });
    console.error('Erro no upload de imagem B2:', err.message);
    res.status(500).json({ error: 'Falha no upload para Backblaze B2.' });
  }
});

module.exports = router;
