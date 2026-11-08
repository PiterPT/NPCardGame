/**
 * Script de migração: Converter imagens base64 na BD para Supabase Storage
 * 
 * Este script deve ser executado uma vez após a configuração do Supabase Storage.
 * 
 * Usage: node server/scripts/migrateImagesToB2.js
 * 
 * O script:
   1. Lê todas as cartas da tabela cardmodel
   2. Para cada image_url que for base64 data URL:
      - Decodifica o base64
      - Faz upload para Supabase Storage usando Service Role Key
      - Atualiza o registo na BD com a nova URL pública
   3. URLs externas (https?://) são mantidas inalteradas
   4. image_url nulos/empty são mantidos como estão
*/

const { query } = require('../config/db');
const supabaseStorage = require('../lib/supabaseStorage');

async function migrateImagesToSupabase() {
  console.log('🔄 Iniciando migração de imagens para Supabase Storage...\n');

  try {
    // 1. Buscar todas as cartas
    const result = await query(
      'SELECT id_modelcard, image_url FROM cardmodel WHERE image_url IS NOT NULL'
    );
    const cards = result.rows;
    console.log(`📊 Encontradas ${cards.length} cartas com image_url.\n`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const card of cards) {
      const { id_modelcard, image_url } = card;

      // Se já for URL externa (https?://), pular (já está em storage externo)
      if (image_url && /^https?:\/\//i.test(image_url)) {
        console.log(`⏭️  Carta #${id_modelcard}: já tem URL externa, a manter.`);
        skipped++;
        continue;
      }

      // Se for base64 data URL, fazer migrate
      if (image_url && /^data:image\/[a-z0-9.+\-]+;base64,/i.test(image_url)) {
        try {
          console.log(`🔧 Migrando carta #${id_modelcard}...`);

          // Decodificar base64 (remover prefixo data:)
          const base64Data = image_url.replace(/^data:image\/[a-z0-9.+\-]+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          // Fazer upload para Supabase Storage
          const result = await supabaseStorage.migrateBase64ToSupabase(image_url, id_modelcard);

          if (result.success && result.storageUrl) {
            // Atualizar BD com a nova URL
            await query(
              'UPDATE cardmodel SET image_url = $1 WHERE id_modelcard = $2',
              [result.storageUrl, id_modelcard]
            );
            console.log(`   ✅ Carta #${id_modelcard} → ${result.storageUrl}`);
            migrated++;
          } else {
            console.log(`   ⚠️  Carta #${id_modelcard}: ${result.message}`);
            errors++;
          }
        } catch (err) {
          console.error(`   ❌ Erro ao migrar carta #${id_modelcard}:`, err.message);
          errors++;
        }
      } else {
        // Tipo desconhecido ou vazio - manter como está
        console.log(`ℹ️  Carta #${id_modelcard}: image_url não é base64 nem URL externa, a manter.`);
        skipped++;
      }
    }

    console.log('\n📈 Resumo da migração:');
    console.log(`   • Migradas: ${migrated}`);
    console.log(`   • Mantidas (URL externa): ${skipped - migrated}`);
    console.log(`   • Com erro: ${errors}`);
    console.log(`   • Total processadas: ${cards.length}`);

    if (errors === 0) {
      console.log('\n✅ Migração concluída com sucesso!');
    } else {
      console.log(`\n⚠️  Migração concluída com ${errors} erro(s). Revise os logs acima.`);
    }
  } catch (err) {
    console.error('❌ Erro crítico na migração:', err);
  }
}

// Executar se este arquivo for chamado diretamente
if (require.main === module) {
  migrateImagesToSupabase().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateImagesToSupabase };