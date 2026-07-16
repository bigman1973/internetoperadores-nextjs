'use client'

import { useState, useEffect, Fragment } from 'react'
import { DocumentDuplicateIcon, PlusIcon, XMarkIcon, ArrowPathIcon, DocumentArrowUpIcon, TrashIcon, EyeIcon, PencilIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'

interface Servicio {
  ubicacion: string;
  servicio: string;
  velocidad: string;
  precioMensual: number;
  fechaInicioServicio?: string | null;
}

interface ContratoProveedor {
  id: string;
  contratoClienteId: string;
  proveedor: string;
  cifProveedor: string | null;
  titulo: string;
  tipo: string;
  fechaFirma: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  fechaInicioServicio: string | null;
  permanenciaMeses: number | null;
  prorrogaAutomatica: boolean;
  plazoProrroga: string | null;
  importeMensual: number | null;
  importeAnual: number | null;
  formaPago: string | null;
  estado: string;
  contactoProveedor: string | null;
  notas: string | null;
  condicionesEspeciales: string | null;
  serviciosJson: Servicio[] | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
}

interface Contrato {
  id: string;
  titulo: string;
  tipo: string;
  fechaFirma: string | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  fechaInicioServicio: string | null;
  permanenciaMeses: number | null;
  prorrogaAutomatica: boolean;
  plazoProrroga: string | null;
  importeMensual: number | null;
  importeAnual: number | null;
  formaPago: string | null;
  estado: string;
  contactoCliente: string | null;
  contactoProveedor: string | null;
  notas: string | null;
  condicionesEspeciales: string | null;
  serviciosJson: Servicio[] | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
  contratosProveedor?: ContratoProveedor[];
}

const TIPOS_CONTRATO = ['Servicios Internet', 'Mantenimiento', 'Guardias', 'Consultoría', 'Otro'];
const ESTADOS = ['Activo', 'Vencido', 'En renovación', 'Cancelado'];
const FORMAS_PAGO = ['confirming', 'transferencia', 'domiciliacion', 'tarjeta'];

// Calcular meses activos de un contrato en un año dado
function calcularMesesEnAnio(fechaInicioStr: string | null, fechaFinStr: string | null, anio: number): number {
  if (!fechaInicioStr) return 0;
  const inicio = new Date(fechaInicioStr);
  const fin = fechaFinStr ? new Date(fechaFinStr) : new Date(anio, 11, 31);
  const inicioAnio = new Date(anio, 0, 1);
  const finAnio = new Date(anio + 1, 0, 0); // 31 dic del año

  const desde = inicio > inicioAnio ? inicio : inicioAnio;
  const hasta = fin < finAnio ? fin : finAnio;

  if (desde > hasta) return 0;

  // Calcular meses con precisión: diferencia de meses + fracción de días
  let meses = (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth());
  // Ajustar por días parciales del mes
  const diasDesde = desde.getDate();
  const diasHasta = hasta.getDate();
  const diasEnMesFin = new Date(hasta.getFullYear(), hasta.getMonth() + 1, 0).getDate();
  meses += (diasHasta - diasDesde + 1) / diasEnMesFin;
  
  return Math.min(12, Math.max(0, Math.round(meses * 100) / 100));
}

export default function DraxtonContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showProveedorForm, setShowProveedorForm] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [analizandoProveedor, setAnalizandoProveedor] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingProveedorId, setEditingProveedorId] = useState<string | null>(null);
  const [proveedorParentId, setProveedorParentId] = useState<string | null>(null);

  // Form state contrato cliente
  const [form, setForm] = useState<Partial<Contrato>>({
    titulo: '',
    tipo: 'Servicios Internet',
    estado: 'Activo',
    prorrogaAutomatica: true,
  });

  // Form state contrato proveedor
  const [formProv, setFormProv] = useState<Partial<ContratoProveedor>>({
    proveedor: '',
    titulo: '',
    tipo: 'Servicios Internet',
    estado: 'Activo',
    prorrogaAutomatica: true,
  });

  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoProv, setArchivoProv] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [dragActiveProv, setDragActiveProv] = useState(false);

  useEffect(() => {
    fetchContratos();
  }, []);

  async function fetchContratos() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos');
      const data = await res.json();
      setContratos(data);
    } catch (err) {
      console.error('Error al cargar contratos:', err);
    }
    setLoading(false);
  }

  async function extraerTextoPDF(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let texto = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ');
      texto += pageText + '\n';
    }
    return texto;
  }

  async function extraerImagenesPDF(file: File): Promise<string[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const images: string[] = [];
    const maxPages = Math.min(pdf.numPages, 8); // Limitar a 8 páginas para no exceder body limit de Vercel
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.2 }); // Scale 1.2 para balance calidad/tamaño
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // Calidad 0.5 para reducir tamaño
      images.push(dataUrl.split(',')[1]); // Solo el base64 sin el prefijo
    }
    return images;
  }

  async function analizarPDF(file: File) {
    setAnalizando(true);
    try {
      const imagenes = await extraerImagenesPDF(file);
      const texto = await extraerTextoPDF(file);
      
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos/analizar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          texto: texto || '', 
          imagenes: imagenes.length > 0 ? imagenes : undefined,
          nombreArchivo: file.name 
        }),
      });
      const data = await res.json();
      if (data.success) {
        setForm({ ...data.datos, documentoNombre: data.documentoNombre });
      } else {
        alert('Error al analizar: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error al analizar el PDF: ' + (err?.message || 'Error desconocido'));
    }
    setAnalizando(false);
  }

  async function analizarPDFProveedor(file: File) {
    setAnalizandoProveedor(true);
    try {
      // Intentar primero con imágenes (Vision) para capturar tablas gráficas
      const imagenes = await extraerImagenesPDF(file);
      const texto = await extraerTextoPDF(file);
      
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos-proveedor/analizar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          texto: texto || '', 
          imagenes: imagenes.length > 0 ? imagenes : undefined,
          nombreArchivo: file.name 
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFormProv({ ...formProv, ...data.datos, documentoNombre: data.documentoNombre });
      } else {
        alert('Error al analizar: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error al analizar el PDF: ' + (err?.message || 'Error desconocido'));
    }
    setAnalizandoProveedor(false);
  }

  function handleEditar(c: Contrato) {
    setForm({
      titulo: c.titulo,
      tipo: c.tipo,
      fechaFirma: c.fechaFirma ? c.fechaFirma.split('T')[0] : '',
      fechaInicio: c.fechaInicio ? c.fechaInicio.split('T')[0] : '',
      fechaFin: c.fechaFin ? c.fechaFin.split('T')[0] : '',
      fechaInicioServicio: c.fechaInicioServicio ? c.fechaInicioServicio.split('T')[0] : '',
      permanenciaMeses: c.permanenciaMeses,
      prorrogaAutomatica: c.prorrogaAutomatica,
      plazoProrroga: c.plazoProrroga,
      importeMensual: c.importeMensual,
      importeAnual: c.importeAnual,
      formaPago: c.formaPago,
      estado: c.estado,
      contactoCliente: c.contactoCliente,
      contactoProveedor: c.contactoProveedor,
      notas: c.notas,
      condicionesEspeciales: c.condicionesEspeciales,
      serviciosJson: c.serviciosJson,
      documentoUrl: c.documentoUrl,
      documentoNombre: c.documentoNombre,
    });
    setEditingId(c.id);
    setShowForm(true);
  }

  function handleEditarProveedor(cp: ContratoProveedor) {
    setFormProv({
      proveedor: cp.proveedor,
      cifProveedor: cp.cifProveedor,
      titulo: cp.titulo,
      tipo: cp.tipo,
      fechaFirma: cp.fechaFirma ? cp.fechaFirma.split('T')[0] : '',
      fechaInicio: cp.fechaInicio ? cp.fechaInicio.split('T')[0] : '',
      fechaFin: cp.fechaFin ? cp.fechaFin.split('T')[0] : '',
      fechaInicioServicio: cp.fechaInicioServicio ? cp.fechaInicioServicio.split('T')[0] : '',
      permanenciaMeses: cp.permanenciaMeses,
      prorrogaAutomatica: cp.prorrogaAutomatica,
      plazoProrroga: cp.plazoProrroga,
      importeMensual: cp.importeMensual,
      importeAnual: cp.importeAnual,
      formaPago: cp.formaPago,
      estado: cp.estado,
      contactoProveedor: cp.contactoProveedor,
      notas: cp.notas,
      condicionesEspeciales: cp.condicionesEspeciales,
      serviciosJson: cp.serviciosJson,
      documentoUrl: cp.documentoUrl,
      documentoNombre: cp.documentoNombre,
    });
    setEditingProveedorId(cp.id);
    setProveedorParentId(cp.contratoClienteId);
    setShowProveedorForm(true);
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Estás seguro de eliminar este contrato? Esta acción no se puede deshacer.')) return;
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/contratos?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        setExpandedId(null);
        fetchContratos();
      } else {
        const data = await res.json();
        alert('Error al eliminar: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexión al eliminar');
    }
  }

  async function handleEliminarProveedor(id: string) {
    if (!confirm('¿Eliminar este contrato de proveedor?')) return;
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/contratos-proveedor?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchContratos();
      } else {
        const data = await res.json();
        alert('Error al eliminar: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexión al eliminar');
    }
  }

  async function handleGuardar() {
    if (!form.titulo) { alert('El título es obligatorio'); return; }
    setGuardando(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { ...form, id: editingId } : form;
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowForm(false);
        setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true });
        setArchivo(null);
        setEditingId(null);
        fetchContratos();
      } else {
        const data = await res.json();
        alert('Error al guardar: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexión al guardar');
    }
    setGuardando(false);
  }

  async function handleGuardarProveedor() {
    if (!formProv.proveedor) { alert('El proveedor es obligatorio'); return; }
    if (!formProv.titulo) { alert('El título es obligatorio'); return; }
    setGuardando(true);
    try {
      const method = editingProveedorId ? 'PUT' : 'POST';
      const body = editingProveedorId
        ? { ...formProv, id: editingProveedorId }
        : { ...formProv, contratoClienteId: proveedorParentId };
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos-proveedor', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setShowProveedorForm(false);
        setFormProv({ proveedor: '', titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true });
        setArchivoProv(null);
        setEditingProveedorId(null);
        setProveedorParentId(null);
        fetchContratos();
      } else {
        const data = await res.json();
        alert('Error al guardar: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexión al guardar');
    }
    setGuardando(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setArchivo(file); analizarPDF(file); }
  }

  function handleFileChangeProv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { setArchivoProv(file); analizarPDFProveedor(file); }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') { setArchivo(file); analizarPDF(file); }
    else alert('Solo se aceptan archivos PDF');
  }

  function handleDragProv(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActiveProv(true);
    else if (e.type === 'dragleave') setDragActiveProv(false);
  }

  function handleDropProv(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragActiveProv(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') { setArchivoProv(file); analizarPDFProveedor(file); }
    else alert('Solo se aceptan archivos PDF');
  }

  function updateServicio(index: number, field: keyof Servicio, value: string | number | null) {
    const servicios = [...(form.serviciosJson || [])];
    servicios[index] = { ...servicios[index], [field]: value };
    setForm({ ...form, serviciosJson: servicios });
  }

  function updateServicioProv(index: number, field: keyof Servicio, value: string | number | null) {
    const servicios = [...(formProv.serviciosJson || [])];
    servicios[index] = { ...servicios[index], [field]: value };
    setFormProv({ ...formProv, serviciosJson: servicios });
  }

  const formatDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('es-ES') : '—';
  const formatCurrency = (n: number | string | null | undefined) => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    return num != null && !isNaN(num) ? num.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—';
  };

  // KPIs mejorados - soporta múltiples contratos
  const activos = contratos.filter(c => c.estado === 'Activo');
  const currentYear = new Date().getFullYear();

  // Calcular datos por contrato
  const datosContratos = activos.map(c => {
    const mensual = Number(c.importeMensual) || 0;
    const perm = c.permanenciaMeses || 0;
    const fechaRef = c.fechaInicioServicio || c.fechaInicio || null;
    const fechaFin = c.fechaFin || null;
    const plazo = c.plazoProrroga || '';
    const mesesProrr = plazo.includes('1 año') || plazo.includes('12') ? 12 :
      plazo.includes('2 año') || plazo.includes('24') ? 24 :
      plazo.includes('6') ? 6 : 12;
    return {
      id: c.id,
      titulo: c.titulo,
      mensual,
      valorTotal: perm > 0 ? mensual * perm : 0,
      permanencia: perm,
      prorrogable: c.prorrogaAutomatica,
      plazoProrroga: plazo,
      importeProrroga: mensual * mesesProrr,
      importeAnio1: fechaRef ? Math.round(calcularMesesEnAnio(fechaRef, fechaFin, currentYear) * mensual * 100) / 100 : 0,
      mesesAnio1: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear) : 0,
      importeAnio2: fechaRef ? Math.round(calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 1) * mensual * 100) / 100 : 0,
      mesesAnio2: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 1) : 0,
      importeAnio3: fechaRef ? Math.round(calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 2) * mensual * 100) / 100 : 0,
      mesesAnio3: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 2) : 0,
    };
  });

  // Totales
  const totalValorContrato = datosContratos.reduce((s, d) => s + d.valorTotal, 0);
  const totalMensual = datosContratos.reduce((s, d) => s + d.mensual, 0);
  const totalAnio1 = datosContratos.reduce((s, d) => s + d.importeAnio1, 0);
  const totalAnio2 = datosContratos.reduce((s, d) => s + d.importeAnio2, 0);
  const totalAnio3 = datosContratos.reduce((s, d) => s + d.importeAnio3, 0);

  // Coste proveedor total
  const costeTotalProveedores = activos.reduce((sum, c) => {
    const provs = c.contratosProveedor || [];
    return sum + provs.filter(p => p.estado === 'Activo').reduce((s, p) => s + (Number(p.importeMensual) || 0), 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentDuplicateIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gestión de Contratos</h2>
              <p className="text-sm text-gray-500">Contratos de cliente y proveedor con Draxton</p>
            </div>
          </div>
          <button
            onClick={() => { setEditingId(null); setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo Contrato Cliente
          </button>
        </div>
      </div>

      {/* KPIs mejorados */}
      {activos.length > 0 && (
        <div className="space-y-3">
          {/* Totales */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Valor Total Contratos</div>
              <div className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(totalValorContrato)}</div>
              <p className="text-[10px] text-gray-400">{activos.length} contrato{activos.length > 1 ? 's' : ''} activo{activos.length > 1 ? 's' : ''}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Importe {currentYear}</div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAnio1)}</div>
              <p className="text-[10px] text-gray-400">Según fecha inicio servicio</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Importe {currentYear + 1}</div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAnio2)}</div>
              <p className="text-[10px] text-gray-400">Todos los contratos</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Importe {currentYear + 2}</div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAnio3)}</div>
              <p className="text-[10px] text-gray-400">Todos los contratos</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Coste Proveedores/mes</div>
              <div className="text-lg font-bold text-red-600 mt-1">{formatCurrency(costeTotalProveedores)}</div>
              <p className="text-[10px] text-gray-400">Margen: {formatCurrency(totalMensual - costeTotalProveedores)}/mes</p>
            </div>
          </div>
          {/* Desglose por contrato */}
          {datosContratos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-600">Contrato</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">€/mes</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Valor Total</th>
                    <th className="text-center px-4 py-2 font-medium text-gray-600">Prórroga</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{currentYear}</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{currentYear + 1}</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{currentYear + 2}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {datosContratos.map(d => (
                    <tr key={d.id}>
                      <td className="px-4 py-2 text-gray-900 font-medium max-w-[200px] truncate">{d.titulo}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(d.mensual)}</td>
                      <td className="px-4 py-2 text-right text-gray-900 font-semibold">{formatCurrency(d.valorTotal)}</td>
                      <td className="px-4 py-2 text-center">
                        {d.prorrogable ? (
                          <span className="text-green-700">{d.plazoProrroga || 'Sí'} ({formatCurrency(d.importeProrroga)})</span>
                        ) : <span className="text-gray-400">No</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-indigo-700 font-medium">
                        {formatCurrency(d.importeAnio1)}
                        <span className="text-[9px] text-gray-400 block">{Math.round(d.mesesAnio1 * 10) / 10} meses</span>
                      </td>
                      <td className="px-4 py-2 text-right text-indigo-700 font-medium">
                        {formatCurrency(d.importeAnio2)}
                        <span className="text-[9px] text-gray-400 block">{Math.round(d.mesesAnio2 * 10) / 10} meses</span>
                      </td>
                      <td className="px-4 py-2 text-right text-indigo-700 font-medium">
                        {formatCurrency(d.importeAnio3)}
                        <span className="text-[9px] text-gray-400 block">{Math.round(d.mesesAnio3 * 10) / 10} meses</span>
                      </td>
                    </tr>
                  ))}
                  {datosContratos.length > 1 && (
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-2 text-gray-900">TOTAL</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(totalMensual)}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(totalValorContrato)}</td>
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-right text-indigo-800">{formatCurrency(totalAnio1)}</td>
                      <td className="px-4 py-2 text-right text-indigo-800">{formatCurrency(totalAnio2)}</td>
                      <td className="px-4 py-2 text-right text-indigo-800">{formatCurrency(totalAnio3)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tabla de contratos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Contratos Cliente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contrato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Inicio Servicio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Fin</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">€/mes</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valor Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Proveedores</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : contratos.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No hay contratos registrados.</td></tr>
              ) : contratos.map(c => {
                const mensual = Number(c.importeMensual) || 0;
                const perm = c.permanenciaMeses || 0;
                const valorTotal = perm > 0 ? mensual * perm : Number(c.importeAnual) || 0;
                const numProveedores = c.contratosProveedor?.length || 0;
                return (
                <Fragment key={c.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px] truncate">{c.titulo}</td>
                    <td className="px-4 py-3 text-gray-600">{c.tipo}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaInicioServicio || c.fechaInicio)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaFin)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatCurrency(c.importeMensual)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-bold">{formatCurrency(valorTotal)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        c.estado === 'Activo' ? 'bg-green-100 text-green-700' :
                        c.estado === 'Vencido' ? 'bg-red-100 text-red-700' :
                        c.estado === 'En renovación' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{c.estado}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {numProveedores > 0 ? (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">{numProveedores}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); handleEditar(c); }} className="text-indigo-600 hover:text-indigo-800" title="Editar">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleEliminar(c.id); }} className="text-red-500 hover:text-red-700" title="Eliminar">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      {c.documentoUrl && (
                        <a href={c.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700" onClick={e => e.stopPropagation()} title="Ver documento">
                          <EyeIcon className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                  {/* Detalle expandido */}
                  {expandedId === c.id && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Fecha Firma</p>
                            <p className="text-sm font-medium">{formatDate(c.fechaFirma)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Inicio Servicio Real</p>
                            <p className="text-sm font-medium text-indigo-700">{formatDate(c.fechaInicioServicio)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Permanencia</p>
                            <p className="text-sm font-medium">{c.permanenciaMeses ? `${c.permanenciaMeses} meses` : '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Prórroga</p>
                            <p className="text-sm font-medium">{c.prorrogaAutomatica ? `Sí (${c.plazoProrroga || 'automática'})` : 'No'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase">Forma de Pago</p>
                            <p className="text-sm font-medium capitalize">{c.formaPago || '—'}</p>
                          </div>
                        </div>
                        {c.contactoCliente && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-500 uppercase">Contacto Cliente</p>
                            <p className="text-sm">{c.contactoCliente}</p>
                          </div>
                        )}
                        {c.contactoProveedor && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-500 uppercase">Contacto Proveedor (nuestro)</p>
                            <p className="text-sm">{c.contactoProveedor}</p>
                          </div>
                        )}
                        {c.notas && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-500 uppercase">Notas</p>
                            <p className="text-sm text-gray-700">{c.notas}</p>
                          </div>
                        )}
                        {c.condicionesEspeciales && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-500 uppercase">Condiciones Especiales</p>
                            <p className="text-sm text-gray-700">{c.condicionesEspeciales}</p>
                          </div>
                        )}
                        {/* Tabla de servicios */}
                        {c.serviciosJson && Array.isArray(c.serviciosJson) && c.serviciosJson.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[10px] text-gray-500 uppercase mb-2">Servicios Incluidos ({c.serviciosJson.length})</p>
                            <table className="w-full text-xs border rounded-lg overflow-hidden">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="text-left px-3 py-2">Ubicación</th>
                                  <th className="text-left px-3 py-2">Servicio</th>
                                  <th className="text-left px-3 py-2">Velocidad</th>
                                  <th className="text-left px-3 py-2">Inicio Servicio</th>
                                  <th className="text-right px-3 py-2">Precio/mes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y bg-white">
                                {(c.serviciosJson as Servicio[]).map((s, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-medium">{s.ubicacion}</td>
                                    <td className="px-3 py-2">{s.servicio}</td>
                                    <td className="px-3 py-2">{s.velocidad}</td>
                                    <td className="px-3 py-2">
                                      {s.fechaInicioServicio
                                        ? formatDate(s.fechaInicioServicio)
                                        : <span className="text-gray-400 italic">global</span>
                                      }
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(s.precioMensual)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* CONTRATOS DE PROVEEDOR */}
                        <div className="mt-6 border-t pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <BuildingOfficeIcon className="w-4 h-4 text-purple-600" />
                              <p className="text-xs font-semibold text-gray-700 uppercase">Contratos de Proveedor ({c.contratosProveedor?.length || 0})</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); setProveedorParentId(c.id); setEditingProveedorId(null); setFormProv({ proveedor: '', titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setShowProveedorForm(true); }}
                              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 inline-flex items-center gap-1"
                            >
                              <PlusIcon className="w-3 h-3" />
                              Añadir Proveedor
                            </button>
                          </div>
                          {c.contratosProveedor && c.contratosProveedor.length > 0 ? (
                            <table className="w-full text-xs border rounded-lg overflow-hidden">
                              <thead className="bg-purple-50">
                                <tr>
                                  <th className="text-left px-3 py-2">Proveedor</th>
                                  <th className="text-left px-3 py-2">Contrato</th>
                                  <th className="text-left px-3 py-2">Inicio</th>
                                  <th className="text-left px-3 py-2">Fin</th>
                                  <th className="text-right px-3 py-2">€/mes</th>
                                  <th className="text-center px-3 py-2">Estado</th>
                                  <th className="text-center px-3 py-2">Acciones</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y bg-white">
                                {c.contratosProveedor.map(cp => (
                                  <tr key={cp.id}>
                                    <td className="px-3 py-2 font-medium text-purple-700">{cp.proveedor}</td>
                                    <td className="px-3 py-2 max-w-[200px] truncate">{cp.titulo}</td>
                                    <td className="px-3 py-2">{formatDate(cp.fechaInicioServicio || cp.fechaInicio)}</td>
                                    <td className="px-3 py-2">{formatDate(cp.fechaFin)}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(cp.importeMensual)}</td>
                                    <td className="px-3 py-2 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                        cp.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                      }`}>{cp.estado}</span>
                                    </td>
                                    <td className="px-3 py-2 text-center flex items-center justify-center gap-1">
                                      <button onClick={(e) => { e.stopPropagation(); handleEditarProveedor(cp); }} className="text-indigo-600 hover:text-indigo-800" title="Editar">
                                        <PencilIcon className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); handleEliminarProveedor(cp.id); }} className="text-red-500 hover:text-red-700" title="Eliminar">
                                        <TrashIcon className="w-3.5 h-3.5" />
                                      </button>
                                      {cp.documentoUrl && (
                                        <a href={cp.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700" onClick={e => e.stopPropagation()}>
                                          <EyeIcon className="w-3.5 h-3.5" />
                                        </a>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className="text-xs text-gray-400 italic">No hay contratos de proveedor vinculados. Añade uno para controlar costes y margen.</p>
                          )}
                        </div>

                        {/* Botones editar/eliminar en el detalle */}
                        <div className="mt-4 flex gap-2 border-t pt-3">
                          <button onClick={(e) => { e.stopPropagation(); handleEditar(c); }} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1">
                            <PencilIcon className="w-3 h-3" />
                            Editar contrato
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleEliminar(c.id); }} className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200 inline-flex items-center gap-1">
                            <TrashIcon className="w-3 h-3" />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo/Editar Contrato Cliente */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Editar Contrato' : 'Nuevo Contrato Cliente'}</h2>
              <button onClick={() => { setShowForm(false); setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setArchivo(null); setEditingId(null); }}>
                <XMarkIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Upload PDF */}
            <div
              className={`mb-6 p-4 border-2 border-dashed rounded-lg transition-colors ${dragActive ? 'border-indigo-600 bg-indigo-100' : 'border-indigo-300 bg-indigo-50'}`}
              onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}
            >
              <div className="flex items-center gap-3">
                <DocumentArrowUpIcon className="w-8 h-8 text-indigo-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-indigo-700">{dragActive ? 'Suelta el PDF aquí' : 'Sube o arrastra el PDF del contrato'}</p>
                  <p className="text-xs text-indigo-500">Se analizará automáticamente con IA para extraer los datos</p>
                </div>
                <label className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 cursor-pointer inline-flex items-center gap-2">
                  {analizando ? (<><ArrowPathIcon className="w-4 h-4 animate-spin" />Analizando...</>) : (<><PlusIcon className="w-4 h-4" />Seleccionar PDF</>)}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={analizando} />
                </label>
              </div>
              {archivo && <p className="text-xs text-indigo-600 mt-2">📄 {archivo.name}</p>}
            </div>

            {/* Formulario */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
                <input type="text" value={form.titulo || ''} onChange={e => setForm({ ...form, titulo: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Ej: Contrato Servicios Internet Draxton 2025" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select value={form.tipo || 'Servicios Internet'} onChange={e => setForm({ ...form, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select value={form.estado || 'Activo'} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Firma</label>
                <input type="date" value={form.fechaFirma || ''} onChange={e => setForm({ ...form, fechaFirma: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio Contrato</label>
                <input type="date" value={form.fechaInicio || ''} onChange={e => setForm({ ...form, fechaInicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Fin Contrato</label>
                <input type="date" value={form.fechaFin || ''} onChange={e => setForm({ ...form, fechaFin: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio Servicio Real</label>
                <input type="date" value={form.fechaInicioServicio || ''} onChange={e => setForm({ ...form, fechaInicioServicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
                <p className="text-[10px] text-gray-400 mt-1">Fecha real en que se activó el servicio</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Permanencia (meses)</label>
                <input type="number" value={form.permanenciaMeses || ''} onChange={e => setForm({ ...form, permanenciaMeses: parseInt(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Importe Mensual (€)</label>
                <input type="number" step="0.01" value={form.importeMensual || ''} onChange={e => setForm({ ...form, importeMensual: parseFloat(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Importe Anual (€)</label>
                <input type="number" step="0.01" value={form.importeAnual || ''} onChange={e => setForm({ ...form, importeAnual: parseFloat(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pago</label>
                <select value={form.formaPago || ''} onChange={e => setForm({ ...form, formaPago: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  <option value="">Seleccionar...</option>
                  {FORMAS_PAGO.map(f => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prórroga Automática</label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={form.prorrogaAutomatica ?? true} onChange={e => setForm({ ...form, prorrogaAutomatica: e.target.checked })} className="rounded" />
                    Sí
                  </label>
                  {form.prorrogaAutomatica && (
                    <input type="text" value={form.plazoProrroga || ''} onChange={e => setForm({ ...form, plazoProrroga: e.target.value })} className="flex-1 px-3 py-1 border rounded-lg text-sm text-gray-900" placeholder="Ej: 1 año" />
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto Cliente</label>
                <input type="text" value={form.contactoCliente || ''} onChange={e => setForm({ ...form, contactoCliente: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Nombre - email - teléfono" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto Proveedor (nuestro)</label>
                <input type="text" value={form.contactoProveedor || ''} onChange={e => setForm({ ...form, contactoProveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Nombre - email - teléfono" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas / Resumen</label>
                <textarea value={form.notas || ''} onChange={e => setForm({ ...form, notas: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" rows={3} placeholder="Resumen de las condiciones principales..." />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Condiciones Especiales</label>
                <textarea value={form.condicionesEspeciales || ''} onChange={e => setForm({ ...form, condicionesEspeciales: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" rows={2} placeholder="Penalizaciones, exclusiones, cláusulas relevantes..." />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">URL Documento (SharePoint/OneDrive)</label>
                <input type="url" value={form.documentoUrl || ''} onChange={e => setForm({ ...form, documentoUrl: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Pega aquí el enlace de SharePoint del contrato..." />
              </div>
            </div>

            {/* Servicios extraídos */}
            {form.serviciosJson && Array.isArray(form.serviciosJson) && form.serviciosJson.length > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-medium text-green-700 mb-2">✓ {form.serviciosJson.length} servicios detectados</p>
                <table className="w-full text-xs">
                  <thead className="bg-green-100">
                    <tr>
                      <th className="text-left px-2 py-1">Ubicación</th>
                      <th className="text-left px-2 py-1">Servicio</th>
                      <th className="text-left px-2 py-1">Velocidad</th>
                      <th className="text-left px-2 py-1">Inicio Servicio</th>
                      <th className="text-right px-2 py-1">€/mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.serviciosJson as Servicio[]).map((s, i) => (
                      <tr key={i} className="border-t border-green-100">
                        <td className="px-2 py-1">{s.ubicacion}</td>
                        <td className="px-2 py-1">{s.servicio}</td>
                        <td className="px-2 py-1">{s.velocidad}</td>
                        <td className="px-2 py-1">
                          <input type="date" value={s.fechaInicioServicio || ''} onChange={e => updateServicio(i, 'fechaInicioServicio', e.target.value || null)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28" />
                        </td>
                        <td className="px-2 py-1 text-right">{typeof s.precioMensual === 'number' ? s.precioMensual.toFixed(2) : s.precioMensual}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowForm(false); setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setArchivo(null); setEditingId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={guardando || !form.titulo} className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2">
                {guardando ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : null}
                {editingId ? 'Guardar Cambios' : 'Guardar Contrato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Nuevo/Editar Contrato Proveedor */}
      {showProveedorForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">
                <span className="text-purple-600">{editingProveedorId ? 'Editar' : 'Nuevo'} Contrato Proveedor</span>
              </h2>
              <button onClick={() => { setShowProveedorForm(false); setFormProv({ proveedor: '', titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setArchivoProv(null); setEditingProveedorId(null); }}>
                <XMarkIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Upload PDF Proveedor */}
            <div
              className={`mb-6 p-4 border-2 border-dashed rounded-lg transition-colors ${dragActiveProv ? 'border-purple-600 bg-purple-100' : 'border-purple-300 bg-purple-50'}`}
              onDragEnter={handleDragProv} onDragOver={handleDragProv} onDragLeave={handleDragProv} onDrop={handleDropProv}
            >
              <div className="flex items-center gap-3">
                <DocumentArrowUpIcon className="w-8 h-8 text-purple-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-purple-700">{dragActiveProv ? 'Suelta el PDF aquí' : 'Sube o arrastra el PDF del contrato de proveedor'}</p>
                  <p className="text-xs text-purple-500">Se analizará con IA para extraer datos del proveedor</p>
                </div>
                <label className="px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 cursor-pointer inline-flex items-center gap-2">
                  {analizandoProveedor ? (<><ArrowPathIcon className="w-4 h-4 animate-spin" />Analizando...</>) : (<><PlusIcon className="w-4 h-4" />Seleccionar PDF</>)}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileChangeProv} disabled={analizandoProveedor} />
                </label>
              </div>
              {archivoProv && <p className="text-xs text-purple-600 mt-2">📄 {archivoProv.name}</p>}
            </div>

            {/* Formulario Proveedor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proveedor *</label>
                <input type="text" value={formProv.proveedor || ''} onChange={e => setFormProv({ ...formProv, proveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Ej: Adamo, Lyntia, Avatel..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CIF Proveedor</label>
                <input type="text" value={formProv.cifProveedor || ''} onChange={e => setFormProv({ ...formProv, cifProveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="B12345678" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
                <input type="text" value={formProv.titulo || ''} onChange={e => setFormProv({ ...formProv, titulo: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Ej: Contrato Fibra Barcelona - Adamo" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select value={formProv.tipo || 'Servicios Internet'} onChange={e => setFormProv({ ...formProv, tipo: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select value={formProv.estado || 'Activo'} onChange={e => setFormProv({ ...formProv, estado: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Firma</label>
                <input type="date" value={formProv.fechaFirma || ''} onChange={e => setFormProv({ ...formProv, fechaFirma: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio</label>
                <input type="date" value={formProv.fechaInicio || ''} onChange={e => setFormProv({ ...formProv, fechaInicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Fin</label>
                <input type="date" value={formProv.fechaFin || ''} onChange={e => setFormProv({ ...formProv, fechaFin: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio Servicio Real</label>
                <input type="date" value={formProv.fechaInicioServicio || ''} onChange={e => setFormProv({ ...formProv, fechaInicioServicio: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Permanencia (meses)</label>
                <input type="number" value={formProv.permanenciaMeses || ''} onChange={e => setFormProv({ ...formProv, permanenciaMeses: parseInt(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Importe Mensual (€)</label>
                <input type="number" step="0.01" value={formProv.importeMensual || ''} onChange={e => setFormProv({ ...formProv, importeMensual: parseFloat(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Importe Anual (€)</label>
                <input type="number" step="0.01" value={formProv.importeAnual || ''} onChange={e => setFormProv({ ...formProv, importeAnual: parseFloat(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pago</label>
                <select value={formProv.formaPago || ''} onChange={e => setFormProv({ ...formProv, formaPago: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  <option value="">Seleccionar...</option>
                  {FORMAS_PAGO.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prórroga Automática</label>
                <div className="flex items-center gap-4 mt-2">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={formProv.prorrogaAutomatica ?? true} onChange={e => setFormProv({ ...formProv, prorrogaAutomatica: e.target.checked })} className="rounded" />
                    Sí
                  </label>
                  {formProv.prorrogaAutomatica && (
                    <input type="text" value={formProv.plazoProrroga || ''} onChange={e => setFormProv({ ...formProv, plazoProrroga: e.target.value })} className="flex-1 px-3 py-1 border rounded-lg text-sm text-gray-900" placeholder="Ej: 1 año" />
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto Proveedor</label>
                <input type="text" value={formProv.contactoProveedor || ''} onChange={e => setFormProv({ ...formProv, contactoProveedor: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Nombre - email - teléfono" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
                <textarea value={formProv.notas || ''} onChange={e => setFormProv({ ...formProv, notas: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" rows={2} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Condiciones Especiales</label>
                <textarea value={formProv.condicionesEspeciales || ''} onChange={e => setFormProv({ ...formProv, condicionesEspeciales: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" rows={2} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">URL Documento</label>
                <input type="url" value={formProv.documentoUrl || ''} onChange={e => setFormProv({ ...formProv, documentoUrl: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="Enlace SharePoint/OneDrive..." />
              </div>
            </div>

            {/* Servicios extraídos proveedor */}
            {formProv.serviciosJson && Array.isArray(formProv.serviciosJson) && formProv.serviciosJson.length > 0 && (
              <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs font-medium text-purple-700 mb-2">✓ {formProv.serviciosJson.length} servicios detectados</p>
                <table className="w-full text-xs">
                  <thead className="bg-purple-100">
                    <tr>
                      <th className="text-left px-2 py-1">Ubicación</th>
                      <th className="text-left px-2 py-1">Servicio</th>
                      <th className="text-left px-2 py-1">Velocidad</th>
                      <th className="text-left px-2 py-1">Inicio</th>
                      <th className="text-right px-2 py-1">€/mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formProv.serviciosJson as Servicio[]).map((s, i) => (
                      <tr key={i} className="border-t border-purple-100">
                        <td className="px-2 py-1">{s.ubicacion}</td>
                        <td className="px-2 py-1">{s.servicio}</td>
                        <td className="px-2 py-1">{s.velocidad}</td>
                        <td className="px-2 py-1">
                          <input type="date" value={s.fechaInicioServicio || ''} onChange={e => updateServicioProv(i, 'fechaInicioServicio', e.target.value || null)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28" />
                        </td>
                        <td className="px-2 py-1 text-right">{typeof s.precioMensual === 'number' ? s.precioMensual.toFixed(2) : s.precioMensual}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowProveedorForm(false); setFormProv({ proveedor: '', titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setArchivoProv(null); setEditingProveedorId(null); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button onClick={handleGuardarProveedor} disabled={guardando || !formProv.proveedor || !formProv.titulo} className="px-6 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 inline-flex items-center gap-2">
                {guardando ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : null}
                {editingProveedorId ? 'Guardar Cambios' : 'Guardar Contrato Proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
