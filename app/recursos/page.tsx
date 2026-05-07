"use client";
import Link from 'next/link';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

const categorias = [
  { 
    titulo: 'Blog', 
    descripcion: 'Artículos sobre tecnología, tendencias y novedades del sector de telecomunicaciones empresariales.',
    href: '/recursos/blog',
    icono: '📝',
    items: 6
  },
  { 
    titulo: 'Casos de Éxito', 
    descripcion: 'Historias reales de empresas que han transformado sus comunicaciones con nuestras soluciones.',
    href: '/recursos/casos-exito',
    icono: '🏆',
    items: 5
  },
  { 
    titulo: 'Guías y Whitepapers', 
    descripcion: 'Documentos técnicos y guías descargables para tomar mejores decisiones tecnológicas.',
    href: '/recursos/guias',
    icono: '📚',
    items: 5,
    destacado: true
  },
  { 
    titulo: 'Webinars y Demos', 
    descripcion: 'Seminarios web grabados y demostraciones de nuestras soluciones en acción.',
    href: '/recursos/webinars',
    icono: '🎥',
    items: 5
  },
  { 
    titulo: 'FAQ y Tutoriales', 
    descripcion: 'Respuestas a las preguntas más frecuentes y tutoriales paso a paso.',
    href: '/recursos/faq',
    icono: '❓',
    items: 6
  },
  { 
    titulo: 'Herramientas', 
    descripcion: 'Calculadoras, tests y herramientas útiles para evaluar tus necesidades.',
    href: '/recursos/herramientas',
    icono: '🔧',
    items: 5
  }
];

const recursosDestacados = [
  {
    tipo: 'GUÍA ESTRELLA',
    titulo: 'Guía de Conectividad Empresarial 2026',
    descripcion: 'Todo lo que necesitas saber para garantizar la conexión de tu empresa: tecnologías, backup, seguridad y mejores prácticas.',
    href: '/recursos/guias/conectividad-empresarial',
    destacado: true
  },
  {
    tipo: 'CASO DE ÉXITO',
    titulo: 'Hotel Costa Brava: WiFi para 500 huéspedes',
    descripcion: 'Cómo implementamos una red WiFi de alta densidad que soporta 500 dispositivos simultáneos.',
    href: '/recursos/casos-exito/hotel-costa-brava'
  },
  {
    tipo: 'WEBINAR',
    titulo: 'Demo: Backup automático de conexión',
    descripcion: 'Descubre cómo funciona nuestro sistema de failover automático que garantiza conexión 24/7.',
    href: '/recursos/webinars/demo-backup-automatico'
  }
];

const articulosRecientes = [
  { titulo: '5 señales de que tu empresa necesita una conexión de respaldo', fecha: '15 Ene 2026', categoria: 'Blog' },
  { titulo: 'Cómo elegir entre Teams, Zoom y Wildix para tu negocio', fecha: '12 Ene 2026', categoria: 'Blog' },
  { titulo: 'Calculadora: ¿Cuánto pierdes por hora sin internet?', fecha: '10 Ene 2026', categoria: 'Herramientas' },
  { titulo: 'Tutorial: Primeros pasos con tu centralita Wildix', fecha: '8 Ene 2026', categoria: 'Tutoriales' }
];

export default function RecursosPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">
              Centro de Recursos
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
              Guías, casos de éxito, webinars y herramientas para ayudarte a tomar las mejores decisiones tecnológicas para tu empresa.
            </p>
          </div>
        </div>
      </section>

      {/* Recurso Destacado - Guía Estrella */}
      <section className="py-8 sm:py-12 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xl">
              <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 items-center">
                <div className="flex-1">
                  <span className="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold mb-3">
                    📚 GUÍA ESTRELLA - DESCARGA GRATUITA
                  </span>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
                    Guía de Conectividad Empresarial 2026
                  </h2>
                  <p className="text-sm sm:text-base lg:text-lg text-gray-600 mb-4 sm:mb-6">
                    Todo lo que necesitas saber para garantizar la conexión de tu empresa: tecnologías disponibles, sistemas de backup, seguridad de red y mejores prácticas. Más de 50 páginas de contenido práctico.
                  </p>
                  <div className="flex flex-wrap gap-3 sm:gap-4 mb-4 sm:mb-6">
                    <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500">
                      <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      50+ páginas
                    </span>
                    <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500">
                      <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      Checklist incluido
                    </span>
                    <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500">
                      <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      Casos reales
                    </span>
                  </div>
                  <Link href="/recursos/guias/conectividad-empresarial" className="inline-block px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm sm:text-base">
                    Descargar Guía Gratuita
                  </Link>
                </div>
                <div className="w-full lg:w-auto">
                  <div className="bg-gradient-to-br from-orange-100 to-orange-200 rounded-xl p-8 sm:p-10 text-center">
                    <div className="text-6xl sm:text-7xl mb-2">📖</div>
                    <p className="text-sm text-gray-700 font-medium">PDF Descargable</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categorías de Recursos */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Explora por categoría
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Encuentra el contenido que necesitas organizado por tipo de recurso.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 max-w-6xl mx-auto">
            {categorias.map((cat, i) => (
              <Link 
                key={i} 
                href={cat.href}
                className={`bg-white border-2 rounded-xl p-6 hover:shadow-lg transition-all group ${cat.destacado ? 'border-orange-500' : 'border-gray-200 hover:border-orange-500'}`}
              >
                <div className="text-4xl mb-4">{cat.icono}</div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors">
                  {cat.titulo}
                </h3>
                <p className="text-sm text-gray-600 mb-4">{cat.descripcion}</p>
                <span className="text-xs text-orange-600 font-semibold">{cat.items} recursos disponibles →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Recursos Destacados */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
              Recursos destacados
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {recursosDestacados.map((recurso, i) => (
              <Link 
                key={i}
                href={recurso.href}
                className={`bg-white rounded-xl p-6 hover:shadow-lg transition-all border-2 ${recurso.destacado ? 'border-orange-500' : 'border-gray-200'}`}
              >
                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-3 ${recurso.destacado ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'}`}>
                  {recurso.tipo}
                </span>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{recurso.titulo}</h3>
                <p className="text-sm text-gray-600">{recurso.descripcion}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Artículos Recientes */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">Últimas publicaciones</h2>
              <Link href="/recursos/blog" className="text-orange-600 font-semibold hover:text-orange-700 text-sm sm:text-base">
                Ver todo →
              </Link>
            </div>
            <div className="space-y-4">
              {articulosRecientes.map((articulo, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-orange-50 transition-colors">
                  <div>
                    <span className="text-xs text-orange-600 font-semibold">{articulo.categoria}</span>
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900">{articulo.titulo}</h3>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap ml-4">{articulo.fecha}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Newsletter */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">
              Mantente al día
            </h2>
            <p className="text-base sm:text-lg text-gray-300 mb-6 sm:mb-8">
              Suscríbete a nuestra newsletter y recibe las últimas guías, casos de éxito y novedades del sector.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <input 
                type="email" 
                placeholder="Tu email empresarial" 
                className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">
                Suscribirme
              </button>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
