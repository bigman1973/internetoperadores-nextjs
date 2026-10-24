'use client'

import { ArrowPathIcon, CheckCircleIcon, ClipboardDocumentListIcon, ExclamationTriangleIcon, InformationCircleIcon, LockClosedIcon, PlayIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef, useState } from 'react'
import { notifyActuationChanged, useActuation } from '../impersonation/ImpersonationBanner'
import { actuationControlHeaders } from '../impersonation/control-client'
import {
  AuditEvent,
  StartAttempt,
  createStartAttempt,
  parseAuditEvents,
  retryStartAttempt,
  safeInternalRedirect,
} from '../impersonation/contract'

const HISTORY_LIMIT = 25

function requestKey(): string {
  if (typeof window === 'undefined' || typeof window.crypto?.randomUUID !== 'function') {
    throw new Error('Este navegador no puede crear una solicitud segura. Actualízalo para volver a intentarlo.')
  }
  return window.crypto.randomUUID()
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (typeof body?.error === 'string') return body.error
    if (typeof body?.message === 'string') return body.message
  } catch {
    // Una respuesta perdida o no JSON sigue siendo reintentable con la misma clave.
  }
  return `No se pudo completar la solicitud (${response.status}).`
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function eventDescription(event: AuditEvent): string {
  const labels: Record<string, string> = { START: 'Inicio', START_REPLAY: 'Inicio recuperado', EXIT: 'Volver a mi usuario', EXITED: 'Fin', EXPIRED: 'Caducidad', REVOKED: 'Revocación', SIGN_OUT: 'Cerrar sesión', LOGIN: 'Nuevo inicio de sesión', REQUEST: 'Comprobación de acceso', BUSINESS_MUTATION: 'Acción guardada' }
  if (labels[event.kind]) return labels[event.kind]
  const action = event.kind.replace(/[_-]/g, ' ').toLowerCase()
  return `${action.charAt(0).toUpperCase()}${action.slice(1)}`
}

export default function ActuarComoWorkspace() {
  const { state, active, canStart, loading, refresh } = useActuation()
  const [targetId, setTargetId] = useState<number | null>(null)
  const [motivo, setMotivo] = useState('')
  const [startAttempt, setStartAttempt] = useState<StartAttempt | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const [events, setEvents] = useState<AuditEvent[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyOffset, setHistoryOffset] = useState(0)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (targetId || !state?.targets.length) return
    setTargetId(state.targets[0].id)
  }, [state?.targets, targetId])

  useEffect(() => {
    if (!confirmOpen) return
    const previousFocus = document.activeElement as HTMLElement | null
    const focusTimer = window.setTimeout(() => confirmButtonRef.current?.focus(), 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) setConfirmOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [confirmOpen, submitting])

  useEffect(() => {
    if (!canStart || active) {
      setEvents([])
      setHistoryTotal(0)
      return
    }

    const controller = new AbortController()
    setHistoryLoading(true)
    setHistoryError(null)
    fetch(`/api/admin/actuar-como/registro?limit=${HISTORY_LIMIT}&offset=${historyOffset}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response))
        return parseAuditEvents(await response.json())
      })
      .then((history) => {
        setEvents(history.events)
        setHistoryTotal(history.total)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar el registro.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })

    return () => controller.abort()
  }, [canStart, active, historyOffset, historyRefresh])

  const selectedTarget = state?.targets.find((target) => target.id === targetId) ?? null
  const isUncertain = Boolean(startAttempt && startError)
  const canOpenConfirmation = canStart && !active && Boolean(selectedTarget) && !submitting

  const sendStart = async (attempt: StartAttempt) => {
    setSubmitting(true)
    setStartError(null)
    try {
      const response = await fetch('/api/admin/actuar-como', {
        method: 'POST',
        headers: await actuationControlHeaders(),
        body: JSON.stringify({
          action: 'iniciar',
          targetId: attempt.targetId,
          ...(attempt.motivo ? { motivo: attempt.motivo } : {}),
          idempotencyKey: attempt.idempotencyKey,
        }),
      })
      if (!response.ok) throw new Error(await responseMessage(response))
      const body = await response.json()
      if (body?.ok !== true) throw new Error('La respuesta de inicio no se pudo verificar.')
      // Nunca se cambia la identidad en el cliente. El servidor fija la cookie y se recarga toda la aplicación.
      notifyActuationChanged()
      window.location.assign(safeInternalRedirect(body.redirectTo, '/admin'))
    } catch (error) {
      setStartAttempt(retryStartAttempt(attempt))
      setStartError(error instanceof Error ? error.message : 'No se pudo confirmar el inicio. Reintenta la misma solicitud.')
      setSubmitting(false)
      setConfirmOpen(false)
    }
  }

  const beginOrRetry = () => {
    if (isUncertain && startAttempt) {
      void sendStart(startAttempt)
      return
    }
    if (!selectedTarget) return
    try {
      const attempt = createStartAttempt(selectedTarget.id, motivo, requestKey)
      setStartAttempt(attempt)
      setConfirmOpen(true)
    } catch (error) {
      setStartError(error instanceof Error ? error.message : 'No se pudo preparar el inicio.')
    }
  }

  return <div className="mx-auto max-w-6xl space-y-6">
    <section aria-labelledby="actuar-como-title" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-6 text-white sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-orange-200">
              <ShieldCheckIcon className="h-5 w-5" aria-hidden="true" />
              Acceso supervisado
            </div>
            <h1 id="actuar-como-title" className="text-2xl font-bold tracking-tight sm:text-3xl">Actuar como otra persona</h1>
            <p className="mt-2 text-sm leading-6 text-slate-200">Inicias una sesión real y temporal con los permisos de la persona seleccionada. Las acciones que realices se aplican de verdad y quedan registradas.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/50 bg-orange-500/20 px-3 py-1.5 text-xs font-bold text-orange-100">
            <ClockBadge /> Máximo 60 minutos
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <form onSubmit={(event) => { event.preventDefault(); beginOrRetry() }} className="space-y-5" aria-describedby="actuar-como-help">
          <div id="actuar-como-help" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <div className="flex gap-2">
              <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
              <p><strong>Esto no es una previsualización.</strong> No se pide ni se usa la contraseña de la otra persona. Para volver, utiliza la banda naranja que aparecerá en todas las pantallas.</p>
            </div>
          </div>

          {active ? <div className="rounded-xl border border-orange-200 bg-orange-50 p-4" role="status">
            <p className="font-semibold text-orange-950">Ya estás actuando como {active.targetName}.</p>
            <p className="mt-1 text-sm text-orange-900">No puedes iniciar otra actuación. Usa «Volver a mi usuario» en la banda superior para terminarla.</p>
          </div> : !loading && !canStart ? <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" role="status">
            <p className="font-semibold text-slate-900">Esta acción no está disponible para tu sesión.</p>
            <p className="mt-1 text-sm text-slate-600">Sólo una sesión real de superadministración autorizada puede iniciarla. No se han mostrado destinos ni registro.</p>
          </div> : <>
            <div>
              <label htmlFor="actuar-como-destino" className="block text-sm font-bold text-slate-900">Persona con la que actuar</label>
              <p className="mt-1 text-sm text-slate-600">El catálogo procede del servidor y sólo incluye destinos autorizados.</p>
              <select
                id="actuar-como-destino"
                value={targetId ?? ''}
                onChange={(event) => setTargetId(Number(event.target.value))}
                disabled={loading || submitting || isUncertain || !state?.targets.length}
                className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {!state?.targets.length && <option value="">{loading ? 'Cargando destinos autorizados…' : 'No hay destinos disponibles'}</option>}
                {state?.targets.map((target) => <option key={target.id} value={target.id}>{target.nombre} · {target.rol.replace('_', ' ')}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="actuar-como-motivo" className="block text-sm font-bold text-slate-900">Motivo <span className="font-normal text-slate-500">(opcional)</span></label>
              <textarea
                id="actuar-como-motivo"
                rows={3}
                maxLength={500}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                disabled={submitting || isUncertain}
                placeholder="Describe brevemente la necesidad de soporte o comprobación."
                className="mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:bg-slate-100"
              />
              <p className="mt-1 text-xs text-slate-500">Se incluirá en el registro de esta actuación. No incluyas contraseñas ni datos sensibles.</p>
            </div>

            {startError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
              <div className="flex gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
                <div><p className="font-bold">No se confirmó el inicio</p><p className="mt-1">{startError}</p>{isUncertain && <p className="mt-2 font-medium">Para evitar duplicados, el reintento conservará la misma persona, motivo e identificador de solicitud.</p>}</div>
              </div>
            </div>}

            <button
              type="submit"
              disabled={!canOpenConfirmation}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
            >
              {submitting ? <ArrowPathIcon className="h-5 w-5 animate-spin" aria-hidden="true" /> : isUncertain ? <ArrowPathIcon className="h-5 w-5" aria-hidden="true" /> : <PlayIcon className="h-5 w-5" aria-hidden="true" />}
              {submitting ? 'Iniciando…' : isUncertain ? 'Reintentar inicio' : 'Iniciar actuación real'}
            </button>
          </>}
        </form>

        <aside aria-label="Alcance de la actuación" className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-base font-bold text-slate-950">Antes de continuar</h2>
          <ul className="mt-4 space-y-3 text-sm leading-5 text-slate-700">
            <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> Los permisos se comprobarán en el servidor para la persona seleccionada.</li>
            <li className="flex gap-2"><CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" /> La sesión se cierra al volver, al caducar o si el servidor la revoca.</li>
            <li className="flex gap-2"><LockClosedIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" /> Las áreas sensibles permanecen bloqueadas según las reglas del servidor.</li>
          </ul>
          <div className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">Una modalidad futura sin guardar requerirá un diseño específico. Esta pantalla no ofrece una simulación de acciones reales.</div>
        </aside>
      </div>
    </section>

    {canStart && !active && <section aria-labelledby="registro-actuaciones" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-2"><ClipboardDocumentListIcon className="h-5 w-5 text-slate-600" aria-hidden="true" /><h2 id="registro-actuaciones" className="text-lg font-bold text-slate-950">Registro reciente</h2></div>
        {!historyLoading && <span className="text-sm text-slate-500">{historyTotal} evento{historyTotal === 1 ? '' : 's'}</span>}
      </div>
      <div className="overflow-x-auto">
        {historyLoading ? <p className="p-5 text-sm text-slate-600" role="status">Cargando el registro autorizado…</p> : historyError ? <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert"><p>{historyError}</p><button type="button" onClick={() => setHistoryRefresh(value => value + 1)} className="mt-2 font-bold underline underline-offset-2">Actualizar registro</button></div> : events.length === 0 ? <p className="p-5 text-sm text-slate-600">No hay eventos que mostrar.</p> : <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <caption className="sr-only">Registro de actuaciones recientes</caption>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th scope="col" className="px-5 py-3 font-bold">Fecha</th><th scope="col" className="px-5 py-3 font-bold">Acción</th><th scope="col" className="px-5 py-3 font-bold">Usuario real</th><th scope="col" className="px-5 py-3 font-bold">En nombre de</th><th scope="col" className="px-5 py-3 font-bold">IP</th><th scope="col" className="px-5 py-3 font-bold">Resultado</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{events.map((event) => <tr key={event.id} className="align-top"><td className="whitespace-nowrap px-5 py-3 text-slate-600">{formatDate(event.at)}</td><td className="px-5 py-3 font-medium text-slate-900">{eventDescription(event)}{event.path && <span className="mt-1 block break-all text-xs text-slate-500">{event.path}</span>}</td><td className="px-5 py-3 text-slate-700">{event.actorName}</td><td className="px-5 py-3 text-slate-700">{event.targetName}</td><td className="px-5 py-3 text-xs text-slate-600">{event.ip || 'No disponible'}</td><td className="px-5 py-3 text-slate-700">{({ ATTEMPT: 'Comprobación previa', SUCCESS: 'Guardado', DENIED: 'Bloqueado', FAILED: 'No completado' } as Record<string,string>)[event.outcome || ''] || 'Registrado'}{event.reason && <span className="mt-1 block text-xs text-slate-500">Motivo: {event.reason}</span>}</td></tr>)}</tbody>
        </table>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm">
        <button type="button" disabled={historyLoading || historyOffset === 0} onClick={() => setHistoryOffset(value => Math.max(0, value - HISTORY_LIMIT))} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40">Anterior</button>
        <span>{historyTotal ? `${historyOffset + 1}–${Math.min(historyOffset + HISTORY_LIMIT, historyTotal)} de ${historyTotal}` : 'Sin eventos'}</span>
        <button type="button" disabled={historyLoading || historyOffset + HISTORY_LIMIT >= historyTotal} onClick={() => setHistoryOffset(value => value + HISTORY_LIMIT)} className="rounded-lg border px-3 py-2 font-semibold disabled:opacity-40">Siguiente</button>
      </div>
    </section>}

    {confirmOpen && selectedTarget && <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) setConfirmOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="confirmar-actuacion-title" aria-describedby="confirmar-actuacion-description" className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4"><div><h2 id="confirmar-actuacion-title" className="text-xl font-bold text-slate-950">Confirmar actuación real</h2><p id="confirmar-actuacion-description" className="mt-2 text-sm leading-6 text-slate-600">Vas a iniciar una sesión temporal como <strong className="text-slate-900">{selectedTarget.nombre}</strong>. Las acciones no son una vista previa.</p></div><button type="button" aria-label="Cancelar confirmación" disabled={submitting} onClick={() => setConfirmOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button></div>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Importante:</strong> aparecerá una banda persistente para volver a tu usuario y la sesión caduca como máximo en 60 minutos.</div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" disabled={submitting} onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50">Cancelar</button><button ref={confirmButtonRef} type="button" disabled={submitting} onClick={() => startAttempt && void sendStart(startAttempt)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:opacity-60">{submitting && <ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" />}{submitting ? 'Iniciando…' : 'Sí, iniciar actuación real'}</button></div>
      </section>
    </div>}
  </div>
}

function ClockBadge() {
  return <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-current text-[10px]">60</span>
}
