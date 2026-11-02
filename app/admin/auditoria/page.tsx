export const dynamic = 'force-dynamic'

import prisma from '@/lib/prisma'
import { requireArea4Owner } from '@/lib/area4/live-admin'

const OPERATION_LABELS: Record<string, string> = {
  USUARIO_ALTA: 'Alta de usuario',
  USUARIO_CAMBIO: 'Cambio de usuario',
  USUARIO_BAJA: 'Baja de usuario',
  PERMISO_CAMBIO: 'Cambio de permisos',
  PERFIL_CAMBIO: 'Cambio de plantilla',
  PERFIL_APLICADO: 'Plantilla aplicada',
  CONFIRMACION_SOLICITADA: 'Confirmación solicitada',
  EXPORTACION_SOLICITADA: 'Exportación solicitada',
}

export default async function AuditoriaArea4Page() {
  const auth = await requireArea4Owner(prisma)
  if (!auth.ok) return null

  const events = await prisma.auditoriaPermisosArea4.findMany({
    take: 100,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, operacion: true, areaCodigo: true, origen: true, createdAt: true,
      actor: { select: { nombre: true } },
      objetivoUsuario: { select: { nombre: true } },
    },
  })

  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Área 4 · Solo Víctor</p>
        <h1 className="mt-1 text-2xl font-bold text-stone-900">Auditoría de accesos</h1>
        <p className="mt-2 text-sm text-stone-600">Registro de solo lectura. Los eventos no se pueden modificar ni borrar desde el panel.</p>
      </header>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-600">
              <tr><th className="px-4 py-3">Cuándo</th><th className="px-4 py-3">Quién</th><th className="px-4 py-3">Acción</th><th className="px-4 py-3">Persona afectada</th><th className="px-4 py-3">Área</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {events.map(event => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-stone-600">{event.createdAt.toLocaleString('es-ES')}</td>
                  <td className="px-4 py-3">{event.actor.nombre}</td>
                  <td className="px-4 py-3">{OPERATION_LABELS[event.operacion] || event.operacion}</td>
                  <td className="px-4 py-3">{event.objetivoUsuario?.nombre || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-600">{event.areaCodigo || '—'}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-stone-500">Aún no hay cambios registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
