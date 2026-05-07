"use client";
export const dynamic = "force-dynamic";


import Link from 'next/link';
import { useEffect } from 'react';

export default function PoliticaCookies() {
  useEffect(() => {
    // Cargar la declaración de cookies de Cookiebot
    const script = document.createElement('script');
    script.id = 'CookieDeclaration';
    script.src = 'https://consent.cookiebot.com/1621b6e2-0bdc-4d8d-8995-ed4e9db62ee5/cd.js';
    script.type = 'text/javascript';
    script.async = true;
    
    const container = document.getElementById('cookiebot-declaration');
    if (container) {
      container.appendChild(script);
    }

    return () => {
      // Limpiar el script al desmontar
      const existingScript = document.getElementById('CookieDeclaration');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, []);

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
        <h1 className="text-4xl font-bold mb-8 text-gray-900">Política de Cookies</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-gray-600 mb-6">
            <strong>Última actualización:</strong> {new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">¿Qué son las cookies?</h2>
            <p className="text-gray-700 mb-4">
              Las cookies son pequeños archivos de texto que se almacenan en su dispositivo cuando visita un sitio web. Se utilizan ampliamente para hacer que los sitios web funcionen de manera más eficiente, así como para proporcionar información a los propietarios del sitio.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">¿Cómo utilizamos las cookies?</h2>
            <p className="text-gray-700 mb-4">
              Utilizamos cookies para:
            </p>
            <ul className="list-disc pl-6 text-gray-700 space-y-2 mb-4">
              <li><strong>Cookies esenciales:</strong> Necesarias para el funcionamiento básico del sitio web</li>
              <li><strong>Cookies de rendimiento:</strong> Para analizar cómo los visitantes utilizan nuestro sitio</li>
              <li><strong>Cookies funcionales:</strong> Para recordar sus preferencias y configuraciones</li>
              <li><strong>Cookies de marketing:</strong> Para mostrar contenido relevante y personalizado</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Gestión de cookies</h2>
            <p className="text-gray-700 mb-4">
              Puede gestionar sus preferencias de cookies en cualquier momento haciendo clic en el botón de configuración de cookies que aparece en la parte inferior de la página, o puede configurar su navegador para rechazar cookies.
            </p>
            <p className="text-gray-700 mb-4">
              Tenga en cuenta que si desactiva las cookies, algunas funciones del sitio web pueden no funcionar correctamente.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Declaración de Cookies</h2>
            <p className="text-gray-700 mb-4">
              A continuación encontrará una lista detallada de todas las cookies utilizadas en este sitio web:
            </p>
            
            {/* Contenedor para la declaración automática de Cookiebot */}
            <div id="cookiebot-declaration" className="my-8 bg-gray-50 p-6 rounded-lg">
              <p className="text-gray-600 text-center">Cargando declaración de cookies...</p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Más información</h2>
            <p className="text-gray-700 mb-4">
              Para más información sobre cómo protegemos sus datos personales, consulte nuestra{' '}
              <Link href="/politica-privacidad" className="text-orange-500 hover:text-orange-600 font-semibold">
                Política de Privacidad
              </Link>.
            </p>
            <p className="text-gray-700 mb-4">
              Si tiene alguna pregunta sobre nuestra Política de Cookies, puede contactarnos en:
            </p>
            <ul className="list-none text-gray-700 space-y-2 mb-4">
              <li>📧 Email: <a href="mailto:david.perez@internetoperadores.com" className="text-orange-500 hover:text-orange-600">david.perez@internetoperadores.com</a></li>
              <li>📞 Teléfono: <a href="tel:+34655100400" className="text-orange-500 hover:text-orange-600">+34 655 100 400</a></li>
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

