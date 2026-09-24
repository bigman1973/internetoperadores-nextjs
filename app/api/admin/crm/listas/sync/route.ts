import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { previewHubspotLists, syncHubspotLists } from '@/lib/hubspot-listas'
import { verificarPermisoServer } from '@/lib/permisos'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function authorizeWrite() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) return null
  const userId = Number(session.user.id)
  if (!Number.isInteger(userId)) return null
  const permission = await verificarPermisoServer(userId, 'admin.crm.listas', session.user.role)
  return permission.escritura ? session : null
}

export async function POST(request: Request) {
  const session = await authorizeWrite()
  if (!session) return NextResponse.json({ error: 'No tienes permiso de escritura en CRM > Listas.' }, { status: 403 })

  try {
    const body = await request.json().catch(() => ({}))
    const mode = body?.mode === 'sync' ? 'sync' : 'preview'

    if (mode === 'preview') {
      const [remote, localTotal, localActive, lastSync] = await Promise.all([
        previewHubspotLists(),
        prisma.crmLista.count(),
        prisma.crmLista.count({ where: { activo: true } }),
        prisma.crmSincronizacionHubspot.findFirst({ orderBy: { iniciadoAt: 'desc' } }),
      ])
      return NextResponse.json({
        success: true,
        mode,
        summary: remote.summary,
        local: { total: localTotal, active: localActive },
        lastSync,
      })
    }

    const result = await syncHubspotLists(session.user.email || session.user.name || 'Usuario administrador')
    return NextResponse.json({ success: true, mode, result })
  } catch (error) {
    console.error('[CRM-LISTAS] Error de sincronización:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'No se pudo completar la sincronización de HubSpot.',
    }, { status: 500 })
  }
}
