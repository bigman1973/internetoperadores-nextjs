/**
 * Script para sincronizar facturas recibidas desde OneDrive con OCR completo
 * Procesa TODAS las facturas PDF con GPT-4o para extraer datos reales
 */
import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TENANT_ID = process.env.MICROSOFT_GRAPH_TENANT_ID!;
const CLIENT_ID = process.env.MICROSOFT_GRAPH_CLIENT_ID!;
const CLIENT_SECRET = process.env.MICROSOFT_GRAPH_CLIENT_SECRET!;
const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;

const BASE_PATH = '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026';

interface CarpetaConfig {
  nombre: string;
  estado: string;
  trimestre?: string;
  imputacion?: string;
  formaPago?: string;
  confirmingProveedor?: string;
}

const CARPETAS: CarpetaConfig[] = [
  { nombre: '4. Trimestre 1 2026', estado: 'CONTABILIZADA', trimestre: 'T1' },
  { nombre: '5. Trimestre 2 2026', estado: 'CONTABILIZADA', trimestre: 'T2' },
  { nombre: '2. Pendiente de contabilizar o revisar 2026', estado: 'PENDIENTE_REVISION', trimestre: 'Pendiente' },
  { nombre: '1. Compra de materiales 2026', estado: 'PENDIENTE_REVISION', trimestre: 'Materiales' },
  { nombre: '3. Confirming Draxton 2026', estado: 'PENDIENTE_REVISION', trimestre: 'Confirming', imputacion: 'Draxton', formaPago: 'confirming', confirmingProveedor: 'Draxton' },
];

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
  if (!json.access_token) throw new Error('No token: ' + JSON.stringify(json));
  return json.access_token;
}

async function listarArchivos(token: string, carpeta: string): Promise<any[]> {
  const fullPath = `${BASE_PATH}/${carpeta}`;
  const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/root:/${encodeURIComponent(fullPath)}:/children?$top=250&$select=id,name,size,lastModifiedDateTime,file,webUrl`;
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

async function pdfToBase64Images(pdfBuffer: Buffer): Promise<string[]> {
  // Escribir PDF a archivo temporal, convertir con poppler (pdftoppm)
  const fs = await import('fs');
  const { execSync } = await import('child_process');
  const tmpDir = '/tmp/ocr_' + Date.now();
  fs.mkdirSync(tmpDir, { recursive: true });
  const pdfPath = `${tmpDir}/input.pdf`;
  fs.writeFileSync(pdfPath, pdfBuffer);
  
  // Convertir solo primera página a PNG (150 DPI para balance calidad/tamaño)
  try {
    execSync(`pdftoppm -png -r 150 -f 1 -l 1 ${pdfPath} ${tmpDir}/page`, { timeout: 10000 });
  } catch {
    // Si falla, intentar con menor resolución
    try {
      execSync(`pdftoppm -png -r 100 -f 1 -l 1 ${pdfPath} ${tmpDir}/page`, { timeout: 10000 });
    } catch {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      return [];
    }
  }
  
  const images: string[] = [];
  const files = fs.readdirSync(tmpDir).filter((f: string) => f.endsWith('.png')).sort();
  for (const file of files.slice(0, 2)) { // Max 2 páginas
    const imgBuffer = fs.readFileSync(`${tmpDir}/${file}`);
    images.push(imgBuffer.toString('base64'));
  }
  
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return images;
}

async function procesarConOCR(pdfBuffer: Buffer, fileName: string): Promise<any> {
  const images = await pdfToBase64Images(pdfBuffer);
  if (images.length === 0) return null;
  
  try {
    const imageContent = images.map(img => ({
      type: 'image_url' as const,
      image_url: { url: `data:image/png;base64,${img}`, detail: 'auto' as const }
    }));

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Eres un experto en contabilidad española. Extrae los datos de esta factura y devuelve SOLO un JSON válido con estos campos:
{
  "proveedor": "nombre del proveedor/emisor de la factura",
  "cif": "CIF/NIF del proveedor (formato: B12345678 o similar)",
  "numFactura": "número de factura tal como aparece",
  "fecha": "YYYY-MM-DD (fecha de emisión de la factura)",
  "base": 0.00,
  "tipoIva": 21,
  "importeIva": 0.00,
  "tipoIrpf": 0,
  "importeIrpf": 0.00,
  "total": 0.00,
  "concepto": "breve descripción del servicio/producto facturado (max 100 chars)"
}
IMPORTANTE:
- Si es un documento de cesión de créditos/confirming, el proveedor es "Draxton" o quien cede
- Los importes SIEMPRE en euros con 2 decimales
- Si no puedes extraer algún campo, usa null
- El concepto debe ser descriptivo y útil para clasificación contable
- ATENCIÓN CON LAS FECHAS: Estas facturas son del año 2026. Si ves una fecha que parece 2020, 2022 o 2023, es muy probable que sea 2026. Lee con cuidado el año. Los números de factura con "2026" o "26" confirman que es 2026.
- El formato de fecha DEBE ser YYYY-MM-DD`
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: `Extrae los datos de esta factura (archivo: ${fileName}):` },
            ...imageContent
          ]
        }
      ],
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    console.error(`    OCR error: ${e.message?.slice(0, 80)}`);
    return null;
  }
}

// Delay para rate limiting
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== SINCRONIZACIÓN CON OCR COMPLETO ===\n');
  
  const token = await getToken();
  console.log('Token obtenido ✓\n');

  let totalProcesadas = 0;
  let totalOCR = 0;
  let totalFallidas = 0;

  for (const carpeta of CARPETAS) {
    console.log(`\n━━━ ${carpeta.nombre} (${carpeta.trimestre}) ━━━`);
    const archivos = await listarArchivos(token, carpeta.nombre);
    console.log(`  ${archivos.length} PDFs encontrados`);

    let procesadas = 0;
    let fallidas = 0;

    for (const archivo of archivos) {
      // Verificar si ya existe
      const existe = await prisma.facturaRecibida.findFirst({
        where: { oneDriveItemId: archivo.id },
      });
      if (existe) continue;

      process.stdout.write(`  [${procesadas + 1}/${archivos.length}] ${archivo.name.slice(0, 50)}...`);

      try {
        const pdfBuffer = await descargarArchivo(token, archivo.id);
        const datos = await procesarConOCR(pdfBuffer, archivo.name);

        if (datos && (datos.proveedor || datos.total)) {
          await prisma.facturaRecibida.create({
            data: {
              proveedor: datos.proveedor || archivo.name.replace('.pdf', ''),
              cif: datos.cif || null,
              numFactura: datos.numFactura || null,
              fecha: datos.fecha ? new Date(datos.fecha) : new Date(archivo.lastModifiedDateTime),
              base: parseFloat(datos.base) || 0,
              tipoIva: parseFloat(datos.tipoIva) || 21,
              importeIva: parseFloat(datos.importeIva) || 0,
              tipoIrpf: parseFloat(datos.tipoIrpf) || 0,
              importeIrpf: parseFloat(datos.importeIrpf) || 0,
              total: parseFloat(datos.total) || 0,
              concepto: datos.concepto || null,
              estado: carpeta.estado as any,
              imputacion: carpeta.imputacion || null,
              formaPago: carpeta.formaPago || null,
              confirmingProveedor: carpeta.confirmingProveedor || null,
              deducibleIva: true,
              oneDriveItemId: archivo.id,
              archivoOneDrive: archivo.name,
              carpetaOrigen: carpeta.trimestre,
              ocrCompletado: true,
              ocrConfianza: 0.9,
              datosOcrRaw: JSON.stringify(datos),
            },
          });
          console.log(` ✓ ${datos.proveedor?.slice(0, 30)} ${datos.total}€`);
          totalOCR++;
        } else {
          // Guardar sin OCR
          await prisma.facturaRecibida.create({
            data: {
              proveedor: archivo.name.replace('.pdf', '').replace(/_/g, ' '),
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
              carpetaOrigen: carpeta.trimestre,
              ocrCompletado: false,
            },
          });
          console.log(` ⚠ Sin datos OCR`);
          fallidas++;
        }
        procesadas++;
        
        // Rate limiting: esperar 200ms entre llamadas
        await delay(200);
      } catch (e: any) {
        console.log(` ✗ ${e.message?.slice(0, 50)}`);
        fallidas++;
        // Guardar registro mínimo
        try {
          await prisma.facturaRecibida.create({
            data: {
              proveedor: archivo.name.replace('.pdf', '').replace(/_/g, ' '),
              fecha: new Date(archivo.lastModifiedDateTime),
              base: 0, tipoIva: 21, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total: 0,
              estado: carpeta.estado as any,
              imputacion: carpeta.imputacion || null,
              formaPago: carpeta.formaPago || null,
              confirmingProveedor: carpeta.confirmingProveedor || null,
              deducibleIva: true,
              oneDriveItemId: archivo.id,
              archivoOneDrive: archivo.name,
              carpetaOrigen: carpeta.trimestre,
              ocrCompletado: false,
            },
          });
        } catch {}
        procesadas++;
      }
    }

    totalProcesadas += procesadas;
    totalFallidas += fallidas;
    console.log(`  → ${procesadas} procesadas, ${fallidas} sin OCR`);
  }

  console.log(`\n=== RESUMEN FINAL ===`);
  console.log(`  Total procesadas: ${totalProcesadas}`);
  console.log(`  OCR exitoso: ${totalOCR}`);
  console.log(`  Sin datos OCR: ${totalFallidas}`);
  
  const totalFR = await prisma.facturaRecibida.count();
  console.log(`  Total en BD: ${totalFR}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
