import {privateJson,requireB4FinanceAccess} from '@/lib/finanzas/reconciliation-auth';
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
export async function POST(_req: NextRequest) {
  const access=await requireB4FinanceAccess('escritura');
  if('response' in access)return access.response;
  // C9: esta ruta histórica descargaba Graph, creaba FacturaRecibida con importes
  // parseados y auto-conciliaba/cobraba. Se bloquea antes de cualquier I/O o DML.
  // La futura integración sólo podrá ofrecer clasificación, propuesta y confirmación
  // humana contra un movimiento ya existente según CONTRATO.md.
  return privateJson({
    error: 'Sincronización confirming bloqueada: las comunicaciones de cliente Draxton no son facturas recibidas ni evidencia automática de cobro.',
    code: 'C9_CONFIRMING_REQUIERE_CLASIFICACION_Y_CONFIRMACION_HUMANA',
  }, 409);
}
