import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import CrmHubspotHistorialPanel from '@/components/admin/CrmHubspotHistorialPanel'

export const dynamic = 'force-dynamic'

export default async function CrmHubspotHistorialPage() {
  const session = await requireAuth('admin')
  const cuenta = await prisma.usuarioAdmin.findUnique({ where: { id: Number(session.user.id) }, select: { rol: true, activo: true } })
  if (!cuenta?.activo || cuenta.rol !== 'SUPER_ADMIN') notFound()
  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Historial de HubSpot a la ficha</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Trae a la ficha única las notas, correos, reuniones y tareas de HubSpot de los contactos de Internet Operadores, con su fecha, autor y origen «HubSpot»,
          y guarda el consentimiento de cada contacto. Las llamadas ya están importadas. Se excluye LFDeal («Operaciones de Traspaso»).
          Primero se simula; después lo confirmas. HubSpot solo se lee, y repetir la importación no duplica nada.
        </p>
      </header>
      <CrmHubspotHistorialPanel />
    </main>
  )
}
