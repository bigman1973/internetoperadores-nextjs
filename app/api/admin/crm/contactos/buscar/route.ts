import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }
  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.lectura) return NextResponse.json({ error: 'No tienes acceso a CRM > Contactos.' }, { status: 403 })

  const url = new URL(request.url)
  const query = (url.searchParams.get('query') || '').trim().slice(0, 100)
  const exclude = (url.searchParams.get('exclude') || '').trim().slice(0, 100)
  if (query.length < 2) return NextResponse.json({ success: true, contacts: [] })

  const contacts = await prisma.crmRegistroHubspot.findMany({
    where: {
      objectTypeId: '0-1',
      ...(exclude ? { id: { not: exclude } } : {}),
      OR: [
        { nombre: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { empresa: { contains: query, mode: 'insensitive' } },
        { telefono: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nombre: true, email: true, empresa: true, telefono: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
    take: 12,
  })

  return NextResponse.json({ success: true, contacts: contacts.map((contact) => ({
    id: contact.id,
    name: contact.nombre || contact.email || `Contacto ${contact.id}`,
    email: contact.email,
    company: contact.empresa,
    phone: contact.telefono,
  })) })
}
