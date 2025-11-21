import Link from'use client';
import HeaderSimplificado from '@/components/HeaderSimplificado';

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <HeaderSimplificado />


      {/* Hero */}
      <section className="relative bg-cover bg-center h-[600px] flex items-center" 
        style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1600')"}}>
        <div className="container mx-auto px-4 text-center text-white">
          <h1 className="text-6xl font-bold mb-6">
            Cero Riesgo, empieza con<br/>saber la verdad.
          </h1>
          <div className="flex justify-center gap-8 mb-8 text-lg">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Vulnerabilidades IT
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Backups
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Conectividad
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">✓</span> Servicios Contratados
            </div>
          </div>
          <a 
            href="/cero-riesgos/cotizar" 
            className="inline-block bg-orange-500 text-white px-10 py-4 rounded text-xl font-bold hover:bg-orange-600"
            
            
          >
            SOLICITAR COTIZACIÓN<br/>
            <span className="text-sm">por 790€</span>
          </a>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-12 text-center">
            <div>
              <div className="text-6xl font-bold text-orange-500 mb-2">6,340+</div>
              <div className="text-gray-600">Clientes atendidos</div>
            </div>
            <div>
              <div className="text-6xl font-bold text-orange-500 mb-2">19</div>
              <div className="text-gray-600">Años de experiencia</div>
            </div>
            <div>
              <div className="text-6xl font-bold text-orange-500 mb-2">+39,567€</div>
              <div className="text-gray-600">Pérdida media por ciberataque a empresas españolas</div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-5xl font-bold mb-6">
                Esto no es un servicio convencional. Esto va de proteger lo que has construido
              </h2>
              <div className="h-1 w-20 bg-orange-500 mb-6"></div>
            </div>
            <div className="text-lg text-gray-700 space-y-4">
              <p>
                Analizamos tu despacho desde dentro: telecomunicaciones, ciberseguridad, copias de seguridad y vulnerabilidades técnicas. Sin adornos, sin letra pequeña. Te entregamos un informe claro, profesional y ordenado por prioridades.
              </p>
              <p>
                Te diremos lo que funciona, lo que no, y lo que debes corregir antes de que un fallo técnico se convierta en un problema irreversible.
              </p>
              <p className="font-bold">
                Por solo 790 €, accedes a una auditoría estratégica real, diseñada para darte control y prevenir pérdidas. Porque tu empresa no puede permitirse un error evitable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section with Image */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <img 
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800" 
                alt="Especialista" 
                className="rounded-lg shadow-lg"
              />
            </div>
            <div>
              <h2 className="text-4xl font-bold mb-6">
                Reúnete con nuestro especialista
              </h2>
              <p className="text-lg text-gray-700 mb-8">
                En menos de 12 horas nos pondremos en contacto contigo para agendar la reunión. Durante esa llamada te explicaremos todo el proceso y resolveremos tus dudas. Y en un máximo de 48 horas recibirás un informe claro con el análisis completo y las recomendaciones para tu despacho.
              </p>
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20proteger%20mi%20empresa%20con%20el%20servicio%20Cero%20Riesgos" 
                className="inline-block bg-orange-500 text-white px-8 py-4 rounded text-lg font-bold hover:bg-orange-600"
                target="_blank"
                rel="noopener noreferrer"
              >
                SÍ, QUIERO PROTEGER MI EMPRESA<br/>
                <span className="text-sm">por 790€</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-4">
            Adáptate al presente digital. Protege lo que has construido.
          </h2>
          <p className="text-center text-gray-600 mb-12 text-lg">
            Te ayudamos a evaluar tus riesgos IT, ciberseguridad y conectividad con un informe profesional y directo en 48 h.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-xl font-bold mb-3">Diagnóstico Real</h3>
              <p className="text-gray-600">
                Análisis técnico completo de tu ciberseguridad, backups, conectividad y servicios IT.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-4xl mb-4">📄</div>
              <h3 className="text-xl font-bold mb-3">Informe Claro</h3>
              <p className="text-gray-600">
                Te entregamos un documento ordenado por prioridades, sin tecnicismos ni letra pequeña.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-xl font-bold mb-3">Prevención de Riesgos</h3>
              <p className="text-gray-600">
                Detectamos brechas antes de que causen pérdidas económicas o paradas operativas.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-bold mb-3">Aumenta tus beneficios</h3>
              <p className="text-gray-600">
                790 € por un análisis completo. Sin sobrecostes, sin sorpresas.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-4xl mb-4">⚡</div>
              <h3 className="text-xl font-bold mb-3">Tiempo Exprés</h3>
              <p className="text-gray-600">
                En 48 horas recibirás toda la información necesaria para tomar decisiones con criterio.
              </p>
            </div>
            
            <div className="bg-white p-8 rounded-lg shadow-lg">
              <div className="text-4xl mb-4">🤝</div>
              <h3 className="text-xl font-bold mb-3">Acompañamiento Real</h3>
              <p className="text-gray-600">
                Un especialista se reunirá contigo para explicarte el proceso y resolver tus dudas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12">
            ¿Cómo funciona nuestro servicio Cero Riesgo?
          </h2>
          <p className="text-center text-gray-600 mb-16 text-lg max-w-3xl mx-auto">
            Un proceso simple para proteger lo que has construido. Desde una reunión inicial hasta un informe técnico en 48 h con todo lo que necesitas saber y mejorar.
          </p>
          
          <div className="space-y-12">
            <div className="flex gap-8 items-start">
              <div className="text-6xl font-bold text-orange-500 opacity-20">01</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3">Reunión inicial</h3>
                <p className="text-gray-700">
                  Escuchamos tu situación actual. Agendamos una llamada para entender el estado de tu despacho, tus herramientas y preocupaciones principales.
                </p>
              </div>
            </div>
            
            <div className="flex gap-8 items-start">
              <div className="text-6xl font-bold text-orange-500 opacity-20">02</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3">Análisis técnico</h3>
                <p className="text-gray-700">
                  Evaluamos seguridad, backups, conectividad, software, y servicios contratados. Sin instalar nada y sin interrumpir tu actividad.
                </p>
              </div>
            </div>
            
            <div className="flex gap-8 items-start">
              <div className="text-6xl font-bold text-orange-500 opacity-20">03</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3">Informe con prioridades</h3>
                <p className="text-gray-700">
                  Te damos un diagnóstico claro y accionable. Identificamos qué está bien, qué necesita mejorar y qué riesgos requieren acción urgente. Todo ordenado por impacto y urgencia.
                </p>
              </div>
            </div>
            
            <div className="flex gap-8 items-start">
              <div className="text-6xl font-bold text-orange-500 opacity-20">04</div>
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3">Entrega en 48 h</h3>
                <p className="text-gray-700">
                  Te lo explicamos personalmente. En menos de 2 días, tendrás el informe completo en tus manos. Además, te lo explicamos por videollamada para que sepas cómo actuar desde ya.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-4">
            Confían en nosotros. Esto es lo que opinan.
          </h2>
          <h3 className="text-2xl text-center text-gray-600 mb-12">
            Confidencialidad ante todo
          </h3>
          <p className="text-center text-gray-600 mb-16 max-w-2xl mx-auto">
            Por razones de confidencialidad, no mostramos públicamente los nombres de nuestros clientes. Si lo necesitas, podemos compartir referencias reales de forma privada.
          </p>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 mb-4 italic">
                &quot;Por 790 €, lo que obtienes es brutal. En dos días teníamos claras las prioridades y qué proveedor nos estaba cobrando de más.&quot;
              </p>
              <p className="font-bold">Asesoría Fiscal</p>
              <p className="text-sm text-gray-500">Madrid</p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 mb-4 italic">
                &quot;Nos dimos cuenta de que teníamos contratados servicios duplicados y mal dimensionados. El informe nos ahorró cientos de euros al mes y nos dio claridad.&quot;
              </p>
              <p className="font-bold">Banca</p>
              <p className="text-sm text-gray-500">Barcelona</p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 mb-4 italic">
                &quot;El informe reveló que nuestras copias se hacían en local, sin encriptar y sin control de fallos. Nos ayudaron a rediseñar todo el sistema sin cambiar de proveedor.&quot;
              </p>
              <p className="font-bold">Gestoría</p>
              <p className="text-sm text-gray-500">Madrid</p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 mb-4 italic">
                &quot;Pensábamos que teníamos copias de seguridad… pero en realidad no se estaban haciendo desde hacía semanas. Gracias al informe lo detectamos a tiempo y ahora dormimos tranquilos.&quot;
              </p>
              <p className="font-bold">Escuela de negocios</p>
              <p className="text-sm text-gray-500">Valencia</p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 mb-4 italic">
                &quot;No sabíamos que teníamos tantos puntos débiles hasta que vimos el informe. Muy profesional, rápido y útil.&quot;
              </p>
              <p className="font-bold">Empresa Constructora</p>
              <p className="text-sm text-gray-500">Madrid</p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-700 mb-4 italic">
                &quot;Sin tecnicismos, sin vender humo. Nos dijeron lo que estaba bien, lo que no, y cómo actuar. Muy recomendable.&quot;
              </p>
              <p className="font-bold">Cadena de restaurantes</p>
              <p className="text-sm text-gray-500">Cataluña</p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="contacto" className="py-20 bg-orange-500 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Protege tu empresa antes de que sea tarde
          </h2>
          <p className="text-xl mb-8">
            Solicita tu informe técnico por 790 €. En 48 horas sabrás dónde estás y qué debes mejorar.
          </p>
          <a 
            href="https://wa.me/34655100400?text=Hola,%20quiero%20reservar%20el%20servicio%20Cero%20Riesgos%20por%20790€.%20¿Cuándo%20podemos%20hablar?" 
            className="inline-block bg-white text-orange-500 px-10 py-4 rounded text-xl font-bold hover:bg-gray-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            SOLICITAR COTIZACIÓN POR 790€
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; 2025 Internet Operadores. Todos los derechos reservados.</p>
          <p className="text-sm text-gray-400 mt-2">
            Paseo De La Habana 26 1-1. 28036, Madrid. España
          </p>
        </div>
      </footer>
    </div>
  );
}
