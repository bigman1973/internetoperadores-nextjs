import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, actorRevisor, failure, idSchema, readJson, reply } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function cargar(id: string) {
  const [c] = await prisma.$queryRaw<{ id: string; periodo: string; estado: 'PREPARADO' | 'ENVIADO'; destinatario: string | null; asunto: string | null; cuerpo: string | null; creadoAt: string; enviadoAt: string | null; enviadoPor: string | null }[]>(Prisma.sql`
    SELECT c.id, c.periodo, c.estado, c.borrador_destinatario AS destinatario, c.borrador_asunto AS asunto, c.borrador_cuerpo AS cuerpo, c.created_at AS "creadoAt", c.enviado_at AS "enviadoAt", u.email AS "enviadoPor"
    FROM area5_cierres c LEFT JOIN usuarios_admin u ON u.id = c.enviado_por_id WHERE c.id = ${id}`);
  if (!c) throw new ApiError('NO_ENCONTRADO', 404, 'Cierre no encontrado');
  return c;
}

/** GET: cierre con el desglose por trabajador y los gastos incluidos. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    await actorRevisor();
    const id = idSchema.parse((await params).id);
    const cierre = await cargar(id);
    const trabajadores = await prisma.$queryRaw(Prisma.sql`
      SELECT g.empleado_id AS "empleadoId", e.nombre_completo AS nombre, e.nif, count(*)::int AS n,
             coalesce(sum(g.importe) FILTER (WHERE g.tipo = 'TICKET'), 0)::float8 AS tickets,
             coalesce(sum(g.km), 0)::float8 AS km, coalesce(sum(g.importe) FILTER (WHERE g.tipo = 'KILOMETRAJE'), 0)::float8 AS "importeKm", sum(g.importe)::float8 AS total
      FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id WHERE g.cierre_id = ${id} GROUP BY g.empleado_id, e.nombre_completo, e.nif ORDER BY e.nombre_completo`);
    return reply({ cierre, trabajadores });
  } catch (e) { return failure(e); }
}

/** PATCH {accion:'borrador', destinatario?, asunto, cuerpo} | {accion:'marcar_enviado'} — marcar enviado lo hace una persona; el panel no envía correos. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const a = await actorRevisor();
    const id = idSchema.parse((await params).id);
    const body = await readJson(req);
    const c = await cargar(id);
    if (c.estado === 'ENVIADO') throw new ApiError('YA_ENVIADO', 409, 'Este cierre ya está marcado como enviado.');
    if (body?.accion === 'borrador') {
      const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
      const dest = s(body.destinatario, 320);
      if (dest && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) throw new ApiError('EMAIL', 400, 'El correo de la gestoría no es válido.');
      await prisma.$executeRaw(Prisma.sql`UPDATE area5_cierres SET borrador_destinatario = ${dest || null}, borrador_asunto = ${s(body.asunto, 300) || null}, borrador_cuerpo = ${s(body.cuerpo, 8000) || null} WHERE id = ${id} AND estado = 'PREPARADO'`);
    } else if (body?.accion === 'marcar_enviado') {
      await prisma.$executeRaw(Prisma.sql`UPDATE area5_cierres SET estado = 'ENVIADO', enviado_por_id = ${a.usuarioId}, enviado_at = CURRENT_TIMESTAMP WHERE id = ${id} AND estado = 'PREPARADO'`);
    } else throw new ApiError('ACCION_NO_VALIDA', 400, 'Acción no válida');
    return reply({ cierre: await cargar(id) });
  } catch (e) { return failure(e); }
}

/** DELETE: deshace un cierre que aún no se ha enviado; los gastos quedan de nuevo como aprobados. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const a = await actorRevisor();
    const id = idSchema.parse((await params).id);
    const origin = req.headers.get('origin');
    if (!origin || origin !== new URL(req.url).origin) throw new ApiError('ORIGIN_NOT_ALLOWED', 403);
    const c = await cargar(id);
    if (c.estado === 'ENVIADO') throw new ApiError('YA_ENVIADO', 409, 'Un cierre enviado no se puede deshacer.');
    await prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`INSERT INTO area5_gasto_eventos (gasto_id, actor_email, accion, texto) SELECT id, ${a.email}, 'CIERRE_DESHECHO', ${'Cierre ' + c.periodo} FROM area5_gastos WHERE cierre_id = ${id}`);
      await tx.$executeRaw(Prisma.sql`UPDATE area5_gastos SET cierre_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE cierre_id = ${id}`);
      await tx.$executeRaw(Prisma.sql`DELETE FROM area5_cierres WHERE id = ${id} AND estado = 'PREPARADO'`);
    });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
