export default function FanSaticos() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gray-900 text-white py-3 text-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex gap-6">
            <a href="mailto:david.perez@internetoperadores.com" className="hover:text-orange-500">
              david.perez@internetoperadores.com
            </a>
            <span>Paseo De La Habana 26 1-1. 28036, Madrid. España</span>
          </div>
          <a 
            href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20el%20servicio%20Cero%20Riesgos" 
            className="bg-green-500 px-4 py-2 rounded hover:bg-green-600 font-semibold"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b py-4">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div>
            <a href="/">
              <img src="/logo_transparent.png" alt="Internet Operadores" className="h-10" />
            </a>
          </div>
          <div className="flex gap-6">
            <a href="https://internetoperadores.com/empresa" className="hover:text-orange-500">EMPRESA</a>
            <a href="/fansaticos" className="text-orange-500 font-semibold">FANSÁTICOS</a>
             <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500">SABER DIARIO</a>
            <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Protección</a>
          </div>
        </div>
      </nav>

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
            
            {/* Miedo 1 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Tengo miedo de que un día nos hackeen y se lleven toda la información.
              </h3>
              <p className="text-lg text-gray-700">
                Sé que no somos una gran multinacional, pero si entran, pueden dejarme fuera de juego en cuestión de horas.
              </p>
            </div>

            {/* Miedo 2 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Estoy pagando servicios IT que ni entiendo ni uso.
              </h3>
              <p className="text-lg text-gray-700">
                Me llegan facturas con nombres raros, me venden cosas con palabras que suenan importantes… y yo firmo, por no quedarme atrás. Pero no sé si me están tomando el pelo.
              </p>
            </div>

            {/* Miedo 3 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Mi equipo se queja de que todo va lento, pero no sé qué hacer.
              </h3>
              <p className="text-lg text-gray-700">
                No soy técnico. Sé que las cosas no van bien, pero tampoco quiero que me cobren miles por cambiarlo todo sin garantías.
              </p>
            </div>

            {/* Miedo 4 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Lo tengo todo en la nube, pero a veces pienso: ¿y si un día no puedo entrar?
              </h3>
              <p className="text-lg text-gray-700">
                Confío en que todo funcione… hasta que deja de hacerlo. Y entonces no tengo ni idea de a quién llamar.
              </p>
            </div>

            {/* Miedo 5 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                No sé si estoy cumpliendo con la protección de datos como debería.
              </h3>
              <p className="text-lg text-gray-700">
                Sé que hay normas, sé que hay multas… pero entre clientes, empleados, emails y mil cosas más, cruzo los dedos para que no me pillen con un descuido.
              </p>
            </div>

            {/* Miedo 6 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Si mañana se cae todo, no tengo ni idea de cuánto me costaría realmente.
              </h3>
              <p className="text-lg text-gray-700">
                Hablan de ciberseguros, de tiempo de inactividad… pero yo no tengo ni una hoja con esos números claros. Y eso me inquieta más de lo que admito.
              </p>
            </div>

            {/* Miedo 7 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Mi gente usa sus móviles, sus tablets… y nadie controla nada.
              </h3>
              <p className="text-lg text-gray-700">
                Cada uno trabaja como puede, desde donde puede, pero sé que eso es un coladero. Lo sé. Solo que no tengo tiempo para poner orden.
              </p>
            </div>

            {/* Miedo 8 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Digo que tengo copias de seguridad… pero no sé si servirían de algo.
              </h3>
              <p className="text-lg text-gray-700">
                Hay backups, sí. Pero no sé si están actualizados, si se revisan, si están bien hechos. Me fío… y eso es un riesgo.
              </p>
            </div>

            {/* Miedo 9 */}
            <div className="border-l-4 border-orange-500 pl-6 py-4">
              <h3 className="text-2xl font-bold mb-3">
                Cuando hablo con algunos proveedores, siento que me están vendiendo aire.
              </h3>
              <p className="text-lg text-gray-700">
                Me lanzan tecnicismos, me proponen soluciones mágicas… y yo tengo que decidir con el estómago, no con información real.
              </p>
            </div>

            {/* Miedo 10 */}
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

