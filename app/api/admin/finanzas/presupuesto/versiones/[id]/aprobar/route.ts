import { extrasProduccionCerrados } from '@/lib/produccion-disponibilidad';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { reply, failure, readJson, ApiError, idSchema } from '../../../../_fin-shared';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
/** Aprobar el presupuesto: solo SUPER_ADMIN (Víctor). La versión aprobada anterior pasa a REEMPLAZADO; no se borra nada. */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireFinAuth('presupuesto', { aprobar: true }); if ('error' in auth) return auth.error;
    z.object({ confirmo: z.literal(true) }).strict().parse(await readJson(req));
    const id = idSchema.parse((await ctx.params).id);
    await prisma.$transaction(async tx => {
      const v: any[] = await tx.$queryRaw(Prisma.sql`SELECT estado, ejercicio FROM area3_pre_versiones WHERE id = ${id} FOR UPDATE`);
      if (!v[0]) throw new ApiError('NO_ENCONTRADO', 404, 'La versión no existe.');
      if (v[0].estado !== 'BORRADOR') throw new ApiError('NO_BORRADOR', 409, 'Solo se puede aprobar una versión en borrador.');
      const c: any[] = await tx.$queryRaw(Prisma.sql`SELECT count(*)::int AS n FROM area3_pre_lineas WHERE version_id = ${id}`);
      if (!c[0].n) throw new ApiError('VACIA', 409, 'La versión no tiene líneas.');
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'area3_pre_' + v[0].ejercicio}))`);
      await tx.$executeRaw(Prisma.sql`UPDATE area3_pre_versiones SET estado = 'REEMPLAZADO', updated_at = now() WHERE ejercicio = ${v[0].ejercicio} AND estado = 'APROBADO'`);
      await tx.$executeRaw(Prisma.sql`UPDATE area3_pre_versiones SET estado = 'APROBADO', aprobado_por = ${auth.userId}, aprobado_at = now(), updated_at = now() WHERE id = ${id}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_auditoria (accion, version_id, actor_id, detalle) VALUES ('APROBAR_VERSION', ${id}, ${auth.userId}, ${JSON.stringify({ ejercicio: v[0].ejercicio, lineas: c[0].n })}::jsonb)`);
    });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
