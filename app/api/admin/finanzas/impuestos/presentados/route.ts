import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { listarPresentados, migracionImpuestosAplicada, hoyMadrid } from '@/lib/impuestos/data';
import { reply, failure, readJson, ApiError, idSchema, ejercicioSchema } from '../../_fin-shared';
export const dynamic = 'force-dynamic';
const body = z.object({
  modelo: z.enum(['303', '111', '115']), ejercicio: ejercicioSchema, trimestre: z.number().int().min(1).max(4),
  importe: z.number().finite().min(-10_000_000).max(10_000_000), estado: z.enum(['PRESENTADO', 'PAGADO', 'APLAZADO', 'DENEGADO']).default('PRESENTADO'),
  fechaPresentacion: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable().optional(),
  referencia: z.string().trim().max(120).nullable().optional(), nota: z.string().trim().max(500).nullable().optional(),
}).strict();
/** Modelos presentados subidos a mano (sustituyen a lo que haya en AAPP para ese trimestre). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinAuth('impuestos'); if ('error' in auth) return auth.error;
    const ejercicio = ejercicioSchema.parse(req.nextUrl.searchParams.get('ejercicio') ?? hoyMadrid().slice(0, 4));
    return reply({ items: await listarPresentados(ejercicio), migracion: await migracionImpuestosAplicada() });
  } catch (e) { return failure(e); }
}
export async function POST(req: NextRequest) {
  try {
    const auth = await requireFinAuth('impuestos', { editar: true }); if ('error' in auth) return auth.error;
    const b = body.parse(await readJson(req));
    if (!(await migracionImpuestosAplicada())) throw new ApiError('MIGRACION_PENDIENTE', 503, 'Falta aplicar la migración de Impuestos y Presupuesto.');
    const id = await prisma.$transaction(async tx => {
      const prev: any[] = await tx.$queryRaw(Prisma.sql`SELECT id FROM area3_imp_presentados WHERE modelo=${b.modelo} AND ejercicio=${b.ejercicio} AND trimestre=${b.trimestre} AND anulado_at IS NULL FOR UPDATE`);
      if (prev[0]) await tx.$executeRaw(Prisma.sql`UPDATE area3_imp_presentados SET anulado_at = now(), anulado_por = ${auth.userId} WHERE id = ${prev[0].id}`);
      const r: any[] = await tx.$queryRaw(Prisma.sql`INSERT INTO area3_imp_presentados (modelo, ejercicio, trimestre, importe, estado, fecha_presentacion, referencia, nota, actor_id)
        VALUES (${b.modelo}, ${b.ejercicio}, ${b.trimestre}, ${b.importe}, ${b.estado}, ${b.fechaPresentacion ? new Date(b.fechaPresentacion + 'T00:00:00Z') : null}, ${b.referencia ?? null}, ${b.nota ?? null}, ${auth.userId}) RETURNING id`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_imp_auditoria (accion, entidad, entidad_id, actor_id, detalle) VALUES (${prev[0] ? 'SUSTITUIR_PRESENTADO' : 'CREAR_PRESENTADO'}, 'presentado', ${r[0].id}, ${auth.userId}, ${JSON.stringify({ ...b, sustituye: prev[0]?.id ?? null })}::jsonb)`);
      return r[0].id as string;
    });
    return reply({ ok: true, id });
  } catch (e) { return failure(e); }
}
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireFinAuth('impuestos', { editar: true }); if ('error' in auth) return auth.error;
    const { id } = z.object({ id: idSchema }).strict().parse(await readJson(req));
    await prisma.$transaction(async tx => {
      const n = await tx.$executeRaw(Prisma.sql`UPDATE area3_imp_presentados SET anulado_at = now(), anulado_por = ${auth.userId} WHERE id = ${id} AND anulado_at IS NULL`);
      if (!n) throw new ApiError('NOT_FOUND', 404, 'No existe ese modelo presentado.');
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_imp_auditoria (accion, entidad, entidad_id, actor_id, detalle) VALUES ('ANULAR_PRESENTADO', 'presentado', ${id}, ${auth.userId}, '{}'::jsonb)`);
    });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
