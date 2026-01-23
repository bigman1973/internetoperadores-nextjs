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
                Servicios Profesionales
              </span>
              <span className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                Despacho de abogados
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Comunicaciones unificadas con Wildix para un despacho de abogados multisede
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed">
              Cómo ayudamos a un despacho de abogados con 4 oficinas a unificar sus comunicaciones, 
              mejorar la colaboración entre equipos y proyectar una imagen profesional unificada.
            </p>
          </div>
        </div>
      </div>

      {/* Imagen destacada */}
      <div className="container mx-auto px-4 sm:px-6 -mt-4 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden shadow-xl">
            <img 
              src="/images/casos-exito/servicios-profesionales.jpg" 
              alt="Despacho de abogados moderno" 
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
              Un despacho de abogados especializado en derecho mercantil y fiscal, con más de 50 profesionales 
              distribuidos en 4 oficinas (Barcelona, Madrid, Valencia y Palma de Mallorca), necesitaba modernizar 
              su sistema de comunicaciones. La centralita tradicional estaba obsoleta, cada oficina funcionaba 
              como una isla y la imagen de marca se diluía con números de teléfono diferentes en cada ubicación.
            </p>
          </div>

          {/* El desafío */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">El desafío</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              El crecimiento del despacho había sido orgánico, y cada nueva oficina se había equipado de forma 
              independiente. El resultado era un mosaico de sistemas que dificultaba la colaboración y proyectaba 
              una imagen fragmentada ante los clientes.
            </p>

            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">Principales problemas detectados:</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>4 centralitas diferentes:</strong> Cada oficina tenía su propio sistema, con proveedores y contratos distintos.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Transferencias imposibles:</strong> No se podían transferir llamadas entre oficinas, obligando a dar otro número al cliente.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Sin movilidad:</strong> Los abogados no podían atender llamadas del despacho desde fuera de la oficina.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Videoconferencia caótica:</strong> Cada profesional usaba su herramienta preferida (Zoom, Meet, Teams), sin estándar.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Imagen de marca diluida:</strong> 4 números de teléfono diferentes, 4 mensajes de bienvenida distintos.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* La solución */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Nuestra solución</h2>
            
            <p className="text-gray-700 leading-relaxed mb-8">
              Implementamos Wildix como plataforma de comunicaciones unificadas, integrando voz, vídeo, 
              chat y colaboración en una única solución cloud que conecta todas las oficinas como si 
              fueran una sola.
            </p>

            {/* Fase 1 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 1</span>
                <h3 className="text-xl font-bold text-gray-900">Auditoría y diseño de la solución</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Analizamos los flujos de comunicación del despacho: volumen de llamadas, patrones de uso, 
                necesidades de cada departamento (litigación, fiscal, mercantil, laboral) y requisitos 
                de integración con el software de gestión de expedientes.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Resultado:</strong> Plan de numeración unificado y diseño de IVR personalizado por departamento
                </p>
              </div>
            </div>

            {/* Fase 2 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 2</span>
                <h3 className="text-xl font-bold text-gray-900">Despliegue de Wildix Cloud</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Configuramos la centralita Wildix en la nube con un número principal único (900) y extensiones 
                para cada profesional. Instalamos teléfonos IP en las mesas y configuramos la app móvil para 
                que cada abogado pueda atender llamadas desde cualquier lugar.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Movilidad total:</strong> Llamadas del despacho atendidas desde el móvil con el número corporativo
                </p>
              </div>
            </div>

            {/* Fase 3 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 3</span>
                <h3 className="text-xl font-bold text-gray-900">Integración con herramientas de trabajo</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Integramos Wildix con el software de gestión de expedientes del despacho, permitiendo 
                identificar al cliente que llama, ver su historial y registrar automáticamente las 
                comunicaciones en el expediente correspondiente.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>CTI integrado:</strong> Popup con información del cliente al recibir llamada
                </p>
              </div>
            </div>

            {/* Fase 4 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 4</span>
                <h3 className="text-xl font-bold text-gray-900">Videoconferencia y colaboración</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Configuramos salas de videoconferencia virtuales para cada socio y departamento, con URLs 
                personalizadas y branding del despacho. También habilitamos el chat interno y la compartición 
                de documentos de forma segura.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Imagen profesional:</strong> meet.despacho.com/socio-garcia con branding corporativo
                </p>
              </div>
            </div>
          </section>

          {/* Resultados */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Resultados obtenidos</h2>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">1</p>
                <p className="text-green-800 font-medium">Número único para 4 oficinas</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">100%</p>
                <p className="text-green-800 font-medium">Movilidad para los abogados</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">-40%</p>
                <p className="text-green-800 font-medium">Reducción en costes de telefonía</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">+25%</p>
                <p className="text-green-800 font-medium">Mejora en satisfacción de clientes</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-6 sm:p-8">
              <svg className="w-10 h-10 text-orange-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p className="text-lg leading-relaxed text-gray-700 italic mb-4">
                "Antes, cuando un cliente llamaba a Barcelona y su abogado estaba en Madrid, le dábamos 
                otro número. Ahora transferimos la llamada en un clic, o el abogado la atiende desde 
                su móvil como si estuviera en la oficina. La experiencia del cliente ha mejorado enormemente."
              </p>
              <p className="text-gray-500 font-medium">— Socio Director</p>
            </div>
          </section>

          {/* Funcionalidades destacadas */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Funcionalidades implementadas</h2>
            
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Número único 900</p>
                <p className="text-sm text-gray-600">Una sola línea para todas las oficinas</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">App móvil Wildix</p>
                <p className="text-sm text-gray-600">Llamadas corporativas desde el smartphone</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Videoconferencia HD</p>
                <p className="text-sm text-gray-600">Salas virtuales con branding propio</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Integración CRM</p>
                <p className="text-sm text-gray-600">Popup con datos del cliente al llamar</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Grabación de llamadas</p>
                <p className="text-sm text-gray-600">Para cumplimiento y formación</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Chat interno</p>
                <p className="text-sm text-gray-600">Comunicación instantánea entre equipos</p>
              </div>
            </div>
          </section>

          {/* Tecnologías utilizadas */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Tecnologías implementadas</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Wildix</p>
                <p className="text-sm text-gray-600">UCaaS Cloud</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Teléfonos IP</p>
                <p className="text-sm text-gray-600">Wildix Vision</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">WebRTC</p>
                <p className="text-sm text-gray-600">Llamadas desde navegador</p>
              </div>
            </div>
          </section>

          {/* Nota de confidencialidad */}
          <section className="mb-12">
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <p className="text-gray-600 text-sm">
                Por motivos de confidencialidad, no publicamos el nombre del despacho. 
                Si desea conocer más detalles sobre este caso o solicitar referencias directas, 
                estaremos encantados de facilitárselas bajo petición.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">¿Tu despacho necesita modernizar las comunicaciones?</h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Podemos ayudarte a implementar una solución de comunicaciones unificadas con Wildix. 
              Solicita una demo gratuita y descubre cómo mejorar la experiencia de tus clientes.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20demo%20de%20Wildix%20para%20mi%20despacho"
                className="inline-flex items-center justify-center bg-white text-orange-600 px-8 py-4 rounded-xl font-bold hover:bg-gray-100 transition-colors"
              >
                Solicitar Demo Gratuita
              </a>
              <Link 
                href="/soluciones/comunicaciones-unificadas"
                className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-4 rounded-xl font-bold hover:bg-white/10 transition-colors"
              >
                Conocer más sobre Wildix
              </Link>
            </div>
          </section>

        </div>
      </div>

      <EmpresaFooter />
    </div>
  );
}
