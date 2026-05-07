"use client";
import Link from 'next/link';
import { useState, useMemo } from 'react';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

interface UsoItem {
  id: string;
  nombre: string;
  icono: string;
  mbpsDescarga: number;
  mbpsSubida: number;
  descripcion: string;
}

const tiposUso: UsoItem[] = [
  { id: 'email', nombre: 'Email y navegación web', icono: '📧', mbpsDescarga: 1, mbpsSubida: 0.5, descripcion: 'Correo electrónico, navegación básica, documentos' },
  { id: 'cloud', nombre: 'Trabajo en la nube', icono: '☁️', mbpsDescarga: 3, mbpsSubida: 2, descripcion: 'Google Workspace, Microsoft 365, CRM online' },
  { id: 'video', nombre: 'Videoconferencia', icono: '📹', mbpsDescarga: 5, mbpsSubida: 4, descripcion: 'Zoom, Teams, Meet (HD con pantalla compartida)' },
  { id: 'voip', nombre: 'Telefonía VoIP', icono: '📞', mbpsDescarga: 0.5, mbpsSubida: 0.5, descripcion: 'Llamadas de voz sobre IP' },
  { id: 'erp', nombre: 'ERP / Software empresarial', icono: '🏢', mbpsDescarga: 2, mbpsSubida: 1, descripcion: 'SAP, Sage, Navision, software de gestión' },
  { id: 'backup', nombre: 'Backup en la nube', icono: '💾', mbpsDescarga: 1, mbpsSubida: 5, descripcion: 'Copias de seguridad automáticas' },
  { id: 'streaming', nombre: 'Streaming / Formación online', icono: '🎬', mbpsDescarga: 8, mbpsSubida: 1, descripcion: 'Vídeos formativos, webinars, streaming' },
  { id: 'transferencia', nombre: 'Transferencia de archivos grandes', icono: '📁', mbpsDescarga: 5, mbpsSubida: 5, descripcion: 'Diseño gráfico, vídeo, CAD, planos' },
  { id: 'pos', nombre: 'TPV / Punto de venta', icono: '🛒', mbpsDescarga: 0.5, mbpsSubida: 0.5, descripcion: 'Terminales de punto de venta, datáfonos' },
  { id: 'iot', nombre: 'IoT / Dispositivos conectados', icono: '📡', mbpsDescarga: 0.2, mbpsSubida: 0.2, descripcion: 'Sensores, cámaras IP, domótica' },
];

export default function EstimadorAnchoBandaPage() {
  const [empleados, setEmpleados] = useState(15);
  const [usosSeleccionados, setUsosSeleccionados] = useState<Record<string, number>>({
    email: 100,
    cloud: 80,
    video: 50,
    voip: 60,
  });
  const [margenSeguridad, setMargenSeguridad] = useState(30);

  const toggleUso = (id: string) => {
    setUsosSeleccionados(prev => {
      const nuevo = { ...prev };
      if (nuevo[id] !== undefined) {
        delete nuevo[id];
      } else {
        nuevo[id] = 50;
      }
      return nuevo;
    });
  };

  const updatePorcentaje = (id: string, valor: number) => {
    setUsosSeleccionados(prev => ({ ...prev, [id]: valor }));
  };

  const resultado = useMemo(() => {
    let totalDescarga = 0;
    let totalSubida = 0;

    Object.entries(usosSeleccionados).forEach(([id, porcentaje]) => {
      const uso = tiposUso.find(u => u.id === id);
      if (uso) {
        const empleadosUsando = Math.ceil(empleados * (porcentaje / 100));
        // Factor de concurrencia (no todos usan al máximo simultáneamente)
        const factorConcurrencia = 0.6;
        totalDescarga += uso.mbpsDescarga * empleadosUsando * factorConcurrencia;
        totalSubida += uso.mbpsSubida * empleadosUsando * factorConcurrencia;
      }
    });

    // Aplicar margen de seguridad
    const margenMultiplier = 1 + (margenSeguridad / 100);
    totalDescarga *= margenMultiplier;
    totalSubida *= margenMultiplier;

    // Redondear al plan comercial más cercano
    const planesComerciales = [50, 100, 200, 300, 500, 600, 1000, 2000, 10000];
    const planDescarga = planesComerciales.find(p => p >= totalDescarga) || 10000;
    const planSubida = planesComerciales.find(p => p >= totalSubida) || 10000;
    const planRecomendado = Math.max(planDescarga, planSubida);

    // Tipo de conexión recomendada
    let tipoConexion = '';
    let descripcionConexion = '';
    if (planRecomendado <= 100) {
      tipoConexion = 'Fibra FTTH';
      descripcionConexion = 'Conexión de fibra óptica estándar, ideal para pequeñas oficinas.';
    } else if (planRecomendado <= 600) {
      tipoConexion = 'Fibra FTTH Simétrica';
      descripcionConexion = 'Fibra simétrica con misma velocidad de subida y bajada, ideal para PYMEs.';
    } else if (planRecomendado <= 1000) {
      tipoConexion = 'Fibra Dedicada';
      descripcionConexion = 'Línea dedicada con SLA garantizado, ideal para empresas medianas con necesidades críticas.';
    } else {
      tipoConexion = 'Línea Dedicada + Backup';
      descripcionConexion = 'Conexión dedicada de alta capacidad con línea de backup automática.';
    }

    return {
      descargaNecesaria: Math.round(totalDescarga),
      subidaNecesaria: Math.round(totalSubida),
      planRecomendado,
      tipoConexion,
      descripcionConexion,
      necesitaBackup: planRecomendado >= 300 || Object.keys(usosSeleccionados).includes('voip'),
      necesitaQoS: Object.keys(usosSeleccionados).includes('voip') || Object.keys(usosSeleccionados).includes('video'),
    };
  }, [empleados, usosSeleccionados, margenSeguridad]);

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      <section className="bg-gradient-to-br from-indigo-50 via-white to-indigo-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/recursos/herramientas" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Herramientas
            </Link>
            <div className="text-5xl mb-4">📶</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
              Estimador de Ancho de Banda
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Calcula el ancho de banda que necesita tu empresa según el número de empleados y tipo de uso.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-12 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Panel de configuración */}
              <div className="lg:col-span-2 space-y-6">
                {/* Empleados */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Empleados</h2>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Numero de empleados: <span className="text-orange-600 text-lg">{empleados}</span>
                    </label>
                    <input type="range" min="1" max="500" step="1" value={empleados}
                      onChange={(e) => setEmpleados(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1</span><span>500</span></div>
                  </div>
                </div>

                {/* Tipos de uso */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-2">Tipos de uso</h2>
                  <p className="text-sm text-gray-500 mb-4">Selecciona los servicios que usa tu empresa e indica el porcentaje de empleados que los utilizan.</p>
                  <div className="space-y-3">
                    {tiposUso.map(uso => {
                      const seleccionado = usosSeleccionados[uso.id] !== undefined;
                      return (
                        <div key={uso.id} className={`rounded-xl border-2 p-4 transition-all ${
                          seleccionado ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}>
                          <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleUso(uso.id)}>
                            <input type="checkbox" checked={seleccionado} readOnly
                              className="w-4 h-4 text-orange-600 rounded accent-orange-600" />
                            <span className="text-2xl">{uso.icono}</span>
                            <div className="flex-1">
                              <span className="font-semibold text-gray-900 text-sm">{uso.nombre}</span>
                              <p className="text-xs text-gray-500">{uso.descripcion}</p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                              <div>{uso.mbpsDescarga} Mbps ↓</div>
                              <div>{uso.mbpsSubida} Mbps ↑</div>
                            </div>
                          </div>
                          {seleccionado && (
                            <div className="mt-3 pl-10">
                              <label className="text-xs text-gray-600">
                                Empleados que lo usan: <span className="font-bold text-orange-600">{usosSeleccionados[uso.id]}%</span>
                              </label>
                              <input type="range" min="10" max="100" step="5" value={usosSeleccionados[uso.id]}
                                onChange={(e) => updatePorcentaje(uso.id, Number(e.target.value))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Margen de seguridad */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Margen de seguridad</h2>
                  <label className="block text-sm text-gray-600 mb-2">
                    Margen adicional para picos de uso: <span className="font-bold text-orange-600">{margenSeguridad}%</span>
                  </label>
                  <input type="range" min="10" max="50" step="5" value={margenSeguridad}
                    onChange={(e) => setMargenSeguridad(Number(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                  <div className="flex justify-between text-xs text-gray-400 mt-1"><span>10% (ajustado)</span><span>50% (holgado)</span></div>
                </div>
              </div>

              {/* Panel de resultados (sticky) */}
              <div className="lg:sticky lg:top-24 space-y-6 h-fit">
                {/* Resultado principal */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-6 text-white">
                  <h2 className="text-lg font-bold mb-4">Ancho de banda necesario</h2>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-green-400">{resultado.descargaNecesaria}</div>
                      <div className="text-xs text-gray-300">Mbps descarga</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400">{resultado.subidaNecesaria}</div>
                      <div className="text-xs text-gray-300">Mbps subida</div>
                    </div>
                  </div>
                  <div className="border-t border-white/20 pt-4">
                    <div className="text-sm text-gray-300 mb-1">Plan recomendado</div>
                    <div className="text-3xl font-bold text-orange-400">
                      {resultado.planRecomendado >= 1000 ? `${resultado.planRecomendado / 1000} Gbps` : `${resultado.planRecomendado} Mbps`}
                    </div>
                    <div className="text-sm text-gray-300 mt-1">simétrico</div>
                  </div>
                </div>

                {/* Tipo de conexión */}
                <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6">
                  <h3 className="font-bold text-orange-800 mb-2">{resultado.tipoConexion}</h3>
                  <p className="text-sm text-orange-700 mb-3">{resultado.descripcionConexion}</p>
                  {resultado.necesitaBackup && (
                    <div className="flex items-start gap-2 text-sm text-orange-700 mb-2">
                      <span className="text-orange-500 mt-0.5">▸</span>
                      <span>Recomendamos añadir una <strong>línea de backup</strong> para garantizar la continuidad.</span>
                    </div>
                  )}
                  {resultado.necesitaQoS && (
                    <div className="flex items-start gap-2 text-sm text-orange-700">
                      <span className="text-orange-500 mt-0.5">▸</span>
                      <span>Necesitas <strong>QoS (Quality of Service)</strong> para priorizar voz y vídeo.</span>
                    </div>
                  )}
                </div>

                {/* CTA */}
                <Link href="/contacto" className="block w-full px-6 py-4 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-bold text-center">
                  Solicitar Propuesta
                </Link>
                <Link href="/recursos/herramientas/cobertura-fibra" className="block w-full px-6 py-3 bg-white border-2 border-orange-600 text-orange-600 rounded-xl hover:bg-orange-50 transition-all font-semibold text-center">
                  Comprobar Cobertura
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
