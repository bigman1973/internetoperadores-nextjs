import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { endpoint, method, data } = body;

    const apiUrl = process.env.ISP_GESTION_API_URL;
    const apiUser = process.env.ISP_GESTION_API_USER;
    const apiHash = process.env.ISP_GESTION_API_HASH;

    const response = await fetch(`${apiUrl}/${endpoint}`, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        usuario: apiUser || '',
        hash: apiHash || '',
        ...data
      })
    });

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
