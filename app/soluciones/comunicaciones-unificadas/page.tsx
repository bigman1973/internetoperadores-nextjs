'use client';

import Link from 'next/link';
import Header from '../../../components/Header';

const caracteristicas = [
  {
    titulo: 'Centralita Virtual en la Nube',
    descripcion: 'Sistema telefónico empresarial completo sin hardware. Llamadas, extensiones, IVR y más desde cualquier dispositivo.',
    icono: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    titulo: 'Videoconferencia HD',
    descripcion: 'Reuniones de alta calidad con Zoom integrado. Webinars, salas virtuales y grabación automática.',
    icono: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    titulo: 'Chat y Colaboración',
    descripcion: 'Mensajería instantánea empresarial, compartición de archivos y espacios de trabajo colaborativos.',
    icono: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    titulo: 'Integración CRM',
    descripcion: 'Conexión nativa con Salesforce, HubSpot, Microsoft Dynamics y más. Click-to-call y registro automático.',
    icono: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
    ),
  },
  {
    titulo: 'Movilidad Total',
    descripcion: 'Apps para iOS y Android. Trabaja desde cualquier lugar con la misma extensión y funcionalidades.',
    icono: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    titulo: 'Analíticas y Reporting',
    descripcion: 'Dashboards en tiempo real, informes de llamadas, métricas de productividad y calidad de servicio.',
    icono: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

const beneficios = [
  {
    valor: '52%',
    label: 'Más ventas web',
    descripcion: 'Los visitantes pueden llamarte con un clic desde tu web'
  },
  {
    valor: '25%',
    label: 'Más eficiencia',
    descripcion: 'Una sola plataforma para todas las comunicaciones'
  },
  {
    valor: '2h+',
    label: 'Ahorro diario',
    descripcion: 'Elimina el cambio entre aplicaciones'
  },
  {
    valor: '100%',
    label: 'Seguridad',
    descripcion: 'Cifrado de extremo a extremo incluido'
  },
];

const casosUso = [
  {
    sector: 'Despachos profesionales',
    descripcion: 'Abogados, consultores y asesores que necesitan comunicación profesional y registro de llamadas.',
    beneficio: 'Grabación de llamadas y transcripción automática'
  },
  {
    sector: 'Empresas con teletrabajo',
    descripcion: 'Equipos distribuidos que necesitan colaborar como si estuvieran en la misma oficina.',
    beneficio: 'Extensiones móviles y presencia en tiempo real'
  },
  {
    sector: 'Atención al cliente',
    descripcion: 'Contact centers y equipos de soporte que gestionan alto volumen de llamadas.',
    beneficio: 'Colas de llamadas, IVR y métricas de servicio'
  },
  {
    sector: 'Empresas multi-sede',
    descripcion: 'Organizaciones con varias oficinas que necesitan comunicación unificada.',
    beneficio: 'Extensiones cortas entre sedes sin coste'
  },
];

export default function ComunicacionesUnificadasPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl">
            <Link href="/soluciones" className="inline-flex items-center text-white/80 hover:text-white mb-6">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Soluciones
            </Link>
            <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-6">
              Partners oficiales Wildix & Zoom
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Comunicaciones Unificadas
            </h1>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Centralita virtual, videoconferencia, chat y colaboración en una sola plataforma. 
              Soluciones de Wildix y Zoom adaptadas a las necesidades de cada empresa.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Comunicaciones%20Unificadas"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
              >
                Solicitar demo gratuita
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
                <div className="text-4xl font-bold text-indigo-600 mb-2">{beneficio.valor}</div>
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
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 text-center">
              ¿Tu empresa pierde oportunidades por mala comunicación?
            </h2>
            <div className="grid md:grid-cols-2 gap-8 mt-12">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-red-100">
                <div className="text-red-500 font-semibold mb-4">❌ Sin UCaaS</div>
                <ul className="space-y-3 text-gray-600">
                  <li>• Llamadas perdidas que van a la competencia</li>
                  <li>• Múltiples apps desconectadas</li>
                  <li>• Sin visibilidad de quién está disponible</li>
                  <li>• Clientes que no pueden contactarte fácilmente</li>
                  <li>• Costes elevados de telefonía tradicional</li>
                </ul>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-sm border border-green-100">
                <div className="text-green-500 font-semibold mb-4">✓ Con UCaaS</div>
                <ul className="space-y-3 text-gray-600">
                  <li>• Click-to-call desde tu web en 3 segundos</li>
                  <li>• Una sola plataforma para todo</li>
                  <li>• Presencia en tiempo real del equipo</li>
                  <li>• Múltiples canales de contacto integrados</li>
                  <li>• Ahorro del 30-50% en comunicaciones</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas en una plataforma
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Funcionalidades empresariales que transforman la forma en que tu equipo se comunica y colabora.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {caracteristicas.map((caracteristica, index) => (
              <div 
                key={index}
                className="bg-gray-50 p-6 rounded-xl hover:shadow-lg transition-shadow"
              >
                <div className="text-indigo-600 mb-4">
                  {caracteristica.icono}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {caracteristica.titulo}
                </h3>
                <p className="text-gray-600">
                  {caracteristica.descripcion}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-16 bg-gradient-to-r from-indigo-50 to-purple-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Trabajamos con los líderes del mercado
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Como partners oficiales de Wildix y Zoom, te ofrecemos las mejores soluciones del mercado 
              con soporte local y precios competitivos.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-sm">
              <div className="text-3xl font-bold text-blue-600 mb-4">Wildix</div>
              <p className="text-gray-600 mb-4">
                Primera solución UCaaS orientada a ventas. WebRTC nativo para comunicación 
                instantánea desde la web. 5 años en el Gartner Magic Quadrant.
              </p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>✓ Click-to-call desde web</li>
                <li>✓ Wilma AI - Asistente virtual</li>
                <li>✓ Seguridad by design</li>
              </ul>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm">
              <div className="text-3xl font-bold text-blue-500 mb-4">Zoom</div>
              <p className="text-gray-600 mb-4">
                La plataforma de videoconferencia más utilizada del mundo. Zoom Phone, 
                Meetings, Webinars y Contact Center en una sola solución.
              </p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>✓ Zoom Workplace con AI Companion</li>
                <li>✓ Hasta 1000 participantes</li>
                <li>✓ Integraciones con 2000+ apps</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Soluciones para cada sector
            </h2>
            <p className="text-xl text-gray-600">
              Adaptamos la tecnología a las necesidades específicas de tu negocio
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {casosUso.map((caso, index) => (
              <div 
                key={index}
                className="border border-gray-200 rounded-xl p-6 hover:border-indigo-300 transition-colors"
              >
                <h3 className="text-xl font-bold text-gray-900 mb-2">{caso.sector}</h3>
                <p className="text-gray-600 mb-4">{caso.descripcion}</p>
                <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium">
                  {caso.beneficio}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-indigo-600 to-purple-600 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Listo para transformar tus comunicaciones?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Solicita una demo gratuita y descubre cómo las comunicaciones unificadas 
            pueden impulsar la productividad de tu empresa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://wa.me/34655100400?text=Hola,%20quiero%20una%20demo%20de%20Comunicaciones%20Unificadas"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-indigo-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Solicitar demo por WhatsApp
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
