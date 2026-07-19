'use client'

import { useState, useEffect, Fragment } from 'react'
import { DocumentDuplicateIcon, PlusIcon, XMarkIcon, ArrowPathIcon, DocumentArrowUpIcon, TrashIcon, EyeIcon, PencilIcon, BuildingOfficeIcon } from '@heroicons/react/24/outline'

interface Servicio {
  ubicacion: string;
  servicio: string;
  velocidad: string;
  precioMensual: number;
  importeAlta?: number;
  fechaInicioServicio?: string | null;
  empresaGrupoId?: string | null;
  empresaGrupoNombre?: string;
}

interface EmpresaGrupo {
  id: string;
  nombre: string;
  cif: string | null;
  direccion?: string | null;
  poblacion?: string | null;
  provincia?: string | null;
  contacto?: string | null;
  email?: string | null;
  telefono?: string | null;
  activa: boolean;
  clienteWebId?: number | null;
}

interface ContratoProveedor {
  id: string;
  codigoContrato: string | null;
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
  diaFacturacion: number | null;
  mesFacturacion: string | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
}

interface Contrato {
  id: string;
  codigoContrato: string | null;
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
  diaFacturacion: number | null;
  mesFacturacion: string | null;
  documentoUrl: string | null;
  documentoNombre: string | null;
  clienteFacturacionId?: number | null;
  clienteFacturacion?: { id: number; nombre: string; cif: string | null } | null;
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

  // Calcular meses completos
  let meses = (hasta.getFullYear() - desde.getFullYear()) * 12 + (hasta.getMonth() - desde.getMonth());
  // Si el día de inicio es 1, contar el mes completo; si no, solo si hay suficientes días
  if (hasta.getDate() >= desde.getDate() - 1) {
    meses += 1; // Contar el mes parcial como completo si cubre la mayoría
  }
  
  return Math.min(12, Math.max(0, Math.floor(meses)));
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
  const [empresasGrupo, setEmpresasGrupo] = useState<EmpresaGrupo[]>([]);
  const [showEmpresasForm, setShowEmpresasForm] = useState(false);
  const [formEmpresa, setFormEmpresa] = useState<Partial<EmpresaGrupo>>({ nombre: '', activa: true });
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [resultadosBusqueda, setResultadosBusqueda] = useState<{id: number; nombre: string; cif: string | null; municipio: string | null; provincia: string | null}[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [facturasResumen, setFacturasResumen] = useState<{resumenPorContrato: Record<string, {facturado: number; facturas: number}>; totalFacturado: number; totalFacturas: number}>({resumenPorContrato: {}, totalFacturado: 0, totalFacturas: 0});
  const [facturasDetalle, setFacturasDetalle] = useState<any>(null);
  const [vinculando, setVinculando] = useState(false);
  const [showFacturasCandidatas, setShowFacturasCandidatas] = useState(false);
  const [facturaExpandidaId, setFacturaExpandidaId] = useState<string | null>(null);
  const [showMatriz, setShowMatriz] = useState(false);
  const [guardiasData, setGuardiasData] = useState<any>(null);

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
    fetchEmpresasGrupo();
    fetchFacturasResumen();
    fetchGuardiasData();
  }, []);

  async function fetchFacturasResumen() {
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/facturas-resumen?anio=${new Date().getFullYear()}`);
      const data = await res.json();
      setFacturasResumen(data);
    } catch (err) {
      console.error('Error al cargar resumen facturas:', err);
    }
  }

  async function fetchGuardiasData() {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/guardias');
      if (res.ok) {
        const data = await res.json();
        setGuardiasData(data);
      }
    } catch (err) {
      console.error('Error al cargar datos de guardias:', err);
    }
  }

  async function fetchFacturasDetalle(contratoId: string) {
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/facturas-contrato?contratoId=${contratoId}&anio=${new Date().getFullYear()}`);
      const data = await res.json();
      setFacturasDetalle(data);
    } catch (err) {
      console.error('Error al cargar facturas detalle:', err);
    }
  }

  async function vincularAutomaticamente(contratoId: string) {
    setVinculando(true);
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/facturas-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contratoId, modo: 'auto', anio: new Date().getFullYear() }),
      });
      await fetchFacturasDetalle(contratoId);
      await fetchFacturasResumen();
    } catch (err) {
      console.error('Error vinculando facturas:', err);
    }
    setVinculando(false);
  }

  async function vincularManual(contratoId: string, facturaIds: string[]) {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/facturas-contrato', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contratoId, modo: 'manual', facturaIds }),
      });
      await fetchFacturasDetalle(contratoId);
      await fetchFacturasResumen();
    } catch (err) {
      console.error('Error vinculando facturas:', err);
    }
  }

  async function desvincularFactura(contratoId: string, facturaId: string) {
    try {
      await fetch(`/api/admin/clientes/ggcc/draxton/facturas-contrato?contratoId=${contratoId}&facturaId=${facturaId}`, {
        method: 'DELETE',
      });
      await fetchFacturasDetalle(contratoId);
      await fetchFacturasResumen();
    } catch (err) {
      console.error('Error desvinculando factura:', err);
    }
  }

  async function asignarServicioFactura(vinculacionId: string, servicioIndex: number | null, contratoId: string) {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/facturas-contrato', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinculacionId, servicioIndex, estado: servicioIndex !== null ? 'asignada' : 'pendiente' }),
      });
      await fetchFacturasDetalle(contratoId);
      await fetchFacturasResumen();
    } catch (err) {
      console.error('Error asignando servicio:', err);
    }
  }

  async function cambiarEstadoFactura(vinculacionId: string, estado: string, contratoId: string) {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/facturas-contrato', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vinculacionId, estado }),
      });
      await fetchFacturasDetalle(contratoId);
    } catch (err) {
      console.error('Error cambiando estado:', err);
    }
  }

  async function fetchEmpresasGrupo() {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/draxton/empresas-grupo');
      const data = await res.json();
      setEmpresasGrupo(data);
    } catch (err) {
      console.error('Error al cargar empresas del grupo:', err);
    }
  }

  async function buscarClientes(q: string) {
    setBusquedaCliente(q);
    if (q.length < 2) { setResultadosBusqueda([]); return; }
    setBuscando(true);
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/buscar-clientes?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResultadosBusqueda(data);
    } catch (err) {
      console.error('Error buscando clientes:', err);
    }
    setBuscando(false);
  }

  async function agregarEmpresaDesdeCliente(cliente: {id: number; nombre: string; cif: string | null; municipio: string | null; provincia: string | null}) {
    // Verificar que no esté ya añadida
    if (empresasGrupo.some(e => e.clienteWebId === cliente.id)) {
      alert('Esta empresa ya está en el grupo');
      return;
    }
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/empresas-grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: cliente.nombre,
          cif: cliente.cif,
          poblacion: cliente.municipio,
          provincia: cliente.provincia,
          clienteWebId: cliente.id,
          activa: true,
        }),
      });
      setBusquedaCliente('');
      setResultadosBusqueda([]);
      setShowEmpresasForm(false);
      fetchEmpresasGrupo();
    } catch (err) {
      console.error('Error al añadir empresa:', err);
    }
  }

  async function guardarEmpresa() {
    try {
      await fetch('/api/admin/clientes/ggcc/draxton/empresas-grupo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formEmpresa),
      });
      setFormEmpresa({ nombre: '', activa: true });
      setShowEmpresasForm(false);
      fetchEmpresasGrupo();
    } catch (err) {
      console.error('Error al guardar empresa:', err);
    }
  }

  async function eliminarEmpresa(id: string) {
    if (!confirm('¿Eliminar esta empresa del grupo?')) return;
    try {
      await fetch(`/api/admin/clientes/ggcc/draxton/empresas-grupo?id=${id}`, { method: 'DELETE' });
      fetchEmpresasGrupo();
    } catch (err) {
      console.error('Error al eliminar empresa:', err);
    }
  }

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
    const totalPages = pdf.numPages;
    // Renderizar todas las páginas (hasta 20) a baja calidad para que el backend elija las mejores
    // El backend selecciona 4 páginas estratégicas para enviar a GPT
    const maxPages = Math.min(totalPages, 20);
    
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
      images.push(dataUrl.split(',')[1]);
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
      diaFacturacion: c.diaFacturacion,
      mesFacturacion: c.mesFacturacion,
      documentoUrl: c.documentoUrl,
      documentoNombre: c.documentoNombre,
      clienteFacturacionId: c.clienteFacturacionId,
      codigoContrato: c.codigoContrato,
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
    if (num == null || isNaN(num)) return '—';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', useGrouping: true }).format(num);
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
    // Calcular alta del contrato cliente (suma de altas de servicios)
    const altaCliente = Array.isArray(c.serviciosJson) ? (c.serviciosJson as Servicio[]).reduce((s, srv) => s + (srv.importeAlta || 0), 0) : 0;
    return {
      id: c.id,
      titulo: c.titulo,
      mensual,
      altaCliente,
      valorTotal: perm > 0 ? mensual * perm : 0,
      permanencia: perm,
      prorrogable: c.prorrogaAutomatica,
      plazoProrroga: plazo,
      importeProrroga: mensual * mesesProrr,
      importeAnio1: fechaRef ? (calcularMesesEnAnio(fechaRef, fechaFin, currentYear) * mensual) + (new Date(fechaRef).getFullYear() === currentYear ? altaCliente : 0) : 0,
      mesesAnio1: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear) : 0,
      importeAnio2: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 1) * mensual : 0,
      mesesAnio2: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 1) : 0,
      importeAnio3: fechaRef ? calcularMesesEnAnio(fechaRef, fechaFin, currentYear + 2) * mensual : 0,
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

  // Coste guardias mensual total (para TOTAL de tabla)
  const costeGuardiasTotalMensual = (() => {
    const contratoGuardias = activos.find(c => c.tipo === 'Guardias');
    if (!contratoGuardias || !guardiasData) return 0;
    const hoy = new Date();
    const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
    const semanasTranscurridas = Math.ceil((hoy.getTime() - inicioAnio.getTime()) / (7 * 24 * 60 * 60 * 1000));
    const semanasAsignadas = guardiasData.asignaciones?.length || 0;
    const semanasSinAsignar = Math.max(0, semanasTranscurridas - semanasAsignadas);
    const costeAsignadas = guardiasData.asignaciones?.reduce((s: number, a: any) => s + (a.importeSemana || 0), 0) || 0;
    const costeSinAsignar = semanasSinAsignar * 200;
    const mesesTranscurridos = hoy.getMonth() + 1;
    return (costeAsignadas + costeSinAsignar) / mesesTranscurridos;
  })();

  // Altas totales
  const totalAltaCliente = datosContratos.reduce((s, d) => s + d.altaCliente, 0);
  const totalAltaProveedor = activos.reduce((sum, c) => {
    const provs = c.contratosProveedor || [];
    return sum + provs.filter(p => p.estado === 'Activo').reduce((s, p) => {
      const servicios = Array.isArray(p.serviciosJson) ? (p.serviciosJson as Servicio[]) : [];
      return s + servicios.reduce((ss, srv) => ss + (srv.importeAlta || 0), 0);
    }, 0);
  }, 0);
  const margenAltas = totalAltaCliente - totalAltaProveedor;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentDuplicateIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gestión de Contratos</h2>
              <p className="text-sm text-gray-500">Contratos de cliente y proveedor con Draxton <span className="text-gray-400">· Todos los importes sin impuestos (base imponible)</span></p>
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Valor Total Contratos <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Suma de (mensualidad × permanencia) + altas de todos los contratos activos</span></span></div>
              <div className="text-lg font-bold text-gray-900 mt-1">{formatCurrency(totalValorContrato + totalAltaCliente)}</div>
              <p className="text-[10px] text-gray-400">{activos.length} contrato{activos.length > 1 ? 's' : ''} activo{activos.length > 1 ? 's' : ''}{totalAltaCliente > 0 ? ` (incl. altas)` : ''}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Importe {currentYear} <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-52 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Mensualidad × meses activos en el año + altas (si es primer año). Los meses son la media de meses activos de los contratos.</span></span></div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAnio1)}</div>
              <p className="text-[10px] text-gray-400">{datosContratos.reduce((s, d) => s + d.mesesAnio1, 0) / Math.max(datosContratos.length, 1) | 0} meses{totalAltaCliente > 0 && datosContratos.some(d => new Date(d.id).getFullYear() === currentYear) ? ' + altas' : ''}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Importe {currentYear + 1} <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Mensualidad × meses activos en el año. Los meses son la media de meses activos de los contratos.</span></span></div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAnio2)}</div>
              <p className="text-[10px] text-gray-400">{datosContratos.reduce((s, d) => s + d.mesesAnio2, 0) / Math.max(datosContratos.length, 1) | 0} meses</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Importe {currentYear + 2} <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Mensualidad × meses activos en el año. Los meses son la media de meses activos de los contratos.</span></span></div>
              <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAnio3)}</div>
              <p className="text-[10px] text-gray-400">{datosContratos.reduce((s, d) => s + d.mesesAnio3, 0) / Math.max(datosContratos.length, 1) | 0} meses</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Total Costes/mes <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Suma de importes mensuales de todos los contratos de proveedor activos</span></span></div>
              <div className="text-lg font-bold text-red-600 mt-1">{formatCurrency(costeTotalProveedores)}</div>
              <p className="text-[10px] text-gray-400">Proveedores activos</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Margen Mensual <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Ingresos mensuales cliente - costes mensuales proveedor. Porcentaje = margen / ingresos.</span></span></div>
              <div className="text-lg font-bold text-green-600 mt-1">{formatCurrency(totalMensual - costeTotalProveedores)}</div>
              <p className="text-[10px] text-gray-400">{totalMensual > 0 ? (((totalMensual - costeTotalProveedores) / totalMensual) * 100).toFixed(1) : '0'}% sobre facturación</p>
            </div>
          </div>
          {/* KPI Altas */}
          {(totalAltaCliente > 0 || totalAltaProveedor > 0) && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Alta Cliente</div>
                <div className="text-lg font-bold text-indigo-700 mt-1">{formatCurrency(totalAltaCliente)}</div>
                <p className="text-[10px] text-gray-400">Importe único facturado</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Coste Alta Proveedor</div>
                <div className="text-lg font-bold text-red-600 mt-1">{formatCurrency(totalAltaProveedor)}</div>
                <p className="text-[10px] text-gray-400">Coste instalación</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">Margen Altas</div>
                <div className="text-lg font-bold text-green-600 mt-1">{formatCurrency(margenAltas)}</div>
                <p className="text-[10px] text-gray-400">{totalAltaCliente > 0 ? ((margenAltas / totalAltaCliente) * 100).toFixed(1) : '0'}%</p>
              </div>
            </div>
          )}
          {/* KPI Facturación */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Facturado {currentYear} <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Suma de base imponible de todas las facturas vinculadas a contratos en el año actual</span></span></div>
              <div className="text-lg font-bold text-blue-700 mt-1">{formatCurrency(facturasResumen.totalFacturado)}</div>
              <p className="text-[10px] text-gray-400">{facturasResumen.totalFacturas} facturas vinculadas</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">Pendiente {currentYear} <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Importe esperado del año (meses × mensualidad + altas) menos lo ya facturado</span></span></div>
              <div className="text-lg font-bold text-orange-600 mt-1">{formatCurrency(Math.max(0, totalAnio1 - facturasResumen.totalFacturado))}</div>
              <p className="text-[10px] text-gray-400">{totalAnio1 > 0 ? ((Math.max(0, totalAnio1 - facturasResumen.totalFacturado) / totalAnio1) * 100).toFixed(1) : '0'}% pendiente</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1">% Facturado <span className="relative group cursor-help">ⓘ<span className="absolute hidden group-hover:block z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 text-[10px] normal-case tracking-normal text-white bg-gray-800 rounded shadow-lg">Porcentaje del importe esperado del año que ya ha sido facturado y vinculado</span></span></div>
              <div className="text-lg font-bold text-emerald-600 mt-1">{totalAnio1 > 0 ? ((facturasResumen.totalFacturado / totalAnio1) * 100).toFixed(1) : '0'}%</div>
              <p className="text-[10px] text-gray-400">de {formatCurrency(totalAnio1)} esperado</p>
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
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Coste/mes</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Margen</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Alta</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">Valor Total</th>
                    <th className="text-right px-4 py-2 font-medium text-blue-600">Facturado</th>
                    <th className="text-right px-4 py-2 font-medium text-purple-600">Fact. extra</th>
                    <th className="text-right px-4 py-2 font-medium text-orange-600">Pendiente</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{currentYear}</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{currentYear + 1}</th>
                    <th className="text-right px-4 py-2 font-medium text-gray-600">{currentYear + 2}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {datosContratos.map(d => {
                    const contrato = activos.find(c => c.id === d.id);
                    const costeContrato = (contrato?.contratosProveedor || []).filter(p => p.estado === 'Activo').reduce((s, p) => s + (Number(p.importeMensual) || 0), 0);
                    // Para contratos de guardias, añadir previsión de coste técnicos (200€/sem sin asignar)
                    let costeGuardiasMensual = 0;
                    if (contrato?.tipo === 'Guardias' && guardiasData) {
                      const hoy = new Date();
                      const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
                      const semanasTranscurridas = Math.ceil((hoy.getTime() - inicioAnio.getTime()) / (7 * 24 * 60 * 60 * 1000));
                      const semanasAsignadas = guardiasData.asignaciones?.length || 0;
                      const semanasSinAsignar = Math.max(0, semanasTranscurridas - semanasAsignadas);
                      const costeAsignadas = guardiasData.asignaciones?.reduce((s: number, a: any) => s + (a.importeSemana || 0), 0) || 0;
                      const costeSinAsignar = semanasSinAsignar * 200;
                      const mesesTranscurridos = hoy.getMonth() + 1;
                      costeGuardiasMensual = (costeAsignadas + costeSinAsignar) / mesesTranscurridos;
                    }
                    const margenContrato = d.mensual - costeContrato - costeGuardiasMensual;
                    const margenPct = d.mensual > 0 ? ((margenContrato / d.mensual) * 100).toFixed(1) : '0';
                    // Alta proveedor de este contrato
                    const altaProvContrato = (contrato?.contratosProveedor || []).filter(p => p.estado === 'Activo').reduce((s, p) => {
                      const srvs = Array.isArray(p.serviciosJson) ? (p.serviciosJson as Servicio[]) : [];
                      return s + srvs.reduce((ss, srv) => ss + (srv.importeAlta || 0), 0);
                    }, 0);
                    return (
                    <tr key={d.id}>
                      <td className="px-4 py-2 text-gray-900 font-medium max-w-[200px] truncate">{d.titulo}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{formatCurrency(d.mensual)}</td>
                      <td className="px-4 py-2 text-right text-red-600">
                        {formatCurrency(costeContrato + costeGuardiasMensual)}
                        {costeGuardiasMensual > 0 && <span className="text-[9px] text-gray-400 block">Prov: {formatCurrency(costeContrato)} + Téc: {formatCurrency(costeGuardiasMensual)}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-green-600 font-medium">
                        {formatCurrency(margenContrato)}
                        <span className="text-[9px] text-gray-400 block">{margenPct}%</span>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-700">
                        {d.altaCliente > 0 ? formatCurrency(d.altaCliente) : <span className="text-gray-300">—</span>}
                        {altaProvContrato > 0 && <span className="text-[9px] text-red-500 block">Coste: {formatCurrency(altaProvContrato)}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-900 font-semibold">{formatCurrency(d.valorTotal)}</td>
                      <td className="px-4 py-2 text-right text-blue-700 font-medium">
                        {formatCurrency(facturasResumen.resumenPorContrato[d.id]?.facturado || 0)}
                        <span className="text-[9px] text-gray-400 block">{facturasResumen.resumenPorContrato[d.id]?.facturas || 0} fact.</span>
                      </td>
                      <td className="px-4 py-2 text-right text-purple-600 font-medium">
                        {(() => {
                          if (contrato?.tipo !== 'Guardias' || !guardiasData?.incidencias) return <span className="text-gray-300">—</span>;
                          const factExtra = guardiasData.incidencias.filter((i: any) => i.tipoResolucion === 'desplazamiento').reduce((s: number, i: any) => s + (i.importeClienteDesp || 0), 0);
                          return factExtra > 0 ? <>{formatCurrency(factExtra)}<span className="text-[9px] text-gray-400 block">desplaz.</span></> : <span className="text-gray-300">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-2 text-right text-orange-600 font-medium">
                        {formatCurrency(Math.max(0, d.importeAnio1 - (facturasResumen.resumenPorContrato[d.id]?.facturado || 0)))}
                        <span className="text-[9px] text-gray-400 block">{d.importeAnio1 > 0 ? (((facturasResumen.resumenPorContrato[d.id]?.facturado || 0) / d.importeAnio1) * 100).toFixed(0) : '0'}%</span>
                      </td>
                      <td className="px-4 py-2 text-right text-indigo-700 font-medium">
                        {formatCurrency(d.importeAnio1)}
                        <span className="text-[9px] text-gray-400 block">{d.mesesAnio1} meses</span>
                      </td>
                      <td className="px-4 py-2 text-right text-indigo-700 font-medium">
                        {formatCurrency(d.importeAnio2)}
                        <span className="text-[9px] text-gray-400 block">{d.mesesAnio2} meses</span>
                      </td>
                      <td className="px-4 py-2 text-right text-indigo-700 font-medium">
                        {formatCurrency(d.importeAnio3)}
                        <span className="text-[9px] text-gray-400 block">{d.mesesAnio3} meses</span>
                      </td>
                    </tr>
                    );
                  })}
                  {datosContratos.length > 1 && (
                    <tr className="bg-gray-50 font-bold">
                      <td className="px-4 py-2 text-gray-900">TOTAL</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(totalMensual)}</td>
                      <td className="px-4 py-2 text-right text-red-700">{formatCurrency(costeTotalProveedores + costeGuardiasTotalMensual)}</td>
                      <td className="px-4 py-2 text-right text-green-700">{formatCurrency(totalMensual - costeTotalProveedores - costeGuardiasTotalMensual)}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{totalAltaCliente > 0 ? formatCurrency(totalAltaCliente) : '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-900">{formatCurrency(totalValorContrato)}</td>
                      <td className="px-4 py-2 text-right text-blue-800">{formatCurrency(facturasResumen.totalFacturado)}</td>
                      <td className="px-4 py-2 text-right text-purple-700">
                        {(() => {
                          if (!guardiasData?.incidencias) return '—';
                          const factExtra = guardiasData.incidencias.filter((i: any) => i.tipoResolucion === 'desplazamiento').reduce((s: number, i: any) => s + (i.importeClienteDesp || 0), 0);
                          return factExtra > 0 ? formatCurrency(factExtra) : '—';
                        })()}
                      </td>
                      <td className="px-4 py-2 text-right text-orange-700">{formatCurrency(Math.max(0, totalAnio1 - facturasResumen.totalFacturado))}</td>
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

      {/* Empresas del Grupo */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BuildingOfficeIcon className="w-5 h-5 text-purple-600" />
            <h3 className="text-sm font-semibold text-gray-700">Empresas del Grupo Draxton</h3>
            <span className="text-xs text-gray-400">({empresasGrupo.length})</span>
          </div>
          <button onClick={() => setShowEmpresasForm(!showEmpresasForm)} className="text-xs text-purple-600 hover:text-purple-800 font-medium inline-flex items-center gap-1">
            <PlusIcon className="w-3 h-3" /> Añadir empresa
          </button>
        </div>
        {showEmpresasForm && (
          <div className="px-6 py-4 bg-purple-50 border-b border-purple-100">
            <div className="relative">
              <input
                type="text"
                value={busquedaCliente}
                onChange={e => buscarClientes(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="Buscar cliente por nombre o CIF..."
                autoFocus
              />
              {buscando && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
              {resultadosBusqueda.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {resultadosBusqueda.map(c => (
                    <button
                      key={c.id}
                      onClick={() => agregarEmpresaDesdeCliente(c)}
                      className="w-full text-left px-4 py-2 hover:bg-purple-50 border-b last:border-b-0 text-sm flex items-center justify-between"
                    >
                      <span className="font-medium text-gray-900">{c.nombre}</span>
                      <span className="text-xs text-gray-500">{c.cif || ''} {c.municipio ? `• ${c.municipio}` : ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {busquedaCliente.length >= 2 && resultadosBusqueda.length === 0 && !buscando && (
                <p className="text-xs text-gray-400 mt-1">No se encontraron clientes con ese nombre o CIF</p>
              )}
            </div>
            <div className="flex justify-end mt-2">
              <button onClick={() => { setShowEmpresasForm(false); setBusquedaCliente(''); setResultadosBusqueda([]); }} className="px-4 py-2 border text-sm rounded-lg hover:bg-gray-50">Cancelar</button>
            </div>
          </div>
        )}
        {empresasGrupo.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Empresa</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">CIF</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Población</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Contacto</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Estado</th>
                  <th className="text-center px-4 py-2 font-medium text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {empresasGrupo.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{emp.nombre}</td>
                    <td className="px-4 py-2 text-gray-600 font-mono">{emp.cif || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{emp.poblacion || '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{emp.contacto || emp.email || '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${emp.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.activa ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => eliminarEmpresa(emp.id)} className="text-red-500 hover:text-red-700" title="Eliminar">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {empresasGrupo.length === 0 && !showEmpresasForm && (
          <div className="px-6 py-8 text-center text-gray-400 text-sm">No hay empresas del grupo registradas. Añade la primera.</div>
        )}
      </div>

      {/* Tabla de contratos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Contratos Cliente</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contrato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Inicio Servicio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Fin</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">€/mes</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Valor Total</th>
                <th className="text-right px-4 py-3 font-medium text-blue-600">Facturado</th>
                <th className="text-right px-4 py-3 font-medium text-orange-600">Pendiente</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Proveedores</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : contratos.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-12 text-center text-gray-400">No hay contratos registrados.</td></tr>
              ) : contratos.map(c => {
                const mensual = Number(c.importeMensual) || 0;
                const perm = c.permanenciaMeses || 0;
                const valorTotal = perm > 0 ? mensual * perm : Number(c.importeAnual) || 0;
                const numProveedores = c.contratosProveedor?.length || 0;
                return (
                <Fragment key={c.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => { const newId = expandedId === c.id ? null : c.id; setExpandedId(newId); if (newId) { fetchFacturasDetalle(newId); setShowFacturasCandidatas(false); } else { setFacturasDetalle(null); } }}>
                    <td className="px-4 py-3 text-xs font-mono text-indigo-600">{c.codigoContrato || '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[250px] truncate">{c.titulo}</td>
                    <td className="px-4 py-3 text-gray-600">{c.tipo}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaInicioServicio || c.fechaInicio)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaFin)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatCurrency(c.importeMensual)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-bold">{formatCurrency(valorTotal)}</td>
                    <td className="px-4 py-3 text-right text-blue-700 font-medium text-xs">
                      {formatCurrency(facturasResumen.resumenPorContrato[c.id]?.facturado || 0)}
                      {(facturasResumen.resumenPorContrato[c.id]?.facturas || 0) > 0 && <span className="text-[9px] text-gray-400 block">{facturasResumen.resumenPorContrato[c.id]?.facturas} fact.</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-orange-600 font-medium text-xs">
                      {(() => { const svs = c.serviciosJson ? (c.serviciosJson as any[]) : []; const altas = svs.reduce((s: number, sv: any) => s + Number(sv.alta || 0), 0); const inicioSv = new Date(c.fechaInicioServicio || c.fechaInicio || ''); const esAnioInicio = inicioSv.getFullYear() === currentYear; const altasAnio = esAnioInicio ? altas : 0; const esperado = (calcularMesesEnAnio(c.fechaInicioServicio || c.fechaInicio, c.fechaFin, currentYear) * mensual) + altasAnio; const facturado = facturasResumen.resumenPorContrato[c.id]?.facturado || 0; const pendiente = Math.max(0, esperado - facturado); const pct = esperado > 0 ? ((facturado / esperado) * 100).toFixed(0) : '0'; return <>{formatCurrency(pendiente)}<span className="text-[9px] text-gray-400 block">{pct}% fact.</span></>; })()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        c.estado === 'Activo' ? 'bg-green-100 text-green-700' :
                        c.estado === 'Vencido' ? 'bg-red-100 text-red-700' :
                        c.estado === 'En renovación' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{c.estado}</span>
                      {/* Badge facturación al día / retraso */}
                      {(() => {
                        if (!c.diaFacturacion || !c.mesFacturacion || !c.fechaInicioServicio) return <span className="ml-1 text-[9px] text-gray-400" title="Sin día de facturación configurado">—</span>;
                        const hoy = new Date();
                        const diaFact = c.diaFacturacion;
                        const mesOffset = c.mesFacturacion === 'anterior' ? -1 : c.mesFacturacion === 'siguiente' ? 1 : 0;
                        const inicioServicio = new Date(c.fechaInicioServicio);
                        if (inicioServicio.getFullYear() > currentYear) return null;
                        const mesInicioServicio = inicioServicio.getFullYear() === currentYear ? inicioServicio.getMonth() : 0;
                        let mesesEsp = 0;
                        for (let m = mesInicioServicio; m <= hoy.getMonth(); m++) {
                          const mesCubierto = m + mesOffset;
                          if (mesCubierto < mesInicioServicio) continue;
                          if (m < hoy.getMonth() || (m === hoy.getMonth() && hoy.getDate() >= diaFact)) mesesEsp++;
                        }
                        const svs = c.serviciosJson ? (c.serviciosJson as any[]) : [];
                        const mens = svs.reduce((s: number, sv: any) => s + Number(sv.precioMensual || 0), 0);
                        const altas = svs.reduce((s: number, sv: any) => s + Number(sv.alta || 0), 0);
                        const esperado = (mesesEsp * mens) + altas;
                        const fact = facturasResumen.resumenPorContrato?.[c.id]?.facturado || 0;
                        const numFact = facturasResumen.resumenPorContrato?.[c.id]?.facturas || 0;
                        // Si debería haber facturas pero no hay ninguna vinculada
                        if (mesesEsp > 0 && numFact === 0) return <span className="ml-1 text-[9px] text-orange-500" title="Sin facturación vinculada. Vincula facturas para verificar.">⊘</span>;
                        const retraso = esperado - fact;
                        if (retraso > mens * 0.5) return <span className="ml-1 text-[9px] text-red-600" title={`Retraso: ${formatCurrency(retraso)}`}>⚠️</span>;
                        return <span className="ml-1 text-[9px] text-green-600" title="Facturación al día">✓</span>;
                      })()}
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
                      <td colSpan={12} className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4">
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Fecha Firma</p>
                            <p className="text-sm font-bold text-gray-900">{formatDate(c.fechaFirma)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Inicio Servicio Real</p>
                            <p className="text-sm font-medium text-indigo-700">{formatDate(c.fechaInicioServicio)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Permanencia</p>
                            <p className="text-sm font-bold text-gray-900">{c.permanenciaMeses ? `${c.permanenciaMeses} meses` : '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Prórroga</p>
                            <p className="text-sm font-bold text-gray-900">{c.prorrogaAutomatica ? `Sí (${c.plazoProrroga || 'automática'})` : 'No'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Forma de Pago</p>
                            <p className="text-sm font-bold text-gray-900 capitalize">{c.formaPago || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Facturación</p>
                            <p className="text-sm font-bold text-gray-900">
                              {c.diaFacturacion ? `Día ${c.diaFacturacion}` : '—'}
                              {c.mesFacturacion && <span className="text-gray-500 font-normal"> ({c.mesFacturacion === 'anterior' ? 'mes anterior' : c.mesFacturacion === 'en_curso' ? 'mes en curso' : c.mesFacturacion === 'siguiente' ? 'mes siguiente' : c.mesFacturacion})</span>}
                            </p>
                          </div>
                        </div>
                        {/* Alarma de facturación pendiente */}
                        {(() => {
                          if (!c.diaFacturacion || !c.mesFacturacion || !c.fechaInicioServicio) return null;
                          const hoy = new Date();
                          const diaFact = c.diaFacturacion;
                          const mesOffset = c.mesFacturacion === 'anterior' ? -1 : c.mesFacturacion === 'siguiente' ? 1 : 0;
                          // Usar fecha inicio servicio como inicio real del contrato
                          const inicioServicio = new Date(c.fechaInicioServicio);
                          const mesInicioServicio = inicioServicio.getFullYear() === currentYear ? inicioServicio.getMonth() : 0;
                          // Solo calcular si el contrato ya empezó en el año actual
                          if (inicioServicio.getFullYear() > currentYear) return null;
                          let mesesEsperados = 0;
                          // Iterar desde el mes de inicio del servicio hasta hoy
                          for (let m = mesInicioServicio; m <= hoy.getMonth(); m++) {
                            // El mes que cubre esta factura
                            const mesCubierto = m + mesOffset;
                            if (mesCubierto < mesInicioServicio) continue;
                            // Si el día de facturación ya pasó este mes (o es un mes anterior al actual)
                            if (m < hoy.getMonth() || (m === hoy.getMonth() && hoy.getDate() >= diaFact)) {
                              mesesEsperados++;
                            }
                          }
                          const servicios = c.serviciosJson ? (c.serviciosJson as any[]) : [];
                          const mensual = servicios.reduce((s: number, sv: any) => s + Number(sv.precioMensual || 0), 0);
                          // Incluir el alta en el esperado (se cobra una sola vez en la primera factura)
                          const totalAltas = servicios.reduce((s: number, sv: any) => s + Number(sv.alta || 0), 0);
                          const esperadoAFecha = (mesesEsperados * mensual) + totalAltas;
                          const facturado = facturasResumen.resumenPorContrato?.[c.id]?.facturado || 0;
                          const numFactVinc = facturasResumen.resumenPorContrato?.[c.id]?.facturas || 0;
                          // Si debería haber facturas pero no hay ninguna vinculada
                          if (mesesEsperados > 0 && numFactVinc === 0) {
                            return (
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                                <span className="text-orange-500 text-lg">⊘</span>
                                <div>
                                  <p className="text-xs font-semibold text-orange-700">Sin facturación vinculada</p>
                                  <p className="text-[10px] text-orange-600">Esperado a hoy: {formatCurrency(esperadoAFecha)} ({mesesEsperados} meses + altas). Vincula facturas para verificar el estado.</p>
                                </div>
                              </div>
                            );
                          }
                          const retraso = esperadoAFecha - facturado;
                          if (retraso > mensual * 0.5) {
                            return (
                              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                                <span className="text-red-600 text-lg">⚠️</span>
                                <div>
                                  <p className="text-xs font-semibold text-red-700">Facturación con retraso</p>
                                  <p className="text-[10px] text-red-600">Esperado a hoy: {formatCurrency(esperadoAFecha)} ({mesesEsperados} meses + altas {formatCurrency(totalAltas)}) — Facturado: {formatCurrency(facturado)} — <span className="font-bold">Diferencia: {formatCurrency(retraso)}</span></p>
                                </div>
                              </div>
                            );
                          }
                          if (retraso <= 0) {
                            return (
                              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3 flex items-center gap-2">
                                <span className="text-green-600 text-lg">✓</span>
                                <div>
                                  <p className="text-xs font-semibold text-green-700">Facturación al día</p>
                                  <p className="text-[10px] text-green-600">Esperado a hoy: {formatCurrency(esperadoAFecha)} ({mesesEsperados} meses + altas) — Facturado: {formatCurrency(facturado)}</p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                        {c.contactoCliente && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Contacto Cliente</p>
                            <p className="text-sm text-gray-900">{c.contactoCliente}</p>
                          </div>
                        )}
                        {c.contactoProveedor && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Contacto Proveedor (nuestro)</p>
                            <p className="text-sm text-gray-900">{c.contactoProveedor}</p>
                          </div>
                        )}
                        {c.notas && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Notas</p>
                            <p className="text-sm text-gray-700">{c.notas}</p>
                          </div>
                        )}
                        {c.condicionesEspeciales && (
                          <div className="mb-2">
                            <p className="text-[10px] text-gray-600 uppercase font-semibold">Condiciones Especiales</p>
                            <p className="text-sm text-gray-700">{c.condicionesEspeciales}</p>
                          </div>
                        )}
                        {/* Tabla de servicios */}
                        {c.serviciosJson && Array.isArray(c.serviciosJson) && c.serviciosJson.length > 0 && (
                          <div className="mt-4">
                            <p className="text-[10px] text-gray-500 uppercase mb-2">Servicios Incluidos ({c.serviciosJson.length})</p>
                            <table className="w-full text-xs border rounded-lg overflow-hidden">
                              <thead className="bg-gray-200">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-800 font-semibold">Ubicación</th>
                                  <th className="text-left px-3 py-2 text-gray-800 font-semibold">Servicio</th>
                                  <th className="text-left px-3 py-2 text-gray-800 font-semibold">Velocidad</th>
                                  <th className="text-left px-3 py-2 text-gray-800 font-semibold">Inicio Servicio</th>
                                  <th className="text-right px-3 py-2 text-gray-800 font-semibold">Alta €</th>
                                  <th className="text-right px-3 py-2 text-gray-800 font-semibold">Precio/mes</th>
                                  <th className="text-left px-3 py-2 text-gray-800 font-semibold">Empresa</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y bg-white">
                                {(c.serviciosJson as Servicio[]).map((s, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 font-medium text-gray-900">{s.ubicacion}</td>
                                    <td className="px-3 py-2 text-gray-700">{s.servicio}</td>
                                    <td className="px-3 py-2 text-gray-700">{s.velocidad}</td>
                                    <td className="px-3 py-2 text-gray-700">
                                      {s.fechaInicioServicio
                                        ? formatDate(s.fechaInicioServicio)
                                        : <span className="text-gray-400 italic">global</span>
                                      }
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-700">{s.importeAlta ? formatCurrency(s.importeAlta) : <span className="text-gray-400">—</span>}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(s.precioMensual)}</td>
                                    <td className="px-3 py-2 text-purple-700 text-xs">
                                      {s.empresaGrupoId ? (empresasGrupo.find(e => e.id === s.empresaGrupoId)?.nombre || 'Asignada') : <span className="text-gray-400">General</span>}
                                    </td>
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
                              <thead className="bg-purple-100">
                                <tr>
                                  <th className="text-left px-3 py-2 text-purple-900 font-semibold">Proveedor</th>
                                  <th className="text-left px-3 py-2 text-purple-900 font-semibold">Contrato</th>
                                  <th className="text-left px-3 py-2 text-purple-900 font-semibold">Inicio</th>
                                  <th className="text-left px-3 py-2 text-purple-900 font-semibold">Fin</th>
                                  <th className="text-right px-3 py-2 text-purple-900 font-semibold">€/mes</th>
                                  <th className="text-center px-3 py-2 text-purple-900 font-semibold">Estado</th>
                                  <th className="text-center px-3 py-2 text-purple-900 font-semibold">Acciones</th>
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

                        {/* Facturas Vinculadas */}
                        <div className="mt-4 border-t pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <p className="text-xs font-semibold text-gray-700 uppercase">Facturas Vinculadas</p>
                              {facturasDetalle && facturasDetalle.matrizFacturacion && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowMatriz(!showMatriz); }}
                                  className={`px-2 py-0.5 text-[9px] rounded border ${showMatriz ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-600 border-gray-200'} hover:bg-indigo-50`}
                                >
                                  {showMatriz ? '✕ Cerrar matriz' : '▦ Matriz servicios'}
                                </button>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); vincularAutomaticamente(c.id); }}
                                disabled={vinculando}
                                className="px-2 py-1 text-[10px] bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100 disabled:opacity-50"
                              >
                                {vinculando ? 'Vinculando...' : '⚡ Vincular automáticamente'}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); fetchFacturasDetalle(c.id); setShowFacturasCandidatas(!showFacturasCandidatas); }}
                                className="px-2 py-1 text-[10px] bg-gray-50 text-gray-700 rounded border border-gray-200 hover:bg-gray-100"
                              >
                                📋 {showFacturasCandidatas ? 'Ocultar candidatas' : 'Vincular manualmente'}
                              </button>
                            </div>
                          </div>
                          {/* Mini KPIs facturación del contrato */}
                          {(() => {
                            const esperadoContrato = calcularMesesEnAnio(c.fechaInicioServicio || c.fechaInicio, c.fechaFin, currentYear) * (Number(c.importeMensual) || 0);
                            const facturadoContrato = facturasResumen.resumenPorContrato[c.id]?.facturado || 0;
                            const pendienteContrato = Math.max(0, esperadoContrato - facturadoContrato);
                            const pctContrato = esperadoContrato > 0 ? ((facturadoContrato / esperadoContrato) * 100).toFixed(1) : '0';
                            return (
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                <div className="bg-blue-50 rounded-lg p-2 text-center">
                                  <p className="text-[9px] text-blue-600 uppercase">Facturado</p>
                                  <p className="text-sm font-bold text-blue-700">{formatCurrency(facturadoContrato)}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-2 text-center">
                                  <p className="text-[9px] text-gray-600 uppercase">Esperado {currentYear}</p>
                                  <p className="text-sm font-bold text-gray-700">{formatCurrency(esperadoContrato)}</p>
                                </div>
                                <div className="bg-orange-50 rounded-lg p-2 text-center">
                                  <p className="text-[9px] text-orange-600 uppercase">Pendiente ({pctContrato}%)</p>
                                  <p className="text-sm font-bold text-orange-700">{formatCurrency(pendienteContrato)}</p>
                                </div>
                              </div>
                            );
                          })()}

                          {/* Matriz de facturación: servicio × mes */}
                          {showMatriz && facturasDetalle && facturasDetalle.matrizFacturacion && facturasDetalle.servicios && expandedId === c.id && (
                            <div className="mb-4 overflow-x-auto">
                              <table className="w-full text-[10px] border border-gray-200 rounded">
                                <thead className="bg-indigo-50">
                                  <tr>
                                    <th className="text-left px-2 py-1.5 font-medium text-indigo-700 min-w-[120px]">Servicio</th>
                                    {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].map((m, i) => (
                                      <th key={i} className="text-center px-1 py-1.5 font-medium text-indigo-700 w-10">{m}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {facturasDetalle.servicios.map((srv: any) => (
                                    <tr key={srv.index}>
                                      <td className="px-2 py-1.5 text-gray-800 font-medium truncate max-w-[150px]" title={`${srv.ubicacion} - ${formatCurrency(srv.precioMensual)}/mes`}>
                                        {srv.ubicacion}
                                      </td>
                                      {Array.from({length: 12}, (_, m) => m + 1).map(mes => {
                                        const celda = facturasDetalle.matrizFacturacion[srv.index]?.[mes];
                                        return (
                                          <td key={mes} className="text-center px-1 py-1.5">
                                            {celda?.facturado ? (
                                              <span className="inline-block w-5 h-5 leading-5 rounded bg-green-100 text-green-700 font-bold" title={`${formatCurrency(celda.importe)}`}>✓</span>
                                            ) : mes <= new Date().getMonth() + 1 ? (
                                              <span className="inline-block w-5 h-5 leading-5 rounded bg-red-50 text-red-400" title="No facturado">✗</span>
                                            ) : (
                                              <span className="inline-block w-5 h-5 leading-5 rounded bg-gray-50 text-gray-300">•</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Tabla de facturas vinculadas con selector de servicio */}
                          {facturasDetalle && facturasDetalle.vinculadas && facturasDetalle.vinculadas.length > 0 && expandedId === c.id && (
                            <table className="w-full text-xs mb-3">
                              <thead className="bg-blue-50">
                                <tr>
                                  <th className="text-left px-2 py-1.5 font-medium text-blue-700">Fecha</th>
                                  <th className="text-left px-2 py-1.5 font-medium text-blue-700">Nº Factura</th>
                                  <th className="text-left px-2 py-1.5 font-medium text-blue-700">Empresa</th>
                                  <th className="text-right px-2 py-1.5 font-medium text-blue-700">Base Imp.</th>
                                  <th className="text-left px-2 py-1.5 font-medium text-blue-700">Servicio asignado</th>
                                  <th className="text-center px-2 py-1.5 font-medium text-blue-700">Estado</th>
                                  <th className="text-center px-2 py-1.5 font-medium text-blue-700">Acción</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {facturasDetalle.vinculadas.map((fv: any) => (
                                  <Fragment key={fv.id}>
                                    <tr className={`hover:bg-blue-50/50 cursor-pointer ${facturaExpandidaId === fv.id ? 'bg-blue-50' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); setFacturaExpandidaId(facturaExpandidaId === fv.id ? null : fv.id); }}>
                                      <td className="px-2 py-1.5 text-gray-600">{fv.factura?.fecha ? new Date(fv.factura.fecha).toLocaleDateString('es-ES') : '—'}</td>
                                      <td className="px-2 py-1.5 font-mono text-blue-700 font-medium">{fv.factura?.numero || fv.factura?.documento || '—'}</td>
                                      <td className="px-2 py-1.5 text-gray-700 truncate max-w-[180px]" title={fv.factura?.clienteNombre}>{fv.factura?.clienteNombre || '—'}</td>
                                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">{formatCurrency(fv.importeAsignado || fv.factura?.baseImponible)}</td>
                                      <td className="px-2 py-1.5">
                                        <select
                                          value={fv.servicioIndex ?? ''}
                                          onChange={(e) => { e.stopPropagation(); asignarServicioFactura(fv.id, e.target.value === '' ? null : parseInt(e.target.value), c.id); }}
                                          onClick={(e) => e.stopPropagation()}
                                          className="text-[10px] border border-gray-300 rounded px-1 py-0.5 w-full max-w-[160px] bg-white"
                                        >
                                          <option value="">-- Sin asignar --</option>
                                          {facturasDetalle.servicios?.map((srv: any) => (
                                            <option key={srv.index} value={srv.index}>{srv.ubicacion} ({formatCurrency(srv.precioMensual)})</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-2 py-1.5 text-center">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                          fv.estado === 'asignada' ? 'bg-green-100 text-green-700' :
                                          fv.estado === 'pendiente' ? 'bg-yellow-100 text-yellow-700' :
                                          'bg-gray-100 text-gray-600'
                                        }`}>
                                          {fv.estado === 'asignada' ? '✓ Asignada' : fv.estado === 'pendiente' ? '○ Pendiente' : '⚡ Auto'}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 text-center">
                                        <button onClick={(e) => { e.stopPropagation(); desvincularFactura(c.id, fv.facturaId); }} className="text-red-500 hover:text-red-700 text-[10px]">
                                          ✕
                                        </button>
                                      </td>
                                    </tr>
                                    {/* Detalle inline de la factura */}
                                    {facturaExpandidaId === fv.id && (
                                      <tr>
                                        <td colSpan={7} className="bg-blue-50/70 px-4 py-3 border-l-4 border-blue-400">
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Nº Documento</p>
                                              <p className="font-medium text-gray-900">{fv.factura?.numero || '—'}</p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Empresa (cliente)</p>
                                              <p className="font-medium text-gray-900">{fv.factura?.clienteNombre || '—'}</p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Código Cliente</p>
                                              <p className="font-medium text-gray-900">{fv.factura?.codigoCliente || '—'}</p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Situación</p>
                                              <p className={`font-medium ${fv.factura?.situacion === 'COBRADA' ? 'text-green-700' : 'text-orange-600'}`}>{fv.factura?.situacion || '—'}</p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Base Imponible</p>
                                              <p className="font-bold text-gray-900">{formatCurrency(fv.factura?.baseImponible)}</p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Total (con IVA)</p>
                                              <p className="font-bold text-gray-900">{formatCurrency(fv.factura?.total)}</p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Servicio esperado</p>
                                              <p className="font-medium text-indigo-700">
                                                {fv.servicioIndex !== null && fv.servicioIndex !== undefined && facturasDetalle.servicios?.[fv.servicioIndex]
                                                  ? `${facturasDetalle.servicios[fv.servicioIndex].ubicacion} (${formatCurrency(facturasDetalle.servicios[fv.servicioIndex].precioMensual)}/mes)`
                                                  : 'Sin asignar'}
                                              </p>
                                            </div>
                                            <div>
                                              <p className="text-gray-500 text-[9px] uppercase">Diferencia vs esperado</p>
                                              {(() => {
                                                if (fv.servicioIndex === null || fv.servicioIndex === undefined) return <p className="text-gray-400">—</p>;
                                                const srv = facturasDetalle.servicios?.[fv.servicioIndex];
                                                if (!srv) return <p className="text-gray-400">—</p>;
                                                const diff = Number(fv.importeAsignado) - srv.precioMensual;
                                                return <p className={`font-medium ${Math.abs(diff) < 1 ? 'text-green-700' : diff > 0 ? 'text-orange-600' : 'text-red-600'}`}>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</p>;
                                              })()}
                                            </div>
                                          </div>
                                          <div className="mt-2 flex gap-2">
                                            <a href={`/admin/facturacion?buscar=${encodeURIComponent(fv.factura?.numero || '')}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                                              Abrir en Facturación →
                                            </a>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {/* Facturas candidatas para vincular manualmente */}
                          {showFacturasCandidatas && facturasDetalle && facturasDetalle.candidatas && facturasDetalle.candidatas.length > 0 && expandedId === c.id && (
                            <div className="bg-yellow-50 rounded-lg p-3 mb-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-medium text-yellow-700">Facturas candidatas ({facturasDetalle.candidatas.length} disponibles):</p>
                                <div className="flex gap-1 flex-wrap">
                                  {(() => {
                                    const empresasUnicas = [...new Set(facturasDetalle.candidatas.map((fc: any) => fc.clienteNombre))];
                                    return empresasUnicas.map((emp: string) => (
                                      <button
                                        key={emp}
                                        onClick={(e) => { e.stopPropagation(); /* Filter handled inline below */ }}
                                        className="px-1.5 py-0.5 text-[9px] bg-yellow-200 text-yellow-800 rounded hover:bg-yellow-300 truncate max-w-[120px]"
                                        title={emp}
                                      >
                                        {emp?.split(' ').slice(0, 2).join(' ')}
                                      </button>
                                    ));
                                  })()}
                                </div>
                              </div>
                              <div className="max-h-[300px] overflow-y-auto">
                              <table className="w-full text-xs">
                                <thead className="bg-yellow-100 sticky top-0">
                                  <tr>
                                    <th className="text-left px-3 py-1 font-medium text-yellow-800">Fecha</th>
                                    <th className="text-left px-3 py-1 font-medium text-yellow-800">Nº Factura</th>
                                    <th className="text-left px-3 py-1 font-medium text-yellow-800">Empresa</th>
                                    <th className="text-right px-3 py-1 font-medium text-yellow-800">Base Imp.</th>
                                    <th className="text-center px-3 py-1 font-medium text-yellow-800">Acción</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-yellow-200">
                                  {facturasDetalle.candidatas.map((fc: any) => (
                                    <tr key={fc.id} className="hover:bg-yellow-100/50">
                                      <td className="px-3 py-1.5 text-gray-600">{fc.fecha ? new Date(fc.fecha).toLocaleDateString('es-ES') : '—'}</td>
                                      <td className="px-3 py-1.5 font-mono text-gray-900">{fc.numero || fc.documento || '—'}</td>
                                      <td className="px-3 py-1.5 text-gray-700 truncate max-w-[150px]" title={fc.clienteNombre}>{fc.clienteNombre || '—'}</td>
                                      <td className="px-3 py-1.5 text-right font-medium text-gray-900">{formatCurrency(fc.baseImponible)}</td>
                                      <td className="px-3 py-1.5 text-center">
                                        <button onClick={(e) => { e.stopPropagation(); vincularManual(c.id, [fc.id]); }} className="text-blue-600 hover:text-blue-800 text-[10px] font-medium">
                                          + Vincular
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                            </div>
                          )}
                          {(!facturasDetalle || !facturasDetalle.vinculadas || facturasDetalle.vinculadas.length === 0) && expandedId === c.id && !showFacturasCandidatas && (
                            <p className="text-xs text-gray-400 italic">No hay facturas vinculadas. Usa "Vincular automáticamente" para detectar facturas por empresa e importe.</p>
                          )}
                        </div>

                        {/* Sección de Costes de Guardias (solo para contratos tipo Guardias) */}
                        {c.tipo === 'Guardias' && guardiasData && (
                          <div className="mt-4 border-t pt-4">
                            <p className="text-[10px] text-gray-500 uppercase mb-3 font-semibold">💰 Costes y Facturación de Guardias</p>
                            
                            {/* Panel de Configuración de Tarifas */}
                            <div className="mb-4 p-4 bg-gray-50 border rounded-lg">
                              <div className="flex justify-between items-center mb-3">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">⚙️ Configuración de Tarifas</p>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const form = document.getElementById('guardias-config-form') as HTMLFormElement;
                                    if (!form) return;
                                    const formData = new FormData(form);
                                    const body = {
                                      action: 'updateConfig',
                                      costeHoraTecnico: parseFloat(formData.get('costeHoraTecnico') as string) || null,
                                      costeDesplazFijo: parseFloat(formData.get('costeDesplazFijo') as string) || null,
                                      precioHoraCliente: parseFloat(formData.get('precioHoraCliente') as string) || null,
                                      precioDesplazCliente: parseFloat(formData.get('precioDesplazCliente') as string) || null,
                                      margenDesplazamiento: parseFloat(formData.get('margenDesplazamiento') as string) || null,
                                    };
                                    await fetch('/api/admin/clientes/ggcc/draxton/guardias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                                    fetchGuardiasData();
                                  }}
                                  className="px-3 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >Guardar tarifas</button>
                              </div>
                              <form id="guardias-config-form" className="grid grid-cols-2 md:grid-cols-5 gap-3" onClick={e => e.stopPropagation()}>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Coste hora técnico (€)</label>
                                  <input name="costeHoraTecnico" type="number" step="0.01" defaultValue={guardiasData.config?.costeHoraTecnico || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Ej: 25.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Coste fijo desplaz. (€)</label>
                                  <input name="costeDesplazFijo" type="number" step="0.01" defaultValue={guardiasData.config?.costeDesplazFijo || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Ej: 50.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Precio hora cliente (€)</label>
                                  <input name="precioHoraCliente" type="number" step="0.01" defaultValue={guardiasData.config?.precioHoraCliente || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Ej: 45.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Precio fijo desplaz. cliente (€)</label>
                                  <input name="precioDesplazCliente" type="number" step="0.01" defaultValue={guardiasData.config?.precioDesplazCliente || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Ej: 75.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Margen desplaz. (%)</label>
                                  <input name="margenDesplazamiento" type="number" step="0.1" defaultValue={guardiasData.config?.margenDesplazamiento || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="Ej: 30" />
                                </div>
                              </form>
                              <p className="text-[9px] text-gray-400 mt-2">Estos valores se usan para calcular automáticamente el coste y el importe a facturar cuando se registra un desplazamiento.</p>
                            </div>

                            {/* Tarifas por nivel de técnico - Editable */}
                            <div className="mb-4 p-3 bg-white border rounded-lg">
                              <div className="flex justify-between items-center mb-2">
                                <p className="text-[10px] text-gray-500 uppercase font-semibold">Tarifas Coste Técnico por Nivel (€/semana)</p>
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const n1 = (document.getElementById('tarifa-n1') as HTMLInputElement)?.value;
                                    const n2 = (document.getElementById('tarifa-n2') as HTMLInputElement)?.value;
                                    const n3 = (document.getElementById('tarifa-n3') as HTMLInputElement)?.value;
                                    const niveles = [
                                      { nivel: 1, importeSemana: parseFloat(n1) || 0 },
                                      { nivel: 2, importeSemana: parseFloat(n2) || 0 },
                                      { nivel: 3, importeSemana: parseFloat(n3) || 0 },
                                    ].filter(n => n.importeSemana > 0);
                                    for (const niv of niveles) {
                                      await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ action: 'addTarifa', nivel: niv.nivel, importeSemana: niv.importeSemana, fechaDesde: (document.getElementById('tarifa-fecha') as HTMLInputElement)?.value || new Date().toISOString().slice(0, 10) })
                                      });
                                    }
                                    fetchGuardiasData();
                                  }}
                                  className="px-2 py-1 text-[10px] bg-indigo-600 text-white rounded hover:bg-indigo-700"
                                >Guardar niveles</button>
                              </div>
                              <div className="grid grid-cols-4 gap-3" onClick={e => e.stopPropagation()}>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Nivel 1 (€/semana)</label>
                                  <input id="tarifa-n1" type="number" step="0.01" defaultValue={guardiasData.tarifas?.find((t: any) => t.nivel === 1 && t.vigente)?.importeSemana || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="100.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Nivel 2 (€/semana)</label>
                                  <input id="tarifa-n2" type="number" step="0.01" defaultValue={guardiasData.tarifas?.find((t: any) => t.nivel === 2 && t.vigente)?.importeSemana || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="150.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Nivel 3 (€/semana)</label>
                                  <input id="tarifa-n3" type="number" step="0.01" defaultValue={guardiasData.tarifas?.find((t: any) => t.nivel === 3 && t.vigente)?.importeSemana || ''} className="w-full border rounded px-2 py-1.5 text-xs" placeholder="175.00" />
                                </div>
                                <div>
                                  <label className="text-[10px] text-gray-500 block mb-1">Fecha desde</label>
                                  <input id="tarifa-fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full border rounded px-2 py-1.5 text-xs" />
                                </div>
                              </div>
                              {/* Tarifas vigentes con opción de eliminar */}
                              {guardiasData.tarifas && guardiasData.tarifas.filter((t: any) => t.vigente).length > 0 && (
                                <div className="mt-2 space-y-1">
                                  <p className="text-[9px] text-gray-500 font-semibold">Tarifas vigentes:</p>
                                  {guardiasData.tarifas.filter((t: any) => t.vigente).map((t: any) => (
                                    <div key={t.id} className="flex items-center justify-between text-[10px] bg-green-50 border border-green-200 rounded px-2 py-1">
                                      <span className="text-green-800">N{t.nivel}: {formatCurrency(t.importeSemana)}/sem (desde {new Date(t.fechaDesde).toLocaleDateString('es-ES')})</span>
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!confirm(`¿Eliminar tarifa N${t.nivel}?`)) return;
                                          await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ action: 'deleteTarifa', tarifaId: t.id })
                                          });
                                          fetchGuardiasData();
                                        }}
                                        className="text-red-500 hover:text-red-700 text-[9px] ml-2"
                                      >✕</button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {guardiasData.tarifas && guardiasData.tarifas.filter((t: any) => !t.vigente).length > 0 && (
                                <details className="mt-2">
                                  <summary className="text-[9px] text-gray-400 cursor-pointer">Histórico de tarifas anteriores</summary>
                                  <div className="mt-1 space-y-0.5">
                                    {guardiasData.tarifas.filter((t: any) => !t.vigente).map((t: any) => (
                                      <div key={t.id} className="flex items-center justify-between text-[9px] text-gray-400">
                                        <span>N{t.nivel}: {formatCurrency(t.importeSemana)} (desde {new Date(t.fechaDesde).toLocaleDateString('es-ES')} hasta {t.fechaHasta ? new Date(t.fechaHasta).toLocaleDateString('es-ES') : '—'})</span>
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm(`¿Eliminar tarifa histórica N${t.nivel}?`)) return;
                                            await fetch('/api/admin/clientes/ggcc/draxton/guardias', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ action: 'deleteTarifa', tarifaId: t.id })
                                            });
                                            fetchGuardiasData();
                                          }}
                                          className="text-red-400 hover:text-red-600 text-[9px] ml-2"
                                        >✕</button>
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              )}
                            </div>

                            {/* Resumen de costes */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                              {/* Coste acumulado guardias */}
                              <div className="bg-white border rounded-lg p-3">
                                <p className="text-[10px] text-gray-500 uppercase mb-2 font-semibold">Coste Guardias {new Date().getFullYear()}</p>
                                {(() => {
                                  // Calcular semanas del año hasta hoy
                                  const hoy = new Date();
                                  const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
                                  const semanasTranscurridas = Math.ceil((hoy.getTime() - inicioAnio.getTime()) / (7 * 24 * 60 * 60 * 1000));
                                  const semanasAsignadas = guardiasData.asignaciones?.length || 0;
                                  const semanasSinAsignar = Math.max(0, semanasTranscurridas - semanasAsignadas);
                                  const COSTE_DEFECTO_SEMANA = 200;
                                  const costeAsignadas = guardiasData.asignaciones?.reduce((s: number, a: any) => s + (a.importeSemana || 0), 0) || 0;
                                  const costeSinAsignar = semanasSinAsignar * COSTE_DEFECTO_SEMANA;
                                  const costeTotal = costeAsignadas + costeSinAsignar;
                                  return (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Semanas asignadas</span>
                                        <span className="font-bold text-gray-900">{semanasAsignadas} / {semanasTranscurridas}</span>
                                      </div>
                                      {semanasSinAsignar > 0 && (
                                        <div className="flex justify-between text-xs">
                                          <span className="text-orange-600">Sin asignar (200€/sem)</span>
                                          <span className="font-bold text-orange-600">{semanasSinAsignar} sem → {formatCurrency(costeSinAsignar)}</span>
                                        </div>
                                      )}
                                      <div className="flex justify-between text-xs border-t pt-1">
                                        <span className="text-gray-600">Coste total técnicos</span>
                                        <span className="font-bold text-red-600">{formatCurrency(costeTotal)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                              {/* Desplazamientos - Coste */}
                              <div className="bg-white border rounded-lg p-3">
                                <p className="text-[10px] text-gray-500 uppercase mb-2 font-semibold">Coste Desplazamientos</p>
                                {(() => {
                                  const incDesplaz = guardiasData.incidencias?.filter((i: any) => i.tipoResolucion === 'desplazamiento') || [];
                                  const totalHoras = incDesplaz.reduce((s: number, i: any) => s + (i.horasDesplazamiento || 0), 0);
                                  const totalCoste = incDesplaz.reduce((s: number, i: any) => s + (i.costeDesplazamiento || 0), 0);
                                  return (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Nº desplazamientos</span>
                                        <span className="font-bold text-gray-900">{incDesplaz.length}</span>
                                      </div>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Horas totales</span>
                                        <span className="font-bold text-gray-900">{totalHoras}h</span>
                                      </div>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Coste total</span>
                                        <span className="font-bold text-red-600">{formatCurrency(totalCoste)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                              {/* Desplazamientos - Facturación a Draxton */}
                              <div className="bg-white border rounded-lg p-3">
                                <p className="text-[10px] text-gray-500 uppercase mb-2 font-semibold">Facturar a Draxton</p>
                                {(() => {
                                  const incDesplaz = guardiasData.incidencias?.filter((i: any) => i.tipoResolucion === 'desplazamiento') || [];
                                  const totalFacturar = incDesplaz.reduce((s: number, i: any) => s + (i.importeClienteDesp || 0), 0);
                                  const totalCoste = incDesplaz.reduce((s: number, i: any) => s + (i.costeDesplazamiento || 0), 0);
                                  const margen = totalFacturar - totalCoste;
                                  return (
                                    <div className="space-y-1">
                                      <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Total a facturar</span>
                                        <span className="font-bold text-green-600">{formatCurrency(totalFacturar)}</span>
                                      </div>
                                      <div className="flex justify-between text-xs">
                                        <span className="text-gray-600">Margen desplaz.</span>
                                        <span className={`font-bold ${margen >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(margen)}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Detalle de desplazamientos con incidencias */}
                            {(() => {
                              const incDesplaz = guardiasData.incidencias?.filter((i: any) => i.tipoResolucion === 'desplazamiento') || [];
                              if (incDesplaz.length === 0) return <p className="text-xs text-gray-400 italic">No hay desplazamientos registrados.</p>;
                              return (
                                <div>
                                  <p className="text-[10px] text-gray-500 uppercase mb-2 font-semibold">Detalle Desplazamientos</p>
                                  <table className="w-full text-xs border rounded-lg overflow-hidden">
                                    <thead className="bg-gray-200">
                                      <tr>
                                        <th className="text-left px-3 py-1.5 text-gray-700">Fecha</th>
                                        <th className="text-left px-3 py-1.5 text-gray-700">Técnico</th>
                                        <th className="text-left px-3 py-1.5 text-gray-700">Resumen</th>
                                        <th className="text-right px-3 py-1.5 text-gray-700">Horas</th>
                                        <th className="text-right px-3 py-1.5 text-gray-700">Coste</th>
                                        <th className="text-right px-3 py-1.5 text-gray-700">Facturar</th>
                                        <th className="text-right px-3 py-1.5 text-gray-700">Margen</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {incDesplaz.map((inc: any) => (
                                        <tr key={inc.id} className="border-t">
                                          <td className="px-3 py-1.5 text-gray-700">{new Date(inc.fechaHora).toLocaleDateString('es-ES')}</td>
                                          <td className="px-3 py-1.5 text-gray-700">{inc.asignacion?.tecnico?.empleado?.nombreCompleto || '—'}</td>
                                          <td className="px-3 py-1.5 text-gray-700 max-w-[200px] truncate">{inc.resumen}</td>
                                          <td className="px-3 py-1.5 text-right text-gray-900 font-medium">{inc.horasDesplazamiento || 0}h</td>
                                          <td className="px-3 py-1.5 text-right text-red-600 font-medium">{formatCurrency(inc.costeDesplazamiento)}</td>
                                          <td className="px-3 py-1.5 text-right text-green-600 font-medium">{formatCurrency(inc.importeClienteDesp)}</td>
                                          <td className="px-3 py-1.5 text-right font-medium" style={{ color: (inc.importeClienteDesp || 0) - (inc.costeDesplazamiento || 0) >= 0 ? '#16a34a' : '#dc2626' }}>{formatCurrency((inc.importeClienteDesp || 0) - (inc.costeDesplazamiento || 0))}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })()}
                          </div>
                        )}

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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ID Contrato</label>
                <input type="text" value={form.codigoContrato || ''} onChange={e => setForm({ ...form, codigoContrato: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 font-mono" placeholder="Ej: DRX-CLI-001" />
              </div>
              <div>
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Empresa Facturación</label>
                <select value={form.clienteFacturacionId || ''} onChange={e => setForm({ ...form, clienteFacturacionId: e.target.value ? parseInt(e.target.value) : null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  <option value="">Sin asignar (general)</option>
                  {empresasGrupo.filter(e => e.activa).map(e => <option key={e.id} value={e.clienteWebId || 0}>{e.nombre}{e.cif ? ` (${e.cif})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pago</label>
                <select value={form.formaPago || ''} onChange={e => setForm({ ...form, formaPago: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  <option value="">Seleccionar...</option>
                  {FORMAS_PAGO.map(f => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Día de Facturación</label>
                <input type="number" min="1" max="31" value={form.diaFacturacion || ''} onChange={e => setForm({ ...form, diaFacturacion: parseInt(e.target.value) || null })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900" placeholder="1-31" />
                <p className="text-[10px] text-gray-400 mt-1">Día del mes en que se emite la factura</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mes que se factura</label>
                <select value={form.mesFacturacion || ''} onChange={e => setForm({ ...form, mesFacturacion: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900">
                  <option value="">Seleccionar...</option>
                  <option value="anterior">Mes anterior</option>
                  <option value="en_curso">Mes en curso</option>
                  <option value="siguiente">Mes siguiente</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-1">Qué mes cubre la factura emitida</p>
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
                      <th className="text-right px-2 py-1">Alta €</th>
                      <th className="text-right px-2 py-1">€/mes</th>
                      <th className="text-left px-2 py-1">Empresa</th>
                      <th className="px-2 py-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.serviciosJson as Servicio[]).map((s, i) => (
                      <tr key={i} className="border-t border-green-100">
                        <td className="px-2 py-1">
                          <input type="text" value={s.ubicacion || ''} onChange={e => updateServicio(i, 'ubicacion', e.target.value)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-full" placeholder="Ubicación" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="text" value={s.servicio || ''} onChange={e => updateServicio(i, 'servicio', e.target.value)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-full" placeholder="Servicio" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="text" value={s.velocidad || ''} onChange={e => updateServicio(i, 'velocidad', e.target.value)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-20" placeholder="Vel." />
                        </td>
                        <td className="px-2 py-1">
                          <input type="date" value={s.fechaInicioServicio || ''} onChange={e => updateServicio(i, 'fechaInicioServicio', e.target.value || null)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28" />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" value={s.importeAlta || ''} onChange={e => updateServicio(i, 'importeAlta', e.target.value ? parseFloat(e.target.value) : 0)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-16 text-right" placeholder="0" />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" value={s.precioMensual || ''} onChange={e => updateServicio(i, 'precioMensual', e.target.value ? parseFloat(e.target.value) : 0)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-20 text-right" placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1">
                          <select value={s.empresaGrupoId || ''} onChange={e => updateServicio(i, 'empresaGrupoId', e.target.value || null)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28">
                            <option value="">General</option>
                            {empresasGrupo.filter(emp => emp.activa).map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button type="button" onClick={() => { const updated = [...(form.serviciosJson as Servicio[])]; updated.splice(i, 1); setForm({...form, serviciosJson: updated}); }} className="text-red-400 hover:text-red-600" title="Eliminar servicio">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={() => { const updated = [...(form.serviciosJson as Servicio[] || []), { ubicacion: '', servicio: '', velocidad: '', precioMensual: 0, importeAlta: 0, fechaInicioServicio: null }]; setForm({...form, serviciosJson: updated}); }} className="text-xs text-green-700 hover:text-green-900 font-medium inline-flex items-center gap-1">
                    <PlusIcon className="w-3.5 h-3.5" /> Añadir servicio
                  </button>
                  <div className="text-xs font-semibold text-green-800 flex gap-4">
                    <span>Total Alta: {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format((form.serviciosJson as Servicio[]).reduce((sum, s) => sum + (s.importeAlta || 0), 0))} €</span>
                    <span>Total Mensual: {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format((form.serviciosJson as Servicio[]).reduce((sum, s) => sum + (s.precioMensual || 0), 0))} €/mes</span>
                  </div>
                </div>
              </div>
            )}
            {/* Botón añadir servicio siempre visible */}
            {(!form.serviciosJson || !Array.isArray(form.serviciosJson) || form.serviciosJson.length === 0) && (
              <button type="button" onClick={() => { setForm({...form, serviciosJson: [{ ubicacion: '', servicio: '', velocidad: '', precioMensual: 0, importeAlta: 0, fechaInicioServicio: null }]}); }} className="mt-4 text-xs text-green-700 hover:text-green-900 font-medium inline-flex items-center gap-1 border border-green-300 rounded px-3 py-1.5">
                <PlusIcon className="w-3.5 h-3.5" /> Añadir servicios manualmente
              </button>
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">ID Contrato</label>
                <input type="text" value={formProv.codigoContrato || ''} onChange={e => setFormProv({ ...formProv, codigoContrato: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900 font-mono" placeholder="Ej: DRX-PRV-001" />
              </div>
              <div>
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
                      <th className="text-right px-2 py-1">Alta €</th>
                      <th className="text-right px-2 py-1">€/mes</th>
                      <th className="text-left px-2 py-1">Empresa</th>
                      <th className="px-2 py-1 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(formProv.serviciosJson as Servicio[]).map((s, i) => (
                      <tr key={i} className="border-t border-purple-100">
                        <td className="px-2 py-1">
                          <input type="text" value={s.ubicacion || ''} onChange={e => updateServicioProv(i, 'ubicacion', e.target.value)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-full" placeholder="Ubicación" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="text" value={s.servicio || ''} onChange={e => updateServicioProv(i, 'servicio', e.target.value)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-full" placeholder="Servicio" />
                        </td>
                        <td className="px-2 py-1">
                          <input type="text" value={s.velocidad || ''} onChange={e => updateServicioProv(i, 'velocidad', e.target.value)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-20" placeholder="Vel." />
                        </td>
                        <td className="px-2 py-1">
                          <input type="date" value={s.fechaInicioServicio || ''} onChange={e => updateServicioProv(i, 'fechaInicioServicio', e.target.value || null)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28" />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" value={s.importeAlta || ''} onChange={e => updateServicioProv(i, 'importeAlta', e.target.value ? parseFloat(e.target.value) : 0)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-16 text-right" placeholder="0" />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" step="0.01" value={s.precioMensual || ''} onChange={e => updateServicioProv(i, 'precioMensual', e.target.value ? parseFloat(e.target.value) : 0)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-20 text-right" placeholder="0.00" />
                        </td>
                        <td className="px-2 py-1">
                          <select value={s.empresaGrupoId || ''} onChange={e => updateServicioProv(i, 'empresaGrupoId', e.target.value || null)} className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28">
                            <option value="">General</option>
                            {empresasGrupo.filter(emp => emp.activa).map(emp => <option key={emp.id} value={emp.id}>{emp.nombre}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-center">
                          <button type="button" onClick={() => { const updated = [...(formProv.serviciosJson as Servicio[])]; updated.splice(i, 1); setFormProv({...formProv, serviciosJson: updated}); }} className="text-red-400 hover:text-red-600" title="Eliminar servicio">
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between mt-2">
                  <button type="button" onClick={() => { const updated = [...(formProv.serviciosJson as Servicio[] || []), { ubicacion: '', servicio: '', velocidad: '', precioMensual: 0, importeAlta: 0, fechaInicioServicio: null }]; setFormProv({...formProv, serviciosJson: updated}); }} className="text-xs text-purple-700 hover:text-purple-900 font-medium inline-flex items-center gap-1">
                    <PlusIcon className="w-3.5 h-3.5" /> Añadir servicio
                  </button>
                  <div className="text-xs font-semibold text-purple-800 flex gap-4">
                    <span>Total Alta: {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format((formProv.serviciosJson as Servicio[]).reduce((sum, s) => sum + (s.importeAlta || 0), 0))} €</span>
                    <span>Total Mensual: {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format((formProv.serviciosJson as Servicio[]).reduce((sum, s) => sum + (s.precioMensual || 0), 0))} €/mes</span>
                  </div>
                </div>
              </div>
            )}
            {/* Botón añadir servicio siempre visible */}
            {(!formProv.serviciosJson || !Array.isArray(formProv.serviciosJson) || formProv.serviciosJson.length === 0) && (
              <button type="button" onClick={() => { setFormProv({...formProv, serviciosJson: [{ ubicacion: '', servicio: '', velocidad: '', precioMensual: 0, importeAlta: 0, fechaInicioServicio: null }]}); }} className="mt-4 text-xs text-purple-700 hover:text-purple-900 font-medium inline-flex items-center gap-1 border border-purple-300 rounded px-3 py-1.5">
                <PlusIcon className="w-3.5 h-3.5" /> Añadir servicios manualmente
              </button>
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
