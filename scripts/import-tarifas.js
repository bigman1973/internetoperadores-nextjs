/**
 * Script para importar tarifas desde el JSON extraído del Excel
 * 
 * Uso: node scripts/import-tarifas.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando importación de tarifas...\n');

  // Leer JSON con tarifas extraídas
  const tarifasPath = path.join(__dirname, '../../upload/tarifas_extraidas.json');
  
  if (!fs.existsSync(tarifasPath)) {
    console.error('❌ No se encontró el archivo tarifas_extraidas.json');
    console.error(`   Ruta esperada: ${tarifasPath}`);
    process.exit(1);
  }

  const tarifasData = JSON.parse(fs.readFileSync(tarifasPath, 'utf-8'));
  
  console.log(`📊 Tarifas a importar: ${tarifasData.length}\n`);

  // Obtener o crear usuario admin por defecto (para created_by)
  let adminUser = await prisma.usuarioAdmin.findFirst({
    where: { rol: 'SUPER_ADMIN' }
  });

  if (!adminUser) {
    console.log('⚠️  No hay usuario admin, creando uno por defecto...');
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    adminUser = await prisma.usuarioAdmin.create({
      data: {
        email: 'admin@internetoperadores.com',
        passwordHash,
        nombre: 'Administrador',
        rol: 'SUPER_ADMIN',
      }
    });
    console.log('✅ Usuario admin creado\n');
  }

  // Extraer categorías únicas
  const categoriasSet = new Set();
  tarifasData.forEach(t => {
    if (t.categoria) {
      categoriasSet.add(JSON.stringify({
        nombre: t.categoria,
        tipoCliente: t.tipo_cliente
      }));
    }
  });

  const categorias = Array.from(categoriasSet).map(c => JSON.parse(c));
  
  console.log(`📁 Categorías únicas encontradas: ${categorias.length}`);
  
  // Crear categorías
  let orden = 0;
  for (const cat of categorias) {
    const existing = await prisma.categoria.findFirst({
      where: {
        nombre: cat.nombre,
        tipoCliente: cat.tipoCliente
      }
    });

    if (!existing) {
      await prisma.categoria.create({
        data: {
          nombre: cat.nombre,
          tipoCliente: cat.tipoCliente,
          orden: orden++,
          activa: true
        }
      });
      console.log(`  ✅ Categoría creada: ${cat.nombre} (${cat.tipoCliente})`);
    }
  }

  console.log('\n📦 Importando tarifas...\n');

  let importadas = 0;
  let errores = 0;

  for (const tarifa of tarifasData) {
    try {
      // Preparar descripción
      let descripcionCorta = '';
      if (tarifa.velocidad) {
        descripcionCorta += `Velocidad: ${tarifa.velocidad}`;
      }
      if (tarifa.permanencia) {
        if (descripcionCorta) descripcionCorta += ' | ';
        descripcionCorta += `Permanencia: ${tarifa.permanencia}`;
      }

      // Crear tarifa
      await prisma.tarifa.create({
        data: {
          tipoCliente: tarifa.tipo_cliente,
          categoria: tarifa.categoria,
          nombre: tarifa.nombre,
          descripcionCorta: descripcionCorta || null,
          velocidad: tarifa.velocidad || null,
          precioSinIva: tarifa.precio_sin_iva,
          precioConIva: tarifa.precio_con_iva,
          costeOperador: tarifa.coste_operador || null,
          permanencia: tarifa.permanencia || null,
          penalizacion: tarifa.penalizacion || null,
          garantia: tarifa.garantia || null,
          activa: true,
          destacada: false,
          orden: importadas,
          createdById: adminUser.id,
          updatedById: adminUser.id,
        }
      });

      importadas++;
      
      if (importadas % 10 === 0) {
        console.log(`  ✅ ${importadas} tarifas importadas...`);
      }

    } catch (error) {
      errores++;
      console.error(`  ❌ Error importando "${tarifa.nombre}": ${error.message}`);
    }
  }

  console.log(`\n✅ Importación completada!`);
  console.log(`   Importadas: ${importadas}`);
  console.log(`   Errores: ${errores}`);
  console.log(`   Total: ${tarifasData.length}`);

  // Registrar en historial
  await prisma.historialCambio.create({
    data: {
      usuarioId: adminUser.id,
      accion: 'IMPORTAR_EXCEL',
      cambios: {
        tarifas_importadas: importadas,
        errores: errores,
        fecha: new Date().toISOString()
      }
    }
  });

  console.log('\n📝 Historial de cambios actualizado');
}

main()
  .catch((e) => {
    console.error('❌ Error fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
