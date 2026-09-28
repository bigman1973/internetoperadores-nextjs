'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, PencilSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'
import { CRM_BUSINESS_UNIT_PROPERTY, crmBusinessUnitLabel } from '@/lib/crm-unidades-negocio'

type Option = { value: string; label: string }

type Props = {
  contactId: string
  initialUnits: string[]
  options: Option[]
  editable: boolean
  version: number
  sourceSyncedAt: string | null
}

export default function CrmBusinessUnitQuickEditor({ contactId, initialUnits, options, editable, version, sourceSyncedAt }: Props) {
  const router = useRouter()
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = editable && !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const allOptions = useMemo(() => {
    const known = new Set(options.map((option) => option.value))
    return [...options, ...initialUnits.filter((unit) => !known.has(unit)).map((unit) => ({ value: unit, label: unit }))]
  }, [initialUnits, options])
  const [savedUnits, setSavedUnits] = useState(initialUnits)
  const [selectedUnits, setSelectedUnits] = useState(initialUnits)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentVersion, setCurrentVersion] = useState(version)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (editing) return
    setSavedUnits(initialUnits)
    setSelectedUnits(initialUnits)
    setCurrentVersion(version)
  }, [editing, initialUnits, version])

  const toggleUnit = (value: string) => {
    setSelectedUnits((current) => current.includes(value) ? current.filter((unit) => unit !== value) : [...current, value])
    setMessage(null)
  }

  const cancel = () => {
    setSelectedUnits(savedUnits)
    setEditing(false)
    setMessage(null)
  }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${contactId}/datos`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          values: { [CRM_BUSINESS_UNIT_PROPERTY]: selectedUnits.length ? selectedUnits.join(';') : null },
          version: currentVersion,
          sourceSyncedAt,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar la unidad de negocio.')
      const nextUnits = Array.isArray(data.businessUnits) ? data.businessUnits.map(String) : selectedUnits
      setSavedUnits(nextUnits)
      setSelectedUnits(nextUnits)
      setCurrentVersion(Number(data.version ?? currentVersion))
      setEditing(false)
      setMessage({ type: 'success', text: data.unchanged ? 'Sin cambios.' : 'Unidad guardada.' })
      router.refresh()
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la unidad de negocio.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-w-48 max-w-sm">
      {!editing ? (
        <>
          <BusinessUnitChips units={savedUnits} options={allOptions} />
          {canWrite && (
            <button type="button" onClick={() => { setSelectedUnits(savedUnits); setEditing(true); setMessage(null) }} className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-700 transition hover:border-orange-300 hover:text-orange-800">
              <PencilSquareIcon className="h-4 w-4" />Editar unidades
            </button>
          )}
          {!editable && <p className="mt-2 text-[11px] leading-4 text-amber-700">Edición pendiente de completar el catálogo de campos.</p>}
        </>
      ) : (
        <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
          <fieldset disabled={saving}>
            <legend className="text-xs font-semibold text-gray-900">Selecciona una o varias</legend>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {allOptions.map((option) => (
                <label key={option.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-orange-100 hover:ring-orange-300">
                  <input type="checkbox" checked={selectedUnits.includes(option.value)} onChange={() => toggleUnit(option.value)} className="rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-2 text-[11px] leading-4 text-gray-500">Puedes dejar el contacto sin unidad o asignarlo a varias empresas del grupo.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"><CheckIcon className="h-4 w-4" />{saving ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" onClick={cancel} disabled={saving} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"><XMarkIcon className="h-4 w-4" />Cancelar</button>
          </div>
        </div>
      )}
      {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs font-medium ${message.type === 'error' ? 'text-red-700' : 'text-green-700'}`}>{message.text}</p>}
    </div>
  )
}

function BusinessUnitChips({ units, options }: { units: string[]; options: Option[] }) {
  if (units.length === 0) return <span className="text-xs font-medium text-amber-700">Sin unidad asignada</span>
  return <div className="flex flex-wrap gap-1">{units.map((unit) => <span key={unit} className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800">{crmBusinessUnitLabel(unit, options)}</span>)}</div>
}
