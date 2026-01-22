"use client";
import Link from 'next/link';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

const soluciones = [
  {
    id: 'comunicaciones-unificadas',
    titulo: 'Comunicaciones Unificadas',
    subtitulo: 'UCaaS - Wildix & Zoom',
    descripcion: 'Centralitas virtuales, videoconferencia, chat empresarial y colaboración en una sola plataforma. Soluciones adaptadas a cada empresa.',
    icono: (
      <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
    destacado: 'Partners Wildix & Zoom'
  },
  {
    id: 'conectividad-avanzada',
    titulo: 'Conectividad Avanzada',
    subtitulo: 'Respaldo, MPLS e Internacional',
    descripcion: 'Conexiones empresariales con alta disponibilidad, líneas de respaldo automático, MPLS para sedes y conectividad internacional.',
    icono: (
      <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    destacado: 'Failover automático'
  },
  {
    id: 'moviles',
    titulo: 'Soluciones Móviles',
    subtitulo: 'Tarifas de operador',
    descripcion: 'Tarifas móviles empresariales con las mejores condiciones. Flotas móviles, datos compartidos y gestión centralizada.',
    icono: (
      <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    destacado: 'Operador autorizado'
  },
  {
    id: 'infraestructura-red',
    titulo: 'Infraestructura de Red',
    subtitulo: 'Redes físicas y WiFi',
    descripcion: 'Diseño e implementación de redes empresariales. Especialistas en Ruckus con capacidad para trabajar con amplio portfolio de dispositivos.',
    icono: (
      <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
    destacado: 'Partner Ruckus'
  },
  {
    id: 'mantenimiento-it',
    titulo: 'Mantenimiento IT',
    subtitulo: 'Soporte y prevención',
    descripcion: 'Mantenimiento preventivo y correctivo de infraestructuras IT. Monitorización 24/7, helpdesk y respuesta ante incidentes.',
    icono: (
      <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    destacado: 'SLA garantizado'
  },
  {
    id: 'exagrid',
    titulo: 'ExaGrid',
    subtitulo: 'Backup empresarial',
    descripcion: 'Solución de backup y recuperación de datos de nivel enterprise. Protección contra ransomware y recuperación ultrarrápida.',
    icono: (
      <svg className="w-8 h-8 sm:w-10 sm:h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    destacado: 'Partner ExaGrid'
  },
];

export default function SolucionesPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soluciones" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 inline-block mr-1 sm:mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              Soluciones Empresariales
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">
              Tecnología que impulsa<br className="hidden sm:block"/>tu negocio
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
              Más de 25 años ayudando a empresas a comunicarse mejor, conectarse de forma segura y proteger sus datos. Soluciones adaptadas a cada necesidad, con soporte real y resultados medibles.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 mb-6 sm:mb-8 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">
                Solicitar Auditoría Gratuita
              </Link>
              <a href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20las%20soluciones%20de%20Internet%20Operadores" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">
                Contactar por WhatsApp
              </a>
            </div>
            <div className="flex flex-wrap justify-center gap-3 sm:gap-4 lg:gap-6 text-xs sm:text-sm text-gray-500">
              <span className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                +6.340 clientes
              </span>
              <span className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                +25 años experiencia
              </span>
              <span className="flex items-center gap-1 sm:gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                Soporte 24/7
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              Nuestras Soluciones
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Cada empresa es única. Por eso ofrecemos soluciones flexibles que se adaptan a tus necesidades específicas, sin atarte a un único fabricante.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8 max-w-6xl mx-auto">
            {soluciones.map((solucion) => (
              <Link 
                key={solucion.id}
                href={solucion.id === 'exagrid' ? '/exagrid' : `/soluciones/${solucion.id}`}
                className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all group"
              >
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-4 sm:mb-6 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  {solucion.icono}
                </div>
                <div className="inline-block bg-orange-50 text-orange-600 px-2 py-1 rounded text-xs font-semibold mb-3">
                  {solucion.destacado}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{solucion.titulo}</h3>
                <p className="text-xs sm:text-sm text-gray-500 mb-3">{solucion.subtitulo}</p>
                <p className="text-sm sm:text-base text-gray-600 mb-4">{solucion.descripcion}</p>
                <span className="text-orange-600 font-semibold text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                  Ver más información
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">
              Partners Tecnológicos
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Trabajamos con los mejores fabricantes para ofrecerte soluciones de calidad
            </p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 max-w-4xl mx-auto">
            <div className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">Wildix</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">Zoom</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">Ruckus</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">ExaGrid</div>
            <div className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">Microsoft</div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">
              ¿No sabes qué solución necesitas?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">
              Te ayudamos a identificar las mejores opciones para tu empresa. Solicita una auditoría gratuita y recibe un informe personalizado.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <Link href="/auditoria" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">
                Solicitar Auditoría Gratuita
              </Link>
              <a href="tel:+34655100400" className="inline-block px-8 py-4 sm:px-10 sm:py-5 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-base sm:text-lg">
                Llamar: 655 100 400
              </a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
