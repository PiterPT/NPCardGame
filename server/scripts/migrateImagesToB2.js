/**
 * Script de migração: Converter imagens base64 na BD para Backblaze B2
 * 
 * Este script deve ser executado uma vez após a configuração do Backblaze B2.
 * 
 * Usage: node server/scripts/migrateImagesToB2.js
 * 
 * O script:
   1. Lê todas as cartas da tabela cardmodel
   2. Para cada image_url que for base64 data URL:
      - Decodifica o base64
      - Faz upload para Backblaze B2
      - Atualiza o registo na BD com a nova URL pública
   3. URLs externas (https?://) são mantidas inalteradas
   4. image_url nulos/empty são mantidos como estão
*/

const { query } = require('../config/db');
const b2Upload = require('../lib/b2Upload');

async function migrateImagesToB2() {
  console.log('🔄 Iniciando migração de imagens para Backblaze B2...\n');

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

          // Validar tamanho (máx 2MB)
          const maxSize = 2 * 1024 * 1024;
          if (buffer.length > maxSize) {
            console.log(`   ⚠️  Carta #${id_modelcard}: imagem demasiado grande (${(buffer.length / 1024 / 1024).toFixed(2)} MB > 2MB), a ignorar.`);
            errors++;
            continue;
          }

          // Fazer upload para Backblaze B2
          const b2Url = await b2Upload.uploadImageBuffer(buffer, `card-${id_modelcard}-${Date.now()}`);

          // Atualizar BD com a nova URL
          await query(
            'UPDATE cardmodel SET image_url = $1 WHERE id_modelcard = $2',
            [b2Url, id_modelcard]
          );

          console.log(`   ✅ Carta #${id_modelcard} → ${b2Url}`);
          migrated++;
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
    console.log(`   • Mantidas (URL externa): ${skipped}`);
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
  migrateImagesToB2().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { migrateImagesToB2 };