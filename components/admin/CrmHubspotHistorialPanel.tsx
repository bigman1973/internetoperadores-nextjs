'use client'
import { useState } from 'react'

type Resumen = { detectados: number; importables: number; nuevos: number; yaImportados: number; excluidosLFDeal: number; sinFichaLocal: number; noIO: number }
type Resultado = {
  modo: 'simular' | 'importar'
  resumen: Record<string, Resumen>
  errores: Record<string, string>
  consentimientos: { contactosIO: number; porEstado: Record<string, number>; conBajaPorTipo: number; conRebote: number; guardados: number }
  importados: { actividades: number; tareas: number; relacionesContacto: number }
}
const ETIQUETAS: Record<string, string> = { notes: 'Notas', emails: 'Correos', meetings: 'Reuniones', tasks: 'Tareas' }

export default function CrmHubspotHistorialPanel() {
  const [cargando, setCargando] = useState<'simular' | 'importar' | null>(null)
  const [res, setRes] = useState<Resultado | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function lanzar(modo: 'simular' | 'importar') {
    if (modo === 'importar' && !window.confirm('Se importarán al panel las notas, correos, reuniones, tareas y consentimientos mostrados. No se escribe nada en HubSpot. ¿Continuar?')) return
    setCargando(modo); setError(null)
    try {
      const r = await fetch('/api/admin/crm/hubspot/historial', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modo, confirmar: modo === 'importar' }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`)
      setRes(j)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') } finally { setCargando(null) }
  }

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-3">
        <button onClick={() => lanzar('simular')} disabled={cargando !== null} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{cargando === 'simular' ? 'Leyendo HubSpot…' : '1. Simular'}</button>
        <button onClick={() => lanzar('importar')} disabled={cargando !== null || res?.modo !== 'simular'} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{cargando === 'importar' ? 'Importando…' : '2. Importar al panel'}</button>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {res && (
        <div className="space-y-4 text-sm">
          <p className="font-medium">{res.modo === 'simular' ? 'Simulación (no se ha escrito nada)' : `Importado: ${res.importados.actividades} actividades, ${res.importados.tareas} tareas, ${res.consentimientos.guardados} consentimientos`}</p>
          <table className="min-w-full divide-y divide-gray-200">
            <thead><tr className="text-left text-gray-500"><th className="py-1 pr-4">Tipo</th><th className="pr-4">En HubSpot</th><th className="pr-4">De IO</th><th className="pr-4">Nuevos</th><th className="pr-4">Ya en el panel</th><th className="pr-4">LFDeal (excluidos)</th><th className="pr-4">Sin ficha</th><th>No IO</th></tr></thead>
            <tbody>{Object.entries(res.resumen).map(([k, r]) => (
              <tr key={k}><td className="py-1 pr-4">{ETIQUETAS[k] || k}{res.errores[k] ? ' ⚠' : ''}</td><td className="pr-4">{r.detectados}</td><td className="pr-4">{r.importables}</td><td className="pr-4">{r.nuevos}</td><td className="pr-4">{r.yaImportados}</td><td className="pr-4">{r.excluidosLFDeal}</td><td className="pr-4">{r.sinFichaLocal}</td><td>{r.noIO}</td></tr>
            ))}</tbody>
          </table>
          {Object.keys(res.errores).length > 0 && <ul className="text-amber-700">{Object.entries(res.errores).map(([k, m]) => <li key={k}>{ETIQUETAS[k] || k}: {m}</li>)}</ul>}
          <p>Consentimientos (contactos de IO: {res.consentimientos.contactosIO}): {Object.entries(res.consentimientos.porEstado).map(([k, v]) => `${k} ${v}`).join(' · ')} · con baja por tipo {res.consentimientos.conBajaPorTipo} · con rebote {res.consentimientos.conRebote}</p>
        </div>
      )}
    </section>
  )
}
