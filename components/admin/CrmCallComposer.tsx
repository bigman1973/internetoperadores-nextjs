'use client'

import { useEffect, useState } from 'react'
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  PhoneArrowDownLeftIcon,
  PhoneArrowUpRightIcon,
  PhoneIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

const CALL_RESULTS = [
  { value: 'CONTACTADO', label: 'Contactado' },
  { value: 'SIN_RESPUESTA', label: 'Sin respuesta' },
  { value: 'OCUPADO', label: 'Ocupado' },
  { value: 'BUZON_DE_VOZ', label: 'Buzón de voz / mensaje' },
  { value: 'NUMERO_INCORRECTO', label: 'Número incorrecto' },
  { value: 'OTRO', label: 'Otro resultado' },
]

type DealOption = { id: string; name: string; pipeline: string; stage: string; closed: boolean }
type ContactOption = { id: string; name: string; email: string | null; company: string | null; phone: string | null }

type Props = {
  open: boolean
  contactId: string
  contactName: string
  contactPhone: string
  deals: DealOption[]
  onClose: () => void
  onCreated: () => void
}

export default function CrmCallComposer({ open, contactId, contactName, contactPhone, deals, onClose, onCreated }: Props) {
  const [direction, setDirection] = useState('SALIENTE')
  const [result, setResult] = useState('')
  const [activityDate, setActivityDate] = useState(() => toLocalDateTime(new Date()))
  const [durationMinutes, setDurationMinutes] = useState('')
  const [description, setDescription] = useState('')
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [showDeals, setShowDeals] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<ContactOption[]>([])
  const [selectedContacts, setSelectedContacts] = useState<Map<string, ContactOption>>(new Map())
  const [searchingContacts, setSearchingContacts] = useState(false)
  const [createFollowUp, setCreateFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState(() => toLocalDateTime(addBusinessDays(new Date(), 3)))
  const [followUpTitle, setFollowUpTitle] = useState(() => `Retomar contacto con ${contactName}`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => createRequestId())

  useEffect(() => {
    if (!open) return
    setDirection('SALIENTE')
    setResult('')
    setActivityDate(toLocalDateTime(new Date()))
    setDurationMinutes('')
    setDescription('')
    setSelectedDeals(new Set())
    setShowDeals(false)
    setShowContacts(false)
    setContactQuery('')
    setContactResults([])
    setSelectedContacts(new Map())
    setCreateFollowUp(false)
    setFollowUpDate(toLocalDateTime(addBusinessDays(new Date(), 3)))
    setFollowUpTitle(`Retomar contacto con ${contactName}`)
    setSaving(false)
    setError(null)
    setRequestId(createRequestId())
  }, [contactName, open])

  useEffect(() => {
    if (!open || !showContacts || contactQuery.trim().length < 2) {
      setContactResults([])
      setSearchingContacts(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchingContacts(true)
      try {
        const params = new URLSearchParams({ query: contactQuery.trim(), exclude: contactId })
        const response = await fetch(`/api/admin/crm/contactos/buscar?${params}`, { signal: controller.signal })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || 'No se pudieron buscar contactos.')
        setContactResults(data.contacts || [])
      } catch (searchError) {
        if (!controller.signal.aborted) setError(searchError instanceof Error ? searchError.message : 'No se pudieron buscar contactos.')
      } finally {
        if (!controller.signal.aborted) setSearchingContacts(false)
      }
    }, 300)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [contactId, contactQuery, open, showContacts])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || saving) return
      if (description.trim() && !window.confirm('¿Quieres cerrar y descartar esta llamada?')) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [description, onClose, open, saving])

  if (!open) return null

  const close = () => {
    if (saving) return
    if (description.trim() && !window.confirm('¿Quieres cerrar y descartar esta llamada?')) return
    onClose()
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!result) return setError('Selecciona el resultado de la llamada.')
    if (!description.trim()) return setError('Explica brevemente qué se ha hablado en la llamada.')
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(contactId)}/actividades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientRequestId: requestId,
          direction,
          result,
          activityDate: new Date(activityDate).toISOString(),
          durationMinutes: durationMinutes || null,
          description,
          dealIds: [...selectedDeals],
          contactIds: [...selectedContacts.keys()],
          followUp: createFollowUp ? { dueAt: new Date(followUpDate).toISOString(), title: followUpTitle } : null,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo registrar la llamada.')
      onCreated()
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo registrar la llamada.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-end bg-slate-950/35 backdrop-blur-[1px] sm:items-stretch" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="crm-call-title" className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-none sm:w-[min(680px,92vw)] sm:rounded-none sm:border-l sm:border-slate-200">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700"><PhoneIcon className="h-5 w-5" /></span>
            <div><h2 id="crm-call-title" className="text-xl font-bold text-slate-950">Registrar llamada</h2><p className="mt-0.5 text-sm text-slate-500">La actividad se guardará directamente en el CRM.</p></div>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Cerrar registro de llamada" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><XMarkIcon className="h-6 w-6" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Contacto</p>
              <p className="mt-1 font-bold text-slate-950">{contactName}</p>
              <p className="mt-1 text-sm text-slate-600">{contactPhone || 'Teléfono sin informar'}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-semibold text-slate-900">Dirección de la llamada</legend>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <DirectionButton selected={direction === 'SALIENTE'} label="Saliente" icon={<PhoneArrowUpRightIcon className="h-4 w-4" />} onClick={() => setDirection('SALIENTE')} />
                  <DirectionButton selected={direction === 'ENTRANTE'} label="Entrante" icon={<PhoneArrowDownLeftIcon className="h-4 w-4" />} onClick={() => setDirection('ENTRANTE')} />
                </div>
              </fieldset>
              <label className="block text-sm font-semibold text-slate-900">Resultado de la llamada
                <select value={result} onChange={(event) => setResult(event.target.value)} required className="mt-2 block min-h-11 w-full rounded-xl border-slate-300 bg-white text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500">
                  <option value="">Seleccionar resultado</option>
                  {CALL_RESULTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-sm font-semibold text-slate-900">Fecha y hora
                <span className="relative mt-2 block"><CalendarDaysIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input type="datetime-local" value={activityDate} max={toLocalDateTime(new Date(Date.now() + 24 * 60 * 60 * 1000))} onChange={(event) => setActivityDate(event.target.value)} required className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500" /></span>
              </label>
              <label className="block text-sm font-semibold text-slate-900">Duración aproximada <span className="font-normal text-slate-400">(opcional)</span>
                <span className="relative mt-2 block"><ClockIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input type="number" min="0" max="1440" step="1" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} placeholder="Minutos" className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500" /></span>
              </label>
            </div>

            <label className="block text-sm font-semibold text-slate-900">Resumen de la conversación
              <textarea autoFocus value={description} onChange={(event) => setDescription(event.target.value)} rows={7} required placeholder="Qué se ha hablado, necesidades detectadas, objeciones y siguiente paso…" className="mt-2 block w-full rounded-2xl border-slate-300 text-sm leading-6 text-slate-900 focus:border-orange-500 focus:ring-orange-500" />
              <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">Escribe información útil para retomar la conversación; no hace falta transcribir la llamada.</span>
            </label>

            {deals.length > 0 && <section className="rounded-2xl border border-slate-200">
              <button type="button" aria-expanded={showDeals} aria-controls="crm-call-deals" onClick={() => setShowDeals((current) => !current)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-slate-900"><span>Asociar con negocios <span className="ml-1 text-xs font-medium text-slate-500">({selectedDeals.size} seleccionados)</span></span><ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${showDeals ? 'rotate-180' : ''}`} /></button>
              {showDeals && <div id="crm-call-deals" className="max-h-64 space-y-2 overflow-y-auto border-t border-slate-100 p-3">{deals.map((deal) => <label key={deal.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"><input type="checkbox" checked={selectedDeals.has(deal.id)} onChange={(event) => setSelectedDeals((current) => { const next = new Set(current); if (event.target.checked) next.add(deal.id); else next.delete(deal.id); return next })} className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" /><span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{deal.name}</span><span className="mt-0.5 block text-xs text-slate-500">{deal.pipeline} · {deal.stage}{deal.closed ? ' · cerrado' : ''}</span></span></label>)}</div>}
            </section>}

            <section className="rounded-2xl border border-slate-200">
              <button type="button" aria-expanded={showContacts} aria-controls="crm-call-contacts" onClick={() => setShowContacts((current) => !current)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-slate-900"><span className="inline-flex items-center gap-2"><UserPlusIcon className="h-4 w-4 text-slate-500" />Asociar con otros contactos <span className="text-xs font-medium text-slate-500">({selectedContacts.size} seleccionados)</span></span><ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${showContacts ? 'rotate-180' : ''}`} /></button>
              {showContacts && <div id="crm-call-contacts" className="space-y-3 border-t border-slate-100 p-3">
                {selectedContacts.size > 0 && <div className="flex flex-wrap gap-2">{[...selectedContacts.values()].map((contact) => <button key={contact.id} type="button" onClick={() => setSelectedContacts((current) => { const next = new Map(current); next.delete(contact.id); return next })} className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200" title="Quitar contacto asociado">{contact.name}<XMarkIcon className="h-3.5 w-3.5" /></button>)}</div>}
                <label className="relative block"><span className="sr-only">Buscar otros contactos</span><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Buscar por nombre, correo, empresa o teléfono" className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500" /></label>
                <div className="max-h-56 space-y-1 overflow-y-auto" aria-live="polite">
                  {searchingContacts && <p className="px-3 py-2 text-sm text-slate-500">Buscando contactos…</p>}
                  {!searchingContacts && contactQuery.trim().length >= 2 && contactResults.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No se han encontrado coincidencias.</p>}
                  {contactResults.map((contact) => {
                    const selected = selectedContacts.has(contact.id)
                    return <button key={contact.id} type="button" onClick={() => setSelectedContacts((current) => { const next = new Map(current); if (selected) next.delete(contact.id); else next.set(contact.id, contact); return next })} className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{contact.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{contact.company || contact.email || contact.phone || 'Sin datos adicionales'}</span></span>{selected && <CheckCircleIcon className="h-5 w-5 shrink-0 text-orange-600" />}</button>
                  })}
                </div>
              </div>}
            </section>

            <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={createFollowUp} onChange={(event) => setCreateFollowUp(event.target.checked)} className="mt-1 rounded border-blue-300 text-blue-600 focus:ring-blue-500" /><span><span className="block text-sm font-bold text-blue-950">Crear tarea de seguimiento</span><span className="mt-0.5 block text-xs leading-5 text-blue-800">Evita que el compromiso quede solo dentro del comentario.</span></span></label>
              {createFollowUp && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-blue-950">Tarea<input value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} required className="mt-1 block min-h-11 w-full rounded-xl border-blue-200 bg-white text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500" /></label><label className="text-xs font-semibold text-blue-950">Fecha límite<input type="datetime-local" value={followUpDate} min={toLocalDateTime(new Date())} onChange={(event) => setFollowUpDate(event.target.value)} required className="mt-1 block min-h-11 w-full rounded-xl border-blue-200 bg-white text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500" /></label></div>}
            </section>

            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-xs text-slate-500">Se asociará siempre con este contacto; puedes añadir otros contactos y negocios relacionados.</p>
            <div className="flex gap-2"><button type="button" onClick={close} disabled={saving} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-60">{saving ? 'Guardando…' : <><CheckCircleIcon className="h-5 w-5" />Registrar llamada</>}</button></div>
          </footer>
        </form>
      </section>
    </div>
  )
}

function DirectionButton({ selected, label, icon, onClick }: { selected: boolean; label: string; icon: React.ReactNode; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition ${selected ? 'border-orange-300 bg-orange-50 text-orange-800 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'}`}>{icon}{label}</button>
}

function addBusinessDays(start: Date, days: number) {
  const date = new Date(start)
  let added = 0
  while (added < days) {
    date.setDate(date.getDate() + 1)
    const weekday = date.getDay()
    if (weekday !== 0 && weekday !== 6) added += 1
  }
  date.setHours(10, 0, 0, 0)
  return date
}

function toLocalDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function createRequestId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `crm-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
