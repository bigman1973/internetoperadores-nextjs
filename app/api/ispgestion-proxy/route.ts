import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { endpoint, method, data, params } = body;
    
    // Credenciales de ISPGestión
    const apiUrl = process.env.ISPGESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
    const apiUser = process.env.ISPGESTION_USERNAME || 'VOLA';
    const apiPassword = process.env.ISPGESTION_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
    
    // Construir URL con parámetros de autenticación
    // Probar con 'password' o 'clave' en lugar de 'hash'
    const url = new URL(`${apiUrl}/${endpoint}`);
    url.searchParams.append('usuario', apiUser);
    url.searchParams.append('password', apiPassword);  // Cambiado de 'hash' a 'password'
    
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
        'Accept': 'application/json',
      },
    };
    
    // Solo añadir body si hay datos y no es GET
    if (data && method !== 'GET') {
      fetchOptions.body = JSON.stringify(data);
    }
    
    const response = await fetch(url.toString(), fetchOptions);
    const responseText = await response.text();
    
    console.log(`[ISPGestión Proxy] Status: ${response.status}`);
    console.log(`[ISPGestión Proxy] Respuesta (primeros 500 chars):`, responseText.substring(0, 500));
    
    // Si la respuesta no es OK, devolver error con detalles
    if (!response.ok) {
      return NextResponse.json({ 
        success: false, 
        error: `ISPGestión devolvió error ${response.status}`,
        status: response.status,
        statusText: response.statusText,
        details: responseText.includes('<!DOCTYPE') 
          ? 'La API devolvió HTML en lugar de JSON. Posible error de autenticación o IP no autorizada.'
          : responseText.substring(0, 500)
      }, { status: response.status });
    }
    
    // Intentar parsear como JSON
    try {
      const result = JSON.parse(responseText);
      return NextResponse.json(result);
    } catch (parseError) {
      // Si no es JSON válido, devolver error
      return NextResponse.json({ 
        success: false, 
        error: 'La respuesta de ISPGestión no es JSON válido',
        rawResponse: responseText.substring(0, 1000)
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error('[ISPGestión Proxy] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

// Endpoint de diagnóstico para verificar configuración
export async function GET() {
  const apiUrl = process.env.ISPGESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
  const apiUser = process.env.ISPGESTION_USERNAME || 'VOLA';
  const apiPassword = process.env.ISPGESTION_HASH || '(no configurado)';
  
  return NextResponse.json({
    status: 'ok',
    config: {
      apiUrl,
      apiUser,
      passwordConfigured: apiPassword !== '(no configurado)',
      passwordPreview: apiPassword !== '(no configurado)' ? apiPassword.substring(0, 8) + '...' : 'N/A'
    },
    message: 'Proxy ISPGestión funcionando. Use POST para hacer peticiones.'
  });
}
