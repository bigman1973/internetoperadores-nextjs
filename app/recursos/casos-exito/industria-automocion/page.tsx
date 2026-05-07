"use client";
import Link from 'next/link';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

export default function CasoExitoPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      {/* Hero del caso de éxito */}
      <div className="pt-8 pb-12 bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <Link href="/recursos/casos-exito" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-6 group">
              <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Casos de Éxito
            </Link>
            
            <div className="flex flex-wrap gap-3 mb-6">
              <span className="inline-flex items-center bg-gray-800 text-white px-4 py-2 rounded-full text-sm font-semibold">
                Industria
              </span>
              <span className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                Automoción
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Transformación digital de la infraestructura de red en un fabricante de componentes de automoción
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed">
              Cómo ayudamos a un fabricante multinacional de componentes de automoción con presencia en Europa, 
              Centroamérica y Asia, donde cada robot puede superar los 10 millones de euros de valor, 
              a modernizar su infraestructura de comunicaciones pasando del caos a la excelencia operativa.
            </p>
          </div>
        </div>
      </div>

      {/* Imagen destacada */}
      <div className="container mx-auto px-4 sm:px-6 -mt-4 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden shadow-xl">
            <img 
              src="/images/casos-exito/industria-automocion.jpg" 
              alt="Robots industriales en línea de producción de automoción" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
          </div>
        </div>
      </div>

      {/* Contenido del caso de éxito */}
      <div className="container mx-auto px-4 sm:px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          
          {/* Resumen ejecutivo */}
          <div className="bg-gray-50 border-l-4 border-gray-800 p-6 sm:p-8 rounded-r-xl mb-12">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Resumen ejecutivo</h2>
            <p className="text-gray-700 leading-relaxed">
              Un fabricante multinacional líder en la producción de motores y componentes para la industria del automóvil, 
              con centros de fabricación en Europa, Centroamérica y Asia, se enfrentaba a una infraestructura de red 
              obsoleta que ponía en riesgo la operatividad de sus líneas de producción automatizadas. Cada centro cuenta 
              con más de 10 robots industriales, donde un solo robot puede superar los 10 millones de euros de valor. 
              La red había crecido de forma desordenada durante años y la situación requería una intervención integral.
            </p>
          </div>

          {/* El desafío */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">El desafío</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              Cuando realizamos la primera auditoría de la infraestructura, nos encontramos con lo que internamente 
              denominamos "un galimatías tecnológico". Es importante señalar que esta situación no era responsabilidad 
              del departamento de IT, que hacía un trabajo encomiable con los recursos disponibles, sino el resultado 
              de años de crecimiento orgánico sin una planificación estratégica de la infraestructura.
            </p>

            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">Principales problemas detectados:</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Red física obsoleta:</strong> Cableado de más de 15 años sin certificar, con múltiples puntos de fallo y sin redundancia.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Segmentación inexistente:</strong> Tráfico de oficinas, producción y visitantes compartiendo la misma red sin aislamiento.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>WiFi doméstico en entorno industrial:</strong> Puntos de acceso Ubiquiti de gama doméstica que no soportaban la densidad de dispositivos ni las interferencias del entorno fabril.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Conectividad sin garantías:</strong> Una única línea de fibra sin SLA definido ni conexión de respaldo.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Riesgo operativo crítico:</strong> Cualquier caída de red podía detener robots que cuestan más de 10 millones de euros, con pérdidas de producción de miles de euros por hora.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* La solución */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Nuestra solución: Un enfoque por fases</h2>
            
            <p className="text-gray-700 leading-relaxed mb-8">
              Diseñamos un plan de transformación en cuatro fases que permitiera modernizar la infraestructura 
              sin interrumpir la producción, minimizando riesgos y maximizando el retorno de la inversión.
            </p>

            {/* Fase 1 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 1</span>
                <h3 className="text-xl font-bold text-gray-900">Consultoría y auditoría técnica</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Realizamos un análisis exhaustivo de toda la infraestructura existente, documentando cada punto de red, 
                cada dispositivo y cada flujo de tráfico. Identificamos los puntos críticos y diseñamos una arquitectura 
                de red moderna que cumpliera con los estándares industriales y las necesidades específicas del cliente.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Duración:</strong> 4 semanas | <strong>Entregables:</strong> Informe de auditoría, diseño de arquitectura, plan de migración
                </p>
              </div>
            </div>

            {/* Fase 2 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 2</span>
                <h3 className="text-xl font-bold text-gray-900">Estabilización de la infraestructura física</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Renovamos completamente el cableado estructurado con certificación Cat6A, instalamos switches industriales 
                con capacidad PoE++ para alimentar dispositivos de planta, y creamos una segmentación de red mediante VLANs 
                que aislaba el tráfico de producción, oficinas, invitados y sistemas críticos.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Duración:</strong> 8 semanas | <strong>Trabajo:</strong> Realizado en horarios de baja producción para minimizar impacto
                </p>
              </div>
            </div>

            {/* Fase 3 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 3</span>
                <h3 className="text-xl font-bold text-gray-900">Implementación de WiFi profesional</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Sustituimos los puntos de acceso Ubiquiti por una solución WiFi empresarial Ruckus, diseñada específicamente 
                para entornos industriales con alta interferencia electromagnética. La tecnología BeamFlex+ de Ruckus 
                garantiza una cobertura estable incluso en zonas con maquinaria pesada y estructuras metálicas.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Duración:</strong> 3 semanas | <strong>Resultado:</strong> Cobertura 100% de las naves con roaming seamless
                </p>
              </div>
            </div>

            {/* Fase 4 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 4</span>
                <h3 className="text-xl font-bold text-gray-900">Migración a SD-WAN con garantías máximas</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Implementamos una solución SD-WAN con doble conexión de fibra de operadores independientes, garantizando 
                un SLA del 99,9% de disponibilidad. El sistema balancea automáticamente el tráfico entre ambas líneas 
                y realiza failover instantáneo en caso de caída, asegurando que los sistemas de producción nunca pierdan 
                conectividad.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>SLA garantizado:</strong> 99,9% | <strong>Tiempo de failover:</strong> &lt; 1 segundo
                </p>
              </div>
            </div>
          </section>

          {/* Resultados */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Resultados obtenidos</h2>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">99,9%</p>
                <p className="text-green-800 font-medium">Disponibilidad de red garantizada</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">0</p>
                <p className="text-green-800 font-medium">Paradas de producción por red en 18 meses</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">100%</p>
                <p className="text-green-800 font-medium">Cobertura WiFi en todas las naves</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">&lt;1s</p>
                <p className="text-green-800 font-medium">Tiempo de failover entre conexiones</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-6 sm:p-8">
              <svg className="w-10 h-10 text-orange-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p className="text-lg leading-relaxed text-gray-700 italic mb-4">
                "Antes vivíamos con el miedo constante de que una caída de red paralizara la producción. 
                Ahora tenemos la tranquilidad de saber que nuestra infraestructura está preparada para soportar 
                las exigencias de la Industria 4.0. La inversión se ha amortizado con creces."
              </p>
              <p className="text-gray-500 font-medium">— Director de Operaciones</p>
            </div>
          </section>

          {/* Tecnologías utilizadas */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Tecnologías implementadas</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Ruckus Networks</p>
                <p className="text-sm text-gray-600">WiFi empresarial</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">SD-WAN</p>
                <p className="text-sm text-gray-600">Conectividad inteligente</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">VLANs industriales</p>
                <p className="text-sm text-gray-600">Segmentación de red</p>
              </div>
            </div>
          </section>

          {/* Nota de confidencialidad */}
          <section className="mb-12">
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <p className="text-gray-600 text-sm">
                Por motivos de confidencialidad, no publicamos el nombre de la empresa. 
                Si desea conocer más detalles sobre este caso o solicitar referencias directas, 
                estaremos encantados de facilitárselas bajo petición.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">¿Tu empresa tiene desafíos similares?</h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Podemos ayudarte a transformar tu infraestructura de comunicaciones. 
              Solicita una auditoría gratuita y descubre cómo optimizar tu red.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20auditoría%20de%20infraestructura"
                className="inline-flex items-center justify-center bg-white text-orange-600 px-8 py-4 rounded-xl font-bold hover:bg-gray-100 transition-colors"
              >
                Solicitar Auditoría Gratuita
              </a>
              <Link 
                href="/contacto"
                className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-4 rounded-xl font-bold hover:bg-white/10 transition-colors"
              >
                Contactar con un especialista
              </Link>
            </div>
          </section>

        </div>
      </div>

      <EmpresaFooter />
    </div>
  );
}
