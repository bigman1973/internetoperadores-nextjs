import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError, actorActual, failure, idSchema } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';

/** Foto/PDF del ticket: solo su dueño y los revisores (David/Víctor). Sin enlaces públicos. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await params).id);
    const a = await actorActual();
    const rows = await prisma.$queryRaw<{ mime: string; nombre: string; datos: Buffer; empleadoId: string }[]>(Prisma.sql`
      SELECT a.mime, a.nombre, a.datos, g.empleado_id AS "empleadoId" FROM area5_gasto_adjuntos a JOIN area5_gastos g ON g.id = a.gasto_id WHERE a.gasto_id = ${id}`);
    const r = rows[0];
    if (!r || !((a.empleado && a.empleado.id === r.empleadoId) || a.revisor)) throw new ApiError('NO_ENCONTRADO', 404, 'Adjunto no encontrado');
    return new NextResponse(new Uint8Array(r.datos), { headers: {
      'Content-Type': r.mime, 'Content-Disposition': `inline; filename="${encodeURIComponent(r.nombre)}"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
    } });
  } catch (e) { return failure(e); }
}
