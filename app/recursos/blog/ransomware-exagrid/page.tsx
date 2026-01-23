"use client";
import Link from 'next/link';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

export default function ArticuloPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      {/* Hero del artículo */}
      <div className="pt-8 pb-12 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <Link href="/recursos/blog" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-6 group">
              <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver al Blog
            </Link>
            
            <div className="flex flex-wrap gap-3 mb-6">
              <span className="inline-flex items-center bg-red-100 text-red-700 px-4 py-2 rounded-full text-sm font-semibold">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Seguridad
              </span>
              <span className="inline-flex items-center bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold">
                ExaGrid
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Ransomware: 
              <span className="text-orange-600"> Por qué tu backup tradicional ya no es suficiente</span>
            </h1>
            
            <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 mb-8">
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                22 Enero 2026
              </span>
              <span className="flex items-center">
                <svg className="w-5 h-5 mr-2 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                8 min lectura
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido del artículo */}
      <div className="container mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-4xl mx-auto">
          
          {/* Imagen destacada */}
          <div className="relative w-full h-[300px] sm:h-[400px] lg:h-[450px] rounded-2xl overflow-hidden shadow-2xl mb-12">
            <img 
              src="/images/blog/ransomware-exagrid.png" 
              alt="Candado digital protegiendo datos en un servidor ExaGrid" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent"></div>
            <div className="absolute bottom-6 left-6 right-6">
              <span className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm">
                ⚠️ Amenaza crítica
              </span>
            </div>
          </div>

          {/* Alerta inicial */}
          <div className="bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 p-6 sm:p-8 rounded-r-2xl mb-12">
            <div className="flex items-start gap-4">
              <span className="text-4xl">🔒</span>
              <p className="text-lg sm:text-xl text-gray-700 leading-relaxed font-medium">
                El ransomware se ha convertido en la mayor pesadilla para cualquier empresa. Un solo clic puede encriptar 
                todos tus datos. Y ahora, los ciberdelincuentes tienen un nuevo objetivo: 
                <strong className="text-red-700"> destruir también las copias de seguridad</strong>.
              </p>
            </div>
          </div>

          {/* Contenido principal */}
          <article className="space-y-12">
            
            {/* Estadísticas de impacto */}
            <section className="grid sm:grid-cols-3 gap-4">
              <div className="bg-red-50 rounded-2xl p-6 text-center border border-red-200">
                <p className="text-4xl font-bold text-red-600">93%</p>
                <p className="text-gray-600 text-sm mt-2">de ataques intentan destruir los backups</p>
              </div>
              <div className="bg-orange-50 rounded-2xl p-6 text-center border border-orange-200">
                <p className="text-4xl font-bold text-orange-600">21 días</p>
                <p className="text-gray-600 text-sm mt-2">tiempo medio de recuperación</p>
              </div>
              <div className="bg-gray-100 rounded-2xl p-6 text-center border border-gray-200">
                <p className="text-4xl font-bold text-gray-700">4.5M€</p>
                <p className="text-gray-600 text-sm mt-2">coste medio de un ataque</p>
              </div>
            </section>

            {/* Problema: Backups tradicionales */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <span className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                  <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </span>
                El talón de Aquiles de los backups tradicionales
              </h2>

              <p className="text-gray-600 text-lg leading-relaxed">
                Los sistemas de backup convencionales presentan vulnerabilidades críticas que los atacantes 
                de ransomware explotan sistemáticamente:
              </p>

              <div className="space-y-4">
                <div className="flex gap-4 items-start bg-white border-2 border-red-200 rounded-xl p-5">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">👁️</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Visibilidad en la red</h4>
                    <p className="text-gray-600 text-sm mt-1">El almacenamiento de backup es visible y accesible. Si un atacante obtiene credenciales de administrador, puede localizar y eliminar los backups tan fácilmente como los datos primarios.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start bg-white border-2 border-red-200 rounded-xl p-5">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🗑️</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Eliminación instantánea</h4>
                    <p className="text-gray-600 text-sm mt-1">La mayoría de sistemas permiten eliminación inmediata. Los atacantes borran primero todas las copias de seguridad antes de encriptar los datos de producción.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start bg-white border-2 border-red-200 rounded-xl p-5">
                  <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <span className="text-xl">🐢</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Lenta recuperación</h4>
                    <p className="text-gray-600 text-sm mt-1">Recuperar grandes volúmenes desde la nube o cintas puede llevar días o semanas, un tiempo de inactividad que ninguna empresa puede permitirse.</p>
                  </div>
                </div>
              </div>
            </section>

            {/* Solución: ExaGrid */}
            <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 sm:p-10 text-white">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-green-500 rounded-xl flex items-center justify-center">
                  <span className="text-3xl">🛡️</span>
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold">ExaGrid</h2>
                  <p className="text-gray-400">Backup a prueba de ransomware</p>
                </div>
              </div>
              
              <p className="text-gray-300 text-lg leading-relaxed mb-6">
                ExaGrid ha rediseñado la arquitectura del backup pensando en el ransomware. Su sistema de 
                <strong className="text-white"> "Tiered Backup Storage"</strong> crea múltiples capas de protección 
                que lo hacen único.
              </p>

              <div className="bg-white/10 rounded-xl p-6 mb-6">
                <div className="flex items-start gap-4">
                  <svg className="w-8 h-8 text-green-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
                  </svg>
                  <p className="text-lg text-gray-200">
                    La clave es su <strong className="text-green-400">nivel de repositorio no orientado a la red</strong>. 
                    Este nivel está aislado y es invisible para la red principal, por lo que los atacantes no pueden 
                    verlo ni acceder a él.
                  </p>
                </div>
              </div>
            </section>

            {/* Retention Time-Lock */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center">
                <span className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-4">
                  <span className="text-xl">⏱️</span>
                </span>
                Retention Time-Lock: La joya de la corona
              </h2>

              <div className="relative">
                {/* Línea de tiempo vertical */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-green-200"></div>
                
                <div className="space-y-6">
                  <div className="flex gap-4 items-start relative">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold z-10">1</div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 flex-1">
                      <h4 className="font-bold text-gray-900">Landing Zone</h4>
                      <p className="text-gray-600 text-sm mt-1">Las copias más recientes se guardan en su formato nativo en disco de alto rendimiento. Recuperaciones ultrarrápidas.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold z-10">2</div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 flex-1">
                      <h4 className="font-bold text-gray-900">Retention Tier (Aislado)</h4>
                      <p className="text-gray-600 text-sm mt-1">Los datos se mueven a un segundo nivel <strong>invisible desde la red</strong>. Almacenamiento deduplicado a largo plazo.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative">
                    <div className="flex-shrink-0 w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold z-10">3</div>
                    <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-5 flex-1">
                      <h4 className="font-bold text-gray-900">⏱️ Eliminación Retardada</h4>
                      <p className="text-gray-600 text-sm mt-1">Cuando se envía una orden de eliminación, <strong>NO se ejecuta inmediatamente</strong>. Se pone en cola durante un período configurable (ej: 10 días).</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative">
                    <div className="flex-shrink-0 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold z-10">4</div>
                    <div className="bg-white border-2 border-gray-200 rounded-xl p-5 flex-1">
                      <h4 className="font-bold text-gray-900">🚨 Alerta de Actividad Maliciosa</h4>
                      <p className="text-gray-600 text-sm mt-1">Si detecta muchas eliminaciones en poco tiempo (comportamiento típico de ransomware), genera una alerta inmediata.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 items-start relative">
                    <div className="flex-shrink-0 w-12 h-12 bg-green-600 rounded-full flex items-center justify-center text-white font-bold z-10">✓</div>
                    <div className="bg-green-50 border-2 border-green-200 rounded-xl p-5 flex-1">
                      <h4 className="font-bold text-green-800">Recuperación Garantizada</h4>
                      <p className="text-green-700 text-sm mt-1">Las copias del Retention Tier permanecen <strong>intactas e inmutables</strong>, listas para ser restauradas en horas, no semanas.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Tabla comparativa */}
            <section className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center">
                ⚔️ Backup tradicional vs ExaGrid
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse rounded-xl overflow-hidden shadow-lg">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="px-4 py-4 text-left font-semibold">Característica</th>
                      <th className="px-4 py-4 text-center font-semibold bg-red-900">Backup Tradicional</th>
                      <th className="px-4 py-4 text-center font-semibold bg-green-700">ExaGrid</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4 text-gray-700 font-medium">Visibilidad del Backup</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600">❌ Visible y vulnerable</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600">✅ Nivel aislado e invisible</span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td className="px-4 py-4 text-gray-700 font-medium">Eliminación de datos</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600">❌ Inmediata</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600">✅ Retardada (Time-Lock)</span>
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-4 text-gray-700 font-medium">Velocidad de recuperación</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600">❌ Días o semanas</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600">✅ Horas (Landing Zone)</span>
                      </td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-4 text-gray-700 font-medium">Inmutabilidad real</td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-red-600">❌ No garantizada</span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="text-green-600">✅ Objetos inmutables</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Conclusión */}
            <section className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl p-8 sm:p-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4 flex items-center">
                <span className="text-3xl mr-3">🎯</span>
                Conclusión: No te la juegues con tus datos
              </h2>
              <p className="text-gray-700 text-lg leading-relaxed">
                En el panorama actual, la pregunta no es <em>si</em> sufrirás un ciberataque, sino <em>cuándo</em>. 
                Confiar en un sistema de backup que no ha sido diseñado específicamente para combatir el ransomware 
                es una apuesta demasiado arriesgada. La arquitectura multicapa de ExaGrid ofrece una de las defensas 
                más sólidas y una de las estrategias de recuperación más rápidas del mercado.
              </p>
              <p className="text-gray-900 font-bold text-lg mt-4">
                Es la diferencia entre ser una estadística más del ransomware y poder restaurar tus operaciones 
                en cuestión de horas, no de semanas.
              </p>
            </section>

            {/* CTA */}
            <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center shadow-xl">
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                🛡️ Protege tu activo más valioso
              </h3>
              <p className="text-orange-100 text-lg mb-8 max-w-2xl mx-auto">
                Tus datos son el corazón de tu negocio. ¿Estás seguro de que tu estrategia de backup actual 
                puede resistir un ataque de ransomware moderno?
              </p>
              <Link 
                href="/contacto?auditoria=backup" 
                className="inline-flex items-center justify-center px-8 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Solicitar Auditoría de Backup Gratuita
              </Link>
            </section>

            {/* Referencias */}
            <section className="border-t border-gray-200 pt-8">
              <h4 className="text-lg font-bold text-gray-900 mb-4">📚 Referencias</h4>
              <ol className="list-decimal pl-5 space-y-2 text-sm text-gray-600">
                <li>
                  <span className="font-semibold">ExaGrid.</span> (s.f.). <a href="https://www.exagrid.com/exagrid-products/ai-powered-retention-time-lock-for-ransomware-recovery/" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">AI-Powered Retention Time-Lock for Ransomware Recovery</a>.
                </li>
                <li>
                  <span className="font-semibold">ESG.</span> (2024). <a href="https://www.exagrid.com/wp-content/uploads/ESG-Technical-Review-ExaGrid-Retention_Time-Lock_for_Ransomware_Recovery.pdf" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">ExaGrid Retention Time-Lock for Ransomware Recovery - Technical Review</a>.
                </li>
              </ol>
            </section>

          </article>

          {/* Artículos relacionados */}
          <section className="mt-16 pt-12 border-t border-gray-200">
            <h3 className="text-2xl font-bold text-gray-900 mb-8">Artículos relacionados</h3>
            <div className="grid sm:grid-cols-2 gap-6">
              <Link href="/recursos/blog/tendencias-comunicaciones-2026" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Tendencias</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    5 tendencias en Comunicaciones Unificadas que marcarán 2026
                  </h4>
                </div>
              </Link>
              <Link href="/recursos/blog/conexion-respaldo-senales" className="group">
                <div className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-500 hover:shadow-lg transition-all">
                  <span className="text-sm text-orange-600 font-semibold">Conectividad</span>
                  <h4 className="text-lg font-bold text-gray-900 mt-2 group-hover:text-orange-600 transition-colors">
                    5 señales de que tu empresa necesita una conexión de respaldo
                  </h4>
                </div>
              </Link>
            </div>
          </section>

        </div>
      </div>

      <EmpresaFooter />
    </div>
  );
}
