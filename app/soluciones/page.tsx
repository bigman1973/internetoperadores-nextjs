'use client';

import Link from 'next/link';
import Header from '../../components/Header';

const soluciones = [
  {
    id: 'comunicaciones-unificadas',
    titulo: 'Comunicaciones Unificadas',
    subtitulo: 'UCaaS - Wildix & Zoom',
    descripcion: 'Centralitas virtuales, videoconferencia, chat empresarial y colaboración en una sola plataforma. Soluciones adaptadas a cada empresa.',
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
      </svg>
    ),
    color: 'from-blue-500 to-indigo-600',
    stats: [
      { valor: '52%', label: 'más ventas web' },
      { valor: '25%', label: 'más eficiencia' },
    ],
    destacado: 'Partners oficiales Wildix & Zoom'
  },
  {
    id: 'conectividad-avanzada',
    titulo: 'Conectividad Avanzada',
    subtitulo: 'Respaldo, MPLS e Internacional',
    descripcion: 'Conexiones empresariales con alta disponibilidad, líneas de respaldo automático, MPLS para sedes y conectividad internacional.',
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    color: 'from-green-500 to-teal-600',
    stats: [
      { valor: '99.99%', label: 'disponibilidad' },
      { valor: '24/7', label: 'soporte' },
    ],
    destacado: 'Failover automático'
  },
  {
    id: 'moviles',
    titulo: 'Soluciones Móviles',
    subtitulo: 'Tarifas de operador',
    descripcion: 'Tarifas móviles empresariales con las mejores condiciones. Flotas móviles, datos compartidos y gestión centralizada.',
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    color: 'from-purple-500 to-pink-600',
    stats: [
      { valor: '100%', label: 'cobertura nacional' },
      { valor: 'Ilimitadas', label: 'llamadas' },
    ],
    destacado: 'Operador autorizado'
  },
  {
    id: 'infraestructura-red',
    titulo: 'Infraestructura de Red',
    subtitulo: 'Redes físicas y WiFi',
    descripcion: 'Diseño e implementación de redes empresariales. Especialistas en Ruckus con capacidad para trabajar con amplio portfolio de dispositivos.',
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
    color: 'from-orange-500 to-red-600',
    stats: [
      { valor: 'Ruckus', label: 'especialistas' },
      { valor: 'WiFi 6E', label: 'última generación' },
    ],
    destacado: 'Partner certificado Ruckus'
  },
  {
    id: 'mantenimiento-it',
    titulo: 'Mantenimiento IT',
    subtitulo: 'Soporte y prevención',
    descripcion: 'Mantenimiento preventivo y correctivo de infraestructuras IT. Monitorización 24/7, helpdesk y respuesta ante incidentes.',
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    color: 'from-gray-600 to-gray-800',
    stats: [
      { valor: '< 2h', label: 'tiempo respuesta' },
      { valor: '365', label: 'días al año' },
    ],
    destacado: 'SLA garantizado'
  },
  {
    id: 'exagrid',
    titulo: 'ExaGrid',
    subtitulo: 'Backup empresarial',
    descripcion: 'Solución de backup y recuperación de datos de nivel enterprise. Protección contra ransomware y recuperación ultrarrápida.',
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    color: 'from-cyan-500 to-blue-600',
    stats: [
      { valor: '10x', label: 'más rápido' },
      { valor: '100%', label: 'anti-ransomware' },
    ],
    destacado: 'Partner ExaGrid',
    enlace: '/exagrid'
  },
];

export default function SolucionesPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <span className="inline-block bg-orange-500/20 text-orange-400 px-4 py-1 rounded-full text-sm font-semibold mb-6">
              Soluciones Empresariales
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Transforma tu empresa con <span className="text-orange-500">tecnología que funciona</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Más de 25 años ayudando a empresas a comunicarse mejor, conectarse de forma segura y proteger sus datos. 
              Soluciones adaptadas a cada necesidad, con soporte real y resultados medibles.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20las%20soluciones%20de%20Internet%20Operadores"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-orange-500 text-white px-8 py-4 rounded-lg font-semibold hover:bg-orange-600 transition-colors inline-flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Contactar por WhatsApp
              </a>
              <Link 
                href="/cero-riesgos"
                className="bg-white/10 text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/20 transition-colors border border-white/20"
              >
                Solicitar auditoría gratuita
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-white py-12 border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">+6.340</div>
              <div className="text-gray-600">Clientes atendidos</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">+25</div>
              <div className="text-gray-600">Años de experiencia</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">24/7</div>
              <div className="text-gray-600">Soporte disponible</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">99.9%</div>
              <div className="text-gray-600">Disponibilidad</div>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Nuestras Soluciones
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Cada empresa es única. Por eso ofrecemos soluciones flexibles que se adaptan a tus necesidades específicas, 
              sin atarte a un único fabricante.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {soluciones.map((solucion) => (
              <Link 
                key={solucion.id}
                href={solucion.enlace || `/soluciones/${solucion.id}`}
                className="group bg-white rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-100"
              >
                {/* Card Header with Gradient */}
                <div className={`bg-gradient-to-r ${solucion.color} p-6 text-white`}>
                  <div className="flex items-start justify-between">
                    <div className="bg-white/20 p-3 rounded-xl">
                      {solucion.icono}
                    </div>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold">
                      {solucion.destacado}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold mt-4">{solucion.titulo}</h3>
                  <p className="text-white/80 text-sm">{solucion.subtitulo}</p>
                </div>

                {/* Card Body */}
                <div className="p-6">
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    {solucion.descripcion}
                  </p>

                  {/* Stats */}
                  <div className="flex gap-6 mb-6">
                    {solucion.stats.map((stat, index) => (
                      <div key={index}>
                        <div className="text-2xl font-bold text-gray-900">{stat.valor}</div>
                        <div className="text-sm text-gray-500">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="flex items-center text-orange-500 font-semibold group-hover:text-orange-600">
                    Ver más información
                    <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Partners Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Partners Tecnológicos
            </h2>
            <p className="text-gray-600">
              Trabajamos con los mejores fabricantes para ofrecerte soluciones de calidad
            </p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-70">
            <div className="text-2xl font-bold text-gray-400">Wildix</div>
            <div className="text-2xl font-bold text-gray-400">Zoom</div>
            <div className="text-2xl font-bold text-gray-400">Ruckus</div>
            <div className="text-2xl font-bold text-gray-400">ExaGrid</div>
            <div className="text-2xl font-bold text-gray-400">Microsoft</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-orange-500 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿No sabes qué solución necesitas?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Te ayudamos a identificar las mejores opciones para tu empresa. 
            Solicita una auditoría gratuita y recibe un informe personalizado.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/cero-riesgos"
              className="bg-white text-orange-500 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
            >
              Solicitar Informe Cero Riesgos
            </Link>
            <a 
              href="tel:+34655100400"
              className="bg-orange-600 text-white px-8 py-4 rounded-lg font-semibold hover:bg-orange-700 transition-colors border border-white/20"
            >
              Llamar ahora: 655 100 400
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <img src="/logo_transparent.png" alt="Internet Operadores" className="h-10 mb-4 brightness-0 invert" />
              <p className="text-gray-400 text-sm">
                Más de 25 años ofreciendo soluciones IT, seguridad y telecomunicaciones para empresas.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Soluciones</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/soluciones/comunicaciones-unificadas" className="hover:text-white">Comunicaciones Unificadas</Link></li>
                <li><Link href="/soluciones/conectividad-avanzada" className="hover:text-white">Conectividad Avanzada</Link></li>
                <li><Link href="/soluciones/moviles" className="hover:text-white">Soluciones Móviles</Link></li>
                <li><Link href="/soluciones/infraestructura-red" className="hover:text-white">Infraestructura de Red</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Empresa</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link href="/empresa" className="hover:text-white">Sobre nosotros</Link></li>
                <li><Link href="/cero-riesgos" className="hover:text-white">Informe Cero Riesgos</Link></li>
                <li><Link href="/exagrid" className="hover:text-white">ExaGrid</Link></li>
                <li><Link href="/fansaticos" className="hover:text-white">Fansáticos</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Contacto</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li>Paseo De La Habana 26 1-1</li>
                <li>28036, Madrid. España</li>
                <li><a href="tel:+34655100400" className="hover:text-white">655 100 400</a></li>
                <li><a href="mailto:david.perez@internetoperadores.com" className="hover:text-white">david.perez@internetoperadores.com</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
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
