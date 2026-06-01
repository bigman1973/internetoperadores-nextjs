import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.HUBSPOT_API_KEY || '';
  
  if (!token) {
    return NextResponse.json({ 
      status: 'ERROR', 
      message: 'HUBSPOT_API_KEY no está configurada',
      tokenPresent: false 
    });
  }

  // Probar el token haciendo una llamada simple a la API
  try {
    const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();

    if (res.ok) {
      return NextResponse.json({
        status: 'OK',
        message: 'Token de HubSpot válido',
        tokenPresent: true,
        tokenPrefix: token.substring(0, 10) + '...',
        apiStatus: res.status,
        contactCount: data.total || 'unknown',
      });
    } else {
      return NextResponse.json({
        status: 'ERROR',
        message: 'Token de HubSpot inválido o expirado',
        tokenPresent: true,
        tokenPrefix: token.substring(0, 10) + '...',
        apiStatus: res.status,
        apiError: data,
      });
    }
  } catch (error) {
    return NextResponse.json({
      status: 'ERROR',
      message: 'Error de conexión con HubSpot',
      tokenPresent: true,
      error: String(error),
    });
  }
}
