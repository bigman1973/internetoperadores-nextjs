import { NextResponse } from 'next/server';

function financeAreas(pathname) {
  const section = pathname.slice('/api/admin/finanzas/'.length).split('/')[0];
  const aliases = {
    dashboard: ['admin.finanzas'],
    'analitica-costes': ['admin.finanzas.analitica_costes'],
    rentabilidad: ['admin.finanzas.analitica_costes'],
    clientes: pathname.startsWith('/api/admin/finanzas/clientes/ggcc-draxton')
      ? ['admin.finanzas.ggcc_draxton'] : [],
    'cobros-pendientes': ['admin.finanzas.cobros_pendientes'],
    conciliacion: ['admin.finanzas.conciliacion'],
    'conciliacion-remesas': ['admin.finanzas.conciliacion_remesas'],
    cuentas: ['admin.finanzas.movimientos', 'admin.finanzas.conciliacion'],
    'datos-fiscales': ['admin.finanzas.datos_fiscales'],
    'estado-cuentas': ['admin.finanzas.importar'],
    'exportar-a3': ['admin.finanzas.exportar_a3'],
    facturas: ['admin.finanzas.facturas'],
    'facturas-emitidas': ['admin.finanzas.facturas_emitidas'],
    'importar-movimientos': ['admin.finanzas.importar'],
    'sincronizar-onedrive': ['admin.finanzas.facturas'],
    imputacion: ['admin.finanzas.facturas'],
    movimientos: ['admin.finanzas.movimientos'],
    nominas: ['admin.finanzas.conciliacion'],
    tickets: ['admin.finanzas.tickets'],
  };
  return aliases[section] || [];
}

export async function middleware(request) {
  // Las APIs financieras heredadas se comprueban aquí mientras se llevan
  // progresivamente las autorizaciones al interior de cada handler.
  if (request.nextUrl.pathname.startsWith('/api/admin/finanzas/')) {
    const [{ getToken }, { default: prisma }] = await Promise.all([
      import('next-auth/jwt'), import('@/lib/prisma'),
    ]);
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (token?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const userId = Number(token.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const areas = financeAreas(request.nextUrl.pathname);
    if (!areas.length) return NextResponse.json({ error: 'Área financiera no registrada' }, { status: 403 });
    try {
      const [user, inactive] = await Promise.all([
        prisma.usuarioAdmin.findUnique({
          where: { id: userId },
          select: {
            activo: true, rol: true, roles: true,
            permisos: {
              where: { area: { activo: true } },
              select: { lectura: true, escritura: true, area: { select: { codigo: true } } },
            },
          },
        }),
        prisma.permisoArea.findMany({
          where: { codigo: { in: areas }, activo: false }, select: { codigo: true },
        }),
      ]);
      if (!user?.activo) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      // La sección de tickets es exclusiva de superadministradores también en la UI.
      if (request.nextUrl.pathname.startsWith('/api/admin/finanzas/tickets') && user.rol !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
      }
      if (user.rol !== 'SUPER_ADMIN' && user.rol !== 'GERENTE') {
        const inactiveCodes = new Set(inactive.map(area => area.codigo));
        const activeAreas = areas.filter(area => !inactiveCodes.has(area));
        if (!activeAreas.length) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
        const required = request.method === 'GET' || request.method === 'HEAD' ? 'lectura' : 'escritura';
        const hasGranular = user.permisos.some(p => p.lectura || p.escritura);
        const permitted = user.permisos.some(p =>
          p[required] && activeAreas.some(area => area === p.area.codigo || area.startsWith(`${p.area.codigo}.`))
        );
        const roles = [user.rol, ...(user.roles || [])];
        if (!permitted && (hasGranular || !roles.includes('CONTABILIDAD'))) {
          return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
        }
      }
    } catch (error) {
      console.error('Error verificando acceso financiero:', error);
      return NextResponse.json({ error: 'No se pudo verificar el acceso' }, { status: 503 });
    }
    return NextResponse.next();
  }

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
  runtime: 'nodejs',
  matcher: [
    '/api/admin/finanzas/:path*',
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
