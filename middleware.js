import { NextResponse } from 'next/server';

const SAFE_API_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALWAYS_BLOCKED_AUTOMATIC_RECONCILIATION_POSTS = new Set([
  '/api/admin/finanzas/conciliacion/auto',
  // La ruta raíz heredada ya rechaza el POST; el borde lo mantiene bloqueado
  // incluso si un handler futuro se modificara por error.
  '/api/admin/finanzas/conciliacion',
  // La ruta heredada descargaba Graph y auto-vinculaba/cobraba confirmings.
  '/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings',
  '/api/admin/finanzas/conciliacion-remesas',
  '/api/admin/finanzas/conciliacion-remesas/importar-pdf',
  '/api/admin/finanzas/conciliacion-remesas/importar-devoluciones',
  '/api/admin/finanzas/clientes/ggcc-draxton',
]);

function blockedBoundary(error, codigo) {
  return NextResponse.json({ error, codigo }, {
    status: 403,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

function isNextAuthOrLoginPath(pathname) {
  return pathname.startsWith('/api/auth/')
    || pathname === '/api/login'
    || pathname.startsWith('/api/login/');
}

function isSyncImportOrGraphPath(pathname) {
  return pathname.toLowerCase().split('/').some(segment =>
    segment.startsWith('sync')
    || segment.startsWith('sincroniz')
    || segment.startsWith('import')
    || segment.startsWith('graph')
  );
}

function isOutboundMailOrCommunicationPath(pathname) {
  return pathname.toLowerCase().split('/').some(segment =>
    /^(mail|email|correo|notific|comunic|enviar)/.test(segment)
  );
}

function financeAreas(pathname) {
  const section = pathname.slice('/api/admin/finanzas/'.length).split('/')[0];
  const aliases = {
    dashboard: ['admin.finanzas'],
    'analitica-costes': ['admin.finanzas.analitica_costes'],
    'costes-operadora': ['admin.finanzas.analitica_costes'],
    rentabilidad: ['admin.finanzas.analitica_costes'],
    clientes: pathname.startsWith('/api/admin/finanzas/clientes/ggcc-draxton')
      ? ['admin.finanzas.ggcc_draxton'] : [],
    'cobros-pendientes': ['admin.finanzas.cobros_pendientes'],
    conciliacion: ['admin.finanzas.conciliacion'],
    'conciliacion-v2': ['admin.finanzas.conciliacion'],
    'conciliacion-propuestas': ['admin.finanzas.conciliacion'],
    pendientes: ['admin.finanzas.conciliacion'],
    'centros-coste': ['admin.finanzas.conciliacion'],
    'confirming-draxton': ['admin.finanzas.conciliacion'],
    'conciliacion-remesas': ['admin.finanzas.conciliacion_remesas'],
    remesas: pathname === '/api/admin/finanzas/remesas/b6' ? ['admin.finanzas.conciliacion'] : [],
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
    'nominas-propuestas': ['admin.finanzas.conciliacion'],
    tickets: ['admin.finanzas.tickets'],
  };
  return aliases[section] || [];
}

export async function middleware(request) {
  if (process.env.FINANCE_STAGING_SANDBOX === '1' && request.nextUrl.pathname.startsWith('/api/')) {
    const path = request.nextUrl.pathname;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    // Se amplía por bloques validados, nunca por toda el área financiera.
    const allowed = path === '/api/admin/finanzas/sincronizar-onedrive'
      || (/^\/api\/admin\/finanzas\/facturas\/calidad\/[^/]{1,100}$/.test(path) && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/importar-movimientos' && request.method === 'POST')
      || (/^\/api\/admin\/finanzas\/movimientos\/[^/]{1,100}$/.test(path) && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/conciliacion-v2' && request.method === 'POST')
      || (path === '/api/admin/finanzas/pendientes' && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/pendientes/documento' && request.method === 'POST')
      || (path === '/api/admin/finanzas/remesas/b6' && request.method === 'POST')
      || (path === '/api/admin/finanzas/confirming-draxton' && request.method === 'POST')
      || (path === '/api/admin/finanzas/centros-coste' && ['POST','PATCH'].includes(request.method))
      || (path === '/api/admin/finanzas/centros-coste/asignar' && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/exportar-a3' && request.method === 'POST')
      || path.startsWith('/api/auth/');
    if (path.startsWith('/api/cron/') || (mutating && !allowed)) {
      return NextResponse.json({ error: 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    }
  }
  const path = request.nextUrl.pathname;
  const isMutatingApiMethod = !SAFE_API_METHODS.has(request.method);

  // Bloqueo externo independiente: no impide confirmar documentación manual.
  if (process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED === '1' && path.startsWith('/api/') && !isNextAuthOrLoginPath(path)) {
    const externalPath = path.startsWith('/api/cron/')
      || path.toLowerCase().split('/').some(segment => segment.startsWith('sync') || segment.startsWith('sincroniz'))
      || isOutboundMailOrCommunicationPath(path);
    if (externalPath) return blockedBoundary(
      'Sincronizaciones y comunicaciones externas desactivadas en este lanzamiento; las acciones financieras manuales siguen disponibles.',
      'FINANCE_EXTERNAL_ACTIONS_DISABLED',
    );
  }

  // No feature flag can re-enable automatic linking.  Keep this boundary ahead
  // of the financial authorization (and therefore ahead of its database I/O).
  if (request.method === 'POST' && (ALWAYS_BLOCKED_AUTOMATIC_RECONCILIATION_POSTS.has(path)
    || /^\/api\/admin\/finanzas\/tickets\/[^/]+\/conciliar$/.test(path))) {
    return NextResponse.json({
      error: 'Los vínculos automáticos de conciliación están desactivados; revise propuestas y confirme manualmente.',
      codigo: 'FINANCE_AUTOMATIC_LINKS_DISABLED',
    }, {
      status: 409,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  }

  // Production deployment window: normal API reads remain available, including
  // document downloads.  Cron, import/sync/Graph and outbound communication
  // endpoints are denied even on GET so they cannot perform hidden I/O.
  if (process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1' && path.startsWith('/api/') && !isNextAuthOrLoginPath(path)) {
    const blockedReadPath = path.startsWith('/api/cron/')
      || isSyncImportOrGraphPath(path)
      || isOutboundMailOrCommunicationPath(path);
    if (blockedReadPath) {
      return blockedBoundary(
        'Operación externa bloqueada durante la ventana de solo lectura financiera.',
        'FINANCE_DEPLOYMENT_READ_ONLY',
      );
    }
    // The narrowly approved permissions POST remains reachable.  All other
    // writes are stopped before their route handlers can authenticate, mutate,
    // send mail, or call external providers.
    if (isMutatingApiMethod && !(path === '/api/admin/permisos' && request.method === 'POST')) {
      return blockedBoundary(
        'Las escrituras API están bloqueadas durante la ventana de solo lectura financiera.',
        'FINANCE_DEPLOYMENT_READ_ONLY',
      );
    }
  }

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

  // Las APIs no financieras conservan su autenticación propia.
  if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

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
    '/api/:path*',
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
