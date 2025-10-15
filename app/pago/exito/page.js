import { redirect } from "next/navigation";

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

export default async function ExitoPage({ searchParams }) {
  const sessionId = searchParams?.session_id;

  // Si no hay session_id, no se puede acceder a esta página
  if (!sessionId) {
    redirect("/");
  }

  let customerEmail = "";
  try {
    // Verificamos la sesión con Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    customerEmail = session.customer_details?.email;

    // Si la sesión no está pagada, fuera
    if (session.payment_status !== 'paid') {
      redirect("/");
    }

  } catch (error) {
    console.error("Error retrieving Stripe session:", error.message);
    redirect("/");
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

