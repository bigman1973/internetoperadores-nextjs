import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'

export async function GET(request: NextRequest) {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  if (!await canAccessCrmRelated(auth.user, 'admin.clientes')) return NextResponse.json({ error: 'Necesitas acceso de lectura a Clientes para consultar ISPgestion.' }, { status: 403 })
  const query = (request.nextUrl.searchParams.get('query') || '').trim().slice(0, 80)
  if (query.length < 2) return NextResponse.json({ success: true, clients: [] })
  const clients = await prisma.clienteWeb.findMany({
    where: { OR: [
      { nombre: { contains: query, mode: 'insensitive' } },
      { nombreComercial: { contains: query, mode: 'insensitive' } },
      { cif: { contains: query, mode: 'insensitive' } },
      { nif: { contains: query, mode: 'insensitive' } },
    ] },
    select: { id: true, nombre: true, nombreComercial: true, cif: true, nif: true, segmentoCrm: true, personaFisica: true, activo: true,
      telefono: true, web: true, domicilio: true, numero: true, codigoPostal: true, localidad: true, provincia: true, pais: true,
      empresasCrm: { select: { empresaId: true }, take: 1 } },
    take: 12,
    orderBy: { nombre: 'asc' },
  })
  return NextResponse.json({ success: true, clients: clients.map(({ empresasCrm, ...client }) => ({ ...client, linkedCompanyId: empresasCrm[0]?.empresaId || null })) })
}
