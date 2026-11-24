import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { cents, cuadrar, extraerConceptosNomina, type ConceptoNomina } from '@/lib/area5/core';
import { extractPayrollPdfText, parseCostesIOPdf } from '@/lib/nominas-parser';
import { ApiError, actorRevisor, failure, mismoOrigen, mesRango, periodoSchema, reply } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const nif = (s: string) => s.replace(/[\s.-]/g, '').toUpperCase();

/**
 * GET ?periodo=AAAA-MM — cuadra, por trabajador, los gastos aprobados del cierre del mes con los conceptos de gasto de su nómina.
 * Solo David y Víctor: el resto de roles (incluida administración/contabilidad) no ve nóminas por aquí.
 */
export async function GET(req: NextRequest) {
  try {
    await actorRevisor();
    const periodo = periodoSchema.parse(new URL(req.url).searchParams.get('periodo'));
    const { mes, anio } = mesRango(periodo);
    const [cierre] = await prisma.$queryRaw<{ id: string; estado: string }[]>(Prisma.sql`SELECT id, estado FROM area5_cierres WHERE periodo = ${periodo}`);
    const gastos = cierre ? await prisma.$queryRaw<{ empleadoId: string; nombre: string; n: number; total: number; km: number }[]>(Prisma.sql`
      SELECT g.empleado_id AS "empleadoId", e.nombre_completo AS nombre, count(*)::int AS n, sum(g.importe)::float8 AS total,
             coalesce(sum(g.importe) FILTER (WHERE g.tipo = 'KILOMETRAJE'), 0)::float8 AS km
      FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id WHERE g.cierre_id = ${cierre.id} GROUP BY g.empleado_id, e.nombre_completo`) : [];
    const conceptos = await prisma.$queryRaw<{ empleadoId: string; codigo: string; concepto: string; importe: number; esGasto: boolean; dudoso: boolean }[]>(Prisma.sql`
      SELECT empleado_id AS "empleadoId", codigo, concepto, importe::float8 AS importe, es_gasto AS "esGasto", dudoso FROM area5_nomina_conceptos WHERE mes = ${mes} AND anio = ${anio} ORDER BY id`);
    const nominas = await prisma.nomina.findMany({ where: { mes, anio }, select: { empleadoId: true, gastosNoSalariales: true, empleado: { select: { nombreCompleto: true } } } });
    const nombres = new Map<string, string>();
    gastos.forEach(g => nombres.set(g.empleadoId, g.nombre));
    nominas.forEach(n => nombres.set(n.empleadoId, nombres.get(n.empleadoId) || n.empleado.nombreCompleto));
    const faltan = [...new Set(conceptos.map(c => c.empleadoId))].filter(i => !nombres.has(i));
    if (faltan.length) (await prisma.empleado.findMany({ where: { id: { in: faltan } }, select: { id: true, nombreCompleto: true } })).forEach(e => nombres.set(e.id, e.nombreCompleto));
    const ids = new Set<string>([...gastos.map(g => g.empleadoId), ...conceptos.filter(c => c.esGasto || c.dudoso).map(c => c.empleadoId), ...nominas.filter(n => (n.gastosNoSalariales ?? 0) > 0).map(n => n.empleadoId)]);
    const filas = [...ids].map(id => {
      const g = gastos.find(x => x.empleadoId === id);
      const cs: ConceptoNomina[] = conceptos.filter(c => c.empleadoId === id).map(c => ({ codigo: c.codigo, concepto: c.concepto, importeCents: cents(c.importe), esGasto: c.esGasto, dudoso: c.dudoso }));
      const nomina = nominas.find(n => n.empleadoId === id);
      return cuadrar({
        empleadoId: id, nombre: nombres.get(id) || id, gastosCents: g ? cents(g.total) : 0, numGastos: g?.n ?? 0, kmCents: g ? cents(g.km) : 0,
        nominaImportada: !!nomina || cs.length > 0, conceptos: cs, respaldoNominaCents: nomina?.gastosNoSalariales != null ? cents(nomina.gastosNoSalariales) : null,
      });
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const nominasCargadas = await prisma.nomina.count({ where: { mes, anio } });
    return reply({ periodo, cierre: cierre ?? null, filas, nominasCargadas, resumen: {
      cuadran: filas.filter(f => f.estado === 'CUADRA').length, diferencias: filas.filter(f => f.estado === 'DIFERENCIA').length,
      pendientes: filas.filter(f => ['SIN_NOMINA', 'SIN_DESGLOSE', 'REVISAR'].includes(f.estado)).length,
    } });
  } catch (e) { return failure(e); }
}

/**
 * POST multipart {periodo, files[]} — nóminas INDIVIDUALES devueltas por la gestoría (PDF). Lee los conceptos de gasto de cada una.
 * No toca la tabla de nóminas ni el flujo de «Importar Nóminas»: guarda solo area5_nomina_conceptos. Cada PDF es todo-o-nada.
 */
export async function POST(req: NextRequest) {
  try {
    const a = await actorRevisor();
    mismoOrigen(req);
    const form = await req.formData();
    const periodo = periodoSchema.parse(form.get('periodo'));
    const { mes, anio } = mesRango(periodo);
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) throw new ApiError('SIN_ARCHIVOS', 400, 'Adjunta al menos una nómina en PDF.');
    if (files.length > 40) throw new ApiError('DEMASIADOS', 400, 'Máximo 40 PDF por envío.');
    const empleados = await prisma.empleado.findMany({ select: { id: true, nif: true, nombreCompleto: true } });
    const porNif = new Map(empleados.map(e => [nif(e.nif), e]));
    const resultados: { archivo: string; ok: boolean; trabajador?: string; conceptos?: number; dudosos?: number; error?: string }[] = [];
    for (const f of files) {
      try {
        if (f.size > 5 * 1024 * 1024) throw new Error('El PDF supera 5 MB');
        const buf = Buffer.from(await f.arrayBuffer());
        if (buf.subarray(0, 4).toString() !== '%PDF') throw new Error('No es un PDF');
        const resumen = await parseCostesIOPdf(buf, f.name);
        if (resumen.nominas.length !== 1 || !resumen.verificado) throw new Error('Debe ser una nómina individual cuyos importes cuadren');
        const n = resumen.nominas[0];
        if (n.mes !== mes || n.anio !== anio) throw new Error(`La nómina es de ${String(n.mes).padStart(2, '0')}/${n.anio}, no de ${String(mes).padStart(2, '0')}/${anio}`);
        const emp = porNif.get(nif(n.nif));
        if (!emp) throw new Error('La persona de la nómina no consta en Personal');
        const cs = extraerConceptosNomina(await extractPayrollPdfText(buf));
        await prisma.$transaction(async tx => {
          await tx.$executeRaw(Prisma.sql`DELETE FROM area5_nomina_conceptos WHERE empleado_id = ${emp.id} AND mes = ${mes} AND anio = ${anio}`);
          for (const c of cs) {
            await tx.$executeRaw(Prisma.sql`INSERT INTO area5_nomina_conceptos (empleado_id, mes, anio, codigo, concepto, importe, es_gasto, dudoso, archivo_nombre, importado_por_id)
              VALUES (${emp.id}, ${mes}, ${anio}, ${c.codigo}, ${c.concepto}, ${c.importeCents / 100}::numeric, ${c.esGasto}, ${c.dudoso}, ${f.name.slice(0, 200)}, ${a.usuarioId})`);
          }
        });
        resultados.push({ archivo: f.name, ok: true, trabajador: emp.nombreCompleto, conceptos: cs.filter(c => c.esGasto).length, dudosos: cs.filter(c => c.dudoso).length });
      } catch (e) {
        resultados.push({ archivo: f.name, ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'No se pudo leer' });
      }
    }
    return reply({ periodo, resultados });
  } catch (e) { return failure(e); }
}
