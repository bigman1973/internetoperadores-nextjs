import Link from 'next/link'
import { notFound } from 'next/navigation'
import prisma from '@/lib/prisma'
import { requireArea4Owner } from '@/lib/area4/live-admin'
import { area4VinculosBloqueProductionEnabled } from '@/lib/area4/crm-vinculos-production'
import { area4CrmStagingImportEnabled } from '@/lib/area4/crm-staging-import'
import CrmIspVinculosBloquePanel from '@/components/admin/CrmIspVinculosBloquePanel'

export const dynamic = 'force-dynamic'

export default async function CrmIspVinculosBloquePage() {
  const production = process.env.VERCEL_ENV === 'production'
  if (!(production ? area4VinculosBloqueProductionEnabled() : area4CrmStagingImportEnabled())) notFound()
  const owner = await requireArea4Owner(prisma)
  if (!owner.ok) notFound()
  if (owner.session.impersonation !== undefined && owner.session.impersonation !== null) notFound()
  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/admin/crm" className="text-sm font-medium text-slate-600">Volver al CRM</Link>
      <header>
        <h1 className="text-3xl font-bold text-gray-900">Vínculos ISP: bloque revisado</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Sólo propuestas locales con NIF, confianza alta, nombre igual y empresa no compartida.
          No importa ficheros, no crea fichas y no sincroniza servicios externos.
          {production ? ' Simular Production → Claude revisa → Víctor confirma.' : ' Entorno staging: simulación y confirmación nativas del bloque.'}
        </p>
      </header>
      <CrmIspVinculosBloquePanel production={production} />
    </main>
  )
}
