export default function CrmContactsLoading() {
  return (
    <main className="space-y-6 px-1 py-1 sm:px-2" role="status" aria-busy="true" aria-label="Cargando contactos del CRM">
      <p className="sr-only">Cargando contactos…</p>
      <div className="space-y-3">
        <div className="h-4 w-28 rounded bg-slate-100" />
        <div className="h-9 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-full max-w-xl rounded bg-slate-100" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="h-24 rounded-xl border border-slate-100 bg-slate-50" />)}
      </div>
      <div className="h-24 rounded-xl border border-orange-100 bg-orange-50/50" />
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="h-24 border-b border-slate-100 bg-slate-50/70" />
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="flex h-16 items-center gap-4 border-b border-slate-100 px-5 last:border-0"><span className="h-4 w-1/3 rounded bg-slate-100" /><span className="h-4 w-1/4 rounded bg-slate-100" /><span className="h-4 w-1/5 rounded bg-slate-100" /></div>)}
      </div>
    </main>
  )
}
