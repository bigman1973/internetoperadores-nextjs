export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Solo inicializar Stripe si la clave existe (evita error en build)
const stripe = process.env.STRIPE_SECRET_KEY 
  ? require("stripe")(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(req) {
  // Validar que Stripe esté configurado
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe no está configurado. Añade STRIPE_SECRET_KEY a las variables de entorno." },
      { status: 500 }
    );
  }

  const { priceId } = await req.json();
  const origin = req.headers.get("origin") || "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      // AQUÍ ESTÁ EL CAMBIO IMPORTANTE:
      success_url: `${origin}/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/`,
    } );

    return NextResponse.json({ sessionId: session.id });
  } catch (err) {
    console.error("Error creating Stripe subscription session:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
