"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const webinars = [
  {
    tipo: 'DEMO',
    titulo: 'Cómo funciona el backup automático de conexión',
    descripcion: 'Demostración en vivo de nuestro sistema de failover automático que garantiza conexión 24/7. Verás cómo se activa el backup en menos de 30 segundos.',
    duracion: '25 min',
    fecha: 'Grabado - Disponible ahora',
    destacado: true
  },
  {
    tipo: 'WEBINAR',
    titulo: 'Introducción a Wildix para contact centers',
    descripcion: 'Descubre las capacidades de Wildix como solución de contact center: gestión de colas, integración CRM, analytics y más.',
    duracion: '45 min',
    fecha: 'Grabado - Disponible ahora'
  },
  {
    tipo: 'DEMO',
    titulo: 'Configuración de Zoom Rooms para salas de reuniones',
    descripcion: 'Paso a paso para configurar Zoom Rooms en tu sala de reuniones. Hardware recomendado, configuración y mejores prácticas.',
    duracion: '30 min',
    fecha: 'Grabado - Disponible ahora'
  },
  {
    tipo: 'WEBINAR',
    titulo: 'Seguridad de red para empresas - Mejores prácticas',
    descripcion: 'Las amenazas más comunes y cómo proteger tu red empresarial. Firewall, segmentación, VPN y políticas de seguridad.',
    duracion: '50 min',
    fecha: 'Grabado - Disponible ahora'
  },
  {
    tipo: 'DEMO',
    titulo: 'Panel de control de Internet Operadores',
    descripcion: 'Tour completo por el área de cliente: monitorización de conexión, gestión de servicios, soporte y facturación.',
    duracion: '20 min',
    fecha: 'Grabado - Disponible ahora'
  }
];

const proximosWebinars = [
  {
    titulo: 'Tendencias en comunicaciones unificadas 2026',
    fecha: '15 Febrero 2026 - 11:00h',
    plazas: 'Plazas limitadas'
  },
  {
    titulo: 'ExaGrid: Protección ante ransomware',
    fecha: '22 Febrero 2026 - 11:00h',
    plazas: 'Plazas limitadas'
  }
];

export default function WebinarsPage() {
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
            <div className="text-5xl mb-4">🎥</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">Webinars y Demos</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Seminarios web grabados y demostraciones de nuestras soluciones en acción.
            </p>
          </div>
        </div>
      </section>

      {/* Próximos Webinars */}
      <section className="py-8 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-6 text-center">📅 Próximos webinars en directo</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {proximosWebinars.map((webinar, i) => (
                <div key={i} className="bg-white rounded-xl p-5 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{webinar.titulo}</h3>
                    <p className="text-sm text-gray-600">{webinar.fecha}</p>
                    <span className="text-xs text-orange-600 font-semibold">{webinar.plazas}</span>
                  </div>
                  <button className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm whitespace-nowrap">
                    Reservar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Webinars Grabados */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">Contenido disponible bajo demanda</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {webinars.map((webinar, i) => (
                <div 
                  key={i} 
                  className={`bg-white border-2 rounded-xl overflow-hidden hover:shadow-lg transition-all ${webinar.destacado ? 'border-orange-500' : 'border-gray-200'}`}
                >
                  <div className="bg-gray-900 h-40 flex items-center justify-center relative">
                    <div className="text-6xl">▶️</div>
                    <span className="absolute top-3 left-3 bg-orange-600 text-white px-2 py-1 rounded text-xs font-semibold">
                      {webinar.tipo}
                    </span>
                    <span className="absolute bottom-3 right-3 bg-black/70 text-white px-2 py-1 rounded text-xs">
                      {webinar.duracion}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{webinar.titulo}</h3>
                    <p className="text-sm text-gray-600 mb-3">{webinar.descripcion}</p>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500">{webinar.fecha}</span>
                      <button className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                        Ver ahora →
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Demo Personalizada */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">¿Prefieres una demo personalizada?</h2>
            <p className="text-base sm:text-lg text-gray-600 mb-6">
              Agenda una sesión 1:1 con nuestro equipo y te mostraremos las soluciones que mejor se adaptan a tu empresa.
            </p>
            <Link href="/contacto" className="inline-block px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">
              Solicitar Demo Personalizada
            </Link>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
