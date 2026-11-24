import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSistemasAuth } from '@/lib/sistemas/auth';
import { auditar } from '@/lib/sistemas/data';
import { ApiError, failure, idSchema, readJson, reply, sinCredenciales } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const rows: any[] = await prisma.$queryRaw(Prisma.sql`SELECT i.id, to_char(i.fecha_hora,'YYYY-MM-DD"T"HH24:MI') AS "fechaHora", i.tipo, i.titulo, i.detalle, s.nombre AS servicio, s.slug,
      coalesce(a.nombre, i.autor_nombre) AS autor FROM area9_sis_incidencias i LEFT JOIN area9_sis_servicios s ON s.id = i.servicio_id LEFT JOIN usuarios_admin a ON a.id = i.autor_id
      WHERE i.anulada_at IS NULL ORDER BY i.fecha_hora DESC LIMIT 300`);
    return reply({ incidencias: rows });
  } catch (e) { return failure(e); }
}

const crearSchema = z.object({
  fechaHora: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/),
  tipo: z.enum(['INCIDENCIA', 'DECISION']), titulo: z.string().trim().min(1).max(200), detalle: z.string().trim().max(3000).nullable().optional(),
  servicioId: z.string().min(1).max(80).nullable().optional(),
}).strict();

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const b = crearSchema.parse(await readJson(req));
    sinCredenciales({ titulo: b.titulo, detalle: b.detalle });
    if (b.servicioId) { const s: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id FROM area9_sis_servicios WHERE id = ${b.servicioId}`); if (!s.length) throw new ApiError('NO_EXISTE', 404, 'El servicio no existe.'); }
    const r: any[] = await prisma.$queryRaw(Prisma.sql`INSERT INTO area9_sis_incidencias (fecha_hora, tipo, titulo, detalle, servicio_id, autor_id)
      VALUES (${b.fechaHora}::timestamp, ${b.tipo}, ${b.titulo}, ${b.detalle ?? null}, ${b.servicioId ?? null}, ${auth.userId}) RETURNING id`);
    await auditar('INCIDENCIA_ALTA', 'incidencia', r[0].id, auth.userId, { tipo: b.tipo });
    return reply({ id: r[0].id }, 201);
  } catch (e) { return failure(e); }
}

/** Anula (no borra) una entrada del registro. */
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const { id } = z.object({ id: idSchema }).strict().parse(await readJson(req));
    const n = await prisma.$executeRaw(Prisma.sql`UPDATE area9_sis_incidencias SET anulada_at = now() WHERE id = ${id} AND anulada_at IS NULL`);
    if (!n) throw new ApiError('NO_EXISTE', 404, 'No existe o ya estaba anulada.');
    await auditar('INCIDENCIA_ANULADA', 'incidencia', id, auth.userId);
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
