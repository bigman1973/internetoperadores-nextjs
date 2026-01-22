"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const servicios = [
  { titulo: 'WiFi Empresarial', descripcion: 'Diseño e implementación de redes WiFi de alto rendimiento. Cobertura total, roaming seamless y gestión centralizada.', caracteristicas: ['Alta densidad de usuarios', 'Roaming sin cortes', 'Gestión cloud', 'Analíticas de uso'] },
  { titulo: 'Cableado Estructurado', descripcion: 'Instalación y certificación de cableado Cat6/Cat6A. Infraestructura preparada para el futuro.', caracteristicas: ['Certificación Fluke', 'Cat6A hasta 10Gbps', 'Garantía 25 años', 'Documentación completa'] },
  { titulo: 'Switching y Routing', descripcion: 'Equipamiento de red empresarial con redundancia, VLANs y QoS para priorizar tráfico crítico.', caracteristicas: ['Alta disponibilidad', 'QoS avanzado', 'Segmentación VLAN', 'Gestión centralizada'] },
  { titulo: 'Seguridad de Red', descripcion: 'Firewalls, IDS/IPS y segmentación de red para proteger tu infraestructura de amenazas.', caracteristicas: ['Next-Gen Firewall', 'Detección de intrusos', 'VPN site-to-site', 'Monitorización 24/7'] }
];

export default function InfraestructuraRedPage() {
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
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Partner Ruckus</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Infraestructura de Red</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Diseño, implementación y mantenimiento de redes empresariales. Especialistas en Ruckus con capacidad para trabajar con amplio portfolio de fabricantes.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <Link href="/auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Auditoría de Red</Link>
              <a href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Infraestructura%20de%20Red" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Nuestros Servicios</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Soluciones completas de infraestructura de red para empresas de cualquier tamaño.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {servicios.map((s,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">{s.descripcion}</p>
                <div className="grid grid-cols-2 gap-2">{s.caracteristicas.map((c,j)=>(<div key={j} className="flex items-center gap-2 text-xs sm:text-sm text-gray-600"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{c}</div>))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Fabricantes con los que trabajamos</h2>
            <p className="text-base sm:text-lg text-gray-600">No nos limitamos a un solo fabricante. Elegimos el mejor para cada proyecto.</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 max-w-4xl mx-auto">
            {['Ruckus', 'Cisco', 'Aruba', 'Fortinet', 'Ubiquiti'].map((f,i)=>(<div key={i} className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">{f}</div>))}
          </div>
        </div>
      </section>
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">¿Tu red actual no da el rendimiento que necesitas?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">Solicita una auditoría gratuita y te proponemos mejoras con presupuesto detallado.</p>
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
