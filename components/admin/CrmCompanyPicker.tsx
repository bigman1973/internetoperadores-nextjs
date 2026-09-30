'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BuildingOffice2Icon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline'

type Company = { id: string; nombre: string; nif: string | null; dominio: string | null; tipo: string; _count: { clientes: number; contactos: number } }
type Association = { id: string; nombre: string; tipo: string; principal: boolean; papel: string | null; clientes: number }
export default function CrmCompanyPicker({ contactId, contactName, current, customerId, canWrite }: {
  contactId: string; contactName: string; current: Association[]; customerId: number | null; canWrite: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'find' | 'new'>('find')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ nombre: '', nif: '', dominio: '', tipo: 'SOCIEDAD', segmentoCrm: 'EMPRESA', linkCustomer: false })
  useEffect(() => {
    if (!open || mode !== 'find' || query.trim().length < 2) { setResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/admin/crm/empresas?query=${encodeURIComponent(query.trim())}&limit=12`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'No se pudieron buscar empresas.')
        setResults(data.companies || [])
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudieron buscar empresas.') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }, 220)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [open, mode, query])

  async function associate(company: Company) {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/crm/empresas/${encodeURIComponent(company.id)}/contactos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactoId: contactId, principal: !current.some((item) => item.principal), papel: 'OTRO' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo vincular.')
      setOpen(false); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo vincular.') } finally { setBusy(false) }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const payload = { nombre: form.nombre, nif: form.nif || null, dominio: form.dominio || null, tipo: form.tipo, segmentoCrm: form.segmentoCrm, contactoId, ...(form.linkCustomer && customerId ? { clienteId: customerId } : {}) }
      const response = await fetch('/api/admin/crm/empresas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo crear la empresa.')
      setOpen(false); router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo crear la empresa.') } finally { setBusy(false) }
  }
  async function changeRelation(item: Association, unlink = false) {
    if (unlink && !window.confirm(`¿Desvincular ${item.nombre} de este contacto? No se borrará ninguna ficha.`)) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/admin/crm/empresas/${encodeURIComponent(item.id)}/contactos`, { method: unlink ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactoId, principal: true, papel: item.papel || 'OTRO' }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar la relación.')
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo actualizar la relación.') } finally { setBusy(false) }
  }
  return <div className="space-y-3">
    {current.length === 0 ? <p className="text-sm leading-5 text-slate-500">Sin empresa vinculada. El texto «Empresa» del origen todavía no es una relación confirmada.</p> : current.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2"><Link href={`/admin/crm/empresas/${item.id}`} className="min-w-0 break-words text-sm font-bold text-orange-800 hover:underline">{item.nombre}</Link>{item.principal && <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">Principal</span>}</div>
      <p className="mt-1 text-xs text-slate-600">{item.tipo === 'AUTONOMO' ? 'Autónomo' : 'Empresa'}{item.papel === 'TITULAR' ? ' · Titular' : item.papel ? ` · ${item.papel.toLocaleLowerCase('es-ES')}` : ''}{item.clientes > 0 ? ' · Cliente existente' : ' · Prospecto'}</p>
      {canWrite && <div className="mt-2 flex gap-3 text-xs font-semibold">{!item.principal && <button type="button" disabled={busy} onClick={() => changeRelation(item)} className="text-orange-700 hover:underline">Hacer principal</button>}{!(item.tipo === 'AUTONOMO' && item.papel === 'TITULAR') && <button type="button" disabled={busy} onClick={() => changeRelation(item, true)} className="text-slate-600 hover:underline">Desvincular</button>}</div>}
    </div>)}
    {error && !open && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {canWrite && <button type="button" onClick={() => { setOpen(true); setMode('find'); setError(''); setForm({ nombre: '', nif: '', dominio: '', tipo: 'SOCIEDAD', segmentoCrm: 'EMPRESA', linkCustomer: false }) }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-bold text-orange-800 hover:bg-orange-100"><PlusIcon className="h-4 w-4" />Vincular empresa</button>}
    {open && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false) }}><section role="dialog" aria-modal="true" aria-label="Vincular empresa al contacto" className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-2xl sm:max-h-[85vh] sm:overflow-y-auto sm:rounded-2xl sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">Empresa de {contactName}</h2><p className="mt-1 text-sm text-slate-500">Busca una cuenta existente o crea una nueva, sin convertir al contacto en cliente.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><XMarkIcon className="h-5 w-5" /></button></div>
      <div className="mt-5 flex gap-2 border-b border-slate-200 pb-3"><button type="button" onClick={() => { setMode('find'); setError('') }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'find' ? 'bg-orange-100 text-orange-900' : 'text-slate-600 hover:bg-slate-50'}`}>Buscar empresa</button><button type="button" onClick={() => { setMode('new'); setError('') }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'new' ? 'bg-orange-100 text-orange-900' : 'text-slate-600 hover:bg-slate-50'}`}>Crear nueva</button></div>
      {mode === 'find' ? <div className="mt-5"><label htmlFor="crm-company-query" className="text-sm font-semibold text-slate-800">Nombre, NIF/CIF o dominio</label><div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 focus-within:border-orange-400"><MagnifyingGlassIcon className="h-5 w-5 text-slate-400" /><input id="crm-company-query" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar empresa…" className="min-h-11 w-full outline-none" /></div><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{loading && <p className="text-sm text-slate-500">Buscando…</p>}{results.filter((result) => !current.some((item) => item.id === result.id)).map((company) => <button key={company.id} disabled={busy} type="button" onClick={() => associate(company)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-3 text-left hover:border-orange-300 hover:bg-orange-50 disabled:opacity-60"><span><span className="block text-sm font-bold text-slate-900">{company.nombre}</span><span className="text-xs text-slate-600">{company.tipo === 'AUTONOMO' ? 'Autónomo' : 'Empresa'} · {company._count.clientes ? 'Cliente' : 'Prospecto'}{company.nif ? ` · ${company.nif}` : ''}</span></span><BuildingOffice2Icon className="h-5 w-5 shrink-0 text-orange-700" /></button>)}{!loading && query.length >= 2 && results.length === 0 && <p className="text-sm text-slate-500">No hay coincidencias. Puedes crear la empresa en la pestaña siguiente.</p>}</div></div> : <form onSubmit={create} className="mt-5 space-y-4"><label className="block text-sm font-semibold text-slate-800">Razón social o nombre comercial <input required maxLength={200} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 font-normal outline-orange-500" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-800">Naturaleza<select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, nombre: e.target.value === 'AUTONOMO' && form.nombre === contactName ? contactName : form.nombre })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 font-normal"><option value="SOCIEDAD">Sociedad</option><option value="AUTONOMO">Autónomo/a — yo soy el titular</option><option value="OTRA_ENTIDAD">Otra entidad</option></select></label><label className="text-sm font-semibold text-slate-800">Tipo comercial<select value={form.segmentoCrm} onChange={(e) => setForm({ ...form, segmentoCrm: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 font-normal"><option value="EMPRESA">Empresa</option><option value="PARTNER">Partner / canal</option></select></label></div><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-slate-800">CIF / NIF (opcional)<input maxLength={32} value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label><label className="text-sm font-semibold text-slate-800">Dominio (opcional)<input maxLength={160} value={form.dominio} onChange={(e) => setForm({ ...form, dominio: e.target.value })} placeholder="empresa.es" className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 font-normal" /></label></div>{customerId && <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={form.linkCustomer} onChange={(e) => setForm({ ...form, linkCustomer: e.target.checked })} />Vincular también la cuenta cliente de ISPgestion que ya tiene este contacto</label>}<button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{busy ? 'Guardando…' : form.tipo === 'AUTONOMO' ? 'Crear autónomo con este titular' : 'Crear y vincular'}</button></form>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </section></div>}
  </div>
}
