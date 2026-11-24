import { NextRequest } from 'next/server';
import { requireRentabilidadAdmin } from '@/lib/rentabilidad/auth';
import { failure, parseQuery, reply, viewReport } from './_shared';
export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
  try {
    const auth = await requireRentabilidadAdmin(); if ('error' in auth) return auth.error;
    const { month, mode } = parseQuery(req);
    return reply(await viewReport(month, mode));
  } catch (error) { return failure(error); }
}
