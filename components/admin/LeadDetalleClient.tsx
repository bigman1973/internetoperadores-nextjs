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
  const [syncingHS, setSyncingHS] = useState(false);
  const [hubspotMsg, setHubspotMsg] = useState('');

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

  const syncHubspot = async () => {
    setSyncingHS(true);
    setHubspotMsg('');
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/hubspot-deal`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setHubspotMsg(`✓ Deal ${data.created ? 'creado' : 'actualizado'} en HubSpot`);
      } else {
        setHubspotMsg(`✗ ${data.error || 'Error al sincronizar'}`);
      }
    } catch (err) {
      setHubspotMsg('✗ Error de conexión');
    } finally {
      setSyncingHS(false);
    }
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

          {/* Proceso de Venta */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Proceso de Venta</h3>
            <div className="space-y-0">
              {[
                { id: 'NUEVO', label: '1. Lead nuevo', action: 'Revisar formulario' },
                { id: 'EN_REVISION', label: '2. Análisis técnico', action: 'Crear cuestionario + auditoría' },
                { id: 'AUDITORIA_ENVIADA', label: '3. Auditoría enviada', action: 'Enviar email con PDF + cuestionario' },
                { id: 'CUESTIONARIO_ENVIADO', label: '4. Cuestionario enviado', action: 'Esperar respuestas del cliente' },
                { id: 'CUESTIONARIO_COMPLETADO', label: '5. Cuestionario completado', action: 'Generar propuesta económica' },
                { id: 'PROPUESTA_ENVIADA', label: '6. Propuesta enviada', action: 'Seguimiento comercial' },
                { id: 'CERRADO_GANADO', label: '7. Ganado', action: 'Iniciar migración' },
              ].map((paso, idx) => {
                const estadoOrden = ['NUEVO', 'EN_REVISION', 'AUDITORIA_ENVIADA', 'CUESTIONARIO_ENVIADO', 'CUESTIONARIO_COMPLETADO', 'PROPUESTA_ENVIADA', 'CERRADO_GANADO'];
                const estadoActualIdx = estadoOrden.indexOf(lead.estado);
                const pasoIdx = estadoOrden.indexOf(paso.id);
                const completado = pasoIdx < estadoActualIdx;
                const activo = pasoIdx === estadoActualIdx;
                return (
                  <div key={paso.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        completado ? 'bg-green-500 text-white' :
                        activo ? 'bg-orange-500 text-white ring-4 ring-orange-100' :
                        'bg-gray-200 text-gray-500'
                      }`}>
                        {completado ? (
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        ) : idx + 1}
                      </div>
                      {idx < 6 && <div className={`w-0.5 h-6 ${completado ? 'bg-green-300' : 'bg-gray-200'}`}></div>}
                    </div>
                    <div className={`pb-4 ${activo ? 'text-gray-900' : completado ? 'text-gray-600' : 'text-gray-400'}`}>
                      <p className={`text-xs font-semibold ${activo ? 'text-orange-700' : ''}`}>{paso.label}</p>
                      {activo && <p className="text-[10px] text-orange-600 mt-0.5">→ {paso.action}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            {lead.estado === 'CERRADO_PERDIDO' && (
              <div className="mt-2 px-3 py-2 bg-red-50 rounded-lg text-xs text-red-700 font-medium text-center">Oportunidad perdida</div>
            )}
            {lead.estado === 'DESCARTADO' && (
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-xs text-gray-700 font-medium text-center">Lead descartado</div>
            )}
          </div>

          {/* Acciones rápidas */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Acciones</h3>
            <div className="space-y-2">
              <a
                href="https://outlook.office.com/bookwithme/user/fbd2ec5013e94a2ebe031317c9afc0a7@lfgd.es/meetingtype/hyWyrJkZTk2szZxF8tCJoA2?bookingcode=9ff50d17-71aa-4749-a605-faf5ae47d47b&anonymous&ismsaljsauthenabled&ep=mlink"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-all font-medium text-xs text-center flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Agendar reunión (Bookings)
              </a>
              <button
                onClick={syncHubspot}
                disabled={syncingHS}
                className="w-full px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-all font-medium text-xs flex items-center justify-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {syncingHS ? 'Sincronizando...' : 'Sincronizar con HubSpot'}
              </button>
              {hubspotMsg && <p className="text-[10px] text-center text-gray-500">{hubspotMsg}</p>}
              <button
                disabled={true}
                className="w-full px-4 py-2 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed font-medium text-xs flex items-center justify-center gap-2"
                title="Funcionalidad de firma digital próximamente"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Firma de contrato (próximamente)
              </button>
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
