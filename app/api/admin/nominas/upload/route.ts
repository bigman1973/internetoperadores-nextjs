import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { classifyPayrollFile } from '@/lib/microsoft-graph';
import { parseCostesIOPdf } from '@/lib/nominas-parser';

const ROLES = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH'];

/** Importación manual no destructiva del resumen autorizado de la gestoría. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const actor = await prisma.usuarioAdmin.findUnique({ where: { email: session.user.email }, select: { activo: true, rol: true, roles: true } });
  if (!actor?.activo || ![actor.rol, ...actor.roles].some(role => ROLES.includes(role))) return NextResponse.json({ error: 'Sin permisos de nóminas' }, { status: 403 });
  try {
    const file = (await req.formData()).get('file');
    if (!(file instanceof File) || classifyPayrollFile(file.name) !== 'costes_io' || file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: 'Selecciona un PDF de COSTES INTERNET OPERADORES (máximo 15 MB). Las nóminas individuales se vinculan desde OneDrive.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.subarray(0, 4).toString() !== '%PDF') return NextResponse.json({ error: 'El archivo no es un PDF válido' }, { status: 400 });
    const summary = await parseCostesIOPdf(buffer, file.name);
    if (summary.formato !== 'costes_io' || !summary.nominas.length || !summary.verificado || summary.mes < 1 || summary.mes > 12 || summary.anio < 2024 || summary.nominas.some(n => n.mes !== summary.mes || n.anio !== summary.anio)) {
      return NextResponse.json({ error: 'Resumen no verificable o período inconsistente. No se ha modificado ninguna nómina.' }, { status: 422 });
    }
    const employees = await prisma.empleado.findMany({ select: { id: true, nif: true } });
    const byNif = new Map(employees.map(e => [e.nif.replace(/[\s.-]/g, '').toUpperCase(), e.id]));
    const lines = new Map<string, typeof summary.nominas[number]>();
    const settlements = new Map<string, typeof summary.nominas[number]>();
    function addLines(old: typeof summary.nominas[number], line: typeof summary.nominas[number]) {
      const merged = { ...old };
      for (const key of ['devengadoTotal', 'netoPercibir', 'irpf', 'ssTrabajador', 'ssEmpresa', 'baseIrpf', 'costeTotalEmpresa', 'complementoEspecie'] as const) {
        merged[key] = (Math.round(old[key] * 100) + Math.round(line[key] * 100)) / 100;
      }
      return merged;
    }
    for (const line of summary.nominas) {
      const employeeId = byNif.get(line.nif.replace(/[\s.-]/g, '').toUpperCase());
      if (!employeeId) return NextResponse.json({ error: 'Hay un trabajador del resumen sin ficha de Personal. No se ha modificado ninguna nómina.' }, { status: 422 });
      if (line.tipo === 'LIQUIDACION') {
        const previousSettlement = settlements.get(employeeId);
        settlements.set(employeeId, previousSettlement ? addLines(previousSettlement, line) : line);
      }
      const old = lines.get(employeeId);
      if (!old) { lines.set(employeeId, line); continue; }
      lines.set(employeeId, addLines(old, line));
    }
    const previous = await prisma.nomina.findMany({ where: { mes: summary.mes, anio: summary.anio }, select: { empleadoId: true } });
    if (previous.some(n => !lines.has(n.empleadoId))) {
      return NextResponse.json({ error: 'El PDF no incluye a todas las personas que constan en el mes. No se han modificado datos.' }, { status: 422 });
    }
    await prisma.$transaction(async tx => {
      for (const [empleadoId, n] of lines) {
        const settlement = settlements.get(empleadoId);
        const data = {
          devengadoTotal: n.devengadoTotal, netoPercibir: n.netoPercibir, irpf: n.irpf,
          ssTrabajador: n.ssTrabajador, ssEmpresa: n.ssEmpresa, baseIrpf: n.baseIrpf,
          costeTotalEmpresa: n.costeTotalEmpresa, complementoEspecie: n.complementoEspecie || null,
          liquidacionDevengado: settlement?.devengadoTotal ?? null,
          liquidacionNeto: settlement?.netoPercibir ?? null,
          liquidacionCoste: settlement?.costeTotalEmpresa ?? null,
        };
        await tx.nomina.upsert({
          where: { empleadoId_mes_anio: { empleadoId, mes: summary.mes, anio: summary.anio } },
          create: { empleadoId, mes: summary.mes, anio: summary.anio, ...data, archivoNombre: file.name },
          update: data,
        });
      }
    }, { timeout: 30000 });
    return NextResponse.json({ success: true, archivo: file.name, mes: summary.mes, anio: summary.anio,
      empleadosProcesados: lines.size, empleadosEnPDF: summary.nominas.length, resumen: {
        totalBruto: summary.totalBruto, totalNeto: summary.totalNeto, totalIRPF: summary.totalIRPF,
        totalSSTrabajador: summary.totalSSTrabajador, totalSSEmpresa: summary.totalSSEmpresa,
        totalCosteEmpresa: summary.totalCosteEmpresa, verificado: summary.verificado,
      } });
  } catch (e) {
    console.error('Error al importar costes de personal', e);
    return NextResponse.json({ error: 'No se pudo completar la importación; los datos anteriores se conservan.' }, { status: 500 });
  }
}
