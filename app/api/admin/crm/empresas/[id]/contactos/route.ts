import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { isPapelContacto } from '@/lib/crm-empresas'

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  if (!await canAccessCrmRelated(auth.user, 'admin.crm.contactos')) return NextResponse.json({ error: 'Necesitas acceso a Contactos.' }, { status: 403 })
  const { id } = await context.params
  const page = Math.min(500, Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1))
  const search = (request.nextUrl.searchParams.get('query') || '').trim().slice(0, 100)
  const company = await prisma.crmEmpresa.findFirst({ where: { id, activo: true }, select: { id: true } })
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 })
  const where = { empresaId: id, activo: true, ...(search.length >= 2 ? { contacto: { OR: [{ nombre: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] } } : {}) }
  const [associations, total] = await Promise.all([
    prisma.crmEmpresaContacto.findMany({ where, skip: (page - 1) * 150, take: 150, orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }], select: { contactoId: true, papel: true, principal: true, origen: true, contacto: { select: { nombre: true, email: true, telefono: true, clienteWebId: true } } } }),
    prisma.crmEmpresaContacto.count({ where }),
  ])
  return NextResponse.json({ success: true, contacts: associations.map((association) => ({ id: association.contactoId, name: association.contacto.nombre || association.contacto.email || 'Contacto sin nombre', email: association.contacto.email, phone: association.contacto.telefono, role: association.papel, isPrimary: association.principal, isCustomer: Boolean(association.contacto.clienteWebId), origin: association.origen })), total, page })
}

async function mutate(request: NextRequest, context: { params: Promise<{ id: string }> }, unlink: boolean) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso para modificar empresas.' }, { status: auth.status })
  if (!await canAccessCrmRelated(auth.user, 'admin.crm.contactos', true)) return NextResponse.json({ error: 'Necesitas permiso de escritura en Contactos para modificar la relación.' }, { status: 403 })
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const contactId = typeof body?.contactoId === 'string' ? body.contactoId : ''
  if (!/^c[a-z0-9]{12,35}$/i.test(contactId)) return NextResponse.json({ error: 'Contacto no válido.' }, { status: 400 })
  if (!unlink && (typeof body?.principal !== 'boolean' || !isPapelContacto(body?.papel))) {
    return NextResponse.json({ error: 'Indica el papel y si es la empresa principal del contacto.' }, { status: 400 })
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_registros_hubspot WHERE id = ${contactId} AND object_type_id = '0-1' FOR UPDATE`
      if (!contact.length) return { error: 'Contacto no encontrado.', status: 404 }
      const company = await tx.crmEmpresa.findUnique({ where: { id }, select: { id: true, tipo: true, activo: true } })
      if (!company?.activo) return { error: 'Empresa no encontrada.', status: 404 }
      const current = await tx.crmEmpresaContacto.findUnique({ where: { empresaId_contactoId: { empresaId: id, contactoId } } })
      if (unlink) {
        if (!current?.activo) return { error: 'No existe una vinculación activa.', status: 404 }
        if (company.tipo === 'AUTONOMO' && current.papel === 'TITULAR') return { error: 'No se puede separar al titular de un autónomo. Cambia antes la naturaleza de la cuenta.', status: 409 }
        await tx.crmEmpresaContacto.update({ where: { empresaId_contactoId: { empresaId: id, contactoId } }, data: { activo: false, principal: false, origen: 'LOCAL' } })
        if (current.principal) {
          const fallback = await tx.crmEmpresaContacto.findFirst({ where: { contactoId, activo: true }, orderBy: { createdAt: 'asc' } })
          if (fallback) await tx.crmEmpresaContacto.update({ where: { empresaId_contactoId: { empresaId: fallback.empresaId, contactoId } }, data: { principal: true } })
        }
      } else {
        if (body.papel === 'TITULAR' && company.tipo !== 'AUTONOMO') return { error: 'El papel Titular se reserva para los autónomos.', status: 400 }
        if (company.tipo === 'AUTONOMO') {
          const titulares = await tx.crmEmpresaContacto.findMany({ where: { empresaId: id, papel: 'TITULAR', activo: true }, select: { contactoId: true } })
          if (titulares.length && titulares[0].contactoId !== contactId && body.papel === 'TITULAR') return { error: 'Esta cuenta ya tiene otra persona titular.', status: 409 }
          if (!titulares.length && body.papel !== 'TITULAR') return { error: 'Asocia primero a la persona titular del autónomo.', status: 409 }
        }
        const hasPrimary = await tx.crmEmpresaContacto.count({ where: { contactoId, activo: true, principal: true } })
        const primary = body.principal || !hasPrimary
        if (primary) await tx.crmEmpresaContacto.updateMany({ where: { contactoId, activo: true, principal: true }, data: { principal: false } })
        await tx.crmEmpresaContacto.upsert({
          where: { empresaId_contactoId: { empresaId: id, contactoId } },
          create: { empresaId: id, contactoId, principal: primary, papel: body.papel, origen: 'LOCAL' },
          update: { activo: true, principal: primary, papel: body.papel, origen: 'LOCAL' },
        })
      }
      return { success: true }
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[CRM-EMPRESAS] Error asociando contacto:', error)
    return NextResponse.json({ error: 'No se pudo actualizar la relación con el contacto.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, false) }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, true) }
