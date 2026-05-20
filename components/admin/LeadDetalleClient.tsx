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
  enviadoAt: string | null;
  completadoAt: string | null;
  respuestas: Respuesta[];
}

interface Lead {
  id: string;
  nombreEmpresa: string;
  contacto: string;
  email: string;
  telefono: string | null;
  urlWeb: string | null;
  sector: string | null;
  estado: string;
  prioridad: string;
  presupuesto: string | null;
  plazo: string | null;
  numPaginas: string | null;
  funcionalidades: string | null;
  frustracion: string | null;
  objetivos: string | null;
  respuestasSector: string | null;
  software: string | null;
  notas: string | null;
  informePdfUrl: string | null;
  createdAt: string;
  cuestionario: Cuestionario | null;
}

const ESTADOS = [
  { value: 'NUEVO', label: 'Nuevo', color: 'bg-blue-100 text-blue-800' },
  { value: 'CONTACTADO', label: 'Contactado', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'CUESTIONARIO_ENVIADO', label: 'Cuestionario enviado', color: 'bg-purple-100 text-purple-800' },
  { value: 'CUESTIONARIO_COMPLETADO', label: 'Cuestionario completado', color: 'bg-green-100 text-green-800' },
  { value: 'PROPUESTA_ENVIADA', label: 'Propuesta enviada', color: 'bg-orange-100 text-orange-800' },
  { value: 'CERRADO_GANADO', label: 'Cerrado (ganado)', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'CERRADO_PERDIDO', label: 'Cerrado (perdido)', color: 'bg-red-100 text-red-800' },
];

export default function LeadDetalleClient({ leadId }: { leadId: string }) {
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    fetchLead();
  }, [leadId]);

  const fetchLead = async () => {
    try {
      const res = await fetch(`/api/admin/leads/${leadId}`);
      const data = await res.json();
      setLead(data.lead);
      setNotas(data.lead?.notas || '');
      if (data.lead?.cuestionario) {
        const baseUrl = window.location.origin;
        setCuestionarioUrl(`${baseUrl}/cuestionario/${data.lead.cuestionario.token}`);
      }
    } catch (error) {
      console.error('Error:', error);
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
    } catch (error) {
      console.error('Error:', error);
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
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setGuardandoNotas(false);
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
    } catch (error) {
      console.error('Error:', error);
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
        ? 'Cuestionario creado. Resend no configurado - copie el link manualmente.' 
        : 'Email enviado correctamente');
    } catch (error) {
      console.error('Error:', error);
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

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Cargando...</div>;
  }

  if (!lead) {
    return <div className="p-6 text-center text-red-500">Lead no encontrado</div>;
  }

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
        <div className="flex gap-2">
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
                  {lead.urlWeb ? (
                    <a href={lead.urlWeb} target="_blank" rel="noopener" className="text-orange-600 hover:underline">{lead.urlWeb}</a>
                  ) : '-'}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Sector</label>
                <p className="text-sm text-gray-900 capitalize">{lead.sector || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Presupuesto</label>
                <p className="text-sm text-gray-900">{lead.presupuesto || '-'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium">Plazo</label>
                <p className="text-sm text-gray-900">{lead.plazo || '-'}</p>
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
              {lead.funcionalidades && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Funcionalidades actuales</label>
                  <p className="text-sm text-gray-900">{lead.funcionalidades}</p>
                </div>
              )}
              {lead.frustracion && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Frustración principal</label>
                  <p className="text-sm text-gray-900">{lead.frustracion}</p>
                </div>
              )}
              {lead.objetivos && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Objetivos</label>
                  <div className="text-sm text-gray-900">
                    {lead.objetivos.split(',').map((obj, i) => (
                      <span key={i} className="inline-block bg-orange-50 text-orange-700 px-2 py-1 rounded text-xs mr-2 mb-1">
                        {obj.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {lead.respuestasSector && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Respuestas sector ({lead.sector})</label>
                  <pre className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded p-3 mt-1">
                    {lead.respuestasSector}
                  </pre>
                </div>
              )}
              {lead.software && (
                <div>
                  <label className="text-xs text-gray-500 font-medium">Software/Integraciones</label>
                  <p className="text-sm text-gray-900">{lead.software}</p>
                </div>
              )}
            </div>
          </div>

          {/* Respuestas del cuestionario técnico */}
          {lead.cuestionario && lead.cuestionario.respuestas.length > 0 && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Respuestas del Cuestionario Técnico
                <span className="ml-2 text-xs font-normal text-green-600">
                  Completado el {lead.cuestionario.completadoAt ? new Date(lead.cuestionario.completadoAt).toLocaleDateString('es-ES') : '-'}
                </span>
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
          {/* Acciones */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Acciones</h3>
            <div className="space-y-3">
              {!lead.cuestionario ? (
                <button
                  onClick={crearCuestionario}
                  disabled={creandoCuestionario}
                  className="w-full bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                >
                  {creandoCuestionario ? 'Creando...' : '📋 Generar Cuestionario'}
                </button>
              ) : (
                <>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs text-green-700 font-medium mb-2">Cuestionario creado</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cuestionarioUrl}
                        readOnly
                        className="flex-1 text-xs border rounded px-2 py-1 bg-white"
                      />
                      <button
                        onClick={copiarLink}
                        className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                      >
                        {copiado ? '✓' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-xs text-green-600 mt-2">
                      Estado: {lead.cuestionario.estado === 'COMPLETADO' ? '✅ Completado' : '⏳ Pendiente'}
                    </p>
                  </div>
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
                </>
              )}
            </div>
          </div>

          {/* PDF del informe */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Informe PDF</h3>
            {lead.informePdfUrl ? (
              <div>
                <a href={lead.informePdfUrl} target="_blank" rel="noopener" className="text-orange-600 hover:underline text-sm">
                  📄 Ver informe PDF
                </a>
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-2">URL del PDF de auditoría (subir manualmente):</p>
                <input
                  type="url"
                  placeholder="https://..."
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm mb-2"
                />
                <button
                  onClick={async () => {
                    await fetch(`/api/admin/leads/${leadId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ informePdfUrl: pdfUrl }),
                    });
                    fetchLead();
                  }}
                  className="text-xs bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                >
                  Guardar URL
                </button>
              </div>
            )}
          </div>

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

          {/* Info rápida */}
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
                <span className="text-gray-500">Email enviado</span>
                <span className={lead.cuestionario?.enviadoAt ? 'text-green-600' : 'text-gray-300'}>
                  {lead.cuestionario?.enviadoAt ? '✓' : '○'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Cuestionario completado</span>
                <span className={lead.cuestionario?.estado === 'COMPLETADO' ? 'text-green-600' : 'text-gray-300'}>
                  {lead.cuestionario?.estado === 'COMPLETADO' ? '✓' : '○'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Propuesta enviada</span>
                <span className={lead.estado === 'PROPUESTA_ENVIADA' || lead.estado.startsWith('CERRADO') ? 'text-green-600' : 'text-gray-300'}>
                  {lead.estado === 'PROPUESTA_ENVIADA' || lead.estado.startsWith('CERRADO') ? '✓' : '○'}
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
