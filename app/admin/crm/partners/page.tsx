import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BuildingOffice2Icon,
  UserGroupIcon,
} from '@heroicons/react/24/outline'
import { requireAuth } from '../../../../lib/middleware/auth'
import { registrarArea } from '../../../../lib/permisos'
import prisma from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

const ESTADO_LABELS: Record<string, string> = {
  NUEVO: 'Nueva',
  CONTACTADO: 'Contactado',
  EN_EVALUACION: 'En evaluación',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
  DESCARTADO: 'Descartado',
}

const ESTADO_CLASSES: Record<string, string> = {
  NUEVO: 'bg-blue-100 text-blue-700',
  CONTACTADO: 'bg-amber-100 text-amber-700',
  EN_EVALUACION: 'bg-orange-100 text-orange-700',
  APROBADO: 'bg-green-100 text-green-700',
  RECHAZADO: 'bg-red-100 text-red-700',
  DESCARTADO: 'bg-gray-100 text-gray-700',
}

export default async function CrmPartnersPage() {
  await requireAuth('admin')
  await registrarArea('admin.crm.partners', 'CRM > Partners', 'admin.crm')

  const [partnersActivos, solicitudes, solicitudesPorEstado] = await Promise.all([
    prisma.clienteWeb.count({ where: { activo: true, segmentoCrm: 'PARTNER' } }),
    prisma.leadPartner.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.leadPartner.groupBy({
      by: ['estado'],
      _count: { _all: true },
    }),
  ])

  const nuevas = solicitudesPorEstado.find((item) => item.estado === 'NUEVO')?._count._all || 0
  const enGestion = solicitudesPorEstado
    .filter((item) => ['CONTACTADO', 'EN_EVALUACION'].includes(item.estado))
    .reduce((total, item) => total + item._count._all, 0)

  return (
    <main className="space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-4">
        <Link href="/admin/crm" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700">
          <ArrowLeftIcon className="h-4 w-4" />
          Volver al CRM
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-purple-600" />
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Partners</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              Canal comercial separado de los clientes finales. Aquí se reciben las solicitudes de gestorías y colaboradores antes de su evaluación y alta.
            </p>
          </div>
          <Link
            href="/admin/clientes?segmento=PARTNER"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700"
          >
            Ver cartera Partner
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm font-medium text-gray-500">Partners activos</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{partnersActivos}</p>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <p className="text-sm font-medium text-blue-700">Solicitudes nuevas</p>
          <p className="mt-2 text-3xl font-bold text-blue-900">{nuevas}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-5">
          <p className="text-sm font-medium text-orange-700">En gestión</p>
          <p className="mt-2 text-3xl font-bold text-orange-900">{enGestion}</p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <BuildingOffice2Icon className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Solicitudes del programa de Partners</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">Las nuevas solicitudes de la web ya se guardan aquí antes de enviar correos o sincronizar con HubSpot.</p>
        </div>

        {solicitudes.length === 0 ? (
          <div className="px-5 py-14 text-center sm:px-6">
            <UserGroupIcon className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-semibold text-gray-700">Todavía no hay solicitudes de Partner</p>
            <p className="mt-1 text-sm text-gray-500">La próxima solicitud recibida desde la web aparecerá automáticamente en esta tabla.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">Empresa y contacto</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Sector</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Cartera</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Estado</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 sm:px-6">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {solicitudes.map((solicitud) => (
                  <tr key={solicitud.id}>
                    <td className="px-5 py-4 sm:px-6">
                      <p className="text-sm font-semibold text-gray-900">{solicitud.empresa || solicitud.nombre}</p>
                      <p className="mt-0.5 text-sm text-gray-600">{solicitud.nombre}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{solicitud.email} · {solicitud.telefono}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">{solicitud.sector}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{solicitud.numClientes || 'No indicada'}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTADO_CLASSES[solicitud.estado] || ESTADO_CLASSES.DESCARTADO}`}>
                        {ESTADO_LABELS[solicitud.estado] || solicitud.estado}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500 sm:px-6">
                      {solicitud.createdAt.toLocaleDateString('es-ES')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
