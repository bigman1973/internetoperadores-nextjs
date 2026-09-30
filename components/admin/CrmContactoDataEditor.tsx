'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUturnLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'
import { CRM_BUSINESS_UNIT_PROPERTY } from '@/lib/crm-unidades-negocio'

export type CrmContactPropertyDefinition = {
  name: string
  label: string
  groupName: string | null
  type: string | null
  fieldType: string | null
  description: string | null
  options: Array<{ label?: string; value?: string; hidden?: boolean; displayOrder?: number }>
  readOnly: boolean
  hidden: boolean
  calculated: boolean
  displayOrder: number | null
}

export type CrmContactSaveResult = {
  success: boolean
  unchanged?: boolean
  localProperties?: Record<string, string | null>
  businessUnits?: string[]
  version?: number
  updatedAt?: string | null
  updatedBy?: string | null
}

export type CrmContactDataEditorProps = {
  id: string
  sourceProperties: Record<string, string | null>
  localProperties: Record<string, string | null>
  definitions: CrmContactPropertyDefinition[]
  initialNotes: string
  updatedAt: string | null
  updatedBy: string | null
  fullPropertiesAt: string | null
  sourceSyncedAt: string | null
  syncError?: string | null
  initialVersion: number
  onDraftChange?: (hasDraft: boolean) => void
  onRecordChanged?: (data: CrmContactSaveResult) => void
}

const PRIMARY_FIELDS = [
  'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', CRM_BUSINESS_UNIT_PROPERTY, 'jobtitle', 'website',
  'address', 'address2', 'city', 'state', 'zip', 'country', 'lifecyclestage', 'hs_lead_status', 'hubspot_owner_id',
]

const PRIMARY_FIELD_SET = new Set(PRIMARY_FIELDS)

const GROUP_LABELS: Record<string, string> = {
  contactinformation: 'Información del contacto',
  sales_properties: 'Información comercial',
  contactlcs: 'Ciclo de vida y estado comercial',
  contact_activity: 'Actividad y seguimiento',
  conversioninformation: 'Conversiones y captación',
  analyticsinformation: 'Analítica y procedencia',
  emailinformation: 'Correo y comunicaciones',
  webanalytics: 'Analítica web',
  socialmediainformation: 'Redes sociales',
  deal_information: 'Información de negocios',
  lfdeal_documentos: 'Documentación de LFDeal',
  partner_registration_information: 'Registro de partners',
  facebook_ads_properties: 'Captación desde Meta',
  order_information: 'Pedidos',
  prospecting_agent_information: 'Prospección comercial',
  zoom: 'Zoom',
  contactscripted: 'Automatizaciones',
  otros: 'Otros datos',
}

function normalizeRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, field]) => [key, field == null ? null : String(field)]))
}

export default function CrmContactoDataEditor({
  id,
  sourceProperties,
  localProperties,
  definitions,
  initialNotes,
  updatedAt,
  updatedBy,
  fullPropertiesAt,
  sourceSyncedAt,
  syncError,
  initialVersion,
  onDraftChange,
  onRecordChanged,
}: CrmContactDataEditorProps) {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const source = useMemo(() => normalizeRecord(sourceProperties), [sourceProperties])
  const [locals, setLocals] = useState<Record<string, string | null>>(normalizeRecord(localProperties))
  const [values, setValues] = useState<Record<string, string | null>>({ ...source, ...normalizeRecord(localProperties) })
  const [notes, setNotes] = useState(initialNotes)
  const [savedNotes, setSavedNotes] = useState(initialNotes)
  const [version, setVersion] = useState(initialVersion)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [fieldHasDraft, setFieldHasDraft] = useState(false)
  const [visibleNames, setVisibleNames] = useState(() => new Set([
    ...PRIMARY_FIELDS,
    ...definitions.filter((property) => hasValue(values[property.name])).map((property) => property.name),
    ...Object.keys(localProperties),
  ]))
  const [propertySearch, setPropertySearch] = useState('')
  const [selectedProperty, setSelectedProperty] = useState('')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['essential']))
  const [showEmpty, setShowEmpty] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const hasDraft = fieldHasDraft || (editingField === 'notes' && notes !== savedNotes)

  useEffect(() => {
    onDraftChange?.(hasDraft)
    return () => onDraftChange?.(false)
  }, [hasDraft, onDraftChange])

  useEffect(() => {
    if (!hasDraft) return
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const warnLinkNavigation = (event: MouseEvent) => {
      const target = event.target
      const link = target instanceof Element ? target.closest('a') : null
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return
      if (!window.confirm('Hay un cambio sin guardar. ¿Quieres salir y descartarlo?')) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    document.addEventListener('click', warnLinkNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warnBeforeUnload)
      document.removeEventListener('click', warnLinkNavigation, true)
    }
  }, [hasDraft])

  const editableDefinitions = useMemo(() => definitions
    .filter((property) => (showEmpty || visibleNames.has(property.name)) && !property.readOnly && !property.calculated && !property.hidden)
    .sort(sortProperties), [definitions, showEmpty, visibleNames])

  const primaryProperties = editableDefinitions.filter((property) => PRIMARY_FIELD_SET.has(property.name))
  const groups = useMemo(() => {
    const grouped = new Map<string, CrmContactPropertyDefinition[]>()
    for (const property of editableDefinitions) {
      if (PRIMARY_FIELD_SET.has(property.name)) continue
      const group = property.groupName || 'otros'
      const rows = grouped.get(group) || []
      rows.push(property)
      grouped.set(group, rows)
    }
    return [...grouped.entries()].sort(([groupA], [groupB]) => groupLabel(groupA).localeCompare(groupLabel(groupB), 'es'))
  }, [editableDefinitions])

  const readOnlyWithValue = definitions
    .filter((property) => !property.hidden && (property.readOnly || property.calculated) && hasValue(values[property.name]))
    .sort(sortProperties)

  const available = definitions
    .filter((property) => !visibleNames.has(property.name) && !property.readOnly && !property.calculated && !property.hidden)
    .filter((property) => `${property.label} ${property.name}`.toLocaleLowerCase('es-ES').includes(propertySearch.toLocaleLowerCase('es-ES')))
    .sort(sortProperties)
    .slice(0, 80)

  const addProperty = () => {
    if (!selectedProperty) return
    const definition = definitions.find((property) => property.name === selectedProperty)
    setVisibleNames((current) => new Set([...current, selectedProperty]))
    const sectionName = definition && PRIMARY_FIELD_SET.has(definition.name) ? 'essential' : definition?.groupName || 'otros'
    setExpandedSections((current) => new Set([...current, sectionName]))
    setEditingField(selectedProperty)
    setSelectedProperty('')
    setPropertySearch('')
  }

  const handleSaved = (data: CrmContactSaveResult) => {
    const nextLocals = normalizeRecord(data.localProperties)
    setLocals(nextLocals)
    setValues({ ...source, ...nextLocals })
    setVersion(Number(data.version ?? version))
    setEditingField(null)
    setFieldHasDraft(false)
    setMessage({ type: 'success', text: data.unchanged ? 'El dato ya estaba actualizado.' : 'Dato guardado.' })
    onRecordChanged?.(data)
  }

  const handleSaveError = (text: string) => setMessage({ type: 'error', text })

  const saveNotes = async () => {
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${id}/datos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: {}, notasInternas: notes, version, sourceSyncedAt }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudieron guardar las notas.')
      setSavedNotes(notes)
      setVersion(Number(data.version ?? version))
      setEditingField(null)
      setMessage({ type: 'success', text: data.unchanged ? 'La nota ya estaba actualizada.' : 'Nota guardada.' })
      onRecordChanged?.(data)
    } catch (error) {
      handleSaveError(error instanceof Error ? error.message : 'No se pudieron guardar las notas.')
    }
  }

  const renderSection = (sectionName: string, title: string, description: string, properties: CrmContactPropertyDefinition[]) => {
    const visibleProperties = properties.filter((property) => showEmpty || hasValue(values[property.name]) || Object.prototype.hasOwnProperty.call(locals, property.name))
    const isOpen = expandedSections.has(sectionName) || properties.some((property) => property.name === editingField)
    const panelId = `crm-contact-section-${sectionName.replace(/[^a-z0-9_-]/gi, '-')}`
    return (
      <section key={sectionName} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setExpandedSections((current) => {
            const next = new Set(current)
            if (next.has(sectionName)) next.delete(sectionName)
            else next.add(sectionName)
            return next
          })}
          className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50/80"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-orange-500" />
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{visibleProperties.length}</span>
            </div>
            <p className="mt-1 pl-4.5 text-xs leading-5 text-slate-500">{description}</p>
          </div>
          <ChevronDownIcon className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div id={panelId} className="border-t border-slate-100 px-3 py-2 sm:px-5 sm:py-3">
            {visibleProperties.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-slate-500">No hay datos informados en esta sección.</div>
            ) : (
              <div className="grid gap-x-6 lg:grid-cols-2">
                {visibleProperties.map((property) => (
                  <CrmInlineProperty
                    key={property.name}
                    id={id}
                    property={property}
                    value={values[property.name] ?? null}
                    sourceValue={source[property.name] ?? null}
                    overridden={Object.prototype.hasOwnProperty.call(locals, property.name)}
                    canWrite={canWrite}
                    version={version}
                    sourceSyncedAt={sourceSyncedAt}
                    editing={editingField === property.name}
                    disabledByOtherEdit={editingField !== null && editingField !== property.name}
                    onStartEdit={() => {
                      if (hasDraft && editingField !== property.name && !window.confirm('Hay un cambio sin guardar. ¿Quieres descartarlo?')) return
                      setEditingField(property.name)
                      setFieldHasDraft(false)
                      setMessage(null)
                    }}
                    onCancel={() => {
                      setEditingField(null)
                      setFieldHasDraft(false)
                    }}
                    onDraftChange={setFieldHasDraft}
                    onSaved={handleSaved}
                    onError={handleSaveError}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="self-start xl:sticky xl:top-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-orange-600">Información avanzada</p>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Datos del contacto</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Pasa el cursor por cualquier dato y pulsa el lápiz para editarlo sin abrir un formulario completo.</p>
          <div className="mt-4 space-y-1">
            <SectionLink label="Datos esenciales" active={expandedSections.has('essential')} onClick={() => setExpandedSections((current) => new Set([...current, 'essential']))} />
            {groups.map(([groupName]) => <SectionLink key={groupName} label={groupLabel(groupName)} active={expandedSections.has(groupName)} onClick={() => setExpandedSections((current) => new Set([...current, groupName]))} />)}
          </div>
          <button type="button" onClick={() => setShowEmpty((current) => !current)} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800">
            {showEmpty ? 'Ocultar campos vacíos' : 'Mostrar campos vacíos'}
          </button>
          <div className="mt-4 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-500">
            {fullPropertiesAt && <p>Datos importados: {new Date(fullPropertiesAt).toLocaleString('es-ES')}</p>}
            {(updatedAt || updatedBy) && <p className="mt-1 text-blue-700">Última edición: {updatedAt ? new Date(updatedAt).toLocaleString('es-ES') : ''}{updatedBy ? ` · ${updatedBy}` : ''}</p>}
          </div>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        {syncError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">No se pudo completar la última importación de origen: {syncError}. Los datos ya disponibles y las modificaciones locales se mantienen.</div>}
        {message && <div role={message.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl border px-4 py-3 text-sm ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message.text}</div>}

        {definitions.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Todavía no se ha importado el catálogo completo de campos. Completa la migración temporal desde el directorio de Contactos.</div>
        ) : (
          <>
            {renderSection('essential', 'Datos esenciales', 'Identificación, contacto, empresa, ubicación y estado comercial.', primaryProperties)}
            {groups.map(([groupName, properties]) => renderSection(groupName, groupLabel(groupName), groupDescription(groupName), properties))}

            <section id="crm-contact-notes-card" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-900">Notas internas</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Contexto comercial, acuerdos y próximos pasos del equipo.</p>
                </div>
                {canWrite && editingField !== 'notes' && <button type="button" onClick={() => setEditingField('notes')} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-50"><PencilSquareIcon className="h-3.5 w-3.5" />Editar</button>}
              </div>
              {editingField === 'notes' ? (
                <div className="mt-4">
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} autoFocus placeholder="Contexto comercial, próximos pasos o información útil para el equipo…" className="block w-full rounded-xl border-slate-300 text-slate-900 focus:border-orange-500 focus:ring-orange-500" />
                  <div className="mt-3 flex justify-end gap-2">
                    <button type="button" onClick={() => { setNotes(savedNotes); setEditingField(null) }} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2.5 text-xs font-semibold text-slate-700"><XMarkIcon className="h-3.5 w-3.5" />Cancelar</button>
                    <button type="button" onClick={saveNotes} className="inline-flex h-8 items-center gap-1 rounded-md bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700"><CheckIcon className="h-3.5 w-3.5" />Guardar</button>
                  </div>
                </div>
              ) : <p className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">{savedNotes || 'No hay notas internas todavía.'}</p>}
            </section>

            {canWrite && editingField === null && (
              <section className="rounded-2xl border border-dashed border-orange-200 bg-orange-50/40 p-5">
                <h3 className="text-sm font-semibold text-slate-900">Añadir otro dato</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Busca cualquier campo disponible y se incorporará a su sección.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <label className="relative">
                    <span className="sr-only">Buscar campo</span>
                    <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
                    <input value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} placeholder="Buscar campo…" className="min-h-11 w-full rounded-xl border-slate-300 pl-10 text-slate-900 focus:border-orange-500 focus:ring-orange-500" />
                  </label>
                  <select aria-label="Campo a añadir" value={selectedProperty} onChange={(event) => setSelectedProperty(event.target.value)} className="min-h-11 min-w-0 rounded-xl border-slate-300 bg-white text-slate-900 focus:border-orange-500 focus:ring-orange-500">
                    <option value="">Selecciona un campo</option>
                    {available.map((property) => <option key={property.name} value={property.name}>{property.label}</option>)}
                  </select>
                  <button type="button" onClick={addProperty} disabled={!selectedProperty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"><PlusIcon className="h-5 w-5" />Añadir</button>
                </div>
              </section>
            )}

            {readOnlyWithValue.length > 0 && (
              <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50">
                <button type="button" onClick={() => setShowTechnical((current) => !current)} className="flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left text-sm font-semibold text-slate-700">
                  <span>Datos calculados y técnicos ({readOnlyWithValue.length.toLocaleString('es-ES')})</span>
                  <ChevronDownIcon className={`h-5 w-5 transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
                </button>
                {showTechnical && <div className="grid gap-x-6 border-t border-slate-200 bg-white px-5 py-3 lg:grid-cols-2">{readOnlyWithValue.map((property) => <ReadOnlyProperty key={property.name} property={property} value={values[property.name] ?? null} />)}</div>}
              </section>
            )}
          </>
        )}

        {!canWrite && <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-500">Modo lectura: puedes consultar toda la información, pero no modificarla.</p>}
      </div>
    </div>
  )
}

export function CrmInlineProperty({
  id,
  property,
  value,
  sourceValue,
  overridden,
  canWrite,
  version,
  sourceSyncedAt,
  editing,
  disabledByOtherEdit = false,
  compact = false,
  icon,
  onStartEdit,
  onCancel,
  onDraftChange,
  onSaved,
  onError,
}: {
  id: string
  property: CrmContactPropertyDefinition
  value: string | null
  sourceValue: string | null
  overridden: boolean
  canWrite: boolean
  version: number
  sourceSyncedAt: string | null
  editing: boolean
  disabledByOtherEdit?: boolean
  compact?: boolean
  icon?: React.ReactNode
  onStartEdit: () => void
  onCancel: () => void
  onDraftChange?: (dirty: boolean) => void
  onSaved: (data: CrmContactSaveResult) => void
  onError: (message: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  const dirty = (draft || null) !== (value || null)
  useEffect(() => onDraftChange?.(editing && dirty), [dirty, editing, onDraftChange])

  useEffect(() => {
    if (!editing || !dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty, editing])

  const save = async (nextValue = draft) => {
    if (saving) return
    setSaving(true)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${id}/datos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: { [property.name]: nextValue }, version, sourceSyncedAt }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar el dato.')
      onSaved(data)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo guardar el dato.')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className={`${compact ? 'rounded-xl bg-orange-50/70 p-3' : 'col-span-full my-1 rounded-xl border border-orange-200 bg-orange-50/60 p-3.5'} min-w-0`}>
        <div className="flex items-center gap-2 text-xs font-semibold text-orange-900">{icon}{property.label}</div>
        <PropertyInput property={property} value={draft} disabled={saving} onChange={setDraft} onSubmit={save} />
        {property.description && <p className="mt-1.5 text-xs leading-5 text-slate-500">{property.description}</p>}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-xs text-slate-500">
            {overridden && <span>Original: {formatValue(sourceValue, property)}</span>}
          </div>
          <div className="flex gap-1.5">
            {overridden && <button type="button" onClick={() => { setDraft(sourceValue); void save(sourceValue) }} disabled={saving} title="Restaurar valor original" aria-label={`Restaurar ${property.label} al valor original`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 hover:bg-blue-50"><ArrowUturnLeftIcon className="h-3.5 w-3.5" /></button>}
            <button type="button" onClick={() => { setDraft(value); onCancel() }} disabled={saving} title="Cancelar" aria-label={`Cancelar edición de ${property.label}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><XMarkIcon className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={() => void save()} disabled={saving || !dirty} title="Guardar" aria-label={`Guardar ${property.label}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"><CheckIcon className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      type="button"
      disabled={!canWrite || disabledByOtherEdit}
      onClick={onStartEdit}
      aria-label={canWrite ? `Editar ${property.label}` : undefined}
      className={`${compact ? 'rounded-xl px-3 py-2.5' : 'border-b border-slate-100 px-3 py-3.5'} group relative min-w-0 text-left transition hover:bg-orange-50/50 disabled:cursor-default disabled:hover:bg-transparent`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">{icon}{property.label}{overridden && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Modificado en el panel" />}</span>
      <span className={`mt-1 block break-words text-sm font-semibold leading-5 ${hasValue(value) ? 'text-slate-900' : 'text-slate-400'}`}>{formatValue(value, property)}</span>
      {canWrite && !disabledByOtherEdit && <span className={`absolute inline-flex items-center justify-center bg-white text-orange-700 opacity-100 shadow-sm ring-1 ring-slate-200 transition group-hover:ring-orange-200 sm:opacity-0 sm:group-hover:opacity-100 ${compact ? 'right-1.5 top-1.5 h-6 w-6 rounded-md' : 'right-2 top-2 h-7 w-7 rounded-md'}`}><PencilSquareIcon className="h-3.5 w-3.5" /></span>}
    </button>
  )
}

function PropertyInput({ property, value, disabled, onChange, onSubmit }: { property: CrmContactPropertyDefinition; value: string | null; disabled: boolean; onChange: (value: string | null) => void; onSubmit: (value?: string | null) => void }) {
  const options = property.options.filter((option) => !option.hidden && option.value != null).sort(optionSort)
  const common = 'mt-2 block min-h-11 w-full rounded-xl border-slate-300 bg-white text-sm text-slate-900 shadow-sm focus:border-orange-500 focus:ring-orange-500 disabled:bg-slate-100'
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (property.fieldType !== 'textarea' || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSubmit()
    }
  }

  if (property.fieldType === 'textarea') return <textarea autoFocus value={value || ''} onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown} disabled={disabled} rows={4} className={common} />
  if (property.fieldType === 'checkbox' && options.length > 0) {
    const selected = new Set((value || '').split(';').filter(Boolean))
    return <div className="mt-2 grid gap-2 sm:grid-cols-2">{options.map((option) => {
      const optionValue = String(option.value)
      return <label key={optionValue} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:border-orange-200"><input type="checkbox" checked={selected.has(optionValue)} disabled={disabled} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(optionValue); else next.delete(optionValue); onChange([...next].join(';') || null) }} className="rounded border-slate-300 text-orange-600 focus:ring-orange-500" />{option.label || optionValue}</label>
    })}</div>
  }
  if (options.length > 0) return <select autoFocus value={value || ''} onChange={(event) => onChange(event.target.value || null)} disabled={disabled} className={common}><option value="">Sin informar</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>
  return <input autoFocus type={property.type === 'number' ? 'number' : property.type === 'datetime' ? 'datetime-local' : property.type === 'date' ? 'date' : property.fieldType === 'phonenumber' ? 'tel' : property.name === 'email' ? 'email' : 'text'} value={formatInputValue(value, property)} onChange={(event) => onChange(parseInputValue(event.target.value, property))} onKeyDown={handleKeyDown} disabled={disabled} className={common} />
}

function ReadOnlyProperty({ property, value }: { property: CrmContactPropertyDefinition; value: string | null }) {
  return <div className="border-b border-slate-100 px-3 py-3"><p className="text-xs font-medium text-slate-500">{property.label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{formatValue(value, property)}</p></div>
}

function SectionLink({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${active ? 'bg-orange-50 font-semibold text-orange-800' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>{label}</button>
}

function sortProperties(a: CrmContactPropertyDefinition, b: CrmContactPropertyDefinition) {
  const primaryA = PRIMARY_FIELDS.indexOf(a.name)
  const primaryB = PRIMARY_FIELDS.indexOf(b.name)
  if (primaryA >= 0 || primaryB >= 0) return (primaryA < 0 ? 999 : primaryA) - (primaryB < 0 ? 999 : primaryB)
  return (a.displayOrder ?? 99999) - (b.displayOrder ?? 99999) || a.label.localeCompare(b.label, 'es')
}

function groupLabel(value: string) {
  return GROUP_LABELS[value] || humanize(value)
}

function groupDescription(value: string) {
  if (value === 'sales_properties' || value === 'contactlcs' || value === 'deal_information') return 'Estado, responsable y contexto de la relación comercial.'
  if (value === 'contact_activity') return 'Seguimiento e interacciones registradas para el contacto.'
  if (value === 'conversioninformation' || value === 'analyticsinformation' || value === 'facebook_ads_properties') return 'Procedencia, campañas y conversiones de captación.'
  if (value === 'emailinformation') return 'Preferencias, actividad y estado de las comunicaciones por correo.'
  if (value === 'lfdeal_documentos') return 'Información y documentación específica de LFDeal.'
  return 'Información complementaria disponible para este contacto.'
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function hasValue(value: string | null | undefined) {
  return value != null && String(value).trim() !== ''
}

export function formatCrmPropertyValue(value: string | null | undefined, property: CrmContactPropertyDefinition) {
  return formatValue(value, property)
}

function formatValue(value: string | null | undefined, property: CrmContactPropertyDefinition) {
  if (!hasValue(value)) return 'Sin informar'
  const text = String(value)
  const selected = text.split(';').filter(Boolean).map((item) => property.options.find((option) => option.value === item)?.label || item)
  if (selected.length > 1 || text.includes(';')) return selected.join(', ')
  const option = property.options.find((item) => item.value === text)
  if (option?.label) return option.label
  if (property.type === 'bool') return text === 'true' ? 'Sí' : text === 'false' ? 'No' : text
  if (property.type === 'date' || property.type === 'datetime') {
    const numeric = /^\d+$/.test(text) ? Number(text) : NaN
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(text)
    if (!Number.isNaN(date.getTime())) return property.type === 'date' ? date.toLocaleDateString('es-ES') : date.toLocaleString('es-ES')
  }
  return text
}

function formatInputValue(value: string | null, property: CrmContactPropertyDefinition) {
  if (!value) return ''
  if (property.type === 'date' || property.type === 'datetime') {
    const numeric = /^\d+$/.test(value) ? Number(value) : NaN
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return property.type === 'datetime' ? date.toISOString().slice(0, 16) : date.toISOString().slice(0, 10)
  }
  return value
}

function parseInputValue(value: string, property: CrmContactPropertyDefinition) {
  if (!value) return null
  if (property.type === 'date') return String(new Date(`${value}T00:00:00.000Z`).getTime())
  if (property.type === 'datetime') return String(new Date(`${value}:00.000Z`).getTime())
  return value
}

function optionSort(a: { displayOrder?: number }, b: { displayOrder?: number }) {
  return (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999)
}
