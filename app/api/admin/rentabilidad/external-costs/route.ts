import { NextRequest } from 'next/server';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { getRentabilidadReport } from '@/lib/rentabilidad/report';
import { saveRule } from '@/lib/rentabilidad/store';
import { RentabilidadError } from '@/lib/rentabilidad/types';
import { assertProduct, externalSchema, failure, parseQuery, readJson, reply } from '../_shared';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin({ write: true }); if ('error' in auth) return auth.error;
    const raw = await readJson(req);
    const input = externalSchema.parse(raw);
    const { month } = parseQuery(req);
    const report = await getRentabilidadReport(month);
    const existing = input.key ? (report.externalCosts ?? []).find((row: any) => String(row.key) === input.key) : undefined;
    if (input.key && !existing) throw new RentabilidadError('EXTERNAL_COST_NOT_IN_CURRENT_SNAPSHOT', 409);
    if (input.action === 'end') {
      return reply({ ok: true, result: await saveRule({ ...existing, type: 'externalCost', fechaBaja: input.fechaBaja }, auth.userId), requiresRecalculation: true });
    }
    assertProduct(input.productoId);
    const original = { ...existing };
    // Do not leave presentation aliases with an older amount/provider/month in a new version.
    for (const field of ['amount', 'baseAmount', 'importeBase', 'precio', 'price', 'importeBaseDecimal', 'importeBaseExacto', 'importeBaseCentimos', 'provider', 'product', 'producto', 'payer', 'month', 'version', 'sourceHash']) delete original[field];
    const estado = existing?.estado ?? existing?.status ?? 'ESTIMADO';
    return reply({ ok: true, result: await saveRule({
      ...original, type: 'externalCost', ...(input.key ? { key: input.key } : {}),
      mes: input.mes, proveedor: input.proveedor, productoId: input.productoId, importe: input.importe,
      sociedadPagadora: input.sociedadPagadora, note: input.note, ...(input.fechaBaja ? { fechaBaja: input.fechaBaja } : {}),
      source: existing?.source ?? 'MANUAL_ANALYTICAL_EXTERNAL', estado, status: estado,
    }, auth.userId), requiresRecalculation: true });
  } catch (error) { return failure(error); }
}
