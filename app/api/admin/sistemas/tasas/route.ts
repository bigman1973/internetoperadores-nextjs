import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSistemasAuth } from '@/lib/sistemas/auth';
import { actualizarTasas, auditar, mesActualMadrid } from '@/lib/sistemas/data';
import { failure, mesSchema, readJson, reply } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const rows: any[] = await prisma.$queryRaw(Prisma.sql`SELECT mes, usd_eur::float8 AS "usdEur", fuente FROM area9_sis_tasas ORDER BY mes`);
    return reply({ tasas: rows });
  } catch (e) { return failure(e); }
}

const putSchema = z.object({ mes: mesSchema, usdEur: z.number().gt(0).lt(5) }).strict();
/** Fija a mano la tasa de un mes (sustituye a la automática). */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const b = putSchema.parse(await readJson(req));
    await prisma.$executeRaw(Prisma.sql`INSERT INTO area9_sis_tasas (mes, usd_eur, fuente, actor_id) VALUES (${b.mes}, ${b.usdEur}, 'Manual', ${auth.userId})
      ON CONFLICT (mes) DO UPDATE SET usd_eur = EXCLUDED.usd_eur, fuente = 'Manual', actor_id = EXCLUDED.actor_id, updated_at = now()`);
    await auditar('TASA_MANUAL', 'tasa', b.mes, auth.userId, { usdEur: b.usdEur });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}

/** Trae del BCE las tasas mensuales que faltan del año en curso. Solo lectura externa; no sobrescribe las existentes. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    await readJson(req);
    const act = mesActualMadrid();
    const r = await actualizarTasas(`${act.slice(0, 4)}-01`, act, auth.userId);
    return reply(r);
  } catch (e) { return failure(e); }
}
