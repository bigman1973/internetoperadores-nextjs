"use client";
export const dynamic = "force-dynamic";

export default function SoportePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Soporte</h1>
        <p className="text-gray-500 mt-1">¿Necesitas ayuda? Contacta con nuestro equipo de soporte técnico.</p>
      </div>

      {/* Canales de contacto */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="tel:+34973282828"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-orange-300 transition-colors group"
        >
          <div className="p-3 bg-green-50 rounded-lg w-fit mb-4 group-hover:bg-green-100 transition-colors">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Teléfono</h3>
          <p className="text-orange-600 font-medium">973 28 28 28</p>
          <p className="text-xs text-gray-500 mt-2">Lunes a viernes, 9:00 - 18:00</p>
        </a>

        <a
          href="mailto:sat@internetoperadores.com"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-orange-300 transition-colors group"
        >
          <div className="p-3 bg-blue-50 rounded-lg w-fit mb-4 group-hover:bg-blue-100 transition-colors">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">Email</h3>
          <p className="text-orange-600 font-medium">sat@internetoperadores.com</p>
          <p className="text-xs text-gray-500 mt-2">Respuesta en menos de 24h</p>
        </a>

        <a
          href="https://wa.me/34973282828"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white rounded-xl border border-gray-200 p-6 hover:border-orange-300 transition-colors group"
        >
          <div className="p-3 bg-emerald-50 rounded-lg w-fit mb-4 group-hover:bg-emerald-100 transition-colors">
            <svg className="w-6 h-6 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">WhatsApp</h3>
          <p className="text-orange-600 font-medium">Enviar mensaje</p>
          <p className="text-xs text-gray-500 mt-2">Chat directo con soporte</p>
        </a>
      </div>

      {/* FAQ */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Preguntas frecuentes</h2>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="p-5">
            <h3 className="font-medium text-gray-900 mb-2">¿Cómo puedo cambiar mi contraseña?</h3>
            <p className="text-sm text-gray-600">Puedes solicitar un enlace de acceso desde la página de login seleccionando &quot;Acceder con enlace mágico&quot;. Si necesitas cambiar tu contraseña, contacta con administración.</p>
          </div>
          <div className="p-5">
            <h3 className="font-medium text-gray-900 mb-2">¿Dónde puedo descargar mis facturas?</h3>
            <p className="text-sm text-gray-600">En la sección de Facturación puedes ver todas tus facturas. La descarga en PDF estará disponible próximamente.</p>
          </div>
          <div className="p-5">
            <h3 className="font-medium text-gray-900 mb-2">¿Cómo solicito una baja de servicio?</h3>
            <p className="text-sm text-gray-600">Para solicitar la baja de un servicio, contacta con nuestro equipo de atención al cliente por teléfono o email. Ten en cuenta que algunos servicios pueden tener permanencia.</p>
          </div>
          <div className="p-5">
            <h3 className="font-medium text-gray-900 mb-2">¿Puedo cambiar mi forma de pago?</h3>
            <p className="text-sm text-gray-600">Sí, contacta con administración para actualizar tu cuenta bancaria o método de pago.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
