"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

interface CuestionarioData {
  empresa: string;
  contacto: string;
  estado: string;
  completadoAt?: string;
  message?: string;
}

const SECCIONES = [
  {
    id: 'infraestructura',
    titulo: 'Infraestructura actual',
    descripcion: 'Necesitamos conocer su entorno tecnológico actual para dimensionar el servicio correctamente.',
    preguntas: [
      '¿Cuántos servidores físicos y virtuales tienen actualmente? ¿Qué sistema operativo utilizan?',
      '¿Tienen infraestructura en la nube (AWS, Azure, Google Cloud)? ¿Qué servicios?',
      '¿Cuál es la topología de red actual? (switches, firewalls, VPN, SD-WAN...)',
      '¿Tienen sistema de virtualización? (VMware, Hyper-V, Proxmox...)',
      '¿Qué solución de backup utilizan actualmente? ¿Se prueban las restauraciones periódicamente?',
    ]
  },
  {
    id: 'sistemas_criticos',
    titulo: 'Sistemas críticos y producción 24h',
    descripcion: 'Identificar los sistemas que no pueden fallar es clave para definir los niveles de servicio.',
    preguntas: [
      '¿Qué sistemas son imprescindibles para mantener la producción? (ERP, SCADA, MES, PLCs...)',
      '¿Cuál es el tiempo máximo de parada aceptable (RTO) para cada sistema crítico?',
      '¿Tienen redundancia en los sistemas de producción? (servidores en HA, doble línea de internet...)',
      '¿Qué pasa actualmente si un sistema crítico falla durante la noche? ¿Quién responde?',
      '¿Tienen documentado un plan de contingencia o disaster recovery?',
    ]
  },
  {
    id: 'guardias_nocturnas',
    titulo: 'Cobertura nocturna y guardias 24/7',
    descripcion: 'Esta sección nos ayudará a diseñar el servicio de guardias adaptado a sus necesidades reales.',
    preguntas: [
      '¿En qué horario exacto necesitan cobertura nocturna? (ej: 22:00 a 06:00, fines de semana...)',
      '¿Qué tipo de incidencias suelen ocurrir fuera de horario? (caídas de red, fallos de servidor, errores ERP...)',
      '¿Necesitan presencia física nocturna o es suficiente con soporte remoto + desplazamiento si es necesario?',
      '¿Cuál es el tiempo de respuesta máximo aceptable para incidencias nocturnas? (15min, 30min, 1h...)',
      '¿Tienen personal de planta/fábrica que pueda ejecutar instrucciones básicas guiadas por teléfono?',
      '¿Necesitan monitorización proactiva 24/7 con alertas automáticas o solo respuesta reactiva?',
    ]
  },
  {
    id: 'integracion_it',
    titulo: 'Integración con equipo IT interno',
    descripcion: 'Para complementar su equipo de forma eficiente, necesitamos entender cómo trabajan actualmente.',
    preguntas: [
      '¿Cuántas personas forman su equipo IT interno? ¿Qué horario cubren?',
      '¿Qué herramientas de ticketing/gestión utilizan actualmente? (ServiceNow, Jira, Freshdesk...)',
      '¿Cómo prefieren el protocolo de escalado? (niveles, tiempos, contactos de guardia...)',
      '¿Necesitan informes periódicos de las actuaciones nocturnas? ¿Con qué frecuencia?',
      '¿Tienen acceso VPN configurado para soporte remoto externo?',
    ]
  },
  {
    id: 'sla_expectativas',
    titulo: 'SLA y expectativas',
    descripcion: 'Definir las expectativas de servicio nos permite ofrecer una propuesta económica precisa.',
    preguntas: [
      '¿Qué SLA de disponibilidad necesitan para sus sistemas críticos? (99.5%, 99.9%, 99.99%...)',
      '¿Tienen penalizaciones contractuales con sus clientes por paradas de producción?',
      '¿Cuál es el coste estimado por hora de parada de producción para su empresa?',
      '¿Necesitan un período de transición/onboarding? ¿De cuánto tiempo?',
      '¿Prefieren contrato anual con revisión o compromiso a más largo plazo?',
    ]
  },
];

export default function CuestionarioPublicoPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<CuestionarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [seccionActual, setSeccionActual] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const res = await fetch(`/api/cuestionario-mantenimiento/${token}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Enlace no válido');
        return;
      }
      const d = await res.json();
      setData(d);
      if (d.estado === 'COMPLETADO') {
        setEnviado(true);
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (seccionId: string, preguntaIdx: number, valor: string) => {
    const key = `${seccionId}_${preguntaIdx}`;
    setRespuestas(prev => ({ ...prev, [key]: valor }));
  };

  const handleSubmit = async () => {
    setEnviando(true);
    try {
      // Organizar respuestas por sección
      const respuestasOrganizadas: Record<string, any[]> = {};
      SECCIONES.forEach(seccion => {
        respuestasOrganizadas[seccion.id] = seccion.preguntas.map((pregunta, idx) => ({
          pregunta,
          respuesta: respuestas[`${seccion.id}_${idx}`] || '',
        }));
      });

      const res = await fetch(`/api/cuestionario-mantenimiento/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: respuestasOrganizadas }),
      });

      if (res.ok) {
        setEnviado(true);
      } else {
        const err = await res.json();
        setError(err.error || 'Error al enviar');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setEnviando(false);
    }
  };

  const totalPreguntas = SECCIONES.reduce((acc, s) => acc + s.preguntas.length, 0);
  const preguntasRespondidas = Object.values(respuestas).filter(r => r.trim().length > 0).length;
  const progreso = Math.round((preguntasRespondidas / totalPreguntas) * 100);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Cargando cuestionario...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (enviado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Cuestionario completado</h2>
          <p className="text-gray-600 mb-4">
            Gracias por completar el cuestionario técnico. Nuestro equipo revisará sus respuestas y se pondrá en contacto con usted para agendar la auditoría técnica.
          </p>
          <div className="bg-orange-50 rounded-lg p-4 text-sm text-orange-800">
            <p className="font-semibold">¿Tiene alguna duda?</p>
            <p className="mt-1">Llámenos al <strong>900 730 034</strong> (gratuito) o escriba a <strong>comercial@internetoperadores.com</strong></p>
          </div>
        </div>
      </div>
    );
  }

  const seccion = SECCIONES[seccionActual];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-lg font-light text-gray-800">internet<span className="font-bold text-orange-600">operadores</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Cuestionario para</p>
            <p className="text-sm font-semibold text-gray-900">{data?.empresa}</p>
          </div>
        </div>
        {/* Barra de progreso */}
        <div className="h-1 bg-gray-100">
          <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${progreso}%` }}></div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Intro */}
        {seccionActual === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cuestionario técnico previo</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              Hola <strong>{data?.contacto}</strong>, para poder dimensionar correctamente el servicio de 
              <strong> guardias IT 24/7</strong> y <strong>cobertura nocturna</strong> que necesita {data?.empresa}, 
              necesitamos conocer en detalle su infraestructura actual y requisitos específicos.
            </p>
            <p className="text-gray-500 text-xs mt-3">
              Tiempo estimado: 10-15 minutos · Puede guardar y continuar más tarde · Sus datos son confidenciales
            </p>
          </div>
        )}

        {/* Navegación de secciones */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {SECCIONES.map((s, i) => {
            const preguntasSeccion = s.preguntas.length;
            const respondidasSeccion = s.preguntas.filter((_, idx) => respuestas[`${s.id}_${idx}`]?.trim()).length;
            const completada = respondidasSeccion === preguntasSeccion;

            return (
              <button
                key={s.id}
                onClick={() => setSeccionActual(i)}
                className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  i === seccionActual
                    ? 'bg-orange-600 text-white'
                    : completada
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
                }`}
              >
                {completada && i !== seccionActual && <span className="mr-1">✓</span>}
                {i + 1}. {s.titulo.split(' ').slice(0, 2).join(' ')}
              </button>
            );
          })}
        </div>

        {/* Sección actual */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">{seccion.titulo}</h2>
            <p className="text-sm text-gray-500 mt-1">{seccion.descripcion}</p>
          </div>

          <div className="space-y-6">
            {seccion.preguntas.map((pregunta, idx) => (
              <div key={idx}>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  <span className="text-orange-600 font-bold mr-2">{idx + 1}.</span>
                  {pregunta}
                </label>
                <textarea
                  value={respuestas[`${seccion.id}_${idx}`] || ''}
                  onChange={e => handleChange(seccion.id, idx, e.target.value)}
                  rows={3}
                  placeholder="Escriba su respuesta aquí..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none transition-all"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Navegación */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSeccionActual(Math.max(0, seccionActual - 1))}
            disabled={seccionActual === 0}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Anterior
          </button>

          <span className="text-xs text-gray-500">
            Sección {seccionActual + 1} de {SECCIONES.length} · {progreso}% completado
          </span>

          {seccionActual < SECCIONES.length - 1 ? (
            <button
              onClick={() => setSeccionActual(seccionActual + 1)}
              className="px-4 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-all"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={enviando || preguntasRespondidas < 5}
              className="px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {enviando ? 'Enviando...' : 'Enviar cuestionario'}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-gray-400">
          <p>Internet Operadores — 900 730 034 — comercial@internetoperadores.com</p>
          <p className="mt-1">Sus datos son tratados de forma confidencial conforme a nuestra política de privacidad.</p>
        </div>
      </main>
    </div>
  );
}
