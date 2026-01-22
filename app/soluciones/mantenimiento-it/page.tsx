'use client';

import Link from 'next/link';
import Header from '../../../components/Header';

const servicios = [
  {
    titulo: 'Monitorización 24/7',
    descripcion: 'Vigilancia continua de todos tus sistemas críticos. Detectamos y resolvemos problemas antes de que afecten a tu negocio.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    titulo: 'Helpdesk y Soporte',
    descripcion: 'Equipo técnico disponible para resolver incidencias. Soporte remoto y presencial según necesidad.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    titulo: 'Mantenimiento Preventivo',
    descripcion: 'Actualizaciones, parches de seguridad y revisiones periódicas para mantener tus sistemas en óptimas condiciones.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    titulo: 'Gestión de Activos',
    descripcion: 'Inventario completo de tu infraestructura IT. Control de licencias, garantías y ciclo de vida de equipos.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    titulo: 'Respuesta a Incidentes',
    descripcion: 'Protocolo de actuación ante caídas o problemas críticos. Tiempos de respuesta garantizados por SLA.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    titulo: 'Informes y Reporting',
    descripcion: 'Informes mensuales de estado, incidencias resueltas y recomendaciones de mejora.',
    icono: (
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
];

const planes = [
  {
    nombre: 'Básico',
    descripcion: 'Para pequeñas empresas con necesidades puntuales',
    precio: 'Desde 290€/mes',
    caracteristicas: [
      'Monitorización básica',
      'Soporte en horario laboral',
      'Tiempo respuesta < 8h',
      'Mantenimiento trimestral',
      'Hasta 10 dispositivos',
    ],
    destacado: false,
  },
  {
    nombre: 'Profesional',
    descripcion: 'Para empresas que necesitan disponibilidad',
    precio: 'Desde 590€/mes',
    caracteristicas: [
      'Monitorización 24/7',
      'Soporte extendido',
      'Tiempo respuesta < 4h',
      'Mantenimiento mensual',
      'Hasta 30 dispositivos',
      'Gestión de backups',
    ],
    destacado: true,
  },
  {
    nombre: 'Enterprise',
    descripcion: 'Para empresas con infraestructura crítica',
    precio: 'Personalizado',
    caracteristicas: [
      'Monitorización 24/7/365',
      'Soporte 24/7',
      'Tiempo respuesta < 2h',
      'Mantenimiento continuo',
      'Dispositivos ilimitados',
      'Técnico dedicado',
      'SLA personalizado',
    ],
    destacado: false,
  },
];

export default function MantenimientoITPage() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl">
            <Link href="/soluciones" className="inline-flex items-center text-white/80 hover:text-white mb-6">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Soluciones
            </Link>
            <span className="inline-block bg-white/20 text-white px-4 py-1 rounded-full text-sm font-semibold mb-6">
              SLA garantizado
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Mantenimiento IT
            </h1>
            <p className="text-xl text-white/90 mb-8 leading-relaxed">
              Soporte técnico profesional y mantenimiento preventivo para tu infraestructura IT. 
              Monitorización 24/7, helpdesk y respuesta garantizada ante incidencias.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Mantenimiento%20IT"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-orange-500 text-white px-8 py-4 rounded-lg font-semibold hover:bg-orange-600 transition-colors inline-flex items-center justify-center gap-2"
              >
                Solicitar presupuesto
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
              <div className="text-4xl font-bold text-gray-800 mb-2">&lt; 2h</div>
              <div className="text-gray-600">Tiempo respuesta crítico</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-800 mb-2">365</div>
              <div className="text-gray-600">Días de cobertura</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-800 mb-2">98%</div>
              <div className="text-gray-600">Incidencias resueltas en SLA</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-gray-800 mb-2">+25</div>
              <div className="text-gray-600">Años de experiencia</div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              ¿Qué incluye nuestro servicio?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Un servicio completo de mantenimiento IT que cubre todas las necesidades de tu empresa.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {servicios.map((servicio, index) => (
              <div 
                key={index}
                className="bg-white p-6 rounded-xl shadow-sm hover:shadow-lg transition-shadow"
              >
                <div className="text-gray-700 mb-4">
                  {servicio.icono}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {servicio.titulo}
                </h3>
                <p className="text-gray-600">
                  {servicio.descripcion}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Plans */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Planes de mantenimiento
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Elige el plan que mejor se adapte a las necesidades de tu empresa. Todos incluyen soporte técnico profesional.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {planes.map((plan, index) => (
              <div 
                key={index}
                className={`rounded-2xl p-8 ${plan.destacado ? 'bg-gray-900 text-white ring-4 ring-orange-500' : 'bg-gray-50 text-gray-900'}`}
              >
                {plan.destacado && (
                  <span className="inline-block bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full mb-4">
                    Más popular
                  </span>
                )}
                <h3 className="text-2xl font-bold mb-2">{plan.nombre}</h3>
                <p className={`text-sm mb-4 ${plan.destacado ? 'text-gray-300' : 'text-gray-600'}`}>
                  {plan.descripcion}
                </p>
                <div className="text-3xl font-bold mb-6">{plan.precio}</div>
                <ul className="space-y-3 mb-8">
                  {plan.caracteristicas.map((caracteristica, idx) => (
                    <li key={idx} className="flex items-center">
                      <svg className={`w-5 h-5 mr-2 ${plan.destacado ? 'text-orange-400' : 'text-green-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className={plan.destacado ? 'text-gray-200' : 'text-gray-600'}>{caracteristica}</span>
                    </li>
                  ))}
                </ul>
                <a 
                  href={`https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20el%20plan%20${plan.nombre}%20de%20Mantenimiento%20IT`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full text-center py-3 rounded-lg font-semibold transition-colors ${
                    plan.destacado 
                      ? 'bg-orange-500 text-white hover:bg-orange-600' 
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  Solicitar información
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Us */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
              ¿Por qué elegirnos?
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl">
                <h3 className="font-bold text-gray-900 mb-2">Experiencia real</h3>
                <p className="text-gray-600 text-sm">Más de 25 años gestionando infraestructuras IT de empresas de todos los tamaños.</p>
              </div>
              <div className="bg-white p-6 rounded-xl">
                <h3 className="font-bold text-gray-900 mb-2">Equipo propio</h3>
                <p className="text-gray-600 text-sm">Técnicos certificados en plantilla, no subcontratamos el soporte crítico.</p>
              </div>
              <div className="bg-white p-6 rounded-xl">
                <h3 className="font-bold text-gray-900 mb-2">Proactividad</h3>
                <p className="text-gray-600 text-sm">No esperamos a que algo falle. Monitorizamos y prevenimos antes de que ocurra.</p>
              </div>
              <div className="bg-white p-6 rounded-xl">
                <h3 className="font-bold text-gray-900 mb-2">Transparencia</h3>
                <p className="text-gray-600 text-sm">Informes mensuales detallados. Sabes exactamente qué hacemos y por qué.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-900 py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            ¿Cansado de apagar fuegos?
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Deja el mantenimiento IT en manos de profesionales y céntrate en lo que realmente importa: tu negocio.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a 
              href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Mantenimiento%20IT"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-orange-500 text-white px-8 py-4 rounded-lg font-semibold hover:bg-orange-600 transition-colors inline-flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Solicitar presupuesto
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
      <footer className="bg-gray-900 text-white py-12 border-t border-gray-800">
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
