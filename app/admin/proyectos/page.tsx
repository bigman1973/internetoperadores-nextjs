'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { PlusIcon, PencilIcon, TrashIcon, ArrowLeftIcon, DocumentTextIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

interface Proyecto {
  id: string; nombre: string; codigo: string | null; tipo: string; clienteNombre: string | null;
  descripcion: string | null; responsableId: string | null; estado: string; prioridad: string;
  fechaInicio: string | null; fechaFin: string | null; importeVenta: number; costeProveedores: number;
  otrosCostes: number; presupuesto: number | null; documentosJson: any; asignaciones: any[];
  horasImputadas: number; horasEstimadas: number; horasPendientes: number;
  costeRecursos: number; costeRecursosReal: number; costeRecursosPendiente: number; costeRecursosPrevisto: number;
  costeTotalReal: number; costeTotalPrevisto: number;
  margenBruto: number; margenPct: number; margenRealBruto: number; margenRealPct: number;
  margenPrevistoBruto: number; margenPrevistoPct: number; createdAt: string;
}

interface Empleado { id: string; nombreCompleto: string; departamento: string | null; costeHoraActual: number | null }

const ESTADOS = ['ACTIVO', 'COMPLETADO', 'PAUSADO', 'CANCELADO']

export default function ProyectosPage() {
  const searchParams = useSearchParams()
  const tipoInicial = searchParams.get('tipo') || ''
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<string>(tipoInicial)
  const [filtroEstado, setFiltroEstado] = useState<string>('')
  const [showForm, setShowForm] = useState(false)
  const [editando, setEditando] = useState<Proyecto | null>(null)
  const [detalle, setDetalle] = useState<any>(null)
  const [tab, setTab] = useState<'resumen' | 'finanzas' | 'recursos' | 'docs'>('resumen')

  const [form, setForm] = useState({ nombre: '', tipo: 'interno', codigo: '', clienteNombre: '', clienteId: '', descripcion: '', responsableId: '', importeVenta: '', costeProveedores: '', otrosCostes: '', prioridad: 'media', fechaInicio: '', fechaFin: '', presupuesto: '' })
  const [showRecursoForm, setShowRecursoForm] = useState(false)
  const [editingRecurso, setEditingRecurso] = useState<any>(null)
  const [recursoForm, setRecursoForm] = useState({ empleadoId: '', rol: '', horasEstimadas: '', costeHora: '' })

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filtroTipo) params.set('tipo', filtroTipo)
      if (filtroEstado) params.set('estado', filtroEstado)
      const res = await fetch(`/api/admin/proyectos?${params}`)
      const data = await res.json()
      setProyectos(data.proyectos || [])
    } catch (e) { console.error(e) }
    try {
      const empRes = await fetch('/api/admin/empleados')
      const empData = await empRes.json()
      const emps = empData.empleados || empData || []
      setEmpleados(Array.isArray(emps) ? emps : [])
    } catch (e) { setEmpleados([]) }
    setLoading(false)
  }, [filtroTipo, filtroEstado])

  useEffect(() => { fetchData() }, [fetchData])

  const handleSubmit = async () => {
    const body: any = { ...form, accion: editando ? 'editar' : 'crear' }
    if (editando) body.id = editando.id
    await fetch('/api/admin/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setShowForm(false); setEditando(null)
    setForm({ nombre: '', tipo: 'interno', codigo: '', clienteNombre: '', clienteId: '', descripcion: '', responsableId: '', importeVenta: '', costeProveedores: '', otrosCostes: '', prioridad: 'media', fechaInicio: '', fechaFin: '', presupuesto: '' })
    fetchData()
  }

  const handleEliminar = async (id: string) => {
    if (!confirm('Eliminar este proyecto?')) return
    await fetch('/api/admin/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'eliminar', id }) })
    fetchData()
  }

  const abrirDetalle = async (id: string) => {
    const res = await fetch('/api/admin/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'detalle', id }) })
    const data = await res.json()
    setDetalle(data); setTab('resumen')
  }

  const handleAsignarRecurso = async () => {
    if (!detalle) return
    if (editingRecurso) {
      await fetch('/api/admin/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'editar_recurso', asignacionId: editingRecurso.id, ...recursoForm }) })
    } else {
      if (!recursoForm.empleadoId) return
      await fetch('/api/admin/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'asignar_recurso', proyectoId: detalle.id, ...recursoForm }) })
    }
    setShowRecursoForm(false); setEditingRecurso(null); setRecursoForm({ empleadoId: '', rol: '', horasEstimadas: '', costeHora: '' })
    await abrirDetalle(detalle.id)
    fetchData()
  }

  const handleEliminarRecurso = async (asignacionId: string) => {
    if (!confirm('Eliminar este recurso?')) return
    await fetch('/api/admin/proyectos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'eliminar_recurso', asignacionId }) })
    await abrirDetalle(detalle.id)
    fetchData()
  }

  const editarProyecto = (p: Proyecto) => {
    setEditando(p)
    setForm({ nombre: p.nombre, tipo: p.tipo, codigo: p.codigo || '', clienteNombre: p.clienteNombre || '', clienteId: '', descripcion: p.descripcion || '', responsableId: p.responsableId || '', importeVenta: p.importeVenta?.toString() || '', costeProveedores: p.costeProveedores?.toString() || '', otrosCostes: p.otrosCostes?.toString() || '', prioridad: p.prioridad, fechaInicio: p.fechaInicio?.split('T')[0] || '', fechaFin: p.fechaFin?.split('T')[0] || '', presupuesto: p.presupuesto?.toString() || '' })
    setShowForm(true)
  }

  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // VISTA DETALLE
  if (detalle) {
    const totalHoras = Number(detalle.horasImputadas ?? detalle.totalHorasImputadas ?? 0)
    const horasEstimadas = Number(detalle.horasEstimadas ?? detalle.asignaciones?.reduce((s: number, a: any) => s + Number(a.horasEstimadas || 0), 0) ?? 0)
    const horasPendientes = Number(detalle.horasPendientes ?? Math.max(0, horasEstimadas - totalHoras))
    const importeVenta = Number(detalle.importeVenta || 0)
    const costeProveedores = Number(detalle.costeProveedores || 0)
    const otrosCostes = Number(detalle.otrosCostes || 0)
    const costeRecursosReal = Number(detalle.costeRecursosReal ?? detalle.totalCosteRecursos ?? 0)
    const costeRecursosPendiente = Number(detalle.costeRecursosPendiente || 0)
    const costeRecursosPrevisto = Number(detalle.costeRecursosPrevisto ?? (costeRecursosReal + costeRecursosPendiente))
    const costeTotalReal = Number(detalle.costeTotalReal ?? (costeProveedores + otrosCostes + costeRecursosReal))
    const costeTotalPrevisto = Number(detalle.costeTotalPrevisto ?? (costeProveedores + otrosCostes + costeRecursosPrevisto))
    const margenRealBruto = Number(detalle.margenRealBruto ?? (importeVenta - costeTotalReal))
    const margenRealPct = Number(detalle.margenRealPct ?? (importeVenta > 0 ? (margenRealBruto / importeVenta) * 100 : 0))
    const margenPrevistoBruto = Number(detalle.margenPrevistoBruto ?? (importeVenta - costeTotalPrevisto))
    const margenPrevistoPct = Number(detalle.margenPrevistoPct ?? (importeVenta > 0 ? (margenPrevistoBruto / importeVenta) * 100 : 0))

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setDetalle(null)} className="p-2 rounded-lg hover:bg-gray-100"><ArrowLeftIcon className="w-5 h-5" /></button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${detalle.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{detalle.tipo === 'cliente' ? 'Cliente' : 'Interno'}</span>
              <h1 className="text-2xl font-bold text-gray-900">{detalle.nombre}</h1>
            </div>
            {detalle.clienteNombre && <p className="text-sm text-gray-500 mt-1">Cliente: {detalle.clienteNombre}</p>}
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${detalle.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : detalle.estado === 'COMPLETADO' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{detalle.estado}</span>
        </div>

        <div className="flex gap-1 border-b">
          {[{ k: 'resumen', l: 'Resumen' }, { k: 'finanzas', l: 'Finanzas' }, { k: 'recursos', l: 'Recursos' }, { k: 'docs', l: 'Documentos' }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.k ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.l}</button>
          ))}
        </div>

        {tab === 'resumen' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">Horas imputadas / estimadas</p>
                <p className="text-2xl font-bold text-gray-900">{totalHoras}h <span className="text-sm font-normal text-gray-400">/ {horasEstimadas}h</span></p>
                {horasPendientes > 0 && <p className="mt-1 text-xs font-medium text-amber-600">{horasPendientes}h pendientes de imputar</p>}
                {horasEstimadas > 0 && <div className="mt-2 h-2 bg-gray-100 rounded-full"><div className="h-2 bg-orange-500 rounded-full" style={{ width: `${Math.min(100, (totalHoras / horasEstimadas) * 100)}%` }} /></div>}
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="flex items-center gap-1 text-xs text-gray-500">Coste recursos contabilizado <InformationCircleIcon title="Horas que ya han sido imputadas al proyecto." className="h-4 w-4 text-gray-400" /></p>
                <p className="text-2xl font-bold text-gray-900">{fmt(costeRecursosReal)} EUR</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <p className="flex items-center gap-1 text-xs text-gray-500">Coste recursos previsto <InformationCircleIcon title="Incluye las horas ya imputadas y el coste de las horas asignadas que todavía están pendientes." className="h-4 w-4 text-gray-400" /></p>
                <p className="text-2xl font-bold text-indigo-700">{fmt(costeRecursosPrevisto)} EUR</p>
                {costeRecursosPendiente > 0 && <p className="mt-1 text-xs text-amber-600">{fmt(costeRecursosPendiente)} EUR aún pendientes</p>}
              </div>
              {detalle.tipo === 'cliente' && <div className="bg-white rounded-xl border p-4">
                <p className="flex items-center gap-1 text-xs text-gray-500">Margen de cierre previsto <InformationCircleIcon title="Venta sin IVA menos proveedores, otros costes y todos los recursos asignados, estén o no imputados todavía." className="h-4 w-4 text-gray-400" /></p>
                <p className={`text-2xl font-bold ${margenPrevistoBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(margenPrevistoBruto)} EUR <span className="text-sm">({margenPrevistoPct.toFixed(1)}%)</span></p>
              </div>}
            </div>
            {detalle.tipo === 'cliente' && horasPendientes > 0 && <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
              <InformationCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <p><strong>El recurso ya afecta al margen previsto.</strong> Al imputar las horas, su coste pasará de pendiente a contabilizado sin sumarse dos veces.</p>
            </div>}
            {detalle.descripcion && <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500 mb-1">Descripción</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{detalle.descripcion}</p></div>}
          </div>
        )}

        {tab === 'finanzas' && (
          <div className="space-y-4">
            {detalle.tipo === 'cliente' && <div className="bg-white rounded-xl border p-4"><h3 className="font-semibold text-gray-900 mb-3">Ingresos</h3><div className="flex justify-between items-center gap-4 py-2"><span className="text-sm text-gray-600">Importe venta (base imponible, sin IVA)</span><span className="font-medium">{fmt(importeVenta)} EUR</span></div></div>}
            <div className="bg-white rounded-xl border p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Costes y previsión</h3>
              <div className="flex justify-between items-center gap-4 py-2 border-b"><span className="text-sm text-gray-600">Proveedores</span><span className="font-medium">{fmt(costeProveedores)} EUR</span></div>
              <div className="flex justify-between items-center gap-4 py-2 border-b"><span className="text-sm text-gray-600">Otros costes</span><span className="font-medium">{fmt(otrosCostes)} EUR</span></div>
              <div className="flex justify-between items-center gap-4 py-2 border-b"><span className="text-sm text-gray-600">Recursos internos contabilizados ({totalHoras}h)</span><span className="font-medium">{fmt(costeRecursosReal)} EUR</span></div>
              <div className="flex justify-between items-center gap-4 py-2 border-b"><span className="text-sm text-amber-700">Recursos asignados pendientes ({horasPendientes}h)</span><span className="font-medium text-amber-700">{fmt(costeRecursosPendiente)} EUR</span></div>
              <div className="flex justify-between items-center gap-4 py-2 font-bold"><span>Total costes previstos</span><span>{fmt(costeTotalPrevisto)} EUR</span></div>
              <p className="mt-2 text-xs text-gray-500">Total contabilizado actualmente: {fmt(costeTotalReal)} EUR. Las horas pendientes se incorporan a la previsión desde el momento en que asignas el recurso.</p>
            </div>
            {detalle.tipo === 'cliente' && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`rounded-xl border p-4 ${margenPrevistoBruto >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <p className="text-sm font-semibold text-gray-900">Margen de cierre previsto</p>
                <p className={`mt-1 text-xl font-bold ${margenPrevistoBruto >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(margenPrevistoBruto)} EUR ({margenPrevistoPct.toFixed(1)}%)</p>
                <p className="mt-1 text-xs text-gray-600">Incluye todos los recursos asignados.</p>
              </div>
              <div className={`rounded-xl border p-4 ${margenRealBruto >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
                <p className="text-sm font-semibold text-gray-900">Margen contabilizado hasta hoy</p>
                <p className={`mt-1 text-xl font-bold ${margenRealBruto >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmt(margenRealBruto)} EUR ({margenRealPct.toFixed(1)}%)</p>
                <p className="mt-1 text-xs text-gray-600">Solo refleja horas efectivamente imputadas; no es el margen final mientras queden horas pendientes.</p>
              </div>
            </div>}
          </div>
        )}

        {tab === 'recursos' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center"><h3 className="font-semibold text-gray-900">Recursos asignados</h3><button onClick={() => setShowRecursoForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"><PlusIcon className="w-4 h-4" /> Asignar</button></div>
            {detalle.asignaciones?.length === 0 && <p className="text-sm text-gray-400">No hay recursos asignados</p>}
            {detalle.asignaciones?.map((a: any) => {
              const horasImp = Number(detalle.horasPorEmpleado?.[a.empleadoId] || 0)
              const horasPlan = Number(a.horasEstimadas || 0)
              const horasPendientesRecurso = Math.max(0, horasPlan - horasImp)
              const costeHoraRecurso = Number(a.costeHora ?? a.empleado?.costeHoraActual ?? 0)
              const costeRealRecurso = Number(detalle.costesPorEmpleado?.[a.empleadoId] || 0)
              const costePendienteRecurso = horasPendientesRecurso * costeHoraRecurso
              const costePrevistoRecurso = costeRealRecurso + costePendienteRecurso
              const pctAvance = horasPlan > 0 ? (horasImp / horasPlan) * 100 : 0
              return (
                <div key={a.id} className="bg-white rounded-xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1"><p className="font-medium text-gray-900">{a.empleado?.nombreCompleto}</p><p className="text-xs text-gray-500">{a.rol || a.empleado?.departamento || 'Sin rol'}</p></div>
                    <div className="sm:text-right">
                      <p className="text-sm font-medium">{horasImp}h / {horasPlan || '?'}h</p>
                      {costeHoraRecurso > 0 && <p className="text-xs text-gray-500">{fmt(costeHoraRecurso)} EUR/h</p>}
                      <p className="mt-1 text-sm font-semibold text-indigo-700">{fmt(costePrevistoRecurso)} EUR previstos</p>
                      <p className="text-xs text-gray-500">{fmt(costeRealRecurso)} reales · {fmt(costePendienteRecurso)} pendientes</p>
                    </div>
                    <div className="flex gap-2 sm:ml-3">
                      <button title="Editar recurso" aria-label="Editar recurso" onClick={() => { setEditingRecurso(a); setRecursoForm({ empleadoId: a.empleadoId, rol: a.rol || '', horasEstimadas: a.horasEstimadas?.toString() || '', costeHora: a.costeHora?.toString() || '' }); setShowRecursoForm(true) }} className="flex h-10 w-10 items-center justify-center rounded-lg text-blue-500 hover:bg-blue-50 hover:text-blue-700"><PencilIcon className="w-4 h-4" /></button>
                      <button title="Eliminar recurso" aria-label="Eliminar recurso" onClick={() => handleEliminarRecurso(a.id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"><TrashIcon className="w-4 h-4" /></button>
                    </div>
                  </div>
                  {horasPlan > 0 && <div className="mt-3 h-2 bg-gray-100 rounded-full"><div className={`h-2 rounded-full ${pctAvance > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, pctAvance)}%` }} /></div>}
                  {horasPendientesRecurso > 0 && <p className="text-xs text-amber-600 mt-1">Pendiente: {horasPendientesRecurso.toFixed(1)}h por imputar. Su coste ya está incluido en el margen previsto.</p>}
                </div>
              )
            })}
            {showRecursoForm && (
              <div className="bg-gray-50 rounded-xl border p-4 space-y-3">
                <select value={recursoForm.empleadoId} onChange={e => { const emp = empleados.find(em => em.id === e.target.value); setRecursoForm({ ...recursoForm, empleadoId: e.target.value, costeHora: emp?.costeHoraActual?.toString() || '' }) }} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900"><option value="">Seleccionar empleado...</option>{empleados.map(e => <option key={e.id} value={e.id}>{e.nombreCompleto} {e.departamento ? `(${e.departamento})` : ''}</option>)}</select>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input placeholder="Rol" value={recursoForm.rol} onChange={e => setRecursoForm({ ...recursoForm, rol: e.target.value })} className="rounded-lg border px-3 py-2 text-sm text-gray-900" />
                  <input placeholder="Horas estimadas" type="number" value={recursoForm.horasEstimadas} onChange={e => setRecursoForm({ ...recursoForm, horasEstimadas: e.target.value })} className="rounded-lg border px-3 py-2 text-sm text-gray-900" />
                  <input placeholder="Coste/hora" type="number" step="0.01" value={recursoForm.costeHora} onChange={e => setRecursoForm({ ...recursoForm, costeHora: e.target.value })} className="rounded-lg border px-3 py-2 text-sm text-gray-900" />
                </div>
                <div className="flex gap-2"><button onClick={handleAsignarRecurso} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">{editingRecurso ? 'Guardar' : 'Asignar'}</button><button onClick={() => { setShowRecursoForm(false); setEditingRecurso(null); setRecursoForm({ empleadoId: '', rol: '', horasEstimadas: '', costeHora: '' }) }} className="px-4 py-2 border rounded-lg text-sm text-gray-600">Cancelar</button></div>
              </div>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">Documentacion del proyecto (pedidos, facturas, contratos, etc.)</p>
            {(!detalle.documentosJson || (detalle.documentosJson as any[]).length === 0) && <p className="text-sm text-gray-400 italic">No hay documentos adjuntos</p>}
            {detalle.documentosJson && (detalle.documentosJson as any[]).map((doc: any, i: number) => (
              <div key={i} className="bg-white rounded-xl border p-3 flex items-center gap-3"><DocumentTextIcon className="w-8 h-8 text-gray-400" /><div className="flex-1"><p className="text-sm font-medium text-gray-900">{doc.nombre}</p><p className="text-xs text-gray-500">{doc.tipo} {doc.fecha ? `- ${doc.fecha}` : ''} {doc.importe ? `- ${fmt(doc.importe)} EUR` : ''}</p></div></div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // VISTA LISTADO
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Proyectos</h1><p className="text-sm text-gray-500">Control financiero, recursos y documentacion</p></div>
        <button onClick={() => { setEditando(null); setForm({ nombre: '', tipo: 'interno', codigo: '', clienteNombre: '', clienteId: '', descripcion: '', responsableId: '', importeVenta: '', costeProveedores: '', otrosCostes: '', prioridad: 'media', fechaInicio: '', fechaFin: '', presupuesto: '' }); setShowForm(true) }} className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-medium"><PlusIcon className="w-4 h-4" /> Nuevo Proyecto</button>
      </div>

      <div className="flex gap-3">
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className="rounded-lg border px-3 py-2 text-sm text-gray-900"><option value="">Todos los tipos</option><option value="cliente">Cliente</option><option value="interno">Interno</option></select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="rounded-lg border px-3 py-2 text-sm text-gray-900"><option value="">Todos los estados</option>{ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}</select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Proyectos activos</p><p className="text-2xl font-bold">{proyectos.filter(p => p.estado === 'ACTIVO').length}</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Horas imputadas</p><p className="text-2xl font-bold">{proyectos.reduce((s, p) => s + p.horasImputadas, 0).toFixed(0)}h</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="text-xs text-gray-500">Facturacion total</p><p className="text-2xl font-bold text-blue-600">{fmt(proyectos.filter(p => p.tipo === 'cliente').reduce((s, p) => s + p.importeVenta, 0))} EUR</p></div>
        <div className="bg-white rounded-xl border p-4"><p className="flex items-center gap-1 text-xs text-gray-500">Margen previsto medio <InformationCircleIcon title="Promedio del margen de cierre, incluyendo los recursos asignados pendientes de imputar." className="h-4 w-4 text-gray-400" /></p><p className="text-2xl font-bold text-green-600">{(proyectos.filter(p => p.tipo === 'cliente' && p.importeVenta > 0).reduce((s, p) => s + Number(p.margenPrevistoPct || 0), 0) / Math.max(1, proyectos.filter(p => p.tipo === 'cliente' && p.importeVenta > 0).length)).toFixed(1)}%</p></div>
      </div>

      {loading ? <p className="text-gray-400">Cargando...</p> : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 border-b"><tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Proyecto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Venta</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Coste previsto</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Margen previsto</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Horas</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Acciones</th>
            </tr></thead>
            <tbody>
              {proyectos.map(p => (
                <tr key={p.id} className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => abrirDetalle(p.id)}>
                  <td className="px-4 py-3"><p className="font-medium text-gray-900">{p.nombre}</p>{p.clienteNombre && <p className="text-xs text-gray-500">{p.clienteNombre}</p>}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded ${p.tipo === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{p.tipo === 'cliente' ? 'Cliente' : 'Interno'}</span></td>
                  <td className="px-4 py-3 text-right">{p.tipo === 'cliente' ? `${fmt(p.importeVenta)} EUR` : '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-600"><p>{fmt(Number(p.costeTotalPrevisto || 0))} EUR</p>{p.horasPendientes > 0 && <p className="text-xs text-gray-400">{fmt(Number(p.costeTotalReal || 0))} contabilizado</p>}</td>
                  <td className="px-4 py-3 text-right">{p.tipo === 'cliente' ? <><span className={p.margenPrevistoBruto >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>{Number(p.margenPrevistoPct || 0).toFixed(1)}%</span>{p.horasPendientes > 0 && <p className="text-xs text-gray-400">{Number(p.margenRealPct || 0).toFixed(1)}% contabilizado</p>}</> : '-'}</td>
                  <td className="px-4 py-3 text-center">{p.horasImputadas}/{p.horasEstimadas}h</td>
                  <td className="px-4 py-3 text-center"><span className={`text-xs px-2 py-0.5 rounded ${p.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : p.estado === 'COMPLETADO' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{p.estado}</span></td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}><button onClick={() => editarProyecto(p)} className="text-blue-500 hover:text-blue-700 mr-2"><PencilIcon className="w-4 h-4 inline" /></button><button onClick={() => handleEliminar(p.id)} className="text-red-400 hover:text-red-600"><TrashIcon className="w-4 h-4 inline" /></button></td>
                </tr>
              ))}
              {proyectos.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay proyectos. Crea el primero.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold">{editando ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="text-xs font-medium text-gray-600">Nombre *</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
              <div><label className="text-xs font-medium text-gray-600">Tipo</label><select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1"><option value="interno">Interno</option><option value="cliente">Cliente</option></select></div>
              <div><label className="text-xs font-medium text-gray-600">Codigo</label><input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="PRJ-001" className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
              {form.tipo === 'cliente' && <div className="col-span-2"><label className="text-xs font-medium text-gray-600">Cliente</label><input value={form.clienteNombre} onChange={e => setForm({ ...form, clienteNombre: e.target.value })} placeholder="Nombre del cliente" className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>}
              <div><label className="text-xs font-medium text-gray-600">Prioridad</label><select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1"><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></div>
              <div><label className="text-xs font-medium text-gray-600">Responsable</label><select value={form.responsableId} onChange={e => setForm({ ...form, responsableId: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1"><option value="">Sin asignar</option>{empleados.map(e => <option key={e.id} value={e.id}>{e.nombreCompleto}</option>)}</select></div>
              <div><label className="text-xs font-medium text-gray-600">Fecha inicio</label><input type="date" value={form.fechaInicio} onChange={e => setForm({ ...form, fechaInicio: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
              <div><label className="text-xs font-medium text-gray-600">Fecha fin</label><input type="date" value={form.fechaFin} onChange={e => setForm({ ...form, fechaFin: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
              {form.tipo === 'cliente' && <div><label className="text-xs font-medium text-gray-600">Importe venta (base)</label><input type="number" step="0.01" value={form.importeVenta} onChange={e => setForm({ ...form, importeVenta: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>}
              <div><label className="text-xs font-medium text-gray-600">Coste proveedores</label><input type="number" step="0.01" value={form.costeProveedores} onChange={e => setForm({ ...form, costeProveedores: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
              <div><label className="text-xs font-medium text-gray-600">Otros costes</label><input type="number" step="0.01" value={form.otrosCostes} onChange={e => setForm({ ...form, otrosCostes: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
              <div className="col-span-2"><label className="text-xs font-medium text-gray-600">Descripcion</label><textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} rows={2} className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 mt-1" /></div>
            </div>
            <div className="flex gap-3 pt-2"><button onClick={() => { setShowForm(false); setEditando(null) }} className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600">Cancelar</button><button onClick={handleSubmit} disabled={!form.nombre} className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">{editando ? 'Guardar' : 'Crear'}</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
