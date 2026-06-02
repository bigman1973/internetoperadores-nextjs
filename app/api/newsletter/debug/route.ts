import { NextResponse } from 'next/server';

export async function GET() {
  const brevoKey = process.env.BREVO_API_KEY || '';
  const hasKey = !!brevoKey;
  const keyLength = brevoKey.length;
  const keyPrefix = brevoKey.substring(0, 10);
  const keySuffix = brevoKey.substring(brevoKey.length - 6);
  
  // Probar la key directamente
  let apiStatus = 0;
  let apiMessage = '';
  
  if (hasKey) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
      });
      apiStatus = res.status;
      if (!res.ok) {
        const data = await res.json();
        apiMessage = data.message || 'unknown error';
      } else {
        apiMessage = 'OK';
      }
    } catch (e) {
      apiMessage = String(e);
    }
  }

  return NextResponse.json({
    hasKey,
    keyLength,
    keyPrefix: keyPrefix + '...',
    keySuffix: '...' + keySuffix,
    apiStatus,
    apiMessage,
  });
}
