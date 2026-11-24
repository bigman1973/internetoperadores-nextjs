import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSubidaAuth } from '@/lib/subida-precios/auth';
import { ApiError, auditar, failure, idSchema, reply } from '../../_shared';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const id = idSchema.parse((await ctx.params).id);
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT e.id, e.nombre, e.nota, e.estado, e.periodo_desde AS "desde", e.periodo_hasta AS "hasta", e.resumen, e.estado_aprobacion AS "estadoAprobacion",
             e.fecha_efecto::text AS "fechaEfecto", e.aprobado_at AS "aprobadoAt", e.created_at AS "createdAt", a.nombre AS autor, ap.nombre AS "aprobadoPor"
      FROM area2_subida_escenarios e JOIN usuarios_admin a ON a.id = e.autor_id LEFT JOIN usuarios_admin ap ON ap.id = e.aprobado_por WHERE e.id = ${id}`);
    if (!rows.length) throw new ApiError('NO_ENCONTRADO', 404, 'El escenario ya no existe.');
    return reply(rows[0]);
  } catch (e) { return failure(e); }
}

/** Solo se borran borradores. Un escenario aprobado se conserva como registro de la decisión. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const origin = req.headers.get('origin'); if (!origin || origin !== new URL(req.url).origin) throw new ApiError('ORIGIN_NOT_ALLOWED', 403);
    const id = idSchema.parse((await ctx.params).id);
    const rows = await prisma.$queryRaw<{ nombre: string }[]>(Prisma.sql`
      DELETE FROM area2_subida_escenarios WHERE id = ${id} AND estado_aprobacion = 'BORRADOR' RETURNING nombre`);
    if (!rows.length) throw new ApiError('NO_BORRABLE', 409, 'No existe o ya está aprobado (los aprobados no se borran).');
    await auditar(auth.userId, 'ESCENARIO_BORRADO', id, { nombre: rows[0].nombre });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
