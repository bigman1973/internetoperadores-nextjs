'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

/** Mío / Equipo. Solo se muestra activo a gerente y superadmin; el servidor vuelve a validarlo. */
export function AlcanceSeg({ alcance, habilitado }: { alcance: 'MIO' | 'EQUIPO'; habilitado: boolean }) {
  const router = useRouter()
  const sp = useSearchParams()
  const ir = (valor: 'mio' | 'equipo') => {
    const q = new URLSearchParams(sp?.toString() || '')
    if (valor === 'mio') q.delete('alcance'); else q.set('alcance', 'equipo')
    router.push(`/admin/crm${q.toString() ? `?${q}` : ''}`)
  }
  return (
    <div className="seg" role="group" aria-label="Alcance">
      <button type="button" aria-pressed={alcance === 'MIO'} onClick={() => ir('mio')}>Mío</button>
      {habilitado && <button type="button" aria-pressed={alcance === 'EQUIPO'} onClick={() => ir('equipo')}>Equipo</button>}
    </div>
  )
}

/** «Ver como»: solo se renderiza para superadmin (el servidor ignora el parámetro para el resto). */
export function VerComo({ opciones, actual }: { opciones: Array<{ id: number | null; etiqueta: string }>; actual: number | null }) {
  const router = useRouter()
  const sp = useSearchParams()
  return (
    <select
      className="f"
      aria-label="Ver como"
      value={actual == null ? '' : String(actual)}
      onChange={(e) => {
        const q = new URLSearchParams(sp?.toString() || '')
        if (e.target.value) q.set('verComo', e.target.value); else q.delete('verComo')
        router.push(`/admin/crm${q.toString() ? `?${q}` : ''}`)
      }}
    >
      {opciones.map((o) => <option key={o.id ?? 'yo'} value={o.id == null ? '' : String(o.id)}>{o.etiqueta}</option>)}
    </select>
  )
}

/** Marca una tarea como hecha con la API existente de tareas (PATCH, con control de concurrencia). */
export function TareaHecho({ id, deshabilitado }: { id: string; deshabilitado?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <button
      className="btn small"
      type="button"
      disabled={deshabilitado || pending}
      title={msg || (deshabilitado ? 'En «Ver como» no se modifican datos' : undefined)}
      onClick={() => start(async () => {
        setMsg(null)
        const r = await fetch(`/api/admin/crm/tareas/${encodeURIComponent(id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'COMPLETADA', expectedState: 'PENDIENTE' }),
        }).catch(() => null)
        if (!r || !r.ok) { const j = r ? await r.json().catch(() => null) : null; setMsg(j?.error || 'No se ha podido marcar'); return }
        router.refresh()
      })}
    >{msg ? 'Reintentar' : 'Hecho'}</button>
  )
}
