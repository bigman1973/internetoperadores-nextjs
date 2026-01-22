"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const ventajas = [
  { titulo: 'Operador autorizado', descripcion: 'Somos operador de telecomunicaciones autorizado por la CNMC. Facturación directa sin intermediarios.' },
  { titulo: 'Cobertura nacional', descripcion: 'Acceso a las mejores redes móviles de España. Cobertura 4G/5G en todo el territorio.' },
  { titulo: 'Gestión centralizada', descripcion: 'Panel de control para gestionar todas las líneas de tu empresa. Consumos, límites y alertas.' },
  { titulo: 'Factura única', descripcion: 'Consolida todas tus comunicaciones en una sola factura. Fijo, móvil e internet.' }
];

export default function MovilesPage() {
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
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Operador autorizado</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Soluciones Móviles</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Tarifas móviles empresariales con las mejores condiciones. Flotas móviles, datos compartidos y gestión centralizada para tu empresa.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Link href="/tarifas/empresa" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Ver Tarifas Móviles</Link>
              <a href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20tarifas%20móviles%20para%20empresas" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">¿Por qué elegirnos?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Ventajas de contratar tus líneas móviles con Internet Operadores.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {ventajas.map((v,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{v.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{v.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Tarifas a medida para empresas</h2>
            <p className="text-base sm:text-lg text-gray-600 mb-8">Consulta nuestras tarifas móviles o solicita una propuesta personalizada para tu flota.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/tarifas/empresa" className="px-8 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">Ver Tarifas</Link>
              <Link href="/contacto" className="px-8 py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold">Solicitar Propuesta</Link>
            </div>
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">¿Quieres unificar todas tus comunicaciones?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">Fijo, móvil e internet en una sola factura. Simplifica la gestión de tu empresa.</p>
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
