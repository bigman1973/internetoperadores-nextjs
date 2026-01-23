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
                Retail
              </span>
              <span className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                Cadena de tiendas
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Conectividad unificada para una cadena de 25 tiendas con SD-WAN
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed">
              Cómo ayudamos a una cadena de retail de moda a unificar la conectividad de todas sus tiendas, 
              reduciendo costes y mejorando la gestión centralizada con una solución SD-WAN.
            </p>
          </div>
        </div>
      </div>

      {/* Imagen destacada */}
      <div className="container mx-auto px-4 sm:px-6 -mt-4 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden shadow-xl">
            <img 
              src="/images/casos-exito/retail-tiendas.jpg" 
              alt="Interior de tienda de moda moderna" 
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
              Una cadena de retail especializada en moda con 25 tiendas distribuidas por toda España se enfrentaba 
              a un problema común en el sector: cada tienda tenía su propio proveedor de internet, con contratos, 
              velocidades y niveles de servicio diferentes. Esto dificultaba la gestión centralizada, generaba 
              costes administrativos elevados y provocaba incidencias constantes que afectaban a las ventas.
            </p>
          </div>

          {/* El desafío */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">El desafío</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              La expansión de la cadena había sido rápida, y en cada nueva apertura se contrataba el proveedor 
              disponible en la zona sin una estrategia global de conectividad. El resultado era un mosaico de 
              proveedores, tecnologías y contratos que hacía imposible una gestión eficiente.
            </p>

            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">Principales problemas detectados:</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Fragmentación de proveedores:</strong> 8 operadores diferentes para 25 tiendas, con 8 facturas mensuales y 8 interlocutores distintos.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Velocidades dispares:</strong> Desde 50 Mbps en tiendas urbanas hasta 10 Mbps en localizaciones rurales, afectando a la experiencia de cliente.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Sin conexión de respaldo:</strong> Una caída de internet significaba TPVs sin funcionar y pérdida directa de ventas.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>VPN inestable:</strong> El acceso al ERP central desde las tiendas era lento y con frecuentes desconexiones.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Coste elevado:</strong> El gasto total en conectividad superaba los 3.500€/mes sin incluir los costes ocultos de gestión.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* La solución */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Nuestra solución</h2>
            
            <p className="text-gray-700 leading-relaxed mb-8">
              Diseñamos una arquitectura SD-WAN que unificaba todas las tiendas bajo una única plataforma de gestión, 
              con conectividad redundante y priorización inteligente del tráfico crítico para el negocio.
            </p>

            {/* Fase 1 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 1</span>
                <h3 className="text-xl font-bold text-gray-900">Auditoría y diseño de arquitectura</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Analizamos la situación de cada tienda: ubicación, cobertura de operadores, tráfico generado, 
                aplicaciones críticas y requisitos específicos. Con esta información, diseñamos una arquitectura 
                SD-WAN con doble conexión (fibra + 4G/5G de respaldo) para cada ubicación.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Resultado:</strong> Mapa de conectividad de 25 tiendas con solución personalizada para cada una
                </p>
              </div>
            </div>

            {/* Fase 2 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 2</span>
                <h3 className="text-xl font-bold text-gray-900">Despliegue de equipamiento SD-WAN</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Instalamos routers SD-WAN en cada tienda con capacidad para gestionar múltiples conexiones WAN, 
                failover automático y priorización de tráfico. El despliegue se realizó de forma escalonada, 
                tienda por tienda, sin interrumpir la operativa comercial.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Failover:</strong> Cambio automático a 4G/5G en menos de 3 segundos si cae la fibra
                </p>
              </div>
            </div>

            {/* Fase 3 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 3</span>
                <h3 className="text-xl font-bold text-gray-900">Configuración de políticas y QoS</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Configuramos políticas de calidad de servicio (QoS) para priorizar el tráfico crítico: TPVs, 
                acceso al ERP, cámaras de seguridad. El tráfico de navegación general y actualizaciones se 
                enruta por la conexión secundaria cuando la principal está ocupada.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Prioridad máxima:</strong> TPVs y ERP siempre con ancho de banda garantizado
                </p>
              </div>
            </div>

            {/* Fase 4 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 4</span>
                <h3 className="text-xl font-bold text-gray-900">Panel de gestión centralizada</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Implementamos un panel de control centralizado donde el equipo de IT puede ver el estado de 
                todas las tiendas en tiempo real, recibir alertas proactivas, aplicar cambios de configuración 
                masivos y generar informes de rendimiento.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Visibilidad:</strong> 25 tiendas monitorizadas desde un único dashboard
                </p>
              </div>
            </div>
          </section>

          {/* Resultados */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Resultados obtenidos</h2>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">-35%</p>
                <p className="text-green-800 font-medium">Reducción en costes de conectividad</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">99,9%</p>
                <p className="text-green-800 font-medium">Disponibilidad de red garantizada</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">1</p>
                <p className="text-green-800 font-medium">Única factura y único interlocutor</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">0</p>
                <p className="text-green-800 font-medium">Ventas perdidas por caídas de red</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-6 sm:p-8">
              <svg className="w-10 h-10 text-orange-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p className="text-lg leading-relaxed text-gray-700 italic mb-4">
                "Antes, cada vez que había un problema de internet en una tienda, era un caos: no sabíamos 
                a quién llamar, cada operador echaba la culpa al otro. Ahora tenemos un único número de 
                teléfono y un panel donde vemos todo en tiempo real. La tranquilidad no tiene precio."
              </p>
              <p className="text-gray-500 font-medium">— Director de Sistemas</p>
            </div>
          </section>

          {/* Tecnologías utilizadas */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Tecnologías implementadas</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">SD-WAN</p>
                <p className="text-sm text-gray-600">Conectividad inteligente</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">4G/5G Backup</p>
                <p className="text-sm text-gray-600">Conexión de respaldo</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">QoS Avanzado</p>
                <p className="text-sm text-gray-600">Priorización de tráfico</p>
              </div>
            </div>
          </section>

          {/* Nota de confidencialidad */}
          <section className="mb-12">
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <p className="text-gray-600 text-sm">
                Por motivos de confidencialidad, no publicamos el nombre de la cadena. 
                Si desea conocer más detalles sobre este caso o solicitar referencias directas, 
                estaremos encantados de facilitárselas bajo petición.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">¿Gestionas múltiples ubicaciones?</h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Podemos ayudarte a unificar la conectividad de todas tus sedes con una solución SD-WAN. 
              Solicita una auditoría gratuita y descubre cuánto puedes ahorrar.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20auditoría%20SD-WAN%20para%20mis%20tiendas"
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
