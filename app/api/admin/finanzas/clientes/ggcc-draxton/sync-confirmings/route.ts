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
import {
  parseConfirmingFile,
  detectarTipoConfirming,
  normalizarNumFactura,
  ConfirmingParseResult,
} from '@/lib/finanzas/confirming-parser';

// IDs cacheados de SharePoint
let cachedDriveId: string | null = process.env.SHAREPOINT_DRIVE_ID || null;

async function getDriveId(): Promise<string> {
  if (cachedDriveId) return cachedDriveId;
  const site = await findSharePointSite();
  const driveId = await getSiteDrive(site.siteId);
  cachedDriveId = driveId;
  return driveId;
}

// Subcarpetas dentro de "3. Confirming Draxton 2026"
const SUBCARPETAS_CONFIRMING = [
  '1. Confirmings BBVA Draxton 2026',
  '2. Confirmings Caixabank Draxton 2026',
];

// Archivos a IGNORAR por nombre (formato antiguo que no parsea bien)
const NOMBRES_IGNORAR = ['cesión de créditos', 'cesion de creditos', 'cesión de crèdits', 'cesion de credits'];

// Extensiones válidas para confirming
const EXTENSIONES_CONFIRMING = ['pdf', 'xls', 'xlsx'];

/**
 * GET: Estado de sincronización de confirmings
 */
export async function GET() {
  try {
    const driveId = await getDriveId();
    
    const existentes = await prisma.facturaRecibida.findMany({
      where: { 
        oneDriveItemId: { not: null },
        carpetaOrigen: { contains: 'Confirming', mode: 'insensitive' },
      },
      select: { oneDriveItemId: true },
    });
    const idsImportados = new Set(existentes.map(f => f.oneDriveItemId!));
    
    const resultado: Record<string, { total: number; nuevos: number; yaImportados: number }> = {};
    let totalNuevos = 0;
    
    for (const subcarpeta of SUBCARPETAS_CONFIRMING) {
      const fullPath = `${FACTURAS_BASE_PATH}/${CARPETAS.CONFIRMING_DRAXTON}/${subcarpeta}`;
      try {
        const items = await listFolderContents(driveId, fullPath);
        const archivos = items.filter((item: any) => {
          if (item.folder) return false;
          const nameLower = item.name.toLowerCase();
          if (NOMBRES_IGNORAR.some(n => nameLower.includes(n))) return false;
          const ext = nameLower.split('.').pop();
          return EXTENSIONES_CONFIRMING.includes(ext || '');
        });
        
        const nuevos = archivos.filter((item: any) => !idsImportados.has(item.id));
        resultado[subcarpeta] = {
          total: archivos.length,
          nuevos: nuevos.length,
          yaImportados: archivos.length - nuevos.length,
        };
        totalNuevos += nuevos.length;
      } catch (e) {
        resultado[subcarpeta] = { total: 0, nuevos: 0, yaImportados: 0 };
      }
    }
    
    // Contar líneas y gastos financieros
    const totalLineas = await prisma.confirmingLinea.count();
    const lineasVinculadas = await prisma.confirmingLinea.count({
      where: { facturaEmitidaId: { not: null } },
    });
    
    // Sumar gastos financieros totales
    const gastosAgg = await prisma.confirmingLinea.aggregate({
      _sum: { gastosFinancieros: true, comision: true, intereses: true },
    });
    
    return NextResponse.json({
      subcarpetas: resultado,
      totalNuevos,
      totalDocumentos: existentes.length,
      totalLineas,
      lineasVinculadas,
      lineasSinVincular: totalLineas - lineasVinculadas,
      gastosFinancieros: {
        total: gastosAgg._sum.gastosFinancieros || 0,
        comisiones: gastosAgg._sum.comision || 0,
        intereses: gastosAgg._sum.intereses || 0,
      },
    });
  } catch (error: any) {
    console.error('Error en GET sync-confirmings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: Ejecuta la sincronización de confirmings
 * 
 * Proceso:
 * 1. Lista archivos en subcarpetas BBVA y CaixaBank (ignorando "Cesión de Créditos firmados")
 * 2. Descarga los nuevos (no importados)
 * 3. Parsea cada archivo para extraer líneas de factura + gastos financieros
 * 4. Crea FacturaRecibida + ConfirmingLinea (con comisión, intereses, tipo)
 * 5. Auto-vincula con FacturaEmitida por numFactura
 * 6. Actualiza importeCobrado y estado de FacturaEmitida
 * 
 * Body: { limite?: number, soloVincular?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limite = Math.min(body.limite || 30, 50);
    const soloVincular = body.soloVincular || false;
    
    if (soloVincular) {
      const resultado = await vincularLineasPendientes();
      return NextResponse.json(resultado);
    }
    
    const driveId = await getDriveId();
    
    // Obtener IDs ya importados
    const existentes = await prisma.facturaRecibida.findMany({
      where: { 
        oneDriveItemId: { not: null },
        carpetaOrigen: { contains: 'Confirming', mode: 'insensitive' },
      },
      select: { oneDriveItemId: true },
    });
    const idsImportados = new Set(existentes.map(f => f.oneDriveItemId!));
    
    const resultados: Array<{
      archivo: string;
      subcarpeta: string;
      estado: 'ok' | 'error' | 'ya_importado' | 'no_parseable';
      banco?: string;
      lineas?: number;
      vinculadas?: number;
      totalRemesa?: number;
      gastosFinancieros?: number;
      error?: string;
    }> = [];
    
    let totalProcesados = 0;
    let totalLineasCreadas = 0;
    let totalVinculadas = 0;
    let totalGastosFinancieros = 0;
    
    for (const subcarpeta of SUBCARPETAS_CONFIRMING) {
      if (totalProcesados >= limite) break;
      
      const fullPath = `${FACTURAS_BASE_PATH}/${CARPETAS.CONFIRMING_DRAXTON}/${subcarpeta}`;
      
      let items: any[];
      try {
        items = await listFolderContents(driveId, fullPath);
      } catch (e) {
        console.log(`Subcarpeta no encontrada: ${subcarpeta}`);
        continue;
      }
      
      // Filtrar archivos válidos
      const archivosRaw = items.filter((item: any) => {
        if (item.folder) return false;
        const nameLower = item.name.toLowerCase();
        // Ignorar archivos de "Cesión de Créditos" (formato antiguo)
        if (NOMBRES_IGNORAR.some(n => nameLower.includes(n))) return false;
        const ext = nameLower.split('.').pop();
        return EXTENSIONES_CONFIRMING.includes(ext || '');
      });
      
      // Para CaixaBank: si hay PDF y XLS con mismo nombre base, preferir XLS (tiene más detalle)
      const archivos = archivosRaw.filter((item: any) => {
        const nameLower = item.name.toLowerCase();
        const ext = nameLower.split('.').pop();
        if (ext === 'pdf') {
          const baseName = item.name.replace(/\.pdf$/i, '');
          const hasXls = archivosRaw.some((other: any) => 
            other.name.replace(/\.(xls|xlsx)$/i, '') === baseName && other.id !== item.id
          );
          if (hasXls) return false; // Saltar PDF si existe XLS
        }
        return true;
      });
      
      for (const archivo of archivos) {
        if (totalProcesados >= limite) break;
        if (idsImportados.has(archivo.id)) continue;
        
        try {
          // Detectar tipo antes de descargar
          const tipo = detectarTipoConfirming(archivo.name);
          if (tipo === 'unknown') {
            resultados.push({
              archivo: archivo.name,
              subcarpeta,
              estado: 'no_parseable',
              error: 'Tipo de archivo no reconocido',
            });
            totalProcesados++;
            continue;
          }
          
          // Descargar archivo
          const fileBuffer = await downloadFile(driveId, archivo.id);
          
          // Parsear
          const parseResult = await parseConfirmingFile(fileBuffer, archivo.name);
          
          if (!parseResult) {
            resultados.push({
              archivo: archivo.name,
              subcarpeta,
              estado: 'no_parseable',
              error: 'No se pudo parsear el archivo',
            });
            totalProcesados++;
            continue;
          }
          
          // Determinar proveedor de confirming
          const confirmingProveedor = parseResult.banco === 'BBVA' 
            ? `Confirming BBVA (${parseResult.sociedad || 'N/A'})`
            : 'Confirming CaixaBank';
          
          // Crear FacturaRecibida (documento de confirming)
          const facturaRecibida = await prisma.facturaRecibida.create({
            data: {
              proveedor: parseResult.cliente || confirmingProveedor,
              numFactura: archivo.name.replace(/\.(pdf|xls|xlsx)$/i, ''),
              fecha: parseResult.fechaDocumento 
                ? parseFechaString(parseResult.fechaDocumento) 
                : new Date(),
              base: parseResult.totalRemesa,
              tipoIva: 0,
              importeIva: 0,
              total: parseResult.totalRemesa,
              totalConfirming: parseResult.totalRemesa,
              concepto: `${confirmingProveedor} - ${parseResult.lineas.length} fact. | Gastos: ${(parseResult.totalGastosFinancieros || 0).toFixed(2)}€`,
              estado: 'CONTABILIZADA',
              imputacion: 'Draxton',
              archivoOneDrive: `${fullPath}/${archivo.name}`,
              oneDriveItemId: archivo.id,
              carpetaOrigen: `${CARPETAS.CONFIRMING_DRAXTON}/${subcarpeta}`,
              ocrCompletado: true,
              ocrConfianza: 0.95,
              datosOcrRaw: JSON.stringify({
                ...parseResult,
                rawText: undefined, // No guardar texto crudo para ahorrar espacio
              }),
              formaPago: 'confirming',
              confirmingProveedor,
            },
          });
          
          // Crear ConfirmingLineas con gastos financieros y auto-vincular
          let lineasVinculadas = 0;
          let gastosDoc = 0;
          
          for (const linea of parseResult.lineas) {
            const numNorm = normalizarNumFactura(linea.numFactura);
            
            // Buscar factura emitida
            const facturaEmitida = await prisma.facturaEmitida.findFirst({
              where: {
                AND: [
                  {
                    OR: [
                      { numFactura: { equals: numNorm, mode: 'insensitive' } },
                      { numFactura: { equals: linea.numFactura, mode: 'insensitive' } },
                    ],
                  },
                  {
                    OR: [
                      { cliente: { contains: 'Draxton', mode: 'insensitive' } },
                      { cliente: { contains: 'Fuchosa', mode: 'insensitive' } },
                      { cliente: { contains: 'Altec', mode: 'insensitive' } },
                      { cliente: { contains: 'Infun', mode: 'insensitive' } },
                    ],
                  },
                ],
              },
              select: { id: true, numFactura: true, total: true },
            });
            
            let facturaId: string | null = null;
            let importeReal = linea.importe;
            
            if (facturaEmitida) {
              facturaId = facturaEmitida.id;
              importeReal = facturaEmitida.total;
            } else {
              // Búsqueda por normalización
              const allDraxton = await prisma.facturaEmitida.findMany({
                where: { numFactura: { startsWith: 'DRAX', mode: 'insensitive' } },
                select: { id: true, numFactura: true, total: true },
              });
              const match = allDraxton.find(f => 
                normalizarNumFactura(f.numFactura) === numNorm
              );
              if (match) {
                facturaId = match.id;
                importeReal = match.total;
              }
            }
            
            // Parsear fecha de pago si existe
            let fechaPago: Date | undefined;
            if (linea.fechaPago) {
              const fp = linea.fechaPago.match(/(\d{2})-(\d{2})-(\d{4})/);
              if (fp) {
                fechaPago = new Date(parseInt(fp[3]), parseInt(fp[2]) - 1, parseInt(fp[1]));
              }
            }
            
            const gastosLinea = linea.gastosFinancieros || 
              ((linea.comision || 0) + (linea.intereses || 0)) || 
              (linea.importeNeto ? Math.round((linea.importe - linea.importeNeto) * 100) / 100 : 0);
            
            await prisma.confirmingLinea.create({
              data: {
                confirmingId: facturaRecibida.id,
                numFactura: numNorm,
                importe: importeReal,
                comision: linea.comision || 0,
                intereses: linea.intereses || 0,
                tipoInteres: linea.tipoInteres || null,
                gastosFinancieros: gastosLinea,
                fechaPago: fechaPago || null,
                facturaEmitidaId: facturaId,
                notas: linea.tipoInteres 
                  ? `Tipo: ${linea.tipoInteres}% | Vto: ${linea.fechaPago || linea.fechaVencimiento || '-'}`
                  : (linea.fechaPago || linea.fechaVencimiento ? `Vto: ${linea.fechaPago || linea.fechaVencimiento}` : undefined),
              },
            });
            
            gastosDoc += gastosLinea;
            totalLineasCreadas++;
            if (facturaId) {
              lineasVinculadas++;
              totalVinculadas++;
            }
          }
          
          totalGastosFinancieros += parseResult.totalGastosFinancieros || gastosDoc;
          
          resultados.push({
            archivo: archivo.name,
            subcarpeta,
            estado: 'ok',
            banco: parseResult.banco,
            lineas: parseResult.lineas.length,
            vinculadas: lineasVinculadas,
            totalRemesa: parseResult.totalRemesa,
            gastosFinancieros: parseResult.totalGastosFinancieros || gastosDoc,
          });
          
          totalProcesados++;
        } catch (error: any) {
          console.error(`Error procesando confirming ${archivo.name}:`, error);
          resultados.push({
            archivo: archivo.name,
            subcarpeta,
            estado: 'error',
            error: error.message,
          });
          totalProcesados++;
        }
      }
    }
    
    // Actualizar estados de facturas emitidas
    await actualizarEstadosFacturasEmitidas();
    
    return NextResponse.json({
      mensaje: `Sincronización completada: ${resultados.filter(r => r.estado === 'ok').length} documentos procesados`,
      procesados: totalProcesados,
      lineasCreadas: totalLineasCreadas,
      lineasVinculadas: totalVinculadas,
      gastosFinancieros: totalGastosFinancieros,
      resultados,
    });
  } catch (error: any) {
    console.error('Error en POST sync-confirmings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * Vincula líneas de confirming pendientes con facturas emitidas
 */
async function vincularLineasPendientes() {
  const lineasSinVincular = await prisma.confirmingLinea.findMany({
    where: { facturaEmitidaId: null },
    select: { id: true, numFactura: true, importe: true },
  });
  
  let vinculadas = 0;
  
  for (const linea of lineasSinVincular) {
    const numNorm = normalizarNumFactura(linea.numFactura);
    
    const facturaEmitida = await prisma.facturaEmitida.findFirst({
      where: {
        AND: [
          {
            OR: [
              { numFactura: { equals: numNorm, mode: 'insensitive' } },
              { numFactura: { equals: linea.numFactura, mode: 'insensitive' } },
            ],
          },
          {
            OR: [
              { cliente: { contains: 'Draxton', mode: 'insensitive' } },
              { cliente: { contains: 'Fuchosa', mode: 'insensitive' } },
              { cliente: { contains: 'Altec', mode: 'insensitive' } },
              { cliente: { contains: 'Infun', mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: { id: true, total: true },
    });
    
    if (facturaEmitida) {
      await prisma.confirmingLinea.update({
        where: { id: linea.id },
        data: { 
          facturaEmitidaId: facturaEmitida.id,
          importe: facturaEmitida.total,
        },
      });
      vinculadas++;
    }
  }
  
  if (vinculadas > 0) {
    await actualizarEstadosFacturasEmitidas();
  }
  
  return {
    mensaje: `Vinculación completada: ${vinculadas} de ${lineasSinVincular.length} líneas vinculadas`,
    totalPendientes: lineasSinVincular.length,
    vinculadas,
  };
}

/**
 * Actualiza importeCobrado y estado de facturas emitidas basado en confirmingLineas vinculadas
 */
async function actualizarEstadosFacturasEmitidas() {
  const facturasConConfirming = await prisma.facturaEmitida.findMany({
    where: { confirmingLineas: { some: {} } },
    select: {
      id: true,
      total: true,
      importeCobrado: true,
      estado: true,
    },
  });
  
  for (const factura of facturasConConfirming) {
    // Si tiene confirming vinculado, está cobrada al 100%
    if (factura.estado !== 'COBRADA' || Math.abs((factura.importeCobrado || 0) - factura.total) > 0.01) {
      await prisma.facturaEmitida.update({
        where: { id: factura.id },
        data: {
          importeCobrado: factura.total,
          estado: 'COBRADA',
          formaCobro: 'Confirming',
        },
      });
    }
  }
}

// --- Utilidades ---

function parseFechaString(fecha: string): Date {
  const match = fecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return new Date();
}
