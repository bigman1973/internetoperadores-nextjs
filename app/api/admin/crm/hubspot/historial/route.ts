import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { ejecutarHistorialHubspot } from '@/lib/area1-hubspot-historial'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Historial de HubSpot → ficha única. Solo SUPER_ADMIN.
 * POST { modo: 'simular' } lee HubSpot (solo GET) y devuelve el resumen sin escribir nada.
 * POST { modo: 'importar', confirmar: true } escribe en el panel, idempotente y sin duplicar. Nunca escribe en HubSpot.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Solo superadministrador.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  const modo = body?.modo === 'importar' ? 'importar' : 'simular'
  if (modo === 'importar' && body?.confirmar !== true) return NextResponse.json({ error: 'Simula primero y confirma la importación.' }, { status: 400 })
  try {
    const resultado = await ejecutarHistorialHubspot(modo, String(session.user.email || session.user.id))
    return NextResponse.json(resultado, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error'
    const status = /P2002|Unique constraint/.test(msg) ? 409 : 500
    return NextResponse.json({ error: status === 409 ? 'Ya hay una sincronización de HubSpot en curso.' : msg.slice(0, 300) }, { status })
  }
}
