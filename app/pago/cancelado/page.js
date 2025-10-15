'use client';

import Link from 'next/link';
import { WHATSAPP_NUMBER, generateSimpleWhatsAppLink } from '@/lib/whatsapp';

export default function PagoCancelado() {
  const whatsappMessage = `Hola, necesito ayuda con el proceso de pago del Informe Cero Riesgos. Tuve que cancelar la transacción.`;
  const whatsappLink = generateSimpleWhatsAppLink(WHATSAPP_NUMBER, whatsappMessage);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Pago Cancelado
        </h1>
        
        <p className="text-lg text-gray-600 mb-6">
          Has cancelado el proceso de pago. No se ha realizado ningún cargo.
        </p>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-2">💡 ¿Tuviste algún problema?</h3>
          <ul className="text-sm text-blue-800 text-left space-y-1">
            <li>• Puedes intentar nuevamente cuando quieras</li>
            <li>• Contáctanos si necesitas ayuda</li>
            <li>• Aceptamos múltiples métodos de pago</li>
          </ul>
        </div>
        
        <div className="space-y-3">
          <Link 
            href="/cero-riesgos/cotizar"
            className="block w-full bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
          >
            🔄 Volver a Intentar
          </Link>

          <a 
            href={whatsappLink}
            className="block w-full bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Necesito Ayuda (WhatsApp)
          </a>
          
          <Link 
            href="/"
            className="block w-full bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            Volver al Inicio
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            También puedes contactarnos por email:{' '}
            <a href="mailto:info@internetoperadores.com" className="text-orange-500 hover:underline">
              info@internetoperadores.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
