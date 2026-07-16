'use client'

import { useState, useEffect, Fragment } from 'react'
import { DocumentDuplicateIcon, PlusIcon, XMarkIcon, ArrowPathIcon, DocumentArrowUpIcon, TrashIcon, EyeIcon, PencilIcon } from '@heroicons/react/24/outline'

interface Servicio {
  ubicacion: string;
  servicio: string;
  velocidad: string;
  precioMensual: number;
  fechaInicioServicio?: string | null;
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
}

const TIPOS_CONTRATO = ['Servicios Internet', 'Mantenimiento', 'Guardias', 'Consultoría', 'Otro'];
const ESTADOS = ['Activo', 'Vencido', 'En renovación', 'Cancelado'];
const FORMAS_PAGO = ['confirming', 'transferencia', 'domiciliacion', 'tarjeta'];

export default function DraxtonContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<Partial<Contrato>>({
    titulo: '',
    tipo: 'Servicios Internet',
    estado: 'Activo',
    prorrogaAutomatica: true,
  });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

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

  async function analizarPDF(file: File) {
    setAnalizando(true);
    try {
      const texto = await extraerTextoPDF(file);
      if (!texto || texto.trim().length < 50) {
        alert('No se pudo extraer texto del PDF. Puede ser un escaneo/imagen sin texto seleccionable.');
        setAnalizando(false);
        return;
      }
      const res = await fetch('/api/admin/clientes/ggcc/draxton/contratos/analizar-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, nombreArchivo: file.name }),
      });
      const data = await res.json();
      if (data.success) {
        setForm({
          ...data.datos,
          documentoNombre: data.documentoNombre,
        });
      } else {
        alert('Error al analizar: ' + (data.error || 'Error desconocido'));
      }
    } catch (err: any) {
      alert('Error al analizar el PDF: ' + (err?.message || 'Error desconocido'));
    }
    setAnalizando(false);
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

  async function handleGuardar() {
    if (!form.titulo) {
      alert('El título es obligatorio');
      return;
    }
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setArchivo(file);
      analizarPDF(file);
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      setArchivo(file);
      analizarPDF(file);
    } else {
      alert('Solo se aceptan archivos PDF');
    }
  }

  function updateServicio(index: number, field: keyof Servicio, value: string | number | null) {
    const servicios = [...(form.serviciosJson || [])];
    servicios[index] = { ...servicios[index], [field]: value };
    setForm({ ...form, serviciosJson: servicios });
  }

  const formatDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('es-ES') : '—';
  const formatCurrency = (n: number | string | null | undefined) => {
    const num = typeof n === 'string' ? parseFloat(n) : n;
    return num != null && !isNaN(num) ? num.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '—';
  };

  // KPIs
  const activos = contratos.filter(c => c.estado === 'Activo').length;
  const proximoVencimiento = contratos
    .filter(c => c.estado === 'Activo' && c.fechaFin)
    .sort((a, b) => new Date(a.fechaFin!).getTime() - new Date(b.fechaFin!).getTime())[0];
  const valorTotal = contratos
    .filter(c => c.estado === 'Activo')
    .reduce((sum, c) => sum + (Number(c.importeAnual) || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DocumentDuplicateIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Gestión de Contratos</h2>
              <p className="text-sm text-gray-500">Documentación, vencimientos y datos generales de los contratos con Draxton</p>
            </div>
          </div>
          <button
            onClick={() => { setEditingId(null); setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setShowForm(true); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Nuevo Contrato
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Contratos Activos</div>
          <div className="text-2xl font-bold text-green-700 mt-1">{activos}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Próximo Vencimiento</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {proximoVencimiento ? formatDate(proximoVencimiento.fechaFin) : '—'}
          </div>
          {proximoVencimiento && (
            <p className="text-xs text-gray-500 mt-1 truncate">{proximoVencimiento.titulo}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="text-xs text-gray-500 uppercase tracking-wide">Valor Total Contratos</div>
          <div className="text-2xl font-bold text-indigo-700 mt-1">{formatCurrency(valorTotal)}</div>
        </div>
      </div>

      {/* Tabla de contratos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Contratos</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contrato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Inicio Contrato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Inicio Servicio</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha Fin</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">€/mes</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">€/año</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Cargando...</td></tr>
              ) : contratos.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">No hay contratos registrados. Haz clic en &quot;Nuevo Contrato&quot; para añadir el primero.</td></tr>
              ) : contratos.map(c => (
                <Fragment key={c.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{c.titulo}</td>
                    <td className="px-4 py-3 text-gray-600">{c.tipo}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaInicio)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaInicioServicio)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(c.fechaFin)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatCurrency(c.importeMensual)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{formatCurrency(c.importeAnual)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        c.estado === 'Activo' ? 'bg-green-100 text-green-700' :
                        c.estado === 'Vencido' ? 'bg-red-100 text-red-700' :
                        c.estado === 'En renovación' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {c.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center flex items-center justify-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditar(c); }}
                        className="text-indigo-600 hover:text-indigo-800"
                        title="Editar"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEliminar(c.id); }}
                        className="text-red-500 hover:text-red-700"
                        title="Eliminar"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                      {c.documentoUrl && (
                        <a href={c.documentoUrl} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-700" onClick={e => e.stopPropagation()} title="Ver documento">
                          <EyeIcon className="w-4 h-4" />
                        </a>
                      )}
                    </td>
                  </tr>
                  {/* Detalle expandido - dentro del mismo Fragment */}
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
                            <p className="text-[10px] text-gray-500 uppercase">Contacto Proveedor</p>
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
                        {/* Botones editar/eliminar en el detalle */}
                        <div className="mt-4 flex gap-2 border-t pt-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditar(c); }}
                            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1"
                          >
                            <PencilIcon className="w-3 h-3" />
                            Editar contrato
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEliminar(c.id); }}
                            className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 border border-red-200 inline-flex items-center gap-1"
                          >
                            <TrashIcon className="w-3 h-3" />
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nuevo/Editar Contrato */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Editar Contrato' : 'Nuevo Contrato'}</h2>
              <button onClick={() => { setShowForm(false); setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setArchivo(null); setEditingId(null); }}>
                <XMarkIcon className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {/* Upload PDF - con Drag & Drop */}
            <div
              className={`mb-6 p-4 border-2 border-dashed rounded-lg transition-colors ${dragActive ? 'border-indigo-600 bg-indigo-100' : 'border-indigo-300 bg-indigo-50'}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex items-center gap-3">
                <DocumentArrowUpIcon className="w-8 h-8 text-indigo-500" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-indigo-700">{dragActive ? 'Suelta el PDF aquí' : 'Sube o arrastra el PDF del contrato'}</p>
                  <p className="text-xs text-indigo-500">Se analizará automáticamente con IA para extraer los datos</p>
                </div>
                <label className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 cursor-pointer inline-flex items-center gap-2">
                  {analizando ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Analizando...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="w-4 h-4" />
                      Seleccionar PDF
                    </>
                  )}
                  <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} disabled={analizando} />
                </label>
              </div>
              {archivo && (
                <p className="text-xs text-indigo-600 mt-2">📄 {archivo.name}</p>
              )}
            </div>

            {/* Formulario */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Título *</label>
                <input
                  type="text"
                  value={form.titulo || ''}
                  onChange={e => setForm({ ...form, titulo: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                  placeholder="Ej: Contrato Servicios Internet Draxton 2025"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                <select
                  value={form.tipo || 'Servicios Internet'}
                  onChange={e => setForm({ ...form, tipo: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                >
                  {TIPOS_CONTRATO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select
                  value={form.estado || 'Activo'}
                  onChange={e => setForm({ ...form, estado: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                >
                  {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Firma</label>
                <input
                  type="date"
                  value={form.fechaFirma || ''}
                  onChange={e => setForm({ ...form, fechaFirma: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio Contrato</label>
                <input
                  type="date"
                  value={form.fechaInicio || ''}
                  onChange={e => setForm({ ...form, fechaInicio: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Fin Contrato</label>
                <input
                  type="date"
                  value={form.fechaFin || ''}
                  onChange={e => setForm({ ...form, fechaFin: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha Inicio Servicio Real</label>
                <input
                  type="date"
                  value={form.fechaInicioServicio || ''}
                  onChange={e => setForm({ ...form, fechaInicioServicio: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
                <p className="text-[10px] text-gray-400 mt-1">Fecha real en que se activó el servicio (puede diferir de la fecha contractual)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Permanencia (meses)</label>
                <input
                  type="number"
                  value={form.permanenciaMeses || ''}
                  onChange={e => setForm({ ...form, permanenciaMeses: parseInt(e.target.value) || null })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Importe Mensual (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.importeMensual || ''}
                  onChange={e => setForm({ ...form, importeMensual: parseFloat(e.target.value) || null })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Importe Anual (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.importeAnual || ''}
                  onChange={e => setForm({ ...form, importeAnual: parseFloat(e.target.value) || null })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pago</label>
                <select
                  value={form.formaPago || ''}
                  onChange={e => setForm({ ...form, formaPago: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                >
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
                    <input
                      type="text"
                      value={form.plazoProrroga || ''}
                      onChange={e => setForm({ ...form, plazoProrroga: e.target.value })}
                      className="flex-1 px-3 py-1 border rounded-lg text-sm text-gray-900"
                      placeholder="Ej: 1 año"
                    />
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto Cliente</label>
                <input
                  type="text"
                  value={form.contactoCliente || ''}
                  onChange={e => setForm({ ...form, contactoCliente: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                  placeholder="Nombre - email - teléfono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Contacto Proveedor</label>
                <input
                  type="text"
                  value={form.contactoProveedor || ''}
                  onChange={e => setForm({ ...form, contactoProveedor: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                  placeholder="Nombre - email - teléfono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas / Resumen</label>
                <textarea
                  value={form.notas || ''}
                  onChange={e => setForm({ ...form, notas: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                  rows={3}
                  placeholder="Resumen de las condiciones principales..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Condiciones Especiales</label>
                <textarea
                  value={form.condicionesEspeciales || ''}
                  onChange={e => setForm({ ...form, condicionesEspeciales: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                  rows={2}
                  placeholder="Penalizaciones, exclusiones, cláusulas relevantes..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">URL Documento (SharePoint/OneDrive)</label>
                <input
                  type="url"
                  value={form.documentoUrl || ''}
                  onChange={e => setForm({ ...form, documentoUrl: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm text-gray-900"
                  placeholder="Pega aquí el enlace de SharePoint del contrato..."
                />
                <p className="text-[10px] text-gray-400 mt-1">Copia el enlace del archivo o carpeta en OneDrive/SharePoint</p>
              </div>
            </div>

            {/* Servicios extraídos - con fecha inicio por servicio */}
            {form.serviciosJson && Array.isArray(form.serviciosJson) && form.serviciosJson.length > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-xs font-medium text-green-700 mb-2">✓ {form.serviciosJson.length} servicios detectados en el contrato</p>
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
                          <input
                            type="date"
                            value={s.fechaInicioServicio || ''}
                            onChange={e => updateServicio(i, 'fechaInicioServicio', e.target.value || null)}
                            className="px-1 py-0.5 border rounded text-xs text-gray-900 w-28"
                            title="Fecha inicio servicio específica (opcional, si difiere de la global)"
                          />
                        </td>
                        <td className="px-2 py-1 text-right">{s.precioMensual?.toFixed(2)}€</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-gray-500 mt-2">Si un servicio no tiene fecha propia, se usa la fecha global de inicio de servicio.</p>
              </div>
            )}

            {/* Botones */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button
                onClick={() => { setShowForm(false); setForm({ titulo: '', tipo: 'Servicios Internet', estado: 'Activo', prorrogaAutomatica: true }); setArchivo(null); setEditingId(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando || !form.titulo}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {guardando ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : null}
                {editingId ? 'Guardar Cambios' : 'Guardar Contrato'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
