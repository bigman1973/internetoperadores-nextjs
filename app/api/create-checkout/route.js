import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';

export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      customerName,
      customerEmail,
      customerCompany,
      customerPhone,
      totalAmount,
      paymentType, // 'one-time' o 'subscription'
      breakdown, // Desglose de la cotización
    } = body;

    // Validar datos requeridos
    if (!customerEmail || !totalAmount || !paymentType) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      );
    }

    // Convertir el monto a centavos (Stripe usa centavos)
    const amountInCents = Math.round(totalAmount * 100);

    if (paymentType === 'one-time') {
      // Crear sesión para pago único
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'Informe Cero Riesgos',
                description: breakdown,
              },
              unit_amount: amountInCents,
            },
            quantity: 1,
          },
        ],
        customer_email: customerEmail,
        metadata: {
          customerName: customerName,
          customerCompany: customerCompany,
          customerPhone: customerPhone,
          paymentType: 'one-time',
          breakdown: breakdown,
        },
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pago/cancelado`,
      });

      return NextResponse.json({ sessionId: session.id, url: session.url });
    } else if (paymentType === 'subscription') {
      // Para suscripción, crear producto y precio dinámicamente
      const product = await stripe.products.create({
        name: 'Informe Cero Riesgos',
        description: breakdown,
      });

      const price = await stripe.prices.create({
        currency: 'eur',
        unit_amount: amountInCents,
        recurring: {
          interval: 'year',
        },
        product: product.id,
      });

      // Crear sesión para suscripción
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: price.id,
            quantity: 1,
          },
        ],
        customer_email: customerEmail,
        metadata: {
          customerName: customerName,
          customerCompany: customerCompany,
          customerPhone: customerPhone,
          paymentType: 'subscription',
          breakdown: breakdown,
        },
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pago/cancelado`,
      });

      return NextResponse.json({ sessionId: session.id, url: session.url });
    } else {
      return NextResponse.json(
        { error: 'Tipo de pago inválido' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error creando sesión de Stripe:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

