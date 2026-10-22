'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  isActiveSyncJob,
  parseSyncJobMutation,
  parseSyncJobsState,
  type SyncJobDTO,
  type SyncJobsStateDTO,
  type SyncJobSource,
} from './sync-job-types'
import { useSyncJobPermission } from './useSyncJobPermission'

const ENDPOINT = '/api/admin/finanzas/sync-jobs'
const ACTIVE_POLL_MS = 5_000
const IDLE_POLL_MS = 30_000

type Scope = Record<string, unknown> | undefined

export interface SyncJobPanelProps {
  source: SyncJobSource
  /** Short source-specific text; it must not make financial claims not in the job DTO. */
  title: string
  description: string
  scope?: Scope
  /** Called once per visible terminal job. Use it only to re-read the host view. */
  onTerminalJob?: (job: SyncJobDTO) => void
  className?: string
}

function jobFromState(state: SyncJobsStateDTO | null): SyncJobDTO | null {
  return state?.activeJob ?? state?.lastJob ?? null
}

function jobBelongsToSource(job: SyncJobDTO | null, source: SyncJobSource): boolean {
  return job === null || job.source === source
}

function statusLabel(status: SyncJobDTO['status']): string {
  return {
    QUEUED: 'En cola',
    RUNNING: 'En curso',
    COMPLETED: 'Completado',
    COMPLETED_WITH_ERRORS: 'Completado con incidencias',
    FAILED: 'Fallido',
    CANCEL_REQUESTED: 'Cancelación solicitada',
    CANCELLED: 'Cancelado',
  }[status]
}

function phaseLabel(phase: SyncJobDTO['phase']): string {
  return { INVENTORY: 'Inventario', PROCESSING: 'Procesando', FINALIZING: 'Finalizando' }[phase]
}

function formatDate(value: string | null): string {
  if (value === null) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `sync-ui-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

async function jsonOrNull(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function apiError(response: Response, body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && 'error' in body && typeof body.error === 'string' && body.error.trim()) {
    return body.error
  }
  return response.ok ? fallback : `${fallback} (${response.status})`
}

/**
 * Reusable durable-job UI. Its browser timeout only re-reads job state; it is
 * never the worker. Closing the tab does not stop a created server-side job.
 */
export default function SyncJobPanel({
  source,
  title,
  description,
  scope,
  onTerminalJob,
  className = '',
}: SyncJobPanelProps) {
  const { canRead, canWrite: canWriteArea } = useSyncJobPermission(source)
  const [state, setState] = useState<SyncJobsStateDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [readError, setReadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [mutating, setMutating] = useState<'create' | 'cancel' | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const idempotencyKeyRef = useRef<string | null>(null)
  const mutationAbortRef = useRef<AbortController | null>(null)
  const terminalNotifiedRef = useRef<string | null>(null)

  const refresh = useCallback(() => {
    setReadError(null)
    setLoading(true)
    setReloadVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    if (!canRead) {
      setLoading(false)
      setState(null)
      return
    }

    const abort = new AbortController()
    let alive = true
    let timer: number | undefined
    setLoading(true)

    const readState = async () => {
      try {
        const response = await fetch(`${ENDPOINT}?source=${encodeURIComponent(source)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: abort.signal,
        })
        const body = await jsonOrNull(response)
        if (!response.ok) throw new Error(apiError(response, body, 'No se pudo leer el trabajo de sincronización'))
        const parsed = parseSyncJobsState(body)
        if (parsed.ok === false) throw new Error(`Respuesta de sincronización inválida: ${parsed.error}`)
        if (!jobBelongsToSource(parsed.value.activeJob, source) || !jobBelongsToSource(parsed.value.lastJob, source)) {
          throw new Error('La respuesta incluye un trabajo de otra fuente.')
        }
        if (!alive) return
        setState(parsed.value)
        setReadError(null)
        setLoading(false)
        const nextDelay = isActiveSyncJob(parsed.value.activeJob?.status ?? 'COMPLETED') ? ACTIVE_POLL_MS : IDLE_POLL_MS
        // Browser polling only: the durable worker continues server-side without this page.
        timer = window.setTimeout(() => void readState(), nextDelay)
      } catch (error) {
        if (abort.signal.aborted || !alive) return
        setReadError(error instanceof Error ? error.message : 'No se pudo leer el trabajo de sincronización.')
        setLoading(false)
        // A transient GET failure must not enable stale mutation controls.
        timer = window.setTimeout(() => void readState(), IDLE_POLL_MS)
      }
    }

    void readState()
    return () => {
      alive = false
      abort.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [canRead, reloadVersion, source])

  useEffect(() => () => mutationAbortRef.current?.abort(), [])

  const displayedJob = jobFromState(state)
  const active = displayedJob !== null && isActiveSyncJob(displayedJob.status)
  const serverCanWrite = state?.canWrite === true
  const actionAllowed = canRead && canWriteArea && serverCanWrite && state?.enabled === true && !readError && !loading

  useEffect(() => {
    if (!displayedJob || isActiveSyncJob(displayedJob.status) || terminalNotifiedRef.current === displayedJob.id) return
    terminalNotifiedRef.current = displayedJob.id
    // A failed POST keeps its key for retry. A later terminal result permits a new run.
    idempotencyKeyRef.current = null
    onTerminalJob?.(displayedJob)
  }, [displayedJob, onTerminalJob])

  const startJob = async () => {
    if (!actionAllowed || active || mutating) return
    setActionError(null)
    setMutating('create')
    const idempotencyKey = idempotencyKeyRef.current ?? createIdempotencyKey()
    idempotencyKeyRef.current = idempotencyKey
    const abort = new AbortController()
    mutationAbortRef.current?.abort()
    mutationAbortRef.current = abort
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ source, idempotencyKey, ...(scope === undefined ? {} : { scope }) }),
      })
      const body = await jsonOrNull(response)
      if (!response.ok) throw new Error(apiError(response, body, 'No se pudo crear el trabajo'))
      const parsed = parseSyncJobMutation(body)
      if (parsed.ok === false || parsed.value.job.source !== source) {
        throw new Error(parsed.ok === true ? 'El trabajo creado no corresponde a esta fuente.' : `Respuesta de creación inválida: ${parsed.error}`)
      }
      setState((previous) => previous === null
        ? { enabled: true, canWrite: true, activeJob: parsed.value.job, lastJob: null }
        : { ...previous, activeJob: parsed.value.job })
      setActionError(null)
      // Retrying the same interaction preserves this key and therefore reuses the job.
      refresh()
    } catch (error) {
      if (!abort.signal.aborted) setActionError(error instanceof Error ? error.message : 'No se pudo crear el trabajo.')
    } finally {
      if (!abort.signal.aborted) setMutating(null)
    }
  }

  const cancelJob = async () => {
    if (!actionAllowed || !displayedJob || !active || displayedJob.status === 'CANCEL_REQUESTED' || mutating) return
    setActionError(null)
    setMutating('cancel')
    const abort = new AbortController()
    mutationAbortRef.current?.abort()
    mutationAbortRef.current = abort
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ id: displayedJob.id, action: 'CANCEL' }),
      })
      const body = await jsonOrNull(response)
      if (!response.ok) throw new Error(apiError(response, body, 'No se pudo solicitar la cancelación'))
      const parsed = parseSyncJobMutation(body)
      if (parsed.ok === false || parsed.value.job.source !== source) {
        throw new Error(parsed.ok === true ? 'El trabajo cancelado no corresponde a esta fuente.' : `Respuesta de cancelación inválida: ${parsed.error}`)
      }
      setState((previous) => previous === null
        ? { enabled: true, canWrite: true, activeJob: parsed.value.job, lastJob: null }
        : { ...previous, activeJob: parsed.value.job })
      setActionError(null)
      refresh()
    } catch (error) {
      if (!abort.signal.aborted) setActionError(error instanceof Error ? error.message : 'No se pudo solicitar la cancelación.')
    } finally {
      if (!abort.signal.aborted) setMutating(null)
    }
  }

  const totalKnown = displayedJob?.total ?? null
  const progressPercent = useMemo(() => {
    if (totalKnown === null || totalKnown <= 0 || displayedJob === null) return null
    return Math.floor((displayedJob.processed / totalKnown) * 100)
  }, [displayedJob, totalKnown])

  if (!canRead) {
    return <section className={`rounded-xl border border-slate-300 bg-white p-4 text-slate-900 ${className}`} aria-label={title}>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-1 text-sm text-slate-700">No tienes permiso para consultar esta sincronización.</p>
    </section>
  }

  return <section className={`rounded-xl border border-slate-300 bg-white p-4 text-slate-900 shadow-sm ${className}`} aria-labelledby={`sync-job-${source}-title`}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 id={`sync-job-${source}-title`} className="text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-slate-700">{description}</p>
      </div>
      <button type="button" onClick={refresh} disabled={loading || mutating !== null} className="shrink-0 rounded-lg border border-slate-400 bg-white px-3 py-2 text-sm font-bold text-slate-900 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">
        Actualizar estado
      </button>
    </div>

    <div className="mt-4" aria-live="polite" aria-atomic="true">
      {loading && <p className="text-sm text-slate-700">Consultando el estado guardado del trabajo…</p>}
      {readError && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><p className="font-bold">No se pudo actualizar el estado</p><p className="mt-1 break-words">{readError}</p><p className="mt-2">La acción queda bloqueada hasta recibir un estado actual.</p></div>}
      {actionError && <div role="alert" className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"><p className="font-bold">La acción no se completó</p><p className="mt-1 break-words">{actionError}</p></div>}

      {state?.enabled === false && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Sincronización desactivada</p><p className="mt-1">El acceso externo requiere habilitación selectiva. Se conserva la metadata del último trabajo, pero desde esta pantalla no se inicia ninguna conexión.</p></div>}

      {!loading && !readError && displayedJob === null && state?.enabled !== false && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-800">No hay un trabajo registrado para esta fuente.</p>}

      {displayedJob && <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-bold text-slate-950">{statusLabel(displayedJob.status)}</p><p className="text-xs text-slate-700">Fase: {phaseLabel(displayedJob.phase)} · iniciado: {formatDate(displayedJob.startedAt)}</p></div>
          <span className="w-fit rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">{displayedJob.source}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          <Metric label="Procesados" value={String(displayedJob.processed)} />
          <Metric label="Nuevas" value={String(displayedJob.nuevas)} />
          <Metric label="Actualizadas" value={String(displayedJob.actualizadas)} />
          <Metric label="Sin cambios" value={String(displayedJob.unchanged)} />
          <Metric label="Errores" value={String(displayedJob.errores)} />
        </div>

        {totalKnown === null ? <p className="mt-3 text-sm font-medium text-slate-800">Inventario aún en enumeración: {displayedJob.processed} procesados. El total y porcentaje no se muestran hasta que el servidor complete el recuento.</p>
          : totalKnown === 0 ? <p className="mt-3 text-sm font-medium text-slate-800">Inventario enumerado: 0 elementos. No se muestra un 100 % artificial.</p>
          : <div className="mt-3"><div className="flex justify-between gap-3 text-sm text-slate-800"><span>{displayedJob.processed} de {totalKnown} procesados</span><span>{progressPercent}%</span></div><div className="mt-1 h-3 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Progreso de sincronización" aria-valuemin={0} aria-valuemax={totalKnown} aria-valuenow={displayedJob.processed}><div className="h-full rounded-full bg-orange-700 transition-[width]" style={{ width: `${progressPercent}%` }} /></div></div>}

        {displayedJob.lastError && <p className="mt-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-900"><strong>Detalle seguro:</strong> {displayedJob.lastError}</p>}
        {active && <p className="mt-3 text-xs leading-5 text-slate-700">Este navegador solo consulta el trabajo cada 5 segundos. El proceso durable sigue en el servidor aunque cierres o cambies de pantalla.</p>}
        {displayedJob.status === 'CANCEL_REQUESTED' && <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">La cancelación se ha solicitado. El worker terminará de forma segura el archivo actual y se detendrá en el siguiente punto seguro; no se revierte el trabajo ya confirmado.</p>}
        {!active && <p className="mt-3 text-xs text-slate-700">Finalizado: {formatDate(displayedJob.finishedAt)}</p>}
      </div>}
    </div>

    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {active && <button type="button" onClick={() => void cancelJob()} disabled={!actionAllowed || displayedJob?.status === 'CANCEL_REQUESTED' || mutating !== null} className="rounded-lg border border-red-700 bg-white px-4 py-2.5 text-sm font-bold text-red-900 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{mutating === 'cancel' ? 'Solicitando cancelación…' : displayedJob?.status === 'CANCEL_REQUESTED' ? 'Cancelación solicitada' : 'Cancelar tras el archivo actual'}</button>}
      <button type="button" onClick={() => void startJob()} disabled={!actionAllowed || active || mutating !== null} title={!canWriteArea ? 'No tienes permiso de escritura para esta fuente.' : state?.canWrite === false ? 'El servidor no autoriza escritura para esta fuente.' : state?.enabled === false ? 'La sincronización está desactivada.' : undefined} className="rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{mutating === 'create' ? 'Creando trabajo…' : active ? 'Trabajo en curso' : 'Iniciar sincronización'}</button>
    </div>
  </section>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-white p-2"><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</p><p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{value}</p></div>
}
