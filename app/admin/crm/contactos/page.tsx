import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, UserGroupIcon } from '@heroicons/react/24/outline'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import CrmContactsDirectoryContent, { type CrmContactsSearchParams } from '@/components/admin/CrmContactsDirectoryContent'

export const dynamic = 'force-dynamic'

export default async function CrmContactosPage({ searchParams }: { searchParams: Promise<CrmContactsSearchParams> }) {
  await requireAdminAreaRead('admin.crm.contactos', ['MARKETING', 'VENTAS'])
  await registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm')

  const params = await searchParams

  return (
    <main className="space-y-6 px-1 py-1 sm:px-2">
      <header className="space-y-4">
        <Link href="/admin/crm" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al CRM
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <UserGroupIcon className="h-8 w-8 text-orange-600" />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Contactos</h1>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">CRM operativo</span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600">
            Directorio corporativo unificado de leads y clientes. Cuando un correo coincide con un cliente que ha comprado, el contacto pasa automáticamente a cliente sin perder sus listas, negocios ni información histórica.
          </p>
        </div>
      </header>

      <Suspense fallback={<CrmContactsDirectoryLoading />}>
        <CrmContactsDirectoryContent params={params} />
      </Suspense>
    </main>
  )
}

function CrmContactsDirectoryLoading() {
  return (
    <section className="space-y-6" role="status" aria-busy="true" aria-label="Cargando directorio de contactos">
      <p className="sr-only">Cargando directorio de contactos…</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="h-24 rounded-xl border border-slate-100 bg-slate-50" />)}
      </div>
      <div className="h-24 rounded-xl border border-orange-100 bg-orange-50/50" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-24 border-b border-slate-100 bg-slate-50/70" />
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="flex h-16 items-center gap-4 border-b border-slate-100 px-5 last:border-0"><span className="h-4 w-1/3 rounded bg-slate-100" /><span className="h-4 w-1/4 rounded bg-slate-100" /><span className="h-4 w-1/5 rounded bg-slate-100" /></div>)}
      </div>
    </section>
  )
}
