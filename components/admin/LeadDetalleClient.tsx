'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Respuesta {
  id: string;
  bloque: string;
  numeroPregunta: number;
  pregunta: string;
  respuesta: string;
}

interface Cuestionario {
  id: string;
  token: string;
  titulo: string;
  estado: string;
  fechaEnvio: string | null;
  fechaCompletado: string | null;
  respuestas: Respuesta[];
}

interface Lead {
  id: string;
  nombreEmpresa: string;
  contacto: string;
  email: string;
  telefono: string | null;
  urlWebActual: string | null;
  sector: string | null;
  sectorOtro: string | null;
  estado: string;
  prioridad: string;
  presupuesto: string | null;
  fechaLimite: string | null;
  numPaginas: string | null;
  tieneBlog: boolean | null;
  tieneTienda: boolean | null;
  tieneFormularios: boolean | null;
  tieneAreaPrivada: boolean | null;
  frustracionActual: string | null;
  objetivos: any;
  respuestasSector: any;
  necesitaIntegracion: boolean | null;
  softwareActual: string | null;
  tieneApi: string | null;
  datosIntegracion: string | null;
  proveedorActual: string | null;
  comoNosConocio: string | null;
  notas: string | null;
  informePdfUrl: string | null;
  createdAt: string;
  cuestionario: Cuestionario | null;
}

const ESTADOS = [
  { value: 'NUEVO', label: 'Nuevo', color: 'bg-blue-100 text-blue-800' },
  { value: 'EN_REVISION', label: 'En revisión', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'AUDITORIA_ENVIADA', label: 'Auditoría enviada', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'CUESTIONARIO_ENVIADO', label: 'Cuestionario enviado', color: 'bg-purple-100 text-purple-800' },
  { value: 'CUESTIONARIO_COMPLETADO', label: 'Cuestionario completado', color: 'bg-green-100 text-green-800' },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada', color: 'bg-orange-100 text-orange-800' },
  { value: 'CERRADO_GANADO', label: 'Cerrado (ganado)', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'CERRADO_PERDIDO', label: 'Cerrado (perdido)', color: 'bg-red-100 text-red-800' },
  { value: 'DESCARTADO', label: 'Descartado', color: 'bg-gray-100 text-gray-800' },
];

export default function LeadDetalleClient({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notas, setNotas] = useState('');
  const [guardandoNotas, setGuardandoNotas] = useState(false);
  const [creandoCuestionario, setCreandoCuestionario] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAsunto, setEmailAsunto] = useState('');
  const [emailMensaje, setEmailMensaje] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [cuestionarioUrl, setCuestionarioUrl] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [generandoPropuesta, setGenerandoPropuesta] = useState(false);
  const [propuestaGenerada, setPropuestaGenerada] = useState(false);

  useEffect(() => {
    fetchLead();
  }, [leadId]);

  const fetchLead = async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`);
      if (!res.ok) {
        setError('Error al cargar el lead');
        return;
      }
      const data = await res.json();
      setLead(data.lead);
      setNotas(data.lead?.notas || '');
      if (data.lead?.cuestionario) {
        const baseUrl = window.location.origin;
        setCuestionarioUrl(`${baseUrl}/cuestionario/${data.lead.cuestionario.token}`);
      }
      if (data.lead?.informePdfUrl) {
        setPdfUrl(data.lead.informePdfUrl);
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const cambiarEstado = async (nuevoEstado: string) => {
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });
      fetchLead();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const guardarNotas = async () => {
    setGuardandoNotas(true);
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas }),
      });
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setGuardandoNotas(false);
    }
  };

  const guardarPdfUrl = async () => {
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informePdfUrl: pdfUrl }),
      });
      fetchLead();
    } catch (err) {
      console.error('Error:', err);
    }
  };

  const crearCuestionario = async () => {
    setCreandoCuestionario(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/cuestionario`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.cuestionario) {
        const baseUrl = window.location.origin;
        setCuestionarioUrl(`${baseUrl}/cuestionario/${data.cuestionario.token}`);
        fetchLead();
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setCreandoCuestionario(false);
    }
  };

  const enviarEmail = async () => {
    setEnviandoEmail(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/enviar-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asunto: emailAsunto || `Informe de Auditoría Web - ${lead?.nombreEmpresa}`,
          mensaje: emailMensaje,
          pdfUrl: pdfUrl || lead?.informePdfUrl,
        }),
      });
      const data = await res.json();
      if (data.cuestionarioUrl) {
        setCuestionarioUrl(data.cuestionarioUrl);
      }
      setShowEmailModal(false);
      fetchLead();
      alert(data.emailSent === false
        ? 'Cuestionario listo. Resend no configurado - copie el link manualmente.'
        : 'Email enviado correctamente');
    } catch (err) {
      console.error('Error:', err);
      alert('Error al enviar el email');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const copiarLink = () => {
    navigator.clipboard.writeText(cuestionarioUrl);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const generarPropuesta = async () => {
    setGenerandoPropuesta(true);
    try {
      const res = await fetch('/api/admin/leads/generar-propuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (data.success) {
        setPropuestaGenerada(true);
        fetchLead();
        alert(`Propuesta generada: ${data.resumen.totalHoras}h / ${data.resumen.totalPrecio.toLocaleString('es-ES')}€`);
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Error al generar la propuesta');
    } finally {
      setGenerandoPropuesta(false);
    }
  };

  const verPropuestaPDF = () => {
    window.open(`/api/admin/leads/generar-propuesta/pdf?leadId=${leadId}`, '_blank');
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Cargando...</div>;
  }

  if (error || !lead) {
    return <div className="p-6 text-center text-red-500">{error || 'Lead no encontrado'}</div>;
  }

  const estadoActual = ESTADOS.find(e => e.value === lead.estado);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/leads" className="text-gray-400 hover:text-gray-600">
          ← Volver
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{lead.nombreEmpresa}</h1>
          <p className="text-sm text-gray-500">Lead recibido el {new Date(lead.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadoActual?.color || 'bg-gray-100 text-gray-800'}`}>
            {estadoActual?.label || lead.estado}
          </span>
          <select
            value={lead.estado}
            onChange={(e) => cambiarEstado(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del lead */}
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Datos del Formulario</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 font-medium">Empresa</label>
                <p className="text-sm text-gray-900">{lead.nombreEmpresa}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Contacto</label>
                <p className="text-sm text-gray-900">{lead.contacto}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Email</label>
                <p className="text-sm text-gray-900">
                  <a href={`mailto:${lead.email}`} className="text-orange-600 hover:underline">{lead.email}</a>
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Teléfono</label>
                <p className="text-sm text-gray-900">{lead.telefono || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Web actual</label>
                <p className="text-sm">
                  {lead.urlWebActual ? (
                    <a href={lead.urlWebActual} target="_blank" rel="noopener" className="text-orange-600 hover:underline">{lead.urlWebActual}</a>
                  ) : '-'}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Sector</label>
                <p className="text-sm text-gray-900 capitalize">{lead.sectorOtro || lead.sector || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Presupuesto</label>
                <p className="text-sm text-gray-900">{lead.presupuesto || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Plazo / Fecha límite</label>
                <p className="text-sm text-gray-900">{lead.fechaLimite || '-'}</p>
              </div>
            </div>

            {/* Detalles adicionales */}
            <div className="mt-6 space-y-4 border-t pt-4">
              {lead.numPaginas && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Páginas web actual</label>
                  <p className="text-sm text-gray-900">{lead.numPaginas}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {lead.tieneBlog && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">Blog</span>}
                {lead.tieneTienda && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">Tienda online</span>}
                {lead.tieneFormularios && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">Formularios</span>}
                {lead.tieneAreaPrivada && <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">Área privada</span>}
              </div>
              {lead.frustracionActual && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Frustración principal</label>
                  <p className="text-sm text-gray-900">{lead.frustracionActual}</p>
                </div>
              )}
              {lead.objetivos && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Objetivos</label>
                  <div className="text-sm text-gray-900 mt-1">
                    {(Array.isArray(lead.objetivos) ? lead.objetivos : []).map((obj: string, i: number) => (
                      <span key={i} className="inline-block bg-orange-50 text-orange-700 px-2 py-1 rounded text-xs mr-2 mb-1">
                        {obj}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {lead.respuestasSector && typeof lead.respuestasSector === 'object' && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Respuestas sector ({lead.sector})</label>
                  <div className="bg-gray-50 rounded p-3 mt-1 space-y-2">
                    {Object.entries(lead.respuestasSector).map(([key, val]) => (
                      <div key={key}>
                        <span className="text-xs text-gray-500">{key}:</span>
                        <span className="text-sm text-gray-900 ml-2">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {lead.necesitaIntegracion && (
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500 font-medium">Integración software</label>
                  <div className="space-y-1 mt-1">
                    {lead.softwareActual && <p className="text-sm text-gray-900">Software: {lead.softwareActual}</p>}
                    {lead.tieneApi && <p className="text-sm text-gray-900">API: {lead.tieneApi}</p>}
                    {lead.datosIntegracion && <p className="text-sm text-gray-900">Datos: {lead.datosIntegracion}</p>}
                    {lead.proveedorActual && <p className="text-sm text-gray-900">Proveedor: {lead.proveedorActual}</p>}
                  </div>
                </div>
              )}
              {lead.comoNosConocio && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Cómo nos conoció</label>
                  <p className="text-sm text-gray-900">{lead.comoNosConocio}</p>
                </div>
              )}
            </div>
          </div>

          {/* Respuestas del cuestionario técnico */}
          {lead.cuestionario && lead.cuestionario.respuestas && lead.cuestionario.respuestas.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Respuestas del Cuestionario Técnico
                {lead.cuestionario.fechaCompletado && (
                  <span className="ml-2 text-xs font-normal text-green-600">
                    Completado el {new Date(lead.cuestionario.fechaCompletado).toLocaleDateString('es-ES')}
                  </span>
                )}
              </h2>
              <div className="space-y-4">
                {lead.cuestionario.respuestas.map((resp) => (
                  <div key={resp.id} className="border-b pb-3 last:border-b-0">
                    <p className="text-xs text-orange-600 font-medium mb-1">{resp.bloque}</p>
                    <p className="text-sm font-medium text-gray-700">{resp.pregunta}</p>
                    <p className="text-sm text-gray-900 mt-1">{resp.respuesta}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Link del cuestionario */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Cuestionario Técnico</h3>
            {!lead.cuestionario ? (
              <button
                onClick={crearCuestionario}
                disabled={creandoCuestionario}
                className="w-full bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
              >
                {creandoCuestionario ? 'Creando...' : '📋 Generar Cuestionario'}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-700 font-medium mb-2">Cuestionario creado</p>
                  <p className="text-xs text-green-600 mb-2">
                    Estado: {lead.cuestionario.estado === 'COMPLETADO' ? '✅ Completado' : '⏳ Pendiente de respuesta'}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cuestionarioUrl}
                      readOnly
                      className="flex-1 text-xs border rounded px-2 py-1 bg-white truncate"
                    />
                    <button
                      onClick={copiarLink}
                      className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 whitespace-nowrap"
                    >
                      {copiado ? '✓ Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
                <a
                  href={cuestionarioUrl}
                  target="_blank"
                  rel="noopener"
                  className="block text-center text-xs text-orange-600 hover:underline"
                >
                  Abrir cuestionario en nueva pestaña →
                </a>
              </div>
            )}
          </div>

          {/* PDF del informe */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Informe PDF de Auditoría</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL del PDF:</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={guardarPdfUrl}
                  className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                >
                  Guardar URL
                </button>
                {lead.informePdfUrl && (
                  <a
                    href={lead.informePdfUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded hover:bg-orange-200"
                  >
                    📄 Ver PDF
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Propuesta / Valoración */}
          {lead.cuestionario && lead.cuestionario.estado === 'COMPLETADO' && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Propuesta Automática</h3>
              <div className="space-y-3">
                <button
                  onClick={generarPropuesta}
                  disabled={generandoPropuesta}
                  className="w-full bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                >
                  {generandoPropuesta ? '⏳ Generando con IA...' : '🤖 Generar Valoración con IA'}
                </button>
                {(lead.informePdfUrl || propuestaGenerada) && (
                  <button
                    onClick={verPropuestaPDF}
                    className="w-full bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700"
                  >
                    📄 Ver / Descargar Propuesta PDF
                  </button>
                )}
                {generandoPropuesta && (
                  <p className="text-xs text-gray-500 text-center">Analizando respuestas y generando valoración... (30-60 seg)</p>
                )}
              </div>
            </div>
          )}

          {/* Enviar email */}
          {lead.cuestionario && (
            <div className="bg-white rounded-lg border p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Enviar al Cliente</h3>
              <button
                onClick={() => {
                  setEmailAsunto(`Informe de Auditoría Web - ${lead.nombreEmpresa}`);
                  setEmailMensaje('');
                  setShowEmailModal(true);
                }}
                disabled={enviandoEmail}
                className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                📧 Enviar Email con PDF + Link
              </button>
              {lead.cuestionario.fechaEnvio && (
                <p className="text-xs text-gray-500 mt-2">
                  Último envío: {new Date(lead.cuestionario.fechaEnvio).toLocaleDateString('es-ES')}
                </p>
              )}
            </div>
          )}

          {/* Notas internas */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Notas internas</h3>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Añadir notas sobre este lead..."
              className="w-full border rounded-lg px-3 py-2 text-sm h-32 resize-none"
            />
            <button
              onClick={guardarNotas}
              disabled={guardandoNotas}
              className="mt-2 text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700 disabled:opacity-50"
            >
              {guardandoNotas ? 'Guardando...' : 'Guardar notas'}
            </button>
          </div>

          {/* Estado del proceso */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Estado del proceso</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Formulario recibido</span>
                <span className="text-green-600">✓</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cuestionario creado</span>
                <span className={lead.cuestionario ? 'text-green-600' : 'text-gray-300'}>
                  {lead.cuestionario ? '✓' : '○'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">PDF adjuntado</span>
                <span className={lead.informePdfUrl ? 'text-green-600' : 'text-gray-300'}>
                  {lead.informePdfUrl ? '✓' : '○'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email enviado</span>
                <span className={lead.cuestionario?.fechaEnvio ? 'text-green-600' : 'text-gray-300'}>
                  {lead.cuestionario?.fechaEnvio ? '✓' : '○'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cuestionario completado</span>
                <span className={lead.cuestionario?.estado === 'COMPLETADO' ? 'text-green-600' : 'text-gray-300'}>
                  {lead.cuestionario?.estado === 'COMPLETADO' ? '✓' : '○'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Propuesta generada</span>
                <span className={lead.informePdfUrl ? 'text-green-600' : 'text-gray-300'}>
                  {lead.informePdfUrl ? '✓' : '○'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal enviar email */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Enviar Email al Cliente</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Destinatario</label>
                <p className="text-sm text-gray-900">{lead.email}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Asunto</label>
                <input
                  type="text"
                  value={emailAsunto}
                  onChange={(e) => setEmailAsunto(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mensaje personalizado (opcional)</label>
                <textarea
                  value={emailMensaje}
                  onChange={(e) => setEmailMensaje(e.target.value)}
                  placeholder="Si lo deja vacío se usará el mensaje por defecto..."
                  className="w-full border rounded-lg px-3 py-2 text-sm h-24 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">URL del PDF de auditoría</label>
                <input
                  type="url"
                  value={pdfUrl || lead.informePdfUrl || ''}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Link del cuestionario que se incluirá:</p>
                <p className="text-xs text-orange-600 break-all">{cuestionarioUrl}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowEmailModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={enviarEmail}
                disabled={enviandoEmail}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {enviandoEmail ? 'Enviando...' : 'Enviar Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
