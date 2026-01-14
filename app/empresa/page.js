import Header from '@/components/Header';

export default function Empresa() {
  return (
    <div className="min-h-screen bg-white">
      <Header />

      {/* Hero */}
      <section className="py-12 md:py-20 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 leading-tight">
            FanSáticos del control
          </h1>
          <p className="text-xl md:text-2xl mb-6 md:mb-8 max-w-3xl mx-auto">
            Nacimos como operadores. Vivimos conectados.
          </p>
          <div className="h-1 w-32 bg-orange-500 mx-auto"></div>
        </div>
      </section>

      {/* Nuestra Esencia */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 md:mb-6">
                Más de 25 años protegiendo empresas
              </h2>
              <div className="h-1 w-20 bg-orange-500 mb-4 md:mb-6"></div>
              <p className="text-base md:text-lg text-gray-700 mb-4 leading-relaxed">
                Internet Operadores nació con vocación de operador de telecomunicaciones. No somos una empresa de IT que ofrece conectividad como servicio adicional. Somos operadores que entendemos la tecnología desde su base: la red.
              </p>
              <p className="text-base md:text-lg text-gray-700 mb-4 leading-relaxed">
                Esta perspectiva nos permite ver lo que otros no ven. Detectamos problemas antes de que ocurran, optimizamos infraestructuras que otros consideran &quot;suficientes&quot; y protegemos empresas con criterio técnico real, no con soluciones genéricas.
              </p>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                Trabajamos con empresas que entienden que la tecnología no es un gasto, sino la columna vertebral de su operación. Y que un fallo técnico puede costar mucho más que cualquier inversión en prevención.
              </p>
            </div>
            <div className="bg-gray-100 p-6 md:p-8 rounded-lg">
              <div className="grid grid-cols-2 gap-6 md:gap-8 text-center">
                <div>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-orange-500 mb-2">+25</div>
                  <div className="text-sm md:text-base text-gray-600">Años de experiencia</div>
                </div>
                <div>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-orange-500 mb-2">+6,340</div>
                  <div className="text-sm md:text-base text-gray-600">Clientes atendidos</div>
                </div>
                <div>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-orange-500 mb-2">24/7</div>
                  <div className="text-sm md:text-base text-gray-600">Monitorización continua</div>
                </div>
                <div>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-bold text-orange-500 mb-2">100%</div>
                  <div className="text-sm md:text-base text-gray-600">Telecomunicaciones</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Vocación Operadora */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-8 md:mb-16">
            Vocación operadora 24/7
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-5xl mx-auto">
            <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
              <div className="text-3xl md:text-4xl mb-4">🔄</div>
              <h3 className="text-xl md:text-2xl font-bold mb-4">Continuidad sin pausas</h3>
              <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                Nacimos como operadores. Vivimos conectados. Nuestra esencia está en la continuidad: los servicios no paran y nosotros tampoco. Vigilamos, prevenimos e intervenimos en tiempo real, los 365 días del año.
              </p>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
              <div className="text-3xl md:text-4xl mb-4">🛡️</div>
              <h3 className="text-xl md:text-2xl font-bold mb-4">Seguridad y mejora constante</h3>
              <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                Más que mantenimiento: inteligencia en tiempo real. Supervisamos tu red para detectar, entender y resolver antes de que el problema exista. Cada alerta es una oportunidad para mejorar y proteger tu negocio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Nuestra Filosofía */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-4 md:mb-6">
            Nuestra filosofía
          </h2>
          <p className="text-center text-lg md:text-xl text-gray-600 mb-8 md:mb-16">
            &quot;Anticiparse es la mejor defensa&quot;
          </p>

          <div className="space-y-6 md:space-y-8">
            <div className="border-l-4 border-orange-500 pl-4 md:pl-6 py-3 md:py-4">
              <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3">No vendemos miedo, damos control</h3>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                No te asustamos con escenarios apocalípticos. Te mostramos la realidad de tu infraestructura IT y te damos un plan claro para mejorarla. Sin tecnicismos innecesarios, sin vender soluciones que no necesitas.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-4 md:pl-6 py-3 md:py-4">
              <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3">Prevención antes que reacción</h3>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                Auditamos, monitorizamos y reforzamos tu entorno digital antes de que ocurra un incidente. Así conviertes la seguridad en una ventaja competitiva, no en una reacción de emergencia.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-4 md:pl-6 py-3 md:py-4">
              <h3 className="text-xl md:text-2xl font-bold mb-2 md:mb-3">Cercanía con criterio técnico</h3>
              <p className="text-base md:text-lg text-gray-700 leading-relaxed">
                Lo suficientemente grandes para ayudarte, lo suficientemente cercanos para conocerte. Cuando te conocemos, sabemos cómo ayudarte de verdad.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Áreas de Especialización */}
      <section className="py-12 md:py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-8 md:mb-16">
            Áreas de especialización
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="text-center">
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-4">100%</div>
              <h3 className="text-lg md:text-xl font-bold mb-3">Telecomunicaciones</h3>
              <p className="text-sm md:text-base text-gray-300 leading-relaxed">
                Fibra, móvil, VoIP, troncales SIP. Evaluamos, optimizamos y gestionamos toda tu conectividad.
              </p>
            </div>

            <div className="text-center">
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-4">89%</div>
              <h3 className="text-lg md:text-xl font-bold mb-3">Infraestructura</h3>
              <p className="text-sm md:text-base text-gray-300 leading-relaxed">
                Diseño, instalación y gestión de redes físicas. Desde el cableado hasta la configuración avanzada.
              </p>
            </div>

            <div className="text-center">
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-4">77%</div>
              <h3 className="text-lg md:text-xl font-bold mb-3">Consultoría IT</h3>
              <p className="text-sm md:text-base text-gray-300 leading-relaxed">
                Auditorías, análisis de riesgos, optimización de presupuestos IT y estrategia tecnológica.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-12 md:py-20 bg-orange-500 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 md:mb-6">
            ¿Hablamos de tu proyecto?
          </h2>
          <p className="text-base md:text-lg lg:text-xl mb-6 md:mb-8 max-w-2xl mx-auto leading-relaxed">
            Cuéntanos tu situación actual y te diremos cómo podemos ayudarte.
          </p>
          <a 
            href="https://wa.me/34655100400?text=Hola,%20quiero%20hablar%20sobre%20mi%20proyecto%20IT" 
            className="inline-block bg-white text-orange-500 px-8 md:px-10 py-3 md:py-4 rounded text-lg md:text-xl font-bold hover:bg-gray-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            CONTACTAR AHORA
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-6 md:py-8 border-t border-gray-800">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm md:text-base">&copy; 2025 Internet Operadores. Todos los derechos reservados.</p>
          <p className="text-xs md:text-sm text-gray-400 mt-2">
            Paseo De La Habana 26 1-1. 28036, Madrid. España
          </p>
        </div>
      </footer>
    </div>
  );
}

