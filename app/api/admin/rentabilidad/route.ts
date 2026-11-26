import { NextRequest } from 'next/server';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { failure, parseQuery, reply, viewReport } from './_shared';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin(); if ('error' in auth) return auth.error;
    const { month, mode, detalle, clave, vista, snapshot } = parseQuery(req);
    if (detalle && clave && vista && month) {
      const { desglose } = await import('@/lib/rentabilidad/desglose-datos');
      const resultado = await desglose(month, detalle, clave, vista, snapshot);
      return reply(resultado ?? { month, tipo: detalle, clave, vista, snapshot: null, filas: [], notas: ['Aún no hay una proyección preparada para este mes.'], cifraTabla: null, sumaDetalle: null, diferencia: null, cuadra: false, cobertura: {} });
    }
    return reply(await viewReport(month, mode));
  } catch (error) { return failure(error); }
}
