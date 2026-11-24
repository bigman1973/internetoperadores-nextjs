import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { reply, failure, readJson, ApiError, idSchema } from '../../../../_fin-shared';
export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const importe = z.number().finite().min(-100_000_000).max(100_000_000);
const edit = z.object({ lineaId: idSchema, importe: importe.optional(), naturaleza: z.enum(['CORRIENTE', 'INVERSION']).optional(), nota: z.string().trim().max(500).nullable().optional(), restaurar: z.boolean().optional() }).strict();
const alta = z.object({ tipo: z.enum(['INGRESO', 'GASTO']), naturaleza: z.enum(['CORRIENTE', 'INVERSION']).default('CORRIENTE'), centro: z.string().trim().min(1).max(120), cuenta: z.string().trim().min(1).max(200), importe, nota: z.string().trim().max(500).nullable().optional() }).strict();
async function borrador(tx: Prisma.TransactionClient, id: string) {
  const v: any[] = await tx.$queryRaw(Prisma.sql`SELECT estado FROM area3_pre_versiones WHERE id = ${id} FOR UPDATE`);
  if (!v[0]) throw new ApiError('NO_ENCONTRADO', 404, 'La versión no existe.');
  if (v[0].estado !== 'BORRADOR') throw new ApiError('NO_EDITABLE', 409, 'Esta versión ya está aprobada: crea una versión nueva para cambiarla.');
}
/** Edita el presupuesto de una línea (o la restaura al valor automático). Solo en BORRADOR. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinAuth('presupuesto', { editar: true }); if ('error' in auth) return auth.error;
    const id = idSchema.parse((await ctx.params).id); const b = edit.parse(await readJson(req));
    await prisma.$transaction(async tx => {
      await borrador(tx, id);
      const l: any[] = await tx.$queryRaw(Prisma.sql`SELECT id, importe, importe_auto, naturaleza, fuente FROM area3_pre_lineas WHERE id = ${b.lineaId} AND version_id = ${id} FOR UPDATE`);
      if (!l[0]) throw new ApiError('NO_ENCONTRADO', 404, 'La línea no existe.');
      const nuevo = b.restaurar ? Number(l[0].importe_auto) : b.importe ?? Number(l[0].importe);
      const origen = b.restaurar ? 'AUTO' : b.importe !== undefined && b.importe !== Number(l[0].importe_auto) ? 'MANUAL' : null;
      await tx.$executeRaw(Prisma.sql`UPDATE area3_pre_lineas SET importe = ${nuevo}, origen = COALESCE(${origen}, origen), naturaleza = COALESCE(${b.naturaleza ?? null}, naturaleza),
        nota = ${b.nota === undefined ? Prisma.sql`nota` : Prisma.sql`${b.nota}`}, updated_by = ${auth.userId}, updated_at = now() WHERE id = ${b.lineaId}`);
      await tx.$executeRaw(Prisma.sql`UPDATE area3_pre_versiones SET updated_at = now() WHERE id = ${id}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_auditoria (accion, version_id, actor_id, detalle) VALUES ('EDITAR_LINEA', ${id}, ${auth.userId}, ${JSON.stringify({ lineaId: b.lineaId, antes: Number(l[0].importe), despues: nuevo, restaurar: !!b.restaurar, naturaleza: b.naturaleza ?? null })}::jsonb)`);
    });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
/** Añade una línea manual (p. ej. una inversión o un gasto nuevo de 2027). */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinAuth('presupuesto', { editar: true }); if ('error' in auth) return auth.error;
    const id = idSchema.parse((await ctx.params).id); const b = alta.parse(await readJson(req));
    const lid = await prisma.$transaction(async tx => {
      await borrador(tx, id);
      const r: any[] = await tx.$queryRaw(Prisma.sql`INSERT INTO area3_pre_lineas (version_id, tipo, naturaleza, centro, cuenta, fuente, real_anual, importe_auto, importe, origen, nota, orden, updated_by)
        VALUES (${id}, ${b.tipo}, ${b.tipo === 'INGRESO' ? 'CORRIENTE' : b.naturaleza}, ${b.centro}, ${b.cuenta}, 'MANUAL', 0, 0, ${b.importe}, 'MANUAL', ${b.nota ?? null}, 90, ${auth.userId}) RETURNING id`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_auditoria (accion, version_id, actor_id, detalle) VALUES ('ALTA_LINEA', ${id}, ${auth.userId}, ${JSON.stringify(b)}::jsonb)`);
      return r[0].id as string;
    });
    return reply({ ok: true, id: lid });
  } catch (e) { if (e instanceof Error && /unique|duplicate/i.test(e.message)) return reply({ error: 'Ya existe una línea con ese centro y esa cuenta.', code: 'DUPLICADA' }, 409); return failure(e); }
}
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireFinAuth('presupuesto', { editar: true }); if ('error' in auth) return auth.error;
    const id = idSchema.parse((await ctx.params).id); const { lineaId } = z.object({ lineaId: idSchema }).strict().parse(await readJson(req));
    await prisma.$transaction(async tx => {
      await borrador(tx, id);
      const l: any[] = await tx.$queryRaw(Prisma.sql`SELECT fuente FROM area3_pre_lineas WHERE id = ${lineaId} AND version_id = ${id} FOR UPDATE`);
      if (!l[0]) throw new ApiError('NO_ENCONTRADO', 404, 'La línea no existe.');
      if (l[0].fuente !== 'MANUAL') throw new ApiError('SOLO_MANUAL', 409, 'Solo se pueden borrar las líneas añadidas a mano. Las automáticas se ponen a 0.');
      await tx.$executeRaw(Prisma.sql`DELETE FROM area3_pre_lineas WHERE id = ${lineaId}`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_auditoria (accion, version_id, actor_id, detalle) VALUES ('BORRAR_LINEA', ${id}, ${auth.userId}, ${JSON.stringify({ lineaId })}::jsonb)`);
    });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
