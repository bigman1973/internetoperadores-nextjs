import { BuildingOffice2Icon } from '@heroicons/react/24/outline'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import prisma from '@/lib/prisma'
import CrmCompaniesDirectory from '@/components/admin/CrmCompaniesDirectory'
import CrmCompaniesMigration from '@/components/admin/CrmCompaniesMigration'

export const dynamic = 'force-dynamic'

export default async function CrmCompaniesPage() {
  await requireAdminAreaRead('admin.crm.empresas', ['MARKETING', 'VENTAS'])
  const [, companies, total, customers] = await Promise.all([
    registrarArea('admin.crm.empresas', 'CRM > Empresas', 'admin.crm'),
    prisma.crmEmpresa.findMany({ where: { activo: true }, take: 24, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], select: {
      id: true, nombre: true, nombreComercial: true, tipo: true, segmentoCrm: true, nif: true, dominio: true, origen: true,
      _count: { select: { contactos: { where: { activo: true } }, clientes: true } },
    } }),
    prisma.crmEmpresa.count({ where: { activo: true } }),
    prisma.crmEmpresaCliente.count(),
  ])
  return <main className="-m-3 min-h-screen bg-[#f4f6f8] px-4 py-6 sm:-m-5 sm:px-6 lg:-m-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div className="flex items-start gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-sm"><BuildingOffice2Icon className="h-6 w-6" /></span><div><p className="text-xs font-bold uppercase tracking-widest text-orange-700">CRM / Cuentas</p><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Empresas y autónomos</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Una ficha por cuenta comercial; los contactos, clientes de ISPgestion y oportunidades se vinculan sin mezclar sus identidades.</p></div></div></header>
      <div className="mb-6 grid gap-3 sm:grid-cols-3"><Metric title="Empresas y autónomos" value={total} /><Metric title="Cuentas ISPgestion vinculadas" value={customers} /><div className="rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Dato fiscal</p><p className="mt-2 text-sm leading-6 text-blue-950">Un autónomo es persona de contacto y cuenta comercial a la vez. Vincular una empresa no convierte a nadie en cliente.</p></div></div>
      <CrmCompaniesDirectory initialCompanies={companies} initialTotal={total} />
      <div className="mt-7"><CrmCompaniesMigration /></div>
    </div>
  </main>
}
function Metric({ title, value }: { title: string; value: number }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{value.toLocaleString('es-ES')}</p></div> }
