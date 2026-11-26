import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { autorizarSuperadminIsp } from '@/lib/crm-isp-auth'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import { bloqueoActuacion } from '@/lib/area1-m365'
import { ErrorImportacionNoAuditada, propietarioImportacion } from '@/lib/area1-import-recibo'
import { CONFIRMACION_BLOQUE, ErrorBloque, confirmarBloque, simularBloque } from '@/lib/area1-isp-bloque'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120
const SIN_CACHE = { 'Cache-Control': 'no-store' }
/**
 * Área 1 · Confirmación en bloque de vínculos ISP → empresa (NIF + nombre igual + empresa no compartida).
 * GET: simulación, solo lectura (recuentos, 10 ejemplos sin datos personales y huella).
 * POST {confirmacion:'CONFIRMAR_BLOQUE', hashEsperado}: propietario vivo sin «Actuar como»; una transacción con recibo.
 */
export async function GET() {
  if (importacionesCrmCerradas()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status })
  const actuacion = bloqueoActuacion(await getServerSession(authOptions))
  if (actuacion) return NextResponse.json({ error: actuacion }, { status: 403 })
  return NextResponse.json(await simularBloque(prisma), { headers: SIN_CACHE })
}
export async function POST(request: Request) {
  if (importacionesCrmCerradas()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status })
  const owner = await propietarioImportacion()
  if (!owner.ok || !owner.actorId) return owner.response!
  const body = await request.json().catch(() => null) as { confirmacion?: unknown; hashEsperado?: unknown } | null
  if (body?.confirmacion !== CONFIRMACION_BLOQUE || typeof body.hashEsperado !== 'string' || !/^[0-9a-f]{64}$/.test(body.hashEsperado)) {
    return NextResponse.json({ error: 'Simula antes el bloque y confirma con su huella.' }, { status: 400 })
  }
  try {
    const r = await confirmarBloque(prisma, { actorId: owner.actorId, actor: auth.actor.email, hashEsperado: body.hashEsperado })
    return NextResponse.json(r, { headers: SIN_CACHE })
  } catch (e) {
    if (e instanceof ErrorBloque) return NextResponse.json({ error: e.codigo === 'HASH_DISTINTO' ? 'Las propuestas han cambiado desde la simulación. Vuelve a simular.' : 'No hay propuestas que confirmar en bloque.', codigo: e.codigo }, { status: e.status })
    if (e instanceof ErrorImportacionNoAuditada) return NextResponse.json({ error: 'No se ha confirmado nada y no se pudo registrar el recibo de auditoría.', codigo: 'NO_AUDITADO' }, { status: 500 })
    return NextResponse.json({ error: 'No se ha confirmado nada: se ha revertido el bloque completo.', codigo: 'REVERTIDO' }, { status: 500 })
  }
}
