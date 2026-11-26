import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { autorizarSuperadminIsp } from '@/lib/crm-isp-auth'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import { bloqueoActuacion } from '@/lib/area1-m365'
import { ErrorImportacionNoAuditada, propietarioImportacion } from '@/lib/area1-import-recibo'
import { CONFIRMACION_BLOQUE, ErrorBloque, confirmarBloque, simularBloque } from '@/lib/area1-isp-bloque'
import {
  AREA4_VINCULOS_BLOQUE_BYTES, area4VinculosBloqueProductionEnabled,
  area4VinculosBloqueProductionOriginAllowed, area4VinculosBloqueProductionSurface,
} from '@/lib/area4/crm-vinculos-production'
import { readArea4IspVinculosBloqueStagingCommand } from '@/lib/area4/crm-staging-import'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120
const SIN_CACHE = { 'Cache-Control': 'private, no-store' }

/** Production never falls back to the general import gate. GET is read-only,
 * but the same runtime, readonly and browser-origin guards still dominate it.
 */
function puertaBloque(request: Request): NextResponse | null {
  if (process.env.VERCEL_ENV !== 'production') {
    return importacionesCrmCerradas() ? NextResponse.json({ error: 'No disponible.' }, { status: 404, headers: SIN_CACHE }) : null
  }
  if (!area4VinculosBloqueProductionEnabled() || area4VinculosBloqueProductionSurface(request) !== 'api') {
    return NextResponse.json({ error: 'No disponible.' }, { status: 404, headers: SIN_CACHE })
  }
  if (!area4VinculosBloqueProductionOriginAllowed(request)) {
    return NextResponse.json({ error: 'El bloque requiere HTTPS y esta misma página.', codigo: 'ORIGIN_NOT_ALLOWED' }, { status: 403, headers: SIN_CACHE })
  }
  return null
}
/**
 * Área 1 · Confirmación en bloque de vínculos ISP → empresa (NIF + nombre igual + empresa no compartida).
 * GET: simulación, solo lectura (recuentos, 10 ejemplos sin datos personales y huella).
 * POST {confirmacion:'CONFIRMAR_BLOQUE', hashEsperado}: propietario vivo sin «Actuar como»; una transacción con recibo.
 */
export async function GET(request: Request) {
  const puerta = puertaBloque(request)
  if (puerta) return puerta
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status, headers: SIN_CACHE })
  const session = await getServerSession(authOptions)
  const actuacion = bloqueoActuacion(session)
    || (process.env.VERCEL_ENV === 'production' && session?.impersonation !== undefined && session?.impersonation !== null ? 'No disponible durante actuación' : null)
  if (actuacion) return NextResponse.json({ error: actuacion }, { status: 403, headers: SIN_CACHE })
  if (process.env.VERCEL_ENV === 'production') {
    const owner = await propietarioImportacion()
    if (!owner.ok || !owner.actorId) return owner.response!
    const maestro = await prisma.ispClienteArea1.count()
    const simulacion = await simularBloque(prisma)
    return NextResponse.json({ ...simulacion, prerrequisito: maestro === 0 ? 'SIN_MAESTRO' : null }, { headers: SIN_CACHE })
  }
  return NextResponse.json(await simularBloque(prisma), { headers: SIN_CACHE })
}
export async function POST(request: Request) {
  const puerta = puertaBloque(request)
  if (puerta) return puerta
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status, headers: SIN_CACHE })
  if (process.env.VERCEL_ENV === 'production') {
    const session = await getServerSession(authOptions)
    if (session?.impersonation !== undefined && session?.impersonation !== null) {
      return NextResponse.json({ error: 'No disponible durante actuación' }, { status: 403, headers: SIN_CACHE })
    }
  }
  const owner = await propietarioImportacion()
  if (!owner.ok || !owner.actorId) return owner.response!
  const command = await readArea4IspVinculosBloqueStagingCommand(request, AREA4_VINCULOS_BLOQUE_BYTES)
  if (command.errorStatus) return NextResponse.json({ error: 'No se pudo verificar la confirmación del bloque.' }, { status: command.errorStatus, headers: SIN_CACHE })
  const body = command.body
  if (body?.confirmacion !== CONFIRMACION_BLOQUE || typeof body.hashEsperado !== 'string' || !/^[0-9a-f]{64}$/.test(body.hashEsperado)) {
    return NextResponse.json({ error: 'Simula antes el bloque y confirma con su huella.' }, { status: 400, headers: SIN_CACHE })
  }
  try {
    const r = await confirmarBloque(prisma, { actorId: owner.actorId, actor: auth.actor.email, hashEsperado: body.hashEsperado })
    return NextResponse.json(r, { headers: SIN_CACHE })
  } catch (e) {
    if (e instanceof ErrorBloque) return NextResponse.json({ error: e.codigo === 'HASH_DISTINTO' ? 'Las propuestas han cambiado desde la simulación. Vuelve a simular.' : 'No hay propuestas que confirmar en bloque.', codigo: e.codigo }, { status: e.status, headers: SIN_CACHE })
    if (e instanceof ErrorImportacionNoAuditada) return NextResponse.json({ error: 'No se ha confirmado nada y no se pudo registrar el recibo de auditoría.', codigo: 'NO_AUDITADO' }, { status: 500, headers: SIN_CACHE })
    return NextResponse.json({ error: 'No se ha confirmado nada: se ha revertido el bloque completo.', codigo: 'REVERTIDO' }, { status: 500, headers: SIN_CACHE })
  }
}
