"use client";
import Link from 'next/link';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

export default function ArticuloPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      {/* Hero del artículo */}
      <div className="pt-8 pb-12 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <Link href="/recursos/blog" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-6 group">
              <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver al Blog
            </Link>
            
            <div className="flex flex-wrap gap-3 mb-6">
              <span className="inline-flex items-center bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
                Infraestructura de Red
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Guía definitiva de WiFi empresarial: 
              <span className="text-orange-600"> Más allá del router doméstico</span>
            </h1>
            
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 mb-8">
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                1 Enero 2026
              </span>
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                9 min lectura
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido del artículo */}
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-4xl mx-auto">
          
          {/* Imagen destacada */}
          <div className="relative w-full h-[300px] sm:h-[400px] lg:h-[450px] rounded-2xl overflow-hidden shadow-2xl mb-12">
            <img 
              src="/images/blog/wifi-empresarial.jpg" 
              alt="Punto de acceso WiFi Ruckus en el techo de una oficina moderna" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>
          </div>

          {/* Introducción destacada */}
          <div className="bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-500 p-6 sm:p-8 rounded-r-2xl mb-12">
            <p className="text-lg sm:text-xl text-gray-700 leading-relaxed font-medium">
              En el mundo empresarial, pensar que el WiFi es simplemente "internet sin cables" es un error que puede costar caro. 
              La red inalámbrica de una empresa tiene exigencias de rendimiento, seguridad y gestión que un router doméstico 
              no puede ni soñar con cumplir.
            </p>
          </div>

          {/* Contenido principal */}
          <article className="space-y-12">
            
            {/* Comparativa visual */}
            <section className="grid sm:grid-cols-2 gap-6">
              <div className="bg-red-50 rounded-2xl p-6 border-2 border-red-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-red-200 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">🏠</span>
                  </div>
                  <h3 className="text-xl font-bold text-red-800">Router Doméstico</h3>
                </div>
                <ul className="space-y-3 text-red-700">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>10-20 dispositivos máximo</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Sin gestión centralizada</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Seguridad básica (WPA2)</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span>Cobertura limitada</span>
                  </li>
                </ul>
              </div>
              
              <div className="bg-green-50 rounded-2xl p-6 border-2 border-green-200">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-green-200 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">🏢</span>
                  </div>
                  <h3 className="text-xl font-bold text-green-800">WiFi Empresarial</h3>
                </div>
                <ul className="space-y-3 text-green-700">
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Cientos de dispositivos simultáneos</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Panel de control centralizado</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>WPA3-Enterprise + VLANs</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Cobertura total sin zonas muertas</span>
                  </li>
                </ul>
              </div>
            </section>

            {/* Ventajas del WiFi empresarial */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <span className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                ¿Por qué necesitas WiFi empresarial?
              </h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                    <span className="text-2xl">📈</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Escalabilidad</h3>
                  <p className="text-gray-600">Añade decenas o cientos de APs para cubrir grandes superficies sin crear redes separadas.</p>
                </div>
                
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                    <span className="text-2xl">🎛️</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Gestión Centralizada</h3>
                  <p className="text-gray-600">Administra toda la red desde un único panel, simplificando configuración y actualizaciones.</p>
                </div>
                
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                    <span className="text-2xl">🔒</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Seguridad Robusta</h3>
                  <p className="text-gray-600">WPA3-Enterprise, VLANs para separar tráfico y sistemas de detección de intrusos.</p>
                </div>
                
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                    <span className="text-2xl">⚡</span>
                  </div>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">Rendimiento Superior</h3>
                  <p className="text-gray-600">Diseñado para cientos de conexiones simultáneas con optimización del espectro.</p>
                </div>
              </div>
            </section>

            {/* Ruckus */}
            <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 sm:p-10 text-white">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-orange-500 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">📡</span>
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">Ruckus Networks</h2>
                  <p className="text-gray-400">La elección de los profesionales</p>
                </div>
              </div>
              
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                Cuando hablamos de WiFi empresarial de alto rendimiento, <strong className="text-white">Ruckus Networks</strong> es 
                un nombre que resuena con fuerza. Su fama se basa en tecnologías patentadas que marcan una gran diferencia 
                en entornos congestionados.
              </p>

              <div className="bg-white/10 rounded-xl p-6 mb-6">
                <div className="flex items-start gap-4">
                  <svg className="w-8 h-8 text-orange-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                  </svg>
                  <p className="text-lg text-gray-200">
                    La tecnología <strong className="text-orange-400">BeamFlex+</strong> es una antena adaptativa inteligente que 
                    dirige la señal WiFi hacia cada dispositivo en tiempo real, aumentando la potencia y reduciendo interferencias.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">BeamFlex+</p>
                  <p className="text-gray-300 text-sm">Antenas adaptativas</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">ChannelFly</p>
                  <p className="text-gray-300 text-sm">Selección dinámica</p>
                </div>
                <div className="bg-white/10 rounded-xl p-4 text-center">
                  <p className="text-3xl font-bold text-orange-400">SmartMesh</p>
                  <p className="text-gray-300 text-sm">Redes mesh inteligentes</p>
                </div>
              </div>
            </section>

            {/* Beneficios tangibles */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
                💼 Beneficios tangibles para tu negocio
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse rounded-xl overflow-hidden shadow-lg">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="px-4 py-4 text-left font-semibold">Beneficio</th>
                      <th className="px-4 py-4 text-left font-semibold">Descripción</th>
                      <th className="px-4 py-4 text-left font-semibold">Impacto</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4">
                        <span className="font-bold text-gray-900 flex items-center">
                          <span className="text-xl mr-2">📈</span> Productividad
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600">Conexiones estables para todos los empleados</td>
                      <td className="px-4 py-4 text-green-600 font-medium">+30% eficiencia</td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-4 py-4">
                        <span className="font-bold text-gray-900 flex items-center">
                          <span className="text-xl mr-2">😊</span> Experiencia Cliente
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600">WiFi invitados rápido y seguro</td>
                      <td className="px-4 py-4 text-green-600 font-medium">+25% satisfacción</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4">
                        <span className="font-bold text-gray-900 flex items-center">
                          <span className="text-xl mr-2">🔐</span> Seguridad
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600">Protección contra accesos no autorizados</td>
                      <td className="px-4 py-4 text-green-600 font-medium">-90% riesgo brechas</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-4">
                        <span className="font-bold text-gray-900 flex items-center">
                          <span className="text-xl mr-2">🏃</span> Movilidad
                        </span>
                      </td>
                      <td className="px-4 py-4 text-gray-600">Trabajo desde cualquier punto</td>
                      <td className="px-4 py-4 text-green-600 font-medium">100% cobertura</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Pasos de implementación */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
                🛠️ Cómo planificar tu red WiFi empresarial
              </h2>

              <div className="space-y-4">
                <div className="flex gap-4 items-start bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 transition-colors">
                  <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-600">1</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Site Survey (Estudio de cobertura)</h3>
                    <p className="text-gray-600 mt-1">Un técnico analiza el plano y realiza mediciones in situ para determinar la ubicación óptima de los puntos de acceso.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 transition-colors">
                  <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-600">2</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Diseño de la red</h3>
                    <p className="text-gray-600 mt-1">Se define la arquitectura incluyendo VLANs (empleados, invitados, IoT), políticas de seguridad e integración con la red cableada.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 transition-colors">
                  <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-600">3</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Elección del hardware</h3>
                    <p className="text-gray-600 mt-1">Selección de APs adecuados para cada zona y switches con PoE para alimentación por cable de red.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 transition-colors">
                  <div className="flex-shrink-0 w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <span className="text-xl font-bold text-orange-600">4</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg">Instalación y Configuración</h3>
                    <p className="text-gray-600 mt-1">Instalación física de los APs y configuración del controlador con todos los parámetros definidos.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* CTA */}
            <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center shadow-xl">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                🚀 Da el salto a un WiFi profesional
              </h3>
              <p className="text-orange-100 text-lg mb-8 max-w-2xl mx-auto">
                Si tu empresa sigue dependiendo de soluciones WiFi domésticas, estás limitando tu productividad 
                y exponiéndote a riesgos de seguridad. Solicita un estudio de cobertura gratuito.
              </p>
              <Link 
                href="/contacto?auditoria=wifi" 
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                </svg>
                Solicitar Auditoría WiFi Gratuita
              </Link>
            </section>

            {/* Referencias */}
            <section className="border-t border-gray-200 pt-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">📚 Referencias</h4>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-semibold">RUCKUS Networks.</span> (s.f.). <a href="https://www.ruckusnetworks.com/" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Purpose-driven enterprise networks</a>.
                </li>
                <li>
                  <span className="font-semibold">Meter.</span> (2024). <a href="https://www.meter.com/resources/enterprise-wi-fi" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">What is enterprise Wi-Fi? 10 benefits for your business</a>.
                </li>
              </ol>
            </section>

          </article>

          {/* Artículos relacionados */}
          <section className="mt-16 pt-12 border-t border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Artículos relacionados</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <Link href="/recursos/blog/conexion-respaldo-senales" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Conectividad</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    5 señales de que tu empresa necesita una conexión de respaldo
                  </h4>
                </div>
              </Link>
              <Link href="/recursos/blog/mpls-vs-sdwan" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Redes</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    MPLS vs. SD-WAN: La batalla por el futuro de la red empresarial
                  </h4>
                </div>
              </Link>
            </div>
          </section>

        </div>
      </div>

      <EmpresaFooter />
    </div>
  );
}
