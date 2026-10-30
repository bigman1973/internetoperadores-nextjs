'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const ENDPOINT = '/api/admin/finanzas/duplicados-documentos'
const MAX_GROUPS = 50
const MAX_DOCUMENTS = 20

type DuplicateDocument = Readonly<{
  label: string
  proveedor: string | null
  numero: string | null
  importe: string | null
}>
type DuplicateGroup = Readonly<{
  groupOrdinal: number
  documentCount: number
  hiddenDocumentCount: number
  documents: readonly DuplicateDocument[]
}>
type DuplicateResponse = Readonly<{
  groups: readonly DuplicateGroup[]
  page: number
  limit: number
  totalGroups: number
  totalPages: number
}>

function text(value: unknown, maximum: number, allowEmpty = false): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized.length > maximum || /[\u0000-\u001f\u007f<>]/.test(normalized) || (!allowEmpty && !normalized) ? null : normalized
}
function nonNegativeInteger(value: unknown, maximum: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : null
}
function positiveInteger(value: unknown, maximum: number): number | null {
  const parsed = nonNegativeInteger(value, maximum)
  return parsed !== null && parsed > 0 ? parsed : null
}

/**
 * Browser parser deliberately whitelists only the nontechnical presentation
 * fields. Hashes, item IDs, URLs, filenames, source timestamps and DB IDs never
 * reach this component's state or DOM.
 */
export function parseReceivedDocumentDuplicates(value: unknown): DuplicateResponse | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const page = positiveInteger(raw.page, 10_000)
  const limit = positiveInteger(raw.limit, MAX_GROUPS)
  const totalGroups = nonNegativeInteger(raw.totalGroups, 1_000_000)
  const totalPages = nonNegativeInteger(raw.totalPages, 100_000)
  if (!page || !limit || totalGroups === null || totalPages === null || !Array.isArray(raw.groups) || raw.groups.length > limit) return null
  const usedOrdinals = new Set<number>()
  const groups: DuplicateGroup[] = []
  for (const candidate of raw.groups) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
    const group = candidate as Record<string, unknown>
    const groupOrdinal = positiveInteger(group.groupOrdinal, 1_000_000)
    const documentCount = positiveInteger(group.documentCount, 1_000_000)
    const hiddenDocumentCount = nonNegativeInteger(group.hiddenDocumentCount, 1_000_000)
    if (!groupOrdinal || !documentCount || documentCount < 2 || hiddenDocumentCount === null || hiddenDocumentCount > documentCount || usedOrdinals.has(groupOrdinal) || !Array.isArray(group.documents) || group.documents.length < 1 || group.documents.length > MAX_DOCUMENTS || group.documents.length + hiddenDocumentCount !== documentCount) return null
    const documents: DuplicateDocument[] = []
    const labels = new Set<string>()
    for (const row of group.documents) {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null
      const document = row as Record<string, unknown>
      const label = text(document.label, 32)
      const proveedor = document.proveedor === null ? null : text(document.proveedor, 300)
      const numero = document.numero === null ? null : text(document.numero, 256)
      const importe = document.importe === null ? null : text(document.importe, 80)
      if (!label || labels.has(label) || (document.proveedor !== null && proveedor === null) || (document.numero !== null && numero === null) || (document.importe !== null && importe === null)) return null
      labels.add(label)
      documents.push(Object.freeze({ label, proveedor, numero, importe }))
    }
    usedOrdinals.add(groupOrdinal)
    groups.push(Object.freeze({ groupOrdinal, documentCount, hiddenDocumentCount, documents: Object.freeze(documents) }))
  }
  if (groups.length > totalGroups || totalPages !== (totalGroups === 0 ? 0 : Math.ceil(totalGroups / limit))) return null
  return Object.freeze({ groups: Object.freeze(groups), page, limit, totalGroups, totalPages })
}

function displayAmount(value: string | null): string {
  if (!value) return 'Importe no disponible'
  const numeric = Number(value)
  return Number.isFinite(numeric) ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(numeric) : 'Importe no disponible'
}
function responseError(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'No se pudieron leer los avisos de archivos repetidos.'
  return text((value as Record<string, unknown>).error, 360) ?? 'No se pudieron leer los avisos de archivos repetidos.'
}

/**
 * Only calls the private GET endpoint. It has no selection, download, mutation
 * or reconciliation action; same bytes are an alert for review, never a merge.
 */
export default function ReceivedDocumentDuplicatesPanel() {
  const [data, setData] = useState<DuplicateResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const requestSequence = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async (targetPage: number) => {
    const sequence = ++requestSequence.current
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${ENDPOINT}?page=${encodeURIComponent(String(targetPage))}&limit=10`, { cache: 'no-store', signal: controller.signal })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(responseError(json))
      const parsed = parseReceivedDocumentDuplicates(json)
      if (!parsed) throw new Error('La respuesta de archivos repetidos no se puede usar de forma segura.')
      if (sequence === requestSequence.current) {
        setData(parsed)
        setPage(parsed.page)
      }
    } catch (reason) {
      if (!controller.signal.aborted && sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : 'No se pudieron leer los avisos de archivos repetidos.')
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(1)
    return () => controllerRef.current?.abort()
  }, [load])

  // A successful empty response stays invisible as requested; loading/error is
  // still visible so a failure cannot be mistaken for "no duplicates".
  if (!loading && !error && data?.totalGroups === 0) return null

  return <section aria-labelledby="received-document-duplicates-title" className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-900">Aviso documental</p>
        <h3 id="received-document-duplicates-title" className="mt-1 text-base font-bold text-slate-950">Archivos recibidos repetidos</h3>
        <p className="mt-1 text-sm text-slate-800">Mismo archivo: revisar, no se ha fusionado nada.</p>
      </div>
      <button type="button" onClick={() => { void load(page) }} disabled={loading} className="min-h-10 shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-600 disabled:cursor-not-allowed disabled:opacity-60">{loading ? 'Actualizando…' : 'Reintentar / actualizar'}</button>
    </div>

    {error && <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"><p>{error}</p><button type="button" onClick={() => { void load(page) }} disabled={loading} className="mt-2 font-semibold underline disabled:opacity-60">Reintentar lectura</button></div>}
    {loading && !data && !error && <p role="status" className="mt-3 rounded-lg border border-amber-100 bg-white/70 p-3 text-sm text-slate-700">Comprobando avisos de archivos repetidos…</p>}

    {data && data.groups.length > 0 && <div className="mt-4 space-y-3" aria-label="Grupos de archivos repetidos">
      {data.groups.map(group => <article key={group.groupOrdinal} className="rounded-lg border border-amber-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-950">Coincidencia de archivo · {group.documentCount} documentos</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {group.documents.map(document => <dl key={document.label} className="min-w-0 rounded-lg bg-slate-50 p-3 text-sm">
            <dt className="font-bold text-slate-950">{document.label}</dt>
            <dd className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-slate-700"><span className="font-medium">Proveedor</span><span className="break-words">{document.proveedor ?? 'No disponible'}</span><span className="font-medium">Número</span><span className="break-words">{document.numero ?? 'No disponible'}</span><span className="font-medium">Importe</span><span>{displayAmount(document.importe)}</span></dd>
          </dl>)}
        </div>
        {group.hiddenDocumentCount > 0 && <p className="mt-3 text-xs text-slate-600">Hay {group.hiddenDocumentCount} documento{group.hiddenDocumentCount === 1 ? '' : 's'} adicional{group.hiddenDocumentCount === 1 ? '' : 'es'} en esta coincidencia. La vista limita los documentos por grupo.</p>}
      </article>)}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700"><span>{data.totalGroups} coincidencia{data.totalGroups === 1 ? '' : 's'} de archivo</span>{data.totalPages > 1 && <div className="flex gap-2"><button type="button" disabled={loading || data.page <= 1} onClick={() => { void load(data.page - 1) }} className="rounded border border-amber-400 bg-white px-3 py-1.5 font-semibold text-amber-950 disabled:opacity-50">Anterior</button><button type="button" disabled={loading || data.page >= data.totalPages} onClick={() => { void load(data.page + 1) }} className="rounded border border-amber-400 bg-white px-3 py-1.5 font-semibold text-amber-950 disabled:opacity-50">Siguiente</button></div>}</div>
    </div>}
  </section>
}
