'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BanknotesIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChatBubbleLeftRightIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleStackIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PhoneIcon,
  PhoneArrowDownLeftIcon,
  PhoneArrowUpRightIcon,
  PlusIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import CrmContactoDataEditor, {
  CrmInlineProperty,
  type CrmContactDataEditorProps,
  type CrmContactPropertyDefinition,
  type CrmContactSaveResult,
} from './CrmContactoDataEditor'
import CrmContactoSettings from './CrmContactoSettings'
import CrmActivityComposer, { type CrmActivityType } from './CrmActivityComposer'
import CrmCallComposer from './CrmCallComposer'
import { useRole } from './RoleContext'


type Deal = {
  id: string
  hubspotId: string
  name: string
  pipeline: string
  stage: string
  amount: string
  closeDate: string | null
  owner: string
  closed: boolean
  won: boolean
}

type ListMembership = {
  id: string
  listId: string
  name: string
  kind: string
  purpose: string
  suppression: boolean
  joinedAt: string | null
}

type HistoryEntry = {
  date: string | null
  author: string
  changes: Array<{ field: string; label: string; previous: string; next: string }>
}

type ContactActivity = {
  id: string
  contactId: string
  type: string
  title: string
  description: string
  date: string
  direction: string | null
  result: string | null
  durationMinutes: number | null
  author: string
  origin: string
  metadata: Record<string, unknown>
  deals: Array<{ id: string; name: string }>
  followUp: { id: string; title: string; dueAt: string; state: string } | null
}

type Props = {
  contact: {
    id: string
    hubspotId: string
    name: string
    email: string
    phone: string
    linkedIn: string
    company: string
    jobTitle: string
    website: string
    city: string
    isCustomer: boolean
    segmentLabel: string | null
    units: string[]
    lifecycle: string
    leadStatus: string
    owner: string
    createdAt: string | null
    sourceUpdatedAt: string | null
    fullPropertiesAt: string | null
    localUpdatedAt: string | null
    localUpdatedBy: string | null
    localChanges: number
    notes: string
  }
  statusNotice: { tone: 'green' | 'blue' | 'amber'; title: string; text: string }
  customer: { id: number; name: string; active: boolean; segment: string } | null
  deals: Deal[]
  lists: ListMembership[]
  activities?: ContactActivity[]
  emailSender: string
  outlookConnection: {
    enabled: boolean
    connected: boolean
    email: string | null
    connectedAt: string | null
    lastError: string | null
  }
  qualityIssues: string[]
  history: HistoryEntry[]
  dataEditor: CrmContactDataEditorProps
  settings: { initialSegment: string | null; customerSegment: string | null }
}

type TabKey = 'summary' | 'activity' | 'advanced'

const QUICK_FIELDS = [
  { name: 'email', icon: <EnvelopeIcon className="h-4 w-4" /> },
  { name: 'phone', icon: <PhoneIcon className="h-4 w-4" /> },
  { name: 'company', icon: <BuildingOffice2Icon className="h-4 w-4" /> },
  { name: 'jobtitle', icon: <UserCircleIcon className="h-4 w-4" /> },
  { name: 'lfgd_business_unit', icon: <BuildingOffice2Icon className="h-4 w-4" /> },
  { name: 'lifecyclestage', icon: <BriefcaseIcon className="h-4 w-4" /> },
  { name: 'hs_lead_status', icon: <CheckBadgeIcon className="h-4 w-4" /> },
]

export default function CrmContactoWorkspace({ contact, statusNotice, customer, deals, lists, activities = [], emailSender, outlookConnection, qualityIssues, history, dataEditor, settings }: Props) {
  const router = useRouter()
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [hasDraft, setHasDraft] = useState(false)
  const [editingQuickField, setEditingQuickField] = useState<string | null>(null)
  const [quickVersion, setQuickVersion] = useState(dataEditor.initialVersion)
  const [quickLocals, setQuickLocals] = useState<Record<string, string | null>>(dataEditor.localProperties)
  const [quickValues, setQuickValues] = useState<Record<string, string | null>>({ ...dataEditor.sourceProperties, ...dataEditor.localProperties })
  const [quickMessage, setQuickMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [callComposerOpen, setCallComposerOpen] = useState(false)
  const [activityMenuOpen, setActivityMenuOpen] = useState(false)
  const [activitySectionMenuOpen, setActivitySectionMenuOpen] = useState(false)
  const [activityComposerType, setActivityComposerType] = useState<CrmActivityType | null>(null)
  const [taskUpdating, setTaskUpdating] = useState<string | null>(null)
  const [openRightCards, setOpenRightCards] = useState(() => new Set(['customer', 'deals', 'lists']))
  const [advancedEditor, setAdvancedEditor] = useState<CrmContactDataEditorProps | null>(null)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedError, setAdvancedError] = useState<string | null>(null)
  const [advancedLoadAttempt, setAdvancedLoadAttempt] = useState(0)
  const [advancedScrollTarget, setAdvancedScrollTarget] = useState<string | null>(null)
  const openDeals = deals.filter((deal) => !deal.closed)
  const definitionsByName = useMemo(() => new Map(dataEditor.definitions.map((definition) => [definition.name, definition])), [dataEditor.definitions])
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'summary', label: 'Resumen' },
    { key: 'activity', label: 'Actividad', count: activities.length + history.length },
    { key: 'advanced', label: 'Información avanzada' },
  ]

  useEffect(() => {
    if (hasDraft || editingQuickField) return
    setQuickVersion(dataEditor.initialVersion)
    setQuickLocals(dataEditor.localProperties)
    setQuickValues({ ...dataEditor.sourceProperties, ...dataEditor.localProperties })
  }, [dataEditor.initialVersion, dataEditor.localProperties, dataEditor.sourceProperties, editingQuickField, hasDraft])

  useEffect(() => {
    if (activeTab !== 'advanced' || advancedEditor) return
    const controller = new AbortController()
    setAdvancedLoading(true)
    setAdvancedError(null)
    void fetch(`/api/admin/crm/contactos/${encodeURIComponent(contact.id)}/datos`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok || !data.success || !data.editor) throw new Error(data.error || 'No se pudo cargar la información avanzada.')
        setAdvancedEditor(data.editor as CrmContactDataEditorProps)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setAdvancedError(error instanceof Error ? error.message : 'No se pudo cargar la información avanzada.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setAdvancedLoading(false)
      })
    return () => controller.abort()
  }, [activeTab, advancedEditor, advancedLoadAttempt, contact.id])

  useEffect(() => {
    if (activeTab !== 'advanced' || !advancedEditor || !advancedScrollTarget) return
    const timer = window.setTimeout(() => {
      document.getElementById(advancedScrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setAdvancedScrollTarget(null)
    }, 50)
    return () => window.clearTimeout(timer)
  }, [activeTab, advancedEditor, advancedScrollTarget])

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    if (!changeTab(nextTab.key)) return
    requestAnimationFrame(() => document.getElementById(`crm-contact-tab-${nextTab.key}`)?.focus())
  }

  const changeTab = (tab: TabKey) => {
    if (hasDraft && tab !== activeTab && !window.confirm('Hay un cambio sin guardar. ¿Quieres descartarlo?')) return false
    setActiveTab(tab)
    return true
  }

  const handleQuickSaved = (data: CrmContactSaveResult) => {
    const locals = data.localProperties || {}
    setQuickLocals(locals)
    setQuickValues({ ...dataEditor.sourceProperties, ...locals })
    setQuickVersion(Number(data.version ?? quickVersion))
    setEditingQuickField(null)
    setHasDraft(false)
    setAdvancedEditor(null)
    setQuickMessage({ type: 'success', text: data.unchanged ? 'El dato ya estaba actualizado.' : 'Dato guardado.' })
    router.refresh()
  }

  const handleAdvancedSaved = (data: CrmContactSaveResult) => {
    const locals = data.localProperties || quickLocals
    setQuickLocals(locals)
    setQuickValues({ ...dataEditor.sourceProperties, ...locals })
    setQuickVersion(Number(data.version ?? quickVersion))
    setHasDraft(false)
    router.refresh()
  }

  const openAdvanced = (targetId?: string) => {
    if (!changeTab('advanced')) return
    if (targetId) setAdvancedScrollTarget(targetId)
  }

  const openActivityComposer = (type: 'LLAMADA' | CrmActivityType) => {
    setActivityMenuOpen(false)
    setActivitySectionMenuOpen(false)
    if (type === 'LLAMADA') setCallComposerOpen(true)
    else setActivityComposerType(type)
  }

  const handleActivityCreated = (type: string, details?: { outlook: boolean }) => {
    const label = activityTypeLabel(type)
    setQuickMessage({ type: 'success', text: type === 'CORREO' ? 'Microsoft 365 ha aceptado el correo y el intento ha quedado registrado en el CRM.' : type === 'REUNION' && details?.outlook ? 'La reunión se ha creado en tu agenda de Outlook y registrado en el CRM.' : `${label} registrada en el CRM.` })
    setActiveTab('activity')
    router.refresh()
  }

  const updateTask = async (taskId: string, state: 'PENDIENTE' | 'COMPLETADA', expectedState: 'PENDIENTE' | 'COMPLETADA') => {
    setTaskUpdating(taskId)
    setQuickMessage(null)
    try {
      const response = await fetch(`/api/admin/crm/tareas/${encodeURIComponent(taskId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, expectedState }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar la tarea.')
      setQuickMessage({ type: 'success', text: state === 'COMPLETADA' ? 'Tarea completada.' : 'Tarea reabierta.' })
      router.refresh()
    } catch (error) {
      setQuickMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo actualizar la tarea.' })
    } finally {
      setTaskUpdating(null)
    }
  }

  return (
    <main className="-m-3 min-h-screen bg-[#f4f6f8] pb-8 sm:-m-5 lg:-m-6">
      <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <Link href="/admin/crm/contactos" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-orange-700"><ArrowLeftIcon className="h-4 w-4" />Contactos</Link>
      </div>

      <header className="border-b border-slate-200 bg-white px-4 pb-0 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 text-xl font-bold text-white shadow-[0_8px_24px_rgba(234,88,12,0.22)]">{contact.name.trim().charAt(0).toLocaleUpperCase('es-ES') || '?'}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{contact.name}</h1>
                <StatusBadge isCustomer={contact.isCustomer} />
                {contact.segmentLabel && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">{contact.segmentLabel}</span>}
              </div>
              <p className="mt-1 text-sm font-medium text-slate-500">{[contact.jobTitle, contact.company].filter((item) => item && item !== 'Sin informar').join(' · ') || 'Sin empresa o cargo informado'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {contact.units.length > 0 ? contact.units.map((unit) => <span key={unit} className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">{unit}</span>) : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Sin unidad de negocio</span>}
              </div>
              <p className="mt-3 text-xs text-slate-400">Referencia #{contact.hubspotId} · {openDeals.length.toLocaleString('es-ES')} {openDeals.length === 1 ? 'negocio abierto' : 'negocios abiertos'} · {lists.length.toLocaleString('es-ES')} {lists.length === 1 ? 'lista' : 'listas'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canWrite && <ActivityMenu open={activityMenuOpen} setOpen={setActivityMenuOpen} onSelect={openActivityComposer} />}
            {customer && <Link href={`/admin/clientes/${customer.id}/editar`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.97]">Abrir cliente <ArrowRightIcon className="h-4 w-4" /></Link>}
          </div>
        </div>

        <nav className="mt-5 overflow-x-auto" aria-label="Secciones del contacto">
          <div className="flex min-w-max gap-7" role="tablist">
            {tabs.map((tab, index) => <button key={tab.key} id={`crm-contact-tab-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls={`crm-contact-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => changeTab(tab.key)} className={`relative min-h-12 pb-3 text-sm font-semibold transition ${activeTab === tab.key ? 'text-orange-700' : 'text-slate-500 hover:text-slate-900'}`}>{tab.label}{tab.count != null && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{tab.count}</span>}{activeTab === tab.key && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-orange-600" />}</button>)}
          </div>
        </nav>
      </header>

      {hasDraft && <div role="status" className="mx-4 mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900 sm:mx-6 lg:mx-8"><DocumentTextIcon className="h-5 w-5 shrink-0" />Hay un cambio sin guardar.</div>}
      {quickMessage && <div role={quickMessage.type === 'error' ? 'alert' : 'status'} className={`mx-4 mt-4 rounded-xl border px-4 py-3 text-sm sm:mx-6 lg:mx-8 ${quickMessage.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{quickMessage.text}</div>}

      <div className="px-4 py-5 sm:px-6 lg:px-8">
        {activeTab === 'summary' && <section role="tabpanel" id="crm-contact-panel-summary" aria-labelledby="crm-contact-tab-summary" tabIndex={0} className="space-y-5">
          <StatusNotice notice={statusNotice} />
          <div className="grid gap-5 xl:grid-cols-[270px_minmax(0,1fr)_300px] 2xl:grid-cols-[300px_minmax(0,1fr)_320px]">
            <aside className="space-y-4">
              <Panel className="overflow-hidden p-0">
                <PanelHeader title="Acerca del contacto" icon={<UserCircleIcon className="h-5 w-5" />} />
                <div className="px-3 pb-3">
                  {QUICK_FIELDS.map((quick) => {
                    const property = definitionsByName.get(quick.name)
                    if (!property) return null
                    return <CrmInlineProperty key={quick.name} id={contact.id} property={property} value={quickValues[quick.name] ?? null} sourceValue={dataEditor.sourceProperties[quick.name] ?? null} overridden={Object.prototype.hasOwnProperty.call(quickLocals, quick.name)} canWrite={canWrite} version={quickVersion} sourceSyncedAt={dataEditor.sourceSyncedAt} editing={editingQuickField === quick.name} disabledByOtherEdit={editingQuickField !== null && editingQuickField !== quick.name} compact icon={quick.icon} onStartEdit={() => { if (hasDraft && editingQuickField !== quick.name && !window.confirm('Hay un cambio sin guardar. ¿Quieres descartarlo?')) return; setEditingQuickField(quick.name); setHasDraft(false); setQuickMessage(null) }} onCancel={() => { setEditingQuickField(null); setHasDraft(false) }} onDraftChange={setHasDraft} onSaved={handleQuickSaved} onError={(text) => setQuickMessage({ type: 'error', text })} />
                  })}
                </div>
                <button type="button" onClick={() => openAdvanced()} className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-4 text-sm font-semibold text-slate-700 transition hover:bg-orange-50 hover:text-orange-800">Ver todas las propiedades <ArrowRightIcon className="h-4 w-4" /></button>
              </Panel>
            </aside>

            <div className="min-w-0 space-y-5">
              <Panel>
                <PanelTitle title="Aspectos destacados" subtitle="Lo más importante para entender la relación de un vistazo." />
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <Highlight label="Ciclo de vida" value={contact.lifecycle} />
                  <Highlight label="Estado del lead" value={contact.leadStatus} />
                  <Highlight label="Última actualización" value={contact.sourceUpdatedAt || 'Sin fecha'} />
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <PanelTitle title="Actividad reciente" subtitle="Conversaciones, tareas y cambios disponibles dentro del panel." />
                  <button type="button" onClick={() => changeTab('activity')} className="shrink-0 text-sm font-semibold text-orange-700 hover:text-orange-800">Ver actividad</button>
                </div>
                <div className="mt-5">
                  {activities.length > 0
                    ? activities.slice(0, 3).map((activity, index) => <ActivityItem key={activity.id} title={activity.title} date={activity.date} text={`${activityMeta(activity)} · ${activity.description}`} first={index === 0} last={index === Math.min(activities.length, 3) - 1} />)
                    : history.length === 0
                      ? <ActivityItem title="Contacto creado" date={contact.createdAt || 'Fecha no disponible'} text="El contacto se incorporó al directorio corporativo." first last />
                      : history.slice(0, 3).map((entry, index) => <ActivityItem key={`${entry.date}-${index}`} title={entry.author} date={entry.date || 'Fecha no disponible'} text={entry.changes.map((change) => `${change.label}: ${change.next}`).join(' · ')} first={index === 0} last={index === Math.min(history.length, 3) - 1} />)}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center justify-between gap-3">
                  <PanelTitle title="Negocios abiertos" subtitle="Oportunidades que todavía requieren seguimiento." />
                  <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800">{openDeals.length}</span>
                </div>
                <div className="mt-5 space-y-3">{openDeals.length === 0 ? <EmptyState text="No hay ningún negocio abierto asociado a este contacto." /> : openDeals.slice(0, 4).map((deal) => <CompactDeal key={deal.id} deal={deal} />)}</div>
              </Panel>
            </div>

            <aside className="space-y-4">
              <AssociationCard id="customer" title="Empresa / cliente" count={customer ? 1 : 0} icon={<BuildingOffice2Icon className="h-5 w-5" />} openCards={openRightCards} setOpenCards={setOpenRightCards}>
                {customer ? <div className="rounded-xl bg-emerald-50 p-3"><p className="font-semibold text-slate-900">{customer.name}</p><p className="mt-1 text-xs text-slate-600">{customer.active ? 'Cliente activo' : 'Cliente histórico'} · {customer.segment}</p><Link href={`/admin/clientes/${customer.id}/editar`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800">Abrir cliente <ArrowRightIcon className="h-4 w-4" /></Link></div> : <SmallEmpty text="No hay cliente asociado." />}
              </AssociationCard>

              <AssociationCard id="deals" title="Negocios" count={deals.length} icon={<BriefcaseIcon className="h-5 w-5" />} openCards={openRightCards} setOpenCards={setOpenRightCards}>
                {deals.length === 0 ? <SmallEmpty text="No hay negocios asociados." /> : <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{deals.map((deal) => <article key={deal.id} className="w-full rounded-xl border border-slate-100 bg-slate-50 p-3 text-left transition hover:border-orange-200 hover:bg-orange-50"><div className="flex items-start justify-between gap-2"><p className="line-clamp-2 text-sm font-semibold text-slate-900">{deal.name}</p><DealStatusBadge deal={deal} /></div><p className="mt-1 text-xs text-slate-500">{deal.pipeline} · {deal.stage}</p><div className="mt-2 space-y-0.5 text-xs text-slate-600"><p className="font-semibold text-slate-700">{deal.amount}</p><p>Propietario: {deal.owner}</p><p>Cierre: {deal.closeDate || 'sin fecha'}</p></div></article>)}</div>}
              </AssociationCard>

              <AssociationCard id="lists" title="Listas" count={lists.length} icon={<CircleStackIcon className="h-5 w-5" />} openCards={openRightCards} setOpenCards={setOpenRightCards}>
                {lists.length === 0 ? <SmallEmpty text="No pertenece a ninguna lista." /> : <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{lists.map((list) => <Link key={list.id} href={`/admin/crm/listas/${list.listId}`} className={`block rounded-xl border p-3 transition hover:border-orange-200 ${list.suppression ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}><div className="flex flex-wrap items-center gap-1.5"><p className="line-clamp-2 text-sm font-semibold text-slate-900">{list.name}</p>{list.suppression && <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">Exclusión / bajas</span>}</div><p className="mt-1 text-xs text-slate-500">{list.kind} · {list.purpose}</p><p className="mt-1 text-[11px] text-slate-400">Desde {list.joinedAt || 'fecha no disponible'}</p></Link>)}</div>}
              </AssociationCard>

              <AssociationCard id="quality" title="Calidad del dato" count={qualityIssues.length} icon={qualityIssues.length ? <ExclamationTriangleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />} openCards={openRightCards} setOpenCards={setOpenRightCards} defaultOpen={qualityIssues.length > 0}>
                {qualityIssues.length === 0 ? <div className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><CheckCircleIcon className="h-5 w-5 shrink-0" />Ficha esencial completa.</div> : <ul className="space-y-2">{qualityIssues.map((issue) => <li key={issue} className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />{issue}</li>)}</ul>}
              </AssociationCard>
            </aside>
          </div>
        </section>}

        {activeTab === 'activity' && <section role="tabpanel" id="crm-contact-panel-activity" aria-labelledby="crm-contact-tab-activity" tabIndex={0}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <Panel>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <PanelTitle title="Actividad comercial" subtitle="Correos, llamadas, reuniones, notas, tareas y conversaciones registradas en este CRM." />
                  {canWrite && <ActivityMenu open={activitySectionMenuOpen} setOpen={setActivitySectionMenuOpen} onSelect={openActivityComposer} compact />}
                </div>
                <div className="mt-6 space-y-4">
                  {activities.length === 0 ? <EmptyState text="Todavía no hay actividad registrada. Usa “Registrar actividad” para crear la primera." /> : activities.map((activity) => <ActivityCard key={activity.id} activity={activity} canWrite={canWrite} updating={taskUpdating === activity.followUp?.id} onTaskState={updateTask} />)}
                </div>
              </Panel>
              <Panel>
                <PanelTitle title="Cambios de la ficha" subtitle="Trazabilidad de modificaciones sobre los datos del contacto." />
                <div className="mt-6">{history.length === 0 ? <ActivityItem title="Contacto creado" date={contact.createdAt || 'Fecha no disponible'} text="El contacto se incorporó al directorio corporativo." first last /> : history.map((entry, index) => <ActivityItem key={`${entry.date}-${index}`} title={entry.author} date={entry.date || 'Fecha no disponible'} text={entry.changes.map((change) => `${change.label}: ${change.previous} → ${change.next}`).join(' · ')} first={index === 0} last={index === history.length - 1} />)}</div>
              </Panel>
            </div>
            <aside className="space-y-4">
              <Panel><PanelTitle title="Seguimientos pendientes" /><div className="mt-4 space-y-3">{activities.filter((activity) => activity.followUp?.state === 'PENDIENTE').length === 0 ? <SmallEmpty text="No hay tareas de seguimiento pendientes." /> : activities.filter((activity) => activity.followUp?.state === 'PENDIENTE').map((activity) => <FollowUpCard key={activity.followUp!.id} activity={activity} canWrite={canWrite} updating={taskUpdating === activity.followUp!.id} onTaskState={updateTask} />)}</div></Panel>
              <Panel><PanelTitle title="Origen y conservación" /><div className="mt-4 space-y-4"><Info label="Creación" value={contact.createdAt || 'Sin fecha'} /><Info label="Actualización del origen" value={contact.sourceUpdatedAt || 'Sin fecha'} /><Info label="Última edición local" value={contact.localUpdatedAt || 'Sin modificaciones'} /><Info label="Editado por" value={contact.localUpdatedBy || 'No aplicable'} /><Info label="Campos modificados" value={contact.localChanges.toLocaleString('es-ES')} /></div></Panel>
              {contact.notes && <Panel><PanelTitle title="Nota interna" /><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{contact.notes}</p></Panel>}
            </aside>
          </div>
        </section>}

        {activeTab === 'advanced' && <section role="tabpanel" id="crm-contact-panel-advanced" aria-labelledby="crm-contact-tab-advanced" tabIndex={0} className="space-y-5">
          {advancedLoading && <AdvancedEditorSkeleton />}
          {advancedError && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="font-semibold">No se ha podido cargar la información avanzada.</p><p className="mt-1">{advancedError}</p><button type="button" onClick={() => setAdvancedLoadAttempt((current) => current + 1)} className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100">Reintentar</button></div>}
          {advancedEditor && <CrmContactoDataEditor {...advancedEditor} onDraftChange={setHasDraft} onRecordChanged={handleAdvancedSaved} />}
          <CrmContactoSettings id={contact.id} initialSegment={settings.initialSegment} isCustomer={contact.isCustomer} customerSegment={settings.customerSegment} />
        </section>}
      </div>
      <CrmCallComposer open={callComposerOpen} contactId={contact.id} contactName={contact.name} contactPhone={contact.phone === 'Sin informar' ? '' : contact.phone} deals={deals} onClose={() => setCallComposerOpen(false)} onCreated={() => handleActivityCreated('LLAMADA')} />
      {activityComposerType && <CrmActivityComposer open type={activityComposerType} contactId={contact.id} contactName={contact.name} contactEmail={contact.email === 'Sin informar' ? '' : contact.email} contactPhone={contact.phone === 'Sin informar' ? '' : contact.phone} contactLinkedIn={contact.linkedIn} senderEmail={emailSender} outlookConnection={outlookConnection} deals={deals} onClose={() => setActivityComposerType(null)} onCreated={handleActivityCreated} />}
    </main>
  )
}

function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>{children}</section>
}

function AdvancedEditorSkeleton() {
  return <div role="status" aria-label="Cargando información avanzada" className="grid animate-pulse gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
    <div className="h-64 rounded-2xl border border-slate-200 bg-white p-4"><div className="h-3 w-28 rounded bg-slate-200" /><div className="mt-4 h-6 w-40 rounded bg-slate-200" /><div className="mt-6 space-y-3">{[1, 2, 3, 4].map((item) => <div key={item} className="h-9 rounded-lg bg-slate-100" />)}</div></div>
    <div className="space-y-4">{[1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl border border-slate-200 bg-white p-5"><div className="h-4 w-44 rounded bg-slate-200" /><div className="mt-4 h-3 w-3/4 rounded bg-slate-100" /></div>)}</div>
    <span className="sr-only">Cargando información avanzada…</span>
  </div>
}

function PanelHeader({ title, icon }: { title: string; icon: React.ReactNode }) {
  return <div className="mb-2 flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-slate-900"><span className="text-orange-600">{icon}</span><h2 className="font-bold">{title}</h2></div>
}

function PanelTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div><h2 className="text-base font-bold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>}</div>
}

function Highlight({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"><p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p><p className="mt-2 text-sm font-bold text-slate-900">{value || 'Sin informar'}</p></div>
}

function ActivityItem({ title, date, text, first = false, last = false }: { title: string; date: string; text: string; first?: boolean; last?: boolean }) {
  return <article className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3 pb-5 last:pb-0"><div className="relative flex justify-center">{!first && <span className="absolute -top-5 bottom-1/2 w-px bg-slate-200" />}{!last && <span className="absolute top-1/2 -bottom-5 w-px bg-slate-200" />}<span className="relative z-10 mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-700"><ClockIcon className="h-4 w-4" /></span></div><div className="rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3"><div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"><p className="font-semibold text-slate-900">{title}</p><time className="text-xs text-slate-400">{date}</time></div><p className="mt-1 text-sm leading-6 text-slate-600">{text}</p></div></article>
}

function ActivityCard({ activity, canWrite, updating, onTaskState }: { activity: ContactActivity; canWrite: boolean; updating: boolean; onTaskState: (id: string, state: 'PENDIENTE' | 'COMPLETADA', expectedState: 'PENDIENTE' | 'COMPLETADA') => void }) {
  const visual = activityVisual(activity)
  const Icon = visual.icon
  const emailTo = stringArray(activity.metadata.para)
  const sender = typeof activity.metadata.remitente === 'string' ? activity.metadata.remitente : null
  const location = typeof activity.metadata.ubicacion === 'string' ? activity.metadata.ubicacion : null
  const outlookWebLink = canWrite && activity.metadata.outlookDisponible === true ? `/api/admin/crm/contactos/${encodeURIComponent(activity.contactId)}/actividades/${encodeURIComponent(activity.id)}/outlook?target=outlook` : null
  const teamsJoinUrl = canWrite && activity.metadata.teamsDisponible === true ? `/api/admin/crm/contactos/${encodeURIComponent(activity.contactId)}/actividades/${encodeURIComponent(activity.id)}/outlook?target=teams` : null
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
    <div className="flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${visual.style}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div><p className="font-bold text-slate-950">{activity.title}</p><p className="mt-1 text-xs font-medium text-slate-500">{activity.date} · {activityMeta(activity)} · {activity.author}</p></div>
          <div className="flex shrink-0 flex-wrap gap-1.5"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${resultStyle(activity.type === 'TAREA' && activity.followUp?.state === 'COMPLETADA' ? 'COMPLETADA' : activity.result)}`}>{activityResultLabel(activity)}</span>{activity.origin === 'HUBSPOT' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Importada</span>}</div>
        </div>
        {activity.type === 'CORREO' && <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"><p><strong>De:</strong> {sender || 'Remitente no disponible'}</p><p><strong>Para:</strong> {emailTo.join(', ') || 'Destinatario no disponible'}</p>{(activity.result === 'ACEPTADO_GRAPH' || activity.result === 'ENVIADO') && <p className="font-semibold text-blue-700">Microsoft 365 aceptó el envío; se solicitó guardar copia en Elementos enviados.</p>}{(activity.result === 'ENVIO_INCIERTO' || activity.result === 'ENVIO_PENDIENTE') && <p className="font-semibold text-red-700">Requiere revisión en Elementos enviados antes de repetirlo.</p>}</div>}
        {activity.type === 'REUNION' && (activity.result?.startsWith('CALENDARIO_') || activity.result === 'ERROR_CALENDARIO') && <div className="mt-3 rounded-xl bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-950">{activity.result === 'CALENDARIO_CREADO' && <p className="font-semibold text-violet-700">Evento creado y vinculado con la agenda individual de Outlook.</p>}{(activity.result === 'CALENDARIO_INCIERTO' || activity.result === 'CALENDARIO_PENDIENTE') && <p className="font-semibold text-red-700">Requiere revisión en la agenda antes de repetirlo.</p>}<div className="mt-1 flex flex-wrap gap-3">{outlookWebLink && <a href={outlookWebLink} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 underline decoration-violet-300 underline-offset-2">Abrir en Outlook</a>}{teamsJoinUrl && <a href={teamsJoinUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-violet-700 underline decoration-violet-300 underline-offset-2">Unirse por Teams</a>}</div></div>}
        {activity.result === 'CANAL_PREPARADO' && <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700"><strong>Contenido preparado desde el CRM.</strong> La plataforma externa no ha confirmado apertura ni entrega.</div>}
        {location && <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600"><MapPinIcon className="h-4 w-4" />{location}</p>}
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">{activity.description}</p>
        {activity.deals.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{activity.deals.map((deal) => <span key={deal.id} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">{deal.name}</span>)}</div>}
        {activity.followUp && <div className={`mt-4 flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${activity.followUp.state === 'COMPLETADA' ? 'border-emerald-200 bg-emerald-50' : 'border-blue-200 bg-blue-50'}`}><div className="min-w-0"><p className={`text-xs font-bold ${activity.followUp.state === 'COMPLETADA' ? 'text-emerald-900' : 'text-blue-900'}`}>{activity.followUp.state === 'COMPLETADA' ? 'Seguimiento completado' : 'Próximo seguimiento'}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{activity.followUp.title}</p><p className="mt-1 text-xs text-slate-500">Fecha límite: {activity.followUp.dueAt}</p></div>{canWrite && <button type="button" disabled={updating} onClick={() => onTaskState(activity.followUp!.id, activity.followUp!.state === 'COMPLETADA' ? 'PENDIENTE' : 'COMPLETADA', activity.followUp!.state === 'COMPLETADA' ? 'COMPLETADA' : 'PENDIENTE')} className="min-h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:border-orange-200 hover:text-orange-800 disabled:opacity-50">{updating ? 'Actualizando…' : activity.followUp.state === 'COMPLETADA' ? 'Reabrir' : 'Completar'}</button>}</div>}
      </div>
    </div>
  </article>
}

function FollowUpCard({ activity, canWrite, updating, onTaskState }: { activity: ContactActivity; canWrite: boolean; updating: boolean; onTaskState: (id: string, state: 'PENDIENTE' | 'COMPLETADA', expectedState: 'PENDIENTE' | 'COMPLETADA') => void }) {
  const task = activity.followUp!
  return <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-bold text-slate-900">{task.title}</p><p className="mt-1 text-xs text-blue-800">Vence: {task.dueAt}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{activity.description}</p>{canWrite && <button type="button" disabled={updating} onClick={() => onTaskState(task.id, 'COMPLETADA', 'PENDIENTE')} className="mt-3 min-h-9 w-full rounded-lg bg-white px-3 text-xs font-bold text-blue-800 shadow-sm ring-1 ring-blue-200 hover:bg-blue-100 disabled:opacity-50">{updating ? 'Actualizando…' : 'Marcar como completada'}</button>}</div>
}

function activityMeta(activity: ContactActivity) {
  const direction = activity.direction === 'ENTRANTE' ? 'Entrante' : activity.direction === 'SALIENTE' ? 'Saliente' : null
  const duration = activity.durationMinutes == null ? null : `${activity.durationMinutes.toLocaleString('es-ES')} min`
  return [activityTypeLabel(activity.type), direction, duration].filter(Boolean).join(' · ')
}

function callResultLabel(result: string | null) {
  const labels: Record<string, string> = { CONTACTADO: 'Contactado', SIN_RESPUESTA: 'Sin respuesta', OCUPADO: 'Ocupado', BUZON_DE_VOZ: 'Buzón de voz', NUMERO_INCORRECTO: 'Número incorrecto', OTRO: 'Otro resultado' }
  return result ? labels[result] || result : 'Sin resultado'
}

function activityResultLabel(activity: ContactActivity) {
  if (activity.type === 'LLAMADA') return callResultLabel(activity.result)
  if (activity.type === 'TAREA' && activity.followUp?.state === 'COMPLETADA') return 'Completada'
  const labels: Record<string, string> = {
    ENVIADO: 'Enviado',
    ACEPTADO_GRAPH: 'Aceptado por Microsoft 365',
    ENVIO_PENDIENTE: 'En proceso',
    ENVIO_INCIERTO: 'Revisar envío',
    ERROR_ENVIO: 'No enviado',
    PENDIENTE: 'Pendiente',
    REGISTRADA: 'Registrada',
    CANAL_PREPARADO: 'Preparada',
    CALENDARIO_CREADO: 'Creada en Outlook',
    CALENDARIO_PENDIENTE: 'Creando en Outlook',
    CALENDARIO_INCIERTO: 'Revisar calendario',
    ERROR_CALENDARIO: 'No creada en Outlook',
  }
  return activity.result ? labels[activity.result] || humanizeActivity(activity.result) : 'Registrada'
}

function resultStyle(result: string | null) {
  if (result === 'ERROR_ENVIO' || result === 'ENVIO_INCIERTO' || result === 'ERROR_CALENDARIO' || result === 'CALENDARIO_INCIERTO') return 'bg-red-100 text-red-800'
  if (result === 'PENDIENTE' || result === 'ENVIO_PENDIENTE' || result === 'CALENDARIO_PENDIENTE' || result === 'CANAL_PREPARADO') return 'bg-amber-100 text-amber-800'
  if (result === 'ACEPTADO_GRAPH') return 'bg-blue-100 text-blue-800'
  if (result === 'ENVIADO' || result === 'CONTACTADO' || result === 'REGISTRADA' || result === 'COMPLETADA' || result === 'CALENDARIO_CREADO') return 'bg-emerald-100 text-emerald-800'
  return 'bg-slate-100 text-slate-700'
}

function activityTypeLabel(type: string) {
  const labels: Record<string, string> = {
    LLAMADA: 'Llamada',
    CORREO: 'Correo',
    REUNION: 'Reunión',
    NOTA: 'Nota',
    TAREA: 'Tarea',
    WHATSAPP: 'WhatsApp',
    LINKEDIN: 'LinkedIn',
    SMS: 'SMS',
    CORREO_POSTAL: 'Correo postal',
  }
  return labels[type] || humanizeActivity(type)
}

function activityVisual(activity: ContactActivity) {
  if (activity.type === 'LLAMADA') return { icon: activity.direction === 'ENTRANTE' ? PhoneArrowDownLeftIcon : PhoneArrowUpRightIcon, style: 'bg-orange-100 text-orange-700' }
  if (activity.type === 'CORREO') return { icon: EnvelopeIcon, style: 'bg-blue-100 text-blue-700' }
  if (activity.type === 'REUNION') return { icon: CalendarDaysIcon, style: 'bg-violet-100 text-violet-700' }
  if (activity.type === 'NOTA') return { icon: DocumentTextIcon, style: 'bg-amber-100 text-amber-700' }
  if (activity.type === 'TAREA') return { icon: CheckCircleIcon, style: 'bg-emerald-100 text-emerald-700' }
  return { icon: ChatBubbleLeftRightIcon, style: 'bg-sky-100 text-sky-700' }
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function humanizeActivity(value: string) {
  return value.replace(/_/g, ' ').toLocaleLowerCase('es-ES').replace(/^./, (letter) => letter.toLocaleUpperCase('es-ES'))
}

function ActivityMenu({ open, setOpen, onSelect, compact = false }: { open: boolean; setOpen: React.Dispatch<React.SetStateAction<boolean>>; onSelect: (type: 'LLAMADA' | CrmActivityType) => void; compact?: boolean }) {
  const options: Array<{ type: 'LLAMADA' | CrmActivityType; label: string; detail: string; icon: React.ComponentType<{ className?: string }>; color: string }> = [
    { type: 'CORREO', label: 'Correo', detail: 'Enviar con Outlook', icon: EnvelopeIcon, color: 'bg-blue-100 text-blue-700' },
    { type: 'LLAMADA', label: 'Llamada', detail: 'Entrante o saliente', icon: PhoneIcon, color: 'bg-orange-100 text-orange-700' },
    { type: 'REUNION', label: 'Reunión', detail: 'Crear en Outlook corporativo', icon: CalendarDaysIcon, color: 'bg-violet-100 text-violet-700' },
    { type: 'NOTA', label: 'Nota', detail: 'Contexto interno', icon: DocumentTextIcon, color: 'bg-amber-100 text-amber-700' },
    { type: 'TAREA', label: 'Tarea', detail: 'Seguimiento con vencimiento', icon: CheckCircleIcon, color: 'bg-emerald-100 text-emerald-700' },
    { type: 'WHATSAPP', label: 'WhatsApp', detail: 'Preparar, abrir y registrar', icon: ChatBubbleLeftRightIcon, color: 'bg-green-100 text-green-700' },
    { type: 'LINKEDIN', label: 'LinkedIn', detail: 'Abrir perfil y registrar', icon: ChatBubbleLeftRightIcon, color: 'bg-sky-100 text-sky-700' },
    { type: 'SMS', label: 'SMS', detail: 'Preparar, abrir y registrar', icon: ChatBubbleLeftRightIcon, color: 'bg-indigo-100 text-indigo-700' },
    { type: 'CORREO_POSTAL', label: 'Correo postal', detail: 'Registrar envío físico', icon: DocumentTextIcon, color: 'bg-stone-100 text-stone-700' },
  ]
  return <div className="relative">
    <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 active:scale-[0.97] ${compact ? 'shrink-0' : ''}`}><PlusIcon className="h-4 w-4" />Registrar actividad<ChevronDownIcon className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button>
    {open && <div role="menu" className="absolute right-0 top-full z-40 mt-2 grid w-[min(360px,calc(100vw-2rem))] grid-cols-1 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl sm:grid-cols-2">
      {options.map((option) => { const Icon = option.icon; return <button key={option.type} type="button" role="menuitem" onClick={() => onSelect(option.type)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-slate-50 focus:bg-orange-50 focus:outline-none"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${option.color}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{option.label}</span><span className="block truncate text-[11px] text-slate-500">{option.detail}</span></span></button> })}
    </div>}
  </div>
}

function AssociationCard({ id, title, count, icon, children, openCards, setOpenCards, defaultOpen = true }: { id: string; title: string; count: number; icon: React.ReactNode; children: React.ReactNode; openCards: Set<string>; setOpenCards: React.Dispatch<React.SetStateAction<Set<string>>>; defaultOpen?: boolean }) {
  const isOpen = openCards.has(id) || (defaultOpen && !openCards.has(`closed:${id}`))
  const panelId = `crm-association-${id}`
  return <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]"><button type="button" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenCards((current) => { const next = new Set(current); if (isOpen) { next.delete(id); next.add(`closed:${id}`) } else { next.add(id); next.delete(`closed:${id}`) } return next })} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-slate-50"><span className="flex items-center gap-2 font-bold text-slate-900"><span className="text-orange-600">{icon}</span>{title} <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{count}</span></span><ChevronDownIcon className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>{isOpen && <div id={panelId} className="border-t border-slate-100 p-4">{children}</div>}</section>
}

function DealStatusBadge({ deal }: { deal: Deal }) {
  const label = !deal.closed ? 'Abierto' : deal.won ? 'Ganado' : 'Perdido'
  const style = !deal.closed ? 'bg-orange-100 text-orange-800' : deal.won ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${style}`}>{label}</span>
}

function StatusBadge({ isCustomer }: { isCustomer: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isCustomer ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>{isCustomer ? 'Cliente' : 'Lead'}</span>
}

function StatusNotice({ notice }: { notice: Props['statusNotice'] }) {
  const styles = notice.tone === 'green' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : notice.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'
  const Icon = notice.tone === 'green' ? CheckBadgeIcon : notice.tone === 'amber' ? ExclamationTriangleIcon : UserCircleIcon
  return <div className={`flex gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${styles}`}><Icon className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>{notice.title}</strong> {notice.text}</p></div>
}

function CompactDeal({ deal }: { deal: Deal }) {
  return <article className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 transition hover:border-orange-200 hover:bg-orange-50/50"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-slate-900">{deal.name}</p><p className="mt-1 text-xs text-slate-500">{deal.pipeline} · {deal.stage}</p></div><span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">Abierto</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-slate-600"><span className="inline-flex items-center gap-1"><BanknotesIcon className="h-4 w-4" />{deal.amount}</span><span className="inline-flex items-center gap-1"><CalendarDaysIcon className="h-4 w-4" />{deal.closeDate || 'Sin fecha de cierre'}</span></div></article>
}

function SmallEmpty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs leading-5 text-slate-500">{text}</div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{text}</div>
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || 'Sin informar'}</p></div>
}
