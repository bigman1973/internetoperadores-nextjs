import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { registrarArea } from '@/lib/permisos'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import CrmCompanyWorkspace from '@/components/admin/CrmCompanyWorkspace'
import CrmCompanyContactsMore from '@/components/admin/CrmCompanyContactsMore'
import type { CompanyFormFields } from '@/components/admin/CrmCompanyForm'
import { canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import CrmIspFichaResumen from '@/components/admin/CrmIspFichaResumen'
import FichaCliente from '@/components/admin/FichaCliente'
import { cargarFichaCliente } from '@/lib/area1-ficha-cliente'
import { nivelDe } from '@/lib/area1-crm-resumen-vista'
import { avisoAislamiento } from '@/lib/area1-m365'
import { fichaNuevaHabilitada, fichaNuevaDisponibleParaRol } from '@/lib/area1-puertas-produccion'
import { getDefaultEmailSender } from '@/lib/email'
import { getOutlookConnectionStatus } from '@/lib/outlook-user-connection'
import { verificarPermisoServer } from '@/lib/permisos'
import '@/components/io-ui/io-ui.css'
import { ioFontClasses } from '@/components/io-ui/fonts'
import './area1-ficha.css'

export const dynamic = 'force-dynamic'

export default async function CrmCompanyDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ editar?: string }> }) {
  const session = await requireAdminAreaRead('admin.crm.empresas', ['MARKETING', 'VENTAS'])
  const relatedUser = { id: Number(session.user.id), name: session.user.name || '', role: session.user.role }
  const [canReadContacts, canReadClients] = await Promise.all([
    canAccessCrmRelated(relatedUser, 'admin.crm.contactos'), canAccessCrmRelated(relatedUser, 'admin.clientes'),
  ])
  const { id } = await params
  const editar = (await searchParams)?.editar === '1' || !fichaNuevaHabilitada()
  const userId = Number(session.user.id)
  const yo = editar ? null : await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true, rol: true, roles: true } })
  const nuevaDisponible = !editar && yo?.activo === true && fichaNuevaDisponibleParaRol(yo.rol, yo.roles)
  if (nuevaDisponible) {
    const nivel = nivelDe(yo?.rol || relatedUser.role || null, yo?.roles)
    const [ficha, conexion, permisoEmpresa, permisoContacto] = await Promise.all([
      cargarFichaCliente(id, nivel),
      getOutlookConnectionStatus(userId),
      verificarPermisoServer(userId, 'admin.crm.empresas', yo?.rol || relatedUser.role),
      verificarPermisoServer(userId, 'admin.crm.contactos', yo?.rol || relatedUser.role),
    ])
    if (!ficha) notFound()
    return <div className={`io-ui area1-ficha ${ioFontClasses}`}>
      <FichaCliente ficha={ficha} puedeEscribir={Boolean(permisoEmpresa.escritura) && !session.impersonation} puedeEscribirContactos={Boolean(permisoContacto.escritura) && !session.impersonation} m365={{ aviso: avisoAislamiento(), conexion, corporativo: getDefaultEmailSender(), connectUrl: `/api/admin/integraciones/outlook/connect?returnTo=${encodeURIComponent(`/admin/crm/empresas/${id}`)}` }} />
    </div>
  }
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
  })) : []} /><CrmCompanyContactsMore companyId={company.id} total={canReadContacts ? company._count.contactos : 0} />{canReadClients && <CrmIspFichaResumen crmEmpresaId={company.id} clienteWebIds={company.clientes.map((link) => link.clienteId)} />}</>
}
