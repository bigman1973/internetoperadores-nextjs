'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePermisoArea } from '@/hooks/usePermisoArea'
import { useActuation } from '@/components/impersonation/ImpersonationBanner'

const API = '/api/admin/finanzas/rectificativas'
type State = 'PROPOSED' | 'CONFIRMED' | 'REJECTED'
type DocumentSummary = { number: string; date: string; totalCents: number } | null
type Link = { id: string; exactReference: string; legacyState: State; effectiveState: State; createdAt: string; originalDocument: DocumentSummary; creditDocument: DocumentSummary }
export type RectificativasResponse = { migrationReady: boolean; links: Link[] }
export type RectificativasPanelRenderState = 'sin-permiso' | 'carga-inicial' | 'sin-migracion' | 'vacio' | 'error' | 'aviso' | 'contenido'
export type RectificativasHumanasPanelViewProps = Readonly<{
  canRead: boolean
  canWrite: boolean
  loading: boolean
  sending: boolean
  data: RectificativasResponse | null
  readError: string | null
  notice: string | null
  reason: Record<string, string>
  onRetry: () => void
  onReasonChange: (linkId: string, value: string) => void
  onDecide: (link: Link, action: 'confirmar' | 'rechazar' | 'deshacer') => void
}>

const key = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '') : Date.now().toString(16).padStart(64, '0').slice(-64)
function errorText(value: unknown): string { return value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string' ? (value as { error: string }).error : 'No se pudo completar la decisión.' }
function label(state: State) { return state === 'PROPOSED' ? 'Pendiente de revisión' : state === 'CONFIRMED' ? 'Confirmada' : 'Rechazada' }
function money(cents: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(cents / 100) }
function documentText(document: DocumentSummary) { return document ? `${document.number} · ${new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC' }).format(new Date(document.date))} · ${money(document.totalCents)}` : 'Datos documentales incompletos: no se puede decidir.' }

/** Sólo la carga inicial, ausencia de migración y un listado vacío se ocultan. Un fallo de lectura siempre es visible y reintentable. */
export function rectificativasPanelRenderState(input: Pick<RectificativasHumanasPanelViewProps, 'canRead' | 'loading' | 'data' | 'readError' | 'notice'>): RectificativasPanelRenderState {
  if (!input.canRead) return 'sin-permiso'
  if (input.readError) return 'error'
  if (input.loading && input.data === null) return 'carga-inicial'
  if (input.data === null || input.data.migrationReady === false) return 'sin-migracion'
  if (input.data.links.length === 0) return input.notice ? 'aviso' : 'vacio'
  return 'contenido'
}

/** Una decisión sólo sale de una lista leída sin error y con permiso de escritura actual. */
export function rectificativasDecisionsBlocked(input: Pick<RectificativasHumanasPanelViewProps, 'canWrite' | 'sending' | 'readError'>): boolean {
  return !input.canWrite || input.sending || Boolean(input.readError)
}

/** Vista separada para que las pruebas cubran renderizado sin depender de datos o sesiones reales. */
export function RectificativasHumanasPanelView({ canRead, canWrite, loading, sending, data, readError, notice, reason, onRetry, onReasonChange, onDecide }: RectificativasHumanasPanelViewProps) {
  const renderState = rectificativasPanelRenderState({ canRead, loading, data, readError, notice })
  if (renderState === 'sin-permiso' || renderState === 'carga-inicial' || renderState === 'sin-migracion' || renderState === 'vacio') return null
  const links = data?.migrationReady ? data.links : []
  // La lista previa queda visible para explicar el error, pero no puede originar
  // una decisión: su estado efectivo puede haber cambiado desde la última lectura.
  const decisionsBlocked = rectificativasDecisionsBlocked({ canWrite, sending, readError })
  return <section aria-label="Rectificativas documentales" className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    {readError && <div role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-950"><p>Error administrativo al leer rectificativas: {readError}</p><button type="button" onClick={onRetry} disabled={loading} className="mt-2 min-h-9 rounded border border-red-300 px-3 py-1.5 text-xs font-bold text-red-900 disabled:opacity-50">Reintentar</button></div>}
    {notice && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-950">{notice}</p>}
    {links.map(link => <article key={link.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-bold text-slate-950">Referencia: {link.exactReference || 'No disponible'}</p><span className="text-xs font-bold text-slate-700">{label(link.effectiveState)}</span></div><dl className="mt-2 grid gap-1 text-xs text-slate-700"><div><dt className="inline font-semibold">Documento original: </dt><dd className="inline">{documentText(link.originalDocument)}</dd></div><div><dt className="inline font-semibold">Rectificativa: </dt><dd className="inline">{documentText(link.creditDocument)}</dd></div></dl><p className="mt-1 text-xs text-slate-600">Estado inicial: {label(link.legacyState)}. La revisión no modifica el enlace original.</p>{link.effectiveState === 'PROPOSED' ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={decisionsBlocked || !link.originalDocument || !link.creditDocument} onClick={() => onDecide(link, 'confirmar')} className="min-h-9 rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Confirmar</button><input aria-label="Motivo para rechazar" disabled={decisionsBlocked} value={reason[link.id] ?? ''} onChange={event => onReasonChange(link.id, event.target.value.slice(0, 500))} maxLength={500} placeholder="Motivo para rechazar" className="min-h-9 rounded border border-slate-300 px-2 text-xs"/><button type="button" disabled={decisionsBlocked || !link.originalDocument || !link.creditDocument} onClick={() => onDecide(link, 'rechazar')} className="min-h-9 rounded border border-red-300 px-3 py-1.5 text-xs font-bold text-red-800 disabled:opacity-50">Rechazar</button></div> : <div className="mt-3 flex flex-wrap gap-2"><input aria-label="Motivo para deshacer" disabled={decisionsBlocked} value={reason[link.id] ?? ''} onChange={event => onReasonChange(link.id, event.target.value.slice(0, 500))} maxLength={500} placeholder="Motivo para deshacer" className="min-h-9 rounded border border-slate-300 px-2 text-xs"/><button type="button" disabled={decisionsBlocked || !link.originalDocument || !link.creditDocument} onClick={() => onDecide(link, 'deshacer')} className="min-h-9 rounded border border-orange-300 px-3 py-1.5 text-xs font-bold text-orange-900 disabled:opacity-50">Volver a pendiente</button></div>}</article>)}
  </section>
}

/** Visible in Pendientes y Conciliar; la API decide identidad, permisos y estado de decisión. */
export default function RectificativasHumanasPanel() {
  const { canRead, canWrite } = usePermisoArea('admin.finanzas.conciliacion')
  const { active } = useActuation()
  const [loading, setLoading] = useState(false), [sending, setSending] = useState(false)
  const [data, setData] = useState<RectificativasResponse | null>(null), [readError, setReadError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [reason, setReason] = useState<Record<string, string>>({})
  const keys = useRef(new Map<string, string>())
  const load = useCallback(async (clearNotice = false): Promise<boolean> => {
    if (!canRead) return false
    setLoading(true)
    if (clearNotice) setNotice(null)
    try {
      const response = await fetch(API, { cache: 'no-store' })
      const raw: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorText(raw))
      const parsed = raw as Partial<RectificativasResponse>
      if (typeof parsed.migrationReady !== 'boolean' || !Array.isArray(parsed.links)) throw new Error('La respuesta de rectificativas no es válida.')
      setData({ migrationReady: parsed.migrationReady, links: parsed.links as Link[] })
      setReadError(null)
      return true
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'No se pudo leer rectificativas.')
      return false
    } finally { setLoading(false) }
  }, [canRead])
  useEffect(() => { if (canRead) void load(true) }, [canRead, load])
  const decide = useCallback(async (link: Link, action: 'confirmar' | 'rechazar' | 'deshacer') => {
    if (rectificativasDecisionsBlocked({ canWrite, sending, readError }) || !link.originalDocument || !link.creditDocument) return
    const why = (reason[link.id] ?? '').trim()
    if ((action === 'rechazar' || action === 'deshacer') && why.length < 3) { setNotice('Indique un motivo de al menos 3 caracteres para rechazar o deshacer.'); return }
    setSending(true); setNotice(null)
    const signature = JSON.stringify([link.id, action, why, active?.sessionId ?? null]); const idempotencyKey = keys.current.get(signature) ?? key(); keys.current.set(signature, idempotencyKey)
    try {
      const response = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(active ? { 'x-io-acting-session': active.sessionId } : {}) }, body: JSON.stringify({ action, creditLinkId: link.id, idempotencyKey, ...(action === 'confirmar' ? {} : { reason: why }) }) })
      const raw: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(errorText(raw))
      keys.current.delete(signature)
      setReason(current => ({ ...current, [link.id]: '' }))
      const reloaded = await load(false)
      setNotice(reloaded ? (action === 'confirmar' ? 'Rectificativa confirmada.' : action === 'rechazar' ? 'Rectificativa rechazada.' : 'Rectificativa devuelta a pendiente de revisión.') : 'La decisión se registró, pero no se pudo actualizar el listado.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'No se pudo completar la decisión.') } finally { setSending(false) }
  }, [active?.sessionId, canWrite, load, readError, reason, sending])
  return <RectificativasHumanasPanelView canRead={canRead} canWrite={canWrite} loading={loading} sending={sending} data={data} readError={readError} notice={notice} reason={reason} onRetry={() => void load(true)} onReasonChange={(linkId, value) => setReason(current => ({ ...current, [linkId]: value }))} onDecide={(link, action) => void decide(link, action)} />
}
