'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { WHATSAPP_NUMBER, generateSimpleWhatsAppLink } from '@/lib/whatsapp';

export default function PagoExito() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [sessionData, setSessionData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionId) {
      // Aquí podrías hacer una llamada a tu API para obtener detalles de la sesión
      // Por ahora, simplemente mostramos el sessionId
      setSessionData({ sessionId });
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [sessionId]);

  const whatsappMessage = sessionId 
    ? `Hola, acabo de completar un pago. ID de sesión: ${sessionId}. Me gustaría confirmar los próximos pasos para recibir mi Informe Cero Riesgos.`
    : `Hola, acabo de completar un pago para el Informe Cero Riesgos. Me gustaría confirmar los próximos pasos.`;

  const whatsappLink = generateSimpleWhatsAppLink(WHATSAPP_NUMBER, whatsappMessage);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          ¡Pago Exitoso!
        </h1>
        
        <p className="text-lg text-gray-600 mb-6">
          Gracias por tu compra. Hemos recibido tu pago correctamente.
        </p>

        {sessionId && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-500 mb-1">ID de Transacción</p>
            <p className="text-sm text-gray-800 font-mono break-all">{sessionId}</p>
          </div>
        )}
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-2">📧 Próximos pasos</h3>
          <ul className="text-sm text-blue-800 text-left space-y-2">
            <li>✓ Recibirás un email de confirmación de Stripe</li>
            <li>✓ Te contactaremos en las próximas 24 horas</li>
            <li>✓ Tu informe estará listo en 48 horas</li>
          </ul>
        </div>
        
        <div className="space-y-3">
          <a 
            href={whatsappLink}
            className="block w-full bg-green-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            📱 Contactar por WhatsApp
          </a>

          <Link 
            href="/"
            className="block w-full bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
          >
            Volver al Inicio
          </Link>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            ¿Necesitas ayuda? Contáctanos por WhatsApp o envía un email a{' '}
            <a href="mailto:info@internetoperadores.com" className="text-orange-500 hover:underline">
              info@internetoperadores.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
