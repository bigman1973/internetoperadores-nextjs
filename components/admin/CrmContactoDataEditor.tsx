'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowPathIcon,
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
}

const PRIMARY_FIELDS = [
  'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', CRM_BUSINESS_UNIT_PROPERTY, 'jobtitle', 'website',
  'address', 'address2', 'city', 'state', 'zip', 'country', 'lifecyclestage', 'hs_lead_status',
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
}: CrmContactDataEditorProps) {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const source = useMemo(() => normalizeRecord(sourceProperties), [sourceProperties])
  const [locals, setLocals] = useState<Record<string, string | null>>(normalizeRecord(localProperties))
  const [values, setValues] = useState<Record<string, string | null>>({ ...source, ...normalizeRecord(localProperties) })
  const [notes, setNotes] = useState(initialNotes)
  const [savedNotes, setSavedNotes] = useState(initialNotes)
  const [version, setVersion] = useState(initialVersion)
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())
  const [visibleNames, setVisibleNames] = useState(() => new Set([
    ...PRIMARY_FIELDS,
    ...definitions.filter((property) => hasValue(values[property.name])).map((property) => property.name),
    ...Object.keys(localProperties),
  ]))
  const [propertySearch, setPropertySearch] = useState('')
  const [selectedProperty, setSelectedProperty] = useState('')
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(['essential']))
  const [showEmpty, setShowEmpty] = useState(false)
  const [showTechnical, setShowTechnical] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const hasDraft = dirtyFields.size > 0 || notes !== savedNotes

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
      if (!window.confirm('Hay cambios sin guardar en la ficha. ¿Quieres salir y descartarlos?')) {
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
    setEditingSection(definition && PRIMARY_FIELD_SET.has(definition.name) ? 'essential' : definition?.groupName || 'otros')
    setSelectedProperty('')
    setPropertySearch('')
  }

  const restore = (name: string) => {
    setValues((current) => ({ ...current, [name]: source[name] ?? null }))
    setLocals((current) => {
      const next = { ...current }
      delete next[name]
      return next
    })
    setDirtyFields((current) => new Set([...current, name]))
  }

  const cancelSection = (sectionName: string, properties: CrmContactPropertyDefinition[]) => {
    const names = new Set(properties.map((property) => property.name))
    setValues((current) => {
      const next = { ...current }
      for (const name of names) next[name] = Object.prototype.hasOwnProperty.call(locals, name) ? locals[name] : source[name] ?? null
      return next
    })
    setDirtyFields((current) => new Set([...current].filter((name) => !names.has(name))))
    if (sectionName === 'notes') setNotes(savedNotes)
    setEditingSection(null)
    setMessage(null)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const editableValues = Object.fromEntries([...dirtyFields].map((name) => [name, values[name] ?? null]))
      const response = await fetch(`/api/admin/crm/contactos/${id}/datos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: editableValues, notasInternas: notes, version, sourceSyncedAt }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar la información.')
      const nextLocals = normalizeRecord(data.localProperties)
      setLocals(nextLocals)
      setValues({ ...source, ...nextLocals })
      setVersion(Number(data.version ?? version))
      setSavedNotes(notes)
      setDirtyFields(new Set())
      setEditingSection(null)
      setMessage({ type: 'success', text: data.unchanged ? 'No había cambios pendientes.' : 'Cambios guardados. El valor original de HubSpot permanece disponible.' })
      return true
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la información.' })
      return false
    } finally {
      setSaving(false)
    }
  }

  const refreshFromHubspot = async () => {
    setSyncing(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${id}/hubspot`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo actualizar la ficha desde HubSpot.')
      window.location.reload()
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo actualizar la ficha desde HubSpot.' })
      setSyncing(false)
    }
  }

  const renderSection = (sectionName: string, title: string, description: string, properties: CrmContactPropertyDefinition[]) => {
    const isEditing = editingSection === sectionName
    const visibleProperties = properties.filter((property) => showEmpty || hasValue(values[property.name]) || Object.prototype.hasOwnProperty.call(locals, property.name))
    return (
      <details
        key={sectionName}
        className="group rounded-2xl border border-gray-200 bg-white shadow-sm"
        open={isEditing || expandedSections.has(sectionName)}
        onToggle={(event) => {
          if (isEditing) return
          const nextOpen = event.currentTarget.open
          setExpandedSections((current) => {
            if (current.has(sectionName) === nextOpen) return current
            const next = new Set(current)
            if (nextOpen) next.add(sectionName)
            else next.delete(sectionName)
            return next
          })
        }}
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600">{visibleProperties.length}</span>
            <ChevronDownIcon className="h-5 w-5 text-gray-400 transition-transform duration-200 group-open:rotate-180" />
          </div>
        </summary>
        <div className="border-t border-gray-100 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-500">{isEditing ? 'Modifica únicamente los datos necesarios y guarda esta sección.' : 'Vista de lectura. Los campos vacíos permanecen ocultos.'}</p>
            {canWrite && !isEditing && editingSection === null && <button type="button" onClick={() => setEditingSection(sectionName)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 transition hover:border-orange-300 hover:text-orange-800 active:scale-[0.97]"><PencilSquareIcon className="h-4 w-4" />Editar sección</button>}
          </div>

          {visibleProperties.length === 0 && !isEditing ? (
            <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No hay datos informados en esta sección.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(isEditing ? properties : visibleProperties).map((property) => isEditing ? (
                <PropertyField
                  key={property.name}
                  property={property}
                  value={values[property.name] ?? ''}
                  sourceValue={source[property.name] ?? null}
                  overridden={Object.prototype.hasOwnProperty.call(locals, property.name)}
                  disabled={!canWrite}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, [property.name]: value }))
                    setDirtyFields((current) => new Set([...current, property.name]))
                  }}
                  onRestore={() => restore(property.name)}
                />
              ) : (
                <PropertyValue
                  key={property.name}
                  property={property}
                  value={values[property.name] ?? null}
                  sourceValue={source[property.name] ?? null}
                  overridden={Object.prototype.hasOwnProperty.call(locals, property.name)}
                />
              ))}
            </div>
          )}

          {isEditing && (
            <div className="mt-5 flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => cancelSection(sectionName, properties)} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><XMarkIcon className="h-5 w-5" />Cancelar</button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"><CheckIcon className="h-5 w-5" />{saving ? 'Guardando…' : 'Guardar sección'}</button>
            </div>
          )}
        </div>
      </details>
    )
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900">Datos del contacto</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">Consulta primero y edita solo la sección que necesites. Los campos vacíos y técnicos no ocupan espacio salvo que decidas mostrarlos.</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-600">
              {fullPropertiesAt && <span className="rounded-full bg-gray-100 px-2.5 py-1">HubSpot: {new Date(fullPropertiesAt).toLocaleString('es-ES')}</span>}
              {(updatedAt || updatedBy) && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">Edición local: {updatedAt ? new Date(updatedAt).toLocaleString('es-ES') : ''}{updatedBy ? ` · ${updatedBy}` : ''}</span>}
              {Object.keys(locals).length > 0 && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">{Object.keys(locals).length} {Object.keys(locals).length === 1 ? 'dato modificado' : 'datos modificados'}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setShowEmpty((current) => !current)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">{showEmpty ? 'Ocultar campos vacíos' : 'Mostrar campos vacíos'}</button>
            {canWrite && <button type="button" onClick={refreshFromHubspot} disabled={syncing || editingSection !== null} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Actualizando…' : 'Actualizar desde HubSpot'}</button>}
          </div>
        </div>
      </section>

      {syncError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">No se pudo completar ahora la lectura de HubSpot: {syncError}. Los datos ya disponibles y las modificaciones locales se mantienen.</div>}
      {message && <div role={message.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-xl border p-4 text-sm leading-6 ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{message.text}</div>}

      {definitions.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Todavía no se ha importado el catálogo completo de campos. Utiliza <strong>Actualizar desde HubSpot</strong> o completa la importación desde el directorio de Contactos.</div>
      ) : (
        <>
          {renderSection('essential', 'Datos esenciales', 'Identificación, contacto, empresa, ubicación y estado comercial.', primaryProperties)}
          {groups.map(([groupName, properties]) => renderSection(groupName, groupLabel(groupName), groupDescription(groupName), properties))}

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Notas internas</h3>
                <p className="mt-1 text-xs leading-5 text-gray-500">Contexto comercial y próximos pasos visibles únicamente dentro del panel.</p>
              </div>
              {canWrite && editingSection === null && <button type="button" onClick={() => setEditingSection('notes')} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:border-orange-300 hover:text-orange-800"><PencilSquareIcon className="h-4 w-4" />Editar notas</button>}
            </div>
            {editingSection === 'notes' ? (
              <div className="mt-4">
                <label htmlFor="crm-contact-notes" className="sr-only">Notas internas</label>
                <textarea id="crm-contact-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="Contexto comercial, próximos pasos, preferencias o cualquier información útil para el equipo…" className="block w-full rounded-xl border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
                {notes !== savedNotes && <span className="mt-2 block text-xs font-semibold text-blue-700">Cambio pendiente de guardar</span>}
                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => cancelSection('notes', [])} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700"><XMarkIcon className="h-5 w-5" />Cancelar</button>
                  <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"><CheckIcon className="h-5 w-5" />{saving ? 'Guardando…' : 'Guardar notas'}</button>
                </div>
              </div>
            ) : <p className="mt-4 whitespace-pre-wrap rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-700">{savedNotes || 'No hay notas internas todavía.'}</p>}
          </section>

          {canWrite && editingSection === null && (
            <section className="rounded-2xl border border-dashed border-orange-300 bg-orange-50/40 p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-gray-900">Añadir otro dato a la ficha</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">Busca cualquiera de los campos configurados en la cuenta de HubSpot. Se añadirá a su sección correspondiente.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="relative">
                  <span className="sr-only">Buscar campo</span>
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} placeholder="Buscar campo…" className="min-h-11 w-full rounded-lg border-gray-300 pl-10 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
                </label>
                <select aria-label="Campo a añadir" value={selectedProperty} onChange={(event) => setSelectedProperty(event.target.value)} className="min-h-11 min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                  <option value="">Selecciona un campo</option>
                  {available.map((property) => <option key={property.name} value={property.name}>{property.label}</option>)}
                </select>
                <button type="button" onClick={addProperty} disabled={!selectedProperty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-4 text-sm font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"><PlusIcon className="h-5 w-5" />Añadir</button>
              </div>
            </section>
          )}

          {readOnlyWithValue.length > 0 && (
            <section className="rounded-2xl border border-gray-200 bg-gray-50">
              <button type="button" onClick={() => setShowTechnical((current) => !current)} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-sm font-semibold text-gray-700 sm:px-5">
                <span>Datos calculados y técnicos de HubSpot ({readOnlyWithValue.length.toLocaleString('es-ES')})</span>
                <ChevronDownIcon className={`h-5 w-5 transition-transform ${showTechnical ? 'rotate-180' : ''}`} />
              </button>
              {showTechnical && <div className="grid gap-3 border-t border-gray-200 p-4 md:grid-cols-2 xl:grid-cols-3 sm:p-5">{readOnlyWithValue.map((property) => <PropertyValue key={property.name} property={property} value={values[property.name] ?? null} sourceValue={source[property.name] ?? null} overridden={false} />)}</div>}
            </section>
          )}
        </>
      )}

      {!canWrite && <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">Modo lectura: puedes consultar toda la información, pero no modificarla.</p>}
    </div>
  )
}

function PropertyValue({ property, value, sourceValue, overridden }: { property: CrmContactPropertyDefinition; value: string | null; sourceValue: string | null; overridden: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3.5 ${overridden ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 bg-gray-50/80'}`}>
      <p className="text-xs font-medium leading-5 text-gray-500">{property.label}</p>
      <p className="mt-1 break-words text-sm font-semibold leading-6 text-gray-900">{formatValue(value, property)}</p>
      {overridden && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-semibold text-blue-700">Modificado en el panel</summary>
          <div className="mt-2 rounded-lg border border-blue-100 bg-white p-2.5 leading-5 text-gray-600">
            <span className="font-medium text-gray-700">Valor de HubSpot:</span> {formatValue(sourceValue, property)}
          </div>
        </details>
      )}
    </div>
  )
}

function PropertyField({ property, value, sourceValue, overridden, disabled, onChange, onRestore }: { property: CrmContactPropertyDefinition; value: string | null; sourceValue: string | null; overridden: boolean; disabled: boolean; onChange: (value: string | null) => void; onRestore: () => void }) {
  const options = property.options.filter((option) => !option.hidden && option.value != null)
  const common = 'mt-1 block min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100'
  const inputId = `crm-property-${property.name}`
  return (
    <div className={`min-w-0 rounded-xl border p-3.5 text-sm font-medium text-gray-700 ${overridden ? 'border-blue-200 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
      <label htmlFor={inputId}>{property.label}</label>
      {property.fieldType === 'textarea' ? (
        <textarea id={inputId} value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={3} className={common} />
      ) : property.fieldType === 'checkbox' && options.length > 0 ? (
        <select id={inputId} multiple value={(value || '').split(';').filter(Boolean)} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value).join(';') || null)} disabled={disabled} className={`${common} min-h-28`}>{options.sort(optionSort).map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>
      ) : options.length > 0 ? (
        <select id={inputId} value={value || ''} onChange={(event) => onChange(event.target.value || null)} disabled={disabled} className={common}><option value="">Sin informar</option>{options.sort(optionSort).map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>
      ) : (
        <input id={inputId} type={property.type === 'number' ? 'number' : property.type === 'datetime' ? 'datetime-local' : property.type === 'date' ? 'date' : property.fieldType === 'phonenumber' ? 'tel' : property.name === 'email' ? 'email' : 'text'} value={formatInputValue(value, property)} onChange={(event) => onChange(parseInputValue(event.target.value, property))} disabled={disabled} className={common} />
      )}
      {property.description && <span className="mt-1 block text-xs font-normal leading-5 text-gray-500">{property.description}</span>}
      {overridden && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-blue-700">Modificado en el panel</span><button type="button" onClick={onRestore} disabled={disabled} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-blue-200 bg-white px-2 font-semibold text-blue-700 hover:bg-blue-50 disabled:hidden"><ArrowUturnLeftIcon className="h-3.5 w-3.5" />Restaurar HubSpot</button><span className="w-full font-normal text-gray-500">Original: {formatValue(sourceValue, property)}</span></div>}
    </div>
  )
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
