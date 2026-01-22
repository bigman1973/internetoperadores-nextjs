'use client';

import Link from 'next/link';
import Header from '../../../components/Header';

const servicios = [
  {
    titulo: 'WiFi Empresarial',
    descripcion: 'Redes WiFi de alto rendimiento para oficinas, hoteles, hospitales y espacios públicos. Cobertura total sin zonas muertas.',
    caracteristicas: ['WiFi 6E última generación', 'Roaming sin cortes', 'Gestión centralizada', 'Portal cautivo personalizado'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
      </svg>
    ),
  },
  {
    titulo: 'Cableado Estructurado',
    descripcion: 'Diseño e instalación de redes cableadas Cat6/Cat6A/Cat7. Certificación de puntos y documentación completa.',
    caracteristicas: ['Certificación Fluke', 'Hasta 10 Gbps', 'Garantía 25 años', 'Documentación as-built'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
      </svg>
    ),
  },
  {
    titulo: 'Switching y Routing',
    descripcion: 'Equipamiento de red empresarial para conectar todos tus dispositivos. VLANs, QoS y segmentación de red.',
    caracteristicas: ['Switches gestionables', 'PoE+ para APs y cámaras', 'Redundancia y failover', 'Monitorización SNMP'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
  {
    titulo: 'Seguridad de Red',
    descripcion: 'Firewalls, segmentación y protección perimetral. Mantén tu red segura frente a amenazas externas e internas.',
    caracteristicas: ['Firewalls UTM', 'VPN site-to-site', 'IDS/IPS', 'Segmentación Zero Trust'],
    icono: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
];

const marcas = [
  { nombre: 'Ruckus', destacado: true, descripcion: 'Partner certificado - WiFi empresarial de alto rendimiento' },
  { nombre: 'Cisco', destacado: false, descripcion: 'Switching y routing enterprise' },
  { nombre: 'Ubiquiti', destacado: false, descripcion: 'Soluciones coste-efectivas' },
  { nombre: 'Aruba', destacado: false, descripcion: 'WiFi y switching HPE' },
  { nombre: 'Fortinet', destacado: false, descripcion: 'Seguridad de red' },
  { nombre: 'MikroTik', destacado: false, descripcion: 'Routing avanzado' },
];

const casosExito = [
  {
    sector: 'Hotel 4 estrellas',
    descripcion: '200 habitaciones con WiFi de alta densidad',
    resultado: '100% cobertura, 0 quejas de clientes'
  },
  {
    sector: 'Nave industrial',
    descripcion: '5.000m² con WiFi para dispositivos IoT',
    resultado: 'Conectividad estable en todo el espacio'
  },
  {
    sector: 'Edificio de oficinas',
    descripcion: '3 plantas, 150 puestos de trabajo',
    resultado: 'Red segmentada por departamentos'
  },
];

export default function InfraestructuraRedPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl">
            <Link href="/soluciones" className="inline-flex items-center text-white/80 hover:text-white mb-6">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Soluciones
            </Link>
            <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-6">
              Partner certificado Ruckus
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Infraestructura de Red
            </h1>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Diseño, implementación y mantenimiento de redes empresariales. Especialistas en Ruckus 
              con capacidad para trabajar con un amplio portfolio de fabricantes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Infraestructura%20de%20Red"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white text-orange-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
              >
                Solicitar estudio de cobertura
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
              <div className="text-4xl font-bold text-orange-500 mb-2">WiFi 6E</div>
              <div className="text-gray-600">Última generación</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">10 Gbps</div>
              <div className="text-gray-600">Velocidad cableado</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">25 años</div>
              <div className="text-gray-600">Garantía cableado</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-orange-500 mb-2">24/7</div>
              <div className="text-gray-600">Soporte disponible</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Servicios de infraestructura
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Desde el diseño hasta el mantenimiento, cubrimos todas las necesidades de tu red empresarial.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {servicios.map((servicio, index) => (
              <div 
                key={index}
                className="bg-white border border-gray-200 rounded-2xl p-8 hover:shadow-xl transition-shadow"
              >
                <div className="text-orange-500 mb-4">
                  {servicio.icono}
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">
                  {servicio.titulo}
                </h3>
                <p className="text-gray-600 mb-6">
                  {servicio.descripcion}
                </p>
                <ul className="space-y-2">
                  {servicio.caracteristicas.map((caracteristica, idx) => (
                    <li key={idx} className="flex items-center text-gray-600">
                      <svg className="w-5 h-5 text-orange-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      {/* Ruckus Highlight */}
      <section className="py-16 bg-gradient-to-r from-orange-50 to-red-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="flex-shrink-0">
                  <div className="bg-orange-100 p-6 rounded-2xl">
                    <svg className="w-20 h-20 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                    </svg>
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">
                    Especialistas en Ruckus
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Como partner certificado de Ruckus, ofrecemos las mejores soluciones WiFi empresariales del mercado. 
                    Tecnología BeamFlex+ para cobertura óptima, gestión cloud con SmartZone y soporte técnico especializado.
                  </p>
                  <ul className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <li className="flex items-center"><span className="text-orange-500 mr-2">✓</span> Alta densidad</li>
                    <li className="flex items-center"><span className="text-orange-500 mr-2">✓</span> Roaming inteligente</li>
                    <li className="flex items-center"><span className="text-orange-500 mr-2">✓</span> Gestión cloud</li>
                    <li className="flex items-center"><span className="text-orange-500 mr-2">✓</span> IoT ready</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brands */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Trabajamos con los mejores fabricantes
            </h2>
            <p className="text-gray-600">
              No nos limitamos a un solo fabricante. Elegimos la mejor solución para cada proyecto.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {marcas.map((marca, index) => (
              <div 
                key={index}
                className={`p-4 rounded-xl text-center ${marca.destacado ? 'bg-orange-50 border-2 border-orange-200' : 'bg-gray-50'}`}
              >
                <div className={`text-lg font-bold mb-1 ${marca.destacado ? 'text-orange-600' : 'text-gray-700'}`}>
                  {marca.nombre}
                </div>
                <div className="text-xs text-gray-500">{marca.descripcion}</div>
                {marca.destacado && (
                  <span className="inline-block mt-2 text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full">
                    Partner
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Studies */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Proyectos realizados
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {casosExito.map((caso, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="text-orange-500 font-semibold mb-2">{caso.sector}</div>
                <p className="text-gray-600 mb-4">{caso.descripcion}</p>
                <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium">
                  {caso.resultado}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-orange-500 to-red-500 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Necesitas mejorar tu infraestructura de red?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Realizamos un estudio de cobertura y diseñamos la solución óptima para tu espacio. 
            Sin compromiso.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://wa.me/34655100400?text=Hola,%20necesito%20un%20estudio%20de%20cobertura%20WiFi"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white text-orange-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-100 transition-colors inline-flex items-center justify-center gap-2"
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
