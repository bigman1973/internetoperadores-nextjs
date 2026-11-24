import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { transicion, type AccionRevisor } from '@/lib/area5/core';
import { ApiError, actorRevisor, aviso, evento, eur, failure, gastoPorId, idSchema, readJson, reply } from '@/lib/area5/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

/** GET: detalle con historial (solo revisores). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    await actorRevisor();
    const id = idSchema.parse((await params).id);
    const g = await gastoPorId(id);
    if (!g || g.estado === 'BORRADOR') throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
    const eventos = await prisma.$queryRaw(Prisma.sql`SELECT id::int, actor_email AS actor, accion, texto, created_at AS fecha FROM area5_gasto_eventos WHERE gasto_id = ${id} ORDER BY created_at, id`);
    return reply({ gasto: g, eventos });
  } catch (e) { return failure(e); }
}

const TEXTO: Record<AccionRevisor, { evento: string; aviso: string; tipo: string }> = {
  aprobar: { evento: 'APROBADO', aviso: 'ha aprobado tu gasto', tipo: 'APROBADO' },
  rechazar: { evento: 'RECHAZADO', aviso: 'ha rechazado tu gasto', tipo: 'RECHAZADO' },
  aclaracion: { evento: 'ACLARACION_PEDIDA', aviso: 'te pide una aclaración sobre tu gasto', tipo: 'ACLARACION' },
  reabrir: { evento: 'REABIERTO', aviso: 'ha reabierto tu gasto para revisarlo de nuevo', tipo: 'ACLARACION' },
};
const ESTADO_SQL: Record<string, string> = { APROBADO: 'APROBADO', RECHAZADO: 'RECHAZADO', ACLARACION: 'ACLARACION', PENDIENTE: 'PENDIENTE' };

/** POST {accion:'aprobar'|'rechazar'|'aclaracion'|'reabrir', motivo?} */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const a = await actorRevisor();
    const id = idSchema.parse((await params).id);
    const body = await readJson(req);
    const accion = body?.accion as AccionRevisor;
    if (!(accion in TEXTO)) throw new ApiError('ACCION_NO_VALIDA', 400, 'Acción no válida');
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 1000) : '';
    if ((accion === 'rechazar' || accion === 'aclaracion') && motivo.length < 3) {
      throw new ApiError('FALTA_MOTIVO', 400, accion === 'rechazar' ? 'Indica el motivo del rechazo.' : 'Indica qué aclaración necesitas.');
    }
    const g = await gastoPorId(id);
    if (!g || g.estado === 'BORRADOR') throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
    if (a.empleado && g.empleadoId === a.empleado.id) throw new ApiError('PROPIO', 403, 'No puedes revisar tus propios gastos: lo hace la otra persona revisora.');
    const siguiente = transicion(g.estado, accion, !!g.cierreId);
    if (!siguiente) throw new ApiError('ESTADO', 409, g.cierreId ? 'Este gasto ya está en un cierre mensual.' : 'El gasto ya no está en un estado que permita esta acción.');
    const destino = await prisma.empleado.findUnique({ where: { id: g.empleadoId }, select: { email: true } });
    await prisma.$transaction(async tx => {
      const n = await tx.$executeRaw(Prisma.sql`UPDATE area5_gastos SET estado = ${ESTADO_SQL[siguiente]}, motivo = ${accion === 'aprobar' || accion === 'reabrir' ? null : motivo},
        revisor_email = ${a.email}, revisado_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ${id} AND estado = ${g.estado} AND cierre_id IS NULL`);
      if (n !== 1) throw new ApiError('CONCURRENCIA', 409, 'Otra persona acaba de cambiar este gasto. Recarga la lista.');
      await evento(tx, id, a.email, TEXTO[accion].evento, motivo || null);
      if (destino?.email) await aviso(tx, destino.email, TEXTO[accion].tipo, `${a.email.split('@')[0]} ${TEXTO[accion].aviso} de ${eur(g.importe)} (${g.concepto.slice(0, 50)})${motivo ? ': ' + motivo.slice(0, 200) : ''}`, id);
    });
    return reply({ gasto: await gastoPorId(id) });
  } catch (e) { return failure(e); }
}
