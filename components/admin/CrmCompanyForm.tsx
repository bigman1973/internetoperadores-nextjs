'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

type Customer = { id: number; nombre: string; nombreComercial: string | null; cif: string | null; nif: string | null; segmentoCrm: string; personaFisica: boolean | null; linkedCompanyId: string | null; telefono: string | null; web: string | null; domicilio: string | null; numero: string | null; codigoPostal: string | null; localidad: string | null; provincia: string | null; pais: string | null }
type Contact = { id: string; name: string; email: string | null }
export type CompanyFormFields = { nombre: string; nombreComercial: string; nif: string; tipo: string; segmentoCrm: string; dominio: string; web: string; telefono: string; email: string; sector: string; direccion: string; codigoPostal: string; localidad: string; provincia: string; pais: string; descripcion: string }
export const EMPTY_COMPANY: CompanyFormFields = { nombre: '', nombreComercial: '', nif: '', tipo: 'SOCIEDAD', segmentoCrm: 'EMPRESA', dominio: '', web: '', telefono: '', email: '', sector: '', direccion: '', codigoPostal: '', localidad: '', provincia: '', pais: 'ES', descripcion: '' }

export default function CrmCompanyForm({ initial = EMPTY_COMPANY, companyId, version, onSaved, close }: { initial?: CompanyFormFields; companyId?: string; version?: number; onSaved?: () => void; close?: () => void }) {
  const router = useRouter()
  const { isSuperAdmin, hasAreaAccess } = useRole()
  const canReadClients = isSuperAdmin || hasAreaAccess('admin.clientes', 'lectura')
  const canWriteContacts = isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura')
  const [fields, setFields] = useState<CompanyFormFields>(initial)
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [chosenCustomer, setChosenCustomer] = useState<Customer | null>(null)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [holder, setHolder] = useState<Contact | null>(null)
  const [newHolder, setNewHolder] = useState(false)
  const [holderDetails, setHolderDetails] = useState({ nombre: '', email: '', telefono: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (companyId || !canReadClients || customerQuery.trim().length < 2) { setCustomerResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/crm/empresas/buscar-clientes?query=${encodeURIComponent(customerQuery.trim())}`, { signal: controller.signal })
        const data = await r.json()
        if (r.ok && !controller.signal.aborted) setCustomerResults(data.clients || [])
      } catch { /* La ficha manual sigue disponible sin el buscador. */ }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [companyId, customerQuery, canReadClients])
  useEffect(() => {
    if (companyId || fields.tipo !== 'AUTONOMO' || newHolder || contactQuery.trim().length < 2) { setContactResults([]); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/admin/crm/empresas/buscar-contactos?query=${encodeURIComponent(contactQuery.trim())}`, { signal: controller.signal })
        const data = await r.json()
        if (r.ok && !controller.signal.aborted) setContactResults(data.contacts || [])
      } catch { /* Se puede reintentar. */ }
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [companyId, fields.tipo, contactQuery, newHolder])
  const set = (name: keyof CompanyFormFields, value: string) => setFields((previous) => ({ ...previous, [name]: value }))
  const input = (key: keyof CompanyFormFields, label: string, hint?: string) => <label className="block text-xs font-semibold text-slate-700">{label}<input value={fields[key]} onChange={(event) => set(key, event.target.value)} placeholder={hint} required={key === 'nombre'} maxLength={key === 'descripcion' ? 4000 : 200} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal text-slate-900 outline-orange-500" /></label>
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const leavingSelfEmployed = Boolean(companyId && initial.tipo === 'AUTONOMO' && fields.tipo !== 'AUTONOMO')
    if (leavingSelfEmployed && !window.confirm('Al cambiar la cuenta autónoma a otra entidad, la persona titular pasará a figurar como representante. ¿Confirmas el cambio?')) return
    setSaving(true); setError('')
    if (!companyId && fields.tipo === 'AUTONOMO' && !holder && !(newHolder && holderDetails.nombre.trim().length >= 2)) { setError('Selecciona o introduce la persona titular: un autónomo también es contacto.'); setSaving(false); return }
    try {
      const payload = companyId ? { ...fields, version, confirmarCambioTipo: leavingSelfEmployed } : { ...fields, ...(chosenCustomer ? { clienteId: chosenCustomer.id } : {}), ...(holder ? { contactoId: holder.id } : {}), ...(fields.tipo === 'AUTONOMO' && newHolder ? { titularNuevo: holderDetails } : {}) }
      const response = await fetch(companyId ? `/api/admin/crm/empresas/${encodeURIComponent(companyId)}` : '/api/admin/crm/empresas', { method: companyId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la empresa.')
      if (onSaved) onSaved()
      if (companyId) { close?.(); router.refresh() } else router.push(`/admin/crm/empresas/${data.id}`)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.') } finally { setSaving(false) }
  }
  return <form onSubmit={save} className="space-y-5">
    {!companyId && canReadClients && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold text-blue-950">¿Ya es cliente en ISPgestion?</p><p className="mt-1 text-xs leading-5 text-blue-800">Busca por nombre o CIF/NIF: al seleccionar una cuenta se rellenan sus datos básicos conocidos (sin consultar proveedores externos). Puedes revisarlos antes de guardar. Nunca se vincula automáticamente.</p><div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-3"><MagnifyingGlassIcon className="h-4 w-4 text-slate-400" /><input value={customerQuery} onChange={(e) => { setCustomerQuery(e.target.value); setChosenCustomer(null) }} placeholder="Buscar cliente existente…" className="min-h-10 w-full text-sm outline-none" /></div>{chosenCustomer && <p className="mt-2 text-xs font-bold text-blue-900">Seleccionado: {chosenCustomer.nombre} · {chosenCustomer.cif || chosenCustomer.nif || 'sin NIF'}</p>}{customerResults.length > 0 && <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">{customerResults.map((client) => <button key={client.id} type="button" disabled={Boolean(client.linkedCompanyId)} onClick={() => { setChosenCustomer(client); setCustomerResults([]); setFields((previous) => ({ ...previous, nombre: client.nombre, nombreComercial: client.nombreComercial || previous.nombreComercial, nif: client.cif || client.nif || previous.nif, tipo: client.personaFisica && client.segmentoCrm !== 'PARTICULAR' ? 'AUTONOMO' : previous.tipo, segmentoCrm: client.segmentoCrm === 'PARTNER' ? 'PARTNER' : 'EMPRESA', telefono: client.telefono || previous.telefono, web: client.web || previous.web, direccion: [client.domicilio, client.numero].filter(Boolean).join(' ') || previous.direccion, codigoPostal: client.codigoPostal || previous.codigoPostal, localidad: client.localidad || previous.localidad, provincia: client.provincia || previous.provincia, pais: client.pais || previous.pais })) }} className="block w-full rounded-lg bg-white p-2 text-left text-xs hover:bg-blue-100 disabled:opacity-60">{client.nombre} · {client.cif || client.nif || 'sin NIF'}{client.linkedCompanyId ? ' · ya asociado' : client.personaFisica ? ' · persona física: verifica titular' : ''}</button>)}</div>}</div>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-700">Naturaleza<select value={fields.tipo} onChange={(event) => set('tipo', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"><option value="SOCIEDAD">Sociedad</option><option value="AUTONOMO">Autónomo/a (persona y cuenta)</option><option value="OTRA_ENTIDAD">Otra entidad</option></select></label><label className="block text-xs font-semibold text-slate-700">Relación comercial<select value={fields.segmentoCrm} onChange={(event) => set('segmentoCrm', event.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"><option value="EMPRESA">Empresa</option><option value="PARTNER">Partner / canal</option></select></label></div>
    {!companyId && fields.tipo === 'AUTONOMO' && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
      {!canWriteContacts && <p className="mb-3 text-xs text-red-800">Necesitas permiso de escritura en Contactos para vincular o crear a la persona titular.</p>}
      <p className="text-xs font-bold text-orange-950">Persona titular: utiliza el contacto existente o da de alta uno nuevo</p>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setNewHolder(false); setHolderDetails({ nombre: '', email: '', telefono: '' }) }} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${!newHolder ? 'bg-orange-700 text-white' : 'bg-white text-orange-900'}`}>Buscar contacto</button><button type="button" onClick={() => { setNewHolder(true); setHolder(null); setContactResults([]); setHolderDetails((previous) => ({ ...previous, nombre: previous.nombre || fields.nombre })) }} className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${newHolder ? 'bg-orange-700 text-white' : 'bg-white text-orange-900'}`}>Crear titular nuevo</button></div>
      {!newHolder ? <div className="mt-3"><label className="text-xs font-bold text-orange-950" htmlFor="crm-holder-query">Buscar titular existente</label><input id="crm-holder-query" value={contactQuery} onChange={(e) => { setContactQuery(e.target.value); setHolder(null) }} placeholder="Nombre o correo del autónomo" className="mt-2 min-h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm outline-orange-500" />{holder && <p className="mt-2 text-xs font-semibold text-orange-900">Titular: {holder.name}</p>}{contactResults.length > 0 && <div className="mt-1 max-h-40 overflow-y-auto">{contactResults.map((contact) => <button key={contact.id} type="button" onClick={() => { setHolder(contact); setContactQuery(contact.name); setContactResults([]); if (!fields.nombre.trim()) set('nombre', contact.name) }} className="block w-full rounded-lg p-2 text-left text-xs hover:bg-orange-100">{contact.name} · {contact.email || 'sin correo'}</button>)}</div>}</div> : <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-orange-950">Nombre de la persona *<input required minLength={2} maxLength={180} value={holderDetails.nombre} onChange={(event) => setHolderDetails({ ...holderDetails, nombre: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm" /></label><label className="text-xs font-semibold text-orange-950">Correo personal o profesional<input type="email" maxLength={250} value={holderDetails.email} onChange={(event) => setHolderDetails({ ...holderDetails, email: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm" /></label><label className="text-xs font-semibold text-orange-950">Teléfono<input maxLength={60} value={holderDetails.telefono} onChange={(event) => setHolderDetails({ ...holderDetails, telefono: event.target.value })} className="mt-1 block min-h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm" /></label></div>}
      <p className="mt-2 text-xs text-orange-800">El titular es una sola ficha de contacto vinculada a la cuenta autónoma; no se crea una persona duplicada.</p>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2">{input('nombre', fields.tipo === 'AUTONOMO' ? 'Nombre profesional / razón fiscal' : 'Razón social *')}{input('nombreComercial', 'Nombre comercial')}{input('nif', 'CIF / NIF (opcional)')}{input('dominio', 'Dominio', 'empresa.es')}{input('email', 'Correo general')}{input('telefono', 'Teléfono')}{input('web', 'Página web', 'https://…')}{input('sector', 'Sector')}{input('direccion', 'Dirección')}{input('codigoPostal', 'Código postal')}{input('localidad', 'Localidad')}{input('provincia', 'Provincia')}{input('pais', 'País')}</div>
    <label className="block text-xs font-semibold text-slate-700">Descripción / contexto comercial<textarea value={fields.descripcion} onChange={(event) => set('descripcion', event.target.value)} rows={3} maxLength={4000} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-orange-500" /></label>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={saving} className="min-h-10 rounded-lg bg-orange-600 px-4 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50">{saving ? 'Guardando…' : companyId ? 'Guardar cambios' : 'Crear empresa'}</button>{close && <button type="button" onClick={close} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>}{!companyId && fields.tipo === 'AUTONOMO' && <span className="text-xs text-slate-500">La persona titular también aparecerá en Contactos.</span>}</div>
  </form>
}
