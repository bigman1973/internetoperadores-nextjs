import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAccessToken,
  findSharePointSite,
  getSiteDrive,
  listFolderContents,
  downloadFile,
  FACTURAS_BASE_PATH,
  CARPETAS,
} from '@/lib/finanzas/microsoft-graph';
import { extraerDatosFactura } from '@/lib/finanzas/ocr-facturas';

// IDs cacheados de SharePoint (se obtienen en la primera llamada)
let cachedDriveId: string | null = process.env.SHAREPOINT_DRIVE_ID || null;

async function getDriveId(): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  
  const site = await findSharePointSite();
  const driveId = await getSiteDrive(site.siteId);
  cachedDriveId = driveId;
  return driveId;
}

/**
 * GET: Obtiene el estado de sincronización (archivos pendientes sin procesar)
 */
export async function GET() {
  try {
    const driveId = await getDriveId();
    
    // Obtener IDs ya importados
    const facturasExistentes = await prisma.facturaRecibida.findMany({
      where: { oneDriveItemId: { not: null } },
      select: { oneDriveItemId: true },
    });
    const idsImportados = new Set(facturasExistentes.map(f => f.oneDriveItemId!));
    
    // Listar archivos en "Pendiente de contabilizar"
    const pendientePath = `${FACTURAS_BASE_PATH}/${CARPETAS.PENDIENTE_CONTABILIZAR}`;
    const archivosPendientes = await listFolderContents(driveId, pendientePath);
    
    // Listar archivos en "Compra de materiales"
    const materialesPath = `${FACTURAS_BASE_PATH}/${CARPETAS.COMPRA_MATERIALES}`;
    const archivosMateriales = await listFolderContents(driveId, materialesPath);
    
    // Filtrar solo PDFs/imágenes no importados
    const filtrar = (items: any[]) => items.filter((item: any) => {
      if (item.folder) return false;
      const ext = item.name.toLowerCase().split('.').pop();
      const esFactura = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext || '');
      return esFactura && !idsImportados.has(item.id);
    });
    
    const pendientesNuevos = filtrar(archivosPendientes);
    const materialesNuevos = filtrar(archivosMateriales);
    
    return NextResponse.json({
      pendientes: {
        total: archivosPendientes.filter((i: any) => !i.folder).length,
        nuevos: pendientesNuevos.length,
        yaImportados: archivosPendientes.filter((i: any) => !i.folder).length - pendientesNuevos.length,
      },
      materiales: {
        total: archivosMateriales.filter((i: any) => !i.folder).length,
        nuevos: materialesNuevos.length,
        yaImportados: archivosMateriales.filter((i: any) => !i.folder).length - materialesNuevos.length,
      },
      totalNuevos: pendientesNuevos.length + materialesNuevos.length,
    });
  } catch (error: any) {
    console.error('Error en GET sincronizar-onedrive:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Ejecuta la sincronización (descarga + OCR)
 * Body: { carpeta?: 'pendiente' | 'materiales' | 'ambas', limite?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const carpeta = body.carpeta || 'ambas';
    const limite = Math.min(body.limite || 10, 20); // Máximo 20 por llamada (coste API)
    
    const driveId = await getDriveId();
    
    // Obtener IDs ya importados
    const facturasExistentes = await prisma.facturaRecibida.findMany({
      where: { oneDriveItemId: { not: null } },
      select: { oneDriveItemId: true },
    });
    const idsImportados = new Set(facturasExistentes.map(f => f.oneDriveItemId!));
    
    const resultados: Array<{
      archivo: string;
      carpeta: string;
      estado: 'ok' | 'error' | 'ya_importado';
      proveedor?: string;
      total?: number;
      error?: string;
    }> = [];
    
    // Función para procesar archivos de una carpeta
    async function procesarCarpeta(carpetaNombre: string, imputacionDefault: string) {
      const fullPath = `${FACTURAS_BASE_PATH}/${carpetaNombre}`;
      const items = await listFolderContents(driveId, fullPath);
      
      const archivos = items.filter((item: any) => {
        if (item.folder) return false;
        const ext = item.name.toLowerCase().split('.').pop();
        return ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext || '');
      });
      
      let procesados = 0;
      
      for (const archivo of archivos) {
        if (procesados >= limite) break;
        
        // Saltar si ya está importado
        if (idsImportados.has(archivo.id)) {
          continue;
        }
        
        try {
          // Descargar archivo
          const fileBuffer = await downloadFile(driveId, archivo.id);
          const ext = archivo.name.toLowerCase().split('.').pop();
          
          // Determinar MIME type
          let mimeType = 'application/pdf';
          if (['jpg', 'jpeg'].includes(ext || '')) mimeType = 'image/jpeg';
          else if (ext === 'png') mimeType = 'image/png';
          else if (ext === 'heic') mimeType = 'image/heic';
          else if (ext === 'tiff') mimeType = 'image/tiff';
          
          // OCR con GPT-4o Vision
          const base64 = fileBuffer.toString('base64');
          const datos = await extraerDatosFactura(base64, mimeType, archivo.name);
          
          // Crear factura en BD
          await prisma.facturaRecibida.create({
            data: {
              proveedor: datos.proveedor,
              cif: datos.cif,
              numFactura: datos.numFactura,
              fecha: new Date(datos.fecha),
              base: datos.base,
              tipoIva: datos.tipoIva,
              importeIva: datos.importeIva,
              tipoIrpf: datos.tipoIrpf,
              importeIrpf: datos.importeIrpf,
              total: datos.total,
              concepto: datos.concepto,
              estado: 'PENDIENTE_REVISION',
              imputacion: imputacionDefault,
              archivoOneDrive: `${fullPath}/${archivo.name}`,
              oneDriveItemId: archivo.id,
              carpetaOrigen: carpetaNombre,
              ocrCompletado: true,
              ocrConfianza: datos.confianza,
              datosOcrRaw: JSON.stringify(datos),
              deducibleIva: true,
            },
          });
          
          resultados.push({
            archivo: archivo.name,
            carpeta: carpetaNombre,
            estado: 'ok',
            proveedor: datos.proveedor,
            total: datos.total,
          });
          
          procesados++;
        } catch (error: any) {
          console.error(`Error procesando ${archivo.name}:`, error.message);
          resultados.push({
            archivo: archivo.name,
            carpeta: carpetaNombre,
            estado: 'error',
            error: error.message,
          });
          procesados++;
        }
      }
    }
    
    // Procesar según carpeta seleccionada
    if (carpeta === 'pendiente' || carpeta === 'ambas') {
      await procesarCarpeta(CARPETAS.PENDIENTE_CONTABILIZAR, 'Estructura');
    }
    if (carpeta === 'materiales' || carpeta === 'ambas') {
      await procesarCarpeta(CARPETAS.COMPRA_MATERIALES, 'Compra materiales');
    }
    
    const exitosos = resultados.filter(r => r.estado === 'ok').length;
    const errores = resultados.filter(r => r.estado === 'error').length;
    
    return NextResponse.json({
      mensaje: `Sincronización completada: ${exitosos} facturas procesadas, ${errores} errores`,
      procesados: exitosos,
      errores,
      resultados,
    });
  } catch (error: any) {
    console.error('Error en POST sincronizar-onedrive:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
