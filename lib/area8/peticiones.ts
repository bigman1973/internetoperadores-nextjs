import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { Area8InputError } from './validation'
import { normalizarEstado, normalizarEmail, NOMBRES_ESTADO } from '@/lib/peticiones-flujo'
export const includePeticion = {
  mensajes: { orderBy: { createdAt: 'asc' as const } },
  responsable: { select: { id: true, nombre: true } },
  eventos: { orderBy: { createdAt: 'asc' as const }, select: { id: true, estadoAnterior: true, estadoNuevo: true, mensaje: true, createdAt: true, leidoAt: true } },
} satisfies Prisma.PeticionInternaInclude
export function serializePeticion<T extends { estado: string }>(peticion: T) {
  return { ...peticion, estadoHistorico: peticion.estado, estado: normalizarEstado(peticion.estado) || peticion.estado }
}
export function petitionError(error: unknown): NextResponse {
  if (error instanceof Area8InputError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof Error && error.message === 'AREA8_CONFLICT') return NextResponse.json({ error: 'La petición ha cambiado. Actualiza la página antes de continuar.' }, { status: 409 })
  if (error && typeof error === 'object' && 'code' in error && ['P2021', 'P2022'].includes(String(error.code))) return NextResponse.json({ error: 'Peticiones está pendiente de preparar en este entorno. No se han guardado cambios.' }, { status: 503 })
  return NextResponse.json({ error: 'No se pudo completar la operación. Inténtalo de nuevo.' }, { status: 500 })
}
export async function recordStateEvent(tx: Prisma.TransactionClient, peticion: { id: number; estado: string; usuarioEmail: string }, estado: string, actorId: number, detail?: string) {
  const from = normalizarEstado(peticion.estado)
  const to = normalizarEstado(estado)
  if (!from || !to || from === to) throw new Error('AREA8_CONFLICT')
  return tx.area8PeticionEvento.create({ data: {
    peticionId: peticion.id, usuarioEmail: normalizarEmail(peticion.usuarioEmail), actorId,
    estadoAnterior: from, estadoNuevo: to,
    mensaje: `Tu petición ha pasado de «${NOMBRES_ESTADO[from]}» a «${NOMBRES_ESTADO[to]}».${detail ? ` ${detail}` : ''}`,
  } })
}
