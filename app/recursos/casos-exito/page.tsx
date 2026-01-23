"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const casos = [
  {
    empresa: 'Hotel Costa Brava',
    sector: 'Hostelería',
    titulo: 'WiFi para 500 huéspedes simultáneos',
    descripcion: 'Implementamos una red WiFi de alta densidad con puntos de acceso Ruckus que soporta más de 500 dispositivos simultáneos sin degradación de servicio.',
    resultados: ['500+ dispositivos simultáneos', '99.9% uptime', 'Satisfacción huéspedes +40%'],
    soluciones: ['Infraestructura de Red', 'WiFi Empresarial'],
    destacado: true
  },
  {
    empresa: 'Supermercados MercaFresh',
    sector: 'Retail',
    titulo: 'Conectividad multi-sede con MPLS',
    descripcion: 'Red MPLS para conectar 25 supermercados con la central, garantizando comunicación segura y fiable para TPVs, inventario y comunicaciones internas.',
    resultados: ['25 sedes conectadas', 'Latencia <10ms', 'Ahorro 30% vs líneas dedicadas'],
    soluciones: ['Conectividad Avanzada', 'MPLS']
  },
  {
    empresa: 'Clínica Dental Sonríe',
    sector: 'Sanidad',
    titulo: 'Backup de datos con ExaGrid y cumplimiento GDPR',
    descripcion: 'Implementación de ExaGrid para backup de historiales clínicos con retención inmutable, garantizando cumplimiento GDPR y protección ante ransomware.',
    resultados: ['RPO de 15 minutos', 'Recuperación en <1 hora', '100% cumplimiento GDPR'],
    soluciones: ['ExaGrid', 'Backup Empresarial']
  },
  {
    empresa: 'Abogados Martínez & Asociados',
    sector: 'Servicios Profesionales',
    titulo: 'Comunicaciones unificadas con Wildix',
    descripcion: 'Centralita virtual Wildix integrada con CRM jurídico, permitiendo gestión de llamadas, videollamadas y chat desde una única plataforma.',
    resultados: ['Productividad +25%', 'Llamadas perdidas -60%', 'Integración CRM completa'],
    soluciones: ['Comunicaciones Unificadas', 'Wildix']
  },
  {
    empresa: 'Logística TransRapid',
    sector: 'Industria y Logística',
    titulo: 'Conexión 24/7 con backup automático',
    descripcion: 'Sistema de failover automático fibra + 5G para almacén logístico donde una hora sin conexión supone pérdidas de más de 50.000€.',
    resultados: ['0 minutos de caída en 12 meses', 'Failover en <30 segundos', 'ROI en 3 meses'],
    soluciones: ['Conectividad Avanzada', 'Backup de Conexión']
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
            <div className="text-5xl mb-4">🏆</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">Casos de Éxito</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Historias reales de empresas que han transformado sus comunicaciones con nuestras soluciones.
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
              <article 
                key={i} 
                className={`bg-white border-2 rounded-xl overflow-hidden hover:shadow-lg transition-all ${caso.destacado ? 'border-orange-500' : 'border-gray-200'}`}
              >
                <div className="p-6 sm:p-8">
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="inline-block bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-semibold">
                      {caso.sector}
                    </span>
                    {caso.destacado && (
                      <span className="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold">
                        ⭐ DESTACADO
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1">
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">{caso.empresa}</h2>
                      <h3 className="text-lg text-orange-600 font-semibold mb-3">{caso.titulo}</h3>
                      <p className="text-sm sm:text-base text-gray-600 mb-4">{caso.descripcion}</p>
                      <div className="flex flex-wrap gap-2">
                        {caso.soluciones.map((sol, j) => (
                          <span key={j} className="inline-block bg-orange-50 text-orange-700 px-2 py-1 rounded text-xs">
                            {sol}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="lg:w-64 bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-bold text-gray-900 mb-3">Resultados clave:</h4>
                      <ul className="space-y-2">
                        {caso.resultados.map((res, j) => (
                          <li key={j} className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                            {res}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-6 sm:px-8 py-4 flex justify-between items-center">
                  <span className="text-sm text-gray-500">Ver caso completo</span>
                  <span className="text-orange-600 font-semibold text-sm hover:text-orange-700 cursor-pointer">
                    Leer más →
                  </span>
                </div>
              </article>
            ))}
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
            <Link href="/contacto" className="inline-block px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">
              Solicitar Auditoría Gratuita
            </Link>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
