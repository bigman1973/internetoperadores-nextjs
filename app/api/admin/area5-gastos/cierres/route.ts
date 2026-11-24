import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { borradorGestoria, nombrePeriodo } from '@/lib/area5/paquete';
import { ApiError, actorRevisor, aviso, eur, failure, mesRango, periodoSchema, readJson, reply } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';

interface FilaTrab { empleadoId: string; nombre: string; nif: string; n: number; total: number; km: number; importeKm: number }
const porTrabajador = (cond: Prisma.Sql) => prisma.$queryRaw<FilaTrab[]>(Prisma.sql`
  SELECT g.empleado_id AS "empleadoId", e.nombre_completo AS nombre, e.nif, count(*)::int AS n, sum(g.importe)::float8 AS total,
         coalesce(sum(g.km), 0)::float8 AS km, coalesce(sum(g.importe) FILTER (WHERE g.tipo = 'KILOMETRAJE'), 0)::float8 AS "importeKm"
  FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id WHERE ${cond} GROUP BY g.empleado_id, e.nombre_completo, e.nif ORDER BY e.nombre_completo`);

/** GET /api/admin/area5-gastos/cierres[?preview=AAAA-MM] */
export async function GET(req: NextRequest) {
  try {
    await actorRevisor();
    const preview = new URL(req.url).searchParams.get('preview');
    const cierres = await prisma.$queryRaw(Prisma.sql`
      SELECT c.id, c.periodo, c.estado, c.created_at AS "creadoAt", c.enviado_at AS "enviadoAt", u.email AS "creadoPor",
             (SELECT count(*)::int FROM area5_gastos g WHERE g.cierre_id = c.id) AS n,
             (SELECT coalesce(sum(g.importe), 0)::float8 FROM area5_gastos g WHERE g.cierre_id = c.id) AS total
      FROM area5_cierres c JOIN usuarios_admin u ON u.id = c.creado_por_id ORDER BY c.periodo DESC LIMIT 36`);
    if (!preview) return reply({ cierres });
    const p = periodoSchema.parse(preview);
    const { fin } = mesRango(p);
    const candidatos = await porTrabajador(Prisma.sql`g.estado = 'APROBADO' AND g.cierre_id IS NULL AND g.fecha < ${fin}::date`);
    const [sin] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM area5_gastos WHERE estado IN ('PENDIENTE', 'ACLARACION') AND fecha < ${fin}::date`);
    const existente = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM area5_cierres WHERE periodo = ${p}`);
    return reply({ cierres, preview: { periodo: p, candidatos, sinResolver: sin.n, cierreId: existente[0]?.id ?? null } });
  } catch (e) { return failure(e); }
}

/** POST {periodo} — congela los gastos aprobados (fecha hasta fin de mes) y deja listo el paquete y el borrador. No envía nada. */
export async function POST(req: NextRequest) {
  try {
    const a = await actorRevisor();
    const periodo = periodoSchema.parse((await readJson(req))?.periodo);
    const { fin } = mesRango(periodo);
    const id = await prisma.$transaction(async tx => {
      const ya = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM area5_cierres WHERE periodo = ${periodo}`);
      if (ya.length) throw new ApiError('YA_CERRADO', 409, 'Ese mes ya tiene un cierre. Deshazlo primero si aún no se ha enviado.');
      const [c] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`INSERT INTO area5_cierres (periodo, creado_por_id) VALUES (${periodo}, ${a.usuarioId}) RETURNING id`);
      const n = await tx.$executeRaw(Prisma.sql`UPDATE area5_gastos SET cierre_id = ${c.id}, updated_at = CURRENT_TIMESTAMP WHERE estado = 'APROBADO' AND cierre_id IS NULL AND fecha < ${fin}::date`);
      if (n === 0) throw new ApiError('SIN_GASTOS', 409, 'No hay gastos aprobados pendientes de cerrar hasta ese mes.');
      await tx.$executeRaw(Prisma.sql`INSERT INTO area5_gasto_eventos (gasto_id, actor_email, accion, texto) SELECT id, ${a.email}, 'CIERRE', ${'Cierre ' + periodo} FROM area5_gastos WHERE cierre_id = ${c.id}`);
      const filas = await tx.$queryRaw<{ nombre: string; total: number; email: string | null }[]>(Prisma.sql`
        SELECT e.nombre_completo AS nombre, sum(g.importe)::float8 AS total, e.email FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id WHERE g.cierre_id = ${c.id} GROUP BY e.nombre_completo, e.email ORDER BY 1`);
      const b = borradorGestoria(periodo, filas, process.env.AREA5_GESTORIA_EMAIL || null);
      await tx.$executeRaw(Prisma.sql`UPDATE area5_cierres SET borrador_destinatario = ${b.destinatario || null}, borrador_asunto = ${b.asunto}, borrador_cuerpo = ${b.cuerpo} WHERE id = ${c.id}`);
      for (const f of filas) if (f.email) await aviso(tx, f.email, 'CIERRE', `Tus gastos aprobados (${eur(f.total)}) entran en el cierre de ${nombrePeriodo(periodo)} y se abonarán en nómina.`, null);
      return c.id;
    });
    return reply({ id }, 201);
  } catch (e) { return failure(e); }
}
