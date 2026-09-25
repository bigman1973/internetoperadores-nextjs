'use client'

import { useState } from 'react'
import { CheckIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

const SEGMENTS = [
  { value: '', label: 'Sin asignar' },
  { value: 'PARTICULAR', label: 'Particulares' },
  { value: 'EMPRESA', label: 'Empresas' },
  { value: 'PARTNER', label: 'Partners' },
]

const PURPOSES = [
  { value: 'SIN_CLASIFICAR', label: 'Sin clasificar' },
  { value: 'COMERCIAL', label: 'Seguimiento comercial' },
  { value: 'CAPTACION', label: 'Captación' },
  { value: 'NEWSLETTER', label: 'Newsletter / comunicaciones' },
  { value: 'PARTNERS', label: 'Canal Partners' },
  { value: 'SUPRESION', label: 'Exclusión, rebotes o bajas' },
  { value: 'OPERATIVA', label: 'Operativa interna' },
]

type Props = {
  id: string
  initialSegment: string | null
  initialPurpose: string
  initialNotes: string | null
}

export default function CrmListaSettings({ id, initialSegment, initialPurpose, initialNotes }: Props) {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.listas', 'escritura'))
  const [segmentoCrm, setSegmentoCrm] = useState(initialSegment || '')
  const [proposito, setProposito] = useState(initialPurpose)
  const [notasInternas, setNotasInternas] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/crm/listas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segmentoCrm: segmentoCrm || null, proposito, notasInternas }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo guardar.')
      setMessage('Clasificación guardada. Estos datos son internos y no alteran HubSpot.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Organización dentro del CRM</h2>
        <p className="mt-1 text-sm leading-6 text-gray-500">Clasificación interna independiente de HubSpot. No reclasifica clientes ni modifica los filtros originales.</p>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-gray-700">
          Área CRM
          <select value={segmentoCrm} onChange={(event) => setSegmentoCrm(event.target.value)} disabled={!canWrite} className="mt-1 block min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100">
            {SEGMENTS.map((option) => <option key={option.value || 'none'} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-gray-700">
          Uso principal
          <select value={proposito} onChange={(event) => setProposito(event.target.value)} disabled={!canWrite} className="mt-1 block min-h-11 w-full rounded-lg border-gray-300 bg-white text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100">
            {PURPOSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      <label className="mt-4 block text-sm font-medium text-gray-700">
        Notas internas
        <textarea value={notasInternas} onChange={(event) => setNotasInternas(event.target.value)} disabled={!canWrite} rows={4} placeholder="Qué uso tiene esta lista, quién debe revisarla o qué precauciones requiere…" className="mt-1 block w-full rounded-lg border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 disabled:bg-gray-100" />
      </label>
      {canWrite ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
            <CheckIcon className="h-5 w-5" />
            {saving ? 'Guardando…' : 'Guardar clasificación'}
          </button>
          {message && <p className="text-sm text-gray-600">{message}</p>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">Modo lectura: no puedes cambiar la clasificación interna.</p>
      )}
    </section>
  )
}
