import { redirect } from "next/navigation";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

export default async function ExitoPage({ searchParams }) {
  const sessionId = searchParams?.session_id;

  // Si no hay session_id, redirigir a la página principal
  if (!sessionId) {
    console.log('❌ No hay session_id en la URL');
    redirect("/");
  }

  let customerEmail = "";
  let customerName = "";
  let paymentStatus = "unknown";
  let sessionData = null;

  try {
    console.log('🔍 Intentando recuperar sesión:', sessionId);
    
    // Verificamos la sesión con Stripe con reintentos
    let attempts = 0;
    const maxAttempts = 3;
    let lastError = null;

    while (attempts < maxAttempts) {
      try {
        sessionData = await stripe.checkout.sessions.retrieve(sessionId, {
          timeout: 10000, // 10 segundos de timeout
        });
        console.log('✅ Sesión recuperada exitosamente');
        break;
      } catch (err) {
        lastError = err;
        attempts++;
        console.log(`⚠️ Intento ${attempts}/${maxAttempts} falló:`, err.message);

  
        if (attempts < maxAttempts) {
          // Esperar 1 segundo antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    if (!sessionData) {
      throw lastError || new Error('No se pudo recuperar la sesión después de varios intentos');
    }

    customerEmail = sessionData.customer_details?.email || sessionData.customer_email || "";
    customerName = sessionData.customer_details?.name || "";
    paymentStatus = sessionData.payment_status;

    console.log('📊 Datos de la sesión:', {
      email: customerEmail,
      name: customerName,
      status: paymentStatus,
      mode: sessionData.mode
    });

    // Si la sesión no está pagada, redirigir
    if (paymentStatus !== 'paid') {
      console.log('❌ La sesión no está marcada como pagada:', paymentStatus);
      redirect("/");
    }

  } catch (error) {
    console.error('❌ Error completo al recuperar sesión de Stripe:', error);
    
    // En lugar de redirigir inmediatamente, mostrar un mensaje de error
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
        <div className="bg-white p-10 rounded-lg shadow-lg max-w-2xl mx-auto">
          <svg
            className="w-16 h-16 text-yellow-500 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            ></path>
          </svg>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Verificando tu pago...
          </h1>
          <p className="text-gray-600 mb-6">
            Estamos teniendo problemas temporales para verificar tu pago con Stripe.
              

            <strong>Tu pago se ha procesado correctamente</strong>, pero no podemos confirmar los detalles en este momento.
          </p>
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200 text-left">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">
              ¿Qué hacer ahora?
            </h2>
            <ul className="text-gray-700 space-y-2">
              <li>✅ Tu pago ha sido procesado correctamente por Stripe</li>
              <li>📧 Recibirás un correo de confirmación en breve</li>
              <li>🔄 Puedes recargar esta página en unos minutos</li>
              <li>📞 Si tienes dudas, contacta con nosotros por WhatsApp</li>
            </ul>
          </div>
          <div className="mt-6">
            <p className="text-sm text-gray-500">
              ID de sesión: <code className="bg-gray-100 px-2 py-1 rounded">{sessionId}</code>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Error técnico: {error.message}
            </p>
          </div>
        </div>
      </div>
     );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
      <div className="bg-white p-10 rounded-lg shadow-lg max-w-2xl mx-auto">
        <svg
          className="w-16 h-16 text-green-500 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          ¡Pago completado con éxito!
        </h1>
        <p className="text-gray-600 mb-6">
          Hemos recibido tu pago correctamente.
          {customerEmail && (
            <>
                

              En breve recibirás un correo de confirmación en{" "}
              <strong className="text-gray-900">{customerEmail}</strong>.
            </>
           )}
        </p>
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">
            Siguientes Pasos: Datos Fiscales
          </h2>
          <p className="text-gray-700">
            Para poder generar tu factura, necesitamos que completes tus datos
            fiscales.
          </p>
          {/* Aquí es donde irá el formulario en el siguiente paso */}
        </div>
      </div>
    </div>
  );
}

