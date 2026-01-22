'use client';

import Link from 'next/link';
import Header from '../../../components/Header';

const soluciones = [
  {
    titulo: 'Conexión con Respaldo Automático',
    descripcion: 'Línea principal de fibra con backup 4G/5G que se activa automáticamente en caso de caída. Continuidad garantizada.',
    caracteristicas: ['Failover automático en segundos', 'Sin intervención manual', 'Monitorización 24/7', 'SLA garantizado'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    titulo: 'MPLS - Red Privada Multi-sede',
    descripcion: 'Conecta todas tus sedes con una red privada de alto rendimiento. Tráfico seguro y priorizado entre oficinas.',
    caracteristicas: ['Latencia mínima garantizada', 'QoS para voz y vídeo', 'Escalable según necesidades', 'Gestión centralizada'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
  },
  {
    titulo: 'Conectividad Internacional',
    descripcion: 'Soluciones para empresas con presencia global. Conexiones dedicadas, SD-WAN y acceso a clouds internacionales.',
    caracteristicas: ['Presencia en 100+ países', 'Conexión directa a AWS/Azure/GCP', 'SD-WAN gestionado', 'Soporte multiidioma'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
  {
    titulo: 'Fibra Dedicada Empresarial',
    descripcion: 'Conexiones simétricas de alta capacidad con ancho de banda garantizado. Ideal para empresas con alto consumo de datos.',
    caracteristicas: ['Simétrica hasta 10 Gbps', 'Ancho de banda garantizado', 'IP fija incluida', 'Sin compartición'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
];

const beneficios = [
  {
    valor: '99.99%',
    label: 'Disponibilidad',
    descripcion: 'Con línea de respaldo activa'
  },
  {
    valor: '< 50ms',
    label: 'Latencia MPLS',
    descripcion: 'Entre sedes conectadas'
  },
  {
    valor: '24/7',
    label: 'Monitorización',
    descripcion: 'Centro de operaciones propio'
  },
  {
    valor: '< 4h',
    label: 'Tiempo respuesta',
    descripcion: 'Ante incidencias críticas'
  },
];

export default function ConectividadAvanzadaPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-green-600 via-teal-600 to-cyan-700 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl">
            <Link href="/soluciones" className="inline-flex items-center text-white/80 hover:text-white mb-6">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Soluciones
            </Link>
            <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-6">
              Alta disponibilidad garantizada
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Conectividad Avanzada
            </h1>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Conexiones empresariales con respaldo automático, MPLS para multi-sede y conectividad internacional. 
              Tu negocio siempre conectado, sin interrupciones.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Conectividad%20Avanzada"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-teal-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
              >
                Solicitar estudio personalizado
              </a>
              <a 
                href="tel:+34655100400"
                className="bg-white/10 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/20 transition-colors border border-white/20 text-center"
              >
                Llamar: 655 100 400
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Stats */}
      <section className="py-12 bg-white border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {beneficios.map((beneficio, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl font-bold text-teal-600 mb-2">{beneficio.valor}</div>
                <div className="font-semibold text-gray-900 mb-1">{beneficio.label}</div>
                <div className="text-sm text-gray-500">{beneficio.descripcion}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              ¿Cuánto te cuesta una caída de conexión?
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Una hora sin internet puede significar miles de euros en pérdidas: ventas no realizadas, 
              empleados parados, clientes insatisfechos y daño reputacional.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 inline-block">
              <div className="text-4xl font-bold text-red-600 mb-2">-23.508€</div>
              <div className="text-gray-600">Pérdida media anual por caídas de conexión en una PYME</div>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Soluciones de conectividad empresarial
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Diseñamos la arquitectura de red que tu empresa necesita, con redundancia y escalabilidad.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {soluciones.map((solucion, index) => (
              <div 
                key={index}
                className="bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-xl transition-shadow"
              >
                <div className="text-teal-600 mb-4">
                  {solucion.icono}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  {solucion.titulo}
                </h3>
                <p className="text-gray-600 mb-6">
                  {solucion.descripcion}
                </p>
                <ul className="space-y-2">
                  {solucion.caracteristicas.map((caracteristica, idx) => (
                    <li key={idx} className="flex items-center text-gray-600">
                      <svg className="w-5 h-5 text-teal-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {caracteristica}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 bg-gradient-to-r from-teal-50 to-cyan-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              ¿Cómo funciona el respaldo automático?
            </h2>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-teal-600 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">1</div>
                <h3 className="font-bold text-gray-900 mb-2">Monitorización continua</h3>
                <p className="text-gray-600 text-sm">Nuestros sistemas vigilan tu conexión principal 24/7 detectando cualquier anomalía.</p>
              </div>
              <div className="text-center">
                <div className="bg-teal-600 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">2</div>
                <h3 className="font-bold text-gray-900 mb-2">Detección de caída</h3>
                <p className="text-gray-600 text-sm">En cuanto se detecta una interrupción, el sistema activa automáticamente la línea de respaldo.</p>
              </div>
              <div className="text-center">
                <div className="bg-teal-600 text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">3</div>
                <h3 className="font-bold text-gray-900 mb-2">Continuidad garantizada</h3>
                <p className="text-gray-600 text-sm">Tu empresa sigue operando sin interrupción mientras se resuelve la incidencia principal.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-teal-600 to-cyan-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Necesitas una conexión que nunca falle?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Analizamos tu infraestructura actual y diseñamos la solución de conectividad 
            que garantice la continuidad de tu negocio.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://wa.me/34655100400?text=Hola,%20necesito%20un%20estudio%20de%20conectividad%20para%20mi%20empresa"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-teal-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Solicitar estudio gratuito
            </a>
            <a 
              href="tel:+34655100400"
              className="bg-white/10 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/20 transition-colors border border-white/20"
            >
              Llamar: 655 100 400
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="text-center text-gray-400 text-sm">
            <p>© {new Date().getFullYear()} Internet Operadores. Todos los derechos reservados.</p>
            <div className="flex justify-center gap-4 mt-2">
              <Link href="/politica-privacidad" className="hover:text-white">Política de Privacidad</Link>
              <Link href="/politica-cookies" className="hover:text-white">Política de Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
