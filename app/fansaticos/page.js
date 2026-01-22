"use client";
import Link from 'next/link';
import Header from '../../../components/Header';

export default function Fansaticos() {
  return (
    <div className="min-h-screen bg-white">
      <Header />


      {/* Hero */}
      <section className="py-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <h1 className="text-6xl font-bold mb-6">FanSáticos</h1>
          <h2 className="text-3xl font-semibold text-gray-800 mb-12">
            FanSáticos por destruir el miedo a que algo acabe con los negocios
          </h2>
        </div>
      </section>

      {/* Miedos Section */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-12">
            
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Tengo miedo de que un día nos hackeen y se lleven toda la información.
              </h3>
              <p className="text-lg text-gray-700">
                Sé que no somos una gran multinacional, pero si entran, pueden dejarme fuera de juego en cuestión de horas.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Estoy pagando servicios IT que ni entiendo ni uso.
              </h3>
              <p className="text-lg text-gray-700">
                Me llegan facturas con nombres raros, me venden cosas con palabras que suenan importantes… y yo firmo, por no quedarme atrás. Pero no sé si me están tomando el pelo.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Mi equipo se queja de que todo va lento, pero no sé qué hacer.
              </h3>
              <p className="text-lg text-gray-700">
                No soy técnico. Sé que las cosas no van bien, pero tampoco quiero que me cobren miles por cambiarlo todo sin garantías.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Lo tengo todo en la nube, pero a veces pienso: ¿y si un día no puedo entrar?
              </h3>
              <p className="text-lg text-gray-700">
                Confío en que todo funcione… hasta que deja de hacerlo. Y entonces no tengo ni idea de a quién llamar.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                No sé si estoy cumpliendo con la protección de datos como debería.
              </h3>
              <p className="text-lg text-gray-700">
                Sé que hay normas, sé que hay multas… pero entre clientes, empleados, emails y mil cosas más, cruzo los dedos para que no me pillen con un descuido.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Si mañana se cae todo, no tengo ni idea de cuánto me costaría realmente.
              </h3>
              <p className="text-lg text-gray-700">
                Hablan de ciberseguros, de tiempo de inactividad… pero yo no tengo ni una hoja con esos números claros. Y eso me inquieta más de lo que admito.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Mi gente usa sus móviles, sus tablets… y nadie controla nada.
              </h3>
              <p className="text-lg text-gray-700">
                Cada uno trabaja como puede, desde donde puede, pero sé que eso es un coladero. Lo sé. Solo que no tengo tiempo para poner orden.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Digo que tengo copias de seguridad… pero no sé si servirían de algo.
              </h3>
              <p className="text-lg text-gray-700">
                Hay backups, sí. Pero no sé si están actualizados, si se revisan, si están bien hechos. Me fío… y eso es un riesgo.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Cuando hablo con algunos proveedores, siento que me están vendiendo aire.
              </h3>
              <p className="text-lg text-gray-700">
                Me lanzan tecnicismos, me proponen soluciones mágicas… y yo tengo que decidir con el estómago, no con información real.
              </p>
            </div>

            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Estoy creciendo, y me preocupa que la tecnología no esté a la altura.
              </h3>
              <p className="text-lg text-gray-700">
                No quiero que el crecimiento se me vuelva en contra porque no invertí a tiempo en lo que no se ve: sistemas, seguridad, estructura.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-5xl font-bold mb-8">
            Un día tuve miedo y lo destruí
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Deja de vivir con la incertidumbre. Descubre exactamente qué riesgos tienes y cómo eliminarlos.
          </p>
          <a 
            href="https://wa.me/34655100400?text=Hola,%20quiero%20destruir%20mis%20miedos%20IT%20con%20el%20servicio%20Cero%20Riesgos" 
            className="inline-block bg-orange-500 text-white px-10 py-4 rounded text-xl font-bold hover:bg-orange-600"
            target="_blank"
            rel="noopener noreferrer"
          >
            DESTRUYE TUS MIEDOS AHORA
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 border-t border-gray-800">
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
