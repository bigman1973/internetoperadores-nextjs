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

interface Perfil {
  id: string
  nombre: string
  descripcion: string | null
  color: string
  permisos: Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }>
}

export default function PermisosUsuarioModal({ usuarioId, usuarioNombre, onClose }: Props) {
  const [areas, setAreas] = useState<Area[]>([])
  const [permisos, setPermisos] = useState<PermisoUsuario[]>([])
  const [perfiles, setPerfiles] = useState<Perfil[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [showSavePerfil, setShowSavePerfil] = useState(false)
  const [newPerfilNombre, setNewPerfilNombre] = useState('')

  useEffect(() => {
    loadData()
  }, [usuarioId])

  async function loadData() {
    setLoading(true)
    try {
      const [areasRes, permisosRes, perfilesRes] = await Promise.all([
        fetch('/api/admin/permisos?action=areas'),
        fetch(`/api/admin/permisos?action=usuario&usuarioId=${usuarioId}`),
        fetch('/api/admin/permisos?action=perfiles'),
      ])
      const areasData = await areasRes.json()
      const permisosData = await permisosRes.json()
      const perfilesData = await perfilesRes.json()

      setAreas(areasData.areas || [])
      setPermisos((permisosData.permisos || []).map((p: any) => ({
        areaId: p.areaId,
        codigo: p.area.codigo,
        lectura: p.lectura,
        escritura: p.escritura,
      })))
      setPerfiles(perfilesData.perfiles || [])
    } catch (err) {
      console.error('Error cargando permisos:', err)
    } finally {
      setLoading(false)
    }
  }

  async function aplicarPerfil(perfil: Perfil) {
    if (!confirm(`¿Aplicar perfil "${perfil.nombre}" a ${usuarioNombre}? Esto reemplazará todos los permisos actuales.`)) return
    setSaving(true)
    try {
      await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'aplicar_perfil', usuarioId, perfilId: perfil.id }),
      })
      await loadData()
    } catch (err) {
      console.error('Error aplicando perfil:', err)
    } finally {
      setSaving(false)
    }
  }

  async function guardarComoPerfil() {
    if (!newPerfilNombre.trim()) return
    const perfilPermisos = permisos
      .filter(p => p.lectura || p.escritura)
      .map(p => ({ areaCodigo: p.codigo, lectura: p.lectura, escritura: p.escritura }))

    try {
      await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'guardar_perfil',
          nombre: newPerfilNombre.trim(),
          descripcion: `Creado desde permisos de ${usuarioNombre}`,
          color: '#6366f1',
          permisos: perfilPermisos,
        }),
      })
      setShowSavePerfil(false)
      setNewPerfilNombre('')
      const res = await fetch('/api/admin/permisos?action=perfiles')
      const data = await res.json()
      setPerfiles(data.perfiles || [])
    } catch (err) {
      console.error('Error guardando perfil:', err)
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
        if (tipo === 'escritura' && newVal) {
          return prev.map(p => p.areaId === area.id ? { ...p, escritura: true, lectura: true } : p)
        }
        if (tipo === 'lectura' && !newVal) {
          return prev.map(p => p.areaId === area.id ? { ...p, lectura: false, escritura: false } : p)
        }
        return prev.map(p => p.areaId === area.id ? { ...p, [tipo]: newVal } : p)
      } else {
        return [...prev, {
          areaId: area.id,
          codigo: area.codigo,
          lectura: true,
          escritura: tipo === 'escritura',
        }]
      }
    })
  }

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
          updated.push({ areaId: area.id, codigo: area.codigo, lectura: true, escritura: tipo === 'escritura' })
        }
      }
      return updated
    })
  }

  async function guardar() {
    setSaving(true)
    try {
      const allPermisos = areas.map(area => {
        const p = permisos.find(pe => pe.areaId === area.id)
        return { areaId: area.id, lectura: p?.lectura || false, escritura: p?.escritura || false }
      })
      await fetch('/api/admin/permisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'asignar_masivo', usuarioId, permisos: allPermisos }),
      })
      onClose()
    } catch (err) {
      console.error('Error guardando permisos:', err)
    } finally {
      setSaving(false)
    }
  }

  function getHijos(parentCodigo: string | null): Area[] {
    if (parentCodigo === null) return areas.filter(a => !a.padre).sort((a, b) => a.orden - b.orden)
    return areas.filter(a => a.padre === parentCodigo).sort((a, b) => a.orden - b.orden)
  }

  function renderArea(area: Area, depth: number = 0): React.ReactNode {
    const hijos = getHijos(area.codigo)
    const tieneHijos = hijos.length > 0
    const isExpanded = expandedGroups.has(area.codigo)
    const permiso = getPermiso(area.id)
    const isRoot = depth === 0
    const displayName = area.nombre.includes(' > ') ? area.nombre.split(' > ').pop() : area.nombre

    return (
      <div key={area.id}>
        <div
          className={`flex items-center gap-2 rounded-lg transition-all ${
            isRoot
              ? `px-4 py-3 ${permiso.lectura ? 'bg-indigo-50/60 border border-indigo-200' : 'bg-white border border-gray-200'}`
              : `px-3 py-2 ${permiso.lectura ? 'bg-white/80' : 'hover:bg-gray-50/50'}`
          }`}
          style={{ marginLeft: isRoot ? 0 : `${depth * 20}px` }}
        >
          {/* Expand/collapse */}
          {tieneHijos ? (
            <button
              onClick={() => setExpandedGroups(prev => {
                const next = new Set(prev)
                if (next.has(area.codigo)) next.delete(area.codigo)
                else next.add(area.codigo)
                return next
              })}
              className={`p-1 rounded-md transition-colors ${
                isRoot ? 'text-indigo-500 hover:bg-indigo-100' : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ) : (
            <span className="w-[26px] flex justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
            </span>
          )}

          {/* Nombre */}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={`${
              isRoot ? 'text-sm font-bold text-gray-900' : `text-xs ${permiso.lectura ? 'text-gray-800 font-medium' : 'text-gray-500'}`
            }`}>
              {displayName}
            </span>
            {tieneHijos && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                isRoot ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {hijos.length}
              </span>
            )}
          </div>

          {/* Botones de permiso */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => togglePermiso(area, 'lectura')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                permiso.lectura
                  ? 'bg-blue-100 text-blue-700 shadow-sm'
                  : 'bg-gray-100 text-gray-400 hover:bg-blue-50 hover:text-blue-600'
              }`}
            >
              Ver
            </button>
            <button
              onClick={() => togglePermiso(area, 'escritura')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                permiso.escritura
                  ? 'bg-green-100 text-green-700 shadow-sm'
                  : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-600'
              }`}
            >
              Editar
            </button>
            {tieneHijos && (
              <button
                onClick={() => toggleGrupo(area.codigo, 'escritura', true)}
                className="p-1 rounded-md bg-indigo-50 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 transition-colors"
                title="Dar acceso completo a este grupo y subapartados"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Hijos recursivos */}
        {tieneHijos && isExpanded && (
          <div className={`${isRoot ? 'mt-1 ml-4 pl-3 border-l-2 border-indigo-100' : 'mt-0.5 ml-3 pl-2 border-l border-gray-200'} space-y-0.5`}>
            {hijos.map(child => renderArea(child, depth + 1))}
          </div>
        )}
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Permisos de Acceso</h2>
            <p className="text-sm text-gray-600 mt-0.5">{usuarioNombre}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/80 text-gray-400 hover:text-gray-700 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Perfiles rápidos */}
        {perfiles.length > 0 && (
          <div className="px-6 py-3 border-b">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-gray-700">Aplicar perfil:</span>
              {perfiles.map(perfil => (
                <button
                  key={perfil.id}
                  onClick={() => aplicarPerfil(perfil)}
                  disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium rounded-full border transition-colors hover:shadow-sm disabled:opacity-50"
                  style={{ borderColor: perfil.color + '40', color: perfil.color, backgroundColor: perfil.color + '10' }}
                  title={perfil.descripcion || ''}
                >
                  {perfil.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Leyenda */}
        <div className="px-6 py-2.5 bg-indigo-50/50 border-b flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Ver = acceso de lectura
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Editar = crear, modificar y eliminar
            </span>
          </div>
          <span className="text-[10px] text-gray-400">Los subapartados heredan del padre</span>
        </div>

        {/* Árbol de permisos */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-1.5">
            {areasRaiz.map(area => renderArea(area, 0))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                {permisos.filter(p => p.lectura).length} secciones
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                {permisos.filter(p => p.escritura).length} editables
              </span>
            </div>
            {!showSavePerfil ? (
              <button onClick={() => setShowSavePerfil(true)} className="text-xs text-indigo-600 hover:text-indigo-800 underline">
                Guardar como perfil
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPerfilNombre}
                  onChange={e => setNewPerfilNombre(e.target.value)}
                  placeholder="Nombre del perfil..."
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 w-40 text-gray-900"
                  onKeyDown={e => e.key === 'Enter' && guardarComoPerfil()}
                />
                <button onClick={guardarComoPerfil} className="text-xs text-green-600 font-semibold">Crear</button>
                <button onClick={() => setShowSavePerfil(false)} className="text-xs text-gray-400">✕</button>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={saving}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? 'Guardando...' : 'Guardar Permisos'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
