'use client';

import Link from 'next/link';
import Header from '../../../components/Header';

const ventajas = [
  {
    titulo: 'Cobertura Nacional',
    descripcion: 'Acceso a las mejores redes móviles de España con cobertura 4G/5G en todo el territorio.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    titulo: 'Factura Única',
    descripcion: 'Consolida todas las líneas de tu empresa en una sola factura. Simplifica la gestión administrativa.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    titulo: 'Gestión Centralizada',
    descripcion: 'Panel de control para gestionar todas las líneas, consumos y configuraciones desde un solo lugar.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    titulo: 'Soporte Dedicado',
    descripcion: 'Un gestor de cuenta dedicado para resolver cualquier incidencia o consulta de forma ágil.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    titulo: 'Datos Compartidos',
    descripcion: 'Comparte los datos entre todas las líneas de tu empresa. Optimiza el consumo y reduce costes.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    titulo: 'Roaming Internacional',
    descripcion: 'Tarifas especiales para viajes de empresa. Mantén la comunicación sin sorpresas en la factura.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
  },
];

const serviciosAdicionales = [
  'Portabilidad gratuita',
  'Terminales financiados',
  'MDM (Mobile Device Management)',
  'Líneas de datos M2M/IoT',
  'Centralita virtual integrada',
  'Numeración especial (900, 902...)',
];

export default function MovilesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-purple-600 via-pink-500 to-rose-500 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl">
            <Link href="/soluciones" className="inline-flex items-center text-white/80 hover:text-white mb-6">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Soluciones
            </Link>
            <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-6">
              Operador autorizado
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Soluciones Móviles
            </h1>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Tarifas móviles empresariales con las mejores condiciones del mercado. 
              Llamadas ilimitadas, datos generosos y gestión centralizada para tu flota móvil.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20tarifas%20móviles%20para%20empresas"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-purple-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
              >
                Solicitar oferta personalizada
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

      {/* Stats */}
      <section className="py-12 bg-white border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-purple-600 mb-2">100%</div>
              <div className="text-gray-600">Cobertura nacional</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600 mb-2">4G/5G</div>
              <div className="text-gray-600">Última tecnología</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600 mb-2">Ilimitadas</div>
              <div className="text-gray-600">Llamadas nacionales</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-purple-600 mb-2">24/7</div>
              <div className="text-gray-600">Soporte dedicado</div>
            </div>
          </div>
        </div>
      </section>

      {/* Advantages */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Ventajas de nuestras tarifas móviles
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Más que un operador, un partner tecnológico que entiende las necesidades de tu empresa.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {ventajas.map((ventaja, index) => (
              <div 
                key={index}
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="text-purple-600 mb-4">
                  {ventaja.icono}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {ventaja.titulo}
                </h3>
                <p className="text-gray-600">
                  {ventaja.descripcion}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Teaser */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Tarifas adaptadas a cada empresa
            </h2>
            <p className="text-xl text-gray-600 mb-8">
              Cada empresa tiene necesidades diferentes. Por eso, diseñamos ofertas personalizadas 
              basadas en el número de líneas, consumo de datos y servicios adicionales que necesites.
            </p>
            
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-8 md:p-12">
              <div className="text-purple-600 font-semibold mb-2">Ejemplo de tarifa empresarial</div>
              <div className="text-5xl font-bold text-gray-900 mb-4">Desde 12€<span className="text-xl font-normal text-gray-500">/línea/mes</span></div>
              <ul className="text-gray-600 space-y-2 mb-8">
                <li>✓ Llamadas ilimitadas nacionales</li>
                <li>✓ 20GB de datos 4G/5G</li>
                <li>✓ Roaming UE incluido</li>
                <li>✓ Gestión centralizada</li>
              </ul>
              <p className="text-sm text-gray-500 mb-6">
                *Precio orientativo para flotas de +10 líneas. Consulta tu oferta personalizada.
              </p>
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20una%20oferta%20personalizada%20de%20tarifas%20móviles"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-purple-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
              >
                Solicitar oferta personalizada
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Additional Services */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
              Servicios adicionales
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {serviciosAdicionales.map((servicio, index) => (
                <div key={index} className="bg-white p-4 rounded-lg flex items-center">
                  <svg className="w-5 h-5 text-purple-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">{servicio}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-purple-600 to-pink-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Quieres reducir tu factura móvil?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Analizamos tu consumo actual y te proponemos la mejor tarifa para tu empresa. 
            Sin compromiso y con portabilidad gratuita.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://wa.me/34655100400?text=Hola,%20quiero%20que%20analicéis%20mi%20factura%20móvil%20actual"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-purple-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Solicitar análisis gratuito
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
