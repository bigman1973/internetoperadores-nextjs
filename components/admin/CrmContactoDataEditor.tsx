'use client'

import { useMemo, useState } from 'react'
import { CheckIcon, MagnifyingGlassIcon, PlusIcon, ArrowUturnLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

type PropertyDefinition = {
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

type Props = {
  id: string
  sourceProperties: Record<string, string | null>
  localProperties: Record<string, string | null>
  definitions: PropertyDefinition[]
  initialNotes: string
  updatedAt: string | null
  updatedBy: string | null
  history: Array<{ fecha?: string; autor?: string; cambios?: Array<{ campo?: string; anterior?: string | null; nuevo?: string | null }> }>
  fullPropertiesAt: string | null
  syncError?: string | null
  initialVersion: number
}

const PRIMARY_FIELDS = [
  'firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company', 'jobtitle', 'website',
  'address', 'address2', 'city', 'state', 'zip', 'country', 'lifecyclestage', 'hs_lead_status',
]

const GROUP_LABELS: Record<string, string> = {
  contactinformation: 'Información del contacto',
  sales_properties: 'Información comercial',
  contact_activity: 'Actividad y seguimiento',
  conversioninformation: 'Conversiones y captación',
  emailinformation: 'Correo y comunicaciones',
  webanalytics: 'Analítica web',
  socialmediainformation: 'Redes sociales',
}

function normalizeRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, field]) => [key, field == null ? null : String(field)]))
}

export default function CrmContactoDataEditor({ id, sourceProperties, localProperties, definitions, initialNotes, updatedAt, updatedBy, history, fullPropertiesAt, syncError, initialVersion }: Props) {
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
    ...definitions.filter((property) => values[property.name] != null && String(values[property.name]).trim() !== '').map((property) => property.name),
    ...Object.keys(localProperties),
  ]))
  const [propertySearch, setPropertySearch] = useState('')
  const [selectedProperty, setSelectedProperty] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const byName = useMemo(() => new Map(definitions.map((property) => [property.name, property])), [definitions])
  const visibleEditable = definitions
    .filter((property) => visibleNames.has(property.name) && !property.readOnly && !property.calculated && !property.hidden)
    .sort(sortProperties)
  const readOnlyWithValue = definitions
    .filter((property) => !property.hidden && (property.readOnly || property.calculated) && values[property.name] != null && String(values[property.name]).trim() !== '')
    .sort(sortProperties)
  const available = definitions
    .filter((property) => !visibleNames.has(property.name) && !property.readOnly && !property.calculated && !property.hidden)
    .filter((property) => `${property.label} ${property.name}`.toLocaleLowerCase('es-ES').includes(propertySearch.toLocaleLowerCase('es-ES')))
    .sort(sortProperties)
    .slice(0, 80)

  const groups = useMemo(() => {
    const grouped = new Map<string, PropertyDefinition[]>()
    for (const property of visibleEditable) {
      const group = property.groupName || 'otros'
      const rows = grouped.get(group) || []
      rows.push(property)
      grouped.set(group, rows)
    }
    return [...grouped.entries()]
  }, [visibleEditable])

  const addProperty = () => {
    if (!selectedProperty) return
    setVisibleNames((current) => new Set([...current, selectedProperty]))
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

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const editableValues = Object.fromEntries([...dirtyFields].map((name) => [name, values[name] ?? null]))
      const response = await fetch(`/api/admin/crm/contactos/${id}/datos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: editableValues, notasInternas: notes, version }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar la información.')
      setLocals(normalizeRecord(data.localProperties))
      setValues({ ...source, ...normalizeRecord(data.localProperties) })
      setVersion(Number(data.version ?? version))
      setSavedNotes(notes)
      setDirtyFields(new Set())
      setMessage({ type: 'success', text: data.unchanged ? 'No había cambios pendientes.' : 'Información guardada. Tus cambios locales no se perderán al actualizar HubSpot.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la información.' })
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

  return (
    <section className="rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Información completa del contacto</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">Incluye los campos originales de HubSpot y permite ampliar o corregir información dentro del CRM. Los cambios locales quedan diferenciados y se conservan en cada sincronización.</p>
          </div>
          <div className="shrink-0 text-xs text-gray-500 sm:text-right">
            {canWrite && <button type="button" onClick={refreshFromHubspot} disabled={syncing} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"><ArrowPathIcon className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Actualizando…' : 'Actualizar desde HubSpot'}</button>}
            {fullPropertiesAt && <p className="mt-2">Ficha completa: {new Date(fullPropertiesAt).toLocaleString('es-ES')}</p>}
            {(updatedAt || updatedBy) && <p className="mt-1">Edición local: {updatedAt ? new Date(updatedAt).toLocaleString('es-ES') : ''}{updatedBy ? ` · ${updatedBy}` : ''}</p>}
          </div>
        </div>
      </div>

      {syncError && <div className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 sm:m-6">No se pudo completar ahora la lectura de HubSpot: {syncError}. Puedes seguir consultando los datos disponibles y reintentarlo con «Actualizar desde HubSpot».</div>}
      {message && <div className={`mx-5 mt-5 rounded-lg border p-4 text-sm leading-6 sm:mx-6 ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{message.text}</div>}

      {definitions.length === 0 ? (
        <div className="m-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 sm:m-6">Todavía no se ha importado el catálogo completo de campos. Utiliza <strong>Actualizar desde HubSpot</strong> o completa la importación desde el directorio de Contactos.</div>
      ) : (
        <div className="space-y-7 p-5 sm:p-6">
          {groups.map(([groupName, properties]) => (
            <div key={groupName}>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{GROUP_LABELS[groupName] || humanize(groupName)}</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {properties.map((property) => (
                  <PropertyField
                    key={property.name}
                    property={property}
                    value={values[property.name] ?? ''}
                    sourceValue={source[property.name] ?? null}
                    overridden={Object.prototype.hasOwnProperty.call(locals, property.name)}
                    disabled={!canWrite}
                    onChange={(value) => { setValues((current) => ({ ...current, [property.name]: value })); setDirtyFields((current) => new Set([...current, property.name])) }}
                    onRestore={() => restore(property.name)}
                  />
                ))}
              </div>
            </div>
          ))}

          {canWrite && (
            <div className="rounded-xl border border-dashed border-orange-300 bg-orange-50/40 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Añadir otro dato</h3>
              <p className="mt-1 text-xs leading-5 text-gray-500">Busca cualquiera de los campos configurados en vuestra cuenta de HubSpot, incluidos los personalizados.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="relative">
                  <span className="sr-only">Buscar campo</span>
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" />
                  <input value={propertySearch} onChange={(event) => setPropertySearch(event.target.value)} placeholder="Buscar campo…" className="min-h-11 w-full rounded-lg border-gray-300 pl-10 text-gray-900 focus:border-orange-500 focus:ring-orange-500" />
                </label>
                <select value={selectedProperty} onChange={(event) => setSelectedProperty(event.target.value)} className="min-h-11 min-w-0 rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500">
                  <option value="">Selecciona un campo</option>
                  {available.map((property) => <option key={property.name} value={property.name}>{property.label}</option>)}
                </select>
                <button type="button" onClick={addProperty} disabled={!selectedProperty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-4 text-sm font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"><PlusIcon className="h-5 w-5" />Añadir</button>
              </div>
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700">Notas internas<textarea value={notes} onChange={(event) => setNotes(event.target.value)} disabled={!canWrite} rows={5} placeholder="Contexto comercial, próximos pasos, preferencias o cualquier información útil para el equipo…" className="mt-1 block w-full rounded-lg border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" />{notes !== savedNotes && <span className="mt-1 block text-xs font-semibold text-blue-700">Cambio pendiente de guardar</span>}</label>

          {readOnlyWithValue.length > 0 && (
            <details className="rounded-xl border border-gray-200 bg-gray-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700">Ver {readOnlyWithValue.length.toLocaleString('es-ES')} datos calculados o de solo lectura de HubSpot</summary>
              <div className="grid gap-3 border-t border-gray-200 p-4 md:grid-cols-2 xl:grid-cols-3">
                {readOnlyWithValue.map((property) => <div key={property.name} className="rounded-lg bg-white p-3"><p className="text-xs font-medium text-gray-500">{property.label}</p><p className="mt-1 break-words text-sm font-semibold text-gray-900">{formatValue(values[property.name], property)}</p></div>)}
              </div>
            </details>
          )}

          {history.length > 0 && (
            <details className="rounded-xl border border-gray-200 bg-gray-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-700">Historial de modificaciones locales ({history.length.toLocaleString('es-ES')})</summary>
              <div className="max-h-80 divide-y divide-gray-200 overflow-y-auto border-t border-gray-200">
                {[...history].reverse().slice(0, 20).map((entry, index) => (
                  <div key={`${entry.fecha || 'cambio'}-${index}`} className="p-4 text-sm">
                    <p className="font-semibold text-gray-800">{entry.autor || 'Administrador'} <span className="font-normal text-gray-500">· {entry.fecha ? new Date(entry.fecha).toLocaleString('es-ES') : 'Fecha no disponible'}</span></p>
                    <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-600">
                      {(entry.cambios || []).map((change, changeIndex) => <li key={`${change.campo}-${changeIndex}`}><strong>{byName.get(change.campo || '')?.label || humanize(change.campo || 'Dato')}</strong>: {change.anterior || 'Sin informar'} → {change.nuevo || 'Sin informar'}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          )}

          {canWrite ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"><CheckIcon className="h-5 w-5" />{saving ? 'Guardando…' : 'Guardar información'}</button>
            </div>
          ) : <p className="text-sm text-gray-500">Modo lectura: puedes consultar toda la información, pero no modificarla.</p>}
        </div>
      )}
    </section>
  )
}

function PropertyField({ property, value, sourceValue, overridden, disabled, onChange, onRestore }: { property: PropertyDefinition; value: string | null; sourceValue: string | null; overridden: boolean; disabled: boolean; onChange: (value: string | null) => void; onRestore: () => void }) {
  const options = property.options.filter((option) => !option.hidden && option.value != null)
  const common = 'mt-1 block min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100'
  const inputId = `crm-property-${property.name}`
  return (
    <div className="block min-w-0 text-sm font-medium text-gray-700">
      <div className="flex min-h-5 items-start justify-between gap-2"><label htmlFor={inputId}>{property.label}</label>{overridden && <button type="button" onClick={onRestore} disabled={disabled} title="Recuperar el valor original de HubSpot" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 disabled:hidden"><ArrowUturnLeftIcon className="h-3.5 w-3.5" />Original</button>}</div>
      {property.fieldType === 'textarea' ? (
        <textarea id={inputId} value={value || ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} rows={3} className={common} />
      ) : property.fieldType === 'checkbox' && options.length > 0 ? (
        <select id={inputId} multiple value={(value || '').split(';').filter(Boolean)} onChange={(event) => onChange([...event.target.selectedOptions].map((option) => option.value).join(';') || null)} disabled={disabled} className={`${common} min-h-28`}>{options.sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999)).map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>
      ) : options.length > 0 ? (
        <select id={inputId} value={value || ''} onChange={(event) => onChange(event.target.value || null)} disabled={disabled} className={common}><option value="">Sin informar</option>{options.sort((a, b) => (a.displayOrder ?? 9999) - (b.displayOrder ?? 9999)).map((option) => <option key={option.value} value={option.value}>{option.label || option.value}</option>)}</select>
      ) : (
        <input id={inputId} type={property.type === 'number' ? 'number' : property.type === 'datetime' ? 'datetime-local' : property.type === 'date' ? 'date' : property.fieldType === 'phonenumber' ? 'tel' : property.name === 'email' ? 'email' : 'text'} value={formatInputValue(value, property)} onChange={(event) => onChange(parseInputValue(event.target.value, property))} disabled={disabled} className={common} />
      )}
      {property.description && <span className="mt-1 block text-xs font-normal leading-5 text-gray-500">{property.description}</span>}
      {overridden && <span className="mt-1 block text-xs font-semibold text-blue-700">Modificado en el CRM{sourceValue ? ' · conserva original HubSpot' : ''}</span>}
    </div>
  )
}

function sortProperties(a: PropertyDefinition, b: PropertyDefinition) {
  const primaryA = PRIMARY_FIELDS.indexOf(a.name)
  const primaryB = PRIMARY_FIELDS.indexOf(b.name)
  if (primaryA >= 0 || primaryB >= 0) return (primaryA < 0 ? 999 : primaryA) - (primaryB < 0 ? 999 : primaryB)
  return (a.displayOrder ?? 99999) - (b.displayOrder ?? 99999) || a.label.localeCompare(b.label, 'es')
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatValue(value: string | null | undefined, property: PropertyDefinition) {
  if (value == null || value === '') return 'Sin informar'
  const option = property.options.find((item) => item.value === value)
  return option?.label || value
}

function formatInputValue(value: string | null, property: PropertyDefinition) {
  if (!value) return ''
  if (property.type === 'date' || property.type === 'datetime') {
    const numeric = /^\d+$/.test(value) ? Number(value) : NaN
    const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return property.type === 'datetime' ? date.toISOString().slice(0, 16) : date.toISOString().slice(0, 10)
  }
  return value
}

function parseInputValue(value: string, property: PropertyDefinition) {
  if (!value) return null
  if (property.type === 'date') return String(new Date(`${value}T00:00:00.000Z`).getTime())
  if (property.type === 'datetime') return String(new Date(`${value}:00.000Z`).getTime())
  return value
}
