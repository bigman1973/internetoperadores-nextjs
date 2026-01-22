"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const beneficios = [
  { titulo: 'Velocidad Sin Igual', items: ['Backups 3X más rápidos', 'Recuperaciones 20X más rápidas', 'Ventana de backup fija'], icono: '⚡' },
  { titulo: 'Seguridad Total', items: ['Protección contra ransomware con IA', 'Solución non-network-facing', 'Recuperación garantizada'], icono: '🛡️' },
  { titulo: 'Escalabilidad Real', items: ['Hasta 6PB sin actualizaciones costosas', 'Arquitectura scale-out', 'Mezcla cualquier modelo'], icono: '📈' },
  { titulo: 'Coste Predecible', items: ['Protección de precios de 5 años', 'Sin costes ocultos', 'ROI demostrable'], icono: '💰' }
];

const proteccion = [
  { titulo: 'Retention Time-Lock con IA', descripcion: 'La inteligencia artificial detecta patrones anómalos y bloquea automáticamente la eliminación de backups.' },
  { titulo: 'Air Gap Escalonado', descripcion: 'El tier de retención no está conectado a la red, imposibilitando el acceso de ransomware.' },
  { titulo: 'Delayed Delete Policy', descripcion: 'Los backups no se pueden eliminar inmediatamente, incluso con credenciales de administrador.' },
  { titulo: 'Objetos Inmutables', descripcion: 'Una vez creados, los objetos de deduplicación no pueden modificarse ni eliminarse.' }
];

const casosUso = [
  { titulo: 'Empresas Medianas y Grandes', items: ['Protección de infraestructura crítica', 'Cumplimiento normativo (GDPR, ISO)', 'Recuperación ante desastres'], color: 'orange' },
  { titulo: 'Entornos Virtualizados', items: ['Integración nativa con Veeam', 'Backup de VMware y Hyper-V', 'Arranque instantáneo de VMs'], color: 'green' },
  { titulo: 'Sectores Regulados', items: ['Banca y finanzas', 'Sanidad', 'Administración pública'], color: 'blue' }
];

export default function ExagridPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soluciones" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/soluciones" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Soluciones
            </Link>
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Partner ExaGrid</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">ExaGrid</h1>
            <p className="text-xl sm:text-2xl text-orange-600 font-semibold mb-4">Almacenamiento de Backup Escalonado</p>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">La solución más rápida y segura para proteger tus datos empresariales. Tecnología probada por más de 4,800 empresas en todo el mundo.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Consultoría Gratuita</Link>
              <a href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20ExaGrid" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">La Diferencia ExaGrid</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Tecnología probada por más de 4,800 empresas en todo el mundo</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {beneficios.map((b, i) => (
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all text-center">
                <div className="text-4xl sm:text-5xl mb-4">{b.icono}</div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">{b.titulo}</h3>
                <ul className="space-y-2 text-sm text-gray-600">
                  {b.items.map((item, j) => (<li key={j} className="flex items-center gap-2"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{item}</li>))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Arquitectura */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Tecnología que Marca la Diferencia</h2>
          </div>
          <div className="max-w-3xl mx-auto">
            <div className="bg-white border-2 border-orange-200 rounded-xl p-6 sm:p-8 mb-6">
              <h3 className="text-xl sm:text-2xl font-bold text-orange-600 mb-4">Landing Zone (Disco Caché)</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Almacena los backups más recientes</li>
                <li>• Recuperación ultrarrápida (20X más rápido)</li>
                <li>• Arranque directo de VMs</li>
              </ul>
            </div>
            <div className="text-center text-3xl text-orange-500 my-4">↓</div>
            <div className="bg-white border-2 border-green-200 rounded-xl p-6 sm:p-8">
              <h3 className="text-xl sm:text-2xl font-bold text-green-600 mb-4">Repositorio de Retención</h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Deduplicación inteligente (ratios 10:1 a 50:1)</li>
                <li>• Objetos inmutables</li>
                <li>• Retención a largo plazo</li>
              </ul>
            </div>
            <p className="text-center text-base sm:text-lg text-gray-600 mt-8">La arquitectura escalonada combina velocidad extrema con eficiencia de almacenamiento</p>
          </div>
        </div>
      </section>

      {/* Protección Ransomware */}
      <section className="py-12 sm:py-16 lg:py-20 bg-red-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-red-900 mb-3 sm:mb-4">Tu Última Línea de Defensa</h2>
            <p className="text-base sm:text-lg text-gray-600">Protección multicapa contra ransomware y amenazas avanzadas</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {proteccion.map((p, i) => (
              <div key={i} className="bg-white rounded-xl p-6 shadow-md">
                <h3 className="text-lg sm:text-xl font-bold text-red-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  {p.titulo}
                </h3>
                <p className="text-sm sm:text-base text-gray-700">{p.descripcion}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10 sm:mt-12">
            <p className="text-xl sm:text-2xl font-bold text-red-900">Resultado: Recuperación garantizada en minutos, no en días</p>
          </div>
        </div>
      </section>

      {/* Casos de Uso */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Soluciones para Cada Necesidad</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {casosUso.map((c, i) => (
              <div key={i} className={`bg-${c.color}-50 rounded-xl p-6 sm:p-8`}>
                <h3 className={`text-xl sm:text-2xl font-bold text-${c.color}-900 mb-4`}>{c.titulo}</h3>
                <ul className="space-y-2 text-gray-700">
                  {c.items.map((item, j) => (<li key={j}>• {item}</li>))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">¿Listo para proteger tus datos?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">Solicita una consultoría gratuita y descubre cómo ExaGrid puede transformar tu estrategia de backup.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <Link href="/auditoria" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">Solicitar Consultoría Gratuita</Link>
              <a href="tel:+34655100400" className="inline-block px-8 py-4 sm:px-10 sm:py-5 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-base sm:text-lg">Llamar: 655 100 400</a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
