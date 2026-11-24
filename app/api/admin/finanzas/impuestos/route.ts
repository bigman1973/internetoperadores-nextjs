import { NextRequest } from 'next/server';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { resultadoImpuestos, hoyMadrid } from '@/lib/impuestos/data';
import { reply, failure, ejercicioSchema } from '../_fin-shared';
export const dynamic = 'force-dynamic';
/** Provisión de IVA (303) e IRPF (111/115) por trimestre. SUPER_ADMIN, GERENTE y CONTABILIDAD (solo lectura). */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireFinAuth('impuestos'); if ('error' in auth) return auth.error;
    const ejercicio = ejercicioSchema.parse(req.nextUrl.searchParams.get('ejercicio') ?? hoyMadrid().slice(0, 4));
    return reply({ ...(await resultadoImpuestos(ejercicio)), permisos: { puedeEditar: auth.puedeEditar, soloLectura: auth.soloLectura } });
  } catch (e) { return failure(e); }
}
