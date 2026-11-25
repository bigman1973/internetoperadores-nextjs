import { extrasProduccionCerrados } from '@/lib/produccion-disponibilidad';
import { NextRequest, NextResponse } from 'next/server';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { seguimientoVersion } from '@/lib/presupuesto/data';
import { reply, failure, ApiError, idSchema } from '../../../../_fin-shared';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };
/** Seguimiento mensual: real frente a presupuesto por centro (meses cerrados del ejercicio). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireFinAuth('presupuesto'); if ('error' in auth) return auth.error;
    const s = await seguimientoVersion(idSchema.parse((await ctx.params).id));
    if (!s) throw new ApiError('NO_ENCONTRADO', 404, 'La versión no existe.');
    return reply(s);
  } catch (e) { return failure(e); }
}
