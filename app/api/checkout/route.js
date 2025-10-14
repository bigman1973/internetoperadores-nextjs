import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      priceId, 
      quantity = 1, 
      customerEmail, 
      customerName,
      metadata = {} 
    } = body;

    // Validar datos requeridos
    if (!priceId) {
      return NextResponse.json(
        { error: 'Price ID es requerido' },
        { status: 400 }
      );
    }

    // Crear sesión de Checkout
    const session = await stripe.checkout.sessions.create({
      mode: 'payment', // o 'subscription' para suscripciones
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: quantity,
        },
      ],
      customer_email: customerEmail,
      metadata: {
        customerName: customerName,
        ...metadata,
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pago/cancelado`,
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creando sesión de Stripe:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

