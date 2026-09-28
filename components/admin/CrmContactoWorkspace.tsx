'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BriefcaseIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckBadgeIcon,
  CheckCircleIcon,
  CircleStackIcon,
  ClockIcon,
  DocumentTextIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  PhoneIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import CrmContactoDataEditor, { type CrmContactDataEditorProps } from './CrmContactoDataEditor'
import CrmContactoSettings from './CrmContactoSettings'

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

type Props = {
  contact: {
    id: string
    hubspotId: string
    name: string
    email: string
    phone: string
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
  qualityIssues: string[]
  history: HistoryEntry[]
  dataEditor: CrmContactDataEditorProps
  settings: { initialSegment: string | null; customerSegment: string | null }
}

type TabKey = 'summary' | 'deals' | 'data' | 'lists' | 'history'

export default function CrmContactoWorkspace({ contact, statusNotice, customer, deals, lists, qualityIssues, history, dataEditor, settings }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [hasDraft, setHasDraft] = useState(false)
  const openDeals = deals.filter((deal) => !deal.closed)
  const wonDeals = deals.filter((deal) => deal.closed && deal.won)
  const closedDeals = deals.filter((deal) => deal.closed && !deal.won)
  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: 'summary', label: 'Resumen' },
    { key: 'deals', label: 'Negocios', count: deals.length },
    { key: 'data', label: 'Datos' },
    { key: 'lists', label: 'Listas', count: lists.length },
    { key: 'history', label: 'Historial', count: history.length },
  ]

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length
    const nextTab = tabs[nextIndex]
    setActiveTab(nextTab.key)
    requestAnimationFrame(() => document.getElementById(`crm-contact-tab-${nextTab.key}`)?.focus())
  }

  return (
    <main className="space-y-5 px-1 py-1 sm:px-2">
      <Link href="/admin/crm/contactos" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-500 hover:text-orange-700"><ArrowLeftIcon className="h-4 w-4" />Volver a contactos</Link>

      <header className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white p-5 sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-600 text-xl font-bold text-white shadow-sm">{contact.name.trim().charAt(0).toLocaleUpperCase('es-ES') || '?'}</div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="break-words text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">{contact.name}</h1>
                  <StatusBadge isCustomer={contact.isCustomer} />
                  {contact.segmentLabel && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">{contact.segmentLabel}</span>}
                </div>
                <p className="mt-1 break-words text-sm font-medium text-gray-600">{[contact.jobTitle, contact.company].filter(Boolean).join(' · ') || 'Sin empresa o cargo informado'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {contact.units.length > 0 ? contact.units.map((unit) => <span key={unit} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-800 shadow-sm ring-1 ring-orange-200">{unit}</span>) : <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">Sin unidad de negocio</span>}
                </div>
                <p className="mt-3 text-xs text-gray-500">HubSpot #{contact.hubspotId} · {openDeals.length.toLocaleString('es-ES')} {openDeals.length === 1 ? 'negocio abierto' : 'negocios abiertos'} · {lists.length.toLocaleString('es-ES')} {lists.length === 1 ? 'lista' : 'listas'}</p>
              </div>
            </div>

            <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:flex">
              {customer && <Link href={`/admin/clientes/${customer.id}/editar`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700 active:scale-[0.97]">Abrir ficha de cliente <ArrowRightIcon className="h-4 w-4" /></Link>}
              <a href={`https://app-eu1.hubspot.com/contacts/24927923/record/0-1/${contact.hubspotId}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:border-orange-300 hover:text-orange-800 active:scale-[0.97]">Abrir en HubSpot <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a>
            </div>
          </div>
        </div>

        <nav className="overflow-x-auto" aria-label="Secciones de la ficha">
          <div className="flex min-w-max gap-1 px-3 sm:px-5" role="tablist">
            {tabs.map((tab, index) => (
              <button key={tab.key} id={`crm-contact-tab-${tab.key}`} type="button" role="tab" aria-selected={activeTab === tab.key} aria-controls={`crm-contact-panel-${tab.key}`} tabIndex={activeTab === tab.key ? 0 : -1} onKeyDown={(event) => handleTabKeyDown(event, index)} onClick={() => setActiveTab(tab.key)} className={`relative min-h-13 px-3 text-sm font-semibold transition sm:px-4 ${activeTab === tab.key ? 'text-orange-700' : 'text-gray-500 hover:text-gray-900'}`}>
                <span className="inline-flex items-center gap-2">{tab.label}{tab.count != null && <span className={`rounded-full px-2 py-0.5 text-xs ${activeTab === tab.key ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600'}`}>{tab.count.toLocaleString('es-ES')}</span>}</span>
                {activeTab === tab.key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-orange-600" />}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {hasDraft && <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900"><DocumentTextIcon className="h-5 w-5 shrink-0" />Hay cambios sin guardar en la pestaña Datos. Puedes consultar las demás pestañas sin perder el borrador.</div>}

      <div>
        <section role="tabpanel" id="crm-contact-panel-summary" aria-labelledby="crm-contact-tab-summary" tabIndex={0} hidden={activeTab !== 'summary'} className="space-y-5">
            <StatusNotice notice={statusNotice} />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
              <div className="space-y-5">
                <Card title="Datos esenciales" icon={<UserCircleIcon className="h-5 w-5" />} action={<button type="button" onClick={() => setActiveTab('data')} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800">Editar datos <ArrowRightIcon className="h-4 w-4" /></button>}>
                  <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <SummaryField icon={<EnvelopeIcon className="h-4 w-4" />} label="Correo" value={contact.email} breakValue />
                    <SummaryField icon={<PhoneIcon className="h-4 w-4" />} label="Teléfono" value={contact.phone} />
                    <SummaryField icon={<BuildingOffice2Icon className="h-4 w-4" />} label="Empresa" value={contact.company} />
                    <SummaryField icon={<UserCircleIcon className="h-4 w-4" />} label="Cargo" value={contact.jobTitle} />
                    <SummaryField icon={<MapPinIcon className="h-4 w-4" />} label="Localidad" value={contact.city} />
                    <SummaryField icon={<ArrowTopRightOnSquareIcon className="h-4 w-4" />} label="Web" value={contact.website} breakValue />
                  </div>
                </Card>

                <Card title="Negocios abiertos" icon={<BriefcaseIcon className="h-5 w-5" />} action={<button type="button" onClick={() => setActiveTab('deals')} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800">Ver todos <ArrowRightIcon className="h-4 w-4" /></button>}>
                  {openDeals.length === 0 ? <EmptyState text="No hay ningún negocio abierto asociado a este contacto." /> : <div className="space-y-3">{openDeals.slice(0, 3).map((deal) => <CompactDeal key={deal.id} deal={deal} />)}{openDeals.length > 3 && <button type="button" onClick={() => setActiveTab('deals')} className="w-full rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800">Ver {openDeals.length - 3} negocios abiertos más</button>}</div>}
                </Card>

                {contact.notes && <Card title="Nota interna" icon={<DocumentTextIcon className="h-5 w-5" />} action={<button type="button" onClick={() => setActiveTab('data')} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-orange-700">Abrir notas <ArrowRightIcon className="h-4 w-4" /></button>}><p className="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-gray-700">{contact.notes}</p></Card>}
              </div>

              <div className="space-y-5">
                <Card title="Situación comercial" icon={<BriefcaseIcon className="h-5 w-5" />}>
                  <div className="space-y-4">
                    <SummaryField label="Ciclo de vida" value={contact.lifecycle} />
                    <SummaryField label="Estado del lead" value={contact.leadStatus} />
                    <SummaryField label="Propietario" value={contact.owner} />
                    <div><p className="text-xs font-medium text-gray-500">Unidades de negocio</p><div className="mt-2 flex flex-wrap gap-2">{contact.units.length > 0 ? contact.units.map((unit) => <span key={unit} className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800">{unit}</span>) : <span className="text-sm font-semibold text-amber-700">Sin asignar</span>}</div></div>
                  </div>
                </Card>

                <Card title="Calidad del dato" icon={qualityIssues.length === 0 ? <CheckCircleIcon className="h-5 w-5" /> : <ExclamationTriangleIcon className="h-5 w-5" />}>
                  {qualityIssues.length === 0 ? <div className="flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-900"><CheckCircleIcon className="h-5 w-5 shrink-0" /><p><strong>Ficha esencial completa.</strong> No hay incidencias prioritarias que revisar.</p></div> : <ul className="space-y-2">{qualityIssues.map((issue) => <li key={issue} className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm leading-5 text-amber-900"><ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />{issue}</li>)}</ul>}
                </Card>

                <Card title="Resumen comercial" icon={<BanknotesIcon className="h-5 w-5" />}>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Metric value={openDeals.length} label="Abiertos" tone="orange" />
                    <Metric value={wonDeals.length} label="Ganados" tone="green" />
                    <Metric value={closedDeals.length} label="Cerrados" tone="gray" />
                  </div>
                </Card>

                {customer && <Card title="Cliente vinculado" icon={<CheckBadgeIcon className="h-5 w-5" />}><p className="font-semibold text-gray-900">{customer.name}</p><p className="mt-1 text-sm text-gray-600">{customer.active ? 'Cliente activo' : 'Cliente histórico/inactivo'} · {customer.segment}</p><Link href={`/admin/clientes/${customer.id}/editar`} className="mt-4 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-orange-700">Ver ficha de cliente <ArrowRightIcon className="h-4 w-4" /></Link></Card>}
              </div>
            </div>
        </section>

        <section role="tabpanel" id="crm-contact-panel-deals" aria-labelledby="crm-contact-tab-deals" tabIndex={0} hidden={activeTab !== 'deals'}>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <SectionHeader title="Negocios asociados" description="Oportunidades reales de HubSpot, con las abiertas en primer lugar." icon={<BriefcaseIcon className="h-5 w-5" />} />
            {deals.length === 0 ? <div className="p-8"><EmptyState text="No hay ningún negocio asociado en la última sincronización." /></div> : <div className="divide-y divide-gray-100">{deals.map((deal) => <FullDeal key={deal.id} deal={deal} />)}</div>}
          </div>
        </section>

        <section role="tabpanel" id="crm-contact-panel-data" aria-labelledby="crm-contact-tab-data" tabIndex={0} hidden={activeTab !== 'data'} className="space-y-5"><CrmContactoDataEditor {...dataEditor} onDraftChange={setHasDraft} /><CrmContactoSettings id={contact.id} initialSegment={settings.initialSegment} isCustomer={contact.isCustomer} customerSegment={settings.customerSegment} /></section>

        <section role="tabpanel" id="crm-contact-panel-lists" aria-labelledby="crm-contact-tab-lists" tabIndex={0} hidden={activeTab !== 'lists'}>
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <SectionHeader title="Listas a las que pertenece" description="La conversión a cliente no elimina ni altera ninguna pertenencia." icon={<CircleStackIcon className="h-5 w-5" />} />
            {lists.length === 0 ? <div className="p-8"><EmptyState text="No pertenece a ninguna lista activa en la última sincronización." /></div> : <div className="divide-y divide-gray-100">{lists.map((list) => <article key={list.id} className={`p-5 sm:px-6 ${list.suppression ? 'bg-amber-50/50' : ''}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-words font-semibold text-gray-900">{list.name}</p>{list.suppression && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Exclusión / bajas</span>}</div><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500"><span>{list.kind}</span><span>{list.purpose}</span><span>Desde {list.joinedAt || 'fecha no disponible'}</span></div></div><Link href={`/admin/crm/listas/${list.listId}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-orange-700 hover:text-orange-800">Ver lista <ArrowRightIcon className="h-4 w-4" /></Link></div></article>)}</div>}
          </div>
        </section>

        <section role="tabpanel" id="crm-contact-panel-history" aria-labelledby="crm-contact-tab-history" tabIndex={0} hidden={activeTab !== 'history'}>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <SectionHeader title="Historial de modificaciones" description="Cambios realizados dentro del panel, conservando siempre la fuente de HubSpot." icon={<ClockIcon className="h-5 w-5" />} />
              {history.length === 0 ? <div className="p-8"><EmptyState text="Todavía no se han realizado modificaciones locales en esta ficha." /></div> : <div className="divide-y divide-gray-100">{history.map((entry, index) => <article key={`${entry.date}-${index}`} className="p-5 sm:px-6"><div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"><p className="font-semibold text-gray-900">{entry.author}</p><time className="text-xs text-gray-500">{entry.date || 'Fecha no disponible'}</time></div><ul className="mt-3 space-y-2">{entry.changes.map((change, changeIndex) => <li key={`${change.field}-${changeIndex}`} className="rounded-xl bg-gray-50 p-3 text-sm leading-6"><p className="font-semibold text-gray-800">{change.label}</p><p className="mt-1 break-words text-gray-500"><span className="line-through">{change.previous}</span> <ArrowRightIcon className="mx-1 inline h-3.5 w-3.5" /> <span className="font-medium text-gray-800 no-underline">{change.next}</span></p></li>)}</ul></article>)}</div>}
            </section>
            <aside className="space-y-4">
              <Card title="Origen y sincronización" icon={<ArrowPathIcon className="h-5 w-5" />}>
                <div className="space-y-4">
                  <SummaryField label="Actualización del registro" value={contact.sourceUpdatedAt || 'Sin fecha'} />
                  <SummaryField label="Ficha completa de HubSpot" value={contact.fullPropertiesAt || 'Pendiente'} />
                  <SummaryField label="Última edición local" value={contact.localUpdatedAt || 'Sin modificaciones'} />
                  <SummaryField label="Editado por" value={contact.localUpdatedBy || 'No aplicable'} />
                  <SummaryField label="Campos modificados localmente" value={contact.localChanges.toLocaleString('es-ES')} />
                </div>
              </Card>
            </aside>
          </div>
        </section>
      </div>
    </main>
  )
}

function Card({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-gray-900"><span className="text-orange-600">{icon}</span><h2 className="font-semibold">{title}</h2></div>{action}</div>{children}</section>
}

function SectionHeader({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return <div className="border-b border-gray-200 p-5 sm:p-6"><div className="flex items-center gap-2 text-gray-900"><span className="text-orange-600">{icon}</span><h2 className="text-lg font-semibold">{title}</h2></div><p className="mt-1 text-sm leading-6 text-gray-500">{description}</p></div>
}

function SummaryField({ icon, label, value, breakValue = false }: { icon?: React.ReactNode; label: string; value: string; breakValue?: boolean }) {
  return <div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">{icon}{label}</p><p className={`mt-1 text-sm font-semibold leading-6 text-gray-900 ${breakValue ? 'break-all' : 'break-words'}`}>{value || 'Sin informar'}</p></div>
}

function StatusBadge({ isCustomer }: { isCustomer: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isCustomer ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>{isCustomer ? 'Cliente' : 'Lead'}</span>
}

function StatusNotice({ notice }: { notice: Props['statusNotice'] }) {
  const styles = notice.tone === 'green' ? 'border-green-200 bg-green-50 text-green-900' : notice.tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-blue-200 bg-blue-50 text-blue-900'
  const Icon = notice.tone === 'green' ? CheckBadgeIcon : notice.tone === 'amber' ? ExclamationTriangleIcon : UserCircleIcon
  return <div className={`flex gap-3 rounded-2xl border p-4 text-sm leading-6 ${styles}`}><Icon className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>{notice.title}</strong> {notice.text}</p></div>
}

function CompactDeal({ deal }: { deal: Deal }) {
  return <article className="rounded-xl border border-gray-100 bg-gray-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold text-gray-900">{deal.name}</p><p className="mt-1 text-xs text-gray-500">{deal.pipeline} · {deal.stage}</p></div><span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">Abierto</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-gray-600"><span>{deal.amount}</span><span>Cierre: {deal.closeDate || 'sin fecha'}</span></div></article>
}

function FullDeal({ deal }: { deal: Deal }) {
  return <article className="p-5 sm:px-6"><div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-semibold text-gray-900">{deal.name}</h3><DealStatusBadge closed={deal.closed} won={deal.won} /></div><div className="mt-2 flex flex-wrap gap-2 text-xs font-medium"><span className="rounded-full bg-orange-50 px-2.5 py-1 text-orange-800">{deal.pipeline}</span><span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">{deal.stage}</span></div><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600"><span className="inline-flex items-center gap-1.5"><BanknotesIcon className="h-4 w-4" />{deal.amount}</span><span className="inline-flex items-center gap-1.5"><CalendarDaysIcon className="h-4 w-4" />Cierre: {deal.closeDate || 'sin fecha'}</span><span>Propietario: {deal.owner}</span></div></div><a href={`https://app-eu1.hubspot.com/contacts/24927923/record/0-3/${deal.hubspotId}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-800">Abrir en HubSpot <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a></div></article>
}

function DealStatusBadge({ closed, won }: { closed: boolean; won: boolean }) {
  if (!closed) return <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-semibold text-orange-800">Abierto</span>
  if (won) return <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">Ganado</span>
  return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">Perdido / cerrado</span>
}

function Metric({ value, label, tone }: { value: number; label: string; tone: 'orange' | 'green' | 'gray' }) {
  const styles = tone === 'orange' ? 'bg-orange-50 text-orange-800' : tone === 'green' ? 'bg-green-50 text-green-800' : 'bg-gray-100 text-gray-700'
  return <div className={`rounded-xl px-2 py-3 ${styles}`}><p className="text-xl font-bold">{value.toLocaleString('es-ES')}</p><p className="mt-0.5 text-xs font-medium">{label}</p></div>
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-7 text-center text-sm text-gray-500">{text}</div>
}
