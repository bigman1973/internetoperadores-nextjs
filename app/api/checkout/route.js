import { NextResponse } from 'next/server';

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

    // Construir parámetros para la sesión de checkout
    const params = new URLSearchParams({
      'mode': 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': quantity.toString(),
      'success_url': `${process.env.NEXT_PUBLIC_BASE_URL}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${process.env.NEXT_PUBLIC_BASE_URL}/pago/cancelado`,
    });

    // Agregar email si está presente
    if (customerEmail) {
      params.append('customer_email', customerEmail);
    }

    // Agregar metadata
    if (customerName) {
      params.append('metadata[customerName]', customerName);
    }

    // Agregar metadata adicional
    Object.entries(metadata).forEach(([key, value]) => {
      params.append(`metadata[${key}]`, String(value));
    });

    // Crear sesión de Checkout usando fetch
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    } );

    const data = await response.json();

    if (!response.ok) {
      console.error('Error de Stripe:', data);
      return NextResponse.json(
        { error: data.error?.message || 'Error al crear sesión de pago' },
        { status: response.status }
      );
    }

    return NextResponse.json({ sessionId: data.id, url: data.url });
  } catch (error) {
    console.error('Error creando sesión de Stripe:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
