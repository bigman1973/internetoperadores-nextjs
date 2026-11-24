import { NextRequest } from 'next/server';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { applyReportMode, getRentabilidadReport, rebuildRentabilidadReport } from '@/lib/rentabilidad/report';
import { compactReportPresentation } from '@/lib/rentabilidad/presentation';
import { monthSchema } from '@/lib/rentabilidad/types';
import { z } from 'zod';
import { decorateReport, failure, readJson, reply } from '../_shared';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const schema = z.object({ month: monthSchema, mode: z.enum(['real', 'contratado']).default('real'), kind: z.enum(['PROYECCION', 'CIERRE']).default('PROYECCION') }).strict();
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin(); if ('error' in auth) return auth.error;
    const input = schema.parse(await readJson(req));
    const result = await rebuildRentabilidadReport(input.month, auth.userId, input.kind);
    const live = await getRentabilidadReport(input.month);
    return reply(decorateReport(compactReportPresentation(applyReportMode({ ...result, runs: live.runs, snapshots: live.snapshots,
      ruleHistory: live.ruleHistory, externalCostHistory: live.externalCostHistory, resolvedExceptions: live.resolvedExceptions, syncStatus: live.syncStatus,
    }, input.mode))));
  } catch (error) { return failure(error); }
}
