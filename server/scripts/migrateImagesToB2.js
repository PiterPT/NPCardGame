/**
 * @deprecated Este script era para migrar imagens base64 antigas para B2.
 * Como o fluxo atual NÃO guarda base64 na BD (apenas URLs B2 ou null),
 * este script NÃO é mais necessário.
 * 
 * Se houver imagens base64 legadas na BD, pode-se executar manualmente,
 * mas o fluxo atual NÃO guarda base64 — apenas URLs B2 ou null.
 */

const { query } = require('../config/db');
const b2Upload = require('../lib/b2Upload');

async function migrateImagesToB2() {
  console.log('⚠️  Script de migração LEGADO — não deve ser usado no fluxo atual.');
  console.log('   O fluxo atual NÃO guarda base64 na BD (apenas URLs B2 ou null).');
  
  try {
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

          const base64Data = image_url.replace(/^data:image\/[a-z0-9.+\-]+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          const maxSize = 2 * 1024 * 1024;
          if (buffer.length > maxSize) {
            console.log(`   ⚠️  Carta #${id_modelcard}: imagem demasiado grande (${(buffer.length / 1024 / 1024).toFixed(2)} MB > 2MB), a ignorar.`);
            errors++;
            continue;
          }

          const b2Url = await b2Upload.uploadImageBuffer(buffer, `card-${id_modelcard}-${Date.now()}`);

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