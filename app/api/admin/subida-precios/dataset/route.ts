import { NextRequest } from 'next/server';
import { requireSubidaAuth } from '@/lib/subida-precios/auth';
import { construirDataset } from '@/lib/subida-precios/data';
import { failure, reply } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const q = req.nextUrl.searchParams;
    return reply(await construirDataset(q.get('desde'), q.get('hasta')));
  } catch (e) { return failure(e); }
}
