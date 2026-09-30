import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { verificarPermisoServer } from '@/lib/permisos'
import { createOutlookAuthorization, isAllowedCorporateEmail, isOutlookUserIntegrationEnabled } from '@/lib/outlook-user-connection'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }
  const userId = Number(session.user.id)
  const permission = await verificarPermisoServer(userId, 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) return NextResponse.json({ error: 'No tienes permiso para conectar Outlook al CRM.' }, { status: 403 })
  if (!isOutlookUserIntegrationEnabled()) return NextResponse.json({ error: 'La conexión individual de Outlook aún no está habilitada.' }, { status: 503 })
  const email = session.user.email?.trim().toLowerCase() || ''
  if (!isAllowedCorporateEmail(email)) return NextResponse.json({ error: 'Tu usuario no tiene un correo corporativo compatible con Outlook.' }, { status: 422 })

  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/admin/crm/contactos'
  let authorization: ReturnType<typeof createOutlookAuthorization>
  try {
    authorization = createOutlookAuthorization(request.nextUrl.origin, userId, email, returnTo)
  } catch {
    return NextResponse.json({ error: 'Outlook no está configurado para este dominio del CRM.' }, { status: 500 })
  }
  const response = NextResponse.redirect(authorization.url)
  response.cookies.set('crm_outlook_oauth', authorization.cookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/integraciones/outlook',
    maxAge: 10 * 60,
  })
  return response
}
