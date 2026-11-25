import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
export const dynamic = 'force-dynamic'
/** Buscador para vincular un negocio a un contacto o a una empresa del CRM. */
export async function GET(request: NextRequest) {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  const query = (request.nextUrl.searchParams.get('query') || '').trim().slice(0, 100)
  if (query.length < 2) return NextResponse.json({ success: true, results: [] })
  const tipo = request.nextUrl.searchParams.get('tipo') === 'contacto' ? 'contacto' : 'empresa'
  if (tipo === 'contacto') {
    if (!(await canAccessCrmRelated(auth.user, 'admin.crm.contactos'))) return NextResponse.json({ error: 'No tienes acceso a CRM > Contactos.' }, { status: 403 })
    const rows = await prisma.crmRegistroHubspot.findMany({
      where: { objectTypeId: '0-1', OR: [{ nombre: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }] },
      select: { id: true, nombre: true, email: true }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], take: 10,
    })
    return NextResponse.json({ success: true, results: rows.map((r) => ({ id: r.id, label: r.nombre || r.email || 'Contacto', detalle: r.email })) })
  }
  const rows = await prisma.crmEmpresa.findMany({
    where: { activo: true, OR: [{ nombre: { contains: query, mode: 'insensitive' } }, { nifNormalizado: { contains: query.toUpperCase().replace(/[^A-Z0-9]/g, '') } }] },
    select: { id: true, nombre: true, nif: true }, orderBy: [{ nombre: 'asc' }, { id: 'asc' }], take: 10,
  })
  return NextResponse.json({ success: true, results: rows.map((r) => ({ id: r.id, label: r.nombre, detalle: r.nif })) })
}
