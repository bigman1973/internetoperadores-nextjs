'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface Area {
  id: string
  codigo: string
  nombre: string
  padre: string | null
  orden: number
}

interface PermisoUsuario {
  areaId: string
  codigo: string
  lectura: boolean
  escritura: boolean
}

interface Props {
  usuarioId: number
  usuarioNombre: string
  onClose: () => void
}

export default function PermisosUsuarioModal({ usuarioId, usuarioNombre, onClose }: Props) {
  const [areas, setAreas] = useState<Area[]>([])
  const [permisos, setPermisos] = useState<PermisoUsuario[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadData()
  }, [usuarioId])

  async function loadData() {
    setLoading(true)
    try {
      const [areasRes, permisosRes] = await Promise.all([
        fetch('/api/admin/permisos?action=areas'),
        fetch(`/api/admin/permisos?action=usuario&usuarioId=${usuarioId}`),
      ])
      const areasData = await areasRes.json()
      const permisosData = await permisosRes.json()

      setAreas(areasData.areas || [])
      setPermisos((permisosData.permisos || []).map((p: any) => ({
        areaId: p.areaId,
        codigo: p.area.codigo,
        lectura: p.lectura,
        escritura: p.escritura,
      })))
    } catch (err) {
      console.error('Error cargando permisos:', err)
    } finally {
      setLoading(false)
    }
  }

  function getPermiso(areaId: string): { lectura: boolean; escritura: boolean } {
    const p = permisos.find(p => p.areaId === areaId)
    return p ? { lectura: p.lectura, escritura: p.escritura } : { lectura: false, escritura: false }
  }

  function togglePermiso(area: Area, tipo: 'lectura' | 'escritura') {
    setPermisos(prev => {
      const existing = prev.find(p => p.areaId === area.id)
      if (existing) {
        const newVal = !existing[tipo]
        // Si se activa escritura, activar también lectura
        if (tipo === 'escritura' && newVal) {
          return prev.map(p => p.areaId === area.id ? { ...p, escritura: true, lectura: true } : p)
        }
        // Si se desactiva lectura, desactivar también escritura
        if (tipo === 'lectura' && !newVal) {
          return prev.map(p => p.areaId === area.id ? { ...p, lectura: false, escritura: false } : p)
        }
        return prev.map(p => p.areaId === area.id ? { ...p, [tipo]: newVal } : p)
      } else {
        const newPermiso: PermisoUsuario = {
          areaId: area.id,
          codigo: area.codigo,
          lectura: tipo === 'lectura' ? true : true,
          escritura: tipo === 'escritura' ? true : false,
        }
        return [...prev, newPermiso]
      }
    })
  }

  // Activar/desactivar todo un grupo (padre + hijos)
  function toggleGrupo(parentCodigo: string, tipo: 'lectura' | 'escritura', value: boolean) {
    const areasGrupo = areas.filter(a => a.codigo === parentCodigo || a.codigo.startsWith(parentCodigo + '.'))
    setPermisos(prev => {
      let updated = [...prev]
      for (const area of areasGrupo) {
        const existing = updated.find(p => p.areaId === area.id)
        if (existing) {
          if (tipo === 'escritura') {
            updated = updated.map(p => p.areaId === area.id ? { ...p, escritura: value, lectura: value ? true : p.lectura } : p)
          } else {
            updated = updated.map(p => p.areaId === area.id ? { ...p, lectura: value, escritura: value ? p.escritura : false } : p)
          }
        } else if (value) {
          updated.push({
            areaId: area.id,
            codigo: area.codigo,
            lectura: true,
            escritura: tipo === 'escritura' ? true : false,
          })
        }
      }
      return updated
    })
  }

  async function guardar() {
    setSaving(true)
    try {
      // Enviar todos los permisos (incluidos los que están en false para revocar)
      const allPermisos = areas.map(area => {
        const p = permisos.find(pe => pe.areaId === area.id)
        return {
          areaId: area.id,
          lectura: p?.lectura || false,
          escritura: p?.escritura || false,
        }
      })

      await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'asignar_masivo',
          usuarioId,
          permisos: allPermisos,
        }),
      })

      onClose()
    } catch (err) {
      console.error('Error guardando permisos:', err)
    } finally {
      setSaving(false)
    }
  }

  function toggleExpand(codigo: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(codigo)) next.delete(codigo)
      else next.add(codigo)
      return next
    })
  }

  // Organizar áreas en árbol
  function getHijos(parentCodigo: string | null): Area[] {
    if (parentCodigo === null) return areas.filter(a => !a.padre)
    return areas.filter(a => a.padre === parentCodigo)
  }

  function renderArea(area: Area, depth: number = 0) {
    const hijos = getHijos(area.codigo)
    const tieneHijos = hijos.length > 0
    const isExpanded = expandedGroups.has(area.codigo)
    const permiso = getPermiso(area.id)
    const indent = depth * 20

    return (
      <div key={area.id}>
        <div 
          className={`flex items-center gap-3 py-2 px-3 hover:bg-gray-50 border-b border-gray-50 ${depth === 0 ? 'bg-gray-50 font-semibold' : ''}`}
          style={{ paddingLeft: `${12 + indent}px` }}
        >
          {/* Expand/collapse */}
          {tieneHijos ? (
            <button onClick={() => toggleExpand(area.codigo)} className="w-4 text-gray-400 hover:text-gray-700 text-xs">
              {isExpanded ? '▼' : '▶'}
            </button>
          ) : (
            <span className="w-4" />
          )}

          {/* Nombre del área */}
          <span className={`flex-1 text-xs ${depth === 0 ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>
            {area.nombre}
          </span>

          {/* Código */}
          <span className="text-[9px] text-gray-400 font-mono hidden md:block w-48 truncate">
            {area.codigo}
          </span>

          {/* Checkboxes lectura/escritura */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={permiso.lectura}
                onChange={() => togglePermiso(area, 'lectura')}
                className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-[10px] text-gray-500">Leer</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={permiso.escritura}
                onChange={() => togglePermiso(area, 'escritura')}
                className="w-3.5 h-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-[10px] text-gray-500">Escribir</span>
            </label>
          </div>

          {/* Botón todo grupo */}
          {tieneHijos && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleGrupo(area.codigo, 'lectura', true)}
                className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                title="Dar lectura a todo el grupo"
              >
                +L
              </button>
              <button
                onClick={() => toggleGrupo(area.codigo, 'escritura', true)}
                className="text-[9px] px-1.5 py-0.5 bg-green-50 text-green-600 rounded hover:bg-green-100"
                title="Dar escritura a todo el grupo"
              >
                +E
              </button>
              <button
                onClick={() => toggleGrupo(area.codigo, 'lectura', false)}
                className="text-[9px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                title="Quitar todo acceso al grupo"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Hijos */}
        {tieneHijos && isExpanded && hijos.map(h => renderArea(h, depth + 1))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-xl p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="text-sm text-gray-500 mt-3">Cargando permisos...</p>
        </div>
      </div>
    )
  }

  const areasRaiz = getHijos(null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Permisos Granulares</h2>
            <p className="text-sm text-gray-500">{usuarioNombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Leyenda */}
        <div className="px-6 py-2 bg-gray-50 border-b flex items-center gap-4 text-[10px] text-gray-500">
          <span><strong>Herencia:</strong> Si das acceso a un padre, los hijos heredan automáticamente.</span>
          <span className="text-blue-600">Leer = ver la sección</span>
          <span className="text-green-600">Escribir = crear/editar/eliminar</span>
        </div>

        {/* Tabla de permisos */}
        <div className="flex-1 overflow-y-auto">
          {areasRaiz.map(area => renderArea(area, 0))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div className="text-[10px] text-gray-400">
            {permisos.filter(p => p.lectura).length} áreas con lectura · {permisos.filter(p => p.escritura).length} con escritura
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Permisos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
