'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRightIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'
import CrmCompanyForm from './CrmCompanyForm'
import { useRole } from './RoleContext'

type Company = { id: string; nombre: string; nombreComercial: string | null; tipo: string; segmentoCrm: string; nif: string | null; dominio: string | null; origen: string; _count: { contactos: number; clientes: number } }
export default function CrmCompaniesDirectory({ initialCompanies, initialTotal }: { initialCompanies: Company[]; initialTotal: number }) {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.empresas', 'escritura'))
  const [companies, setCompanies] = useState(initialCompanies)
  const [total, setTotal] = useState(initialTotal)
  const [query, setQuery] = useState('')
  const [segment, setSegment] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (!query && !segment && page === 1) { setCompanies(initialCompanies); setTotal(initialTotal); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true); setError('')
      try {
        const params = new URLSearchParams({ query, segment, page: String(page) })
        const response = await fetch(`/api/admin/crm/empresas?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las empresas.')
        setCompanies(data.companies); setTotal(data.total)
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudieron cargar las empresas.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, page === 1 ? 230 : 0)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, segment, page, initialCompanies, initialTotal])
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-base font-bold text-slate-950">Directorio de cuentas</h2><p className="mt-1 text-xs text-slate-500">{total.toLocaleString('es-ES')} fichas · cada contacto se puede asociar a varias empresas.</p></div>{canWrite && <button type="button" onClick={() => setCreating(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700"><PlusIcon className="h-4 w-4" />Nueva empresa</button>}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]"><label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-3 focus-within:border-orange-500"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400" /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} aria-label="Buscar por nombre, NIF o dominio" placeholder="Buscar por nombre, CIF/NIF o dominio…" className="w-full text-sm outline-none" /></label><select value={segment} onChange={(event) => { setSegment(event.target.value); setPage(1) }} aria-label="Filtrar relación comercial" className="min-h-11 rounded-xl border border-slate-300 px-3 text-sm text-slate-700"><option value="">Todas las cuentas</option><option value="EMPRESA">Empresas y autónomos</option><option value="PARTNER">Partners / canales</option></select></div>
    {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4 space-y-2" aria-busy={loading}>{loading && <p role="status" className="text-xs text-orange-700">Actualizando resultados…</p>}{companies.length === 0 && !loading && <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">No hay empresas para este filtro. Puedes crear la primera con el botón superior.</div>}{companies.map((company) => <Link key={company.id} prefetch={false} href={`/admin/crm/empresas/${company.id}`} className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 transition hover:border-orange-300 hover:bg-orange-50/50 sm:flex-nowrap"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="break-words text-sm font-bold text-slate-950 group-hover:text-orange-800">{company.nombre}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${company._count.clientes ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{company._count.clientes ? 'Cliente' : 'Prospecto'}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">{company.tipo === 'AUTONOMO' ? 'Autónomo' : company.segmentoCrm === 'PARTNER' ? 'Partner' : 'Empresa'}</span></div><p className="mt-1 text-xs text-slate-500">{[company.nombreComercial, company.nif, company.dominio].filter(Boolean).join(' · ') || 'Datos fiscales pendientes'}</p></div><div className="flex shrink-0 items-center gap-3 text-xs text-slate-600"><span>{company._count.contactos} {company._count.contactos === 1 ? 'contacto' : 'contactos'}</span><ArrowRightIcon className="h-4 w-4 text-orange-600" /></div></Link>)}</div>
    {total > 24 && <div className="mt-5 flex items-center justify-between text-sm text-slate-600"><span>Página {page} de {Math.ceil(total / 24)}</span><div className="flex gap-2"><button type="button" disabled={loading || page === 1} onClick={() => setPage((current) => current - 1)} className="min-h-9 rounded-lg border px-3 disabled:opacity-40">Anterior</button><button type="button" disabled={loading || page * 24 >= total} onClick={() => setPage((current) => current + 1)} className="min-h-9 rounded-lg border px-3 disabled:opacity-40">Siguiente</button></div></div>}
    {creating && <div role="presentation" className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"><section role="dialog" aria-modal="true" aria-label="Crear empresa CRM" className="max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-h-[90vh] sm:rounded-2xl sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-bold text-slate-950">Nueva empresa</h2><p className="mt-1 text-sm text-slate-500">También puedes crear un autónomo y asignarle su contacto titular.</p></div><button type="button" onClick={() => setCreating(false)} aria-label="Cerrar" className="rounded-lg p-2 hover:bg-slate-100"><XMarkIcon className="h-5 w-5" /></button></div><CrmCompanyForm close={() => setCreating(false)} /></section></div>}
  </section>
}
