import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': 'payment',
        'payment_method_types[0]': 'card',
        'line_items[0][price_data][currency]': 'eur',
        'line_items[0][price_data][product_data][name]': 'Test Product',
        'line_items[0][price_data][unit_amount]': '1000',
        'line_items[0][quantity]': '1',
        'success_url': 'https://example.com/success',
        'cancel_url': 'https://example.com/cancel',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        status: response.status,
        error: data,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      sessionId: data.id,
      url: data.url,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}

