import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSubidaAuth } from '@/lib/subida-precios/auth';
import { ApiError, auditar, estadoSchema, failure, periodoSchema, readJson, reply } from '../_shared';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT e.id, e.nombre, e.nota, e.periodo_desde AS "desde", e.periodo_hasta AS "hasta", e.resumen, e.estado_aprobacion AS "estadoAprobacion",
             e.fecha_efecto::text AS "fechaEfecto", e.aprobado_at AS "aprobadoAt", e.created_at AS "createdAt", e.updated_at AS "updatedAt",
             a.nombre AS autor, ap.nombre AS "aprobadoPor"
      FROM area2_subida_escenarios e JOIN usuarios_admin a ON a.id = e.autor_id LEFT JOIN usuarios_admin ap ON ap.id = e.aprobado_por
      ORDER BY e.created_at DESC LIMIT 200`);
    return reply({ escenarios: rows, puedeAprobar: auth.puedeAprobar });
  } catch (e) { return failure(e); }
}

const crearSchema = z.object({ estado: estadoSchema, periodo: periodoSchema, resumen: z.record(z.string(), z.any()).optional() }).strict();

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const body = crearSchema.parse(await readJson(req));
    const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM area2_subida_escenarios`);
    if (Number(n) >= 500) throw new ApiError('LIMITE_ESCENARIOS', 409, 'Hay demasiados escenarios guardados. Borra alguno borrador.');
    const resumen = body.resumen ? JSON.stringify(body.resumen).slice(0, 8000) : null;
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO area2_subida_escenarios (nombre, nota, estado, periodo_desde, periodo_hasta, resumen, fecha_efecto, autor_id)
      VALUES (${body.estado.nombre}, ${body.estado.nota || null}, ${JSON.stringify(body.estado)}::jsonb, ${body.periodo.desde}, ${body.periodo.hasta},
              ${resumen}::jsonb, ${body.estado.fechaEfecto}::date, ${auth.userId}) RETURNING id`);
    await auditar(auth.userId, 'ESCENARIO_GUARDADO', rows[0].id, { nombre: body.estado.nombre });
    return reply({ id: rows[0].id }, 201);
  } catch (e) { return failure(e); }
}
