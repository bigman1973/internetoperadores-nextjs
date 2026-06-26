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

// Mapeo de carpetas con sus imputaciones por defecto y estado inicial
const CARPETAS_CONFIG: Record<string, { nombre: string; imputacion: string; estadoInicial: 'PENDIENTE_REVISION' | 'CONTABILIZADA' }> = {
  pendiente: { nombre: CARPETAS.PENDIENTE_CONTABILIZAR, imputacion: 'Estructura', estadoInicial: 'PENDIENTE_REVISION' },
  materiales: { nombre: CARPETAS.COMPRA_MATERIALES, imputacion: 'Compra materiales', estadoInicial: 'PENDIENTE_REVISION' },
  trimestre1: { nombre: CARPETAS.TRIMESTRE_1, imputacion: 'Estructura', estadoInicial: 'CONTABILIZADA' },
  trimestre2: { nombre: CARPETAS.TRIMESTRE_2, imputacion: 'Estructura', estadoInicial: 'CONTABILIZADA' },
  trimestre3: { nombre: CARPETAS.TRIMESTRE_3, imputacion: 'Estructura', estadoInicial: 'PENDIENTE_REVISION' },
  trimestre4: { nombre: CARPETAS.TRIMESTRE_4, imputacion: 'Estructura', estadoInicial: 'PENDIENTE_REVISION' },
  confirming_draxton: { nombre: CARPETAS.CONFIRMING_DRAXTON, imputacion: 'Draxton', estadoInicial: 'CONTABILIZADA' },
};

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
    
    // Filtrar solo PDFs/imágenes no importados
    const filtrar = (items: any[]) => items.filter((item: any) => {
      if (item.folder) return false;
      const ext = item.name.toLowerCase().split('.').pop();
      const esFactura = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext || '');
      return esFactura && !idsImportados.has(item.id);
    });

    const contarArchivos = (items: any[]) => items.filter((i: any) => !i.folder).length;
    
    // Listar todas las carpetas
    const resultado: Record<string, { total: number; nuevos: number; yaImportados: number }> = {};
    let totalNuevos = 0;

    for (const [key, config] of Object.entries(CARPETAS_CONFIG)) {
      try {
        const fullPath = `${FACTURAS_BASE_PATH}/${config.nombre}`;
        const archivos = await listFolderContents(driveId, fullPath);
        const totalArchivos = contarArchivos(archivos);
        const nuevos = filtrar(archivos);
        resultado[key] = {
          total: totalArchivos,
          nuevos: nuevos.length,
          yaImportados: totalArchivos - nuevos.length,
        };
        totalNuevos += nuevos.length;
      } catch (e) {
        resultado[key] = { total: 0, nuevos: 0, yaImportados: 0 };
      }
    }
    
    return NextResponse.json({
      ...resultado,
      // Mantener compatibilidad con frontend anterior
      pendientes: resultado.pendiente,
      materiales: resultado.materiales,
      totalNuevos,
    });
  } catch (error: any) {
    console.error('Error en GET sincronizar-onedrive:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Ejecuta la sincronización (descarga + OCR)
 * Body: { carpeta?: 'pendiente' | 'materiales' | 'trimestre1' | 'trimestre2' | 'trimestre3' | 'trimestre4' | 'todas', limite?: number }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const carpeta = body.carpeta || 'todas';
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

    let totalProcesados = 0;
    
    // Función para procesar archivos de una carpeta
    async function procesarCarpeta(carpetaNombre: string, imputacionDefault: string, estadoInicial: string, carpetaKey?: string) {
      const fullPath = `${FACTURAS_BASE_PATH}/${carpetaNombre}`;
      const items = await listFolderContents(driveId, fullPath);
      
      const archivos = items.filter((item: any) => {
        if (item.folder) return false;
        const ext = item.name.toLowerCase().split('.').pop();
        return ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'tiff'].includes(ext || '');
      });
      
      for (const archivo of archivos) {
        if (totalProcesados >= limite) break;
        
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
          
          // Determinar forma de pago según carpeta
          const esConfirming = carpetaKey?.startsWith('confirming');
          const formaPago = esConfirming ? 'confirming' : undefined;
          const confirmingProveedor = carpetaKey === 'confirming_draxton' ? 'Draxton' : undefined;

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
              estado: estadoInicial as any,
              imputacion: imputacionDefault,
              archivoOneDrive: `${fullPath}/${archivo.name}`,
              oneDriveItemId: archivo.id,
              carpetaOrigen: carpetaNombre,
              ocrCompletado: true,
              ocrConfianza: datos.confianza,
              datosOcrRaw: JSON.stringify(datos),
              deducibleIva: true,
              formaPago,
              confirmingProveedor,
            },
          });
          
          resultados.push({
            archivo: archivo.name,
            carpeta: carpetaNombre,
            estado: 'ok',
            proveedor: datos.proveedor,
            total: datos.total,
          });
          
          totalProcesados++;
        } catch (error: any) {
          console.error(`Error procesando ${archivo.name}:`, error.message);
          resultados.push({
            archivo: archivo.name,
            carpeta: carpetaNombre,
            estado: 'error',
            error: error.message,
          });
          totalProcesados++;
        }
      }
    }
    
    // Determinar qué carpetas procesar
    if (carpeta === 'todas') {
      // Procesar todas las carpetas en orden
      for (const [key, config] of Object.entries(CARPETAS_CONFIG)) {
        if (totalProcesados >= limite) break;
        await procesarCarpeta(config.nombre, config.imputacion, config.estadoInicial, key);
      }
    } else if (CARPETAS_CONFIG[carpeta]) {
      const config = CARPETAS_CONFIG[carpeta];
      await procesarCarpeta(config.nombre, config.imputacion, config.estadoInicial, carpeta);
    } else {
      // Compatibilidad: 'ambas' = pendiente + materiales
      if (carpeta === 'ambas' || carpeta === 'pendiente') {
        const c = CARPETAS_CONFIG.pendiente;
        await procesarCarpeta(c.nombre, c.imputacion, c.estadoInicial);
      }
      if (carpeta === 'ambas' || carpeta === 'materiales') {
        const c = CARPETAS_CONFIG.materiales;
        await procesarCarpeta(c.nombre, c.imputacion, c.estadoInicial);
      }
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
