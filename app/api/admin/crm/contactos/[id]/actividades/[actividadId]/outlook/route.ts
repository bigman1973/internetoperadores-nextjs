import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

const TARGETS = {
  outlook: { metadataKey: 'outlookWebLink', hosts: ['outlook.office.com', 'outlook.office365.com'] },
  teams: { metadataKey: 'teamsJoinUrl', hosts: ['teams.microsoft.com'] },
} as const

export async function GET(request: Request, context: { params: Promise<{ id: string; actividadId: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para abrir esta reunión.' }, { status: 403 })
  }

  const target = new URL(request.url).searchParams.get('target')
  if (target !== 'outlook' && target !== 'teams') {
    return NextResponse.json({ error: 'Destino no válido.' }, { status: 400 })
  }

  const { id, actividadId } = await context.params
  const activity = await prisma.crmActividad.findFirst({
    where: {
      id: actividadId,
      tipo: 'REUNION',
      OR: [
        { contactoId: id },
        { contactos: { some: { contactoId: id } } },
      ],
    },
    select: { metadatos: true },
  })
  if (!activity) return NextResponse.json({ error: 'Reunión no encontrada.' }, { status: 404 })

  const metadata = activity.metadatos && typeof activity.metadatos === 'object' && !Array.isArray(activity.metadatos)
    ? activity.metadatos as Record<string, unknown>
    : {}
  const config = TARGETS[target]
  const destination = safeMicrosoftUrl(metadata[config.metadataKey], config.hosts)
  if (!destination) return NextResponse.json({ error: 'Este enlace ya no está disponible.' }, { status: 404 })

  return NextResponse.redirect(destination, 302)
}

function safeMicrosoftUrl(value: unknown, allowedHosts: readonly string[]) {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url : null
  } catch {
    return null
  }
}
