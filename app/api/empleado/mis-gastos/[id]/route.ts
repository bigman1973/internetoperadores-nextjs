import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { editable, normalizarGasto, transicion } from '@/lib/area5/core';
import {
  ApiError, actorActual, filaComoEntrada, actorTrabajador, avisarRevisores, evento, eur, failure, gastoPorId, idSchema, readJson, reply, type GastoRow,
} from '@/lib/area5/server';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

async function propio(id: string) {
  idSchema.parse(id);
  const a = await actorActual();
  const g = await gastoPorId(id);
  if (!g) throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
  const esMio = !!a.empleado && g.empleadoId === a.empleado.id;
  return { a, g, esMio };
}

/** GET: detalle con historial. Lo ve su dueño y los revisores; nadie más. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const { a, g, esMio } = await propio((await params).id);
    if (!esMio && !a.revisor) throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
    const eventos = await prisma.$queryRaw(Prisma.sql`SELECT id::int, actor_email AS "actor", accion, texto, created_at AS "fecha" FROM area5_gasto_eventos WHERE gasto_id = ${g.id} ORDER BY created_at, id`);
    return reply({ gasto: g, eventos });
  } catch (e) { return failure(e); }
}

/** PATCH: el trabajador corrige su gasto mientras sea borrador o tenga una aclaración pedida. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { a, g, esMio } = await propio((await params).id);
    if (!esMio) throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
    if (!editable(g.estado, !!g.cierreId)) throw new ApiError('NO_EDITABLE', 409, 'Este gasto ya no se puede editar.');
    const body = await readJson(req);
    const n = normalizarGasto({ ...filaComoEntrada(g), ...body, tipo: g.tipo });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`UPDATE area5_gastos SET fecha = ${n.fecha}::date, concepto = ${n.concepto}, categoria = ${n.categoria}, proyecto = ${n.proyecto}, cliente = ${n.cliente},
        comercio = ${n.comercio}, cif_comercio = ${n.cifComercio}, importe = ${n.importe}::numeric, tipo_iva = ${n.tipoIva}::numeric, base_imponible = ${n.baseImponible}::numeric,
        importe_iva = ${n.importeIva}::numeric, km = ${n.km}::numeric, eur_km = ${n.eurKm}::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = ${g.id}`);
      await evento(tx, g.id, a.email, 'EDITADO');
    });
    return reply({ gasto: await gastoPorId(g.id), avisos: n.avisos });
  } catch (e) { return failure(e); }
}

/** DELETE: solo borradores propios. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const { g, esMio } = await propio((await params).id);
    if (!esMio) throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
    if (g.estado !== 'BORRADOR') throw new ApiError('NO_BORRABLE', 409, 'Solo se pueden borrar los borradores.');
    const origin = req.headers.get('origin');
    if (!origin || origin !== new URL(req.url).origin) throw new ApiError('ORIGIN_NOT_ALLOWED', 403);
    await prisma.$executeRaw(Prisma.sql`DELETE FROM area5_gastos WHERE id = ${g.id} AND estado = 'BORRADOR'`);
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}

/** POST {accion:'enviar', texto?}: envía a revisión (o responde a una aclaración). */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const { a, g, esMio } = await propio((await params).id);
    if (!esMio) throw new ApiError('NO_ENCONTRADO', 404, 'Gasto no encontrado');
    const emp = actorTrabajador(a);
    const body = await readJson(req);
    if (body?.accion !== 'enviar') throw new ApiError('ACCION_NO_VALIDA', 400, 'Acción no válida');
    const siguiente = transicion(g.estado, 'enviar', !!g.cierreId);
    if (!siguiente) throw new ApiError('ESTADO', 409, 'Este gasto no se puede enviar en su estado actual.');
    const n = normalizarGasto(filaComoEntrada(g));
    if (g.tipo === 'TICKET' && !g.tieneAdjunto) throw new ApiError('SIN_TICKET', 400, 'Falta la foto o el PDF del ticket.');
    const respuesta = typeof body.texto === 'string' ? body.texto.trim().slice(0, 1000) : '';
    const eraAclaracion = g.estado === 'ACLARACION';
    if (eraAclaracion && respuesta.length < 3) throw new ApiError('FALTA_RESPUESTA', 400, 'Escribe la aclaración que te han pedido.');
    await prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`UPDATE area5_gastos SET estado = 'PENDIENTE', importe = ${n.importe}::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = ${g.id} AND estado = ${g.estado} AND cierre_id IS NULL`);
      await evento(tx, g.id, a.email, eraAclaracion ? 'ACLARACION_RESPONDIDA' : 'ENVIADO', respuesta || null);
      await avisarRevisores(tx, a.email, eraAclaracion ? 'RESPUESTA' : 'NUEVO_GASTO', `${emp.nombreCompleto}: ${eraAclaracion ? 'responde a tu aclaración' : 'nuevo gasto'} de ${eur(g.importe)} (${g.concepto.slice(0, 60)})`, g.id);
    });
    return reply({ gasto: await gastoPorId(g.id) });
  } catch (e) { return failure(e); }
}
