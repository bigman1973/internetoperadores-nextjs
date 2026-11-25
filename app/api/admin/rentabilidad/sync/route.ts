import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { ispAvailability, readConfiguredLineExport } from '@/lib/rentabilidad/isp';
import { appendRun, importInitial } from '@/lib/rentabilidad/store';
import { rebuildRentabilidadReport } from '@/lib/rentabilidad/report';
import { monthSchema, RentabilidadError } from '@/lib/rentabilidad/types';
import { failure, readJson, reply } from '../_shared';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const schema = z.object({ month: monthSchema }).strict();
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin({ write: true }); if ('error' in auth) return auth.error;
    const { month } = schema.parse(await readJson(req));
    const availability = ispAvailability();
    if (!availability.lines || process.env.RENTABILIDAD_SYNC_APPROVED !== '1') {
      const reason = !availability.lines ? availability.reason : 'SYNC_EXPLICIT_APPROVAL_REQUIRED';
      const runRecord = { process: 'ISP_LINE_EXPORT', estado: 'BLOQUEADO', reason, processed: 0, createdAt: new Date().toISOString() };
      const run = await appendRun({ ...runRecord, actorId: auth.userId });
      return reply({ error: 'Sincronización bloqueada: no hay un origen remoto acreditado y autorizado. No se ha activado ningún automatismo.', reason, run: { ...runRecord, ...run } }, 503);
    }
    try {
      const input = await readConfiguredLineExport();
      const result = await importInitial({ ...input.payload, products: [], rules: [] }, auth.userId);
      const run = await appendRun({ actorId: auth.userId, process: 'ISP_LINE_EXPORT', estado: result.rechazadas ? 'REVISION' : 'COMPLETADO', sourceHash: input.sourceHash, report: result, createdAt: new Date().toISOString() });
      await rebuildRentabilidadReport(month, auth.userId);
      return reply({ ok: true, result, run, scheduled: false });
    } catch (error) {
      const reason = error instanceof RentabilidadError ? error.code : 'ISP_EXPORT_FAILED';
      await appendRun({ actorId: auth.userId, process: 'ISP_LINE_EXPORT', estado: 'BLOQUEADO', reason, processed: 0, createdAt: new Date().toISOString() });
      throw new RentabilidadError(reason, 503);
    }
  } catch (error) { return failure(error); }
}
