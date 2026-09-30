export default function CrmContactDetailLoading() {
  return (
    <main className="-m-3 min-h-screen animate-pulse bg-[#f4f6f8] pb-8 sm:-m-5 lg:-m-6" aria-busy="true" aria-label="Cargando ficha del contacto">
      <div className="h-14 border-b border-slate-200 bg-white" />
      <header className="border-b border-slate-200 bg-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 shrink-0 rounded-2xl bg-slate-200" />
          <div className="min-w-0 flex-1"><div className="h-7 w-64 max-w-full rounded bg-slate-200" /><div className="mt-3 h-4 w-44 rounded bg-slate-100" /><div className="mt-4 h-6 w-32 rounded-full bg-orange-100" /></div>
        </div>
        <div className="mt-7 flex gap-7"><div className="h-5 w-20 rounded bg-slate-200" /><div className="h-5 w-24 rounded bg-slate-100" /><div className="h-5 w-36 rounded bg-slate-100" /></div>
      </header>
      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8 xl:grid-cols-[270px_minmax(0,1fr)_300px]">
        <div className="h-96 rounded-2xl border border-slate-200 bg-white" />
        <div className="space-y-5"><div className="h-44 rounded-2xl border border-slate-200 bg-white" /><div className="h-72 rounded-2xl border border-slate-200 bg-white" /></div>
        <div className="space-y-4"><div className="h-40 rounded-2xl border border-slate-200 bg-white" /><div className="h-52 rounded-2xl border border-slate-200 bg-white" /></div>
      </div>
      <span className="sr-only">Cargando ficha del contacto…</span>
    </main>
  )
}
