'use client'

import { useCallback, useRef, useState } from 'react'
import { useActuation } from '@/components/impersonation/ImpersonationBanner'
import { formatDate, formatMoney, makeIdempotencyKey, safeDocumentHref } from './conciliar-contract'

const API = '/api/admin/finanzas/conciliar/intereses'

type Candidate = Readonly<{
  loteId: string
  confirmingId: string
  importeInteresCentimos: number
  referenciaDocumental: string | null
  emisorBancoDocumento: string | null
  fechaConfirming: string | null
  estado: 'LISTA_PARA_VINCULO_MANUAL' | 'AMBAR_EVIDENCIA_INSUFICIENTE' | 'YA_VINCULADA'
  facturaInteresId: string | null
  coincidencias: readonly Readonly<{
    facturaInteresId: string
    referenciaDocumental: string | null
    emisorBanco: string | null
    fechaFactura: string | null
    importeCentimos: number | null
  }>[]
  bloqueos: readonly string[]
  pdfConfirming: Readonly<{ rowId: string; href: string }> | null
  requiereConfirmacionHumana: true
  noEscrituras: true
}>

type Response = Readonly<{ candidates: readonly Candidate[]; noEscrituras: true }>

function isCandidate(value: unknown): value is Candidate {
  const item = value as Partial<Candidate>
  return !!item
    && typeof item.loteId === 'string'
    && typeof item.confirmingId === 'string'
    && Number.isSafeInteger(item.importeInteresCentimos)
    && ['LISTA_PARA_VINCULO_MANUAL', 'AMBAR_EVIDENCIA_INSUFICIENTE', 'YA_VINCULADA'].includes(String(item.estado))
    && Array.isArray(item.coincidencias)
    && Array.isArray(item.bloqueos)
    && item.requiereConfirmacionHumana === true
    && item.noEscrituras === true
}

function parseResponse(value: unknown): Response {
  const raw = value as Partial<Response>
  if (!raw || raw.noEscrituras !== true || !Array.isArray(raw.candidates) || !raw.candidates.every(isCandidate)) throw new Error('La respuesta de intereses no es válida.')
  return { candidates: raw.candidates, noEscrituras: true }
}

function errorText(value: unknown): string {
  return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error.slice(0, 420)
    : 'No se pudo completar la acción manual.'
}

/** Extensión bajo Historial: se materializa sólo al abrir y nunca autovincula. */
export default function ConfirmingInterestInvoices() {
  const { active: activeActuation } = useActuation()
  const [opened, setOpened] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [items, setItems] = useState<readonly Candidate[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [reference, setReference] = useState<Record<string, string>>({})
  const [issuer, setIssuer] = useState<Record<string, string>>({})
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, string>>({})
  const [humanChecked, setHumanChecked] = useState<Record<string, boolean>>({})
  const requestKeys = useRef(new Map<string, string>())

  const load = useCallback(async () => {
    setLoading(true)
    setNotice(null)
    try {
      const result = await fetch(API, { cache: 'no-store' })
      const raw: unknown = await result.json().catch(() => null)
      if (!result.ok) throw new Error(errorText(raw))
      setItems(parseResponse(raw).candidates)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo leer el historial de intereses.')
    } finally {
      setLoading(false)
    }
  }, [])

  const open = useCallback(() => {
    setOpened(true)
    void load()
  }, [load])

  const mutate = useCallback(async (candidate: Candidate, invoiceId: string | null) => {
    if (sending) return
    setSending(true)
    setNotice(null)
    const requestSignature = JSON.stringify([candidate.loteId, invoiceId, candidate.facturaInteresId, reference[candidate.loteId] ?? '', issuer[candidate.loteId] ?? '', activeActuation?.sessionId ?? null])
    const idempotencyKey = requestKeys.current.get(requestSignature) ?? makeIdempotencyKey()
    requestKeys.current.set(requestSignature, idempotencyKey)
    const body = invoiceId
      ? {
          action: 'vincular_factura_interes', confirmar: true, loteId: candidate.loteId, facturaInteresId: invoiceId,
          referenciaDocumental: (reference[candidate.loteId] ?? '').trim(), emisorBanco: (issuer[candidate.loteId] ?? '').trim(),
          idempotencyKey,
        }
      : {
          action: 'desvincular_factura_interes', loteId: candidate.loteId, facturaInteresId: candidate.facturaInteresId,
          motivo: 'Desvinculación manual solicitada tras revisión documental.', idempotencyKey,
        }
    try {
      const result = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(activeActuation ? { 'x-io-acting-session': activeActuation.sessionId } : {}) }, body: JSON.stringify(body) })
      const raw: unknown = await result.json().catch(() => null)
      if (!result.ok) throw new Error(errorText(raw))
      await load()
      setNotice(invoiceId ? 'Factura vinculada manualmente y registrada en auditoría.' : 'Vínculo manual retirado y registrado en auditoría.')
      requestKeys.current.delete(requestSignature)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'No se pudo completar la acción manual.')
    } finally {
      setSending(false)
    }
  }, [issuer, load, reference, sending])

  if (!opened) return <section aria-label="Intereses de confirming" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm panel-dark:border-slate-700 panel-dark:bg-slate-900">
    <button type="button" onClick={open} className="min-h-10 rounded-md border border-[#FFB18C] px-3 py-2 text-sm font-bold text-[#BF3E00] hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-[#FF5300] panel-dark:text-orange-200">Vincular factura de intereses</button>
    <p className="mt-2 text-xs text-slate-600 panel-dark:text-slate-300">Abre sólo lotes confirming ya confirmados. El vínculo es siempre manual y no crea facturas ni movimientos.</p>
  </section>

  if (!loading && items.length === 0) return <section aria-label="Intereses de confirming" className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm panel-dark:border-slate-700 panel-dark:bg-slate-900"><p className="text-sm text-slate-600 panel-dark:text-slate-300">No hay lotes confirming confirmados con intereses para revisar.</p></section>

  return <section aria-label="Intereses de confirming" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm panel-dark:border-slate-700 panel-dark:bg-slate-900">
    {notice && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-950 panel-dark:border-amber-900 panel-dark:bg-amber-950/45 panel-dark:text-amber-100">{notice}</p>}
    {loading ? <p className="text-sm text-slate-600 panel-dark:text-slate-300">Cargando historial de intereses…</p> : items.map((item) => {
      const href = safeDocumentHref(item.pdfConfirming?.href ?? null)
      const invoiceId = selectedInvoice[item.loteId] ?? ''
      const canLink = item.estado !== 'YA_VINCULADA' && !!href && !!invoiceId && humanChecked[item.loteId] === true
        && (reference[item.loteId] ?? '').trim().length >= 3 && (issuer[item.loteId] ?? '').trim().length >= 3
      return <article key={item.loteId} className="rounded-lg border border-slate-200 p-3 panel-dark:border-slate-700">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-extrabold text-[#2D2A26] panel-dark:text-white">Interés documentado · {formatMoney(item.importeInteresCentimos)}</h3><span className={item.estado === 'YA_VINCULADA' ? 'text-xs font-bold text-emerald-700 panel-dark:text-emerald-300' : 'text-xs font-bold text-amber-700 panel-dark:text-amber-200'}>{item.estado === 'YA_VINCULADA' ? 'Vinculada manualmente' : 'Revisión humana pendiente'}</span></div>
        <p className="mt-1 text-xs text-slate-600 panel-dark:text-slate-300">Fecha confirming: {formatDate(item.fechaConfirming)}. Los números propios del confirming y de la factura bancaria no se comparan.</p>
        {href ? <a href={href} className="mt-2 inline-block text-sm font-bold text-[#BF3E00] underline underline-offset-2">Ver PDF confirming en el proxy</a> : <p className="mt-2 text-xs font-semibold text-amber-800 panel-dark:text-amber-200">No hay PDF controlado disponible en el proxy; no se habilita la confirmación.</p>}
        {item.estado === 'YA_VINCULADA'
          ? <button type="button" disabled={sending} onClick={() => void mutate(item, null)} className="mt-3 min-h-9 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-800 disabled:opacity-50 panel-dark:border-slate-600 panel-dark:text-slate-100">Desvincular</button>
          : <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-700 panel-dark:text-slate-200">Referencia del confirming vista en el PDF<input value={reference[item.loteId] ?? ''} onChange={(event) => setReference((current) => ({ ...current, [item.loteId]: event.target.value.slice(0, 160) }))} maxLength={160} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm panel-dark:border-slate-600 panel-dark:bg-slate-950" /></label>
              <label className="text-xs font-bold text-slate-700 panel-dark:text-slate-200">Emisor bancario visto en la factura<input value={issuer[item.loteId] ?? ''} onChange={(event) => setIssuer((current) => ({ ...current, [item.loteId]: event.target.value.slice(0, 160) }))} maxLength={160} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm panel-dark:border-slate-600 panel-dark:bg-slate-950" /></label>
              <label className="text-xs font-bold text-slate-700 panel-dark:text-slate-200 sm:col-span-2">Factura bancaria ya importada<select value={invoiceId} onChange={(event) => setSelectedInvoice((current) => ({ ...current, [item.loteId]: event.target.value }))} className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm panel-dark:border-slate-600 panel-dark:bg-slate-950"><option value="">Seleccionar tras comprobar el PDF</option>{item.coincidencias.map((candidate) => <option key={candidate.facturaInteresId} value={candidate.facturaInteresId}>Factura candidata · {formatMoney(candidate.importeCentimos ?? 0)} · {formatDate(candidate.fechaFactura)}</option>)}</select></label>
              <label className="flex items-start gap-2 text-xs font-semibold text-slate-700 panel-dark:text-slate-200 sm:col-span-2"><input type="checkbox" checked={humanChecked[item.loteId] === true} onChange={(event) => setHumanChecked((current) => ({ ...current, [item.loteId]: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700" />He visto el PDF y confirmo manualmente que ambos documentos corresponden al mismo interés.</label>
              <div className="sm:col-span-2"><button type="button" disabled={!canLink || sending} onClick={() => void mutate(item, invoiceId)} className="min-h-9 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-50">Confirmar vínculo manual</button></div>
            </div>}
        {item.bloqueos.length > 0 && <p className="mt-2 text-xs text-amber-800 panel-dark:text-amber-200">Pendiente: {item.bloqueos.join(' · ')}</p>}
      </article>
    })}
  </section>
}
