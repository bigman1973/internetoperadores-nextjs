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
  { value: 'CUESTIONARIO_COMPLETADO', label: 'Cuestionario completado', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada', color: 'bg-orange-100 text-orange-800' },
  { value: 'PROPUESTA_PREACEPTADA', label: 'Propuesta pre-aceptada', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'REUNION_AGENDADA', label: 'Reunión agendada', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'CERRADO_GANADO', label: 'Cerrado (ganado)', color: 'bg-green-100 text-green-800' },
  { value: 'CERRADO_PERDIDO', label: 'Cerrado (perdido)', color: 'bg-red-100 text-red-800' },
  { value: 'DESCARTADO', label: 'Descartado', color: 'bg-gray-100 text-gray-800' },
];

const prioridadColors: Record<string, string> = {
  BAJA: 'bg-gray-100 text-gray-700',
  MEDIA: 'bg-blue-100 text-blue-700',
  ALTA: 'bg-orange-100 text-orange-700',
  URGENTE: 'bg-red-100 text-red-700',
};

export default function LeadDetalleClient({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [creandoCuestionario, setCreandoCuestionario] = useState(false);
  const [cuestionarioUrl, setCuestionarioUrl] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  // Email modal states
  const [mostrarEmailModal, setMostrarEmailModal] = useState(false);
  const [emailAsunto, setEmailAsunto] = useState('');
  const [emailCuerpo, setEmailCuerpo] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  // Propuesta states
  const [generandoPropuesta, setGenerandoPropuesta] = useState(false);
  const [propuestaGenerada, setPropuestaGenerada] = useState(false);

  // HubSpot
  const [syncingHubspot, setSyncingHubspot] = useState(false);

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
      setEstado(data.lead?.estado || 'NUEVO');
      setPrioridad(data.lead?.prioridad || 'MEDIA');
      if (data.lead?.cuestionario) {
        const baseUrl = window.location.origin;
        setCuestionarioUrl(`${baseUrl}/cuestionario/${data.lead.cuestionario.token}`);
      }
      if (data.lead?.informePdfUrl) {
        setPdfUrl(data.lead.informePdfUrl);
        setPropuestaGenerada(true);
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, prioridad, notas }),
      });
      if (res.ok) {
        setMensaje('Guardado correctamente');
        fetchLead();
        setTimeout(() => setMensaje(''), 3000);
      }
    } catch {
      setMensaje('Error al guardar');
    } finally {
      setGuardando(false);
    }
  };

  const guardarPdfUrl = async () => {
    try {
      await fetch(`/api/admin/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ informePdfUrl: pdfUrl }),
      });
      setMensaje('URL del PDF guardada');
      fetchLead();
      setTimeout(() => setMensaje(''), 3000);
    } catch {
      setMensaje('Error al guardar URL');
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
        setMensaje('Cuestionario creado correctamente');
        fetchLead();
        setTimeout(() => setMensaje(''), 3000);
      }
    } catch {
      setMensaje('Error al crear cuestionario');
    } finally {
      setCreandoCuestionario(false);
    }
  };

  const copiarLink = () => {
    navigator.clipboard.writeText(cuestionarioUrl);
    setCopiado(true);
    setMensaje('Link copiado al portapapeles');
    setTimeout(() => { setCopiado(false); setMensaje(''); }, 3000);
  };

  // Preparar email con previsualización HTML
  const prepararEmail = () => {
    if (!lead) return;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const cuestionarioLink = lead.cuestionario
      ? `${baseUrl}/cuestionario/${lead.cuestionario.token}`
      : '';

    setEmailAsunto(`Informe de Auditoría Web - ${lead.nombreEmpresa}`);
    setEmailCuerpo(`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #EA580C; padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Internet Operadores</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 12px;">Migración Web Profesional</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9;">
    <p>Estimado/a <strong>${lead.contacto}</strong>,</p>
    <p>Gracias por su interés en nuestros servicios de migración web para <strong>${lead.nombreEmpresa}</strong>.</p>
    <p>Hemos analizado su web actual y adjunto a este email encontrará nuestra <strong>propuesta personalizada</strong> con la valoración técnica y económica del proyecto.</p>
    ${cuestionarioLink ? `<p>Para poder ofrecerle un presupuesto definitivo ajustado a sus necesidades reales, le agradeceríamos que completara el siguiente <strong>cuestionario técnico</strong> (5-10 minutos):</p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="${cuestionarioLink}" style="background-color: #EA580C; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Completar Cuestionario Técnico</a>
    </div>` : ''}
    <p>Una vez recibamos sus respuestas, en un plazo de <strong>48 horas</strong> le enviaremos una propuesta a precio cerrado y coordinaremos una reunión para resolver cualquier duda.</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;" />
    <p style="color: #666; font-size: 13px;">Quedamos a su disposición para cualquier consulta:</p>
    <p style="color: #666; font-size: 13px;"><strong>900 730 034</strong> (gratuito) | <strong>comercial@internetoperadores.com</strong></p>
    <p style="color: #999; font-size: 11px; margin-top: 20px;">Internet Operadores — Partner tecnológico de confianza</p>
  </div>
</div>`);
    setMostrarEmailModal(true);
  };

  // Enviar email con cuerpoHtml
  const handleEnviarEmail = async () => {
    setEnviandoEmail(true);
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/enviar-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asunto: emailAsunto, cuerpoHtml: emailCuerpo }),
      });
      const data = await res.json();
      if (data.success) {
        setMensaje('Email enviado correctamente');
        setMostrarEmailModal(false);
        fetchLead();
        setTimeout(() => setMensaje(''), 4000);
      } else {
        setMensaje(`Error: ${data.error || 'No se pudo enviar'}`);
      }
    } catch {
      setMensaje('Error de conexión al enviar email');
    } finally {
      setEnviandoEmail(false);
    }
  };

  // Generar propuesta económica con IA
  const handleGenerarPropuesta = async () => {
    setGenerandoPropuesta(true);
    setMensaje('');
    try {
      const res = await fetch('/api/admin/leads/generar-propuesta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      const data = await res.json();
      if (data.success) {
        setPropuestaGenerada(true);
        setMensaje(`Propuesta generada: ${data.resumen?.totalHoras || '?'}h / ${data.resumen?.totalPrecio?.toLocaleString('es-ES') || '?'}€`);
        fetchLead();
        setTimeout(() => setMensaje(''), 5000);
      } else {
        setMensaje(`Error: ${data.error}`);
      }
    } catch {
      setMensaje('Error al generar la propuesta');
    } finally {
      setGenerandoPropuesta(false);
    }
  };

  const verPropuestaPDF = () => {
    window.open(`/api/admin/leads/generar-propuesta/pdf?leadId=${leadId}`, '_blank');
  };

  // Sincronizar con HubSpot
  const handleSyncHubspot = async () => {
    setSyncingHubspot(true);
    setMensaje('');
    try {
      const res = await fetch(`/api/admin/leads/${leadId}/hubspot-deal`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMensaje(`HubSpot sincronizado (deal ${data.created ? 'creado' : 'actualizado'})`);
        fetchLead();
      } else {
        setMensaje(data.error || 'Error al sincronizar con HubSpot');
      }
    } catch {
      setMensaje('Error de conexión con HubSpot');
    } finally {
      setSyncingHubspot(false);
      setTimeout(() => setMensaje(''), 4000);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="p-6">
        <p className="text-red-600">{error || 'Lead no encontrado'}</p>
        <Link href="/admin/leads" className="text-orange-600 hover:underline mt-4 inline-block">
          Volver a leads migración web
        </Link>
      </div>
    );
  }

  const estadoActual = ESTADOS.find(e => e.value === lead.estado);
  const cuestionarioCompletado = lead.cuestionario?.estado === 'COMPLETADO';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <Link href="/admin/leads" className="text-sm text-gray-500 hover:text-orange-600 mb-2 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Volver a leads migración web
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{lead.nombreEmpresa}</h1>
          <p className="text-gray-600">{lead.contacto} — {lead.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${estadoActual?.color || 'bg-gray-100 text-gray-800'}`}>
            {estadoActual?.label || lead.estado.replace(/_/g, ' ')}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${prioridadColors[lead.prioridad] || 'bg-gray-100 text-gray-700'}`}>
            {lead.prioridad}
          </span>
        </div>
      </div>

      {mensaje && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${mensaje.includes('Error') || mensaje.includes('✗') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {mensaje}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del lead */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Datos del Formulario</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Contacto</p>
                <p className="text-sm text-gray-900 font-medium">{lead.contacto}</p>
                <p className="text-sm text-gray-600">{lead.email}</p>
                {lead.telefono && <p className="text-sm text-gray-600">{lead.telefono}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Empresa</p>
                <p className="text-sm text-gray-900 font-medium">{lead.nombreEmpresa}</p>
                <p className="text-sm text-gray-600 capitalize">{lead.sectorOtro || lead.sector || 'Sin sector'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Web actual</p>
                {lead.urlWebActual ? (
                  <a href={lead.urlWebActual} target="_blank" rel="noopener" className="text-sm text-orange-600 hover:underline">{lead.urlWebActual}</a>
                ) : <p className="text-sm text-gray-400">No indicada</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Presupuesto</p>
                <p className="text-sm text-gray-900">{lead.presupuesto || 'No indicado'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Plazo / Fecha límite</p>
                <p className="text-sm text-gray-900">{lead.fechaLimite || 'No indicado'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Páginas web actual</p>
                <p className="text-sm text-gray-900">{lead.numPaginas || 'No indicado'}</p>
              </div>
            </div>

            {/* Funcionalidades */}
            <div className="mt-4 flex flex-wrap gap-2">
              {lead.tieneBlog && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">Blog</span>}
              {lead.tieneTienda && <span className="px-2 py-0.5 bg-purple-50 text-purple-700 text-xs rounded-full">Tienda online</span>}
              {lead.tieneFormularios && <span className="px-2 py-0.5 bg-green-50 text-green-700 text-xs rounded-full">Formularios</span>}
              {lead.tieneAreaPrivada && <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-full">Área privada</span>}
            </div>

            {/* Detalles adicionales */}
            <div className="mt-4 space-y-3 border-t pt-4">
              {lead.frustracionActual && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Frustración principal</p>
                  <p className="text-sm text-gray-900 mt-1 bg-gray-50 p-3 rounded-lg">{lead.frustracionActual}</p>
                </div>
              )}
              {lead.objetivos && Array.isArray(lead.objetivos) && lead.objetivos.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Objetivos</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {lead.objetivos.map((obj: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">{obj}</span>
                    ))}
                  </div>
                </div>
              )}
              {lead.respuestasSector && typeof lead.respuestasSector === 'object' && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Respuestas sector ({lead.sector})</p>
                  <div className="bg-gray-50 rounded-lg p-3 mt-1 space-y-1">
                    {Object.entries(lead.respuestasSector).map(([key, val]) => (
                      <div key={key} className="flex gap-2 text-sm">
                        <span className="text-gray-500">{key}:</span>
                        <span className="text-gray-900">{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {lead.necesitaIntegracion && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Integración software</p>
                  <div className="bg-gray-50 rounded-lg p-3 mt-1 space-y-1 text-sm">
                    {lead.softwareActual && <p><span className="text-gray-500">Software:</span> {lead.softwareActual}</p>}
                    {lead.tieneApi && <p><span className="text-gray-500">API:</span> {lead.tieneApi}</p>}
                    {lead.datosIntegracion && <p><span className="text-gray-500">Datos:</span> {lead.datosIntegracion}</p>}
                    {lead.proveedorActual && <p><span className="text-gray-500">Proveedor:</span> {lead.proveedorActual}</p>}
                  </div>
                </div>
              )}
              {lead.comoNosConocio && (
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Cómo nos conoció</p>
                  <p className="text-sm text-gray-900">{lead.comoNosConocio}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4">
              Recibido: {new Date(lead.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
            </p>
          </div>

          {/* Respuestas del cuestionario técnico */}
          {lead.cuestionario && lead.cuestionario.respuestas && lead.cuestionario.respuestas.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">Respuestas del Cuestionario Técnico</h2>
                {lead.cuestionario.fechaCompletado && (
                  <span className="text-xs text-green-600 font-medium">
                    Completado el {new Date(lead.cuestionario.fechaCompletado).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                  </span>
                )}
              </div>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {lead.cuestionario.respuestas.map((resp) => (
                  <div key={resp.id} className="border-b border-gray-100 pb-3 last:border-b-0">
                    <p className="text-xs text-orange-600 font-medium mb-0.5">{resp.bloque}</p>
                    <p className="text-sm font-medium text-gray-700">{resp.pregunta}</p>
                    <p className="text-sm text-gray-900 mt-1">{resp.respuesta}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Proceso de Venta */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Proceso de Venta</h3>
            <div className="space-y-0">
              {[
                { id: 'NUEVO', label: '1. Lead nuevo', action: 'Revisar formulario' },
                { id: 'EN_REVISION', label: '2. Análisis técnico', action: 'Crear cuestionario + auditoría' },
                { id: 'AUDITORIA_ENVIADA', label: '3. Auditoría enviada', action: 'Enviar email con PDF + cuestionario' },
                { id: 'CUESTIONARIO_ENVIADO', label: '4. Cuestionario enviado', action: 'Esperar respuestas del cliente' },
                { id: 'CUESTIONARIO_COMPLETADO', label: '5. Cuestionario completado', action: 'Generar propuesta económica' },
                { id: 'PROPUESTA_ENVIADA', label: '6. Propuesta enviada', action: 'Seguimiento comercial' },
                { id: 'PROPUESTA_PREACEPTADA', label: '7. Propuesta pre-aceptada', action: 'Agendar reunión' },
                { id: 'REUNION_AGENDADA', label: '8. Reunión agendada', action: 'Cerrar contrato' },
                { id: 'CERRADO_GANADO', label: '9. Ganado', action: 'Iniciar migración' },
              ].map((paso, idx) => {
                const estadoOrden = ['NUEVO', 'EN_REVISION', 'AUDITORIA_ENVIADA', 'CUESTIONARIO_ENVIADO', 'CUESTIONARIO_COMPLETADO', 'PROPUESTA_ENVIADA', 'PROPUESTA_PREACEPTADA', 'REUNION_AGENDADA', 'CERRADO_GANADO'];
                const estadoActualIdx = estadoOrden.indexOf(lead.estado);
                const pasoIdx = estadoOrden.indexOf(paso.id);
                const completado = pasoIdx < estadoActualIdx;
                const activo = pasoIdx === estadoActualIdx;
                const pendiente = pasoIdx > estadoActualIdx;

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
                      {idx < 8 && <div className={`w-0.5 h-6 ${completado ? 'bg-green-300' : 'bg-gray-200'}`}></div>}
                    </div>
                    <div className={`pb-4 ${activo ? 'text-gray-900' : pendiente ? 'text-gray-400' : 'text-gray-600'}`}>
                      <p className={`text-xs font-semibold ${activo ? 'text-orange-700' : ''}`}>{paso.label}</p>
                      {activo && <p className="text-[10px] text-orange-600 mt-0.5">&rarr; {paso.action}</p>}
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

          {/* Acciones del paso actual */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Acciones</h3>

            {/* Paso 1: Crear cuestionario */}
            {!lead.cuestionario && (
              <button
                onClick={crearCuestionario}
                disabled={creandoCuestionario}
                className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                {creandoCuestionario ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Creando...
                  </span>
                ) : (
                  '\u2460 Generar Cuestionario Técnico'
                )}
              </button>
            )}

            {/* Cuestionario link */}
            {lead.cuestionario && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${cuestionarioCompletado ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                  <span className="text-xs font-medium text-gray-700">
                    Cuestionario: {cuestionarioCompletado ? 'Completado' : 'Pendiente'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={cuestionarioUrl}
                    className="flex-1 px-2 py-1.5 bg-white border border-gray-300 rounded text-xs text-gray-700 truncate"
                  />
                  <button
                    onClick={copiarLink}
                    className="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium text-gray-700 transition-all flex-shrink-0"
                  >
                    {copiado ? '✓' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Paso 2: Enviar email con propuesta + cuestionario */}
            {lead.cuestionario && (
              <button
                onClick={prepararEmail}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium text-sm flex items-center justify-center gap-2 mb-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                &#9313; Enviar propuesta por email
              </button>
            )}

            {/* Paso 3: Generar propuesta económica (solo si cuestionario completado) */}
            <button
              onClick={handleGenerarPropuesta}
              disabled={generandoPropuesta || !cuestionarioCompletado}
              className={`w-full px-4 py-2.5 rounded-lg transition-all font-medium text-sm flex items-center justify-center gap-2 mb-3 ${
                cuestionarioCompletado
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
              title={!cuestionarioCompletado ? 'Disponible cuando el cliente complete el cuestionario técnico' : ''}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              {generandoPropuesta ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  Generando con IA...
                </span>
              ) : '\u2462 Generar propuesta económica'}
            </button>
            {!cuestionarioCompletado && (
              <p className="text-[10px] text-gray-400 -mt-2 mb-3 text-center">Pendiente: cuestionario técnico del cliente</p>
            )}

            {/* Descargar propuesta PDF */}
            {propuestaGenerada && (
              <button
                onClick={verPropuestaPDF}
                className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium text-sm text-center flex items-center justify-center gap-2 mb-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                &#9315; Descargar PDF Propuesta
              </button>
            )}

            {/* Paso 5: Agendar reunión */}
            <a
              href="https://outlook.office.com/bookwithme/user/fbd2ec5013e94a2ebe031317c9afc0a7@lfgd.es/meetingtype/hyWyrJkZTk2szZxF8tCJoA2?bookingcode=9ff50d17-71aa-4749-a605-faf5ae47d47b&anonymous&ismsaljsauthenabled&ep=mlink"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2.5 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-all font-medium text-sm text-center flex items-center justify-center gap-2 mb-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              &#9316; Agendar reunión (Bookings)
            </a>

            {/* Firma de contrato (previsto) */}
            <button
              disabled={true}
              className="w-full px-4 py-2.5 bg-gray-100 text-gray-400 rounded-lg cursor-not-allowed font-medium text-sm flex items-center justify-center gap-2 mb-3"
              title="Funcionalidad de firma digital próximamente"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              &#9318; Firma de contrato
            </button>
            <p className="text-[10px] text-gray-400 -mt-2 mb-3 text-center">Próximamente: firma digital integrada</p>

            {/* Sincronizar HubSpot */}
            <button
              onClick={handleSyncHubspot}
              disabled={syncingHubspot}
              className="w-full px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-all font-medium text-xs flex items-center justify-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {syncingHubspot ? 'Sincronizando...' : 'Sincronizar con HubSpot'}
            </button>
          </div>

          {/* Informe PDF */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Informe PDF de Auditoría</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL del PDF:</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={guardarPdfUrl}
                  className="text-xs bg-gray-600 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700"
                >
                  Guardar URL
                </button>
                {lead.informePdfUrl && (
                  <a
                    href={lead.informePdfUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200"
                  >
                    Ver PDF
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Gestión */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Gestión</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
                <select
                  value={estado}
                  onChange={e => setEstado(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-orange-500"
                >
                  {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Prioridad</label>
                <select
                  value={prioridad}
                  onChange={e => setPrioridad(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-orange-500"
                >
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-orange-500"
                  placeholder="Notas sobre este lead..."
                />
              </div>

              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all font-medium text-sm disabled:opacity-50"
              >
                {guardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>

          {/* Info */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Información</h4>
            <div className="space-y-2 text-xs text-gray-600">
              <p><span className="font-medium">ID:</span> {lead.id.slice(0, 8)}...</p>
              <p><span className="font-medium">Creado:</span> {new Date(lead.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
              {lead.cuestionario?.fechaEnvio && (
                <p><span className="font-medium">Email enviado:</span> {new Date(lead.cuestionario.fechaEnvio).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
              )}
              {lead.cuestionario?.fechaCompletado && (
                <p><span className="font-medium">Cuestionario completado:</span> {new Date(lead.cuestionario.fechaCompletado).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de previsualización de email */}
      {mostrarEmailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Revisar email antes de enviar</h3>
                <button onClick={() => setMostrarEmailModal(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-1">Destinatario: <strong>{lead.email}</strong></p>
              <p className="text-xs text-gray-400 mt-0.5">BCC: comercial@internetoperadores.com, david.perez@internetoperadores.com</p>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
                <input
                  type="text"
                  value={emailAsunto}
                  onChange={e => setEmailAsunto(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vista previa del email</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <iframe
                    srcDoc={emailCuerpo}
                    className="w-full h-80 border-0"
                    title="Vista previa email"
                  />
                </div>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Editar HTML del email</summary>
                <textarea
                  value={emailCuerpo}
                  onChange={e => setEmailCuerpo(e.target.value)}
                  rows={10}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-orange-500"
                />
              </details>

              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-medium">Información adicional:</p>
                <p className="mt-1">&#8226; El email incluye el link al cuestionario técnico online</p>
                <p>&#8226; Se enviará con copia oculta (BCC) a comercial@ y david.perez@</p>
                <p>&#8226; El estado del lead se actualizará automáticamente</p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex items-center justify-between">
              <button
                onClick={() => setMostrarEmailModal(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarEmail}
                disabled={enviandoEmail}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
              >
                {enviandoEmail ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Enviando...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg> Enviar email</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
