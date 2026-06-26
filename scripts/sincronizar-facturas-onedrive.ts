/**
 * Script para sincronizar facturas recibidas desde OneDrive/SharePoint
 * Usa la API de sincronización ya creada en el servidor
 */
import * as dotenv from 'dotenv';
dotenv.config();

const BASE_URL = 'http://localhost:3000';

// Llamar directamente a la lógica de Graph API sin pasar por el servidor
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = process.env.MICROSOFT_GRAPH_TENANT_ID!;
const CLIENT_ID = process.env.MICROSOFT_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_GRAPH_CLIENT_SECRET!;
const SITE_ID = process.env.SHAREPOINT_SITE_ID!;
const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;

async function getToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(url, { method: 'POST', body });
  const json = await res.json();
  if (!json.access_token) throw new Error('No se pudo obtener token: ' + JSON.stringify(json));
  return json.access_token;
}

async function listarArchivos(token: string, carpeta: string): Promise<any[]> {
  const fullPath = `${BASE_PATH}/${carpeta}`;
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodeURIComponent(fullPath)}:/children?$top=250&$select=id,name,size,lastModifiedDateTime,file`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`Error listando ${carpeta}: ${res.status}`);
    return [];
  }
  const json = await res.json();
  return (json.value || []).filter((f: any) => f.file && f.name.toLowerCase().endsWith('.pdf'));
}

async function descargarArchivo(token: string, itemId: string): Promise<Buffer> {
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${itemId}/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function procesarConOCR(pdfBuffer: Buffer, fileName: string): Promise<any> {
  // Usar OpenAI GPT-4o para OCR de la factura
  const OpenAI = (await import('openai')).default;
  const openai = new OpenAI();

  const base64 = pdfBuffer.toString('base64');
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Eres un experto en contabilidad española. Extrae los datos de esta factura y devuelve SOLO un JSON válido con estos campos:
{
  "proveedor": "nombre del proveedor/emisor",
  "cif": "CIF/NIF del proveedor",
  "numFactura": "número de factura",
  "fecha": "YYYY-MM-DD",
  "base": 0.00,
  "tipoIva": 21,
  "importeIva": 0.00,
  "tipoIrpf": 0,
  "importeIrpf": 0.00,
  "total": 0.00,
  "concepto": "breve descripción del servicio/producto"
}
Si no puedes extraer algún campo, usa null. Los importes siempre en euros con 2 decimales.`
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Extrae los datos de esta factura (archivo: ${fileName}):` },
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } }
        ]
      }
    ],
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content || '';
  // Extraer JSON del contenido
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.warn(`  No se pudo extraer JSON de ${fileName}`);
    return null;
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    console.warn(`  JSON inválido para ${fileName}`);
    return null;
  }
}

interface CarpetaConfig {
  nombre: string;
  estado: string;
  imputacion?: string;
  formaPago?: string;
  confirmingProveedor?: string;
}

const BASE_PATH = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026';

const CARPETAS: CarpetaConfig[] = [
  { nombre: '2. Pendiente de contabilizar o revisar 2026', estado: 'PENDIENTE_REVISION' },
  { nombre: '1. Compra de materiales 2026', estado: 'PENDIENTE_REVISION' },
  { nombre: '4. Trimestre 1 2026', estado: 'CONTABILIZADA' },
  { nombre: '5. Trimestre 2 2026', estado: 'CONTABILIZADA' },
  { nombre: '3. Confirming Draxton 2026', estado: 'CONTABILIZADA', imputacion: 'Draxton', formaPago: 'confirming', confirmingProveedor: 'Draxton' },
];

async function main() {
  console.log('=== SINCRONIZACIÓN DE FACTURAS DESDE ONEDRIVE ===\n');
  
  const token = await getToken();
  console.log('Token obtenido ✓\n');

  let totalNuevas = 0;
  let totalExistentes = 0;
  let totalProcesadas = 0;
  const MAX_OCR_POR_CARPETA = 0; // Deshabilitado para carga masiva inicial (activar después)

  for (const carpeta of CARPETAS) {
    console.log(`\n--- Carpeta: ${carpeta.nombre} ---`);
    const archivos = await listarArchivos(token, carpeta.nombre);
    console.log(`  ${archivos.length} PDFs encontrados`);

    let nuevas = 0;
    let existentes = 0;

    for (const archivo of archivos) {
      // Verificar si ya existe en BD
      const existe = await prisma.facturaRecibida.findFirst({
        where: { oneDriveItemId: archivo.id },
      });

      if (existe) {
        existentes++;
        continue;
      }

      nuevas++;
      
      // Solo procesar con OCR las primeras MAX_OCR_POR_CARPETA por carpeta
      if (nuevas <= MAX_OCR_POR_CARPETA) {
        console.log(`  Procesando: ${archivo.name}...`);
        try {
          const pdfBuffer = await descargarArchivo(token, archivo.id);
          const datos = await procesarConOCR(pdfBuffer, archivo.name);

          if (datos) {
            await prisma.facturaRecibida.create({
              data: {
                proveedor: datos.proveedor || archivo.name.replace('.pdf', ''),
                cif: datos.cif || null,
                numFactura: datos.numFactura || `AUTO-${archivo.id.slice(0, 8)}`,
                fecha: datos.fecha ? new Date(datos.fecha) : new Date(archivo.lastModifiedDateTime),
                base: datos.base || 0,
                tipoIva: datos.tipoIva || 21,
                importeIva: datos.importeIva || 0,
                tipoIrpf: datos.tipoIrpf || 0,
                importeIrpf: datos.importeIrpf || 0,
                total: datos.total || 0,
                concepto: datos.concepto || null,
                estado: carpeta.estado as any,
                imputacion: carpeta.imputacion || null,
                formaPago: carpeta.formaPago || null,
                confirmingProveedor: carpeta.confirmingProveedor || null,
                deducibleIva: true,
                oneDriveItemId: archivo.id,
                archivoOneDrive: archivo.name,
                carpetaOrigen: carpeta.nombre,
              },
            });
            totalProcesadas++;
            console.log(`    ✓ ${datos.proveedor} - ${datos.total}€`);
          } else {
            // Crear registro mínimo sin OCR
            await prisma.facturaRecibida.create({
              data: {
                proveedor: archivo.name.replace('.pdf', '').replace(/_/g, ' '),
                numFactura: `PENDIENTE-${archivo.id.slice(0, 8)}`,
                fecha: new Date(archivo.lastModifiedDateTime),
                base: 0,
                tipoIva: 21,
                importeIva: 0,
                tipoIrpf: 0,
                importeIrpf: 0,
                total: 0,
                estado: carpeta.estado as any,
                imputacion: carpeta.imputacion || null,
                formaPago: carpeta.formaPago || null,
                confirmingProveedor: carpeta.confirmingProveedor || null,
                deducibleIva: true,
                oneDriveItemId: archivo.id,
                archivoOneDrive: archivo.name,
                carpetaOrigen: carpeta.nombre,
              },
            });
            totalProcesadas++;
            console.log(`    ⚠ Sin OCR: ${archivo.name}`);
          }
        } catch (e: any) {
          console.error(`    ✗ Error: ${e.message}`);
        }
      } else {
        // Registrar sin OCR para no perder el tracking
        try {
          await prisma.facturaRecibida.create({
            data: {
              proveedor: archivo.name.replace('.pdf', '').replace(/_/g, ' '),
              numFactura: `PENDIENTE-${archivo.id.slice(0, 8)}`,
              fecha: new Date(archivo.lastModifiedDateTime),
              base: 0,
              tipoIva: 21,
              importeIva: 0,
              tipoIrpf: 0,
              importeIrpf: 0,
              total: 0,
              estado: carpeta.estado as any,
              imputacion: carpeta.imputacion || null,
              formaPago: carpeta.formaPago || null,
              confirmingProveedor: carpeta.confirmingProveedor || null,
              deducibleIva: true,
              oneDriveItemId: archivo.id,
              archivoOneDrive: archivo.name,
                carpetaOrigen: carpeta.nombre,
            },
          });
          totalProcesadas++;
        } catch (e: any) {
          // Ignorar duplicados
        }
      }
    }

    totalNuevas += nuevas;
    totalExistentes += existentes;
    console.log(`  Resultado: ${nuevas} nuevas, ${existentes} ya existentes`);
  }

  console.log(`\n=== RESUMEN ===`);
  console.log(`  Nuevas: ${totalNuevas}`);
  console.log(`  Ya existentes: ${totalExistentes}`);
  console.log(`  Procesadas con OCR: ${totalProcesadas}`);
  
  const totalFR = await prisma.facturaRecibida.count();
  console.log(`  Total facturas recibidas en BD: ${totalFR}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
