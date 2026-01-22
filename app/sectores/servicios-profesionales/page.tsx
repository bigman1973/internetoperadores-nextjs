"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const retos = [
  { titulo: 'Trabajo remoto', descripcion: 'Equipos distribuidos que necesitan colaborar como si estuvieran en la misma oficina.' },
  { titulo: 'Movilidad constante', descripcion: 'Profesionales que trabajan desde casa, cliente o en desplazamiento.' },
  { titulo: 'Imagen profesional', descripcion: 'Comunicaciones de calidad que transmitan confianza a los clientes.' },
  { titulo: 'Confidencialidad', descripcion: 'Datos de clientes y documentos sensibles que requieren protección.' }
];

const soluciones = [
  { titulo: 'Comunicaciones Unificadas', descripcion: 'Centralita virtual, videoconferencias HD y chat empresarial. Trabaja desde cualquier lugar con la misma extensión.', href: '/soluciones/comunicaciones-unificadas', caracteristicas: ['Extensión en móvil', 'Videoconferencias HD', 'Integración CRM', 'Grabación de llamadas'] },
  { titulo: 'Móviles Empresariales', descripcion: 'Tarifas móviles para profesionales. Datos generosos, llamadas ilimitadas y gestión centralizada.', href: '/soluciones/moviles', caracteristicas: ['Tarifas competitivas', 'Datos compartidos', 'Roaming incluido', 'Factura única'] },
  { titulo: 'Conectividad Fiable', descripcion: 'Conexión de fibra con respaldo para que tu despacho nunca se quede sin internet.', href: '/soluciones/conectividad-avanzada', caracteristicas: ['Fibra simétrica', 'Backup automático', 'IP fija', 'SLA garantizado'] }
];

export default function ServiciosProfesionalesPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="sectores" />
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/sectores" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Sectores
            </Link>
            <div className="text-5xl sm:text-6xl mb-4">💼</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Servicios Profesionales</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Soluciones de comunicaciones, movilidad y conectividad para despachos de abogados, consultoras, asesorías y profesionales independientes.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Auditoría Gratuita</Link>
              <a href="https://wa.me/34655100400?text=Hola,%20tengo%20un%20despacho/consultora%20y%20necesito%20información" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Los retos del sector</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {retos.map((r, i) => (
              <div key={i} className="bg-orange-50 rounded-xl p-6">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{r.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{r.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Nuestras soluciones</h2>
          </div>
          <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto">
            {soluciones.map((s, i) => (
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="flex-1">
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">{s.titulo}</h3>
                    <p className="text-sm sm:text-base text-gray-600 mb-4">{s.descripcion}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {s.caracteristicas.map((c, j) => (<div key={j} className="flex items-center gap-2 text-xs sm:text-sm text-gray-600"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{c}</div>))}
                    </div>
                  </div>
                  <Link href={s.href} className="inline-flex items-center text-orange-600 font-semibold hover:text-orange-700 whitespace-nowrap">
                    Más información <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">¿Quieres trabajar desde cualquier lugar?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">Te ayudamos a tener la misma productividad en la oficina, en casa o en movimiento.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <Link href="/auditoria" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">Solicitar Auditoría Gratuita</Link>
              <a href="tel:+34655100400" className="inline-block px-8 py-4 sm:px-10 sm:py-5 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-base sm:text-lg">Llamar: 655 100 400</a>
            </div>
          </div>
        </div>
      </section>
      <EmpresaFooter />
    </div>
  );
}
