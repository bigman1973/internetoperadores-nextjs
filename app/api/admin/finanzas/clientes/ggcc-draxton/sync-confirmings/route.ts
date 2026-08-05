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

// Extensiones válidas para confirming
const EXTENSIONES_CONFIRMING = ['pdf', 'xls', 'xlsx'];

/**
 * GET: Estado de sincronización de confirmings
 * Devuelve cuántos archivos hay nuevos sin procesar
 */
export async function GET() {
  try {
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
    
    const resultado: Record<string, { total: number; nuevos: number; yaImportados: number }> = {};
    let totalNuevos = 0;
    
    for (const subcarpeta of SUBCARPETAS_CONFIRMING) {
      const fullPath = `${FACTURAS_BASE_PATH}/${CARPETAS.CONFIRMING_DRAXTON}/${subcarpeta}`;
      try {
        const items = await listFolderContents(driveId, fullPath);
        const archivos = items.filter((item: any) => {
          const ext = item.name.toLowerCase().split('.').pop();
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
    
    // También contar líneas de confirming y vinculaciones
    const totalLineas = await prisma.confirmingLinea.count();
    const lineasVinculadas = await prisma.confirmingLinea.count({
      where: { facturaEmitidaId: { not: null } },
    });
    
    return NextResponse.json({
      subcarpetas: resultado,
      totalNuevos,
      totalDocumentos: existentes.length,
      totalLineas,
      lineasVinculadas,
      lineasSinVincular: totalLineas - lineasVinculadas,
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
 * 1. Lista archivos en subcarpetas BBVA y CaixaBank
 * 2. Descarga los nuevos (no importados)
 * 3. Parsea cada archivo para extraer líneas de factura
 * 4. Crea FacturaRecibida + ConfirmingLinea
 * 5. Auto-vincula con FacturaEmitida por numFactura
 * 6. Actualiza importeCobrado y estado de FacturaEmitida
 * 7. Intenta conciliar con MovimientoBancario
 * 
 * Body: { limite?: number, soloVincular?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const limite = Math.min(body.limite || 20, 50);
    const soloVincular = body.soloVincular || false;
    
    // Si soloVincular, solo intentar vincular líneas existentes sin descargar nuevos
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
      error?: string;
    }> = [];
    
    let totalProcesados = 0;
    let totalLineasCreadas = 0;
    let totalVinculadas = 0;
    
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
      const archivos = items.filter((item: any) => {
        const ext = item.name.toLowerCase().split('.').pop();
        return EXTENSIONES_CONFIRMING.includes(ext || '');
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
            ? `BBVA${parseResult.sociedad ? ` (${parseResult.sociedad})` : ''}`
            : 'CaixaBank';
          
          // Crear FacturaRecibida (documento de confirming)
          const facturaRecibida = await prisma.facturaRecibida.create({
            data: {
              proveedor: parseResult.cliente || `Confirming ${confirmingProveedor}`,
              numFactura: archivo.name.replace(/\.(pdf|xls|xlsx)$/i, ''),
              fecha: parseResult.fechaDocumento 
                ? parseFechaString(parseResult.fechaDocumento) 
                : new Date(),
              base: parseResult.totalRemesa,
              tipoIva: 0,
              importeIva: 0,
              total: parseResult.totalRemesa,
              totalConfirming: parseResult.totalRemesa,
              concepto: `Confirming ${confirmingProveedor} - ${parseResult.lineas.length} facturas`,
              estado: 'CONTABILIZADA',
              imputacion: 'Draxton',
              archivoOneDrive: `${fullPath}/${archivo.name}`,
              oneDriveItemId: archivo.id,
              carpetaOrigen: `${CARPETAS.CONFIRMING_DRAXTON}/${subcarpeta}`,
              ocrCompletado: true,
              ocrConfianza: 0.95,
              datosOcrRaw: JSON.stringify(parseResult),
              formaPago: 'confirming',
              confirmingProveedor,
            },
          });
          
          // Crear ConfirmingLineas y auto-vincular
          let lineasVinculadas = 0;
          
          for (const linea of parseResult.lineas) {
            // Buscar factura emitida por número de factura
            const numNorm = normalizarNumFactura(linea.numFactura);
            
            // Buscar factura emitida por número de factura (corregido: AND + OR combinados correctamente)
            const facturaEmitida = await prisma.facturaEmitida.findFirst({
              where: {
                AND: [
                  // Condición 1: número de factura coincide
                  {
                    OR: [
                      { numFactura: { equals: numNorm, mode: 'insensitive' } },
                      { numFactura: { equals: linea.numFactura, mode: 'insensitive' } },
                    ],
                  },
                  // Condición 2: es cliente Draxton
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
            
            // Buscar con query más flexible si la anterior no funciona
            let facturaId: string | null = null;
            let importeReal = linea.importe;
            
            if (facturaEmitida) {
              facturaId = facturaEmitida.id;
              // USAR EL TOTAL DE LA FACTURA EMITIDA como importe real (más fiable que el parseado)
              importeReal = facturaEmitida.total;
            } else {
              // Intentar búsqueda por normalización
              const allDraxton = await prisma.facturaEmitida.findMany({
                where: {
                  numFactura: { startsWith: 'DRAX', mode: 'insensitive' },
                },
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
            
            await prisma.confirmingLinea.create({
              data: {
                confirmingId: facturaRecibida.id,
                numFactura: numNorm,
                // Usar el total de la factura emitida si se vinculó, sino el parseado
                importe: importeReal,
                facturaEmitidaId: facturaId,
                notas: linea.fechaPago ? `Vto: ${linea.fechaPago}` : undefined,
              },
            });
            
            totalLineasCreadas++;
            if (facturaId) {
              lineasVinculadas++;
              totalVinculadas++;
            }
          }
          
          resultados.push({
            archivo: archivo.name,
            subcarpeta,
            estado: 'ok',
            banco: parseResult.banco,
            lineas: parseResult.lineas.length,
            vinculadas: lineasVinculadas,
            totalRemesa: parseResult.totalRemesa,
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
    
    // Después de importar, actualizar estados de facturas emitidas
    await actualizarEstadosFacturasEmitidas();
    
    // Intentar conciliación bancaria automática
    const conciliacion = await conciliarMovimientosBancarios();
    
    return NextResponse.json({
      mensaje: `Sincronización completada: ${resultados.filter(r => r.estado === 'ok').length} documentos procesados`,
      procesados: totalProcesados,
      lineasCreadas: totalLineasCreadas,
      lineasVinculadas: totalVinculadas,
      conciliacion,
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
          // Corregir el importe con el total real de la factura emitida
          importe: facturaEmitida.total,
        },
      });
      vinculadas++;
    }
  }
  
  // Actualizar estados
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
  // Obtener todas las facturas emitidas que tienen líneas de confirming vinculadas
  const facturasConConfirming = await prisma.facturaEmitida.findMany({
    where: {
      confirmingLineas: { some: {} },
    },
    select: {
      id: true,
      total: true,
      importeCobrado: true,
      estado: true,
      confirmingLineas: {
        select: { importe: true },
      },
    },
  });
  
  for (const factura of facturasConConfirming) {
    // El importeCobrado es el total de la factura (si tiene confirming vinculado, está cobrada al 100%)
    // Cada línea de confirming representa una cesión de crédito de ESA factura, no un pago parcial
    // Así que si hay al menos 1 línea de confirming vinculada, la factura está cobrada
    const importeCobrado = factura.total; // El confirming cubre el 100% de la factura
    
    if (factura.estado !== 'COBRADA' || Math.abs((factura.importeCobrado || 0) - importeCobrado) > 0.01) {
      await prisma.facturaEmitida.update({
        where: { id: factura.id },
        data: {
          importeCobrado,
          estado: 'COBRADA',
          formaCobro: 'Confirming',
        },
      });
    }
  }
}

/**
 * Concilia automáticamente movimientos bancarios con facturas emitidas de Draxton
 * 
 * Busca ingresos bancarios que coincidan con los importes de confirming
 * y los vincula con las facturas emitidas correspondientes.
 */
async function conciliarMovimientosBancarios() {
  // Obtener documentos de confirming con sus totales
  const confirmings = await prisma.facturaRecibida.findMany({
    where: {
      carpetaOrigen: { contains: 'Confirming', mode: 'insensitive' },
      totalConfirming: { not: null, gt: 0 },
    },
    select: {
      id: true,
      totalConfirming: true,
      fecha: true,
      confirmingProveedor: true,
      confirmingLineas: {
        select: {
          facturaEmitidaId: true,
          importe: true,
        },
        where: { facturaEmitidaId: { not: null } },
      },
    },
  });
  
  // Obtener movimientos bancarios de ingresos no conciliados que podrían ser de confirming
  const movimientosSinConciliar = await prisma.movimientoBancario.findMany({
    where: {
      importe: { gt: 0 },
      conciliado: false,
      facturaEmitidaId: null,
      OR: [
        { concepto: { contains: 'CONFIRMING', mode: 'insensitive' } },
        { concepto: { contains: 'CESION', mode: 'insensitive' } },
        { concepto: { contains: 'CREDITO', mode: 'insensitive' } },
        { concepto: { contains: 'DRAXTON', mode: 'insensitive' } },
        { tercero: { contains: 'BBVA', mode: 'insensitive' } },
        { tercero: { contains: 'CAIXA', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      importe: true,
      fechaOperacion: true,
      concepto: true,
      tercero: true,
    },
    orderBy: { fechaOperacion: 'desc' },
  });
  
  let conciliados = 0;
  const detalles: Array<{ movimientoId: string; confirmingId: string; importe: number }> = [];
  
  for (const confirming of confirmings) {
    if (!confirming.totalConfirming || confirming.confirmingLineas.length === 0) continue;
    
    // Buscar un movimiento bancario que coincida con el total del confirming
    // Tolerancia: el importe neto puede ser ligeramente menor por intereses/comisiones (hasta 5%)
    const totalConfirming = confirming.totalConfirming;
    const toleranciaMin = totalConfirming * 0.93; // Hasta 7% menos por intereses
    const toleranciaMax = totalConfirming * 1.01; // Hasta 1% más (redondeos)
    
    const movimientoMatch = movimientosSinConciliar.find(m => {
      const importe = Number(m.importe);
      // El importe del movimiento debe estar en el rango
      if (importe < toleranciaMin || importe > toleranciaMax) return false;
      
      // La fecha del movimiento debe ser posterior o igual a la fecha del confirming
      const fechaMov = new Date(m.fechaOperacion);
      const fechaConf = new Date(confirming.fecha);
      if (fechaMov < fechaConf) return false;
      
      // No debe estar demasiado lejos (máximo 120 días después)
      const diffDias = (fechaMov.getTime() - fechaConf.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDias > 120) return false;
      
      return true;
    });
    
    if (movimientoMatch) {
      // Vincular el movimiento con la primera factura emitida del confirming
      const primeraFactura = confirming.confirmingLineas[0];
      if (primeraFactura?.facturaEmitidaId) {
        await prisma.movimientoBancario.update({
          where: { id: movimientoMatch.id },
          data: {
            facturaEmitidaId: primeraFactura.facturaEmitidaId,
            conciliado: true,
            tipoDocumento: 'factura',
            notaConciliacion: `Auto-conciliado: Confirming ${confirming.confirmingProveedor || ''} (${confirming.confirmingLineas.length} facturas)`,
          },
        });
        
        // Quitar de la lista para no reusar
        const idx = movimientosSinConciliar.indexOf(movimientoMatch);
        if (idx > -1) movimientosSinConciliar.splice(idx, 1);
        
        conciliados++;
        detalles.push({
          movimientoId: movimientoMatch.id,
          confirmingId: confirming.id,
          importe: Number(movimientoMatch.importe),
        });
      }
    }
  }
  
  return {
    movimientosAnalizados: movimientosSinConciliar.length + conciliados,
    conciliados,
    detalles,
  };
}

// --- Utilidades ---

function parseFechaString(fecha: string): Date {
  // Formato: DD/MM/YYYY o DD-MM-YYYY
  const match = fecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return new Date();
}
