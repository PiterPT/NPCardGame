const express = require('express');
const { Readable } = require('stream');
const b2Upload = require('../lib/b2Upload');

const router = express.Router();

// GET /img/cards/<ficheiro>  -> serve a imagem do bucket privado da B2.
// Rota pública (um <img> não envia Bearer token), mas só serve chaves dentro do prefixo permitido.
router.get(/^\/(.+)$/, async (req, res) => {
  try {
    const key = req.params[0];
    const prefix = b2Upload.filePrefix();

    if (key.includes('..') || key.includes('\\') || !key.startsWith(prefix)) {
      return res.status(400).json({ error: 'Caminho inválido.' });
    }

    const extra = {};
    if (req.headers['if-none-match']) extra['If-None-Match'] = req.headers['if-none-match'];

    const upstream = await b2Upload.downloadFile(key, extra);

    if (upstream.status === 304) return res.status(304).end();
    if (upstream.status === 404) return res.status(404).json({ error: 'Imagem não encontrada.' });
    if (!upstream.ok) {
      console.error('Erro a servir imagem B2:', upstream.status, key);
      return res.status(502).json({ error: 'Falha ao obter a imagem.' });
    }

    const type = upstream.headers.get('content-type') || 'application/octet-stream';
    // Só serve imagens (nunca HTML/SVG a partir deste endpoint)
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(type)) {
      return res.status(415).json({ error: 'Tipo de ficheiro não suportado.' });
    }

    res.set('Content-Type', type);
    const len = upstream.headers.get('content-length');
    if (len) res.set('Content-Length', len);
    const etag = upstream.headers.get('etag');
    if (etag) res.set('ETag', etag);
    // Os nomes são únicos (timestamp + random), por isso pode ficar em cache "para sempre"
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.set('X-Content-Type-Options', 'nosniff');

    Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    console.error('Erro na rota /img:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Erro ao obter a imagem.' });
  }
});

module.exports = router;
