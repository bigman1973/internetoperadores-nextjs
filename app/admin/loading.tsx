export default function AdminLoading() {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando apartado del panel" className="space-y-5">
      <p className="sr-only">Cargando apartado…</p>
      <div className="h-8 w-48 rounded-lg bg-gray-200" />
      <div className="h-4 w-full max-w-lg rounded bg-gray-100" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-24 rounded-xl border border-gray-100 bg-white" />)}
      </div>
      <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-5">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="h-12 rounded-lg bg-gray-50" />)}
      </div>
    </div>
  )
}
