/**
 * Módulo de armazenamento de imagens — Supabase Storage
 * 
 * Utiliza a API REST do Supabase Storage com Service Role Key
 * para fazer upload real das imagens da base de dados.
 * 
 * O Storage do Supabase armazena ficheiros separadamente do PostgreSQL,
 * e as URLs são servidas via endpoint https://project.supabase.co/storage/v1...
 * 
 * Node.js 22 tem fetch nativo, sem necessidade de node-fetch.
 */

const { query } = require('../config/db');

// Carregar variáveis de ambiente do .env do projeto (mesmo padrão do server/index.js)
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://npcardgame.onrender.com';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Faz upload de um buffer para o Supabase Storage
 * Usa a API REST do Supabase com Service Role Key para autenticação
 * Usa fetch nativo do Node.js 22 (não precisa de node-fetch)
 * 
 * O endpoint correto para URLs assinadas do Supabase Storage:
 * GET /rest/v1/object/sign?bucket={bucketName}&name={path}&expiresIn={seconds}
 * 
 * @param {Buffer} buffer - Dados da imagem
 * @param {string} path - Caminho no bucket (ex: "NPImages/filename")
 * @param {string} bucketName - Nome do bucket (default: "NPImages" - bucket do projeto NPImages)
 * @returns {Promise<Object>} Resultado com url e status
 */
async function uploadImageToSupabaseStorage(buffer, path, bucketName = 'NPImages') {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada - não é possível fazer upload');
  }

  try {
    // Step 1: Get a signed URL for upload using Supabase Storage API
    // Endpoint correto: /rest/v1/object/sign com query parameters
    const signUrl = `${SUPABASE_URL}/rest/v1/object/sign?bucket=${encodeURIComponent(bucketName)}&name=${encodeURIComponent(path)}&expiresIn=${86400}`;
    
    const signResponse = await fetch(signUrl, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!signResponse.ok) {
      const errorText = await signResponse.text();
      throw new Error(`Erro ao gerar URL assinada: ${signResponse.status} - ${errorText}`);
    }

    const signData = await signResponse.json();
    const uploadUrl = signData.signedUrl;

    // Step 2: Upload the file to the signed URL usando fetch nativo
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/*',
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Erro no upload do ficheiro: ${uploadResponse.status} - ${errorText}`);
    }

    // Step 3: Retornar a URL assinada (funciona com buckets privados)
    // A signedUrl já inclui o token de acesso temporário (24h)
    console.log(`✅ Imagem uploadada para Supabase Storage — path: ${path}, signedUrl: ${uploadUrl}`);
    
    return {
      success: true,
      storageUrl: uploadUrl,
      key: path,
    };
  } catch (error) {
    console.error('❌ Erro ao upload para Supabase Storage:', error.message);
    throw error;
  }
}

/**
 * Converte base64 da BD para URL do Supabase Storage
 * 
 * @param {string} base64DataURL - data URL da imagem (ex: data:image/png;base64,...)
 * @param {number} cardId - ID da carta na BD
 * @param {string} bucketName - Nome do bucket Supabase
 * @returns {Promise<Object>} Resultado com url, key e status
 */
async function migrateBase64ToSupabase(base64DataURL, cardId, bucketName = 'NPImages') {
  try {
    // Decodificar base64
    const base64Data = base64DataURL.replace(/^data:image\/[a-z0-9.+\-]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Detectar extensão a partir do data URL ou usar png padrão
    const extMatch = base64DataURL.match(/data:image\/[a-z0-9.+\-]+;base64,(.+)$/i);
    const ext = extMatch ? extMatch[1].split('/')[1] : 'png';
    const fileName = `card-${cardId}-${Date.now()}.${ext}`;
    const path = `${bucketName}/${fileName}`;
    
    // Fazer upload para Supabase Storage
    const result = await uploadImageToSupabaseStorage(buffer, path, bucketName);
    
    return {
      success: result.success,
      storageUrl: result.storageUrl,
      key: result.key,
      message: result.success 
        ? 'Imagem migrada com sucesso para Supabase Storage' 
        : 'Falha na migração'
    };
  } catch (err) {
    console.error('❌ Erro ao migrar base64 para Supabase:', err.message);
    return {
      success: false,
      error: err.message,
      storageUrl: null,
      message: 'Falha na migração - manter base64 original'
    };
  }
}

/**
 * Função principal para migrar todas as imagens da BD
 * 
 * @param {string} bucketName - Nome do bucket Supabase
 * @returns {Promise<Object>} Resumo da migração
 */
async function migrateAllImagesToSupabase(bucketName = 'NPImages') {
  try {
    // Conectar no PostgreSQL
    const { query } = require('../config/db');
    
    // Buscar todas as cartas com image_url não nulo
    const result = await query(
      'SELECT id_modelcard, image_url FROM cardmodel WHERE image_url IS NOT NULL AND image_url != \'\''
    );
    const cards = result.rows;
    
    console.log(`📊 Encontradas ${cards.length} cartas com image_url para migrar.\n`);
    
    let migrated = 0;
    let failed = 0;
    let skipped = 0;

    for (const card of cards) {
      const { id_modelcard, image_url } = card;

      // Se já for URL externa (https?://), pular
      if (image_url && /^https?:\/\//i.test(image_url)) {
        console.log(`⏭️  Carta #${id_modelcard}: já tem URL externa, a manter.`);
        skipped++;
        continue;
      }

      // Se for base64 data URL, fazer migrate
      if (image_url && /^data:image\/[a-z0-9.+\-]+;base64,/i.test(image_url)) {
        try {
          console.log(`🔧 Migrando carta #${id_modelcard}...`);
          
          const result = await migrateBase64ToSupabase(image_url, id_modelcard, bucketName);
          
          if (result.success && result.storageUrl) {
            // Atualizar a BD com a nova URL
            await query(
              'UPDATE cardmodel SET image_url = $1 WHERE id_modelcard = $2',
              [result.storageUrl, id_modelcard]
            );
            console.log(`   ✅ Carta #${id_modelcard} → ${result.storageUrl}`);
            migrated++;
          } else {
            console.log(`   ⚠️  Carta #${id_modelcard}: ${result.message}`);
            failed++;
          }
        } catch (err) {
          console.error(`   ❌ Erro ao migrar carta #${id_modelcard}:`, err.message);
          failed++;
        }
      } else {
        // Tipo desconhecido - manter como está
        console.log(`ℹ️  Carta #${id_modelcard}: image_url não é base64 nem URL externa, a manter.`);
        skipped++;
      }
    }

    console.log('\n📈 Resumo da migração:');
    console.log(`   • Migradas: ${migrated}`);
    console.log(`   • Com erro: ${failed}`);
    console.log(`   • Mantidas (URL externa/vazia): ${skipped}`);
    console.log(`   • Total processadas: ${cards.length}`);

    if (failed === 0) {
      console.log('\n✅ Migração concluída com sucesso!');
    } else {
      console.log(`\n⚠️  Migração concluída com ${failed} erro(s). Revise os logs acima.`);
    }

    return {
      total: cards.length,
      migrated,
      failed,
      skipped,
    };
  } catch (err) {
    console.error('❌ Erro crítico na migração:', err);
    throw err;
  }
}

module.exports = {
  generateKey,
  uploadImageToSupabaseStorage,
  migrateBase64ToSupabase,
  migrateAllImagesToSupabase,
};