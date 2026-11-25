'use client'

import { useEffect, useState } from 'react'
import type { UsersPerson } from '@/lib/area4/users-contract'
import { notifyActuationChanged, useActuation } from '@/components/impersonation/ActuationProvider'
import { actuationControlHeaders } from '@/components/impersonation/control-client'
import { createStartAttempt, retryStartAttempt, safeInternalRedirect, type StartAttempt } from '@/components/impersonation/contract'
import Dialog from './Dialog'
import { readResponse } from './model'

export default function ActuationDialog({ person, onClose }: { person: UsersPerson; onClose: () => void }) {
  const { state, active, canStart, loading, refresh } = useActuation()
  const [reason, setReason] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [attempt, setAttempt] = useState<StartAttempt | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { void refresh() }, [refresh])
  const authorized = Boolean(canStart && !active && state?.targets.some(target => target.id === person.id) && person.active && !person.protected)

  async function start() {
    if (saving || !authorized || !understood) return
    setSaving(true)
    setError('')
    let request = attempt
    try {
      if (!request) {
        if (typeof window.crypto?.randomUUID !== 'function') throw new Error('El navegador no puede preparar una solicitud segura.')
        request = createStartAttempt(person.id, reason, () => window.crypto.randomUUID())
        setAttempt(request)
      }
      const result = await readResponse<{ ok: boolean; redirectTo: unknown }>(await fetch('/api/admin/actuar-como', {
        method: 'POST', headers: await actuationControlHeaders(),
        body: JSON.stringify({ action: 'iniciar', targetId: request.targetId, ...(request.motivo ? { motivo: request.motivo } : {}), idempotencyKey: request.idempotencyKey }),
      }))
      if (result.ok !== true) throw new Error('El servidor no confirmó la actuación.')
      // La cookie firmada la emite el servidor. Nunca se altera una identidad en el cliente.
      notifyActuationChanged()
      window.location.assign(safeInternalRedirect(result.redirectTo, '/admin'))
    } catch (cause) {
      if (request) setAttempt(retryStartAttempt(request))
      setError(cause instanceof Error ? cause.message : 'No se pudo confirmar el inicio. Reintenta la misma solicitud.')
      setSaving(false)
    }
  }

  return <Dialog title={`Ver como ${person.name}`} onClose={onClose} busy={saving}>
    <div className="note"><b>Esto no es una simulación.</b> Se iniciará una actuación real y temporal con los permisos actuales de la persona. Las acciones se aplican de verdad y quedan registradas. El borrador no se aplica ni modifica la sesión.</div>
    <p className="small muted">Para volver usa la banda naranja «Volver a mi usuario». La sesión caduca como máximo en 60 minutos y conserva las restricciones del servidor.</p>
    {loading && <p role="status" className="small muted">Comprobando destinos autorizados…</p>}
    {active && <p className="area4-error">Ya estás actuando como {active.targetName}. Vuelve primero a tu usuario desde la banda superior.</p>}
    {!loading && !authorized && <p className="small muted">No se puede iniciar aquí para esta persona. Abre el <a href="/admin/actuar-como">control de actuación existente</a> y comprueba los destinos autorizados. No se ha cambiado ni simulado la identidad.</p>}
    {authorized && <><div className="fld"><label htmlFor="actuation-reason">Motivo (opcional)</label><textarea id="actuation-reason" rows={3} maxLength={500} value={reason} disabled={saving || Boolean(attempt)} onChange={event => setReason(event.target.value)} /></div>
      <label className="chk"><input type="checkbox" checked={understood} disabled={saving || Boolean(attempt)} onChange={event => setUnderstood(event.target.checked)} />Entiendo que iniciaré una actuación real como {person.name}, no una vista previa de la propuesta.</label></>}
    {error && <p role="alert" className="area4-error">{error}</p>}
    {attempt && error && <p className="small muted">El reintento conserva persona, motivo e identificador para evitar duplicados. Si sales del diálogo, verifica el estado en el control de actuación antes de iniciar otra solicitud.</p>}
    <div className="row area4-buttons"><button className="btn" type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className="btn primary" type="button" disabled={loading || saving || !authorized || !understood} onClick={() => void start()}>{saving ? 'Iniciando…' : attempt && error ? 'Reintentar la misma solicitud' : 'Confirmar actuación real'}</button></div>
  </Dialog>
}
