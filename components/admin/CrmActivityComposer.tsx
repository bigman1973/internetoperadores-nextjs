'use client'

import { useEffect, useState } from 'react'
import {
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PaperAirplaneIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

export type CrmActivityType = 'CORREO' | 'REUNION' | 'NOTA' | 'TAREA' | 'WHATSAPP' | 'LINKEDIN' | 'SMS' | 'CORREO_POSTAL'

type DealOption = { id: string; name: string; pipeline: string; stage: string; closed: boolean }
type ContactOption = { id: string; name: string; email: string | null; company: string | null; phone: string | null }

type Props = {
  open: boolean
  type: CrmActivityType
  contactId: string
  contactName: string
  contactEmail: string
  contactPhone: string
  contactLinkedIn: string
  senderEmail: string
  calendarMailbox: string
  calendarEnabled: boolean
  deals: DealOption[]
  onClose: () => void
  onCreated: (type: CrmActivityType, details?: { outlook: boolean }) => void
}

const CONFIG: Record<CrmActivityType, { title: string; description: string; action: string; placeholder: string; color: string }> = {
  CORREO: { title: 'Enviar correo', description: 'Se tramitará con Microsoft 365 y quedará registrado en la cronología.', action: 'Enviar y registrar', placeholder: 'Escribe el mensaje que recibirá el contacto…', color: 'bg-blue-100 text-blue-700' },
  REUNION: { title: 'Programar reunión', description: 'Crea el evento en el calendario corporativo y regístralo en el CRM.', action: 'Registrar reunión', placeholder: 'Objetivo, asistentes, acuerdos y próximos pasos…', color: 'bg-violet-100 text-violet-700' },
  NOTA: { title: 'Añadir nota', description: 'Guarda contexto interno sin modificar las propiedades del contacto.', action: 'Guardar nota', placeholder: 'Información útil para el equipo…', color: 'bg-amber-100 text-amber-700' },
  TAREA: { title: 'Crear tarea', description: 'Deja un próximo paso con fecha límite y prioridad.', action: 'Crear tarea', placeholder: 'Qué hay que hacer y cuál es el resultado esperado…', color: 'bg-emerald-100 text-emerald-700' },
  WHATSAPP: { title: 'WhatsApp asistido', description: 'Prepara el mensaje y conserva el registro en la cronología.', action: 'Registrar WhatsApp', placeholder: 'Escribe el mensaje o resume la conversación…', color: 'bg-green-100 text-green-700' },
  LINKEDIN: { title: 'LinkedIn asistido', description: 'Abre el perfil o buscador y conserva la interacción en el CRM.', action: 'Registrar LinkedIn', placeholder: 'Escribe el mensaje o resume la interacción…', color: 'bg-sky-100 text-sky-700' },
  SMS: { title: 'SMS asistido', description: 'Prepara el SMS y conserva el registro en la cronología.', action: 'Registrar SMS', placeholder: 'Escribe el mensaje o resume la conversación…', color: 'bg-indigo-100 text-indigo-700' },
  CORREO_POSTAL: { title: 'Registrar correo postal', description: 'Deja constancia de una comunicación física.', action: 'Registrar correo postal', placeholder: 'Documento enviado o recibido, contenido y observaciones…', color: 'bg-stone-100 text-stone-700' },
}

const MESSAGE_TYPES = new Set<CrmActivityType>(['WHATSAPP', 'LINKEDIN', 'SMS', 'CORREO_POSTAL'])
const FOLLOW_UP_TYPES = new Set<CrmActivityType>(['CORREO', 'REUNION', 'NOTA', 'WHATSAPP', 'LINKEDIN', 'SMS', 'CORREO_POSTAL'])

export default function CrmActivityComposer({ open, type, contactId, contactName, contactEmail, contactPhone, contactLinkedIn, senderEmail, calendarMailbox, calendarEnabled, deals, onClose, onCreated }: Props) {
  const config = CONFIG[type]
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [activityDate, setActivityDate] = useState(() => toLocalDateTime(new Date()))
  const [durationMinutes, setDurationMinutes] = useState('')
  const [location, setLocation] = useState('')
  const [syncOutlook, setSyncOutlook] = useState(type === 'REUNION' && calendarEnabled)
  const [onlineMeeting, setOnlineMeeting] = useState(false)
  const [inviteAttendees, setInviteAttendees] = useState(Boolean(contactEmail))
  const [direction, setDirection] = useState('SALIENTE')
  const [to, setTo] = useState(contactEmail)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCopies, setShowCopies] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [showDeals, setShowDeals] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [contactQuery, setContactQuery] = useState('')
  const [contactResults, setContactResults] = useState<ContactOption[]>([])
  const [selectedContacts, setSelectedContacts] = useState<Map<string, ContactOption>>(new Map())
  const [searchingContacts, setSearchingContacts] = useState(false)
  const [createFollowUp, setCreateFollowUp] = useState(type === 'TAREA')
  const [followUpDate, setFollowUpDate] = useState(() => toLocalDateTime(addBusinessDays(new Date(), 3)))
  const [followUpTitle, setFollowUpTitle] = useState('')
  const [priority, setPriority] = useState('MEDIA')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestId, setRequestId] = useState(() => createRequestId())

  useEffect(() => {
    if (!open) return
    const now = new Date()
    setTitle(type === 'TAREA' ? `Seguimiento de ${contactName}` : '')
    setDescription('')
    setActivityDate(toLocalDateTime(now))
    setDurationMinutes(type === 'REUNION' ? '60' : '')
    setLocation('')
    setSyncOutlook(type === 'REUNION' && calendarEnabled)
    setOnlineMeeting(false)
    setInviteAttendees(type === 'REUNION' && Boolean(contactEmail))
    setDirection('SALIENTE')
    setTo(contactEmail)
    setCc('')
    setBcc('')
    setShowCopies(false)
    setSelectedDeals(new Set())
    setShowDeals(false)
    setShowContacts(false)
    setContactQuery('')
    setContactResults([])
    setSelectedContacts(new Map())
    setCreateFollowUp(type === 'TAREA')
    setFollowUpDate(toLocalDateTime(addBusinessDays(now, 3)))
    setFollowUpTitle(`Retomar contacto con ${contactName}`)
    setPriority('MEDIA')
    setSaving(false)
    setError(null)
    setRequestId(createRequestId())
  }, [calendarEnabled, contactEmail, contactName, open, type])

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
      if (hasDraft() && !window.confirm('¿Quieres cerrar y descartar esta actividad?')) return
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })

  if (!open) return null

  function hasDraft() {
    return Boolean(title.trim() || description.trim() || cc.trim() || bcc.trim() || selectedDeals.size || selectedContacts.size)
  }

  function close() {
    if (saving) return
    if (hasDraft() && !window.confirm('¿Quieres cerrar y descartar esta actividad?')) return
    onClose()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!description.trim()) return setError(type === 'CORREO' ? 'Escribe el contenido del correo.' : 'Añade una descripción útil.')
    if ((type === 'CORREO' || type === 'TAREA') && !title.trim()) return setError(type === 'CORREO' ? 'Escribe el asunto del correo.' : 'Escribe el título de la tarea.')
    if (type === 'CORREO' && !to.trim()) return setError('Añade al menos un destinatario.')
    if (type === 'REUNION' && syncOutlook && !title.trim()) return setError('Escribe el título de la reunión.')
    if (type === 'REUNION' && syncOutlook && Number(durationMinutes) < 5) return setError('Indica una duración mínima de 5 minutos.')
    const assistedUrl = direction === 'SALIENTE' ? channelUrl(type, contactPhone, contactLinkedIn, contactName, description) : null
    const assistedWindow = assistedUrl ? window.open('about:blank', '_blank') : null
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${encodeURIComponent(contactId)}/actividades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          clientRequestId: requestId,
          title: title || null,
          description,
          activityDate: new Date(activityDate).toISOString(),
          durationMinutes: durationMinutes || null,
          direction: type === 'CORREO' ? 'SALIENTE' : direction,
          location: location || null,
          to: type === 'CORREO' ? splitEmails(to) : undefined,
          cc: type === 'CORREO' ? splitEmails(cc) : undefined,
          bcc: type === 'CORREO' ? splitEmails(bcc) : undefined,
          syncOutlook: type === 'REUNION' ? syncOutlook : undefined,
          onlineMeeting: type === 'REUNION' ? onlineMeeting : undefined,
          inviteAttendees: type === 'REUNION' ? inviteAttendees : undefined,
          prepareExternalChannel: Boolean(assistedUrl),
          dealIds: [...selectedDeals],
          contactIds: [...selectedContacts.keys()],
          followUp: createFollowUp || type === 'TAREA' ? {
            dueAt: new Date(followUpDate).toISOString(),
            title: type === 'TAREA' ? title : followUpTitle,
            priority,
          } : null,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || `No se pudo ${type === 'CORREO' ? 'enviar el correo' : 'registrar la actividad'}.`)
      }
      if (assistedWindow && assistedUrl) {
        assistedWindow.opener = null
        assistedWindow.location.href = assistedUrl
      }
      onCreated(type, { outlook: type === 'REUNION' && syncOutlook })
      onClose()
    } catch (submitError) {
      assistedWindow?.close()
      setError(submitError instanceof Error ? submitError.message : 'No se pudo completar la operación.')
    } finally {
      setSaving(false)
    }
  }

  const Icon = type === 'CORREO' ? EnvelopeIcon : type === 'REUNION' ? CalendarDaysIcon : type === 'NOTA' ? DocumentTextIcon : type === 'TAREA' ? CheckCircleIcon : ChatBubbleLeftRightIcon
  const canOpenAssistedChannel = direction === 'SALIENTE' && Boolean(channelUrl(type, contactPhone, contactLinkedIn, contactName, description))
  const primaryAction = type === 'REUNION' && syncOutlook
    ? 'Crear en Outlook'
    : canOpenAssistedChannel
      ? `Registrar y abrir ${type === 'WHATSAPP' ? 'WhatsApp' : type === 'SMS' ? 'SMS' : 'LinkedIn'}`
      : config.action

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-end bg-slate-950/35 backdrop-blur-[1px] sm:items-stretch" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="crm-activity-title" className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-none sm:w-[min(700px,92vw)] sm:rounded-none sm:border-l sm:border-slate-200">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${config.color}`}><Icon className="h-5 w-5" /></span>
            <div><h2 id="crm-activity-title" className="text-xl font-bold text-slate-950">{config.title}</h2><p className="mt-0.5 text-sm text-slate-500">{config.description}</p></div>
          </div>
          <button type="button" onClick={close} disabled={saving} aria-label="Cerrar" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><XMarkIcon className="h-6 w-6" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">Contacto principal</p>
              <p className="mt-1 font-bold text-slate-950">{contactName}</p>
              <p className="mt-1 text-sm text-slate-600">{contactEmail || contactPhone || 'Sin correo ni teléfono informado'}</p>
            </div>

            {type === 'CORREO' && <>
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
                <p><strong>De:</strong> {senderEmail}</p>
                <p className="text-xs text-blue-800">Microsoft Graph solicitará guardar una copia en Elementos enviados de este buzón. El CRM conservará destinatarios, asunto, contenido y estado del intento.</p>
              </div>
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-900">Para<input type="text" value={to} onChange={(event) => setTo(event.target.value)} required placeholder="correo@empresa.com" className="mt-2 block min-h-11 w-full rounded-xl border-slate-300 text-sm text-slate-900 focus:border-blue-500 focus:ring-blue-500" /></label>
                <button type="button" onClick={() => setShowCopies((current) => !current)} className="text-xs font-semibold text-blue-700 hover:text-blue-900">{showCopies ? 'Ocultar CC y CCO' : 'Añadir CC o CCO'}</button>
                {showCopies && <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-700">CC<input type="text" value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Separar con ; o ," className="mt-1 block min-h-11 w-full rounded-xl border-slate-300 text-sm text-slate-900" /></label><label className="text-xs font-semibold text-slate-700">CCO<input type="text" value={bcc} onChange={(event) => setBcc(event.target.value)} placeholder="Separar con ; o ," className="mt-1 block min-h-11 w-full rounded-xl border-slate-300 text-sm text-slate-900" /></label></div>}
              </div>
            </>}

            {type === 'REUNION' && <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
              <label className={`flex items-start gap-3 ${calendarEnabled ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}><input type="checkbox" checked={syncOutlook} onChange={(event) => setSyncOutlook(event.target.checked)} disabled={!calendarEnabled} className="mt-1 rounded border-violet-300 text-violet-600 focus:ring-violet-500" /><span><span className="block font-bold">Crear en Outlook corporativo</span><span className="mt-0.5 block text-xs leading-5 text-violet-800">{calendarEnabled ? <>Organizador: {calendarMailbox}. El CRM guardará el enlace y el identificador del evento.</> : 'Pendiente de habilitar el permiso y el aislamiento del calendario en Microsoft 365. Mientras tanto, puedes registrar la reunión solo en el CRM.'}</span></span></label>
              {syncOutlook && <div className="grid gap-3 border-t border-violet-200 pt-3 sm:grid-cols-2"><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={inviteAttendees} onChange={(event) => setInviteAttendees(event.target.checked)} disabled={!contactEmail && selectedContacts.size === 0} className="mt-0.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500" /><span className="text-xs leading-5">Enviar invitación a los contactos con correo</span></label><label className="flex cursor-pointer items-start gap-2"><input type="checkbox" checked={onlineMeeting} onChange={(event) => setOnlineMeeting(event.target.checked)} className="mt-0.5 rounded border-violet-300 text-violet-600 focus:ring-violet-500" /><span className="text-xs leading-5">Añadir reunión de Microsoft Teams</span></label></div>}
            </div>}

            {isAssistedChannel(type) && <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700"><p className="font-bold text-slate-900">Apertura asistida</p><p className="mt-0.5 text-xs">Al guardar una comunicación saliente se abrirá {type === 'WHATSAPP' ? 'WhatsApp' : type === 'SMS' ? 'la aplicación de SMS' : 'LinkedIn'} con el contacto y el texto preparado. El CRM la marcará como preparada, no como entregada.</p>{type !== 'LINKEDIN' && !normalisePhone(contactPhone) && <p className="mt-2 text-xs font-semibold text-amber-700">Este contacto no tiene un teléfono válido; podrás registrar la actividad, pero no abrir el canal.</p>}</div>}

            {(type === 'CORREO' || type === 'REUNION' || type === 'TAREA') && <label className="block text-sm font-semibold text-slate-900">{type === 'CORREO' ? 'Asunto' : type === 'TAREA' ? 'Título de la tarea' : 'Título'}<input autoFocus={type !== 'CORREO'} value={title} onChange={(event) => setTitle(event.target.value)} required={type !== 'REUNION'} maxLength={250} placeholder={type === 'CORREO' ? 'Asunto del correo' : type === 'TAREA' ? 'Próximo paso' : 'Nombre de la reunión'} className="mt-2 block min-h-11 w-full rounded-xl border-slate-300 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500" /></label>}

            {type !== 'CORREO' && type !== 'NOTA' && type !== 'TAREA' && <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-900">Fecha y hora<span className="relative mt-2 block"><CalendarDaysIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input type="datetime-local" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} required className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900 focus:border-orange-500 focus:ring-orange-500" /></span></label>
              {type === 'REUNION' && <label className="block text-sm font-semibold text-slate-900">Duración <span className="font-normal text-slate-400">(opcional)</span><span className="relative mt-2 block"><ClockIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input type="number" min="0" max="10080" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} placeholder="Minutos" className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900" /></span></label>}
              {MESSAGE_TYPES.has(type) && <fieldset><legend className="text-sm font-semibold text-slate-900">Dirección</legend><div className="mt-2 grid grid-cols-2 gap-2"><DirectionButton selected={direction === 'SALIENTE'} label="Saliente" onClick={() => setDirection('SALIENTE')} /><DirectionButton selected={direction === 'ENTRANTE'} label="Entrante" onClick={() => setDirection('ENTRANTE')} /></div></fieldset>}
              {type === 'REUNION' && <label className="block text-sm font-semibold text-slate-900">Lugar o enlace <span className="font-normal text-slate-400">(opcional)</span><span className="relative mt-2 block"><MapPinIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Oficina, Teams, dirección…" className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900" /></span></label>}
            </div>}

            <label className="block text-sm font-semibold text-slate-900">{type === 'CORREO' ? 'Mensaje' : type === 'TAREA' ? 'Descripción' : 'Resumen'}<textarea autoFocus={type === 'CORREO' || type === 'NOTA'} value={description} onChange={(event) => setDescription(event.target.value)} rows={type === 'CORREO' ? 10 : 7} required maxLength={20000} placeholder={config.placeholder} className="mt-2 block w-full rounded-2xl border-slate-300 text-sm leading-6 text-slate-900 focus:border-orange-500 focus:ring-orange-500" /><span className="mt-1 block text-xs font-normal text-slate-500">{description.length.toLocaleString('es-ES')} / 20.000 caracteres</span></label>

            {deals.length > 0 && <Collapsible title="Asociar con negocios" count={selectedDeals.size} open={showDeals} onToggle={() => setShowDeals((current) => !current)} id="crm-activity-deals">
              <div className="max-h-64 space-y-2 overflow-y-auto p-3">{deals.map((deal) => <label key={deal.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"><input type="checkbox" checked={selectedDeals.has(deal.id)} onChange={(event) => setSelectedDeals((current) => { const next = new Set(current); if (event.target.checked) next.add(deal.id); else next.delete(deal.id); return next })} className="mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" /><span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{deal.name}</span><span className="mt-0.5 block text-xs text-slate-500">{deal.pipeline} · {deal.stage}{deal.closed ? ' · cerrado' : ''}</span></span></label>)}</div>
            </Collapsible>}

            <Collapsible title="Asociar con otros contactos" count={selectedContacts.size} open={showContacts} onToggle={() => setShowContacts((current) => !current)} id="crm-activity-contacts" icon={<UserPlusIcon className="h-4 w-4" />}>
              <div className="space-y-3 p-3">
                {selectedContacts.size > 0 && <div className="flex flex-wrap gap-2">{[...selectedContacts.values()].map((contact) => <button key={contact.id} type="button" onClick={() => setSelectedContacts((current) => { const next = new Map(current); next.delete(contact.id); return next })} className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 ring-1 ring-orange-200">{contact.name}<XMarkIcon className="h-3.5 w-3.5" /></button>)}</div>}
                <label className="relative block"><span className="sr-only">Buscar otros contactos</span><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" /><input value={contactQuery} onChange={(event) => setContactQuery(event.target.value)} placeholder="Buscar por nombre, correo, empresa o teléfono" className="block min-h-11 w-full rounded-xl border-slate-300 pl-10 text-sm text-slate-900" /></label>
                <div className="max-h-56 space-y-1 overflow-y-auto" aria-live="polite">{searchingContacts && <p className="px-3 py-2 text-sm text-slate-500">Buscando contactos…</p>}{!searchingContacts && contactQuery.trim().length >= 2 && contactResults.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">No se han encontrado coincidencias.</p>}{contactResults.map((contact) => { const selected = selectedContacts.has(contact.id); return <button key={contact.id} type="button" onClick={() => setSelectedContacts((current) => { const next = new Map(current); if (selected) next.delete(contact.id); else next.set(contact.id, contact); return next })} className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${selected ? 'bg-orange-50 ring-1 ring-orange-200' : 'hover:bg-slate-50'}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{contact.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{contact.company || contact.email || contact.phone || 'Sin datos adicionales'}</span></span>{selected && <CheckCircleIcon className="h-5 w-5 shrink-0 text-orange-600" />}</button> })}</div>
              </div>
            </Collapsible>

            {(type === 'TAREA' || FOLLOW_UP_TYPES.has(type)) && <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
              {type !== 'TAREA' && <label className="flex cursor-pointer items-start gap-3"><input type="checkbox" checked={createFollowUp} onChange={(event) => setCreateFollowUp(event.target.checked)} className="mt-1 rounded border-blue-300 text-blue-600 focus:ring-blue-500" /><span><span className="block text-sm font-bold text-blue-950">Crear tarea de seguimiento</span><span className="mt-0.5 block text-xs leading-5 text-blue-800">Convierte el siguiente paso en un compromiso visible.</span></span></label>}
              {(createFollowUp || type === 'TAREA') && <div className={`${type === 'TAREA' ? '' : 'mt-4'} grid gap-3 sm:grid-cols-2`}>
                {type !== 'TAREA' && <label className="text-xs font-semibold text-blue-950 sm:col-span-2">Tarea<input value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} required className="mt-1 block min-h-11 w-full rounded-xl border-blue-200 bg-white text-sm text-slate-900" /></label>}
                <label className="text-xs font-semibold text-blue-950">Fecha límite<input type="datetime-local" value={followUpDate} min={toLocalDateTime(new Date())} onChange={(event) => setFollowUpDate(event.target.value)} required className="mt-1 block min-h-11 w-full rounded-xl border-blue-200 bg-white text-sm text-slate-900" /></label>
                <label className="text-xs font-semibold text-blue-950">Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border-blue-200 bg-white text-sm text-slate-900"><option value="BAJA">Baja</option><option value="MEDIA">Media</option><option value="ALTA">Alta</option></select></label>
              </div>}
            </section>}

            {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</div>}
          </div>

          <footer className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-xs text-slate-500">La actividad se asociará siempre con este contacto.</p>
            <div className="flex gap-2"><button type="button" onClick={close} disabled={saving} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-orange-700 disabled:opacity-60">{saving ? (type === 'CORREO' ? 'Enviando…' : type === 'REUNION' && syncOutlook ? 'Creando en Outlook…' : 'Guardando…') : <><PaperAirplaneIcon className="h-5 w-5" />{primaryAction}</>}</button></div>
          </footer>
        </form>
      </section>
    </div>
  )
}

function DirectionButton({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${selected ? 'border-orange-300 bg-orange-50 text-orange-800 ring-1 ring-orange-200' : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200'}`}>{label}</button>
}

function Collapsible({ title, count, open, onToggle, id, icon, children }: { title: string; count: number; open: boolean; onToggle: () => void; id: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200"><button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-slate-900"><span className="inline-flex items-center gap-2">{icon}{title} <span className="text-xs font-medium text-slate-500">({count} seleccionados)</span></span><ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} /></button>{open && <div id={id} className="border-t border-slate-100">{children}</div>}</section>
}

function splitEmails(value: string) {
  return value.split(/[;,]/).map((email) => email.trim()).filter(Boolean)
}

function isAssistedChannel(type: CrmActivityType) {
  return type === 'WHATSAPP' || type === 'SMS' || type === 'LINKEDIN'
}

function channelUrl(type: CrmActivityType, phone: string, linkedIn: string, contactName: string, message: string) {
  if (!isAssistedChannel(type)) return null
  if (type === 'LINKEDIN') {
    const directProfile = safeLinkedInUrl(linkedIn)
    return directProfile || `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(contactName)}`
  }
  const normalizedPhone = normalisePhone(phone)
  if (!normalizedPhone) return null
  if (type === 'WHATSAPP') return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`
  return `sms:+${normalizedPhone}?body=${encodeURIComponent(message)}`
}

function normalisePhone(value: string) {
  let digits = value.trim().replace(/[^\d+]/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('+')) digits = digits.slice(1)
  digits = digits.replace(/\D/g, '')
  if (digits.length === 9) digits = `34${digits}`
  return digits.length >= 8 && digits.length <= 15 ? digits : ''
}

function safeLinkedInUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) ? url.toString() : null
  } catch {
    return null
  }
}

function addBusinessDays(start: Date, days: number) {
  const date = new Date(start)
  let added = 0
  while (added < days) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) added += 1
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
