import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { comprobarBrevo } from '@/lib/brevo-config'

export const dynamic = 'force-dynamic'

/**
 * Comprobación de la clave de Brevo. SOLO LECTURA (cuenta y listas): no envía correos ni toca contactos.
 * Solo superadministrador. Nunca devuelve el valor de la clave: solo qué variable se usa y si funciona.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Solo superadministrador.' }, { status: 403 })
  const estado = await comprobarBrevo()
  return NextResponse.json({
    entorno: process.env.VERCEL_ENV || 'local',
    rama: process.env.VERCEL_GIT_COMMIT_REF || null,
    ...estado,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
