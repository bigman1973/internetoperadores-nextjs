export const dynamic = "force-dynamic";


import Link from 'next/link';

export default function PoliticaPrivacidad() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header simplificado */}
      <header className="bg-gray-900 text-white py-4">
        <div className="container mx-auto px-4">
          <Link href="/">
            <img src="/logo_transparent.png" alt="Internet Operadores" className="h-10 cursor-pointer" />
          </Link>
        </div>
      </header>

      {/* Contenido */}
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-gray-900">Política de Privacidad</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6">
            <strong>Última actualización:</strong> {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">1. Responsable del Tratamiento</h2>
            <p className="text-gray-700 mb-4">
              <strong>Internet Operadores</strong><br />
              Paseo De La Habana 26 1-1<br />
              28036, Madrid, España<br />
              Email: david.perez@internetoperadores.com<br />
              Teléfono: +34 655 100 400
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">2. Datos que Recopilamos</h2>
            <p className="text-gray-700 mb-4">
              Recopilamos y procesamos los siguientes tipos de datos personales:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Datos de identificación:</strong> Nombre, apellidos, email, teléfono</li>
              <li><strong>Datos de la empresa:</strong> Nombre de empresa, cargo, sector</li>
              <li><strong>Datos de navegación:</strong> Dirección IP, tipo de navegador, páginas visitadas</li>
              <li><strong>Cookies:</strong> Información técnica y de preferencias (ver Política de Cookies)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">3. Finalidad del Tratamiento</h2>
            <p className="text-gray-700 mb-4">
              Utilizamos sus datos personales para:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Responder a sus consultas y solicitudes de información</li>
              <li>Gestionar la prestación de servicios contratados</li>
              <li>Enviar comunicaciones comerciales (con su consentimiento previo)</li>
              <li>Mejorar nuestros servicios y la experiencia del usuario</li>
              <li>Cumplir con obligaciones legales y fiscales</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">4. Base Legal del Tratamiento</h2>
            <p className="text-gray-700 mb-4">
              El tratamiento de sus datos se basa en:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Consentimiento:</strong> Para envío de comunicaciones comerciales</li>
              <li><strong>Ejecución de contrato:</strong> Para la prestación de servicios</li>
              <li><strong>Interés legítimo:</strong> Para mejorar nuestros servicios</li>
              <li><strong>Obligación legal:</strong> Para cumplir con normativa fiscal y mercantil</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">5. Conservación de Datos</h2>
            <p className="text-gray-700 mb-4">
              Conservaremos sus datos personales durante el tiempo necesario para cumplir con las finalidades para las que fueron recogidos:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Clientes activos:</strong> Durante la relación comercial y hasta 6 años después (obligaciones fiscales)</li>
              <li><strong>Consultas:</strong> Hasta 2 años desde la última comunicación</li>
              <li><strong>Marketing:</strong> Hasta que retire su consentimiento</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">6. Destinatarios de los Datos</h2>
            <p className="text-gray-700 mb-4">
              Sus datos pueden ser comunicados a:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Proveedores de servicios tecnológicos (hosting, CRM, email marketing)</li>
              <li>Asesores legales, fiscales y contables</li>
              <li>Administraciones públicas cuando sea legalmente requerido</li>
            </ul>
            <p className="text-gray-700 mb-4">
              No cedemos sus datos a terceros con fines comerciales sin su consentimiento expreso.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">7. Sus Derechos</h2>
            <p className="text-gray-700 mb-4">
              Puede ejercer los siguientes derechos:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Acceso:</strong> Conocer qué datos tenemos sobre usted</li>
              <li><strong>Rectificación:</strong> Corregir datos inexactos</li>
              <li><strong>Supresión:</strong> Solicitar la eliminación de sus datos</li>
              <li><strong>Oposición:</strong> Oponerse al tratamiento de sus datos</li>
              <li><strong>Limitación:</strong> Solicitar la limitación del tratamiento</li>
              <li><strong>Portabilidad:</strong> Recibir sus datos en formato estructurado</li>
            </ul>
            <p className="text-gray-700 mb-4">
              Para ejercer sus derechos, puede contactarnos en: <a href="mailto:david.perez@internetoperadores.com" className="text-orange-500 hover:text-orange-600">david.perez@internetoperadores.com</a>
            </p>
            <p className="text-gray-700 mb-4">
              También puede presentar una reclamación ante la Agencia Española de Protección de Datos (www.aepd.es).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">8. Seguridad</h2>
            <p className="text-gray-700 mb-4">
              Implementamos medidas técnicas y organizativas apropiadas para proteger sus datos personales contra acceso no autorizado, pérdida, destrucción o alteración.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">9. Cambios en la Política</h2>
            <p className="text-gray-700 mb-4">
              Nos reservamos el derecho de modificar esta Política de Privacidad. Los cambios serán publicados en esta página con la fecha de actualización correspondiente.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">10. Contacto</h2>
            <p className="text-gray-700 mb-4">
              Para cualquier consulta sobre esta Política de Privacidad o sobre el tratamiento de sus datos personales, puede contactarnos:
            </p>
            <ul className="list-none text-gray-700 space-y-2 mb-4">
              <li>📧 Email: <a href="mailto:david.perez@internetoperadores.com" className="text-orange-500 hover:text-orange-600">david.perez@internetoperadores.com</a></li>
              <li>📞 Teléfono: <a href="tel:+34655100400" className="text-orange-500 hover:text-orange-600">+34 655 100 400</a></li>
              <li>💬 WhatsApp: <a href="https://wa.me/34655100400" className="text-orange-500 hover:text-orange-600" target="_blank" rel="noopener noreferrer">Contactar</a></li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/" className="text-orange-500 hover:text-orange-600 font-semibold">
            ← Volver a la página principal
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            © {new Date().getFullYear()} Internet Operadores. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

