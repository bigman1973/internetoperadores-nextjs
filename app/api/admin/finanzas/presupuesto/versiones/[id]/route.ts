import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { detalleVersion } from '@/lib/presupuesto/data';
import { reply, failure, readJson, ApiError, idSchema } from '../../../_fin-shared';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinAuth('presupuesto'); if ('error' in auth) return auth.error;
    const d = await detalleVersion(idSchema.parse((await ctx.params).id));
    if (!d) throw new ApiError('NO_ENCONTRADO', 404, 'La versión no existe.');
    return reply({ ...d, permisos: { puedeEditar: auth.puedeEditar && d.version.estado === 'BORRADOR', puedeAprobar: auth.puedeAprobar && d.version.estado === 'BORRADOR' } });
  } catch (e) { return failure(e); }
}
const patch = z.object({ nombre: z.string().trim().min(1).max(120).optional(), notas: z.string().trim().max(1500).nullable().optional() }).strict();
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinAuth('presupuesto', { editar: true }); if ('error' in auth) return auth.error;
    const id = idSchema.parse((await ctx.params).id); const b = patch.parse(await readJson(req));
    const n = await prisma.$executeRaw(Prisma.sql`UPDATE area3_pre_versiones SET nombre = COALESCE(${b.nombre ?? null}, nombre), notas = ${b.notas === undefined ? Prisma.sql`notas` : Prisma.sql`${b.notas}`}, updated_at = now() WHERE id = ${id} AND estado = 'BORRADOR'`);
    if (!n) throw new ApiError('NO_EDITABLE', 409, 'Solo se puede modificar una versión en borrador.');
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
