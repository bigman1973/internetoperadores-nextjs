import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { verificarPermisoServer } from '@/lib/permisos'
import { disconnectOutlookUser, getOutlookConnectionStatus } from '@/lib/outlook-user-connection'

async function authorize() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) return { error: 'No autorizado.', status: 401 as const }
  const userId = Number(session.user.id)
  const permission = await verificarPermisoServer(userId, 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) return { error: 'No tienes permiso para gestionar Outlook en el CRM.', status: 403 as const }
  return { userId }
}

export async function GET() {
  const authorized = await authorize()
  if (!('userId' in authorized)) return NextResponse.json({ error: authorized.error }, { status: authorized.status })
  return NextResponse.json({ success: true, connection: await getOutlookConnectionStatus(authorized.userId) })
}

export async function DELETE() {
  const authorized = await authorize()
  if (!('userId' in authorized)) return NextResponse.json({ error: authorized.error }, { status: authorized.status })
  await disconnectOutlookUser(authorized.userId)
  return NextResponse.json({ success: true, note: 'La conexión local se ha eliminado. El usuario puede retirar también el consentimiento desde su cuenta Microsoft.' })
}
