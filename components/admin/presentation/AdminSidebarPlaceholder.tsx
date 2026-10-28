export function AdminSidebarPlaceholder() {
  return (
    <div
      data-admin-sidebar-placeholder
      className="flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4"
      aria-live="polite"
    >
      <div className="flex h-16 shrink-0 items-center">
        <span className="text-2xl font-bold" aria-label="internetoperadores">
          <span className="text-black">internet</span>
          <span className="text-orange-500">operadores</span>
        </span>
      </div>
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
        Cargando navegación autorizada…
      </p>
    </div>
  )
}
