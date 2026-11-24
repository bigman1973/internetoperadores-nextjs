import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { libroExcel, pdfTrabajador, type LineaPaquete, type TicketAdjunto } from '@/lib/area5/paquete';
import { ApiError, actorRevisor, failure, idSchema } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const limpio = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);

/** GET ?formato=excel[&empleadoId=] | ?formato=pdf&empleadoId=  — solo revisores; los ficheros no se guardan ni se envían. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await actorRevisor();
    const id = idSchema.parse((await params).id);
    const sp = new URL(req.url).searchParams;
    const formato = sp.get('formato');
    const empleadoId = sp.get('empleadoId');
    const [c] = await prisma.$queryRaw<{ periodo: string }[]>(Prisma.sql`SELECT periodo FROM area5_cierres WHERE id = ${id}`);
    if (!c) throw new ApiError('NO_ENCONTRADO', 404, 'Cierre no encontrado');
    const lineas = await prisma.$queryRaw<LineaPaquete[]>(Prisma.sql`
      SELECT g.id, g.empleado_id AS "empleadoId", e.nombre_completo AS "empleadoNombre", e.nif AS "empleadoNif", g.tipo, to_char(g.fecha, 'YYYY-MM-DD') AS fecha, g.concepto, g.categoria, g.proyecto, g.cliente, g.comercio,
             g.importe::float8 AS importe, g.tipo_iva::float8 AS "tipoIva", g.base_imponible::float8 AS "baseImponible", g.importe_iva::float8 AS "importeIva", g.km::float8 AS km, g.eur_km::float8 AS "eurKm",
             g.revisor_email AS "revisorEmail", g.revisado_at::text AS "revisadoAt"
      FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id WHERE g.cierre_id = ${id} ORDER BY e.nombre_completo, g.fecha`);
    if (formato === 'excel') {
      const ls = empleadoId ? lineas.filter(l => l.empleadoId === empleadoId) : lineas;
      if (!ls.length) throw new ApiError('SIN_DATOS', 404, 'No hay gastos para esa selección.');
      const nombre = `gastos_${c.periodo}${empleadoId ? '_' + limpio(ls[0].empleadoNombre) : ''}.xlsx`;
      return new NextResponse(new Uint8Array(libroExcel(c.periodo, lineas, empleadoId || undefined)), { headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${nombre}"`, 'Cache-Control': 'private, no-store' } });
    }
    if (formato === 'pdf') {
      const ls = lineas.filter(l => l.empleadoId === empleadoId);
      if (!empleadoId || !ls.length) throw new ApiError('SIN_DATOS', 404, 'Indica un trabajador con gastos en este cierre.');
      const adj = await prisma.$queryRaw<{ gastoId: string; mime: string; datos: Buffer }[]>(Prisma.sql`
        SELECT a.gasto_id AS "gastoId", a.mime, a.datos FROM area5_gasto_adjuntos a JOIN area5_gastos g ON g.id = a.gasto_id WHERE g.cierre_id = ${id} AND g.empleado_id = ${empleadoId}`);
      const tickets = new Map<string, TicketAdjunto>(adj.map(x => [x.gastoId, x]));
      const pdf = await pdfTrabajador(c.periodo, ls, tickets);
      return new NextResponse(new Uint8Array(pdf), { headers: {
        'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="gastos_${c.periodo}_${limpio(ls[0].empleadoNombre)}.pdf"`, 'Cache-Control': 'private, no-store' } });
    }
    throw new ApiError('FORMATO', 400, 'Formato no válido (excel o pdf).');
  } catch (e) { return failure(e); }
}
