"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const planes = [
  { nombre: 'Básico', precio: 'Desde 199€/mes', descripcion: 'Para pequeñas empresas', caracteristicas: ['Hasta 10 equipos', 'Soporte 8x5', 'Monitorización básica', 'Tiempo respuesta 8h'] },
  { nombre: 'Profesional', precio: 'Desde 499€/mes', descripcion: 'Para empresas en crecimiento', caracteristicas: ['Hasta 50 equipos', 'Soporte 12x5', 'Monitorización avanzada', 'Tiempo respuesta 4h'], destacado: true },
  { nombre: 'Enterprise', precio: 'A medida', descripcion: 'Para grandes organizaciones', caracteristicas: ['Equipos ilimitados', 'Soporte 24x7', 'Monitorización proactiva', 'Tiempo respuesta 1h'] }
];

const servicios = [
  { titulo: 'Monitorización 24/7', descripcion: 'Vigilamos tu infraestructura en tiempo real. Detectamos problemas antes de que afecten a tu negocio.' },
  { titulo: 'Helpdesk', descripcion: 'Soporte técnico para tus usuarios. Resolvemos incidencias por teléfono, email o acceso remoto.' },
  { titulo: 'Mantenimiento Preventivo', descripcion: 'Actualizaciones, parches de seguridad y revisiones periódicas para evitar problemas.' },
  { titulo: 'Backup y Recuperación', descripcion: 'Copias de seguridad automatizadas y planes de recuperación ante desastres.' }
];

export default function MantenimientoITPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soluciones" />
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/soluciones" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Soluciones
            </Link>
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">SLA garantizado</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Mantenimiento IT</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Mantenimiento preventivo y correctivo de tu infraestructura IT. Monitorización 24/7, helpdesk y respuesta ante incidentes con SLA garantizado.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Propuesta</Link>
              <a href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Mantenimiento%20IT" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Servicios Incluidos</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {servicios.map((s,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{s.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Planes de Mantenimiento</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {planes.map((p,i)=>(
              <div key={i} className={`bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 ${p.destacado ? 'border-2 border-orange-500 shadow-xl' : 'border border-gray-200 shadow-lg'}`}>
                {p.destacado && <div className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full inline-block mb-4">Más popular</div>}
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{p.nombre}</h3>
                <div className="text-2xl sm:text-3xl font-bold text-orange-600 mb-2">{p.precio}</div>
                <p className="text-sm text-gray-500 mb-6">{p.descripcion}</p>
                <ul className="space-y-3 mb-6">
                  {p.caracteristicas.map((c,j)=>(<li key={j} className="flex items-center gap-2 text-sm text-gray-600"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{c}</li>))}
                </ul>
                <Link href="/contacto" className={`block text-center px-6 py-3 rounded-lg font-semibold transition-all ${p.destacado ? 'bg-orange-600 text-white hover:bg-orange-700' : 'border-2 border-orange-600 text-orange-600 hover:bg-orange-50'}`}>Solicitar información</Link>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">¿Cansado de apagar fuegos?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">Deja el mantenimiento IT en manos de expertos y céntrate en hacer crecer tu negocio.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <Link href="/auditoria" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">Solicitar Propuesta</Link>
              <a href="tel:+34655100400" className="inline-block px-8 py-4 sm:px-10 sm:py-5 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-base sm:text-lg">Llamar: 655 100 400</a>
            </div>
          </div>
        </div>
      </section>
      <EmpresaFooter />
    </div>
  );
}
