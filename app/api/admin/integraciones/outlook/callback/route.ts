import { getServerSession } from 'next-auth'
import { NextRequest, NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { verificarPermisoServer } from '@/lib/permisos'
import {
  exchangeOutlookAuthorizationCode,
  getMicrosoftUserIdentity,
  getOutlookPublicOrigin,
  getOutlookRedirectUri,
  readOutlookAuthorizationCookie,
  saveOutlookUserConnection,
} from '@/lib/outlook-user-connection'

export async function GET(request: NextRequest) {
  let publicOrigin: string
  try {
    publicOrigin = getOutlookPublicOrigin(request.nextUrl.origin)
    if (new URL(request.nextUrl.origin).origin !== publicOrigin) return NextResponse.json({ error: 'Origen no autorizado.' }, { status: 400 })
  } catch {
    return NextResponse.json({ error: 'La integración de Outlook no está configurada para este dominio.' }, { status: 500 })
  }
  const session = await getServerSession(authOptions)
  const fallback = new URL('/admin/crm/contactos?outlook=sesion', publicOrigin)
  if (!session || session.user.userType !== 'admin' || !session.user.id || !session.user.email) return NextResponse.redirect(fallback)

  const cookie = request.cookies.get('crm_outlook_oauth')?.value
  if (!cookie) return redirectWithStatus(publicOrigin, '/admin/crm/contactos', 'caducado')

  let authorization: ReturnType<typeof readOutlookAuthorizationCookie>
  try {
    authorization = readOutlookAuthorizationCookie(cookie)
  } catch {
    return clearCookie(redirectWithStatus(publicOrigin, '/admin/crm/contactos', 'caducado'))
  }

  const userId = Number(session.user.id)
  const state = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const microsoftError = request.nextUrl.searchParams.get('error')
  if (authorization.userId !== userId || authorization.state !== state) {
    return clearCookie(redirectWithStatus(publicOrigin, authorization.returnTo, 'estado'))
  }
  if (microsoftError || !code) return clearCookie(redirectWithStatus(publicOrigin, authorization.returnTo, 'cancelado'))

  const permission = await verificarPermisoServer(userId, 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) return clearCookie(redirectWithStatus(publicOrigin, authorization.returnTo, 'permiso'))

  try {
    const token = await exchangeOutlookAuthorizationCode(code, authorization.verifier, getOutlookRedirectUri(publicOrigin))
    const identity = await getMicrosoftUserIdentity(token.accessToken)
    await saveOutlookUserConnection(userId, session.user.email, identity, token.refreshToken, token.scopes)
    return clearCookie(redirectWithStatus(publicOrigin, authorization.returnTo, 'conectado'))
  } catch (error) {
    console.error('No se pudo conectar Outlook individual:', error instanceof Error ? error.message : 'error desconocido')
    return clearCookie(redirectWithStatus(publicOrigin, authorization.returnTo, 'error'))
  }
}

function redirectWithStatus(origin: string, returnTo: string, status: string) {
  const target = new URL(returnTo, origin)
  target.searchParams.set('outlook', status)
  return NextResponse.redirect(target)
}

function clearCookie(response: NextResponse) {
  response.cookies.set('crm_outlook_oauth', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/admin/integraciones/outlook',
    maxAge: 0,
  })
  return response
}
