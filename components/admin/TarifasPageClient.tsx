'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  PlusIcon, MagnifyingGlassIcon, ArrowPathIcon,
  ChevronDownIcon, ChevronRightIcon, ChevronUpIcon,
  PencilIcon, TrashIcon, DocumentDuplicateIcon,
  StarIcon, PhoneIcon, GlobeAltIcon, DevicePhoneMobileIcon, TvIcon,
  TableCellsIcon, Squares2X2Icon,
  EyeIcon, EyeSlashIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid'

interface Tarifa {
  id: number
  tipoCliente: string
  categoria: string
  subcategoria: string | null
  nombre: string
  nombreComercial: string | null
  velocidad: string | null
  precioSinIva: number
  precioConIva: number
  costeOperador: number | null
  permanencia: string | null
  destacada: boolean
  activa: boolean
  ispGestionId: string | null
  esMovil: boolean
  esFijo: boolean
  esInternet: boolean
  esTv: boolean
  esCompuesta: boolean
  velocidadBajada: string | null
  velocidadSubida: string | null
  fibraBajada: string | null
  fibraSubida: string | null
  datosIncluidos: string | null
  minutosIncluidos: string | null
  smsIncluidos: string | null
  conceptoFacturacion: string | null
  servicioPppoe: string | null
  duracionPermanenciaMeses: number | null
  observacionesPermanencia: string | null
  noFacturar: boolean
  noProrrateable: boolean
  publicarWeb: boolean
  publicarWebParticular: boolean
  publicarWebEmpresa: boolean
  seccionWebParticular: string | null
  seccionWebEmpresa: string | null
  tipoPeriodicidad: number | null
  precioPeriodo: number | null
  precioPeriodoIva: number | null
  createdBy: { nombre: string } | null
  updatedBy: { nombre: string } | null
}

interface CategoriaStats {
  categoria: string
  total: number
  activas: number
}

interface GrupoCategoria {
  categoria: string
  total: number
  activas: number
  tarifas: Tarifa[]
}

const CATEGORY_COLORS: Record<string, string> = {
  'EQUIPOS Y HARDWARE': 'bg-slate-100 text-slate-700 border-slate-300',
  'INTERNET': 'bg-orange-100 text-orange-700 border-orange-300',
  'HOSTING': 'bg-indigo-100 text-indigo-700 border-indigo-300',
  'BACKUP': 'bg-violet-100 text-violet-700 border-violet-300',
  'TELEFONÍA MÓVIL': 'bg-blue-100 text-blue-700 border-blue-300',
  'TELEFONÍA FIJA': 'bg-green-100 text-green-700 border-green-300',
  'HOTSPOT': 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-300',

  'IP Y REDES': 'bg-teal-100 text-teal-700 border-teal-300',
  'SERVICIOS IT': 'bg-amber-100 text-amber-700 border-amber-300',
  'INTERCONEXIÓN': 'bg-rose-100 text-rose-700 border-rose-300',
  'SERVIDORES': 'bg-purple-100 text-purple-700 border-purple-300',
  'LÍNEA': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'TERMINALES': 'bg-stone-100 text-stone-700 border-stone-300',
  'CENTRALITAS': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'PBX': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'BONOS': 'bg-lime-100 text-lime-700 border-lime-300',
  'DATACENTER': 'bg-sky-100 text-sky-700 border-sky-300',
  'MANTENIMIENTO': 'bg-gray-100 text-gray-700 border-gray-300',
  'CLOUD': 'bg-violet-100 text-violet-700 border-violet-300',
  'TV': 'bg-pink-100 text-pink-700 border-pink-300',
}

// Subcategorías disponibles por categoría
const SUBCATEGORIAS_POR_CATEGORIA: Record<string, string[]> = {
  'INTERNET': ['Fibra', '5G', 'Radio', 'Satélite'],
  'TELEFONÍA MÓVIL': ['Prepago', 'Contrato', 'Datos'],
  'TELEFONÍA MÓVIL (BASE)': ['Prepago', 'Contrato', 'Datos'],
  'TELEFONÍA FIJA': ['Analógica', 'VoIP', 'SIP Trunk'],
  'TELEFONÍA FIJA (TARIFA PLANA)': ['Analógica', 'VoIP', 'SIP Trunk'],
  'HOSTING': ['Compartido', 'VPS', 'Dedicado', 'Cloud'],
  'BACKUP Y CLOUD': ['Local', 'Cloud', 'Híbrido'],
  'COMUNICACIONES UNIFICADAS': ['PBX', 'UCaaS', 'Videoconferencia', 'Mensajería'],
  'EQUIPOS Y HARDWARE': ['Routers', 'Switches', 'APs', 'Terminales', 'Otros'],
}

function getCatColor(cat: string): string {
  for (const key of Object.keys(CATEGORY_COLORS)) {
    if (cat.toUpperCase().includes(key)) return CATEGORY_COLORS[key]
  }
  return 'bg-gray-100 text-gray-700 border-gray-300'
}

function formatCurrency(val: number): string {
  return val.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function ServiceBadges({ tarifa }: { tarifa: Tarifa }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tarifa.esMovil && <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700"><DevicePhoneMobileIcon className="h-3 w-3" />Móvil</span>}
      {tarifa.esFijo && <span className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-700"><PhoneIcon className="h-3 w-3" />Fijo</span>}
      {tarifa.esInternet && <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700"><GlobeAltIcon className="h-3 w-3" />Internet</span>}
      {tarifa.esTv && <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700"><TvIcon className="h-3 w-3" />TV</span>}
      {tarifa.esCompuesta && <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-50 px-1.5 py-0.5 text-xs font-medium text-yellow-700">Pack</span>}
      {!tarifa.esMovil && !tarifa.esFijo && !tarifa.esInternet && !tarifa.esTv && <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-50 px-1.5 py-0.5 text-xs font-medium text-gray-500">Servicio</span>}
    </div>
  )
}

// Inline toggle component for web publication
function WebToggle({ checked, onChange, label, colorOn, colorOff }: {
  checked: boolean; onChange: () => void; label: string; colorOn: string; colorOff: string
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onChange() }}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-all ${
        checked ? colorOn : colorOff
      }`}
      title={checked ? `Quitar de ${label}` : `Publicar en ${label}`}
    >
      <span className={`inline-block w-3 h-3 rounded-full border transition-all ${
        checked ? 'bg-white border-white/50' : 'bg-gray-300 border-gray-400'
      }`}>
        {checked && (
          <svg className="w-3 h-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </span>
      {label}
    </button>
  )
}

// Inline section selector
function SeccionSelector({ value, onChange, disabled }: {
  value: string | null; onChange: (val: string | null) => void; disabled: boolean
}) {
  return (
    <select
      value={value || ''}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value || null) }}
      onClick={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`rounded text-[11px] font-medium py-0.5 px-1 border transition-all ${
        disabled
          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
          : value
            ? 'bg-orange-50 text-orange-700 border-orange-300'
            : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
      }`}
    >
      <option value="">Sección...</option>
      <option value="internet">Internet</option>
      <option value="movil">Móvil</option>
      <option value="packs">Packs</option>
      <option value="ofertas">Ofertas</option>
    </select>
  )
}

// Inline empresa section selector
function SeccionEmpresaSelector({ value, onChange, disabled }: {
  value: string | null; onChange: (val: string | null) => void; disabled: boolean
}) {
  const labels: Record<string, string> = {
    'conectividad-avanzada': 'Conectividad',
    'comunicaciones-unificadas': 'Comunicaciones',
    'infraestructura-red': 'Infraestructura',
    'mantenimiento-it': 'Mant. IT',
    'moviles': 'Móviles',
    'exagrid': 'ExaGrid',
  }
  return (
    <select
      value={value || ''}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value || null) }}
      onClick={(e) => e.stopPropagation()}
      disabled={disabled}
      className={`rounded text-[11px] font-medium py-0.5 px-1 border transition-all ${
        disabled
          ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
          : value
            ? 'bg-orange-50 text-orange-700 border-orange-300'
            : 'bg-white text-gray-600 border-gray-300 hover:border-orange-400'
      }`}
    >
      <option value="">Solución...</option>
      <option value="conectividad-avanzada">Conectividad Avanzada</option>
      <option value="comunicaciones-unificadas">Comunicaciones Unificadas</option>
      <option value="infraestructura-red">Infraestructura de Red</option>
      <option value="mantenimiento-it">Mantenimiento IT</option>
      <option value="moviles">Móviles Empresa</option>
      <option value="exagrid">ExaGrid Backup</option>
    </select>
  )
}

type ViewMode = 'grouped' | 'list'

export default function TarifasPageClient() {
  const [stats, setStats] = useState<{ total: number; activas: number; categorias: CategoriaStats[] } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grouped')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [tipoCliente, setTipoCliente] = useState('')
  const [categoria, setCategoria] = useState('')
  const [estado, setEstado] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Grouped view
  const [grupos, setGrupos] = useState<GrupoCategoria[]>([])
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set())
  const [expandedTarifa, setExpandedTarifa] = useState<number | null>(null)

  // List view
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [listTotal, setListTotal] = useState(0)
  const [listTotalPages, setListTotalPages] = useState(1)

  // Saving state for inline edits
  const [savingWebPublish, setSavingWebPublish] = useState<Set<number>>(new Set())

  // Inline nombre comercial edit
  const [editingNombreComercial, setEditingNombreComercial] = useState<number | null>(null)
  const [nombreComercialInput, setNombreComercialInput] = useState('')
  const [savingNombreComercial, setSavingNombreComercial] = useState<Set<number>>(new Set())

  // Inline categoría/subcategoría edit
  const [editingCategoria, setEditingCategoria] = useState<number | null>(null)
  const [categoriaInput, setCategoriaInput] = useState('')
  const [subcategoriaInput, setSubcategoriaInput] = useState('')
  const [savingCategoria, setSavingCategoria] = useState<Set<number>>(new Set())
  const [categoriasDisponibles, setCategoriasDisponibles] = useState<string[]>([])
  const [subcategoriasDisponibles, setSubcategoriasDisponibles] = useState<Record<string, string[]>>({})

  useEffect(() => { fetchStats(); fetchCategoriasSubcategorias() }, [])
  useEffect(() => { fetchData() }, [viewMode, search, tipoCliente, categoria, estado, page])

  const fetchCategoriasSubcategorias = async () => {
    try {
      const res = await fetch('/api/admin/configuracion/categorias')
      if (res.ok) {
        const data = await res.json()
        const cats = data.map((c: any) => c.nombre)
        setCategoriasDisponibles(cats)
        const subMap: Record<string, string[]> = {}
        data.forEach((c: any) => {
          subMap[c.nombre] = (c.subcategorias || []).map((s: any) => s.nombre)
        })
        setSubcategoriasDisponibles(subMap)
      }
    } catch (err) { console.error(err) }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/tarifas?modo=stats')
      if (res.ok) setStats(await res.json())
    } catch (err) { console.error(err) }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('modo', viewMode)
      params.set('page', String(page))
      params.set('limit', '50')
      if (search) params.set('search', search)
      if (tipoCliente) params.set('tipoCliente', tipoCliente)
      if (categoria) params.set('categoria', categoria)
      if (estado) params.set('estado', estado)

      const res = await fetch(`/api/admin/tarifas?${params}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()

      if (viewMode === 'grouped') {
        setGrupos(data.grupos || [])
      } else {
        setTarifas(data.tarifas || [])
        setListTotal(data.total || 0)
        setListTotalPages(data.totalPages || 1)
      }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput)
  }

  const handleSync = async () => {
    alert('La sincronización de tarifas desde ISPGestión está desactivada. Las tarifas se gestionan manualmente desde este panel para evitar sobreescrituras de datos editados.')
  }

  const toggleCat = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  const clearFilters = () => {
    setSearch(''); setSearchInput(''); setTipoCliente(''); setCategoria(''); setEstado(''); setPage(1)
  }

  const handleToggleActiva = async (id: number) => {
    try {
      const findTarifa = (t: Tarifa) => t.id === id
      const tarifa = tarifas.find(findTarifa) || grupos.flatMap(g => g.tarifas).find(findTarifa)
      const res = await fetch(`/api/admin/tarifas/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activa: !tarifa?.activa }),
      })
      if (res.ok) {
        if (viewMode === 'list') {
          setTarifas(prev => prev.map(t => t.id === id ? { ...t, activa: !t.activa } : t))
        } else {
          setGrupos(prev => prev.map(g => ({
            ...g,
            tarifas: g.tarifas.map(t => t.id === id ? { ...t, activa: !t.activa } : t)
          })))
        }
      }
    } catch (err) { console.error(err) }
  }

  const handleToggleDestacada = async (id: number) => {
    try {
      const findTarifa = (t: Tarifa) => t.id === id
      const tarifa = tarifas.find(findTarifa) || grupos.flatMap(g => g.tarifas).find(findTarifa)
      const res = await fetch(`/api/admin/tarifas/${id}/destacada`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destacada: !tarifa?.destacada }),
      })
      if (res.ok) {
        if (viewMode === 'list') {
          setTarifas(prev => prev.map(t => t.id === id ? { ...t, destacada: !t.destacada } : t))
        } else {
          setGrupos(prev => prev.map(g => ({
            ...g,
            tarifas: g.tarifas.map(t => t.id === id ? { ...t, destacada: !t.destacada } : t)
          })))
        }
      }
    } catch (err) { console.error(err) }
  }

  const handleDuplicate = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/tarifas/${id}/duplicate`, { method: 'POST' })
      if (res.ok) { fetchData(); fetchStats() }
    } catch (err) { console.error(err) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta tarifa?')) return
    try {
      const res = await fetch(`/api/admin/tarifas/${id}`, { method: 'DELETE' })
      if (res.ok) {
        if (viewMode === 'list') {
          setTarifas(prev => prev.filter(t => t.id !== id))
        } else {
          setGrupos(prev => prev.map(g => ({
            ...g,
            tarifas: g.tarifas.filter(t => t.id !== id),
            total: g.tarifas.filter(t => t.id !== id).length
          })).filter(g => g.tarifas.length > 0))
        }
        fetchStats()
      }
    } catch (err) { console.error(err) }
  }

  // Inline web publication update
  const handleWebPublishChange = async (id: number, field: string, value: any) => {
    setSavingWebPublish(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/admin/tarifas/${id}/web-publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) {
        const updated = await res.json()
        const updateTarifa = (t: Tarifa): Tarifa => t.id === id ? {
          ...t,
          publicarWebParticular: updated.publicarWebParticular,
          publicarWebEmpresa: updated.publicarWebEmpresa,
          seccionWebParticular: updated.seccionWebParticular,
          seccionWebEmpresa: updated.seccionWebEmpresa,
        } : t

        if (viewMode === 'list') {
          setTarifas(prev => prev.map(updateTarifa))
        } else {
          setGrupos(prev => prev.map(g => ({
            ...g,
            tarifas: g.tarifas.map(updateTarifa)
          })))
        }
      }
    } catch (err) { console.error(err) }
    finally {
      setSavingWebPublish(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleNombreComercialEdit = (tarifa: Tarifa) => {
    setEditingNombreComercial(tarifa.id)
    setNombreComercialInput(tarifa.nombreComercial || tarifa.nombre)
  }

  const handleNombreComercialSave = async (id: number) => {
    setSavingNombreComercial(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/admin/tarifas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombreComercial: nombreComercialInput }),
      })
      if (res.ok) {
        const updateTarifa = (t: Tarifa): Tarifa => t.id === id ? { ...t, nombreComercial: nombreComercialInput } : t
        if (viewMode === 'list') {
          setTarifas(prev => prev.map(updateTarifa))
        } else {
          setGrupos(prev => prev.map(g => ({ ...g, tarifas: g.tarifas.map(updateTarifa) })))
        }
      }
    } catch (err) { console.error(err) }
    finally {
      setSavingNombreComercial(prev => { const next = new Set(prev); next.delete(id); return next })
      setEditingNombreComercial(null)
    }
  }

  const handleNombreComercialCancel = () => {
    setEditingNombreComercial(null)
    setNombreComercialInput('')
  }

  // Inline categoría/subcategoría edit
  const handleCategoriaEdit = (tarifa: Tarifa, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setEditingCategoria(tarifa.id)
    setCategoriaInput(tarifa.categoria)
    setSubcategoriaInput(tarifa.subcategoria || '')
  }

  const handleCategoriaSave = async (id: number, e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setSavingCategoria(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/admin/tarifas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoria: categoriaInput, subcategoria: subcategoriaInput || null }),
      })
      if (res.ok) {
        const updateTarifa = (t: Tarifa): Tarifa => t.id === id ? { ...t, categoria: categoriaInput, subcategoria: subcategoriaInput || null } : t
        if (viewMode === 'list') {
          setTarifas(prev => prev.map(updateTarifa))
        } else {
          setGrupos(prev => prev.map(g => ({ ...g, tarifas: g.tarifas.map(updateTarifa) })))
        }
        // No llamar fetchStats() inmediatamente para evitar re-render que cause scroll
        setTimeout(() => fetchStats(), 500)
      }
    } catch (err) { console.error(err) }
    finally {
      setSavingCategoria(prev => { const next = new Set(prev); next.delete(id); return next })
      setEditingCategoria(null)
    }
  }

  const handleCategoriaCancel = (e?: React.MouseEvent) => {
    if (e) { e.preventDefault(); e.stopPropagation() }
    setEditingCategoria(null)
    setCategoriaInput('')
    setSubcategoriaInput('')
  }

  const TarifaRow = ({ tarifa, showCategory = false }: { tarifa: Tarifa; showCategory?: boolean }) => (
    <>
      <tr className={`hover:bg-gray-50 cursor-pointer ${expandedTarifa === tarifa.id ? 'bg-gray-50' : ''}`}
          onClick={() => setExpandedTarifa(expandedTarifa === tarifa.id ? null : tarifa.id)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expandedTarifa === tarifa.id ? <ChevronUpIcon className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />}
            <div className="min-w-0">
              <div className="flex items-center gap-x-2">
                <span className="text-sm font-medium text-gray-900 truncate">{tarifa.nombre}</span>
                {tarifa.destacada && <StarIconSolid className="h-4 w-4 text-yellow-400 flex-shrink-0" />}
              </div>
              {/* Inline editable nombre comercial */}
              <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                {editingNombreComercial === tarifa.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={nombreComercialInput}
                      onChange={(e) => setNombreComercialInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleNombreComercialSave(tarifa.id); if (e.key === 'Escape') handleNombreComercialCancel() }}
                      className="text-xs px-1.5 py-0.5 border border-orange-300 rounded bg-orange-50 text-orange-800 w-48 focus:outline-none focus:ring-1 focus:ring-orange-400"
                      autoFocus
                      disabled={savingNombreComercial.has(tarifa.id)}
                    />
                    <button onClick={() => handleNombreComercialSave(tarifa.id)} className="text-green-600 hover:text-green-800" title="Guardar">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                    </button>
                    <button onClick={handleNombreComercialCancel} className="text-red-500 hover:text-red-700" title="Cancelar">
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleNombreComercialEdit(tarifa)}
                    className={`text-xs px-1.5 py-0.5 rounded transition-all hover:bg-orange-100 ${
                      tarifa.nombreComercial && tarifa.nombreComercial !== tarifa.nombre
                        ? 'text-orange-600 font-medium bg-orange-50'
                        : 'text-gray-400 hover:text-orange-600'
                    }`}
                    title="Editar nombre comercial (web)"
                  >
                    {tarifa.nombreComercial && tarifa.nombreComercial !== tarifa.nombre
                      ? `Web: ${tarifa.nombreComercial}`
                      : '✏️ Nombre web...'}
                  </button>
                )}
              </div>
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold mt-0.5 ${tarifa.ispGestionId ? 'bg-indigo-50 text-indigo-700' : 'bg-teal-50 text-teal-700'}`}>
                {tarifa.ispGestionId ? `ISP #${tarifa.ispGestionId}` : 'Web manual'}
              </span>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-xs" onClick={(e) => e.stopPropagation()}>
          {editingCategoria === tarifa.id ? (
            <div className="flex flex-col gap-1">
              <select
                value={categoriaInput}
                onChange={(e) => { setCategoriaInput(e.target.value); setSubcategoriaInput('') }}
                onMouseDown={(e) => e.stopPropagation()}
                className="text-xs px-1.5 py-0.5 border border-orange-300 rounded bg-orange-50 text-orange-800 w-44 focus:outline-none focus:ring-1 focus:ring-orange-400"
                disabled={savingCategoria.has(tarifa.id)}
              >
                <option value="">Seleccionar categoría...</option>
                {categoriasDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
                {/* Si la categoría actual no está en la lista dinámica, añadirla */}
                {categoriaInput && !categoriasDisponibles.includes(categoriaInput) && <option value={categoriaInput}>{categoriaInput}</option>}
              </select>
              <select
                value={subcategoriaInput}
                onChange={(e) => setSubcategoriaInput(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                className="text-xs px-1.5 py-0.5 border border-blue-300 rounded bg-blue-50 text-blue-800 w-44 focus:outline-none focus:ring-1 focus:ring-blue-400"
                disabled={savingCategoria.has(tarifa.id) || !categoriaInput}
              >
                <option value="">Sin subcategoría</option>
                {(subcategoriasDisponibles[categoriaInput] || SUBCATEGORIAS_POR_CATEGORIA[categoriaInput] || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
                {subcategoriaInput && !(subcategoriasDisponibles[categoriaInput] || []).includes(subcategoriaInput) && !(SUBCATEGORIAS_POR_CATEGORIA[categoriaInput] || []).includes(subcategoriaInput) && <option value={subcategoriaInput}>{subcategoriaInput}</option>}
              </select>
              <div className="flex gap-1">
                <button onClick={(e) => handleCategoriaSave(tarifa.id, e)} className="text-green-600 hover:text-green-800" title="Guardar">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                </button>
                <button onClick={(e) => handleCategoriaCancel(e)} className="text-red-500 hover:text-red-700" title="Cancelar">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                {savingCategoria.has(tarifa.id) && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-500"></div>}
              </div>
            </div>
          ) : (
            <button
              onClick={(e) => handleCategoriaEdit(tarifa, e)}
              className="text-left group hover:bg-gray-100 rounded px-1 py-0.5 transition-all"
              title="Editar categoría y subcategoría"
            >
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getCatColor(tarifa.categoria)}`}>{tarifa.categoria}</span>
              {tarifa.subcategoria && <span className="block text-[10px] text-gray-500 mt-0.5 pl-0.5">{tarifa.subcategoria}</span>}
              {!tarifa.subcategoria && <span className="block text-[10px] text-gray-300 mt-0.5 pl-0.5 group-hover:text-gray-500">+ subcategoría</span>}
            </button>
          )}
        </td>
        <td className="px-4 py-3"><ServiceBadges tarifa={tarifa} /></td>
        {/* En vista lista se mostraba una columna extra de categoría, pero ahora la columna Cat/Sub ya la incluye */}
        {showCategory && (
          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
            {tarifa.tipoCliente}
          </td>
        )}
        {/* Inline Web Publication Controls */}
        <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className={`flex items-center gap-1.5 ${savingWebPublish.has(tarifa.id) ? 'opacity-50 pointer-events-none' : ''}`}>
            <WebToggle
              checked={tarifa.publicarWebParticular}
              onChange={() => handleWebPublishChange(tarifa.id, 'publicarWebParticular', !tarifa.publicarWebParticular)}
              label="Part."
              colorOn="bg-blue-600 text-white"
              colorOff="bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600"
            />
            <WebToggle
              checked={tarifa.publicarWebEmpresa}
              onChange={() => handleWebPublishChange(tarifa.id, 'publicarWebEmpresa', !tarifa.publicarWebEmpresa)}
              label="Emp."
              colorOn="bg-orange-600 text-white"
              colorOff="bg-gray-100 text-gray-500 hover:bg-orange-50 hover:text-orange-600"
            />
            <SeccionSelector
              value={tarifa.seccionWebParticular}
              onChange={(val) => handleWebPublishChange(tarifa.id, 'seccionWebParticular', val)}
              disabled={!tarifa.publicarWebParticular}
            />
            <SeccionEmpresaSelector
              value={tarifa.seccionWebEmpresa}
              onChange={(val) => handleWebPublishChange(tarifa.id, 'seccionWebEmpresa', val)}
              disabled={!tarifa.publicarWebEmpresa}
            />
            {savingWebPublish.has(tarifa.id) && (
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-500"></div>
            )}
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{formatCurrency(tarifa.precioSinIva)}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{formatCurrency(tarifa.precioConIva)}</td>
        <td className="px-4 py-3 whitespace-nowrap text-sm">
          {tarifa.costeOperador && tarifa.costeOperador > 0 && tarifa.precioSinIva > 0 ? (
            (() => {
              const margen = ((tarifa.precioSinIva - tarifa.costeOperador) / tarifa.precioSinIva) * 100;
              return (
                <span className={`font-medium ${margen >= 40 ? 'text-green-600' : margen >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                  {margen.toFixed(1)}%
                </span>
              );
            })()
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-sm">
          {tarifa.duracionPermanenciaMeses ? <span className="text-amber-600 font-medium">{tarifa.duracionPermanenciaMeses} meses</span> : <span className="text-green-600">Sin permanencia</span>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <button onClick={(e) => { e.stopPropagation(); handleToggleActiva(tarifa.id) }}
            className={`inline-flex items-center gap-x-1.5 rounded-full px-2 py-1 text-xs font-semibold ${tarifa.activa ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {tarifa.activa ? <><EyeIcon className="h-3 w-3" />Activa</> : <><EyeSlashIcon className="h-3 w-3" />Inactiva</>}
          </button>
        </td>
        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
          <div className="flex items-center justify-end gap-x-2" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => handleToggleDestacada(tarifa.id)} className="text-gray-400 hover:text-yellow-500" title="Destacar">
              {tarifa.destacada ? <StarIconSolid className="h-5 w-5 text-yellow-400" /> : <StarIcon className="h-5 w-5" />}
            </button>
            <Link href={`/admin/tarifas/${tarifa.id}/editar`} className="text-orange-600 hover:text-orange-900" title="Editar"><PencilIcon className="h-5 w-5" /></Link>
            <button onClick={() => handleDuplicate(tarifa.id)} className="text-blue-600 hover:text-blue-900" title="Duplicar"><DocumentDuplicateIcon className="h-5 w-5" /></button>
            <button onClick={() => handleDelete(tarifa.id)} className="text-red-600 hover:text-red-900" title="Eliminar"><TrashIcon className="h-5 w-5" /></button>
          </div>
        </td>
      </tr>
      {expandedTarifa === tarifa.id && (
        <tr>
          <td colSpan={showCategory ? 12 : 11} className="px-6 py-3 bg-gray-50">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="font-semibold text-gray-700 block">Precios</span>
                <div className="mt-1 space-y-0.5 text-gray-600">
                  <div>Sin IVA: <span className="font-medium">{formatCurrency(tarifa.precioSinIva)}</span></div>
                  <div>Con IVA: <span className="font-medium">{formatCurrency(tarifa.precioConIva)}</span></div>
                  {tarifa.costeOperador && tarifa.costeOperador > 0 && <div>Coste operador: <span className="font-medium">{formatCurrency(tarifa.costeOperador)}</span></div>}
                  {tarifa.precioPeriodo && <div>Precio período: <span className="font-medium">{formatCurrency(tarifa.precioPeriodo)}</span></div>}
                </div>
              </div>
              <div>
                <span className="font-semibold text-gray-700 block">Conectividad</span>
                <div className="mt-1 space-y-0.5 text-gray-600">
                  {tarifa.velocidad && <div>Velocidad: <span className="font-medium">{tarifa.velocidad}</span></div>}
                  {tarifa.velocidadBajada && <div>Bajada radio: <span className="font-medium">{tarifa.velocidadBajada} Mbps</span></div>}
                  {tarifa.velocidadSubida && <div>Subida radio: <span className="font-medium">{tarifa.velocidadSubida} Mbps</span></div>}
                  {tarifa.fibraBajada && <div>Fibra bajada: <span className="font-medium">{tarifa.fibraBajada} Mbps</span></div>}
                  {tarifa.fibraSubida && <div>Fibra subida: <span className="font-medium">{tarifa.fibraSubida} Mbps</span></div>}
                  {tarifa.datosIncluidos && <div>Datos: <span className="font-medium">{tarifa.datosIncluidos}</span></div>}
                  {tarifa.minutosIncluidos && <div>Minutos: <span className="font-medium">{tarifa.minutosIncluidos}</span></div>}
                  {tarifa.smsIncluidos && <div>SMS: <span className="font-medium">{tarifa.smsIncluidos}</span></div>}
                  {tarifa.servicioPppoe && <div>Servicio: <span className="font-medium">{tarifa.servicioPppoe}</span></div>}
                  {!tarifa.velocidad && !tarifa.velocidadBajada && !tarifa.fibraBajada && !tarifa.datosIncluidos && !tarifa.minutosIncluidos && !tarifa.servicioPppoe && <div className="text-gray-400">Sin datos de conectividad</div>}
                </div>
              </div>
              <div>
                <span className="font-semibold text-gray-700 block">Permanencia</span>
                <div className="mt-1 space-y-0.5 text-gray-600">
                  {tarifa.duracionPermanenciaMeses ? (
                    <>
                      <div>Duración: <span className="font-medium">{tarifa.duracionPermanenciaMeses} meses</span></div>
                      {tarifa.permanencia && <div>Penalización: <span className="font-medium text-red-600">{tarifa.permanencia}</span></div>}
                      {tarifa.observacionesPermanencia && <div className="text-gray-500 italic">{tarifa.observacionesPermanencia}</div>}
                    </>
                  ) : <div className="text-green-600 font-medium">Sin permanencia</div>}
                </div>
              </div>
              <div>
                <span className="font-semibold text-gray-700 block">Info adicional</span>
                <div className="mt-1 space-y-0.5 text-gray-600">
                  {tarifa.ispGestionId && <div>ID ISP Gestión: <span className="font-medium">#{tarifa.ispGestionId}</span></div>}
                  {tarifa.conceptoFacturacion && <div>Facturación: <span className="font-medium">{tarifa.conceptoFacturacion}</span></div>}
                  {tarifa.noFacturar && <div className="text-amber-600 font-medium">No facturable</div>}
                  {tarifa.noProrrateable && <div className="text-amber-600">No prorrateable</div>}
                  {tarifa.publicarWeb && <div className="text-green-600">Publicada en web (ISP Gestión)</div>}
                  {tarifa.publicarWebParticular && <div className="text-blue-600 font-medium">Publicada en Web Particulares {tarifa.seccionWebParticular && `→ ${tarifa.seccionWebParticular}`}</div>}
                  {tarifa.publicarWebEmpresa && <div className="text-orange-600 font-medium">Publicada en Web Empresas</div>}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tarifas</h1>
          <p className="mt-1 text-sm text-gray-500">Gestiona el catálogo completo de tarifas ({stats?.total || 0} tarifas, {stats?.activas || 0} activas)</p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-3">
          <button onClick={handleSync} disabled={syncing}
            className="inline-flex items-center gap-x-2 rounded-md bg-blue-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50">
            <ArrowPathIcon className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Sincronizando...' : 'Sincronizar ISP Gestión'}
          </button>
          <Link href="/admin/tarifas/nueva" className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500">
            <PlusIcon className="h-5 w-5" /> Nueva Tarifa
          </Link>
        </div>
      </div>

      {/* Category cards */}
      {stats && stats.categorias.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {stats.categorias.map(cat => (
            <button key={cat.categoria} onClick={() => { setCategoria(categoria === cat.categoria ? '' : cat.categoria); setPage(1) }}
              className={`rounded-lg border px-3 py-2.5 text-left transition-all hover:shadow-md ${
                categoria === cat.categoria
                  ? 'ring-2 ring-orange-500 shadow-md ' + getCatColor(cat.categoria)
                  : getCatColor(cat.categoria) + ' hover:opacity-90'
              }`}>
              <p className="text-xs font-semibold truncate" title={cat.categoria}>{cat.categoria}</p>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-lg font-bold">{cat.total}</span>
                <span className="text-xs opacity-70">{cat.activas} act.</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg bg-white shadow border border-gray-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3"><MagnifyingGlassIcon className="h-5 w-5 text-gray-400" /></div>
              <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Nombre de tarifa..."
                className="block w-full rounded-md border-gray-300 pl-10 pr-3 py-2 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm" />
            </div>
          </form>
          <div className="w-full lg:w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Cliente</label>
            <select value={tipoCliente} onChange={(e) => { setTipoCliente(e.target.value); setPage(1) }}
              className="block w-full rounded-md border-gray-300 py-2 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm">
              <option value="">Todos</option>
              <option value="PARTICULAR">Particular</option>
              <option value="EMPRESA">Empresa</option>
            </select>
          </div>
          <div className="w-full lg:w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select value={categoria} onChange={(e) => { setCategoria(e.target.value); setPage(1) }}
              className="block w-full rounded-md border-gray-300 py-2 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm">
              <option value="">Todas</option>
              {stats?.categorias.map(c => <option key={c.categoria} value={c.categoria}>{c.categoria} ({c.total})</option>)}
            </select>
          </div>
          <div className="w-full lg:w-36">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1) }}
              className="block w-full rounded-md border-gray-300 py-2 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm">
              <option value="">Todos</option>
              <option value="activa">Activas</option>
              <option value="inactiva">Inactivas</option>
              <option value="web-particular">Publicada Web Part.</option>
              <option value="web-empresa">Publicada Web Emp.</option>
              <option value="web-ambas">Publicada Web (cualquiera)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSearch} className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-orange-500">Buscar</button>
            <button onClick={clearFilters} className="bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-semibold ring-1 ring-gray-300 hover:bg-gray-50">Limpiar</button>
          </div>
          <div className="flex rounded-md shadow-sm">
            <button onClick={() => { setViewMode('grouped'); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-l-md border ${viewMode === 'grouped' ? 'bg-orange-50 text-orange-700 border-orange-300 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
              <Squares2X2Icon className="h-4 w-4" /> Por Categoría
            </button>
            <button onClick={() => { setViewMode('list'); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-r-md border -ml-px ${viewMode === 'list' ? 'bg-orange-50 text-orange-700 border-orange-300 z-10' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
              <TableCellsIcon className="h-4 w-4" /> Lista Plana
            </button>
          </div>
        </div>

        {/* Active filters */}
        {(search || tipoCliente || categoria || estado) && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500">Filtros activos:</span>
            {search && <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">Búsqueda: &quot;{search}&quot; <button onClick={() => { setSearch(''); setSearchInput('') }} className="text-orange-500 hover:text-orange-700">&times;</button></span>}
            {tipoCliente && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">{tipoCliente} <button onClick={() => setTipoCliente('')} className="text-blue-500 hover:text-blue-700">&times;</button></span>}
            {categoria && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${getCatColor(categoria)}`}>{categoria} <button onClick={() => setCategoria('')} className="hover:opacity-70">&times;</button></span>}
            {estado && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">{estado === 'activa' ? 'Activas' : estado === 'inactiva' ? 'Inactivas' : estado === 'web-particular' ? 'Web Part.' : estado === 'web-empresa' ? 'Web Emp.' : 'Web (cualquiera)'} <button onClick={() => setEstado('')} className="text-green-500 hover:text-green-700">&times;</button></span>}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          <span className="ml-3 text-gray-500">Cargando tarifas...</span>
        </div>
      ) : (
        <>
          {/* GROUPED VIEW */}
          {viewMode === 'grouped' && (
            <div className="space-y-4">
              {grupos.length === 0 ? (
                <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center text-gray-500">No se encontraron tarifas con los filtros aplicados.</div>
              ) : (
                grupos.map(grupo => (
                  <div key={grupo.categoria} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
                    <button onClick={() => toggleCat(grupo.categoria)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3">
                        {expandedCats.has(grupo.categoria) ? <ChevronDownIcon className="h-5 w-5 text-gray-400" /> : <ChevronRightIcon className="h-5 w-5 text-gray-400" />}
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold border ${getCatColor(grupo.categoria)}`}>{grupo.categoria}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-600"><span className="font-bold text-gray-900">{grupo.total}</span> tarifas</span>
                        <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">{grupo.activas} activas</span>
                        {(() => { const webP = grupo.tarifas.filter((t: Tarifa) => t.publicarWebParticular).length; const webE = grupo.tarifas.filter((t: Tarifa) => t.publicarWebEmpresa).length; return (webP > 0 || webE > 0) ? (<span className="flex items-center gap-1">{webP > 0 && <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">{webP} Part.</span>}{webE > 0 && <span className="inline-flex items-center rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-medium">{webE} Emp.</span>}</span>) : null; })()}
                      </div>
                    </button>
                    {expandedCats.has(grupo.categoria) && (
                      <div className="border-t border-gray-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Tarifa</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Cat / Sub</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Servicios</th>
                                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Publicar Web</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Precio (sin IVA)</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Precio (con IVA)</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Margen</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Permanencia</th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                                <th className="px-4 py-2 text-right text-xs font-medium uppercase text-gray-500">Acciones</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                              {grupo.tarifas.map(tarifa => (
                                <TarifaRow key={tarifa.id} tarifa={tarifa} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* LIST VIEW */}
          {viewMode === 'list' && (
            <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
              <p className="px-4 py-2 text-sm text-gray-500 border-b">{listTotal} tarifas encontradas</p>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tarifa</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Cat / Sub</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Servicios</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Tipo</th>
                      <th className="px-3 py-3 text-left text-xs font-medium uppercase text-gray-500">Publicar Web</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Precio (sin IVA)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Precio (con IVA)</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Margen</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Permanencia</th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Estado</th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {tarifas.map(tarifa => (
                      <TarifaRow key={tarifa.id} tarifa={tarifa} showCategory />
                    ))}
                    {tarifas.length === 0 && (
                      <tr><td colSpan={12} className="px-4 py-8 text-center text-sm text-gray-500">No se encontraron tarifas con los filtros aplicados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination (list view only) */}
          {viewMode === 'list' && listTotalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-700">Página {page} de {listTotalPages} ({listTotal} tarifas)</p>
              <div className="flex gap-x-2">
                {page > 1 && <button onClick={() => setPage(page - 1)} className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50">Anterior</button>}
                {page < listTotalPages && <button onClick={() => setPage(page + 1)} className="rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500">Siguiente</button>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
