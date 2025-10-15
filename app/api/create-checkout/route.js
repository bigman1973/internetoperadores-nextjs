import { NextResponse } from 'next/server';

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
      // Crear sesión para pago único usando fetch
      const params = new URLSearchParams({
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][product_data][name]': 'Informe Cero Riesgos',
        'line_items[0][price_data][product_data][description]': breakdown || '',
        'line_items[0][price_data][unit_amount]': amountInCents.toString(),
        'line_items[0][quantity]': '1',
        'customer_email': customerEmail,
        'metadata[customerName]': customerName || '',
        'metadata[customerCompany]': customerCompany || '',
        'metadata[customerPhone]': customerPhone || '',
        'metadata[paymentType]': 'one-time',
        'metadata[breakdown]': breakdown || '',
        'success_url': `${process.env.NEXT_PUBLIC_BASE_URL}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${process.env.NEXT_PUBLIC_BASE_URL}/pago/cancelado`,
      });

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

    } else if (paymentType === 'subscription-annual' || paymentType === 'subscription-biennial') {
      // Para suscripción, primero crear producto
      const productParams = new URLSearchParams({
        'name': 'Informe Cero Riesgos',
        'description': breakdown || '',
      });

      const productResponse = await fetch('https://api.stripe.com/v1/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: productParams,
      } );

      const productData = await productResponse.json();

      if (!productResponse.ok) {
        console.error('Error creando producto:', productData);
        return NextResponse.json(
          { error: productData.error?.message || 'Error al crear producto' },
          { status: productResponse.status }
        );
      }

      // Determinar el monto y el intervalo según el tipo de suscripción
      let finalAmount = amountInCents;
      let interval = 'year';
      let intervalCount = 1;
      
      if (paymentType === 'subscription-biennial') {
        // Suscripción bienal: 2 años con 10% de descuento
        finalAmount = Math.round(amountInCents * 2 * 0.9);
        intervalCount = 2;
      }

      // Crear precio para el producto
      const priceParams = new URLSearchParams({
        'currency': 'eur',
        'unit_amount': finalAmount.toString(),
        'recurring[interval]': interval,
        'recurring[interval_count]': intervalCount.toString(),
        'product': productData.id,
      });

      const priceResponse = await fetch('https://api.stripe.com/v1/prices', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: priceParams,
      } );

      const priceData = await priceResponse.json();

      if (!priceResponse.ok) {
        console.error('Error creando precio:', priceData);
        return NextResponse.json(
          { error: priceData.error?.message || 'Error al crear precio' },
          { status: priceResponse.status }
        );
      }

      // Crear sesión de suscripción
      const sessionParams = new URLSearchParams({
        'mode': 'subscription',
        'payment_method_types[0]': 'card',
        'line_items[0][price]': priceData.id,
        'line_items[0][quantity]': '1',
        'customer_email': customerEmail,
        'metadata[customerName]': customerName || '',
        'metadata[customerCompany]': customerCompany || '',
        'metadata[customerPhone]': customerPhone || '',
        'metadata[paymentType]': paymentType,
        'metadata[breakdown]': breakdown || '',
        'success_url': `${process.env.NEXT_PUBLIC_BASE_URL}/pago/exito?session_id={CHECKOUT_SESSION_ID}`,
        'cancel_url': `${process.env.NEXT_PUBLIC_BASE_URL}/pago/cancelado`,
      });

      const sessionResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: sessionParams,
      } );

      const sessionData = await sessionResponse.json();

      if (!sessionResponse.ok) {
        console.error('Error creando sesión:', sessionData);
        return NextResponse.json(
          { error: sessionData.error?.message || 'Error al crear sesión de suscripción' },
          { status: sessionResponse.status }
        );
      }

      return NextResponse.json({ sessionId: sessionData.id, url: sessionData.url });

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
