'use client'

import { useState } from 'react'
import { ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useRole } from './RoleContext'

export default function CrmContactosDataSyncPanel({ total, initialCompleted, initialFailed }: { total: number; initialCompleted: number; initialFailed: number }) {
  const { hasAreaAccess, isSuperAdmin, isViewingAs } = useRole()
  const canWrite = !isViewingAs && (isSuperAdmin || hasAreaAccess('admin.crm.contactos', 'escritura'))
  const [completed, setCompleted] = useState(initialCompleted)
  const [failed, setFailed] = useState(initialFailed)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)

  const processed = completed + failed
  if (!canWrite && processed >= total && failed === 0) return null
  const percent = total ? Math.min(100, Math.round((processed / total) * 100)) : 100

  const run = async () => {
    setRunning(true)
    setMessage({ type: 'info', text: 'Importando la información completa por lotes. Puedes mantener esta página abierta mientras avanza.' })
    const restart = processed >= total && total > 0
    let imported = restart ? 0 : processed
    if (restart) { setCompleted(0); setFailed(0) }
    try {
      for (let attempt = 0; attempt < 300; attempt += 1) {
        const response = await fetch('/api/admin/crm/contactos/sync-datos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restart: restart && attempt === 0 }),
        })
        const data = await response.json()
        if (!response.ok || !data.success) throw new Error(data.error || 'No se pudo importar el lote de contactos.')
        imported = Math.max(imported, total - Number(data.remaining || 0))
        const failedNow = Number(data.failedTotal || 0)
        setFailed(failedNow)
        setCompleted(Math.max(0, imported - failedNow))
        if (Number(data.remaining || 0) === 0) {
          setMessage({ type: 'success', text: failedNow > 0
            ? `Importación terminada: ${(total - failedNow).toLocaleString('es-ES')} fichas completas y ${failedNow.toLocaleString('es-ES')} contactos ya no disponibles en HubSpot. Se conservan sus datos básicos y sus listas.`
            : `Información completa importada para ${total.toLocaleString('es-ES')} contactos. Ya puedes consultar y ampliar todos los campos disponibles.` })
          setRunning(false)
          return
        }
      }
      throw new Error('La importación ha superado el número de lotes previsto. Puedes reanudarla desde este mismo botón.')
    } catch (error) {
      setMessage({ type: 'error', text: `${error instanceof Error ? error.message : 'La importación se ha interrumpido.'} El progreso guardado no se pierde; pulsa de nuevo para continuar.` })
      setRunning(false)
    }
  }

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><ArrowPathIcon className={`h-5 w-5 text-blue-700 ${running ? 'animate-spin' : ''}`} /><h2 className="font-semibold text-blue-950">Información completa de HubSpot</h2></div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-blue-900">Además de nombre, correo y teléfono, importa propietario, ciclo de vida, estado del lead, sector, dirección y todos los campos personalizados. Es una lectura: no modifica HubSpot ni envía correos.</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${percent}%` }} /></div>
          <p className="mt-2 text-xs font-semibold text-blue-900">{completed.toLocaleString('es-ES')} fichas completas{failed > 0 ? ` · ${failed.toLocaleString('es-ES')} incidencias` : ''} · {processed.toLocaleString('es-ES')} de {total.toLocaleString('es-ES')} procesadas · {percent}%</p>
        </div>
        {canWrite && <button type="button" onClick={run} disabled={running} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"><ArrowPathIcon className={`h-5 w-5 ${running ? 'animate-spin' : ''}`} />{running ? 'Importando…' : processed >= total && total > 0 ? 'Actualizar toda la información' : processed > 0 ? 'Continuar importación' : 'Importar información completa'}</button>}
      </div>
      {message && <div className={`mt-4 flex gap-2 rounded-lg border p-3 text-sm leading-6 ${message.type === 'error' ? 'border-red-200 bg-red-50 text-red-800' : message.type === 'success' ? 'border-green-200 bg-green-50 text-green-800' : 'border-blue-200 bg-white text-blue-800'}`}>{message.type === 'error' ? <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" /> : message.type === 'success' ? <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0" /> : <ArrowPathIcon className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />}<p>{message.text}</p></div>}
    </section>
  )
}
