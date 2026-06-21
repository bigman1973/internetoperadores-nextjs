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

  useEffect(() => {
    fetchLead();
  }, []);

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
  const tipoNegocio = datos.tipoNegocio || '';
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

            <a
              href={`mailto:${lead.email}?subject=Propuesta Servicios IT - ${lead.empresa}&body=Hola ${lead.nombre},%0A%0AAdjunto te envío la propuesta de servicios IT para ${lead.empresa}.%0A%0AQuedo a tu disposición para cualquier consulta.%0A%0ASaludos,%0AInternet Operadores%0ATel: 900 730 034`}
              className="w-full px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium text-sm text-center block mb-3"
            >
              Enviar email al lead
            </a>

            {esGrande && (
              <a
                href={`https://teams.microsoft.com/l/chat/0/0?users=${lead.email}&message=Hola ${lead.nombre}, soy del equipo técnico de Internet Operadores. Me gustaría agendar una reunión para hablar sobre vuestra infraestructura IT.`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full px-4 py-2.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-all font-medium text-sm text-center block"
              >
                Contactar por Teams
              </a>
            )}
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
                  <option value="NUEVO">Nuevo</option>
                  <option value="EN_PROCESO">En proceso</option>
                  <option value="PRESUPUESTO_ENVIADO">Presupuesto enviado</option>
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
    </div>
  );
}
