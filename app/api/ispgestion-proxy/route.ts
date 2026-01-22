import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { endpoint, method, data, params } = body;
    
    const apiUrl = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
    const apiUser = process.env.ISP_GESTION_API_USER || 'VOLA';
    const apiHash = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
    
    // Construir URL con parámetros de autenticación
    const url = new URL(`${apiUrl}/${endpoint}`);
    url.searchParams.append('usuario', apiUser);
    url.searchParams.append('hash', apiHash);
    
    // Añadir parámetros adicionales si existen
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }
    
    console.log(`[ISPGestión Proxy] Llamando a: ${url.toString()}`);
    
    const fetchOptions: RequestInit = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    // Solo añadir body si hay datos y no es GET
    if (data && method !== 'GET') {
      fetchOptions.body = JSON.stringify(data);
    }
    
    const response = await fetch(url.toString(), fetchOptions);
    const result = await response.json();
    
    console.log(`[ISPGestión Proxy] Respuesta:`, result);
    
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[ISPGestión Proxy] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
