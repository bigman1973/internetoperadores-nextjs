'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePermisoArea } from '@/hooks/usePermisoArea'
import { useActuation } from '@/components/impersonation/ActuationProvider'

const API = '/api/admin/finanzas/confirming/fuentes'
type SourceType = 'BBVA_PDF' | 'CAIXA_PDF' | 'CAIXA_XLS'
type Candidate = Readonly<{ facturaRecibidaId: string; nombre: string; identidadControlada: Readonly<{ driveId: string; itemId: string }>; versionDocumento: number }>
type Response = Readonly<{ schema: 'CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_V1'; registryReady: boolean; candidates: readonly Candidate[] }>
type Notice = Readonly<{ tone: 'error' | 'success'; text: string }> | null

function message(value: unknown, fallback: string): string {
  return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string' ? (value as { error: string }).error : fallback
}
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map(key => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`
  }
  throw new Error('CANONICAL_VALUE_INVALID')
}
async function sha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
function isCandidate(value: unknown): value is Candidate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>, identity = row.identidadControlada
  return typeof row.facturaRecibidaId === 'string' && typeof row.nombre === 'string' && Number.isInteger(row.versionDocumento)
    && !!identity && typeof identity === 'object' && !Array.isArray(identity)
    && typeof (identity as Record<string, unknown>).driveId === 'string' && typeof (identity as Record<string, unknown>).itemId === 'string'
}
function parseResponse(value: unknown): Response {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('No se pudo leer la lista de documentos de confirming.')
  const row = value as Record<string, unknown>
  if (row.schema !== 'CONFIRMING_CONTROLLED_SUPPORT_REGISTRY_V1' || typeof row.registryReady !== 'boolean' || !Array.isArray(row.candidates) || !row.candidates.every(isCandidate)) throw new Error('No se pudo leer la lista de documentos de confirming.')
  return { schema: row.schema, registryReady: row.registryReady, candidates: row.candidates }
}
function sourcePayload(facturaRecibidaId: string, tipo: SourceType) { return { facturaRecibidaId, tipo } }

/** A human declaration prepares only the existing registered documents; it never imports or confirms a payment. */
export default function ConfirmingControlledSourcesPanel() {
  const { canRead, canWrite } = usePermisoArea('admin.finanzas.conciliacion')
  const { active } = useActuation()
  const [opened, setOpened] = useState(false), [loading, setLoading] = useState(false), [sending, setSending] = useState(false)
  const [data, setData] = useState<Response | null>(null), [notice, setNotice] = useState<Notice>(null)
  const [bbva, setBbva] = useState(''), [caixaPdf, setCaixaPdf] = useState(''), [caixaXls, setCaixaXls] = useState(''), [pair, setPair] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const requestVersion = useRef(0)
  const load = useCallback(async (clearNotice = true) => {
    if (!canRead) return
    const version = ++requestVersion.current
    setLoading(true)
    if (clearNotice) setNotice(null)
    try {
      const response = await fetch(API, { cache: 'no-store' }), raw: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(message(raw, 'No se pudieron leer los documentos de confirming.'))
      const parsed = parseResponse(raw)
      if (version !== requestVersion.current) return
      setData(parsed)
      if (!parsed.registryReady) setNotice({ tone: 'error', text: 'La preparación de documentos aún no está disponible. No se ha registrado ningún cambio.' })
    } catch (error) {
      if (version === requestVersion.current) { setData(null); setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudieron leer los documentos de confirming.' }) }
    } finally { if (version === requestVersion.current) setLoading(false) }
  }, [canRead])
  useEffect(() => { if (opened) void load() }, [load, opened])
  const selectedIds = useMemo(() => new Set([bbva, caixaPdf, caixaXls].filter(Boolean)), [bbva, caixaPdf, caixaXls])
  const validCaixa = caixaPdf !== '' && caixaXls !== '' && caixaPdf !== caixaXls && /^[A-Za-z0-9_.:-]{1,160}$/.test(pair.trim())
  const mode: 'BBVA' | 'CAIXA' | null = bbva ? 'BBVA' : (caixaPdf || caixaXls || pair ? 'CAIXA' : null)
  const selected = mode === 'BBVA' ? [sourcePayload(bbva, 'BBVA_PDF')] : validCaixa ? [sourcePayload(caixaPdf, 'CAIXA_PDF'), sourcePayload(caixaXls, 'CAIXA_XLS')] : []
  const canSubmit = canWrite && !sending && !loading && reviewed && selected.length > 0 && !!data?.registryReady
  const resetSelection = useCallback(() => { setBbva(''); setCaixaPdf(''); setCaixaXls(''); setPair(''); setReviewed(false) }, [])
  const send = useCallback(async () => {
    if (!canSubmit) return
    setSending(true); setNotice(null)
    try {
      const parejaCaixaDeclaradaId = mode === 'CAIXA' ? pair.trim() : null
      const sortedSources = [...selected].sort((left, right) => `${left.tipo}:${left.facturaRecibidaId}`.localeCompare(`${right.tipo}:${right.facturaRecibidaId}`))
      const idempotencyKey = await sha256({ action: 'declarar', confirmar: true, parejaCaixaDeclaradaId, fuentes: sortedSources })
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(active ? { 'x-io-acting-session': active.sessionId } : {}) }, body: JSON.stringify({ action: 'declarar', confirmar: true, idempotencyKey, parejaCaixaDeclaradaId, fuentes: sortedSources }) })
      const raw: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(message(raw, 'No se pudo preparar la revisión.'))
      resetSelection()
      setNotice({ tone: 'success', text: 'Documentos preparados para su revisión. No se ha importado ningún archivo ni confirmado ningún cobro.' })
      await load(false)
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo preparar la revisión.' }) }
    finally { setSending(false) }
  }, [active, canSubmit, load, mode, pair, resetSelection, selected])

  if (!canRead) return null
  if (!opened) return <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm panel-dark:border-slate-700 panel-dark:bg-slate-900"><button type="button" onClick={() => setOpened(true)} className="min-h-10 rounded-md border border-orange-300 px-3 py-2 text-sm font-bold text-orange-900 hover:bg-orange-50 panel-dark:border-orange-800 panel-dark:text-orange-100">Preparar documentos de confirming</button><p className="mt-2 text-xs text-slate-600 panel-dark:text-slate-300">Sólo prepara su revisión; no importa ni confirma cobros.</p></section>
  return <section aria-labelledby="confirming-controlled-source-title" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900 panel-dark:border-amber-800 panel-dark:bg-amber-950/30 panel-dark:text-slate-100">
    <header><h2 id="confirming-controlled-source-title" className="text-base font-semibold">Preparar documentos de confirming</h2><p className="mt-1 text-sm">Elija documentos que ya están guardados en el panel. Para BBVA, seleccione el PDF de la liquidación. Para Caixa, seleccione juntos su PDF y su hoja de facturas. Sólo prepara su revisión; no importa ni confirma cobros.</p></header>
    {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded border p-3 text-sm ${notice.tone === 'error' ? 'border-red-300 bg-red-50 text-red-950 panel-dark:border-red-900 panel-dark:bg-red-950/45 panel-dark:text-red-100' : 'border-emerald-300 bg-emerald-50 text-emerald-950 panel-dark:border-emerald-900 panel-dark:bg-emerald-950/45 panel-dark:text-emerald-100'}`}>{notice.text}</p>}
    {notice?.tone === 'error' && <button type="button" onClick={() => void load()} disabled={loading || sending} className="min-h-10 rounded border border-slate-300 px-3 py-2 text-sm font-semibold">Reintentar</button>}
    {loading && <p className="text-sm text-slate-600 panel-dark:text-slate-300">Leyendo documentos de confirming…</p>}
    {!loading && data?.registryReady && data.candidates.length === 0 && <p className="text-sm text-slate-700 panel-dark:text-slate-200">No hay documentos nuevos de confirming para preparar.</p>}
    {!loading && data?.registryReady && data.candidates.length > 0 && <div className="space-y-4">
      <fieldset disabled={sending || !canWrite} className="space-y-2"><legend className="text-sm font-bold">1. Elija un PDF de BBVA o los dos documentos de Caixa</legend>
        <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white panel-dark:border-amber-900 panel-dark:bg-slate-900"><table className="min-w-full text-left text-xs"><thead className="bg-amber-100/70 panel-dark:bg-amber-900/35"><tr><th className="p-2">Documento</th><th className="p-2">BBVA PDF</th><th className="p-2">Caixa PDF</th><th className="p-2">Caixa hoja de facturas</th></tr></thead><tbody>{data.candidates.map(candidate => <tr key={candidate.facturaRecibidaId} className="border-t border-amber-100 panel-dark:border-amber-900/60"><td className="p-2 font-semibold">{candidate.nombre}</td><td className="p-2"><input aria-label={`BBVA PDF ${candidate.nombre}`} type="radio" name="bbva-source" checked={bbva === candidate.facturaRecibidaId} disabled={mode === 'CAIXA'} onChange={() => { setBbva(candidate.facturaRecibidaId); setCaixaPdf(''); setCaixaXls(''); setPair(''); setReviewed(false) }} /></td><td className="p-2"><input aria-label={`Caixa PDF ${candidate.nombre}`} type="radio" name="caixa-pdf-source" checked={caixaPdf === candidate.facturaRecibidaId} disabled={mode === 'BBVA' || caixaXls === candidate.facturaRecibidaId} onChange={() => { setCaixaPdf(candidate.facturaRecibidaId); setBbva(''); setReviewed(false) }} /></td><td className="p-2"><input aria-label={`Caixa hoja ${candidate.nombre}`} type="radio" name="caixa-xls-source" checked={caixaXls === candidate.facturaRecibidaId} disabled={mode === 'BBVA' || caixaPdf === candidate.facturaRecibidaId} onChange={() => { setCaixaXls(candidate.facturaRecibidaId); setBbva(''); setReviewed(false) }} /></td></tr>)}</tbody></table></div>
        {mode === 'CAIXA' && <label className="block max-w-md text-sm font-semibold">Nombre para estos dos documentos<input value={pair} onChange={event => { setPair(event.target.value.slice(0, 160)); setReviewed(false) }} maxLength={160} placeholder="Por ejemplo: caixa-2026-10-29" className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-2 text-sm panel-dark:border-slate-600 panel-dark:bg-slate-950" /><span className="mt-1 block text-xs font-normal">Use letras, números y guiones, sin espacios.</span></label>}
        {selectedIds.size > 0 && <button type="button" onClick={resetSelection} className="min-h-10 rounded border border-slate-300 px-3 py-2 text-sm">Cambiar selección</button>}
      </fieldset>
      <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-white p-3 text-sm panel-dark:border-amber-900 panel-dark:bg-slate-900"><input type="checkbox" checked={reviewed} disabled={selectedIds.size === 0 || sending || !canWrite} onChange={event => setReviewed(event.target.checked)} className="mt-1" /><span>He comprobado los documentos seleccionados y entiendo que sólo preparo su revisión. No se importará ningún archivo ni se confirmará ningún cobro.</span></label>
      {!canWrite && <p role="status" className="text-sm text-amber-950 panel-dark:text-amber-100">Puede consultar estos documentos, pero no preparar su revisión.</p>}
      <button type="button" disabled={!canSubmit} onClick={() => void send()} className="min-h-10 rounded bg-orange-700 px-3 py-2 text-sm font-bold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Preparando revisión…' : 'Preparar los documentos seleccionados'}</button>
    </div>}
  </section>
}
