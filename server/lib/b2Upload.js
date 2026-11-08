/**
 * Módulo de upload para Backblaze B2 (S3 compatível)
 * 
 * Este módulo foi desenhado para funcionar mesmo sem o pacote 'backblaze-b2'
 * instalado, usando a API REST direta da Backblaze desde o início.
 * 
 * Se o pacote backblaze-b2 estiver disponível, tenta usá-lo como primeiro
 * esforço, fazendo fallback para a API REST direta se falhar.
 * Se o pacote NÃO estiver disponível, usa imediatamente a API REST direta.
 */

// Validar variáveis de ambiente necessárias ANTES de tentar carregar o pacote
const REQUIRED_VARS = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_NAME'];
const missingVars = REQUIRED_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`⚠️ Variáveis de ambiente B2 não configuradas: ${missingVars.join(', ')}.`);
  console.error('   Funcionalidade de upload de imagens estará desativada até configurar as credenciais.');
}

// Variáveis de ambiente
const B2_KEY_ID = process.env.B2_KEY_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;

// Tentar carregar a biblioteca b2-node, mas tornar opcional
let b2 = null;
try {
  const BackblazeB2 = require('backblaze-b2');
  b2 = new BackblazeB2({
    accountId: B2_KEY_ID,
    applicationKey: B2_APPLICATION_KEY,
  });
  console.log('✅ Biblioteca b2-node carregada com sucesso');
} catch (e) {
  console.log('⚠️ Biblioteca backblaze-b2 não instalada - usando API REST direta desde o início');
}

// ============================================================
// Funções de Upload para Backblaze B2
// ============================================================

/**
 * Fazer upload de um buffer para o Backblaze B2 usando a biblioteca b2-node
 * @param {Buffer} buffer - Dados do ficheiro (imagem)
 * @param {string} originalName - Nome original do ficheiro
 * @returns {Promise<string>} URL pública do ficheiro uploadado
 */
async function uploadImageBufferLibrary(buffer, originalName) {
  if (!b2) {
    throw new Error('Cliente B2 não inicializado - usando API REST direta');
  }

  const key = generateKey(originalName);

  try {
    const uploadOptions = {
      bucketName: B2_BUCKET_NAME,
      fileName: key,
      data: buffer,
    };

    let uploadResponse;
    try {
      uploadResponse = await b2.uploadFile(uploadOptions);
    } catch (err1) {
      if (err1.message && err1.message.includes('Invalid URL')) {
        console.log('⚠️ Erro de URL detectado, tentando com endpoint S3-compatível...');
        // Se a b2-node tiver beengiven um endpoint opcional, usá-lo
        try {
          uploadOptions.endpoint = 'https://backblaze.b2.cloud.storage';
          uploadResponse = await b2.uploadFile(uploadOptions);
        } catch (err2) {
          throw err1;
        }
      } else {
        throw err1;
      }
    }

    const publicUrl = uploadResponse.fileInfo.url + '/' + key;
    console.log(`✅ Imagem uploadada para B2 (biblioteca) — chave: ${key}, URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Erro ao upload para B2 (biblioteca):', error.message);
    throw error;
  }
}

/**
 * Fazer upload de um buffer para o Backblaze B2 usando a API REST direta
 * @param {Buffer} buffer - Dados do ficheiro (imagem)
 * @param {string} originalName - Nome original do ficheiro
 * @returns {Promise<string>} URL pública do ficheiro uploadado
 */
async function uploadImageBufferDirect(buffer, originalName) {
  if (!B2_KEY_ID || !B2_APPLICATION_KEY || !B2_BUCKET_NAME) {
    throw new Error('Credenciais B2 incompletas para upload direto');
  }

  try {
    // 1. Get authorization token
    const authResponse = await fetch('https://api.backblaze.com/b2api/v2/b2_authorize_account', {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${B2_KEY_ID}:${B2_APPLICATION_KEY}`).toString('base64')
      }
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      throw new Error(`Falha ao obter token de autorização da B2: ${authResponse.status} - ${errorText}`);
    }

    const authData = await authResponse.json();
    
    // A B2 API retorna os campos no root level (não em data)
    // Verificar campos obrigatórios
    if (!authData.apiUrl || !authData.downloadUrl || !authData.authorizationToken) {
      console.error('❌ Estrutura inesperada na resposta de auth B2:', JSON.stringify(authData, null, 2));
      throw new Error('Resposta de autenticação B2 inválida - estrutura inesperada');
    }
    
    const uploadUrl = authData.apiUrl + '/b2api/v2/b2_upload_file';
    const authToken = authData.authorizationToken;
    const downloadUrl = authData.downloadUrl;

    // 2. Upload do ficheiro
    const key = generateKey(originalName);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': authToken,
        'X-Bz-File-Name': key,
      },
      body: buffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Erro no upload B2 direto: ${uploadResponse.status} - ${errorText}`);
    }

    // 3. GET a URL pública
    const result = await uploadResponse.json();
    const publicUrl = `${downloadUrl}/file/${B2_BUCKET_NAME}/${key}`;

    console.log(`✅ Upload direto B2 — chave: ${key}, URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Erro ao upload para B2 (API direta):', error.message);
    throw error;
  }
}

/**
 * Fazer upload de um buffer para o Backblaze B2
 * Tenta usar a biblioteca b2-node primeiro, fallback para API REST direta
 * @param {Buffer} buffer - Dados do ficheiro (imagem)
 * @param {string} originalName - Nome original do ficheiro (para preservar extensão)
 * @returns {Promise<string>} URL pública do ficheiro uploadado
 */
async function uploadImageBuffer(buffer, originalName) {
  // Se a biblioteca b2-node estiver disponível, tentar usá-la primeiro
  if (b2) {
    try {
      console.log('🔨 Tentando upload via biblioteca b2-node...');
      const result = await uploadImageBufferLibrary(buffer, originalName);
      console.log('✅ Upload via biblioteca b2-node bem-sucedido');
      return result;
    } catch (b2Error) {
      console.log('⚠️ Biblioteca b2-node falhou, tentando API REST direta...');
      console.log('   Erro da biblioteca:', b2Error.message);
    }
  }

  // Fallback: usar API REST direta
  console.log('🌐 Usando API REST direta da B2');
  return await uploadImageBufferDirect(buffer, originalName);
}

/**
 * Gerar uma chave única para o ficheiro na B2
 * Formato: ${timestamp}-${random}-${originalName}
 * @param {string} originalName - Nome original do ficheiro
 * @returns {string} Chave única formatada para B2
 */
function generateKey(originalName) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  const nameWithoutExt = originalName ? originalName.replace(/\.[^/.]+$/, '') : 'card-image';
  const ext = originalName ? originalName.match(/\.[^/.]+$/) || '' : '';
  return `${timestamp}-${random}-${nameWithoutExt}${ext}`;
}

/**
 * Verificar se a string parece ser um base64 data URL de imagem
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