"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const articulos = [
  {
    slug: 'conexion-respaldo-senales',
    titulo: '5 señales de que tu empresa necesita una conexión de respaldo (y cuánto te cuesta no tenerla)',
    extracto: 'Descubre los indicadores clave que te dicen que es hora de implementar un sistema de backup de conexión para garantizar la continuidad de tu negocio. El coste de una caída puede superar los 300.000€ por hora.',
    fecha: '18 Diciembre 2025',
    categoria: 'Conectividad',
    tiempo: '7 min lectura',
    destacado: true
  },
  {
    slug: 'teams-vs-zoom-vs-wildix',
    titulo: 'Teams vs. Zoom vs. Wildix: ¿Qué solución de Comunicaciones Unificadas es mejor para tu empresa?',
    extracto: 'Análisis comparativo de las tres principales plataformas de comunicaciones unificadas. Te ayudamos a elegir la mejor opción según tu caso de uso y necesidades.',
    fecha: '25 Diciembre 2025',
    categoria: 'Comunicaciones Unificadas',
    tiempo: '8 min lectura'
  },
  {
    slug: 'wifi-empresarial-guia',
    titulo: 'Guía definitiva de WiFi empresarial: Más allá del router doméstico',
    extracto: 'Todo sobre redes WiFi para empresas: tecnologías como Ruckus BeamFlex+, estándares WiFi 6E, densidad de usuarios, seguridad y mejores prácticas de implementación.',
    fecha: '1 Enero 2026',
    categoria: 'Infraestructura',
    tiempo: '9 min lectura'
  },
  {
    slug: 'mpls-vs-sdwan',
    titulo: 'MPLS vs. SD-WAN: La batalla por el futuro de la red empresarial',
    extracto: 'Comparativa técnica entre MPLS y SD-WAN. Ventajas, desventajas y casos de uso para ayudarte a decidir qué tecnología se adapta mejor a tu red multi-sede.',
    fecha: '8 Enero 2026',
    categoria: 'Conectividad',
    tiempo: '8 min lectura'
  },
  {
    slug: 'tendencias-comunicaciones-2026',
    titulo: 'El futuro es ahora: 5 tendencias en Comunicaciones Unificadas que marcarán 2026',
    extracto: 'Las principales tendencias que marcarán el sector de las comunicaciones empresariales este año: IA proactiva, convergencia UCaaS/CCaaS, verticalización y más.',
    fecha: '15 Enero 2026',
    categoria: 'Tendencias',
    tiempo: '8 min lectura'
  },
  {
    slug: 'ransomware-exagrid',
    titulo: 'Ransomware: Por qué tu backup tradicional no es suficiente y cómo ExaGrid cambia las reglas del juego',
    extracto: 'El ransomware es una amenaza real para las empresas. Descubre cómo la tecnología Retention Time-Lock de ExaGrid puede salvarte de un desastre.',
    fecha: '22 Enero 2026',
    categoria: 'Seguridad',
    tiempo: '8 min lectura'
  }
];

const categorias = ['Todos', 'Conectividad', 'Comunicaciones Unificadas', 'Infraestructura', 'Seguridad', 'Tendencias'];

export default function BlogPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/recursos" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Recursos
            </Link>
            <div className="text-5xl mb-4">📝</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">Blog</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Artículos sobre tecnología, tendencias y novedades del sector de telecomunicaciones empresariales.
            </p>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="py-6 bg-white border-b">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap gap-2 justify-center">
            {categorias.map((cat, i) => (
              <button 
                key={i}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${i === 0 ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-orange-100 hover:text-orange-700'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Artículos */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {articulos.map((articulo, i) => (
              <Link href={`/recursos/blog/${articulo.slug}`} key={i}>
                <article 
                  className={`bg-white border-2 rounded-xl p-6 sm:p-8 hover:shadow-lg transition-all cursor-pointer ${articulo.destacado ? 'border-orange-500' : 'border-gray-200 hover:border-orange-500'}`}
                >
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className="inline-block bg-orange-100 text-orange-700 px-2 py-1 rounded text-xs font-semibold">
                      {articulo.categoria}
                    </span>
                    {articulo.destacado && (
                      <span className="inline-block bg-gray-900 text-white px-2 py-1 rounded text-xs font-semibold">
                        DESTACADO
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 hover:text-orange-600 transition-colors">
                    {articulo.titulo}
                  </h2>
                  <p className="text-sm sm:text-base text-gray-600 mb-4">{articulo.extracto}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-500">
                      <span>{articulo.fecha}</span>
                      <span>•</span>
                      <span>{articulo.tiempo}</span>
                    </div>
                    <span className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                      Leer más →
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
