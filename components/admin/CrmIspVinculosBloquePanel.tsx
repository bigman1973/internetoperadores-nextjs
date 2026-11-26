'use client'

import { useState } from 'react'
import type { ResultadoBloque, SimulacionBloque } from '@/lib/area1-isp-bloque'

type Simulacion = SimulacionBloque & { prerrequisito?: 'SIN_MAESTRO' | null }
const API = '/api/admin/crm/isp/vinculos/bloque'

export default function CrmIspVinculosBloquePanel({ production }: { production: boolean }) {
  const [simulacion, setSimulacion] = useState<Simulacion | null>(null)
  const [resultado, setResultado] = useState<ResultadoBloque | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [revisado, setRevisado] = useState(false)
  const [frase, setFrase] = useState('')
  const [error, setError] = useState('')
  const puedeConfirmar = !ocupado && simulacion !== null && simulacion.vinculos > 0
    && simulacion.prerrequisito !== 'SIN_MAESTRO' && /^[a-f0-9]{64}$/.test(simulacion.hash)
    && revisado && frase === 'CONFIRMAR_BLOQUE'

  async function simular() {
    setOcupado(true); setError(''); setSimulacion(null); setResultado(null); setRevisado(false); setFrase('')
    try {
      const response = await fetch(API, { method: 'GET', cache: 'no-store', credentials: 'same-origin', mode: 'same-origin' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'No se pudo simular el bloque.')
      if (!Number.isSafeInteger(body.vinculos) || body.vinculos < 0 || !/^[a-f0-9]{64}$/.test(body.hash)) throw new Error('Simulación no verificable.')
      setSimulacion(body)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo simular el bloque.') }
    finally { setOcupado(false) }
  }

  async function confirmar() {
    if (!puedeConfirmar || !simulacion) return
    const hashEsperado = simulacion.hash
    // One reviewed hash only. Success, failure and lost response all require a
    // fresh simulation; there is no auto retry, batch loop or replay of Stage IDs.
    setOcupado(true); setError(''); setSimulacion(null); setRevisado(false); setFrase('')
    try {
      const response = await fetch(API, { method: 'POST', cache: 'no-store', credentials: 'same-origin', mode: 'same-origin',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmacion: 'CONFIRMAR_BLOQUE', hashEsperado }) })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'No se confirmó el bloque.')
      setResultado(body)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se confirmó el bloque.') }
    finally { setOcupado(false) }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <button type="button" disabled={ocupado} onClick={simular} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {production ? 'Simular Production' : 'Simular bloque'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {simulacion && <div className="space-y-3 text-sm text-slate-700">
        {simulacion.prerrequisito === 'SIN_MAESTRO' && <p role="status" className="font-semibold text-amber-800">SIN_MAESTRO: faltan los datos ISP locales en este entorno. No se puede confirmar. La preparación selectiva de datos requiere su aprobación independiente.</p>}
        <p>Propuestas: {simulacion.vinculos} · Empresas: {simulacion.empresas} · Enlaces web previstos: {simulacion.enlacesClienteWeb} · Contratos: {simulacion.contratos} · Fichas nuevas: {simulacion.fichasNuevas}</p>
        <p>Excluidas: {simulacion.excluidos.total} · Nombre distinto: {simulacion.excluidos.NOMBRE_DISTINTO} · Empresa compartida: {simulacion.excluidos.EMPRESA_COMPARTIDA} · Empresa inactiva: {simulacion.excluidos.EMPRESA_INACTIVA} · Cliente ya vinculado: {simulacion.excluidos.CLIENTE_YA_CON_EMPRESA}</p>
        <p className="break-all">Huella de esta simulación: <code>{simulacion.hash}</code></p>
        {simulacion.vinculos === 0 && <p role="status">BLOQUE_VACIO: no hay propuestas elegibles; confirmar permanece deshabilitado.</p>}
        <p>Esta simulación no acredita aprobación ni éxito. Comparte los recuentos y esta huella con Claude para revisión. Víctor confirma sólo después de esa revisión; no uses una huella de Stage en Production.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={revisado} disabled={ocupado || simulacion.vinculos === 0 || simulacion.prerrequisito === 'SIN_MAESTRO'} onChange={e => setRevisado(e.target.checked)} />Declaro que Claude ha revisado esta simulación y que Víctor autoriza este bloque.</label>
        <label className="block">Confirmación literal<input value={frase} disabled={ocupado || simulacion.vinculos === 0 || simulacion.prerrequisito === 'SIN_MAESTRO'} onChange={e => setFrase(e.target.value)} placeholder="CONFIRMAR_BLOQUE" autoComplete="off" className="ml-2 rounded border border-slate-300 px-2 py-1" /></label>
        <button type="button" disabled={!puedeConfirmar} onClick={confirmar} className="rounded-md bg-red-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Víctor: confirmar bloque revisado</button>
      </div>}
      {resultado && <p role="status" className="text-sm text-green-800">Resultado nativo: {resultado.vinculos} vínculos confirmados, {resultado.enlacesClienteWeb} enlaces web y {resultado.obsoletas} propuestas obsoletas. Huella: <code className="break-all">{resultado.hash}</code>. Se requiere una simulación nueva para otra confirmación.</p>}
    </section>
  )
}
