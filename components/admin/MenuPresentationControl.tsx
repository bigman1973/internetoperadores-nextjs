'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Configuracion = {
  menuAgrupadoParaPropietario: boolean
  menuAgrupadoParaTodos: boolean
}

const INITIAL: Configuracion = {
  menuAgrupadoParaPropietario: false,
  menuAgrupadoParaTodos: false,
}

export default function MenuPresentationControl() {
  const router = useRouter()
  const [configuracion, setConfiguracion] = useState<Configuracion>(INITIAL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/admin/usuarios/menu-presentacion')
      .then(async response => {
        if (!response.ok) throw new Error('No se pudo leer la configuración del menú.')
        return response.json()
      })
      .then(data => {
        if (active && data.configuracion) setConfiguracion(data.configuracion)
      })
      .catch(() => {
        if (active) setError('El interruptor estará disponible al aplicar la migración de Área 4.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function guardar(next: Configuracion) {
    setSaving(true)
    setError('')
    try {
      const response = await fetch('/api/admin/usuarios/menu-presentacion', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'No se pudo actualizar el menú.')
      setConfiguracion(data.configuracion)
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el menú.')
    } finally {
      setSaving(false)
    }
  }

  const disabled = loading || saving
  return (
    <section aria-labelledby="menu-agrupado-title" className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
      <h2 id="menu-agrupado-title" className="text-sm font-bold text-[#2D2A26]">Menú agrupado (prueba controlada)</h2>
      <p className="mt-1 text-sm text-slate-700">Solo cambia la forma de mostrar el menú. Los permisos y las direcciones de las páginas no cambian.</p>
      <div className="mt-3 space-y-2">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
          <span><strong>Ver solo yo</strong><span className="block text-xs text-slate-500">Prueba los siete grupos sin mostrar el cambio al resto.</span></span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#FF5300]"
            checked={configuracion.menuAgrupadoParaPropietario}
            disabled={disabled}
            onChange={event => guardar({ menuAgrupadoParaPropietario: event.target.checked, menuAgrupadoParaTodos: event.target.checked ? configuracion.menuAgrupadoParaTodos : false })}
            aria-label="Mostrar el menú agrupado solo a Víctor"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-slate-800">
          <span><strong>Ver todos</strong><span className="block text-xs text-slate-500">Solo actívalo después de revisar la prueba personal.</span></span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-[#FF5300]"
            checked={configuracion.menuAgrupadoParaTodos}
            disabled={disabled}
            onChange={event => guardar({ menuAgrupadoParaPropietario: event.target.checked || configuracion.menuAgrupadoParaPropietario, menuAgrupadoParaTodos: event.target.checked })}
            aria-label="Mostrar el menú agrupado a todas las personas"
          />
        </label>
      </div>
      {loading && <p className="mt-2 text-xs text-slate-500">Comprobando configuración…</p>}
      {saving && <p className="mt-2 text-xs text-slate-500">Guardando y actualizando el menú…</p>}
      {error && <p role="alert" className="mt-2 text-xs font-medium text-red-700">{error}</p>}
    </section>
  )
}
