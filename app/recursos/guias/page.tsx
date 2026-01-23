"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const guias = [
  {
    tipo: 'GUÍA ESTRELLA',
    titulo: 'Guía de Conectividad Empresarial 2026',
    descripcion: 'Todo lo que necesitas saber para garantizar la conexión de tu empresa: tecnologías disponibles, sistemas de backup, seguridad de red y mejores prácticas.',
    paginas: '50+ páginas',
    formato: 'PDF',
    destacado: true,
    contenido: ['Tecnologías de conectividad', 'Sistemas de backup', 'Seguridad de red', 'Checklist de auditoría', 'Casos prácticos']
  },
  {
    tipo: 'CHECKLIST',
    titulo: '10 puntos para auditar tu infraestructura de red',
    descripcion: 'Lista de verificación completa para evaluar el estado de tu red empresarial y detectar puntos de mejora.',
    paginas: '8 páginas',
    formato: 'PDF'
  },
  {
    tipo: 'GUÍA',
    titulo: 'Guía de migración a la nube para PYMEs',
    descripcion: 'Paso a paso para migrar tus comunicaciones y sistemas a la nube de forma segura y sin interrupciones.',
    paginas: '25 páginas',
    formato: 'PDF'
  },
  {
    tipo: 'MANUAL',
    titulo: 'Manual de buenas prácticas en comunicaciones unificadas',
    descripcion: 'Mejores prácticas para implementar y gestionar soluciones de comunicaciones unificadas en tu empresa.',
    paginas: '30 páginas',
    formato: 'PDF'
  },
  {
    tipo: 'INFOGRAFÍA',
    titulo: 'Costes ocultos de las caídas de internet',
    descripcion: 'Visualización de los costes directos e indirectos que supone para una empresa cada hora sin conexión.',
    paginas: '1 página',
    formato: 'PDF / PNG'
  }
];

export default function GuiasPage() {
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
            <div className="text-5xl mb-4">📚</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">Guías y Whitepapers</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Documentos técnicos y guías descargables para tomar mejores decisiones tecnológicas.
            </p>
          </div>
        </div>
      </section>

      {/* Guía Estrella Destacada */}
      <section className="py-8 sm:py-12 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="bg-white rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xl">
              <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
                <div className="flex-1">
                  <span className="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs sm:text-sm font-semibold mb-3">
                    📚 GUÍA ESTRELLA - DESCARGA GRATUITA
                  </span>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">
                    Guía de Conectividad Empresarial 2026
                  </h2>
                  <p className="text-sm sm:text-base lg:text-lg text-gray-600 mb-4 sm:mb-6">
                    La guía más completa sobre conectividad empresarial. Todo lo que necesitas saber para garantizar que tu empresa nunca se quede sin conexión.
                  </p>
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-900 mb-3">Contenido incluido:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {guias[0].contenido?.map((item, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                          <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3 sm:gap-4 mb-6">
                    <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      📄 50+ páginas
                    </span>
                    <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      📥 PDF descargable
                    </span>
                    <span className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                      ✅ Checklist incluido
                    </span>
                  </div>
                  <button className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-sm sm:text-base">
                    Descargar Guía Gratuita
                  </button>
                </div>
                <div className="lg:w-64 flex items-center justify-center">
                  <div className="bg-gradient-to-br from-orange-100 to-orange-200 rounded-xl p-8 sm:p-10 text-center w-full">
                    <div className="text-6xl sm:text-7xl mb-2">📖</div>
                    <p className="text-sm text-gray-700 font-medium">PDF Descargable</p>
                    <p className="text-xs text-gray-500 mt-1">50+ páginas</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Otras Guías */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">Más recursos descargables</h2>
            <div className="space-y-4">
              {guias.slice(1).map((guia, i) => (
                <div 
                  key={i} 
                  className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
                >
                  <div className="flex-1">
                    <span className="inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-semibold mb-2">
                      {guia.tipo}
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{guia.titulo}</h3>
                    <p className="text-sm text-gray-600 mb-2">{guia.descripcion}</p>
                    <div className="flex gap-3 text-xs text-gray-500">
                      <span>📄 {guia.paginas}</span>
                      <span>📥 {guia.formato}</span>
                    </div>
                  </div>
                  <button className="px-4 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all font-semibold text-sm whitespace-nowrap">
                    Descargar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
