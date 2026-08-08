'use client'

import { useState, useEffect, useRef } from 'react'
import { RocketLaunchIcon, PlusIcon, DocumentIcon, TrashIcon, PencilIcon, XMarkIcon, EyeIcon, ChevronDownIcon, ChevronRightIcon, ArrowUpTrayIcon, UserGroupIcon, BuildingOfficeIcon, CurrencyEuroIcon } from '@heroicons/react/24/outline'

// ===== INTERFACES =====
interface Proveedor {
  id: string
  proyectoId: string
  proveedor: string
  concepto: string | null
  importe: number | null
  estado: string
  documentoUrl: string | null
  documentoNombre: string | null
  notas: string | null
}

interface PersonalAsignado {
  id: string
  proyectoId: string
  empleadoId: string
  tipoImputacion: 'porcentaje' | 'horas'
  porcentajeDedicacion: number | null
  horasImputadas: number | null
  costeHora: number | null
  costeTotal: number | null
  nivelTecnico: number | null
  rol: string | null
  funciones: string | null
  fechaInicio: string | null
  fechaFin: string | null
  activo: boolean
  notas: string | null
  empleado: { id: string; nombreCompleto: string; categoria: string | null; departamento: string | null; costeHoraActual: number | null }
}

interface LineaDetalle {
  codigo?: string
  descripcion: string
  unidades?: number
  precio_unitario?: number
  descuento_pct?: number
  importe?: number
}

interface Documento {
  id: string
  nombre: string
  tipo: 'presupuesto_cliente' | 'pedido_cliente' | 'presupuesto_proveedor' | 'albaran' | 'factura' | 'fin_obra' | 'otro'
  url: string
  fecha: string
  importe?: number
  importe_total?: number
  proveedor?: string
  // Datos fiscales
  cif_emisor?: string
  cif_receptor?: string
  numero_documento?: string
  forma_pago?: string
  iban?: string
  observaciones?: string
  // Desglose
  base_imponible?: number
  iva_porcentaje?: number
  importe_iva?: number
  // Líneas de detalle
  lineas?: LineaDetalle[]
}

interface Proyecto {
  id: string
  contratoDraxtonId: string | null
  responsable?: { id: string; nombreCompleto: string; categoria: string | null } | null
  responsableId: string | null
  titulo: string
  descripcion: string | null
  categoria: string
  estado: string
  impacto: string | null
  ahorroEstimado: number | null
  importeVenta: number | null
  costeProveedores: number | null
  margenEstimado: number | null
  documentosJson: Documento[] | null
  ubicacion: string | null
  fechaInicio: string | null
  fechaFinPrevista: string | null
  fechaFinReal: string | null
  prioridad: string
  orden: number
  activo: boolean
  proveedores: Proveedor[]
  personalAsignado: PersonalAsignado[]
}

// ===== CONSTANTES =====
const TIPOS_DOCUMENTO: { value: Documento['tipo']; label: string; color: string }[] = [
  { value: 'presupuesto_cliente', label: 'Presupuesto a Cliente', color: 'bg-blue-100 text-blue-700' },
  { value: 'pedido_cliente', label: 'Pedido de Cliente', color: 'bg-green-100 text-green-700' },
  { value: 'presupuesto_proveedor', label: 'Presupuesto Proveedor', color: 'bg-amber-100 text-amber-700' },
  { value: 'albaran', label: 'Albarán', color: 'bg-purple-100 text-purple-700' },
  { value: 'factura', label: 'Factura', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'fin_obra', label: 'Fin de Obra', color: 'bg-teal-100 text-teal-700' },
  { value: 'otro', label: 'Otro', color: 'bg-gray-100 text-gray-600' },
]

const ESTADOS: { value: string; label: string; color: string }[] = [
  { value: 'planificado', label: 'Planificado', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_curso', label: 'En Curso', color: 'bg-blue-100 text-blue-700' },
  { value: 'completado', label: 'Completado', color: 'bg-green-100 text-green-700' },
  { value: 'pausado', label: 'Pausado', color: 'bg-amber-100 text-amber-700' },
]

const ESTADOS_PROVEEDOR = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-gray-100 text-gray-700' },
  { value: 'aceptado', label: 'Aceptado', color: 'bg-green-100 text-green-700' },
  { value: 'rechazado', label: 'Rechazado', color: 'bg-red-100 text-red-700' },
  { value: 'ejecutado', label: 'Ejecutado', color: 'bg-blue-100 text-blue-700' },
]

// ===== HELPERS =====
function formatCurrency(value: number | null | undefined): string {
  if (!value && value !== 0) return '—'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
}

function getEstadoBadge(estado: string) {
  const e = ESTADOS.find(s => s.value === estado)
  return e ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${e.color}`}>{e.label}</span> : <span className="text-xs">{estado}</span>
}

function getTipoDocBadge(tipo: Documento['tipo']) {
  const t = TIPOS_DOCUMENTO.find(td => td.value === tipo)
  return t ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${t.color}`}>{t.label}</span> : <span className="text-xs">{tipo}</span>
}

function getEstadoProvBadge(estado: string) {
  const e = ESTADOS_PROVEEDOR.find(s => s.value === estado)
  return e ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${e.color}`}>{e.label}</span> : <span className="text-xs">{estado}</span>
}

// ===== COMPONENTE PRINCIPAL =====
export default function DraxtonProyectosSingularesPage() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'datos' | 'facturas' | 'proveedores' | 'personal' | 'documentacion'>('datos')
  const [empleados, setEmpleados] = useState<any[]>([])

  // Forms
  const [showProvForm, setShowProvForm] = useState(false)
  const [showPersonalForm, setShowPersonalForm] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const emptyForm = {
    titulo: '', descripcion: '', estado: 'en_curso', prioridad: 'media',
    ubicacion: '', importeVenta: '', fechaInicio: '', fechaFinPrevista: '', responsableId: '',
  }
  const [form, setForm] = useState(emptyForm)

  const [provForm, setProvForm] = useState({ proveedor: '', concepto: '', importe: '', estado: 'pendiente', notas: '', file: null as File | null })
  const [ocrProvProcessing, setOcrProvProcessing] = useState(false)
  const provFileInputRef = useRef<HTMLInputElement>(null)
  const [personalForm, setPersonalForm] = useState({ empleadoId: '', tipoImputacion: 'horas' as 'horas' | 'porcentaje', porcentajeDedicacion: '', horasImputadas: '', nivelTecnico: '', rol: '', funciones: '', fechaInicio: '', fechaFin: '' })
  const [docForm, setDocForm] = useState({ nombre: '', tipo: 'presupuesto_cliente' as Documento['tipo'], fecha: new Date().toISOString().split('T')[0], importe: '', proveedor: '', file: null as File | null })

  // ===== OCR AUTOMÁTICO =====
  // Convierte PDF a imagen en el navegador usando canvas
  const pdfToImage = async (file: File): Promise<File> => {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(1)
    const scale = 2
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob(b => resolve(b!), 'image/png'))
    return new File([blob], file.name.replace('.pdf', '.png'), { type: 'image/png' })
  }

  const sendToOcr = async (file: File) => {
    let fileToSend = file
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      try {
        fileToSend = await pdfToImage(file)
      } catch (e) {
        console.warn('pdfToImage falló, enviando PDF directamente:', e)
        // Enviar el PDF directamente - la API lo soporta
        fileToSend = file
      }
    }
    const formData = new FormData()
    formData.append('file', fileToSend)
    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato/ocr', { method: 'POST', body: formData })
    if (res.ok) {
      const { datos } = await res.json()
      return datos
    }
    return null
  }

  const [ocrData, setOcrData] = useState<any>(null)

  const handleFileSelect = async (file: File | null) => {
    if (!file) return
    setDocForm(prev => ({ ...prev, file, nombre: prev.nombre || file.name.replace(/\.[^/.]+$/, '') }))
    setOcrProcessing(true)
    setOcrData(null)
    try {
      const datos = await sendToOcr(file)
      if (datos) {
        setOcrData(datos)
        setDocForm(prev => ({
          ...prev,
          nombre: datos.nombre || prev.nombre,
          tipo: datos.tipo || prev.tipo,
          fecha: datos.fecha || prev.fecha,
          importe: datos.base_imponible ? String(datos.base_imponible) : (datos.importe ? String(datos.importe) : prev.importe),
          proveedor: datos.proveedor || prev.proveedor,
        }))
      }
    } catch (e) {
      console.error('OCR error:', e)
    } finally {
      setOcrProcessing(false)
    }
  }

  // ===== DATA FETCHING =====
  useEffect(() => { fetchData(); fetchEmpleados() }, [])

  const fetchData = async () => {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato')
      if (res.ok) {
        const data = await res.json()
        setProyectos(data.filter((p: Proyecto) => p.categoria === 'proyecto'))
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchEmpleados = async () => {
    try {
      const res = await fetch('/api/admin/empleados?activo=true')
      if (res.ok) {
        const data = await res.json()
        setEmpleados(Array.isArray(data) ? data : data.empleados || [])
      }
    } catch (e) { console.error(e) }
  }

  // ===== PROYECTO CRUD =====
  const handleSave = async () => {
    if (!form.titulo) { alert('El título es obligatorio'); return }
    const payload: any = {
      titulo: form.titulo, descripcion: form.descripcion || null, estado: form.estado,
      prioridad: form.prioridad, ubicacion: form.ubicacion || null, categoria: 'proyecto',
      importeVenta: form.importeVenta || null, responsableId: form.responsableId || null,
      fechaInicio: form.fechaInicio || null, fechaFinPrevista: form.fechaFinPrevista || null,
    }
    if (editingId) payload.id = editingId
    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) { setShowForm(false); setEditingId(null); setForm(emptyForm); fetchData() }
    else { const err = await res.json(); alert('Error: ' + (err.error || 'Error desconocido')) }
  }

  const handleEdit = (p: Proyecto) => {
    setForm({
      titulo: p.titulo, descripcion: p.descripcion || '', estado: p.estado,
      prioridad: p.prioridad, ubicacion: p.ubicacion || '',
      importeVenta: p.importeVenta?.toString() || '', responsableId: p.responsableId || '',
      fechaInicio: p.fechaInicio?.split('T')[0] || '', fechaFinPrevista: p.fechaFinPrevista?.split('T')[0] || '',
    })
    setEditingId(p.id); setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-contrato?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // ===== PROVEEDORES =====
  const [ocrProvData, setOcrProvData] = useState<any>(null)

  const handleProvFileSelect = async (file: File | null) => {
    if (!file) return
    setProvForm(prev => ({ ...prev, file }))
    setOcrProvProcessing(true)
    setOcrProvData(null)
    try {
      const datos = await sendToOcr(file)
      if (datos) {
        setOcrProvData(datos)
        setProvForm(prev => ({
          ...prev,
          proveedor: datos.proveedor || prev.proveedor,
          concepto: datos.concepto || prev.concepto,
          importe: datos.base_imponible ? String(datos.base_imponible) : (datos.importe ? String(datos.importe) : prev.importe),
        }))
      }
    } catch (e) { console.error('OCR prov error:', e) }
    finally { setOcrProvProcessing(false) }
  }

  const handleAddProveedor = async (proyectoId: string) => {
    if (!provForm.proveedor) { alert('El nombre del proveedor es obligatorio'); return }
    setUploading(true)
    try {
      let documentoUrl: string | null = null
      let documentoNombre: string | null = null

      // Si hay archivo, subirlo primero
      if (provForm.file) {
        const formData = new FormData()
        formData.append('file', provForm.file)
        const uploadRes = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload', { method: 'POST', body: formData })
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json()
          documentoUrl = uploadData.url
          documentoNombre = provForm.file.name
        }
      }

      // Crear proveedor con documento vinculado
      const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-proveedores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyectoId, proveedor: provForm.proveedor, concepto: provForm.concepto, importe: provForm.importe, estado: provForm.estado, notas: provForm.notas, documentoUrl, documentoNombre }),
      })

      if (res.ok) {
        // Si hay documento, añadirlo también a documentosJson del proyecto
        if (documentoUrl) {
          const proyecto = proyectos.find(p => p.id === proyectoId)
          if (proyecto) {
            const newDoc: Documento = {
              id: crypto.randomUUID(),
              nombre: ocrProvData?.nombre || documentoNombre || provForm.file!.name,
              tipo: 'presupuesto_proveedor',
              url: documentoUrl,
              fecha: ocrProvData?.fecha || new Date().toISOString().split('T')[0],
              importe: provForm.importe ? Number(provForm.importe) : undefined,
              proveedor: provForm.proveedor,
              // Datos OCR completos
              ...(ocrProvData ? {
                importe_total: ocrProvData.importe || undefined,
                cif_emisor: ocrProvData.cif_emisor || undefined,
                cif_receptor: ocrProvData.cif_receptor || undefined,
                numero_documento: ocrProvData.numero_documento || undefined,
                forma_pago: ocrProvData.forma_pago || undefined,
                iban: ocrProvData.iban || undefined,
                observaciones: ocrProvData.observaciones || undefined,
                base_imponible: ocrProvData.base_imponible || undefined,
                iva_porcentaje: ocrProvData.iva_porcentaje || undefined,
                importe_iva: ocrProvData.importe_iva || undefined,
                lineas: ocrProvData.lineas || undefined,
              } : {}),
            }
            const docs = [...(proyecto.documentosJson || []), newDoc]
            await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: proyectoId, documentosJson: docs }),
            })
          }
        }
        setShowProvForm(false)
        setProvForm({ proveedor: '', concepto: '', importe: '', estado: 'pendiente', notas: '', file: null })
        setOcrProvData(null)
        if (provFileInputRef.current) provFileInputRef.current.value = ''
        fetchData()
      } else { const err = await res.json(); alert('Error: ' + (err.error || 'Error')) }
    } catch (error: any) { alert('Error: ' + error.message) }
    finally { setUploading(false) }
  }

  const handleDeleteProveedor = async (id: string) => {
    if (!confirm('¿Eliminar este proveedor?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-proveedores?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // ===== PERSONAL =====
  const handleAddPersonal = async (proyectoId: string) => {
    if (!personalForm.empleadoId) { alert('Selecciona un empleado'); return }
    if (personalForm.tipoImputacion === 'horas' && !personalForm.horasImputadas) { alert('Indica las horas imputadas'); return }
    if (personalForm.tipoImputacion === 'porcentaje' && !personalForm.porcentajeDedicacion) { alert('Indica el % de dedicaci\u00f3n'); return }
    const res = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-personal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proyectoId, ...personalForm }),
    })
    if (res.ok) { setShowPersonalForm(false); setPersonalForm({ empleadoId: '', tipoImputacion: 'horas', porcentajeDedicacion: '', horasImputadas: '', nivelTecnico: '', rol: '', funciones: '', fechaInicio: '', fechaFin: '' }); fetchData() }
    else { const err = await res.json(); alert('Error: ' + (err.error || 'Error')) }
  }

  const handleDeletePersonal = async (id: string) => {
    if (!confirm('¿Desasignar esta persona?')) return
    await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-personal?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  // ===== DOCUMENTACIÓN =====
  const handleAddDoc = async (proyectoId: string) => {
    if (!docForm.file) { alert('Selecciona un archivo'); return }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', docForm.file)
      const uploadRes = await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload', { method: 'POST', body: formData })
      if (!uploadRes.ok) { const err = await uploadRes.json(); alert('Error subiendo: ' + (err.error || 'Error')); setUploading(false); return }
      const uploadData = await uploadRes.json()

      const proyecto = proyectos.find(p => p.id === proyectoId)
      if (!proyecto) { setUploading(false); return }

      const newDoc: Documento = {
        id: crypto.randomUUID(), nombre: docForm.nombre || docForm.file.name,
        tipo: docForm.tipo, url: uploadData.url, fecha: docForm.fecha,
        importe: docForm.importe ? Number(docForm.importe) : undefined,
        proveedor: docForm.proveedor || undefined,
        // Datos OCR completos si disponibles
        ...(ocrData ? {
          importe_total: ocrData.importe || undefined,
          cif_emisor: ocrData.cif_emisor || undefined,
          cif_receptor: ocrData.cif_receptor || undefined,
          numero_documento: ocrData.numero_documento || undefined,
          forma_pago: ocrData.forma_pago || undefined,
          iban: ocrData.iban || undefined,
          observaciones: ocrData.observaciones || undefined,
          base_imponible: ocrData.base_imponible || undefined,
          iva_porcentaje: ocrData.iva_porcentaje || undefined,
          importe_iva: ocrData.importe_iva || undefined,
          lineas: ocrData.lineas || undefined,
        } : {}),
      }
      const docs = [...(proyecto.documentosJson || []), newDoc]

      await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proyectoId, documentosJson: docs }),
      })
      setShowDocForm(false)
      setDocForm({ nombre: '', tipo: 'presupuesto_cliente', fecha: new Date().toISOString().split('T')[0], importe: '', proveedor: '', file: null })
      setOcrData(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchData()
    } catch (error: any) { alert('Error: ' + error.message) }
    finally { setUploading(false) }
  }

  const handleDeleteDoc = async (proyectoId: string, docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    const proyecto = proyectos.find(p => p.id === proyectoId)
    if (!proyecto) return
    const docs = (proyecto.documentosJson || []).filter(d => d.id !== docId)
    await fetch('/api/admin/clientes/ggcc/draxton/proyectos-contrato', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: proyectoId, documentosJson: docs }),
    })
    fetchData()
  }

  // ===== KPIs =====
  const totalProyectos = proyectos.length
  const totalVentaConIva = proyectos.reduce((sum, p) => sum + (p.importeVenta || 0), 0)
  const totalVentaBase = totalVentaConIva / 1.21
  const totalCosteProveedores = proyectos.reduce((sum, p) => sum + (p.costeProveedores || 0), 0)
  const totalCostePersonal = proyectos.reduce((sum, p) => sum + (p.personalAsignado?.reduce((s: number, pa: any) => s + (pa.costeTotal || 0), 0) || 0), 0)
  const totalMargen = totalVentaBase - totalCosteProveedores - totalCostePersonal

  if (loading) return <div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <RocketLaunchIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Proyectos Singulares</h2>
              <p className="text-sm text-gray-500">Trabajos puntuales adjudicados por Draxton</p>
            </div>
          </div>
          <button onClick={() => { setShowForm(true); setEditingId(null); setForm(emptyForm) }} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
            <PlusIcon className="w-4 h-4" /> Nuevo Proyecto
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Proyectos</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{totalProyectos}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Venta (con IVA)</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalVentaConIva)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Base: {formatCurrency(totalVentaBase)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Coste Proveedores</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(totalCosteProveedores)}</div>
          {totalVentaBase > 0 && <div className="text-xs text-gray-400 mt-0.5">{((totalCosteProveedores / totalVentaBase) * 100).toFixed(1)}% s/venta</div>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Coste Personal</div>
          <div className="text-2xl font-bold text-purple-700 mt-1">{formatCurrency(totalCostePersonal)}</div>
          {totalVentaBase > 0 && <div className="text-xs text-gray-400 mt-0.5">{((totalCostePersonal / totalVentaBase) * 100).toFixed(1)}% s/venta</div>}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Margen Neto</div>
          <div className={`text-2xl font-bold mt-1 ${totalMargen >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(totalMargen)}</div>
          {totalVentaBase > 0 && <div className="text-xs text-gray-400 mt-0.5">{((totalMargen / totalVentaBase) * 100).toFixed(1)}% s/venta</div>}
        </div>
      </div>

      {/* Tabla resumen */}
      {proyectos.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Proyecto</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Ubicación</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Venta</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Coste Prov.</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Margen</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Proveedores</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Personal</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Docs</th>
                <th className="text-center px-4 py-2.5 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {proyectos.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 cursor-pointer ${expandedId === p.id ? 'bg-indigo-50' : ''}`} onClick={() => { setExpandedId(expandedId === p.id ? null : p.id); setActiveTab('datos') }}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.titulo}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.ubicacion || '—'}</td>
                  <td className="px-4 py-2.5 text-center">{getEstadoBadge(p.estado)}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900">{formatCurrency(p.importeVenta)}</td>
                  <td className="px-4 py-2.5 text-right text-red-600">{formatCurrency(p.costeProveedores)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-medium ${(p.margenEstimado || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(p.margenEstimado)}
                    </span>
                    {p.importeVenta && p.margenEstimado ? <span className="text-[9px] text-gray-400 block">{((Number(p.margenEstimado) / Number(p.importeVenta)) * 100).toFixed(1)}%</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{p.proveedores?.length || 0}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{p.personalAsignado?.length || 0}</td>
                  <td className="px-4 py-2.5 text-center text-gray-600">{(p.documentosJson || []).length}</td>
                  <td className="px-4 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(p)} className="p-1 text-gray-400 hover:text-indigo-600"><PencilIcon className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(p.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {proyectos.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <RocketLaunchIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400">No hay proyectos singulares registrados.</p>
        </div>
      )}

      {/* ===== FICHA EXPANDIDA ===== */}
      {expandedId && (() => {
        const p = proyectos.find(pr => pr.id === expandedId)
        if (!p) return null
        return (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Tabs */}
            <div className="border-b border-gray-200 px-6">
              <nav className="flex gap-6 -mb-px">
                {[
                  { key: 'datos', label: 'Datos Generales', icon: RocketLaunchIcon },
                  { key: 'facturas', label: `Facturas (${(p as any)._facturasCount || 0})`, icon: CurrencyEuroIcon },
                  { key: 'proveedores', label: `Proveedores (${p.proveedores?.length || 0})`, icon: BuildingOfficeIcon },
                  { key: 'personal', label: `Personal (${p.personalAsignado?.length || 0})`, icon: UserGroupIcon },
                  { key: 'documentacion', label: `Documentación (${(p.documentosJson || []).length})`, icon: DocumentIcon },
                ].map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                    className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    <tab.icon className="w-4 h-4" /> {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {/* TAB: DATOS GENERALES */}
              {activeTab === 'datos' && (
                <div className="space-y-4">
                  {(() => {
                    const costePersonal = p.personalAsignado?.reduce((sum: number, pa: any) => sum + (pa.costeTotal || 0), 0) || 0
                    const ventaConIva = Number(p.importeVenta) || 0
                    const ventaBase = ventaConIva / 1.21 // Base imponible (sin IVA)
                    const proveedores = Number(p.costeProveedores) || 0 // Ya es sin IVA
                    const margenReal = ventaBase - proveedores - costePersonal
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div className="bg-blue-50 rounded-lg p-3">
                            <div className="text-xs text-blue-600 font-medium">Venta (con IVA)</div>
                            <div className="text-lg font-bold text-blue-800">{formatCurrency(ventaConIva)}</div>
                            <div className="text-xs text-blue-500 mt-0.5">Base: {formatCurrency(ventaBase)}</div>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-3">
                            <div className="text-xs text-amber-600 font-medium">Coste Proveedores</div>
                            <div className="text-lg font-bold text-amber-800">{formatCurrency(proveedores)}</div>
                            {ventaBase > 0 && <div className="text-xs text-amber-500 mt-0.5">{((proveedores / ventaBase) * 100).toFixed(1)}% s/venta</div>}
                          </div>
                          <div className="bg-purple-50 rounded-lg p-3">
                            <div className="text-xs text-purple-600 font-medium">Coste Personal</div>
                            <div className="text-lg font-bold text-purple-800">{formatCurrency(costePersonal)}</div>
                            {ventaBase > 0 && <div className="text-xs text-purple-500 mt-0.5">{((costePersonal / ventaBase) * 100).toFixed(1)}% s/venta</div>}
                          </div>
                          <div className={`rounded-lg p-3 ${margenReal >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                            <div className={`text-xs font-medium ${margenReal >= 0 ? 'text-green-600' : 'text-red-600'}`}>Margen Neto</div>
                            <div className={`text-lg font-bold ${margenReal >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                              {formatCurrency(margenReal)}
                            </div>
                            {ventaBase > 0 && <div className={`text-xs mt-0.5 ${margenReal >= 0 ? 'text-green-500' : 'text-red-500'}`}>{((margenReal / ventaBase) * 100).toFixed(1)}% s/venta</div>}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-gray-500">Ubicación:</span> <span className="font-medium">{p.ubicacion || '—'}</span></div>
                    <div><span className="text-gray-500">Responsable:</span> <span className="font-medium">{p.responsable?.nombreCompleto || '—'}</span></div>
                    <div><span className="text-gray-500">Fecha inicio:</span> <span className="font-medium">{p.fechaInicio ? new Date(p.fechaInicio).toLocaleDateString('es-ES') : '—'}</span></div>
                    <div><span className="text-gray-500">Fecha fin prevista:</span> <span className="font-medium">{p.fechaFinPrevista ? new Date(p.fechaFinPrevista).toLocaleDateString('es-ES') : '—'}</span></div>
                    <div><span className="text-gray-500">Prioridad:</span> <span className="font-medium capitalize">{p.prioridad}</span></div>
                    <div><span className="text-gray-500">Estado:</span> {getEstadoBadge(p.estado)}</div>
                  </div>
                  {p.descripcion && <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{p.descripcion}</p>}
                </div>
              )}

              {/* TAB: FACTURAS VINCULADAS */}
              {activeTab === 'facturas' && (
                <FacturasVinculadas proyectoId={p.id} onUpdate={fetchData} />
              )}

              {/* TAB: PROVEEDORES */}
              {activeTab === 'proveedores' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowProvForm(!showProvForm)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                      <PlusIcon className="w-3 h-3" /> Añadir Proveedor
                    </button>
                  </div>

                  {showProvForm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
                          <input type="text" value={provForm.proveedor} onChange={e => setProvForm({ ...provForm, proveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Wifidom, Sharktek..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
                          <input type="text" value={provForm.concepto} onChange={e => setProvForm({ ...provForm, concepto: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Equipos Ruckus R650" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Importe (€)</label>
                          <input type="number" step="0.01" value={provForm.importe} onChange={e => setProvForm({ ...provForm, importe: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0,00" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                          <select value={provForm.estado} onChange={e => setProvForm({ ...provForm, estado: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            {ESTADOS_PROVEEDOR.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Documento (presupuesto proveedor)</label>
                          <label className="cursor-pointer">
                            <div className={`flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed rounded-lg ${provForm.file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-indigo-400'}`}>
                              {ocrProvProcessing ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div> : <ArrowUpTrayIcon className="w-4 h-4 text-gray-400" />}
                              <span className="text-xs text-gray-600">{ocrProvProcessing ? 'Analizando con IA...' : provForm.file ? provForm.file.name : 'Adjuntar presupuesto (se extraen datos automáticamente)'}</span>
                            </div>
                            <input ref={provFileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" className="hidden"
                              onChange={e => { const file = e.target.files?.[0] || null; handleProvFileSelect(file) }} />
                          </label>
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                          <input type="text" value={provForm.notas} onChange={e => setProvForm({ ...provForm, notas: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Notas adicionales..." />
                        </div>
                        <div className="col-span-2 flex gap-2">
                          <button onClick={() => handleAddProveedor(p.id)} disabled={uploading || ocrProvProcessing} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            {uploading ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button onClick={() => { setShowProvForm(false); setProvForm({ proveedor: '', concepto: '', importe: '', estado: 'pendiente', notas: '', file: null }) }} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(p.proveedores?.length || 0) > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Proveedor</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Concepto</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Estado</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {p.proveedores.map(prov => (
                          <tr key={prov.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-900">{prov.proveedor}</td>
                            <td className="px-3 py-2 text-gray-600">{prov.concepto || '—'}</td>
                            <td className="px-3 py-2 text-right font-medium">{prov.importe ? formatCurrency(Number(prov.importe)) : '—'}</td>
                            <td className="px-3 py-2 text-center">{getEstadoProvBadge(prov.estado)}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => handleDeleteProveedor(prov.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t">
                        <tr>
                          <td colSpan={2} className="px-3 py-2 text-sm font-semibold text-gray-700">Total Proveedores</td>
                          <td className="px-3 py-2 text-right font-bold text-red-700">{formatCurrency(p.proveedores.reduce((s, pv) => s + (pv.importe ? Number(pv.importe) : 0), 0))}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-6">Sin proveedores asignados.</p>
                  )}
                </div>
              )}

              {/* TAB: PERSONAL */}
              {activeTab === 'personal' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowPersonalForm(!showPersonalForm)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                      <PlusIcon className="w-3 h-3" /> Asignar Persona
                    </button>
                  </div>

                  {showPersonalForm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Empleado *</label>
                          <select value={personalForm.empleadoId} onChange={e => setPersonalForm({ ...personalForm, empleadoId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">Seleccionar...</option>
                            {empleados.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.nombreCompleto}{emp.costeHoraActual ? ` (${emp.costeHoraActual.toFixed(2)} \u20ac/h)` : ''}</option>)}
                          </select>
                          {personalForm.empleadoId && (() => {
                            const emp = empleados.find((e: any) => e.id === personalForm.empleadoId)
                            return emp?.costeHoraActual ? (
                              <p className="mt-1 text-xs text-indigo-600 font-medium">Coste empresa: {emp.costeHoraActual.toFixed(2)} \u20ac/hora</p>
                            ) : (
                              <p className="mt-1 text-xs text-amber-600">Sin coste/hora registrado</p>
                            )
                          })()}
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Rol</label>
                          <input type="text" value={personalForm.rol} onChange={e => setPersonalForm({ ...personalForm, rol: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Instalador, Responsable..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nivel T\u00e9cnico</label>
                          <select value={personalForm.nivelTecnico} onChange={e => setPersonalForm({ ...personalForm, nivelTecnico: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="">Sin asignar</option>
                            <option value="1">N1 - B\u00e1sico</option>
                            <option value="2">N2 - Intermedio</option>
                            <option value="3">N3 - Avanzado</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo imputaci\u00f3n *</label>
                          <select value={personalForm.tipoImputacion} onChange={e => setPersonalForm({ ...personalForm, tipoImputacion: e.target.value as 'horas' | 'porcentaje' })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            <option value="horas">Por horas</option>
                            <option value="porcentaje">Por % dedicaci\u00f3n</option>
                          </select>
                        </div>
                        {personalForm.tipoImputacion === 'horas' ? (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Horas imputadas *</label>
                            <input type="number" min="0" step="0.5" value={personalForm.horasImputadas} onChange={e => setPersonalForm({ ...personalForm, horasImputadas: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: 24" />
                            {personalForm.horasImputadas && personalForm.empleadoId && (() => {
                              const emp = empleados.find((e: any) => e.id === personalForm.empleadoId)
                              if (emp?.costeHoraActual) {
                                const coste = parseFloat(personalForm.horasImputadas) * emp.costeHoraActual
                                return <p className="mt-1 text-xs text-gray-500">Coste estimado: <span className="font-medium text-gray-700">{coste.toFixed(2)} \u20ac</span></p>
                              }
                              return null
                            })()}
                          </div>
                        ) : (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Dedicaci\u00f3n % *</label>
                            <input type="number" min="1" max="100" value={personalForm.porcentajeDedicacion} onChange={e => setPersonalForm({ ...personalForm, porcentajeDedicacion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: 50" />
                          </div>
                        )}
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Funciones</label>
                          <input type="text" value={personalForm.funciones} onChange={e => setPersonalForm({ ...personalForm, funciones: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Descripci\u00f3n de funciones..." />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Inicio</label>
                          <input type="date" value={personalForm.fechaInicio} onChange={e => setPersonalForm({ ...personalForm, fechaInicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Fin</label>
                          <input type="date" value={personalForm.fechaFin} onChange={e => setPersonalForm({ ...personalForm, fechaFin: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div className="col-span-3 flex gap-2">
                          <button onClick={() => handleAddPersonal(p.id)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Asignar</button>
                          <button onClick={() => setShowPersonalForm(false)} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(p.personalAsignado?.length || 0) > 0 ? (
                    <div>
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Empleado</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Rol</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Nivel</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Imputaci\u00f3n</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Coste/h</th>
                            <th className="text-right px-3 py-2 font-medium text-gray-600">Coste Total</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {p.personalAsignado.map(pa => (
                            <tr key={pa.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2">
                                <div className="font-medium text-gray-900">{pa.empleado.nombreCompleto}</div>
                                {pa.funciones && <div className="text-xs text-gray-500">{pa.funciones}</div>}
                              </td>
                              <td className="px-3 py-2 text-gray-600">{pa.rol || '\u2014'}</td>
                              <td className="px-3 py-2 text-center">
                                {pa.nivelTecnico ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${pa.nivelTecnico === 3 ? 'bg-red-100 text-red-700' : pa.nivelTecnico === 2 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>N{pa.nivelTecnico}</span> : '\u2014'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                {pa.tipoImputacion === 'horas' ? (
                                  <span className="font-medium">{pa.horasImputadas || 0}h</span>
                                ) : (
                                  <span className="font-medium">{pa.porcentajeDedicacion || 0}%</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-right text-gray-600">
                                {pa.costeHora ? `${pa.costeHora.toFixed(2)} \u20ac` : <span className="text-amber-500 text-xs">N/D</span>}
                              </td>
                              <td className="px-3 py-2 text-right font-medium">
                                {pa.costeTotal ? `${pa.costeTotal.toFixed(2)} \u20ac` : '\u2014'}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button onClick={() => handleDeletePersonal(pa.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {/* Total coste personal */}
                      <div className="flex justify-end px-3 py-2 bg-gray-50 border-t">
                        <span className="text-sm font-medium text-gray-700">Total coste personal: <span className="text-indigo-700">{p.personalAsignado.reduce((sum, pa) => sum + (pa.costeTotal || 0), 0).toFixed(2)} \u20ac</span></span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-6">Sin personal asignado.</p>
                  )}
                </div>
              )}

              {/* TAB: DOCUMENTACIÓN */}
              {activeTab === 'documentacion' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button onClick={() => setShowDocForm(!showDocForm)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">
                      <PlusIcon className="w-3 h-3" /> Subir Documento
                    </button>
                  </div>

                  {showDocForm && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Archivo *</label>
                          <label className="cursor-pointer">
                            <div className={`flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg ${docForm.file ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-indigo-400'}`}>
                              {ocrProcessing ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div> : <ArrowUpTrayIcon className="w-5 h-5 text-gray-400" />}
                              <span className="text-sm text-gray-600">{ocrProcessing ? 'Analizando documento con IA...' : docForm.file ? docForm.file.name : 'Seleccionar archivo...'}</span>
                            </div>
                            <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" className="hidden"
                              onChange={e => { const file = e.target.files?.[0] || null; handleFileSelect(file) }} />
                          </label>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
                          <input type="text" value={docForm.nombre} onChange={e => setDocForm({ ...docForm, nombre: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Nombre del documento" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo *</label>
                          <select value={docForm.tipo} onChange={e => setDocForm({ ...docForm, tipo: e.target.value as Documento['tipo'] })} className="w-full px-3 py-2 border rounded-lg text-sm">
                            {TIPOS_DOCUMENTO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
                          <input type="date" value={docForm.fecha} onChange={e => setDocForm({ ...docForm, fecha: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Importe (€)</label>
                          <input type="number" step="0.01" value={docForm.importe} onChange={e => setDocForm({ ...docForm, importe: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="0,00" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor</label>
                          <input type="text" value={docForm.proveedor} onChange={e => setDocForm({ ...docForm, proveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Si aplica..." />
                        </div>
                        <div className="col-span-2 flex gap-2">
                          <button onClick={() => handleAddDoc(p.id)} disabled={uploading || !docForm.file} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                            {uploading ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Subiendo...</> : <><ArrowUpTrayIcon className="w-4 h-4" /> Subir y Guardar</>}
                          </button>
                          <button onClick={() => { setShowDocForm(false); setDocForm({ nombre: '', tipo: 'presupuesto_cliente', fecha: new Date().toISOString().split('T')[0], importe: '', proveedor: '', file: null }) }} className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300">Cancelar</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(p.documentosJson || []).length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Documento</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Tipo</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Proveedor</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                          <th className="text-center px-3 py-2 font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(p.documentosJson || []).map(doc => (
                          <tr key={doc.id} className="hover:bg-gray-50 group">
                            <td className="px-3 py-2 font-medium text-gray-900">
                              <details>
                                <summary className="cursor-pointer hover:text-indigo-600">{doc.nombre}</summary>
                                <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs space-y-2">
                                  {(doc.numero_documento || doc.cif_emisor || doc.lineas?.length) ? (
                                    <>
                                      {doc.numero_documento && <p><span className="font-semibold">Nº Doc:</span> {doc.numero_documento}</p>}
                                      {doc.cif_emisor && <p><span className="font-semibold">CIF Emisor:</span> {doc.cif_emisor}</p>}
                                      {doc.cif_receptor && <p><span className="font-semibold">CIF Receptor:</span> {doc.cif_receptor}</p>}
                                      {doc.forma_pago && <p><span className="font-semibold">Forma pago:</span> {doc.forma_pago}</p>}
                                      {doc.iban && <p><span className="font-semibold">IBAN:</span> {doc.iban}</p>}
                                      {doc.base_imponible && <p><span className="font-semibold">Base imponible:</span> {formatCurrency(doc.base_imponible)} | <span className="font-semibold">IVA {doc.iva_porcentaje || 21}%:</span> {doc.importe_iva ? formatCurrency(doc.importe_iva) : '—'} | <span className="font-semibold">Total (con IVA):</span> {doc.importe_total ? formatCurrency(doc.importe_total) : (doc.base_imponible && doc.importe_iva ? formatCurrency(doc.base_imponible + doc.importe_iva) : '—')}</p>}
                                      {doc.observaciones && <p><span className="font-semibold">Obs:</span> {doc.observaciones}</p>}
                                      {doc.lineas && doc.lineas.length > 0 && (
                                        <div className="mt-2">
                                          <p className="font-semibold mb-1">Detalle de conceptos:</p>
                                          <table className="w-full text-xs border">
                                            <thead className="bg-gray-100">
                                              <tr>
                                                <th className="px-2 py-1 text-left">Cód.</th>
                                                <th className="px-2 py-1 text-left">Descripción</th>
                                                <th className="px-2 py-1 text-right">Uds.</th>
                                                <th className="px-2 py-1 text-right">P.Unit.</th>
                                                <th className="px-2 py-1 text-right">Dto.</th>
                                                <th className="px-2 py-1 text-right">Importe</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {doc.lineas.map((l: any, i: number) => (
                                                <tr key={i} className="border-t">
                                                  <td className="px-2 py-1 text-gray-500">{l.codigo || '—'}</td>
                                                  <td className="px-2 py-1">{l.descripcion}</td>
                                                  <td className="px-2 py-1 text-right">{l.unidades || '—'}</td>
                                                  <td className="px-2 py-1 text-right">{l.precio_unitario ? formatCurrency(l.precio_unitario) : '—'}</td>
                                                  <td className="px-2 py-1 text-right">{l.descuento_pct ? `${l.descuento_pct}%` : '—'}</td>
                                                  <td className="px-2 py-1 text-right font-medium">{l.importe ? formatCurrency(l.importe) : '—'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-gray-400 italic">Sin datos extraídos. Vuelve a subir el documento para capturar los datos con IA.</p>
                                  )}
                                </div>
                              </details>
                            </td>
                            <td className="px-3 py-2">{getTipoDocBadge(doc.tipo)}</td>
                            <td className="px-3 py-2 text-gray-600">{doc.proveedor || '—'}</td>
                            <td className="px-3 py-2 text-right font-medium">{doc.importe ? formatCurrency(doc.importe) : '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{doc.fecha ? new Date(doc.fecha).toLocaleDateString('es-ES') : '—'}</td>
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="p-1 text-gray-400 hover:text-indigo-600"><EyeIcon className="w-4 h-4" /></a>
                                <button onClick={() => handleDeleteDoc(p.id, doc.id)} className="p-1 text-gray-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-6">Sin documentos. Sube presupuestos, pedidos, albaranes o documentación de fin de obra.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ===== MODAL CREAR/EDITAR PROYECTO ===== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingId ? 'Editar Proyecto' : 'Nuevo Proyecto Singular'}</h3>
              <button onClick={() => { setShowForm(false); setEditingId(null) }} className="p-1 text-gray-400 hover:text-gray-600"><XMarkIcon className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input type="text" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: WiFi Industrial Atxondo" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                <input type="text" value={form.ubicacion} onChange={e => setForm({ ...form, ubicacion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ej: Draxton Lleida" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                <textarea value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                  <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                  <select value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="alta">Alta</option>
                    <option value="media">Media</option>
                    <option value="baja">Baja</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Importe Venta (€)</label>
                  <input type="number" step="0.01" value={form.importeVenta} onChange={e => setForm({ ...form, importeVenta: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Del pedido de cliente" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Responsable</label>
                  <select value={form.responsableId} onChange={e => setForm({ ...form, responsableId: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm">
                    <option value="">Sin asignar</option>
                    {empleados.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.nombreCompleto}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha inicio</label>
                  <input type="date" value={form.fechaInicio} onChange={e => setForm({ ...form, fechaInicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fecha fin prevista</label>
                  <input type="date" value={form.fechaFinPrevista} onChange={e => setForm({ ...form, fechaFinPrevista: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowForm(false); setEditingId(null) }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">Cancelar</button>
                <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{editingId ? 'Guardar Cambios' : 'Crear Proyecto'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ===== COMPONENTE: FACTURAS VINCULADAS =====
function FacturasVinculadas({ proyectoId, onUpdate }: { proyectoId: string; onUpdate: () => void }) {
  const [vinculadas, setVinculadas] = useState<any[]>([])
  const [disponibles, setDisponibles] = useState<any[]>([])
  const [kpis, setKpis] = useState<any>(null)
  const [busqueda, setBusqueda] = useState('')
  const [loading, setLoading] = useState(true)
  const [buscando, setBuscando] = useState(false)

  const fetchFacturas = async () => {
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-facturas?proyectoId=${proyectoId}`)
      const data = await res.json()
      setVinculadas(data.vinculadas || [])
      setKpis(data.kpis)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchFacturas() }, [proyectoId])

  const buscarFacturas = async () => {
    if (!busqueda.trim()) return
    setBuscando(true)
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-facturas?proyectoId=${proyectoId}&busqueda=${encodeURIComponent(busqueda)}`)
      const data = await res.json()
      setDisponibles(data.disponibles || [])
    } catch (e) { console.error(e) }
    setBuscando(false)
  }

  const vincular = async (facturaId: string) => {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/proyectos-facturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proyectoId, facturaId }),
      })
      setDisponibles(prev => prev.filter(f => f.id !== facturaId))
      fetchFacturas()
      onUpdate()
    } catch (e) { console.error(e) }
  }

  const desvincular = async (facturaId: string) => {
    if (!confirm('¿Desvincular esta factura del proyecto?')) return
    try {
      await fetch(`/api/admin/clientes/ggcc/draxton/proyectos-facturas?facturaId=${facturaId}`, { method: 'DELETE' })
      fetchFacturas()
      onUpdate()
    } catch (e) { console.error(e) }
  }

  const formatCurrency = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0)
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })

  if (loading) return <div className="text-center py-8 text-gray-400">Cargando facturas...</div>

  return (
    <div className="space-y-4">
      {/* KPIs de facturación del proyecto */}
      {kpis && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-medium">Facturado</div>
            <div className="text-lg font-bold text-blue-800">{formatCurrency(kpis.totalFacturado)}</div>
            <div className="text-xs text-blue-500">{kpis.numFacturas} facturas</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium">Cobrado</div>
            <div className="text-lg font-bold text-green-800">{formatCurrency(kpis.totalCobrado)}</div>
            <div className="text-xs text-green-500">{kpis.facturasCobradas} cobradas</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-3">
            <div className="text-xs text-orange-600 font-medium">Pendiente Cobro</div>
            <div className="text-lg font-bold text-orange-800">{formatCurrency(kpis.pendienteCobro)}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 font-medium">% Cobrado</div>
            <div className="text-lg font-bold text-gray-800">
              {kpis.totalFacturado > 0 ? Math.round((kpis.totalCobrado / kpis.totalFacturado) * 100) : 0}%
            </div>
          </div>
        </div>
      )}

      {/* Buscador para vincular */}
      <div className="flex gap-2">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscarFacturas()}
          placeholder="Buscar factura (ej: DRAX26/45, Draxton Europe...)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
        />
        <button onClick={buscarFacturas} disabled={buscando}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {/* Resultados de búsqueda */}
      {disponibles.length > 0 && (
        <div className="border border-indigo-200 rounded-lg overflow-hidden">
          <div className="bg-indigo-50 px-4 py-2 text-xs font-medium text-indigo-700">
            Facturas disponibles para vincular ({disponibles.length})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Nº Factura</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Fecha</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {disponibles.map(f => (
                <tr key={f.id} className="border-t border-gray-100 hover:bg-indigo-50/50">
                  <td className="px-4 py-2 font-medium">{f.numFactura}</td>
                  <td className="px-4 py-2 text-gray-600 text-xs">{f.cliente}</td>
                  <td className="px-4 py-2 text-gray-500">{formatDate(f.fecha)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(f.total)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${f.estado === 'COBRADA' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => vincular(f.id)}
                      className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">
                      + Vincular
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Facturas ya vinculadas */}
      {vinculadas.length > 0 ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-600">
            Facturas vinculadas al proyecto ({vinculadas.length})
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Nº Factura</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Concepto</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Total</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Cobrado</th>
                <th className="text-center px-4 py-2 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {vinculadas.map(f => (
                <tr key={f.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-indigo-700">{f.numFactura}</td>
                  <td className="px-4 py-2 text-gray-600 text-xs">{f.cliente}</td>
                  <td className="px-4 py-2 text-gray-500">{formatDate(f.fecha)}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs max-w-[200px] truncate">{f.concepto || '—'}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(f.total)}</td>
                  <td className="px-4 py-2 text-right text-green-700 font-medium">{f.importeCobrado > 0 ? formatCurrency(f.importeCobrado) : '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${f.estado === 'COBRADA' ? 'bg-green-100 text-green-700' : f.estado === 'EMITIDA' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                      {f.estado}
                    </span>
                    {f.formaCobro && <span className="block text-[9px] text-gray-400 mt-0.5">{f.formaCobro}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => desvincular(f.id)}
                      className="p-1 text-red-400 hover:text-red-600" title="Desvincular factura">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                <td colSpan={4} className="px-4 py-2">TOTAL</td>
                <td className="px-4 py-2 text-right">{formatCurrency(vinculadas.reduce((s, f) => s + f.total, 0))}</td>
                <td className="px-4 py-2 text-right text-green-700">{formatCurrency(vinculadas.reduce((s, f) => s + f.importeCobrado, 0))}</td>
                <td colSpan={2}></td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-lg">
          <CurrencyEuroIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No hay facturas vinculadas a este proyecto</p>
          <p className="text-xs mt-1">Usa el buscador para encontrar y vincular facturas emitidas</p>
        </div>
      )}
    </div>
  )
}
