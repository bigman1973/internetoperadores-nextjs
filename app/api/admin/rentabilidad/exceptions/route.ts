import { NextRequest } from 'next/server';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { resolveException } from '@/lib/rentabilidad/store';
import { assertProduct, assertRuleProduct, exceptionSchema, failure, readJson, reply } from '../_shared';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin(); if ('error' in auth) return auth.error;
    const input = exceptionSchema.parse(await readJson(req));
    if (input.productoId) assertProduct(input.productoId);
    if (input.rule) assertRuleProduct(input.rule);
    return reply({ ok: true, result: await resolveException(input, auth.userId), requiresRecalculation: true });
  } catch (error) { return failure(error); }
}
