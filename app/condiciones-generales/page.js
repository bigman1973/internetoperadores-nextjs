export const dynamic = "force-dynamic";

import Link from 'next/link';

export const metadata = {
  title: 'Condiciones Generales - Internet Operadores',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function CondicionesGenerales() {
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
        <h1 className="text-4xl font-bold mb-4 text-gray-900">Condiciones Generales y Particulares Unificadas</h1>
        <p className="text-gray-500 mb-8 text-sm">Documento master consolidado — Última actualización: mayo 2026</p>
        
        <div className="prose prose-lg max-w-none">

          {/* Sección 1 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">1. Objeto y alcance del servicio</h2>
            <p className="text-gray-700 mb-4">
              Estas condiciones generales regulan el contrato de prestación de servicios de telecomunicaciones y servicios asociados entre <strong>Internet Operadores</strong> (en adelante, &quot;IO&quot;), con domicilio social en Paseo de la Habana, 9-11, 28036 Madrid y con CIF B25808619, y el cliente (en adelante, &quot;el Cliente&quot;).
            </p>
            <p className="text-gray-700 mb-4">
              El objeto del contrato es la provisión de los servicios detallados en el contrato particular o propuesta económica aceptada por el Cliente, que puede incluir acceso a internet, telefonía fija, telefonía móvil, centralita virtual, hosting, backup, y otros servicios de telecomunicaciones.
            </p>
            <p className="text-gray-700 mb-4">
              IO proporcionará al Cliente, con carácter previo a la celebración del contrato, un resumen precontractual conciso y de fácil lectura con los elementos principales del servicio, conforme al artículo 67.2 de la Ley 11/2022, de 28 de junio, General de Telecomunicaciones.
            </p>
          </section>

          {/* Sección 2 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">2. Condiciones de contratación</h2>
            
            <h3 className="text-lg font-semibold mb-2 text-gray-800">2.1. Entrada en vigor</h3>
            <p className="text-gray-700 mb-4">
              El contrato entrará en vigor en el momento de su firma o aceptación expresa por parte del Cliente, ya sea de forma presencial, telemática o telefónica.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">2.2. Duración</h3>
            <p className="text-gray-700 mb-4">
              La duración del contrato será la estipulada en las condiciones particulares. Si no se especifica, la duración inicial será de 12 meses, prorrogable automáticamente por periodos iguales salvo preaviso de 30 días por cualquiera de las partes.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">2.3. Velocidad garantizada</h3>
            <p className="text-gray-700 mb-4">
              Las velocidades mínimas, normalmente disponibles y máximas del servicio de acceso a internet se especificarán en el contrato particular de cada cliente, conforme al artículo 67.1 de la Ley 11/2022.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">2.4. Modificación de condiciones</h3>
            <p className="text-gray-700 mb-4">
              2.4.1. IO podrá modificar las presentes condiciones por motivos técnicos, operativos, económicos o legales, notificándolo al Cliente con al menos un mes de antelación.
            </p>
            <p className="text-gray-700 mb-4">
              2.4.2. En caso de modificación unilateral de las condiciones por parte de IO, el Cliente tendrá derecho a rescindir el contrato sin penalización alguna, según el art. 67.8 de la Ley 11/2022, de 28 de junio, General de Telecomunicaciones.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">2.5. Permanencia</h3>
            <p className="text-gray-700 mb-4">
              En caso de que el contrato incluya un compromiso de permanencia (máximo 24 meses), este se detallará en las condiciones particulares. La penalización por baja anticipada será proporcional al tiempo no cumplido del compromiso.
            </p>
          </section>

          {/* Sección 3 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">3. Facturación y pagos</h2>
            
            <h3 className="text-lg font-semibold mb-2 text-gray-800">3.1. Facturación</h3>
            <p className="text-gray-700 mb-4">
              IO emitirá facturas mensuales por los servicios prestados. Las facturas se enviarán en formato electrónico al correo facilitado por el Cliente.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">3.2. Forma de pago</h3>
            <p className="text-gray-700 mb-4">
              El pago se realizará mediante domiciliación bancaria en la cuenta indicada por el Cliente, entre los días 1 y 5 de cada mes.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">3.3. Impagos</h3>
            <p className="text-gray-700 mb-4">
              En caso de devolución de un recibo, IO podrá cargar los gastos bancarios generados. El retraso en el pago superior a 15 días podrá dar lugar a la suspensión temporal del servicio.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">3.4. Reclamación de facturas</h3>
            <p className="text-gray-700 mb-4">
              El Cliente podrá reclamar cualquier concepto facturado en el plazo de 30 días desde la emisión de la factura. Sin perjuicio de lo anterior, la reclamación no exime de la obligación de pago de los importes no reclamados.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">3.5. Suspensión por impago</h3>
            <p className="text-gray-700 mb-4">
              Sin perjuicio de lo anterior, la suspensión del servicio por impago no exime al Cliente del abono de las cuotas fijas correspondientes al periodo de suspensión.
            </p>
          </section>

          {/* Sección 4 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">4. Equipos e instalación</h2>
            
            <h3 className="text-lg font-semibold mb-2 text-gray-800">4.1. Propiedad de los equipos</h3>
            <p className="text-gray-700 mb-4">
              Los equipos instalados por IO (routers, ONTs, teléfonos, etc.) se ceden en régimen de cesión de uso, manteniendo IO la propiedad de los mismos, salvo que se indique expresamente su venta en las condiciones particulares.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">4.2. Devolución de equipos</h3>
            <p className="text-gray-700 mb-4">
              En caso de baja del servicio, el Cliente deberá devolver los equipos en un plazo máximo de 30 días. En caso de no devolución, IO facturará una penalización equivalente al valor residual o de mercado del equipo no devuelto.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">4.3. Mantenimiento</h3>
            <p className="text-gray-700 mb-4">
              IO se encargará del mantenimiento y sustitución de los equipos cedidos en caso de avería técnica. Quedan excluidos de esta sustitución gratuita los daños causados por negligencia, mal uso, manipulación indebida o causas de fuerza mayor imputables al Cliente.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">4.4. Instalación</h3>
            <p className="text-gray-700 mb-4">
              La instalación será realizada por técnicos autorizados por IO. El Cliente deberá facilitar el acceso a sus instalaciones en la fecha y hora acordadas.
            </p>
          </section>

          {/* Sección 5 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">5. Protección de datos</h2>
            
            <h3 className="text-lg font-semibold mb-2 text-gray-800">5.1. Responsable del tratamiento</h3>
            <p className="text-gray-700 mb-4">
              Internet Operadores, con CIF B25808619 y domicilio en Paseo de la Habana, 9-11, 28036 Madrid. Contacto para cuestiones de privacidad: <a href="mailto:privacidad@internetoperadores.com" className="text-orange-500 hover:text-orange-600">privacidad@internetoperadores.com</a>.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">5.2. Finalidad y base jurídica</h3>
            <p className="text-gray-700 mb-4">
              Los datos personales del Cliente serán tratados para las siguientes finalidades:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Gestión contractual:</strong> Prestación del servicio, facturación y soporte técnico (base jurídica: ejecución del contrato, art. 6.1.b RGPD).</li>
              <li><strong>Comunicaciones comerciales:</strong> Envío de información sobre productos y servicios similares (base jurídica: interés legítimo, art. 6.1.f RGPD).</li>
              <li><strong>Cumplimiento legal:</strong> Obligaciones fiscales, contables y regulatorias (base jurídica: obligación legal, art. 6.1.c RGPD).</li>
            </ul>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">5.3. Plazo de conservación</h3>
            <p className="text-gray-700 mb-4">
              Los datos se conservarán durante la vigencia del contrato y, una vez finalizado, durante el plazo de 5 años para atender posibles responsabilidades legales derivadas de la prescripción de acciones civiles y mercantiles.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">5.4. Destinatarios</h3>
            <p className="text-gray-700 mb-4">
              Los datos no se cederán a terceros salvo obligación legal o cuando sea estrictamente necesario para la prestación del servicio (proveedores de red, entidades bancarias para la domiciliación de pagos). No se realizan transferencias internacionales de datos ni decisiones automatizadas que produzcan efectos jurídicos sobre el Cliente.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">5.5. Derechos del usuario</h3>
            <p className="text-gray-700 mb-4">
              El Cliente puede ejercer sus derechos de acceso, rectificación, supresión, portabilidad, limitación y oposición al tratamiento enviando un correo a <a href="mailto:privacidad@internetoperadores.com" className="text-orange-500 hover:text-orange-600">privacidad@internetoperadores.com</a>.
            </p>
            <p className="text-gray-700 mb-4">
              En caso de considerar vulnerados sus derechos, el Cliente tiene derecho a presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD), con sede en C/ Jorge Juan, 6, 28001 Madrid — <a href="https://www.aepd.es" className="text-orange-500 hover:text-orange-600" target="_blank" rel="noopener noreferrer">www.aepd.es</a>.
            </p>
          </section>

          {/* Sección 6 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">6. Atención al cliente, incidencias y reclamaciones</h2>
            
            <h3 className="text-lg font-semibold mb-2 text-gray-800">6.1. Canales de contacto</h3>
            <p className="text-gray-700 mb-4">
              IO pone a disposición del Cliente un servicio de atención telefónica gratuito en el número <a href="tel:+34900730034" className="text-orange-500 hover:text-orange-600 font-semibold">+34 900 730 034</a>, así como atención vía correo electrónico y a través del área de cliente en la web. En ningún caso se derivará al Cliente a números de tarificación adicional.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">6.2. Calidad de atención</h3>
            <p className="text-gray-700 mb-4">
              Conforme a la Ley 10/2025 de Servicios de Atención a la Clientela, IO se compromete a:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li>Atender el 95% de las llamadas en menos de 3 minutos.</li>
              <li>Garantizar la transferencia a un agente humano a petición del usuario en cualquier momento de la interacción.</li>
              <li>Identificar al operador que atiende cada consulta o reclamación.</li>
            </ul>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">6.3. Gestión de incidencias</h3>
            <p className="text-gray-700 mb-4">
              Las incidencias técnicas se resolverán en el menor tiempo posible. IO proporcionará un número de referencia o ticket para el seguimiento de cada incidencia o reclamación desde el momento de su apertura.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">6.4. Resolución de reclamaciones</h3>
            <p className="text-gray-700 mb-4">
              Las reclamaciones presentadas por el Cliente serán resueltas y notificadas en un plazo máximo de 15 días hábiles desde su presentación, conforme a la Ley 10/2025.
            </p>
          </section>

          {/* Sección 7 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">7. Suspensión, baja y resolución contractual</h2>
            
            <h3 className="text-lg font-semibold mb-2 text-gray-800">7.1. Fuerza mayor</h3>
            <p className="text-gray-700 mb-4">
              IO no será responsable de los retrasos o fallos en la prestación del servicio causados por motivos de fuerza mayor reconocidos legalmente (art. 1105 del Código Civil), tales como desastres naturales, conflictos bélicos, huelgas generales o actos de autoridades gubernamentales que impidan la prestación del servicio.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">7.2. Baja voluntaria</h3>
            <p className="text-gray-700 mb-4">
              El Cliente podrá solicitar la baja del servicio en cualquier momento con un preaviso de 2 días hábiles. Si existe compromiso de permanencia no cumplido, se aplicará la penalización proporcional correspondiente al tiempo restante.
            </p>

            <h3 className="text-lg font-semibold mb-2 text-gray-800">7.3. Resolución por incumplimiento</h3>
            <p className="text-gray-700 mb-4">
              Cualquiera de las partes podrá resolver el contrato en caso de incumplimiento grave de las obligaciones de la otra parte, previo requerimiento de subsanación en un plazo de 15 días.
            </p>
          </section>

          {/* Sección 8 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">8. Derecho de desistimiento</h2>
            <p className="text-gray-700 mb-4">
              En los contratos celebrados a distancia (vía telefónica, web o correo electrónico) o fuera del establecimiento mercantil, el Cliente que tenga la consideración de consumidor dispone de un plazo de <strong>14 días naturales</strong> desde la celebración del contrato para ejercer su derecho de desistimiento sin necesidad de justificación y sin penalización alguna, conforme a los artículos 102 a 108 del Real Decreto Legislativo 1/2007 (TRLGDCU).
            </p>
            <p className="text-gray-700 mb-4">
              El ejercicio de este derecho deberá comunicarse a IO a través de cualquiera de los canales de atención al cliente indicados en la sección 6.1. IO confirmará la recepción de la solicitud de desistimiento sin demora indebida.
            </p>
            <p className="text-gray-700 mb-4">
              En caso de que el Cliente haya solicitado que la prestación del servicio comience durante el periodo de desistimiento, deberá abonar únicamente la parte proporcional del servicio efectivamente prestado hasta la fecha de comunicación del desistimiento.
            </p>
          </section>

          {/* Sección 9 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">9. Compensación por interrupciones del servicio</h2>
            <p className="text-gray-700 mb-4">
              En caso de interrupción temporal del servicio por causas imputables a IO durante un periodo superior a 6 horas consecutivas, el Cliente tendrá derecho a una compensación económica que se aplicará como descuento proporcional en la siguiente factura, calculada en base al tiempo de interrupción y la cuota fija del servicio afectado.
            </p>
            <p className="text-gray-700 mb-4">
              La compensación se calculará de forma automática y se reflejará en la factura correspondiente. El Cliente podrá solicitar información detallada sobre las interrupciones y compensaciones aplicadas a través de los canales de atención al cliente.
            </p>
          </section>

          {/* Sección 10 */}
          <section className="mb-10">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">10. Jurisdicción y ley aplicable</h2>
            <p className="text-gray-700 mb-4">
              El presente contrato se rige por la legislación española. Para la resolución de cualquier controversia que pudiera derivarse de la interpretación o ejecución del presente contrato, las partes se someten a los Juzgados y Tribunales del domicilio del consumidor, conforme al Real Decreto Legislativo 1/2007 (TRLGDCU). En caso de que el Cliente sea una empresa o profesional, las partes se someten a los Juzgados y Tribunales de la ciudad de Madrid, con renuncia expresa a cualquier otro fuero que pudiera corresponderles.
            </p>
          </section>

          {/* Datos de contacto */}
          <section className="mb-10 bg-gray-50 p-6 rounded-lg border border-gray-200">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Datos de contacto</h2>
            <p className="text-gray-700 mb-1"><strong>Internet Operadores</strong></p>
            <p className="text-gray-700 mb-1">Paseo de la Habana, 9-11, 28036 Madrid</p>
            <p className="text-gray-700 mb-1">CIF: B25808619</p>
            <p className="text-gray-700 mb-1">Teléfono: <a href="tel:+34900730034" className="text-orange-500 hover:text-orange-600">+34 900 730 034</a></p>
            <p className="text-gray-700 mb-1">Email: <a href="mailto:info@internetoperadores.com" className="text-orange-500 hover:text-orange-600">info@internetoperadores.com</a></p>
            <p className="text-gray-700">Web: <a href="https://www.internetoperadores.com" className="text-orange-500 hover:text-orange-600">www.internetoperadores.com</a></p>
          </section>

        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/" className="text-orange-500 hover:text-orange-600 font-semibold">
            &larr; Volver a la página principal
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            &copy; {new Date().getFullYear()} Internet Operadores. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
