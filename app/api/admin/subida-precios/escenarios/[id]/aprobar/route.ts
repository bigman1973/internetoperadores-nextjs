import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSubidaAuth } from '@/lib/subida-precios/auth';
import { construirDataset } from '@/lib/subida-precios/data';
import { calcular, kpis, type Estado } from '@/lib/subida-precios/calc';
import { generarResultado } from '@/lib/subida-precios/export';
import { ApiError, auditar, estadoSchema, failure, idSchema, readJson, reply } from '../../../_shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
const bodySchema = z.object({ confirmo: z.literal(true) }).strict();

/** Aprobar congela el resultado recalculado en el servidor con los datos actuales; no escribe en ISP ni envía nada. */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSubidaAuth({ aprobar: true }); if ('error' in auth) return auth.error;
    bodySchema.parse(await readJson(req));
    const id = idSchema.parse((await ctx.params).id);
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT estado, periodo_desde AS d, periodo_hasta AS h, estado_aprobacion AS ea FROM area2_subida_escenarios WHERE id = ${id}`);
    if (!rows.length) throw new ApiError('NO_ENCONTRADO', 404, 'El escenario ya no existe.');
    if (rows[0].ea === 'APROBADO') throw new ApiError('YA_APROBADO', 409, 'Este escenario ya está aprobado.');
    const estado = estadoSchema.parse(rows[0].estado) as Estado;
    const ds = await construirDataset(rows[0].d, rows[0].h);
    const r = calcular(ds, estado);
    const resultado = generarResultado(ds, estado, r);
    const k = kpis(ds, r);
    const upd = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE area2_subida_escenarios SET estado_aprobacion = 'APROBADO', aprobado_por = ${auth.userId}, aprobado_at = now(), updated_at = now(),
        resultado = ${JSON.stringify({ ...resultado, meta: ds.meta, kpis: k })}::jsonb, resumen = ${JSON.stringify(k)}::jsonb
      WHERE id = ${id} AND estado_aprobacion = 'BORRADOR' RETURNING id`);
    if (!upd.length) throw new ApiError('YA_APROBADO', 409, 'Este escenario ya está aprobado.');
    await auditar(auth.userId, 'ESCENARIO_APROBADO', id, { contratos: resultado.precios.length, clientes: resultado.avisos.length, extraAnual: k.extraAnual });
    return reply({ ok: true, contratos: resultado.precios.length, clientes: resultado.avisos.length, kpis: k });
  } catch (e) { return failure(e); }
}
