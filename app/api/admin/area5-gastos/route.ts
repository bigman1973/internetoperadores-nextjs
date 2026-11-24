import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ESTADOS } from '@/lib/area5/core';
import { actorRevisor, COLS, failure, FROM, reply, type GastoRow } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';

/** GET /api/admin/area5-gastos?estado=PENDIENTE|ACLARACION|APROBADO|RECHAZADO|todos&empleadoId=&periodo=AAAA-MM — solo David y Víctor. */
export async function GET(req: NextRequest) {
  try {
    const a = await actorRevisor();
    const sp = new URL(req.url).searchParams;
    const estado = sp.get('estado') || 'PENDIENTE';
    const emp = sp.get('empleadoId');
    const periodo = sp.get('periodo');
    const w: Prisma.Sql[] = [Prisma.sql`g.estado <> 'BORRADOR'`];
    if (estado !== 'todos') { if (!(ESTADOS as readonly string[]).includes(estado)) return reply({ error: 'Estado no válido' }, 400); w.push(Prisma.sql`g.estado = ${estado}`); }
    if (emp && /^[\w-]{1,64}$/.test(emp)) w.push(Prisma.sql`g.empleado_id = ${emp}`);
    if (periodo && /^20\d{2}-(0[1-9]|1[0-2])$/.test(periodo)) w.push(Prisma.sql`to_char(g.fecha, 'YYYY-MM') = ${periodo}`);
    const gastos = await prisma.$queryRaw<(GastoRow & { propio: boolean })[]>(Prisma.sql`
      SELECT ${COLS}, (g.empleado_id = ${a.empleado?.id ?? ''}) AS propio ${FROM} WHERE ${Prisma.join(w, ' AND ')} ORDER BY g.fecha DESC, g.created_at DESC LIMIT 400`);
    const resumen = await prisma.$queryRaw<{ estado: string; n: number; total: number }[]>(Prisma.sql`SELECT estado, count(*)::int AS n, coalesce(sum(importe), 0)::float8 AS total FROM area5_gastos WHERE estado <> 'BORRADOR' GROUP BY estado`);
    const empleados = await prisma.$queryRaw<{ id: string; nombre: string }[]>(Prisma.sql`SELECT DISTINCT e.id, e.nombre_completo AS nombre FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id WHERE g.estado <> 'BORRADOR' ORDER BY 2`);
    return reply({ gastos, resumen, empleados, yo: a.email });
  } catch (e) { return failure(e); }
}
