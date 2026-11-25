'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Dialog from './Dialog'
import { readResponse } from './model'

type Configuration = { menuAgrupadoParaPropietario: boolean; menuAgrupadoParaTodos: boolean }
type Mode = 'off' | 'owner' | 'all'
const MODES: { key: Mode; label: string }[] = [{ key: 'off', label: 'Apagado' }, { key: 'owner', label: 'Solo yo' }, { key: 'all', label: 'Todos' }]
const modeConfiguration = (mode: Mode): Configuration => ({ menuAgrupadoParaPropietario: mode !== 'off', menuAgrupadoParaTodos: mode === 'all' })

export default function MenuControl({ onSaved }: { onSaved: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode | null>(null)
  const [pending, setPending] = useState<Mode | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/admin/usuarios/menu-presentacion', { cache: 'no-store', signal: controller.signal })
      .then(response => readResponse<{ configuracion: Configuration }>(response))
      .then(data => {
        if (typeof data.configuracion?.menuAgrupadoParaPropietario !== 'boolean' || typeof data.configuracion?.menuAgrupadoParaTodos !== 'boolean') throw new Error('La configuración del menú no es válida.')
        setMode(data.configuracion.menuAgrupadoParaTodos ? 'all' : data.configuracion.menuAgrupadoParaPropietario ? 'owner' : 'off')
      })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'No se pudo leer el interruptor.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function confirm() {
    if (!pending || saving) return
    setSaving(true)
    setError('')
    try {
      const data = await readResponse<{ ok: boolean; configuracion: Configuration }>(await fetch('/api/admin/usuarios/menu-presentacion', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modeConfiguration(pending)),
      }))
      if (data.ok !== true || !data.configuracion) throw new Error('El servidor no confirmó el cambio del menú.')
      setMode(data.configuracion.menuAgrupadoParaTodos ? 'all' : data.configuracion.menuAgrupadoParaPropietario ? 'owner' : 'off')
      setPending(null)
      onSaved()
      router.refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se confirmó el cambio del menú.') }
    finally { setSaving(false) }
  }

  return <>
    <div className="toggle"><b>Menú en 7 grupos</b><span>Prueba el menú nuevo antes de enseñarlo a todos.</span>
      <div className="seg" role="group" aria-label="Menú nuevo">{MODES.map(item => <button key={item.key} type="button" aria-pressed={mode === item.key} disabled={loading || saving || mode === null} onClick={() => { if (mode !== item.key) { setError(''); setPending(item.key) } }}>{item.label}</button>)}</div>
      <span className="muted small">Se puede volver al menú anterior en cualquier momento.</span>
      {loading && <span className="small muted" role="status">Comprobando configuración…</span>}
      {error && !pending && <span className="area4-error" role="alert">{error}</span>}
    </div>
    {pending && <Dialog title="Confirmar presentación del menú" onClose={() => setPending(null)} busy={saving}>
      <p>El menú pasará de <b>{MODES.find(item => item.key === mode)?.label}</b> a <b>{MODES.find(item => item.key === pending)?.label}</b>.</p>
      <p className="small muted">Solo cambia la presentación. No cambia ninguna URL ni concede permisos. La actuación conserva las restricciones del servidor. Puedes revertirlo con este mismo control.</p>
      {error && <p className="area4-error" role="alert">{error}</p>}
      <div className="row area4-buttons"><button className="btn" type="button" disabled={saving} onClick={() => setPending(null)}>Cancelar</button><button className="btn primary" type="button" disabled={saving} onClick={() => void confirm()}>{saving ? 'Guardando…' : 'Confirmar cambio de menú'}</button></div>
    </Dialog>}
  </>
}
