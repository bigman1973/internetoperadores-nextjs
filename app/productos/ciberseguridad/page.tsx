"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

export default function CiberseguridadPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="productos" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/productos" className="inline-flex items-center gap-1 text-orange-400 text-sm mb-4 hover:text-orange-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Productos
            </Link>
            <div className="inline-block bg-orange-600/20 text-orange-400 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold mb-4">
              Partner Panda Security
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              Ciberseguridad
            </h1>
            <p className="text-base sm:text-lg text-gray-300 mb-6 max-w-2xl mx-auto">
              Soluciones de seguridad informática: antivirus empresarial (Panda/WatchGuard), firewalls, EDR, protección de endpoints y auditorías de seguridad.
            </p>
          </div>
        </div>
      </section>

      {/* Contenido placeholder */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-8 sm:p-12">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
                Contenido en preparación
              </h2>
              <p className="text-gray-600 mb-6">
                Estamos preparando la ficha técnica completa de este producto con todas las tarifas, características y opciones disponibles. Próximamente podrás ver toda la información detallada.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-3">
                <Link href="/contacto" className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">
                  Solicitar información
                </Link>
                <a href="tel:900730034" className="px-6 py-3 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold">
                  Llamar: 900 730 034
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
