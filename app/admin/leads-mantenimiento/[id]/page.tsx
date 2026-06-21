"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Lead {
  id: string;
  tipo: string;
  nombre: string;
  email: string;
  empresa: string;
  telefono: string | null;
  datos: any;
  estado: string;
  prioridad: string;
  notas: string | null;
  presupuestoUrl: string | null;
  presupuestoEnviadoAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const estadoColors: Record<string, string> = {
  NUEVO: 'bg-blue-100 text-blue-800',
  EN_PROCESO: 'bg-yellow-100 text-yellow-800',
  PRESUPUESTO_ENVIADO: 'bg-purple-100 text-purple-800',
  PROPUESTA_PREACEPTADA: 'bg-emerald-100 text-emerald-800',
  REUNION_AGENDADA: 'bg-indigo-100 text-indigo-800',
  GANADO: 'bg-green-100 text-green-800',
  PERDIDO: 'bg-red-100 text-red-800',
  DESCARTADO: 'bg-gray-100 text-gray-800',
};

const prioridadColors: Record<string, string> = {
  BAJA: 'bg-gray-100 text-gray-700',
  MEDIA: 'bg-blue-100 text-blue-700',
  ALTA: 'bg-orange-100 text-orange-700',
  URGENTE: 'bg-red-100 text-red-700',
};

const tipoNegocioLabels: Record<string, string> = {
  FARMACIA: 'Farmacia / Centro médico',
  HORECA: 'HORECA (hostelería, restauración)',
  PYME: 'PYME (hasta 20 empleados)',
  MEDIANA_GRANDE: 'Mediana / Gran empresa (+20 empleados)',
};

export default function LeadDetallePage() {
  const params = useParams();
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [generandoOferta, setGenerandoOferta] = useState(false);
  const [oferta, setOferta] = useState<any>(null);
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cuestionarioInfo, setCuestionarioInfo] = useState<any>(null);
  const [generandoLink, setGenerandoLink] = useState(false);
  const [mostrarEmailModal, setMostrarEmailModal] = useState(false);
  const [emailAsunto, setEmailAsunto] = useState('');
  const [emailCuerpo, setEmailCuerpo] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);

  useEffect(() => {
    fetchLead();
    fetchCuestionario();
  }, []);

  const fetchCuestionario = async () => {
    try {
      const res = await fetch(`/api/admin/leads-mantenimiento/${params.id}/cuestionario`);
      if (res.ok) {
        const data = await res.json();
        setCuestionarioInfo(data);
      }
    } catch {}
  };

  const prepararEmail = () => {
    if (!lead) return;
    const datos = lead.datos || {};
    const cuestionarioToken = datos.cuestionarioTecnico?.token || cuestionarioInfo?.token;
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const cuestionarioUrl = cuestionarioToken ? `${baseUrl}/cuestionario-mantenimiento/${cuestionarioToken}` : '';
    const pdfUrl = `${baseUrl}/api/admin/leads-mantenimiento/${lead.id}/pdf`;

    setEmailAsunto(`Propuesta Servicios Mantenimiento IT - ${lead.empresa}`);
    setEmailCuerpo(`<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: #E87A2E; padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Internet Operadores</h1>
    <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0; font-size: 12px;">Servicios IT Gestionados</p>
  </div>
  <div style="padding: 30px; background-color: #f9f9f9;">
    <p>Estimado/a <strong>${lead.nombre}</strong>,</p>
    <p>Gracias por su inter\u00e9s en nuestros servicios de Mantenimiento IT para <strong>${lead.empresa}</strong>.</p>
    <p>Adjunto a este email encontrar\u00e1 nuestra <strong>propuesta personalizada</strong> con los servicios recomendados y una estimaci\u00f3n econ\u00f3mica basada en las necesidades que nos ha indicado.</p>
    ${cuestionarioUrl ? `<p>Para poder ofrecerle un presupuesto definitivo ajustado a su infraestructura real, le agradecer\u00edamos que completara el siguiente <strong>cuestionario t\u00e9cnico</strong> (10-15 minutos):</p>
    <div style="text-align: center; margin: 25px 0;">
      <a href="${cuestionarioUrl}" style="background-color: #E87A2E; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Completar Cuestionario T\u00e9cnico</a>
    </div>` : ''}
    <p>Una vez recibamos sus respuestas, en un plazo de <strong>48 horas</strong> le enviaremos una propuesta a precio cerrado y coordinaremos una reuni\u00f3n para resolver cualquier duda.</p>
    <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;" />
    <p style="color: #666; font-size: 13px;">Quedamos a su disposici\u00f3n para cualquier consulta:</p>
    <p style="color: #666; font-size: 13px;"><strong>900 730 034</strong> (gratuito) | <strong>comercial@internetoperadores.com</strong></p>
    <p style="color: #999; font-size: 11px; margin-top: 20px;">Internet Operadores — Partner tecnol\u00f3gico de confianza</p>
  </div>
</div>`);
    setMostrarEmailModal(true);
  };

  const handleEnviarEmail = async () => {
    setEnviandoEmail(true);
    try {
      const res = await fetch(`/api/admin/leads-mantenimiento/${params.id}/enviar-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asunto: emailAsunto, cuerpoHtml: emailCuerpo }),
      });
      const data = await res.json();
      if (data.success) {
        setMensaje('Email enviado correctamente');
        setMostrarEmailModal(false);
        setTimeout(() => setMensaje(''), 4000);
      } else {
        setMensaje(`Error: ${data.error || 'No se pudo enviar'}`);
      }
    } catch {
      setMensaje('Error de conexi\u00f3n al enviar email');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleGenerarLink = async () => {
    setGenerandoLink(true);
    try {
      const res = await fetch(`/api/admin/leads-mantenimiento/${params.id}/cuestionario`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        setCuestionarioInfo({ ...cuestionarioInfo, token: data.token, estado: data.estado });
        setMensaje('Link del cuestionario generado');
        setTimeout(() => setMensaje(''), 3000);
      }
    } catch {
      setMensaje('Error al generar link');
    } finally {
      setGenerandoLink(false);
    }
  };

  const fetchLead = async () => {
    try {
      const res = await fetch(`/api/admin/leads-soluciones/${params.id}`);
      if (!res.ok) throw new Error('Error');
      const data = await res.json();
      setLead(data);
      setNotas(data.notas || '');
      setEstado(data.estado);
      setPrioridad(data.prioridad);
      // Si ya tiene oferta generada
      if (data.datos?.ofertaGenerada) {
        setOferta(data.datos.ofertaGenerada);
      }
    } catch {
      setMensaje('Error al cargar el lead');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerarOferta = async () => {
    setGenerandoOferta(true);
    setMensaje('');
    try {
      const res = await fetch(`/api/admin/leads-soluciones/${params.id}/generar-oferta`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setOferta(data.oferta);
        setEstado('EN_PROCESO');
        setMensaje('Oferta generada correctamente');
        fetchLead(); // Recargar datos
      } else {
        setMensaje(data.error || 'Error al generar oferta');
      }
    } catch {
      setMensaje('Error de conexión');
    } finally {
      setGenerandoOferta(false);
    }
  };

  const handleGuardar = async () => {
    setGuardando(true);
    try {
      const res = await fetch(`/api/admin/leads-soluciones/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, prioridad, notas }),
      });
      if (res.ok) {
        setMensaje('Guardado correctamente');
        setTimeout(() => setMensaje(''), 3000);
      }
    } catch {
      setMensaje('Error al guardar');
    } finally {
      setGuardando(false);
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

  if (!lead) {
    return (
      <div className="p-6">
        <p className="text-red-600">Lead no encontrado</p>
        <Link href="/admin/leads-mantenimiento" className="text-orange-600 hover:underline mt-4 inline-block">
          Volver a leads mantenimiento
        </Link>
      </div>
    );
  }

  const datos = lead.datos || {};
  // Auto-detectar tipo para leads antiguos sin tipoNegocio
  let tipoNegocio = datos.tipoNegocio || '';
  if (!tipoNegocio && lead.tipo === 'MANTENIMIENTO_IT') {
    const numEquipos = datos.numEquipos || '';
    const numServidores = datos.numServidores || '';
    const equipoIT = datos.equipoITInterno || '';
    const cobertura = datos.coberturaHoraria || '';
    if (numEquipos.includes('51-100') || numEquipos.includes('+100') || numEquipos.includes('21-50') ||
        numServidores.includes('3-5') || numServidores.includes('+5') ||
        equipoIT.includes('complementar') || cobertura.includes('24x7')) {
      tipoNegocio = 'MEDIANA_GRANDE';
    } else if (numEquipos) {
      tipoNegocio = 'PYME';
    }
  }
  const esGrande = tipoNegocio === 'MEDIANA_GRANDE';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <Link href="/admin/leads-mantenimiento" className="text-sm text-gray-500 hover:text-orange-600 mb-2 inline-flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Volver a leads mantenimiento
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{lead.empresa}</h1>
          <p className="text-gray-600">{lead.nombre} — {lead.email}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${estadoColors[estado] || 'bg-gray-100 text-gray-800'}`}>
            {estado.replace(/_/g, ' ')}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${prioridadColors[prioridad] || 'bg-gray-100 text-gray-700'}`}>
            {prioridad}
          </span>
          {tipoNegocio && (
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
              {tipoNegocioLabels[tipoNegocio] || tipoNegocio}
            </span>
          )}
        </div>
      </div>

      {mensaje && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${mensaje.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {mensaje}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del lead */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Datos del formulario</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Contacto</p>
                <p className="text-sm text-gray-900 font-medium">{lead.nombre}</p>
                <p className="text-sm text-gray-600">{lead.email}</p>
                {lead.telefono && <p className="text-sm text-gray-600">{lead.telefono}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Empresa</p>
                <p className="text-sm text-gray-900 font-medium">{lead.empresa}</p>
                <p className="text-sm text-gray-600">{tipoNegocioLabels[tipoNegocio] || 'Sin tipo'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Equipos/PCs</p>
                <p className="text-sm text-gray-900">{datos.numEquipos || 'No indicado'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium">Cobertura horaria</p>
                <p className="text-sm text-gray-900">{datos.coberturaHoraria || 'No indicado'}</p>
              </div>

              {/* Campos específicos Farmacia/HORECA */}
              {(tipoNegocio === 'FARMACIA' || tipoNegocio === 'HORECA') && (
                <>
                  {datos.softwareEspecifico?.length > 0 && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-gray-500 uppercase font-medium">Software específico</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {datos.softwareEspecifico.map((sw: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 bg-orange-50 text-orange-700 text-xs rounded-full">{sw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {datos.produccion24h && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-medium">Producción/Servicio</p>
                      <p className="text-sm text-gray-900">{datos.produccion24h}</p>
                    </div>
                  )}
                </>
              )}

              {/* Campos específicos PYME */}
              {tipoNegocio === 'PYME' && (
                <>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Servidores</p>
                    <p className="text-sm text-gray-900">{datos.numServidores || 'No indicado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Backup/Ciberseguridad</p>
                    <p className="text-sm text-gray-900">{datos.backupCiberseguridad || 'No indicado'}</p>
                  </div>
                </>
              )}

              {/* Campos específicos Mediana/Grande */}
              {esGrande && (
                <>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Servidores</p>
                    <p className="text-sm text-gray-900">{datos.numServidores || 'No indicado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Sedes/Oficinas</p>
                    <p className="text-sm text-gray-900">{datos.numSedes || 'No indicado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Equipo IT interno</p>
                    <p className="text-sm text-gray-900">{datos.equipoITInterno || 'No indicado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Sistemas críticos</p>
                    <p className="text-sm text-gray-900">{datos.sistemasCriticos || 'No indicado'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase font-medium">Presupuesto orientativo</p>
                    <p className="text-sm text-gray-900">{datos.presupuestoOrientativo || 'No indicado'}</p>
                  </div>
                </>
              )}

              {/* Servicios de interés */}
              {datos.serviciosInteres?.length > 0 && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500 uppercase font-medium">Servicios de interés</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {datos.serviciosInteres.map((s: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Comentarios */}
              {datos.comentarios && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500 uppercase font-medium">Comentarios</p>
                  <p className="text-sm text-gray-900 mt-1 bg-gray-50 p-3 rounded-lg">{datos.comentarios}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4">
              Recibido: {new Date(lead.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
            </p>
          </div>

          {/* Oferta generada */}
          {oferta && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">
                  {oferta.tipo === 'OFERTA_AUTOMATICA' ? 'Oferta Automática' : 'Propuesta a Medida'}
                </h2>
                {datos.ofertaGeneradaAt && (
                  <span className="text-xs text-gray-400">
                    Generada: {new Date(datos.ofertaGeneradaAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                  </span>
                )}
              </div>

              {/* OFERTA AUTOMÁTICA (PYME/Farmacia/HORECA) */}
              {oferta.tipo === 'OFERTA_AUTOMATICA' && (
                <div className="space-y-4">
                  {/* Tarifa recomendada */}
                  <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-gray-900">Plan recomendado</h3>
                      <span className="text-xs bg-orange-600 text-white px-2 py-0.5 rounded-full">Recomendado</span>
                    </div>
                    <p className="text-lg font-bold text-orange-600">{oferta.tarifaRecomendada?.nombre}</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-bold text-gray-900">{oferta.tarifaRecomendada?.precioMensual} €</span>
                      <span className="text-gray-500">/mes</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-xs text-gray-500">Horas incluidas</p>
                        <p className="font-bold text-gray-900">{oferta.tarifaRecomendada?.horasIncluidas}h</p>
                      </div>
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-xs text-gray-500">Nivel técnico</p>
                        <p className="font-bold text-gray-900">{oferta.nivelRecomendado}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2">
                        <p className="text-xs text-gray-500">Modalidad</p>
                        <p className="font-bold text-gray-900">{oferta.modalidadRecomendada}</p>
                      </div>
                    </div>
                  </div>

                  {/* Alternativas */}
                  {oferta.alternativas?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Alternativas</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {oferta.alternativas.map((alt: any, i: number) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                            <p className="text-sm font-medium text-gray-900">{alt.nombre}</p>
                            <p className="text-lg font-bold text-gray-700 mt-1">{alt.precioMensual} €<span className="text-sm font-normal text-gray-500">/mes</span></p>
                            <p className="text-xs text-gray-500 mt-1">{alt.horasIncluidas}h — {alt.nivelTecnico} {alt.modalidad}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Extras */}
                  {oferta.extras?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Servicios adicionales</h4>
                      <div className="space-y-2">
                        {oferta.extras.map((extra: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{extra.nombre}</p>
                              <p className="text-xs text-gray-500">{extra.descripcion}</p>
                            </div>
                            <span className="text-sm font-bold text-gray-900">{extra.precio > 0 ? `+${extra.precio} €/mes` : 'Incluido'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Condiciones */}
                  {oferta.condiciones && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Condiciones</h4>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><span className="text-gray-500">Horas excedidas:</span> <span className="font-medium">{oferta.condiciones.horasExcedidas}</span></div>
                        <div><span className="text-gray-500">SLA:</span> <span className="font-medium">{oferta.condiciones.sla}</span></div>
                        <div><span className="text-gray-500">Permanencia:</span> <span className="font-medium">{oferta.condiciones.permanencia}</span></div>
                        <div><span className="text-gray-500">Facturación:</span> <span className="font-medium">{oferta.condiciones.facturacion}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PROPUESTA A MEDIDA (Mediana/Grande) */}
              {oferta.tipo === 'PROPUESTA_MEDIDA' && (
                <div className="space-y-4">
                  {oferta.propuestaValor && (
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-800 mb-2">Propuesta de valor</h4>
                      <p className="text-sm text-gray-700 whitespace-pre-line">{oferta.propuestaValor}</p>
                    </div>
                  )}

                  {oferta.serviciosRecomendados?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Servicios recomendados</h4>
                      <ul className="space-y-1">
                        {oferta.serviciosRecomendados.map((s: string, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {oferta.estimacionRango && (
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-200">
                      <h4 className="text-sm font-semibold text-orange-800 mb-2">Estimación de rango</h4>
                      <p className="text-2xl font-bold text-gray-900">
                        {oferta.estimacionRango.min?.toLocaleString()} - {oferta.estimacionRango.max?.toLocaleString()} €/mes
                      </p>
                      {oferta.estimacionRango.nota && (
                        <p className="text-xs text-gray-500 mt-1">{oferta.estimacionRango.nota}</p>
                      )}
                    </div>
                  )}

                  {oferta.puntosFuertes?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Puntos fuertes</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {oferta.puntosFuertes.map((p: string, i: number) => (
                          <div key={i} className="flex items-start gap-2 bg-green-50 rounded-lg p-3 border border-green-200">
                            <svg className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            <span className="text-sm text-gray-700">{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {oferta.siguientesPasos?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Siguientes pasos</h4>
                      <ol className="space-y-2">
                        {oferta.siguientesPasos.map((paso: string, i: number) => (
                          <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
                            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                            {paso}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {oferta.cuestionarioTecnico?.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Cuestionario técnico (para la reunión)</h4>
                      <ul className="space-y-2">
                        {oferta.cuestionarioTecnico.map((q: string, i: number) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                            <span className="text-orange-500 font-bold">•</span>
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Acciones */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Acciones</h3>

            {!oferta && lead.tipo === 'MANTENIMIENTO_IT' && tipoNegocio && (
              <button
                onClick={handleGenerarOferta}
                disabled={generandoOferta}
                className="w-full px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed mb-3"
              >
                {generandoOferta ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Generando...
                  </span>
                ) : (
                  esGrande ? 'Generar Propuesta a Medida' : 'Generar Oferta Automática'
                )}
              </button>
            )}

            {oferta && (
              <button
                onClick={handleGenerarOferta}
                disabled={generandoOferta}
                className="w-full px-4 py-2.5 border border-orange-300 text-orange-700 rounded-lg hover:bg-orange-50 transition-all font-medium text-sm disabled:opacity-50 mb-3"
              >
                {generandoOferta ? 'Regenerando...' : 'Regenerar oferta'}
              </button>
            )}

            {oferta && (
              <a
                href={`/api/admin/leads-mantenimiento/${params.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium text-sm text-center flex items-center justify-center gap-2 mb-3"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Descargar PDF Propuesta + Cuestionario
              </a>
            )}

            <button
              onClick={prepararEmail}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium text-sm flex items-center justify-center gap-2 mb-3"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              Enviar propuesta por email
            </button>

            <a
              href="https://outlook.office.com/bookwithme/user/fbd2ec5013e94a2ebe031317c9afc0a7@lfgd.es/meetingtype/hyWyrJkZTk2szZxF8tCJoA2?bookingcode=9ff50d17-71aa-4749-a605-faf5ae47d47b&anonymous&ismsaljsauthenabled&ep=mlink"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-all font-medium text-sm text-center flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              Agendar reunión (Bookings)
            </a>
          </div>

          {/* Cuestionario Técnico */}
          {esGrande && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-bold text-gray-900 mb-4 uppercase">Cuestionario Técnico</h3>

              {!cuestionarioInfo?.token ? (
                <div>
                  <p className="text-xs text-gray-500 mb-3">Genera un link único para que el cliente rellene el cuestionario técnico online.</p>
                  <button
                    onClick={handleGenerarLink}
                    disabled={generandoLink}
                    className="w-full px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium text-sm disabled:opacity-50"
                  >
                    {generandoLink ? 'Generando...' : 'Generar link cuestionario'}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      cuestionarioInfo.estado === 'COMPLETADO' ? 'bg-green-500' : 'bg-yellow-500'
                    }`}></span>
                    <span className="text-xs font-medium text-gray-700">
                      {cuestionarioInfo.estado === 'COMPLETADO' ? 'Completado' : 'Pendiente de respuesta'}
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 mb-1">Link para el cliente:</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/cuestionario-mantenimiento/${cuestionarioInfo.token}`}
                        className="flex-1 px-2 py-1.5 bg-white border border-gray-300 rounded text-xs text-gray-700 truncate"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/cuestionario-mantenimiento/${cuestionarioInfo.token}`);
                          setMensaje('Link copiado al portapapeles');
                          setTimeout(() => setMensaje(''), 3000);
                        }}
                        className="px-2 py-1.5 bg-gray-200 hover:bg-gray-300 rounded text-xs font-medium text-gray-700 transition-all flex-shrink-0"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>

                  {cuestionarioInfo.estado === 'COMPLETADO' && cuestionarioInfo.respuestas && (
                    <div className="mt-3">
                      <p className="text-xs text-green-700 font-medium mb-2">
                        Completado el {new Date(cuestionarioInfo.completadoAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}
                      </p>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-indigo-600 font-medium hover:text-indigo-800">Ver respuestas ({Object.keys(cuestionarioInfo.respuestas).length} secciones)</summary>
                        <div className="mt-2 space-y-3 max-h-96 overflow-y-auto">
                          {Object.entries(cuestionarioInfo.respuestas).map(([seccion, preguntas]: [string, any]) => (
                            <div key={seccion} className="bg-gray-50 rounded-lg p-3">
                              <p className="font-semibold text-gray-700 mb-2 capitalize">{seccion.replace(/_/g, ' ')}</p>
                              {preguntas.map((item: any, i: number) => (
                                <div key={i} className="mb-2">
                                  <p className="text-gray-500 text-[10px]">{item.pregunta}</p>
                                  <p className="text-gray-900 font-medium">{item.respuesta || <span className="italic text-gray-400">Sin respuesta</span>}</p>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

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
                  <option value="NUEVO">Nuevo</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="PRESUPUESTO_ENVIADO">Presupuesto enviado</option>
                  <option value="PROPUESTA_PREACEPTADA">Propuesta pre-aceptada</option>
                  <option value="REUNION_AGENDADA">Reunión agendada</option>
                  <option value="GANADO">Ganado</option>
                  <option value="PERDIDO">Perdido</option>
                  <option value="DESCARTADO">Descartado</option>
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
              <p><span className="font-medium">Tipo:</span> {lead.tipo}</p>
              <p><span className="font-medium">Creado:</span> {new Date(lead.createdAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
              <p><span className="font-medium">Actualizado:</span> {new Date(lead.updatedAt).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</p>
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
                <p className="font-medium">Se adjuntará automáticamente:</p>
                <p className="mt-1">• Propuesta PDF (HTML) con el documento vendedor completo</p>
                <p>• El email incluye el link al cuestionario técnico online</p>
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
