import { NextRequest } from 'next/server';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { saveRule } from '@/lib/rentabilidad/store';
import { assertRuleProduct, failure, readJson, reply, ruleSchema } from '../_shared';
export const dynamic = 'force-dynamic';
export async function POST(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin(); if ('error' in auth) return auth.error;
    const rule = ruleSchema.parse(await readJson(req)); assertRuleProduct(rule);
    return reply({ ok: true, result: await saveRule(rule, auth.userId), requiresRecalculation: true });
  } catch (error) { return failure(error); }
}
