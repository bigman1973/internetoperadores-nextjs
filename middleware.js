import { NextResponse } from 'next/server';

export function middleware(request) {
  // Solo proteger en entorno de preview/staging (no en producción ni desarrollo local)
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isStaging = request.nextUrl.hostname.includes('staging');
  
  // Si no es staging/preview, permitir acceso sin restricciones
  if (!isPreview && !isStaging) {
    return NextResponse.next();
  }

  // Verificar si ya está autenticado (cookie de sesión)
  const authCookie = request.cookies.get('staging-auth');
  if (authCookie?.value === 'authenticated') {
    return NextResponse.next();
  }

  // Verificar credenciales de Basic Auth
  const basicAuth = request.headers.get('authorization');
  
  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    // Credenciales de acceso (puedes cambiarlas)
    const validUser = 'admin';
    const validPassword = 'internetop2025';

    if (user === validUser && pwd === validPassword) {
      // Crear respuesta con cookie de autenticación
      const response = NextResponse.next();
      response.cookies.set('staging-auth', 'authenticated', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 // 24 horas
      });
      return response;
    }
  }

  // Si no está autenticado, solicitar credenciales
  return new NextResponse('Acceso restringido - Entorno de Staging', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Staging Environment"',
    },
  });
}

// Configurar qué rutas proteger
export const config = {
  matcher: [
    /*
     * Proteger todas las rutas excepto:
     * - api (routes)
     * - _next/static (archivos estáticos)
     * - _next/image (optimización de imágenes)
     * - favicon.ico (favicon)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

