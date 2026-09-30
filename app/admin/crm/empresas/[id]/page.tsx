import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { registrarArea } from '@/lib/permisos'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import CrmCompanyWorkspace from '@/components/admin/CrmCompanyWorkspace'
import CrmCompanyContactsMore from '@/components/admin/CrmCompanyContactsMore'
import type { CompanyFormFields } from '@/components/admin/CrmCompanyForm'
import { canAccessCrmRelated } from '@/lib/crm-empresas-auth'

export const dynamic = 'force-dynamic'

export default async function CrmCompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdminAreaRead('admin.crm.empresas', ['MARKETING', 'VENTAS'])
  const relatedUser = { id: Number(session.user.id), name: session.user.name || '', role: session.user.role }
  const [canReadContacts, canReadClients] = await Promise.all([
    canAccessCrmRelated(relatedUser, 'admin.crm.contactos'), canAccessCrmRelated(relatedUser, 'admin.clientes'),
  ])
  const { id } = await params
  const [, company] = await Promise.all([
    registrarArea('admin.crm.empresas', 'CRM > Empresas', 'admin.crm'),
    prisma.crmEmpresa.findFirst({ where: { id, activo: true }, relationLoadStrategy: 'join', include: {
      contactos: { where: { activo: true }, take: canReadContacts ? 150 : 0, include: { contacto: { select: { id: true, nombre: true, email: true, telefono: true, empresa: true, clienteWebId: true } } }, orderBy: [{ principal: 'desc' }, { createdAt: 'asc' }] },
      clientes: { take: canReadClients ? 60 : 0, include: { cliente: { select: { id: true, nombre: true, codigo: true, activo: true, segmentoCrm: true, personaFisica: true, cif: true, nif: true } } }, orderBy: { clienteId: 'asc' } },
      _count: { select: { contactos: { where: { activo: true } }, clientes: true } },
    } }),
  ])
  if (!company) notFound()
  const fields: CompanyFormFields = {
    nombre: company.nombre, nombreComercial: company.nombreComercial || '', nif: company.nif || '', tipo: company.tipo,
    segmentoCrm: company.segmentoCrm, dominio: company.dominio || '', web: company.web || '', telefono: company.telefono || '',
    email: company.email || '', sector: company.sector || '', direccion: company.direccion || '', codigoPostal: company.codigoPostal || '',
    localidad: company.localidad || '', provincia: company.provincia || '', pais: company.pais || '', descripcion: company.descripcion || '',
  }
  return <><CrmCompanyWorkspace canReadContacts={canReadContacts} canReadClients={canReadClients} company={{
    id: company.id, ...fields, version: company.version, origen: company.origen,
    updatedAt: company.updatedAt.toLocaleDateString('es-ES'), updatedBy: company.actualizadoPor,
    importedAt: company.sincronizadoAt?.toLocaleDateString('es-ES') || null,
    contactCount: company._count.contactos, customerCount: company._count.clientes,
  }} contacts={canReadContacts ? company.contactos.map((association) => ({
    id: association.contactoId, name: association.contacto.nombre || association.contacto.email || 'Contacto sin nombre',
    email: association.contacto.email, phone: association.contacto.telefono, role: association.papel,
    isPrimary: association.principal, isCustomer: Boolean(association.contacto.clienteWebId), origin: association.origen,
  })) : []} customers={canReadClients ? company.clientes.map(({ cliente }) => ({ id: cliente.id, name: cliente.nombre, code: cliente.codigo,
    active: Boolean(cliente.activo), segment: cliente.segmentoCrm, personaFisica: Boolean(cliente.personaFisica), nif: cliente.cif || cliente.nif,
  })) : []} /><CrmCompanyContactsMore companyId={company.id} total={canReadContacts ? company._count.contactos : 0} /></>
}
