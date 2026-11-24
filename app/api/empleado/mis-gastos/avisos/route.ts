import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { actorActual, failure, readJson, reply } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';

/** Avisos dentro del panel de la persona autenticada + contadores (pendientes de revisar si es revisor). */
export async function GET() {
  try {
    const a = await actorActual();
    const avisos = await prisma.$queryRaw(Prisma.sql`SELECT id::int, tipo, texto, gasto_id AS "gastoId", leido_at IS NOT NULL AS leido, created_at AS fecha FROM area5_avisos WHERE destinatario_email = ${a.email} ORDER BY created_at DESC LIMIT 30`);
    const [{ n }] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM area5_avisos WHERE destinatario_email = ${a.email} AND leido_at IS NULL`);
    let pendientesRevision = 0;
    if (a.revisor && !a.actuando) {
      const [r] = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT count(*)::int AS n FROM area5_gastos g WHERE g.estado = 'PENDIENTE' AND g.empleado_id IS DISTINCT FROM ${a.empleado?.id ?? null}`);
      pendientesRevision = r.n;
    }
    return reply({ revisor: a.revisor && !a.actuando, noLeidos: n, avisos, pendientesRevision });
  } catch (e) { return failure(e); }
}

/** POST {todos:true} o {ids:number[]}: marca avisos propios como leídos. */
export async function POST(req: NextRequest) {
  try {
    const a = await actorActual();
    const body = await readJson(req);
    const ids: number[] = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => Number.isInteger(x)).slice(0, 100) : [];
    if (body?.todos === true) await prisma.$executeRaw(Prisma.sql`UPDATE area5_avisos SET leido_at = CURRENT_TIMESTAMP WHERE destinatario_email = ${a.email} AND leido_at IS NULL`);
    else if (ids.length) await prisma.$executeRaw(Prisma.sql`UPDATE area5_avisos SET leido_at = CURRENT_TIMESTAMP WHERE destinatario_email = ${a.email} AND leido_at IS NULL AND id IN (${Prisma.join(ids)})`);
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
