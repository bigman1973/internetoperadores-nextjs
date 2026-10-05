import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findCostesFiles } from '@/lib/microsoft-graph';
import { syncPayrollMonth } from '@/lib/nominas-sync';

export const maxDuration = 120;
const ROLES = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH'];

async function authorize() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const user = await prisma.usuarioAdmin.findUnique({ where: { email: session.user.email }, select: { activo: true, rol: true, roles: true } });
  if (!user?.activo || ![user.rol, ...user.roles].some(role => ROLES.includes(role))) {
    return NextResponse.json({ error: 'Sin permisos de nóminas' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const error = await authorize();
  if (error) return error;
  try {
    const anio = Number(req.nextUrl.searchParams.get('anio') || new Date().getFullYear());
    const files = await findCostesFiles(anio);
    const loaded = await prisma.nomina.groupBy({ by: ['mes'], where: { anio }, _count: { _all: true } });
    const counts = new Map(loaded.map(x => [x.mes, x._count._all]));
    const groups = [...new Set(files.map(f => f.monthNum))].sort((a, b) => a - b).map(monthNum => {
      const monthFiles = files.filter(f => f.monthNum === monthNum);
      const summary = monthFiles.find(f => f.tipo === 'costes_io');
      return {
        id: summary?.id || monthFiles[0].id,
        name: `${summary?.name || `${monthFiles[0].month} ${anio}`} · ${monthFiles.filter(f => f.tipo === 'nomina_individual').length} nóminas individuales · ${monthFiles.filter(f => f.tipo === 'liquidacion').length} liquidaciones`,
        month: monthFiles[0].month, monthNum,
        loaded: counts.has(monthNum), empleadosEnBD: counts.get(monthNum) || 0,
        archivosDetectados: monthFiles.length,
        resumenDisponible: Boolean(summary),
        individuales: monthFiles.filter(f => f.tipo === 'nomina_individual').length,
        liquidaciones: monthFiles.filter(f => f.tipo === 'liquidacion').length,
      };
    });
    return NextResponse.json({ anio, archivosOneDrive: groups, mesesCargados: [...counts.keys()].sort((a, b) => a - b), totalMesesDisponibles: groups.length, totalMesesCargados: loaded.length });
  } catch (e) {
    console.error('Error de lectura del catálogo de nóminas', e);
    return NextResponse.json({ error: 'No se pudo consultar la carpeta de nóminas de OneDrive. Comprueba el acceso a SharePoint.' }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const error = await authorize();
  if (error) return error;
  let anio: number, meses: number[], dryRun = false;
  try {
    const input = await req.json();
    anio = Number(input.anio);
    meses = input.meses;
    dryRun = input.dryRun === true;
    if (!Number.isInteger(anio) || anio < 2024 || anio > 2100 || !Array.isArray(meses) || !meses.length || meses.length > 1 || meses.some(m => !Number.isInteger(m) || m < 1 || m > 12)) {
      return NextResponse.json({ error: 'Selecciona exactamente un mes válido para una importación comprobable' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Solicitud de sincronización no válida' }, { status: 400 });
  }
  try {
    // Descubrir únicamente el mes solicitado. El botón general del cliente lo procesa mes a mes.
    const files = await findCostesFiles(anio, meses);
    const result = await syncPayrollMonth(anio, meses[0], files, dryRun);
    return NextResponse.json({ success: result.success, dryRun, anio, resultados: [{ mes: result.mes, success: result.success, summary: { empleados: result.empleados }, error: result.error, documentos: result.documentos, liquidacionesEnResumen: result.liquidacionesEnResumen, sinReciboIndividual: result.sinReciboIndividual, incidencias: result.incidencias }], resumen: { totalArchivos: files.length, exitosos: result.success ? 1 : 0, fallidos: result.success ? 0 : 1, documentosVinculados: result.documentos } }, { status: result.success ? 200 : 422 });
  } catch (e) {
    console.error('Error de sincronización de nóminas', e);
    if (e instanceof Error && e.message.startsWith('El PDF vigente fue sustituido en OneDrive')) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json({ error: 'No se ha importado el mes. Los datos anteriores permanecen sin cambios; revisa los PDF o reintenta.' }, { status: 503 });
  }
}
