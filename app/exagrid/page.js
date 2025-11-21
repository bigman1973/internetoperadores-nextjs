'use client';

import { useState } from 'react';
import HeaderSimplificado from '@/components/HeaderSimplificado';

export default function ExagridPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    empresa: '',
    mensaje: ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    // Aquí se integrará con HubSpot en la FASE 1B
    console.log('Formulario enviado:', formData);
    alert('Gracias por tu interés. Nos pondremos en contacto contigo pronto.');
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <HeaderSimplificado />

      {/* Hero Section */}
      <section className="bg-gray-800 text-white py-20 md:py-32">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Exagrid - Almacenamiento de Backup Escalonado
            </h1>
            <p className="text-xl md:text-2xl mb-8 text-gray-100">
              La solución más rápida y segura para proteger tus datos empresariales
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="#contacto"
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
              >
                Solicitar Consultoría Gratuita
              </a>
              <a
                href="#casos-exito"
                className="bg-white hover:bg-gray-100 text-gray-900 px-8 py-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
              >
                Ver Casos de Éxito
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: ¿Por Qué Exagrid? */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            La Diferencia Exagrid
          </h2>
          <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
            Tecnología probada por más de 4,800 empresas en todo el mundo
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Beneficio 1 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition-shadow">
              <div className="text-5xl mb-4">⚡</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                Velocidad Sin Igual
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Backups 3X más rápidos</li>
                <li>✓ Recuperaciones 20X más rápidas</li>
                <li>✓ Ventana de backup fija</li>
              </ul>
            </div>

            {/* Beneficio 2 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition-shadow">
              <div className="text-5xl mb-4">🛡️</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                Seguridad Total
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Protección contra ransomware con IA</li>
                <li>✓ Solución non-network-facing</li>
                <li>✓ Recuperación garantizada</li>
              </ul>
            </div>

            {/* Beneficio 3 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition-shadow">
              <div className="text-5xl mb-4">📈</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                Escalabilidad Real
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Hasta 6PB sin actualizaciones costosas</li>
                <li>✓ Arquitectura scale-out</li>
                <li>✓ Mezcla cualquier modelo</li>
              </ul>
            </div>

            {/* Beneficio 4 */}
            <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-2xl transition-shadow">
              <div className="text-5xl mb-4">💰</div>
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                Coste Predecible
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>✓ Protección de precios de 5 años</li>
                <li>✓ Sin costes ocultos</li>
                <li>✓ ROI demostrable</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: Arquitectura */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Tecnología que Marca la Diferencia
          </h2>

          <div className="max-w-4xl mx-auto">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-xl mb-8">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                Landing Zone (Disco Caché)
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Almacena los backups más recientes</li>
                <li>• Recuperación ultrarrápida (20X más rápido)</li>
                <li>• Arranque directo de VMs</li>
              </ul>
            </div>

            <div className="text-center text-4xl text-blue-600 my-6">↓</div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 p-8 rounded-xl">
              <h3 className="text-2xl font-bold mb-4 text-green-900">
                Repositorio de Retención
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Deduplicación inteligente (ratios 10:1 a 50:1)</li>
                <li>• Objetos inmutables</li>
                <li>• Retención a largo plazo</li>
              </ul>
            </div>

            <p className="text-center text-lg text-gray-600 mt-8">
              La arquitectura escalonada combina velocidad extrema con eficiencia de almacenamiento
            </p>
          </div>
        </div>
      </section>

      {/* Sección: Protección Ransomware */}
      <section className="py-16 md:py-24 bg-red-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4 text-red-900">
            Tu Última Línea de Defensa
          </h2>
          <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
            Protección multicapa contra ransomware y amenazas avanzadas
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-3 text-red-900">
                ✅ Retention Time-Lock con IA
              </h3>
              <p className="text-gray-700">
                La inteligencia artificial detecta patrones anómalos y bloquea automáticamente la eliminación de backups.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-3 text-red-900">
                ✅ Air Gap Escalonado
              </h3>
              <p className="text-gray-700">
                El tier de retención no está conectado a la red, imposibilitando el acceso de ransomware.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-3 text-red-900">
                ✅ Delayed Delete Policy
              </h3>
              <p className="text-gray-700">
                Los backups no se pueden eliminar inmediatamente, incluso con credenciales de administrador.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-3 text-red-900">
                ✅ Objetos Inmutables
              </h3>
              <p className="text-gray-700">
                Una vez creados, los objetos de deduplicación no pueden modificarse ni eliminarse.
              </p>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-2xl font-bold text-red-900">
              Resultado: Recuperación garantizada en minutos, no en días
            </p>
          </div>
        </div>
      </section>

      {/* Sección: Casos de Uso */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Soluciones para Cada Necesidad
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="bg-blue-50 p-8 rounded-xl">
              <h3 className="text-2xl font-bold mb-4 text-gray-900">
                Empresas Medianas y Grandes
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Protección de infraestructura crítica</li>
                <li>• Cumplimiento normativo (GDPR, ISO)</li>
                <li>• Recuperación ante desastres</li>
              </ul>
            </div>

            <div className="bg-green-50 p-8 rounded-xl">
              <h3 className="text-2xl font-bold mb-4 text-green-900">
                Entornos Virtualizados
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Integración nativa con Veeam</li>
                <li>• Backup de VMware y Hyper-V</li>
                <li>• Arranque instantáneo de VMs</li>
              </ul>
            </div>

            <div className="bg-purple-50 p-8 rounded-xl">
              <h3 className="text-2xl font-bold mb-4 text-purple-900">
                Sectores Regulados
              </h3>
              <ul className="space-y-2 text-gray-700">
                <li>• Banca y finanzas</li>
                <li>• Sanidad</li>
                <li>• Administración pública</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: Clientes */}
      <section id="casos-exito" className="py-16 md:py-24 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            4,800+ Empresas Protegidas en Todo el Mundo
          </h2>
          <p className="text-xl text-gray-300 text-center mb-12">
            Clientes que confían en Exagrid
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto mb-12">
            {['BNP Paribas', 'Bose', 'Brinks', 'Capgemini', 'Kaiser Permanente', "L'Oréal", 'Microchip', 'New Balance'].map((cliente) => (
              <div key={cliente} className="bg-white text-gray-900 p-6 rounded-lg text-center font-semibold">
                {cliente}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto text-center">
            <div>
              <div className="text-5xl font-bold text-orange-500 mb-2">+81</div>
              <div className="text-lg">NPS Score</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-orange-500 mb-2">200+</div>
              <div className="text-lg">Reseñas en Gartner</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-orange-500 mb-2">300+</div>
              <div className="text-lg">Historias de Éxito</div>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: Por Qué Elegirnos */}
      <section className="py-16 md:py-24 bg-blue-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            Internet Operadores - Tu Partner Exagrid de Confianza
          </h2>
          <p className="text-xl text-gray-600 text-center mb-12 max-w-3xl mx-auto">
            Más que un proveedor, somos tu aliado estratégico en protección de datos
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">🔧</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Consultoría Especializada
              </h3>
              <p className="text-gray-700">
                Analizamos tu infraestructura y diseñamos la solución perfecta.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">⚙️</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Instalación y Configuración
              </h3>
              <p className="text-gray-700">
                Implementamos Exagrid de forma rápida y sin interrupciones.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">📞</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Soporte Técnico Continuo
              </h3>
              <p className="text-gray-700">
                Nuestro equipo te acompaña con respuesta en menos de 2 horas.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Optimización y Monitoreo
              </h3>
              <p className="text-gray-700">
                Revisiones periódicas para asegurar el máximo rendimiento.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">💡</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Formación Personalizada
              </h3>
              <p className="text-gray-700">
                Capacitamos a tu equipo para aprovechar al máximo Exagrid.
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-xl font-bold mb-3 text-gray-900">
                Garantía de Resultados
              </h3>
              <p className="text-gray-700">
                Nos comprometemos con tu éxito desde el primer día.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sección: Especificaciones Técnicas */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Potencia y Flexibilidad
          </h2>

          <div className="max-w-4xl mx-auto overflow-x-auto">
            <table className="w-full bg-white shadow-lg rounded-lg overflow-hidden">
              <thead className="bg-gray-900 text-white">
                <tr>
                  <th className="px-6 py-4 text-left">Característica</th>
                  <th className="px-6 py-4 text-left">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Escalabilidad', 'Hasta 6PB en un solo sistema'],
                  ['Modelos', '8 appliances diferentes'],
                  ['Deduplicación', 'Zone-level, ratios 10:1 a 50:1'],
                  ['Compatibilidad', 'Veeam, Veritas, Commvault, HP Data Protector, y más'],
                  ['Conectividad', '10GbE, 25GbE, 40GbE, 100GbE'],
                  ['Protocolos', 'NFS, CIFS, iSCSI'],
                  ['Seguridad', 'Encryption at rest, FIPS 140-2'],
                  ['Garantía', '5 años con protección de precios']
                ].map((row, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="px-6 py-4 font-semibold text-gray-900">{row[0]}</td>
                    <td className="px-6 py-4 text-gray-700">{row[1]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Sección: FAQ */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
            Preguntas Frecuentes
          </h2>

          <div className="max-w-4xl mx-auto space-y-6">
            {[
              {
                pregunta: '¿Cuánto tiempo lleva implementar Exagrid?',
                respuesta: 'Típicamente entre 1-3 días, dependiendo del tamaño de tu infraestructura.'
              },
              {
                pregunta: '¿Es compatible con mi software de backup actual?',
                respuesta: 'Exagrid funciona con más de 20 aplicaciones de backup, incluyendo Veeam, Veritas, Commvault y muchas más.'
              },
              {
                pregunta: '¿Qué pasa si mi empresa crece?',
                respuesta: 'Simplemente añades más appliances. Sin necesidad de reemplazar equipos existentes.'
              },
              {
                pregunta: '¿Cómo funciona la protección contra ransomware?',
                respuesta: 'Exagrid usa múltiples capas: air gap, delayed delete, inmutabilidad y detección con IA.'
              },
              {
                pregunta: '¿Qué soporte ofrece Exagrid?',
                respuesta: 'Cada cliente tiene un ingeniero de soporte de Nivel 2 asignado, con monitoreo proactivo 24/7.'
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-bold mb-3 text-gray-900">
                  {faq.pregunta}
                </h3>
                <p className="text-gray-700">{faq.respuesta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sección: CTA Final */}
      <section id="contacto" className="py-16 md:py-24 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
              ¿Listo para Proteger tus Datos?
            </h2>
            <p className="text-xl text-center mb-12">
              No esperes a que sea demasiado tarde. Descubre cómo Exagrid puede transformar tu estrategia de backup.
            </p>

            <form onSubmit={handleSubmit} className="bg-white text-gray-900 p-8 rounded-xl shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Nombre *</label>
                  <input
                    type="text"
                    name="nombre"
                    required
                    value={formData.nombre}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Email *</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Teléfono *</label>
                  <input
                    type="tel"
                    name="telefono"
                    required
                    value={formData.telefono}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Empresa *</label>
                  <input
                    type="text"
                    name="empresa"
                    required
                    value={formData.empresa}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-semibold mb-2">Mensaje</label>
                <textarea
                  name="mensaje"
                  rows="4"
                  value={formData.mensaje}
                  onChange={handleChange}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  placeholder="Cuéntanos sobre tu infraestructura y necesidades..."
                ></textarea>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  type="submit"
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg text-lg font-semibold transition-all transform hover:scale-105"
                >
                  Solicitar Consultoría Gratuita
                </button>
                <a
                  href="https://www.exagrid.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-gray-900 hover:bg-blue-800 text-white px-8 py-4 rounded-lg text-lg font-semibold text-center transition-all transform hover:scale-105"
                >
                  Descargar Datasheet
                </a>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2025 Internet Operadores. Partner oficial de Exagrid.
          </p>
          <p className="text-gray-500 mt-2">
            <a href="tel:+34937777777" className="hover:text-orange-500">+34 93 777 77 77</a> | 
            <a href="mailto:info@internetoperadores.com" className="hover:text-orange-500 ml-2">info@internetoperadores.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

