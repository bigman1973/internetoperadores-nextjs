import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function GET() {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-11-20.acacia',
    });

    // Intentar crear una sesión de prueba
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Test Product',
            },
            unit_amount: 1000, // 10 EUR
          },
          quantity: 1,
        },
      ],
      success_url: 'https://example.com/success',
      cancel_url: 'https://example.com/cancel',
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      type: error.type,
      code: error.code,
    }, { status: 500 });
  }
}

