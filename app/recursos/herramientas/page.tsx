"use client";
import Link from 'next/link';
import { useState } from 'react';
import DynamicNav from '../../../components/DynamicNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const herramientas = [
  {
    titulo: 'Calculadora de pérdidas por caída de internet',
    descripcion: 'Calcula cuánto dinero pierde tu empresa por cada hora sin conexión. Incluye costes directos e indirectos.',
    icono: '💰',
    href: '#calculadora',
    destacado: true
  },
  {
    titulo: 'Test de velocidad empresarial',
    descripcion: 'Mide la velocidad real de tu conexión: descarga, subida, latencia y jitter. Optimizado para conexiones empresariales.',
    icono: '⚡',
    href: '/recursos/herramientas/test-velocidad'
  },
  {
    titulo: 'Calculadora de ROI de comunicaciones unificadas',
    descripcion: 'Estima el retorno de inversión de implementar una solución de comunicaciones unificadas en tu empresa.',
    icono: '📊',
    href: '/recursos/herramientas/calculadora-roi'
  },
  {
    titulo: 'Comprobador de cobertura de fibra',
    descripcion: 'Introduce tu dirección y te decimos qué tecnologías de conectividad están disponibles en tu ubicación.',
    icono: '📍',
    href: '/recursos/herramientas/cobertura-fibra'
  },
  {
    titulo: 'Estimador de ancho de banda',
    descripcion: 'Calcula el ancho de banda que necesita tu empresa según el número de empleados y tipo de uso.',
    icono: '📶',
    href: '/recursos/herramientas/estimador-ancho-banda'
  }
];

export default function HerramientasPage() {
  const [empleados, setEmpleados] = useState(10);
  const [costeHora, setCosteHora] = useState(50);
  const [horasCaida, setHorasCaida] = useState(1);

  const perdidaDirecta = empleados * costeHora * horasCaida;
  const perdidaIndirecta = perdidaDirecta * 0.5;
  const perdidaTotal = perdidaDirecta + perdidaIndirecta;

  return (
    <div className="min-h-screen bg-white">
      <DynamicNav currentPage="recursos" />
      
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/recursos" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Recursos
            </Link>
            <div className="text-5xl mb-4">🔧</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">Herramientas</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Calculadoras, tests y herramientas útiles para evaluar y optimizar tus necesidades de conectividad empresarial.
            </p>
          </div>
        </div>
      </section>

      {/* Calculadora Destacada */}
      <section id="calculadora" className="py-8 sm:py-12 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xl">
              <div className="text-center mb-6">
                <span className="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold mb-3">
                  💰 HERRAMIENTA DESTACADA
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  ¿Cuánto pierdes por hora sin internet?
                </h2>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Número de empleados
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      value={empleados}
                      onChange={(e) => setEmpleados(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>1</span>
                      <span className="font-bold text-orange-600">{empleados}</span>
                      <span>100</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Coste medio por hora/empleado (€)
                    </label>
                    <input
                      type="range"
                      min="20"
                      max="150"
                      value={costeHora}
                      onChange={(e) => setCosteHora(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>20€</span>
                      <span className="font-bold text-orange-600">{costeHora}€</span>
                      <span>150€</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Horas de caída al mes
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="24"
                      value={horasCaida}
                      onChange={(e) => setHorasCaida(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600"
                    />
                    <div className="flex justify-between text-sm text-gray-500 mt-1">
                      <span>1h</span>
                      <span className="font-bold text-orange-600">{horasCaida}h</span>
                      <span>24h</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Pérdidas estimadas</h3>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b">
                      <span className="text-gray-600">Pérdida directa (productividad)</span>
                      <span className="font-bold text-gray-900">{perdidaDirecta.toLocaleString()}€</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b">
                      <span className="text-gray-600">Pérdida indirecta (oportunidad, reputación)</span>
                      <span className="font-bold text-gray-900">{perdidaIndirecta.toLocaleString()}€</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-lg font-bold text-gray-900">TOTAL MENSUAL</span>
                      <span className="text-2xl font-bold text-red-600">{perdidaTotal.toLocaleString()}€</span>
                    </div>
                  </div>
                  <div className="mt-6 p-4 bg-orange-100 rounded-lg">
                    <p className="text-sm text-orange-800">
                      <strong>¿Sabías que...</strong> con nuestro sistema de backup automático, podrías reducir estas pérdidas a prácticamente 0€?
                    </p>
                  </div>
                  <Link href="/contacto" className="mt-4 block w-full px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-center">
                    Solicitar Auditoría Gratuita
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Otras Herramientas */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">Más herramientas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {herramientas.slice(1).map((herramienta, i) => (
                <Link key={i} href={herramienta.href}
                  className="group bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <div className="text-4xl mb-3">{herramienta.icono}</div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors">
                    {herramienta.titulo}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">{herramienta.descripcion}</p>
                  <span className="inline-flex items-center text-orange-600 font-semibold text-sm group-hover:text-orange-700">
                    Usar herramienta
                    <svg className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">¿Necesitas un análisis personalizado?</h2>
            <p className="text-gray-600 mb-8">
              Nuestro equipo técnico puede realizar un estudio completo de las necesidades de conectividad de tu empresa, sin compromiso.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contacto" className="px-8 py-4 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-bold text-lg">
                Solicitar Estudio Gratuito
              </Link>
              <a href="https://wa.me/34900730034" className="px-8 py-4 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-bold text-lg">
                Consultar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
