import Link from 'next/link'
import { notFound } from 'next/navigation'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import CrmIspImportPanel from '@/components/admin/CrmIspImportPanel'

export const dynamic = 'force-dynamic'

export default async function CrmIspImportPage() {
  if (importacionesCrmCerradas()) notFound()
  const session = await requireAuth('admin')
  const cuenta = await prisma.usuarioAdmin.findUnique({ where: { id: Number(session.user.id) }, select: { rol: true, activo: true } })
  if (!cuenta?.activo || cuenta.rol !== 'SUPER_ADMIN') notFound()
  return (
    <main className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/admin/crm" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeftIcon className="h-4 w-4" />Volver al CRM</Link>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Importar clientes de ISP Gestión</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
          Carga el fichero exportado de ISP Gestión (hojas Clientes, Contratos y Facturacion_2026). Primero se simula y, tras revisar el resumen, se aplica.
          La carga es idempotente: el ID de cliente y el número de contrato de ISP son la clave, y nunca se borra nada. Los vínculos con fichas del CRM se proponen y los confirmas tú.
          No se envía nada a Brevo: solo se leen sus bajas, que siempre prevalecen.
        </p>
      </header>
      <CrmIspImportPanel />
    </main>
  )
}
