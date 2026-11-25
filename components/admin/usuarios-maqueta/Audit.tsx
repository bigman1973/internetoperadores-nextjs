'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Panel } from '@/components/io-ui/kit'
import type { UsersAuditEvent } from '@/lib/area4/users-contract'
import { formatDate, readResponse } from './model'

type RawEvent = {
  id: string; operacion: string; areaCodigo: string | null; createdAt: string;
  actor: { id: number; nombre: string } | null;
  objetivoUsuario: { id: number; nombre: string } | null;
  antes: unknown; despues: unknown; origen: string | null;
}
type AuditPage = { events: RawEvent[]; nextCursor: string | null }

function toEvent(raw: RawEvent): UsersAuditEvent {
  const detail = [raw.areaCodigo, raw.origen,
    raw.antes != null ? `Antes: ${JSON.stringify(raw.antes)}` : '',
    raw.despues != null ? `Después: ${JSON.stringify(raw.despues)}` : '',
  ].filter(Boolean).join('\n')
  return {
    id: raw.id, createdAt: raw.createdAt, operation: raw.operacion,
    actorName: raw.actor?.nombre ?? 'Actor no disponible',
    targetUserId: raw.objetivoUsuario?.id ?? null, targetName: raw.objetivoUsuario?.nombre ?? null, detail,
  }
}

/** undefined = auditoría global; null = sin persona seleccionada. */
export function useUsersAudit(userId?: number | null) {
  const [events, setEvents] = useState<UsersAuditEvent[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef<AbortController | null>(null)
  const load = useCallback(async (next: string | null = null) => {
    if (userId === null) return
    if (next && requestRef.current) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ limit: userId === undefined ? '50' : '20' })
      if (userId !== undefined) query.set('usuarioId', String(userId))
      if (next) query.set('cursor', next)
      const data = await readResponse<AuditPage>(await fetch(`/api/admin/auditoria?${query}`, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } }))
      if (!Array.isArray(data.events)) throw new Error('No se pudo verificar el registro de auditoría.')
      if (!controller.signal.aborted && requestRef.current === controller) {
        setEvents(previous => {
          const combined = next ? [...previous, ...data.events.map(toEvent)] : data.events.map(toEvent)
          return combined.filter((event, index) => combined.findIndex(item => item.id === event.id) === index)
        })
        setCursor(data.nextCursor)
      }
    } catch (cause) {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setError(cause instanceof Error ? cause.message : 'No se pudo leer la auditoría.')
        setEvents([])
        setCursor(null)
      }
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setLoading(false) }
    }
  }, [userId])
  useEffect(() => {
    setEvents([])
    setCursor(null)
    setError('')
    if (userId !== null) void load()
    return () => { requestRef.current?.abort(); requestRef.current = null }
  }, [load, userId])
  return { events, cursor, loading, error, load }
}

export function AuditLog({ events, empty = 'No hay eventos registrados en la auditoría cargada.' }: { events: UsersAuditEvent[]; empty?: string }) {
  return <div className="log">{events.length ? events.map(event => <div className="item" key={event.id}>
    <span>{formatDate(event.createdAt)}</span>
    <div><b>{event.actorName}</b> · {event.operation}{event.targetName && <> · {event.targetName}</>}
      {event.detail && <details><summary className="small muted">Ver detalle registrado</summary><p className="area4-audit-detail">{event.detail}</p></details>}
    </div>
  </div>) : <p className="small muted">{empty}</p>}</div>
}

export function AuditPanel({ audit }: { audit: ReturnType<typeof useUsersAudit> }) {
  return <Panel title="Auditoría" help="Quién ha cambiado qué. Solo la ve el propietario y no se puede modificar.">
    <div className="area4-toolbar"><span className="small muted">Eventos reales · {audit.events.length} cargados</span>
      <button className="btn small" type="button" disabled={audit.loading} onClick={() => void audit.load()}>Actualizar registro</button>
    </div>
    {audit.error && <p className="area4-error" role="alert">{audit.error}</p>}
    {audit.loading && <p className="small muted" role="status">Cargando auditoría…</p>}
    <AuditLog events={audit.events} />
    {audit.cursor && <div className="area4-buttons row"><button className="btn" type="button" disabled={audit.loading} onClick={() => void audit.load(audit.cursor)}>Cargar eventos anteriores</button></div>}
  </Panel>
}
