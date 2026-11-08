/**
 * Módulo de upload para Backblaze B2 (S3 compatível)
 * Gera chave única e retorna URL pública do ficheiro uploadado
 * Inclui fallback para API REST direta quando a biblioteca b2-node falha
 */

const BackblazeB2 = require('backblaze-b2');

// Validar que as credenciais necessárias estão presentes
const REQUIRED_VARS = ['B2_ACCOUNT_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME'];
const missingVars = REQUIRED_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`⚠️ Variáveis de ambiente B2 não configuradas: ${missingVars.join(', ')}.`);
  console.error('   Funcionalidade de upload de imagens estará desativada até configurar as credenciais.');
}

const b2 = new BackblazeB2({
  accountId: process.env.B2_ACCOUNT_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

/**
 * Gera uma chave/caminho único para o ficheiro na B2
 * Formato: ${timestamp}-${random}-${originalName}
 * @param {string} originalName - Nome original do ficheiro (opcional, pode vir com extensão)
 * @returns {string} Chave única formatada para B2
 */
function generateKey(originalName) {
  const timestamp = Date.now().toString(36); // base36 para ser mais curto
  const random = Math.random().toString(36).slice(2, 8);
  const nameWithoutExt = originalName ? originalName.replace(/\.[^/.]+$/, '') : 'card-image';
  const ext = originalName ? originalName.match(/\.[^/.]+$/) || '' : '';
  return `${timestamp}-${random}-${nameWithoutExt}${ext}`;
}

/**
 * Faz upload de um buffer para o Backblaze B2 usando a biblioteca b2-node
 * @param {Buffer} buffer - Dados do ficheiro (imagem)
 * @param {string} originalName - Nome original do ficheiro
 * @returns {Promise<string>} URL pública do ficheiro uploadado
 */
async function uploadImageBufferLibrary(buffer, originalName) {
  if (!b2) {
    throw new Error('Cliente B2 não inicializado — verifique as credenciais B2_ACCOUNT_ID / B2_APPLICATION_KEY');
  }

  const key = generateKey(originalName);

  try {
    // Opções de upload para Backblaze B2 (S3 compatível)
    const uploadOptions = {
      bucketName: process.env.B2_BUCKET_NAME,
      fileName: key,           // chave única na B2
      data: buffer,            // buffer com os dados da imagem
    };

    // Alguns ambientes precisam do endpoint explícito para a B2
    // A Backblaze B2 usa: https://api.backblaze.com/b2api/v2/b2_upload_file
    // ou endpoint S3-compatível: https://backblaze.b2.cloud.storage
    // Tentamos sem endpoint primeiro, se falhar tentamos com endpoint

    let uploadResponse;
    try {
      uploadResponse = await b2.uploadFile(uploadOptions);
    } catch (err1) {
      // Se falhar e parecer erro de URL, tentar com endpoint S3-compatível da B2
      if (err1.message && err1.message.includes('Invalid URL')) {
        console.log('⚠️ Erro de URL detectado, tentando com endpoint S3-compatível da B2...');
        uploadOptions.endpoint = 'https://backblaze.b2.cloud.storage';
        uploadResponse = await b2.uploadFile(uploadOptions);
      } else {
        throw err1;
      }
    }

    // A URL pública segue o padrão S3-compatível da Backblaze
    // Formato: https://<bucket>.s3.amazonaws.com/<key> (ou a URL customizada da Backblaze)
    // Usamos a URL direta da resposta ou constroímos a nossa
    const publicUrl = uploadResponse.fileInfo.url + '/' + key;

    console.log(`✅ Imagem uploadada para B2 (biblioteca) — chave: ${key}, URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Erro ao upload para B2 (biblioteca):', error.message);
    throw new Error(`Falha no upload para Backblaze B2 (biblioteca): ${error.message}`);
  }
}

/**
 * Faz upload de um buffer para o Backblaze B2 usando a API REST direta
 * como fallback quando a biblioteca b2-node falha com "Invalid URL"
 * @param {Buffer} buffer - Dados do ficheiro (imagem)
 * @param {string} originalName - Nome original do ficheiro
 * @returns {Promise<string>} URL pública do ficheiro uploadado
 */
async function uploadImageBufferDirect(buffer, originalName) {
  // Credenciais da B2
  const accountId = process.env.B2_ACCOUNT_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const bucketName = process.env.B2_BUCKET_NAME;

  if (!accountId || !applicationKey || !bucketName) {
    throw new Error('Credenciais B2 incompletas para upload direto');
  }

  // 1. Get authorization token
  const authResponse = await fetch('https://api.backblaze.com/b2api/v2/b2_authorize_account', {
    method: 'GET',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountId}:${applicationKey}`).toString('base64')
    }
  });

  if (!authResponse.ok) {
    throw new Error('Falha ao obter token de autorização da B2');
  }

  const authData = await authResponse.json();
  const uploadUrl = authData.data.apiUrl + '/b2api/v2/b2_upload_file';

  // 2. Upload do ficheiro
  const key = generateKey(originalName);

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': authData.data.authorizationId,
      'X-Bz-File-Name': key,
    },
    body: buffer
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`Erro no upload B2 direto: ${uploadResponse.status} - ${errorText}`);
  }

  // 3. GET a URL pública
  // A B2 retorna a URL na resposta, ou construímos a partir do downloadUrl
  const result = await uploadResponse.json();

  // Construir URL pública - formato da B2
  const publicUrl = `${authData.data.downloadUrl}/${bucketName}/${key}`;

  console.log(`✅ Upload direto B2 — chave: ${key}, URL: ${publicUrl}`);
  return publicUrl;
}

/**
 * Faz upload de um buffer para o Backblaze B2
 * Tenta primeiro a biblioteca b2-node, fallback para API direta se falhar
 * @param {Buffer} buffer - Dados do ficheiro (imagem)
 * @param {string} originalName - Nome original do ficheiro (para preservar extensão)
 * @returns {Promise<string>} URL pública do ficheiro uploadado
 */
async function uploadImageBuffer(buffer, originalName) {
  // Tentar primeiro com a biblioteca b2-node, fallback para API direta se falhar
  try {
    if (!b2) {
      console.log('⚠️ Biblioteca B2 não disponível, tentando upload direto via API...');
      return await uploadImageBufferDirect(buffer, originalName);
    }

    return await uploadImageBufferLibrary(buffer, originalName);
  } catch (error) {
    console.error('❌ Erro no upload para B2:', error.message);
    // Fallback para upload direto
    try {
      console.log('🔄 Tentando upload direto via API...');
      return await uploadImageBufferDirect(buffer, originalName);
    } catch (err2) {
      console.error('❌ Erro também no upload direto:', err2.message);
      throw new Error(`Falha no upload para Backblaze B2: ${error.message}`);
    }
  }
}

/**
 * Verifica se a string parece ser um base64 data URL de imagem
 * @param {string} str - String a verificar
 * @returns {boolean} true se parecer base64 data URL de imagem
 */
function isBase64Image(str) {
  return typeof str === 'string' && /^data:image\/[a-z0-9.+\-]+;base64,/i.test(str);
}

module.exports = {
  uploadImageBuffer,
  uploadImageBufferDirect,
  uploadImageBufferLibrary,
  generateKey,
  isBase64Image,
};