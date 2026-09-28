import { ArchiveBoxArrowDownIcon, ChevronDownIcon } from '@heroicons/react/24/outline'

export default function CrmHubspotMigrationSection({ children, description }: { children: React.ReactNode; description: string }) {
  return (
    <details className="group overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-lg bg-gray-100 p-2 text-gray-600"><ArchiveBoxArrowDownIcon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900">Herramientas temporales de migración</h2>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Desconexión prevista en un máximo de 10 días</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p>
          </div>
        </div>
        <ChevronDownIcon className="h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-gray-200 bg-gray-50/70 p-4 sm:p-5">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          Estos controles no forman parte del funcionamiento diario del CRM. Se mantienen únicamente para cerrar y verificar el traspaso; después se retirarán junto con la conexión a HubSpot.
        </p>
        {children}
      </div>
    </details>
  )
}
