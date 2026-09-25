'use client'

import { useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

const SEGMENTS = [
  { value: '', label: 'Por clasificar' },
  { value: 'PARTICULAR', label: 'Particular' },
  { value: 'EMPRESA', label: 'Empresa' },
  { value: 'PARTNER', label: 'Partner' },
]

type Props = {
  id: string
  initialSegment: string | null
  isCustomer: boolean
  customerSegment?: string | null
}

export default function CrmContactoSettings({ id, initialSegment, isCustomer, customerSegment }: Props) {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && !isCustomer && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const [segmentoCrm, setSegmentoCrm] = useState(initialSegment || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/crm/contactos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentoCrm: segmentoCrm || null }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar.')
      setMessage('Clasificación guardada. Se mantendrá al actualizar las listas de HubSpot.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (isCustomer) {
    return <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold text-gray-900">Área CRM</h2><p className="mt-1 text-sm leading-6 text-gray-600">Este contacto ya es cliente y hereda automáticamente la clasificación <strong>{customerSegment || 'de su ficha de cliente'}</strong>. Para cambiarla, utiliza la ficha del cliente.</p></section>
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-gray-900">Clasificación del lead</h2>
      <p className="mt-1 text-sm leading-6 text-gray-500">Indica si corresponde a Particulares, Empresas o Partners. Esta clasificación no cambia sus listas ni modifica HubSpot.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-medium text-gray-700">Área CRM<select value={segmentoCrm} onChange={(event) => setSegmentoCrm(event.target.value)} disabled={!canWrite} className="mt-1 block min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100">{SEGMENTS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}</select></label>
        {canWrite && <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"><CheckIcon className="h-5 w-5" />{saving ? 'Guardando…' : 'Guardar clasificación'}</button>}
      </div>
      {!canWrite && <p className="mt-3 text-sm text-gray-500">Modo lectura: no puedes cambiar la clasificación.</p>}
      {message && <p className="mt-3 text-sm text-gray-600">{message}</p>}
    </section>
  )
}
