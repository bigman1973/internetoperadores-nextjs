/**
 * Script de prueba para verificar la conexión con Microsoft Graph API
 * Ejecutar con: npx tsx scripts/test-graph.ts
 * 
 * Requiere las siguientes variables de entorno en .env:
 * - MICROSOFT_GRAPH_TENANT_ID
 * - MICROSOFT_GRAPH_CLIENT_ID
 * - MICROSOFT_GRAPH_CLIENT_SECRET
 */

import { config } from 'dotenv';
config();

import {
  getAccessToken,
  findSharePointSite,
  getSiteDrive,
  listFolderContents,
  FACTURAS_BASE_PATH,
  CARPETAS,
} from '../lib/finanzas/microsoft-graph';

async function main() {
  console.log('=== Test Microsoft Graph API ===\n');

  // Verificar variables de entorno
  if (!process.env.MICROSOFT_GRAPH_TENANT_ID || !process.env.MICROSOFT_GRAPH_CLIENT_ID || !process.env.MICROSOFT_GRAPH_CLIENT_SECRET) {
    console.error('❌ Faltan variables de entorno MICROSOFT_GRAPH_*');
    console.error('   Asegúrate de tener MICROSOFT_GRAPH_TENANT_ID, MICROSOFT_GRAPH_CLIENT_ID y MICROSOFT_GRAPH_CLIENT_SECRET en .env');
    process.exit(1);
  }

  // 1. Obtener token
  console.log('1. Obteniendo access token...');
  try {
    const token = await getAccessToken();
    console.log(`   ✅ Token obtenido (${token.substring(0, 20)}...)\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    process.exit(1);
  }

  // 2. Buscar site de SharePoint
  console.log('2. Buscando site "IO: Accounting & Finances"...');
  let siteId: string;
  try {
    const site = await findSharePointSite();
    siteId = site.siteId;
    console.log(`   ✅ Site encontrado: "${site.siteName}" (ID: ${siteId})\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    process.exit(1);
  }

  // 3. Obtener drive
  console.log('3. Obteniendo drive del site...');
  let driveId: string;
  try {
    driveId = await getSiteDrive(siteId);
    console.log(`   ✅ Drive ID: ${driveId}\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    process.exit(1);
  }

  // 4. Listar carpetas de facturas 2026
  console.log(`4. Listando carpeta: ${FACTURAS_BASE_PATH}...`);
  try {
    const items = await listFolderContents(driveId, FACTURAS_BASE_PATH);
    console.log(`   ✅ ${items.length} elementos encontrados:`);
    items.forEach((item: any) => {
      const tipo = item.folder ? '📁' : '📄';
      console.log(`      ${tipo} ${item.name}`);
    });
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  // 5. Listar "Pendiente de contabilizar"
  console.log(`5. Listando carpeta "Pendiente de contabilizar"...`);
  try {
    const pendientePath = `${FACTURAS_BASE_PATH}/${CARPETAS.PENDIENTE_CONTABILIZAR}`;
    const items = await listFolderContents(driveId, pendientePath);
    console.log(`   ✅ ${items.length} archivos en "Pendiente de contabilizar"`);
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  // 6. Listar "Compra de materiales"
  console.log(`6. Listando carpeta "Compra de materiales"...`);
  try {
    const materialesPath = `${FACTURAS_BASE_PATH}/${CARPETAS.COMPRA_MATERIALES}`;
    const items = await listFolderContents(driveId, materialesPath);
    console.log(`   ✅ ${items.length} archivos en "Compra de materiales"`);
    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }

  console.log('=== RESUMEN ===');
  console.log(`Site ID: ${siteId}`);
  console.log(`Drive ID: ${driveId}`);
  console.log('\nGuardar estos IDs como variables de entorno para evitar llamadas extra:');
  console.log(`SHAREPOINT_SITE_ID=${siteId}`);
  console.log(`SHAREPOINT_DRIVE_ID=${driveId}`);
}

main().catch(console.error);
