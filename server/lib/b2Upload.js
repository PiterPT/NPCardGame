/**
 * Módulo de upload para Backblaze B2 (API nativa REST v2).
 *
 * Usa apenas fetch (Node 18+) e crypto — não depende do pacote 'backblaze-b2'.
 * Fluxo: b2_authorize_account -> (b2_list_buckets, se preciso) -> b2_get_upload_url -> upload.
 * A autorização é guardada em memória (válida 24h) e refeita automaticamente se expirar.
 */
const crypto = require('crypto');

const REQUIRED_VARS = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME'];
const missingVars = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`⚠️ Variáveis de ambiente B2 não configuradas: ${missingVars.join(', ')}.`);
  console.error('   Funcionalidade de upload de imagens estará desativada até configurar as credenciais.');
}

// Lidas no momento do uso (o .env pode ser carregado depois deste módulo)
const cfg = () => ({
  keyId: process.env.B2_KEY_ID,
  appKey: process.env.B2_APPLICATION_KEY,
  bucketName: process.env.B2_BUCKET_NAME,
  bucketIdEnv: process.env.B2_BUCKET_ID, // opcional
});

// ------------------------------------------------------------
// Tipos de imagem permitidos (SVG excluído de propósito: pode conter scripts)
// ------------------------------------------------------------
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const DATA_URL_REGEX = /^data:(image\/[a-z0-9.+\-]+);base64,/i;

function isBase64Image(str) {
  return typeof str === 'string' && DATA_URL_REGEX.test(str);
}

/**
 * Interpreta um data URL de imagem.
 * @returns {{ buffer: Buffer, mime: string, ext: string }}
 * @throws Error se o formato não for suportado
 */
function parseImageDataUrl(dataUrl) {
  const match = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_REGEX) : null;
  if (!match) throw new Error('Data URL de imagem inválido.');
  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) throw new Error(`Formato de imagem não suportado (${mime}). Use JPEG, PNG, WebP ou GIF.`);
  const buffer = Buffer.from(dataUrl.slice(match[0].length), 'base64');
  return { buffer, mime, ext };
}

function guessMimeFromName(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  const ext = m ? '.' + m[1].toLowerCase() : '';
  const found = Object.entries(MIME_TO_EXT).find(([, e]) => e === ext);
  return found ? found[0] : 'b2/x-auto';
}

// ------------------------------------------------------------
// Autorização (com cache em memória)
// ------------------------------------------------------------
let authCache = null; // { apiUrl, downloadUrl, authToken, bucketId, expiresAt }
const AUTH_TTL_MS = 23 * 60 * 60 * 1000; // tokens duram 24h; renova com folga

async function getAuth() {
  if (authCache && authCache.expiresAt > Date.now()) return authCache;

  const { keyId, appKey, bucketName, bucketIdEnv } = cfg();
  if (!keyId || !appKey || !bucketName) {
    throw new Error('Credenciais B2 incompletas para upload');
  }

  const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    method: 'GET',
    headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${appKey}`).toString('base64') },
  });
  if (!authResponse.ok) {
    throw new Error(`Falha ao obter token de autorização da B2: ${authResponse.status} - ${await authResponse.text()}`);
  }
  const authData = await authResponse.json();
  if (!authData.apiUrl || !authData.downloadUrl || !authData.authorizationToken) {
    console.error('❌ Estrutura inesperada na resposta de auth B2:', JSON.stringify(authData, null, 2));
    throw new Error('Resposta de autenticação B2 inválida - estrutura inesperada');
  }

  // bucketId: chave restrita a um bucket -> allowed.bucketId; senão B2_BUCKET_ID; senão resolve por nome
  let bucketId = authData.allowed?.bucketId || bucketIdEnv;
  if (!bucketId) {
    const listRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_list_buckets`, {
      method: 'POST',
      headers: { Authorization: authData.authorizationToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: authData.accountId, bucketName }),
    });
    if (!listRes.ok) {
      throw new Error(`Falha ao listar buckets: ${listRes.status} - ${await listRes.text()}`);
    }
    bucketId = (await listRes.json()).buckets?.[0]?.bucketId;
  }
  if (!bucketId) throw new Error('Bucket ID não encontrado (verifique B2_BUCKET_NAME / B2_BUCKET_ID)');

  authCache = {
    apiUrl: authData.apiUrl,
    downloadUrl: authData.downloadUrl,
    authToken: authData.authorizationToken,
    bucketId,
    expiresAt: Date.now() + AUTH_TTL_MS,
  };
  return authCache;
}

// ------------------------------------------------------------
// Upload
// ------------------------------------------------------------
async function attemptUpload(buffer, key, mime) {
  const auth = await getAuth();

  const uploadUrlResponse = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: { Authorization: auth.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: auth.bucketId }),
  });
  if (!uploadUrlResponse.ok) {
    const err = new Error(`Falha ao obter upload URL: ${uploadUrlResponse.status} - ${await uploadUrlResponse.text()}`);
    err.status = uploadUrlResponse.status;
    throw err;
  }
  const { uploadUrl, authorizationToken: uploadAuthToken } = await uploadUrlResponse.json();

  // A B2 exige o SHA1 do conteúdo (hex)
  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: uploadAuthToken,
      // Codifica cada segmento mas mantém as '/' (a B2 espera barras literais)
      'X-Bz-File-Name': key.split('/').map(encodeURIComponent).join('/'),
      'Content-Type': mime || 'b2/x-auto',
      'X-Bz-Content-Sha1': sha1,
    },
    body: buffer,
  });
  if (!uploadResponse.ok) {
    const err = new Error(`Erro no upload B2: ${uploadResponse.status} - ${await uploadResponse.text()}`);
    err.status = uploadResponse.status;
    throw err;
  }
  await uploadResponse.json();

  return `${auth.downloadUrl}/file/${cfg().bucketName}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Faz upload de um buffer para o B2 e devolve a URL pública.
 * @param {Buffer} buffer
 * @param {string} originalName - deve incluir a extensão (ex.: 'card-123.png')
 * @param {string} [mime] - content-type; se omitido, deduz da extensão
 */
async function uploadImageBuffer(buffer, originalName, mime) {
  const key = generateKey(originalName);
  const contentType = mime || guessMimeFromName(originalName);

  try {
    let url;
    try {
      url = await attemptUpload(buffer, key, contentType);
    } catch (err) {
      // Token expirado/inválido ou falha temporária (401/5xx): renova a autorização e tenta uma vez
      if (err.status === 401 || err.status >= 500) {
        console.warn(`⚠️ Upload B2 falhou (${err.status}), a renovar autorização e a repetir...`);
        authCache = null;
        url = await attemptUpload(buffer, key, contentType);
      } else {
        throw err;
      }
    }
    console.log(`✅ Upload B2 — chave: ${key}, URL: ${url}`);
    return url;
  } catch (error) {
    console.error('❌ Erro ao upload para B2:', error.message);
    throw error;
  }
}

// Mantido por compatibilidade com código que importava o nome antigo
const uploadImageBufferDirect = uploadImageBuffer;

// Prefixo obrigatório das chaves de ficheiro. A Application Key está restrita a "cards/"
// (namePrefix), por isso todos os ficheiros têm de começar por aqui.
// Pode ser alterado com B2_FILE_PREFIX no .env (use '' se a chave não tiver prefixo).
function filePrefix() {
  const p = process.env.B2_FILE_PREFIX !== undefined ? process.env.B2_FILE_PREFIX : 'cards/';
  return p && !p.endsWith('/') ? p + '/' : p;
}

/**
 * Gera uma chave única: ${prefixo}${timestamp}-${random}-${nome}${ext}
 */
function generateKey(originalName) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const nameWithoutExt = originalName ? originalName.replace(/\.[^/.]+$/, '') : 'card-image';
  const extMatch = originalName ? originalName.match(/\.[^/.]+$/) : null;
  const ext = extMatch ? extMatch[0] : '';
  return `${filePrefix()}${timestamp}-${random}-${nameWithoutExt}${ext}`;
}

module.exports = {
  uploadImageBuffer,
  uploadImageBufferDirect,
  generateKey,
  isBase64Image,
  parseImageDataUrl,
};
