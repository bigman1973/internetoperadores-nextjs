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
                Hostelería
              </span>
              <span className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                Hotel Boutique
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              WiFi de alta densidad para un hotel boutique de 120 habitaciones
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed">
              Cómo transformamos la experiencia de conectividad de los huéspedes, pasando de quejas constantes 
              a valoraciones de 5 estrellas en WiFi, con una solución profesional Ruckus.
            </p>
          </div>
        </div>
      </div>

      {/* Imagen destacada */}
      <div className="container mx-auto px-4 sm:px-6 -mt-4 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden shadow-xl">
            <img 
              src="/images/casos-exito/hosteleria-hotel.jpg" 
              alt="Lobby de hotel boutique moderno" 
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
              Un hotel boutique de 4 estrellas superior con 120 habitaciones en una zona turística de alta demanda 
              sufría un problema crítico: las valoraciones en plataformas como Booking y TripAdvisor mencionaban 
              constantemente el mal funcionamiento del WiFi. En un sector donde la conectividad se ha convertido 
              en un factor decisivo para la elección del alojamiento, esta situación estaba afectando directamente 
              a la ocupación y la reputación del establecimiento.
            </p>
          </div>

          {/* El desafío */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">El desafío</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              El hotel había invertido en una solución WiFi de consumo que, sobre el papel, parecía suficiente. 
              Sin embargo, la realidad era muy diferente: en temporada alta, con el hotel al 100% de ocupación 
              y cada huésped conectando una media de 3-4 dispositivos (móvil, tablet, portátil, smartwatch), 
              la red colapsaba sistemáticamente.
            </p>

            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">Principales problemas detectados:</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Saturación de red:</strong> Los puntos de acceso domésticos no soportaban más de 15-20 dispositivos simultáneos, cuando cada habitación podía tener 4 o más.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Zonas muertas:</strong> El spa, la terraza y algunas habitaciones de esquina no tenían cobertura adecuada.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Roaming deficiente:</strong> Los huéspedes perdían conexión al moverse por las instalaciones, interrumpiendo videollamadas y streaming.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Sin segmentación:</strong> Huéspedes, empleados y sistemas de gestión compartían la misma red, creando riesgos de seguridad.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Impacto en reputación:</strong> Valoración media de WiFi de 2.8/5 en reseñas online, con comentarios negativos recurrentes.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* La solución */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Nuestra solución</h2>
            
            <p className="text-gray-700 leading-relaxed mb-8">
              Diseñamos una solución WiFi profesional basada en tecnología Ruckus, específicamente pensada 
              para entornos de alta densidad como hoteles, con capacidad para gestionar cientos de dispositivos 
              simultáneos manteniendo una experiencia de usuario premium.
            </p>

            {/* Fase 1 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 1</span>
                <h3 className="text-xl font-bold text-gray-900">Site survey y diseño RF</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Realizamos un estudio de radiofrecuencia completo del edificio, identificando las características 
                constructivas (muros de piedra, techos altos, estructuras metálicas) que afectaban a la propagación 
                de la señal. Con esta información, diseñamos la ubicación óptima de cada punto de acceso.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Resultado:</strong> Mapa de calor RF completo y diseño de 45 puntos de acceso estratégicamente ubicados
                </p>
              </div>
            </div>

            {/* Fase 2 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 2</span>
                <h3 className="text-xl font-bold text-gray-900">Despliegue de infraestructura Ruckus</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Instalamos puntos de acceso Ruckus R750 en zonas de alta densidad (lobby, restaurante, salas de reuniones) 
                y R650 en habitaciones y pasillos. La tecnología BeamFlex+ adapta automáticamente los patrones de antena 
                para optimizar la cobertura y minimizar interferencias.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Capacidad:</strong> Hasta 512 dispositivos por punto de acceso | <strong>Roaming:</strong> Seamless entre APs
                </p>
              </div>
            </div>

            {/* Fase 3 */}
            <div className="border-l-4 border-orange-500 pl-6 mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="bg-orange-500 text-white text-sm font-bold px-3 py-1 rounded">FASE 3</span>
                <h3 className="text-xl font-bold text-gray-900">Segmentación y portal cautivo</h3>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                Configuramos tres redes separadas: huéspedes (con portal cautivo personalizado con la imagen del hotel), 
                empleados (con acceso a sistemas internos) y dispositivos IoT (cerraduras, termostatos, TV). 
                Implementamos también un sistema de ancho de banda garantizado por habitación.
              </p>
              <div className="bg-orange-50 rounded-lg p-4">
                <p className="text-sm text-orange-800">
                  <strong>Ancho de banda garantizado:</strong> 50 Mbps simétricos por habitación
                </p>
              </div>
            </div>
          </section>

          {/* Resultados */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Resultados obtenidos</h2>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">4.8/5</p>
                <p className="text-green-800 font-medium">Valoración WiFi en reseñas (antes 2.8)</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">+600</p>
                <p className="text-green-800 font-medium">Dispositivos simultáneos soportados</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">100%</p>
                <p className="text-green-800 font-medium">Cobertura en todas las instalaciones</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-green-700 mb-2">0</p>
                <p className="text-green-800 font-medium">Quejas de WiFi en los últimos 12 meses</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-6 sm:p-8">
              <svg className="w-10 h-10 text-orange-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p className="text-lg leading-relaxed text-gray-700 italic mb-4">
                "El WiFi era nuestro talón de Aquiles. Ahora es uno de nuestros puntos fuertes. Los huéspedes 
                pueden hacer videollamadas desde la piscina, ver Netflix en 4K en la habitación y trabajar 
                desde cualquier rincón del hotel sin problemas. Ha sido una inversión que ha impactado 
                directamente en nuestra reputación online."
              </p>
              <p className="text-gray-500 font-medium">— Director General del Hotel</p>
            </div>
          </section>

          {/* Tecnologías utilizadas */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Tecnologías implementadas</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Ruckus R750/R650</p>
                <p className="text-sm text-gray-600">WiFi 6 alta densidad</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">SmartZone</p>
                <p className="text-sm text-gray-600">Gestión centralizada</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Portal Cautivo</p>
                <p className="text-sm text-gray-600">Personalizado con branding</p>
              </div>
            </div>
          </section>

          {/* Nota de confidencialidad */}
          <section className="mb-12">
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <p className="text-gray-600 text-sm">
                Por motivos de confidencialidad, no publicamos el nombre del establecimiento. 
                Si desea conocer más detalles sobre este caso o solicitar referencias directas, 
                estaremos encantados de facilitárselas bajo petición.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">¿Tu hotel tiene problemas de WiFi?</h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Podemos ayudarte a transformar la experiencia de conectividad de tus huéspedes. 
              Solicita una auditoría gratuita y descubre cómo mejorar tus valoraciones.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20auditoría%20WiFi%20para%20mi%20hotel"
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
