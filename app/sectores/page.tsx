"use client";
import Link from 'next/link';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

const sectores = [
  {
    titulo: 'Hostelería y Turismo',
    descripcion: 'WiFi de alta densidad, conectividad 24/7 y comunicaciones unificadas para hoteles, restaurantes y campings.',
    href: '/sectores/hosteleria-turismo',
    icono: '🏨',
    soluciones: ['WiFi empresarial', 'Conectividad con respaldo', 'Comunicaciones Unificadas']
  },
  {
    titulo: 'Retail y Comercio',
    descripcion: 'Conectividad multi-sede, gestión centralizada y soluciones móviles para cadenas de tiendas y franquicias.',
    href: '/sectores/retail-comercio',
    icono: '🛒',
    soluciones: ['MPLS multi-sede', 'Móviles empresariales', 'Mantenimiento IT']
  },
  {
    titulo: 'Industria y Logística',
    descripcion: 'Conexión crítica con respaldo, infraestructura de red robusta y backup de datos para fábricas y almacenes.',
    href: '/sectores/industria-logistica',
    icono: '🏭',
    soluciones: ['Conectividad avanzada', 'Infraestructura de red', 'ExaGrid backup']
  },
  {
    titulo: 'Sanidad',
    descripcion: 'Protección de datos sensibles, cumplimiento normativo y comunicaciones seguras para clínicas y hospitales.',
    href: '/sectores/sanidad',
    icono: '🏥',
    soluciones: ['ExaGrid (GDPR)', 'Seguridad de red', 'Comunicaciones Unificadas']
  },
  {
    titulo: 'Educación',
    descripcion: 'WiFi de alta densidad, aulas híbridas y plataformas de colaboración para colegios y universidades.',
    href: '/sectores/educacion',
    icono: '🎓',
    soluciones: ['WiFi alta densidad', 'Zoom/Teams', 'Mantenimiento IT']
  },
  {
    titulo: 'Servicios Profesionales',
    descripcion: 'Comunicaciones unificadas, movilidad y conectividad fiable para despachos, consultoras y asesorías.',
    href: '/sectores/servicios-profesionales',
    icono: '💼',
    soluciones: ['Comunicaciones Unificadas', 'Móviles empresariales', 'Conectividad']
  }
];

export default function SectoresPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="sectores" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">
              Soluciones verticales
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">
              Sectores
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
              Conocemos los retos específicos de cada industria. Ofrecemos soluciones adaptadas a las necesidades de tu sector con más de 25 años de experiencia.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">
                Solicitar Auditoría Gratuita
              </Link>
              <a href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20soluciones%20para%20mi%20sector" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">
                Contactar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Grid de Sectores */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {sectores.map((sector, index) => (
              <Link key={index} href={sector.href} className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-xl transition-all h-full">
                  <div className="text-4xl sm:text-5xl mb-4">{sector.icono}</div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 group-hover:text-orange-600 transition-colors">
                    {sector.titulo}
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 mb-4">
                    {sector.descripcion}
                  </p>
                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Soluciones destacadas:</p>
                    <div className="flex flex-wrap gap-2">
                      {sector.soluciones.map((sol, idx) => (
                        <span key={idx} className="text-xs bg-orange-50 text-orange-700 px-2 py-1 rounded-full">
                          {sol}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center text-orange-600 font-semibold text-sm group-hover:translate-x-2 transition-transform">
                    Ver soluciones
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Por qué elegirnos */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              ¿Por qué confiar en nosotros?
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Más de 25 años ayudando a empresas de todos los sectores a comunicarse mejor.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {[
              { valor: '+6.340', label: 'Clientes', desc: 'confían en nosotros' },
              { valor: '+25', label: 'Años', desc: 'de experiencia' },
              { valor: '24/7', label: 'Soporte', desc: 'técnico real' },
              { valor: '99.9%', label: 'Uptime', desc: 'garantizado' }
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-orange-600 mb-1">{stat.valor}</div>
                <div className="font-semibold text-gray-900">{stat.label}</div>
                <div className="text-xs sm:text-sm text-gray-500">{stat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">
              ¿No encuentras tu sector?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">
              Trabajamos con empresas de cualquier industria. Cuéntanos tu caso y diseñamos una solución a medida.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <Link href="/contacto" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">
                Contactar
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
