"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const casos = [
  {
    slug: 'industria-automocion',
    sector: 'Industria',
    titulo: 'Transformación digital de fábrica de componentes de automoción',
    descripcion: 'Fabricante multinacional con sedes en Europa, Centroamérica y Asia. Cada centro tiene más de 10 robots industriales donde un solo robot supera los 10 millones de euros. Consultoría, WiFi Ruckus y SD-WAN con SLA 99,9%.',
    resultados: ['0 incidencias críticas', 'SLA 99,9%', 'Red industrial certificada'],
    soluciones: ['Infraestructura de Red', 'WiFi Ruckus', 'SD-WAN'],
    imagen: '/images/casos-exito/industria-automocion.jpg',
    destacado: true
  },
  {
    slug: 'hosteleria-hotel',
    sector: 'Hostelería',
    titulo: 'WiFi de alta densidad para hotel de 200 habitaciones',
    descripcion: 'Implementación de red WiFi profesional con puntos de acceso Ruckus que soporta más de 800 dispositivos simultáneos sin degradación de servicio, cubriendo habitaciones, zonas comunes y áreas de eventos.',
    resultados: ['800+ dispositivos simultáneos', '99.9% uptime', 'Satisfacción huéspedes +35%'],
    soluciones: ['Infraestructura de Red', 'WiFi Ruckus'],
    imagen: '/images/casos-exito/hosteleria-hotel.jpg',
    destacado: false
  },
  {
    slug: 'retail-cadena',
    sector: 'Retail',
    titulo: 'Conectividad unificada para cadena de 25 tiendas con SD-WAN',
    descripcion: 'Unificación de la conectividad de 25 tiendas bajo una única plataforma SD-WAN, eliminando 8 proveedores diferentes y garantizando conexión de respaldo automática para TPVs y ERP.',
    resultados: ['-35% costes conectividad', '99,9% disponibilidad', '1 único interlocutor'],
    soluciones: ['SD-WAN', 'Conectividad Avanzada', '4G/5G Backup'],
    imagen: '/images/casos-exito/retail-tiendas.jpg',
    destacado: false
  },
  {
    slug: 'sector-publico-sanidad',
    sector: 'Sector Público',
    titulo: 'Protección de datos sanitarios con ExaGrid',
    descripcion: 'Implementación de ExaGrid con Retention Time-Lock para una administración pública del sector sanitario tras sufrir un ciberataque con robo de datos. Proyecto en fase de implementación.',
    resultados: ['Protección anti-ransomware', 'RTO <2 horas', 'Cumplimiento ENS Alto'],
    soluciones: ['ExaGrid', 'Backup Empresarial', 'Ciberseguridad'],
    imagen: '/images/casos-exito/sector-publico-sanidad.jpg',
    destacado: true,
    enCurso: true
  },
  {
    slug: 'servicios-profesionales',
    sector: 'Servicios Profesionales',
    titulo: 'Comunicaciones unificadas con Wildix para despacho multisede',
    descripcion: 'Implementación de Wildix para unificar las comunicaciones de un despacho de abogados con 4 oficinas, integrando voz, vídeo, chat y CRM jurídico en una única plataforma.',
    resultados: ['1 número para 4 oficinas', '-40% costes telefonía', '+25% satisfacción clientes'],
    soluciones: ['Comunicaciones Unificadas', 'Wildix', 'UCaaS'],
    imagen: '/images/casos-exito/servicios-profesionales.jpg',
    destacado: false
  }
];

export default function CasosExitoPage() {
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
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">Casos de Éxito</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Historias reales de empresas que han transformado sus comunicaciones e infraestructura con nuestras soluciones. 
              Por confidencialidad, no publicamos nombres; referencias disponibles bajo petición.
            </p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-8 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto text-center">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white">+6.340</div>
              <div className="text-xs sm:text-sm text-orange-100">Clientes satisfechos</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white">99.9%</div>
              <div className="text-xs sm:text-sm text-orange-100">Uptime garantizado</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white">+25</div>
              <div className="text-xs sm:text-sm text-orange-100">Años de experiencia</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-white">24/7</div>
              <div className="text-xs sm:text-sm text-orange-100">Soporte técnico</div>
            </div>
          </div>
        </div>
      </section>

      {/* Casos */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto space-y-8">
            {casos.map((caso, i) => (
              <Link 
                key={i} 
                href={`/recursos/casos-exito/${caso.slug}`}
                className="block"
              >
                <article 
                  className={`bg-white border-2 rounded-xl overflow-hidden hover:shadow-lg transition-all ${caso.destacado ? 'border-orange-500' : 'border-gray-200'}`}
                >
                  <div className="flex flex-col lg:flex-row">
                    {/* Imagen */}
                    <div className="lg:w-80 h-48 lg:h-auto relative flex-shrink-0">
                      <img 
                        src={caso.imagen} 
                        alt={caso.titulo}
                        className="w-full h-full object-cover"
                      />
                      {caso.enCurso && (
                        <div className="absolute top-3 left-3 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                          En implementación
                        </div>
                      )}
                    </div>
                    
                    {/* Contenido */}
                    <div className="flex-1 p-6 sm:p-8">
                      <div className="flex flex-wrap items-center gap-2 mb-4">
                        <span className="inline-block bg-gray-800 text-white px-3 py-1 rounded-full text-xs font-semibold">
                          {caso.sector}
                        </span>
                        {caso.destacado && (
                          <span className="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold">
                            DESTACADO
                          </span>
                        )}
                      </div>
                      
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 group-hover:text-orange-600 transition-colors">
                        {caso.titulo}
                      </h2>
                      <p className="text-sm sm:text-base text-gray-600 mb-4">{caso.descripcion}</p>
                      
                      <div className="flex flex-wrap gap-2 mb-4">
                        {caso.soluciones.map((sol, j) => (
                          <span key={j} className="inline-block bg-orange-50 text-orange-700 px-2 py-1 rounded text-xs">
                            {sol}
                          </span>
                        ))}
                      </div>
                      
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-gray-900 mb-2">Resultados clave:</h4>
                        <div className="flex flex-wrap gap-3">
                          {caso.resultados.map((res, j) => (
                            <span key={j} className="flex items-center gap-1 text-sm text-gray-700">
                              <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                              {res}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 px-6 sm:px-8 py-4 flex justify-between items-center border-t border-gray-100">
                    <span className="text-sm text-gray-500">Ver caso completo</span>
                    <span className="text-orange-600 font-semibold text-sm group-hover:text-orange-700">
                      Leer más →
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Nota de confidencialidad */}
      <section className="py-8 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-gray-600 text-sm">
              Por motivos de confidencialidad, no publicamos los nombres de las empresas en nuestros casos de éxito. 
              Si desea conocer más detalles sobre algún proyecto o solicitar referencias directas, 
              estaremos encantados de facilitárselas bajo petición.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">¿Quieres ser nuestro próximo caso de éxito?</h2>
            <p className="text-base sm:text-lg text-gray-600 mb-6">
              Solicita una auditoría gratuita y descubre cómo podemos ayudar a tu empresa.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20auditoría%20gratuita"
                className="inline-block px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold"
              >
                Solicitar Auditoría Gratuita
              </a>
              <Link 
                href="/contacto" 
                className="inline-block px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold"
              >
                Contactar con un especialista
              </Link>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
