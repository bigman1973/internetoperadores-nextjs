import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'

export async function GET(request: NextRequest) {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  if (!await canAccessCrmRelated(auth.user, 'admin.crm.contactos')) return NextResponse.json({ error: 'Necesitas acceso a Contactos para buscar personas.' }, { status: 403 })
  const query = (request.nextUrl.searchParams.get('query') || '').trim().slice(0, 100)
  if (query.length < 2) return NextResponse.json({ success: true, contacts: [] })
  const contacts = await prisma.crmRegistroHubspot.findMany({
    where: { objectTypeId: '0-1', OR: [
      { nombre: { contains: query, mode: 'insensitive' } },
      { email: { contains: query, mode: 'insensitive' } },
    ] },
    select: { id: true, nombre: true, email: true, empresa: true },
    orderBy: [{ nombre: 'asc' }, { id: 'asc' }], take: 12,
  })
  return NextResponse.json({ success: true, contacts: contacts.map((item) => ({ id: item.id, name: item.nombre || item.email || 'Contacto sin nombre', email: item.email, company: item.empresa })) })
}
