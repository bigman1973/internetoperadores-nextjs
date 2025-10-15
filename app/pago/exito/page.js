import Link from 'next/link';

export default function PagoExito() {
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
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            Recibirás un correo electrónico con los detalles de tu compra y los próximos pasos.
          </p>
        </div>
        
        <div className="space-y-3">
          <Link 
            href="/"
            className="block w-full bg-orange-500 text-white px-6 py-3 rounded font-semibold hover:bg-orange-600 transition-colors"
          >
            Volver al Inicio
          </Link>
          
          <a 
            href="https://wa.me/34655100400?text=Hola,%20acabo%20de%20realizar%20un%20pago"
            className="block w-full bg-green-500 text-white px-6 py-3 rounded font-semibold hover:bg-green-600 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            Contactar por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
