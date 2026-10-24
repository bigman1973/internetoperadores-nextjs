import { NextResponse } from 'next/server';

const SAFE_API_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const IMPERSONATION_HEADER = 'x-io-impersonation-context';
const EXPECTED_IMPERSONATION_SESSION_HEADER = 'x-io-acting-session';

function configuredSessionCookieName() {
  return process.env.NEXTAUTH_URL?.startsWith('https://') || process.env.VERCEL === '1'
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';
}

function privateBoundary(body, status = 403) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'private, no-store, max-age=0', Pragma: 'no-cache', Expires: '0', Vary: 'Cookie',
  } });
}

function continueRequest(headers) {
  return NextResponse.next({ request: { headers } });
}

function clearEffectiveSession(response, cookieName) {
  response.cookies.set(cookieName, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
  for (let index = 0; index < 8; index += 1) {
    response.cookies.set(`${cookieName}.${index}`, '', { httpOnly: true, secure: true, sameSite: 'strict', path: '/', maxAge: 0 });
  }
  return response;
}

/** The matrix requirement is checked against the freshly read effective target.
 * It deliberately does not call verificarPermisoServer: that helper's role
 * fallback is correct for ordinary requests but must never become actor-derived
 * authority during an acting session. */
async function targetHasLiveMatrixPermission(policy, targetId, requirement) {
  if (!requirement || !Number.isSafeInteger(targetId) || targetId <= 0) return false;
  const areas = [...new Set(requirement.areas)];
  if (!areas.length) return false;
  const { default: prisma } = await import('@/lib/prisma');
  const [target, activeAreas] = await Promise.all([
    prisma.usuarioAdmin.findUnique({
      where: { id: targetId },
      select: {
        activo: true,
        rol: true,
        roles: true,
        permisos: {
          where: { area: { activo: true } },
          select: { lectura: true, escritura: true, area: { select: { codigo: true } } },
        },
      },
    }),
    prisma.permisoArea.findMany({
      where: { codigo: { in: areas }, activo: true },
      select: { codigo: true },
    }),
  ]);
  return policy.targetHasLiveRoutePermission({
    target: target ? {
      activo: target.activo,
      rol: target.rol,
      roles: target.roles,
      permisos: target.permisos.map(permission => ({
        area: permission.area.codigo,
        lectura: permission.lectura,
        escritura: permission.escritura,
      })),
    } : null,
    requirement,
    activeAreas: activeAreas.map(area => area.codigo),
  });
}

/** Reads at most 16 KiB from a clone. It never consumes the handler body. */
async function impersonationAction(request) {
  if (SAFE_API_METHODS.has(request.method)) return null;
  const type = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (type === 'multipart/form-data') return '__multipart__';
  if (type !== 'application/json') return null;
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 16 * 1024)) return null;
  try {
    const reader = request.clone().body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let bytes = 0; let text = '';
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 16 * 1024) { await reader.cancel().catch(() => undefined); return null; }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const action = value.action;
    return typeof action === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(action) ? action : null;
  } catch { return null; }
}

/**
 * Acting is a centrally fail-closed request mode. It runs before every legacy
 * route/Server Action and injects a MAC that browser headers cannot forge.
 * Completion auditing is performed by the Prisma guard only after mutations
 * return; this boundary records the pre-dispatch attempt.
 */
async function impersonationBoundary(request) {
  try {
    const [{ getToken }, policy, acting, context] = await Promise.all([
      import('next-auth/jwt'), import('@/lib/impersonation-policy'), import('@/lib/impersonation'), import('@/lib/impersonation-context'),
    ]);
    // Browser values are never forwarded as authority. The expected-session
    // header below is only a stale-form precondition; the signed context is
    // generated afresh after a live ledger check.
    const headers = new Headers(request.headers);
    headers.delete(IMPERSONATION_HEADER);
    headers.delete(EXPECTED_IMPERSONATION_SESSION_HEADER);
    const cookieName = acting.nextAuthSessionCookieName();
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName });
    const claims = acting.readImpersonationClaims(token);
    const expectedSession = request.headers.get(EXPECTED_IMPERSONATION_SESSION_HEADER);
    if (expectedSession !== null && (!policy.IMPERSONATION_UUID.test(expectedSession) || !claims || claims.sessionId !== expectedSession)) {
      // A stale Lorena form must not fall through to a restored Víctor cookie.
      return { response: privateBoundary({ error: 'La pestaña ya no tiene la sesión de actuación esperada.', codigo: 'IMPERSONATION_STALE_SESSION_DENIED' }) };
    }
    if (!claims) return { headers };

    // There is exactly one path representation during an acting session. Check
    // raw bytes before URL normalization: percent escapes, dot segments,
    // separators, repeated slashes, trailing slash and case ambiguity deny.
    const rawPath = policy.rawRequestPathBeforeNormalization(request.url);
    const normalizedPath = request.nextUrl.pathname;
    const path = policy.canonicalActingPath(rawPath, normalizedPath);
    if (!path) {
      return { response: privateBoundary({ error: 'Ruta no válida durante actuación.', codigo: 'IMPERSONATION_ENCODED_ROUTE_DENIED' }, 400) };
    }

    // An Authorization bearer header is never a substitute for the browser's
    // HttpOnly cookie in acting mode, even when a cookie happens to be present.
    if (request.headers.has('authorization')) {
      return { response: privateBoundary({ error: 'La actuación sólo admite la cookie de sesión web.', codigo: 'IMPERSONATION_AUTH_HEADER_DENIED' }, 401) };
    }

    // A new interactive sign-in must terminate the old effective session before
    // NextAuth can issue a different account cookie. Normal signOut records its
    // terminal receipt through authOptions.events.signOut.
    if (policy.isLoginReplacementPath(path)) {
      await acting.terminateImpersonationToken(token, 'LOGIN');
      return { headers };
    }
    if (path === '/api/auth/signout' && request.method === 'POST') return { headers };

    const action = await impersonationAction(request);
    if (request.headers.has('next-action')) {
      return { response: privateBoundary({ error: 'Las Server Actions no están disponibles durante una actuación.', codigo: 'IMPERSONATION_SERVER_ACTION_DENIED' }) };
    }

    // Explicit exit remains reachable after expiry/revocation so it can recover
    // the encrypted original identity. `iniciar` is equally narrow here: it
    // reaches only the endpoint's exact lost-response replay branch. Neither
    // control action receives an acting context for a business mutation.
    if (path === '/api/admin/actuar-como' && request.method === 'POST' && (action === 'salir' || action === 'iniciar')) return { headers };
    // State is also a closed recovery surface. Its handler will verify live
    // sessions normally and, only after absolute expiry, expose non-authorizing
    // restorable metadata so the foreground can submit the exit POST.
    if (path === '/api/admin/actuar-como' && SAFE_API_METHODS.has(request.method)) return { headers };

    const origin = context.trustedRequestOrigin(request.headers);
    let live;
    try {
      live = await acting.resolveLiveImpersonation(token);
    } catch (error) {
      // Do not erase the JWE: it contains the only encrypted restoration proof.
      // It carries no privilege because every route remains denied until salir.
      try {
        await acting.appendImpersonationAudit({
          sessionId: claims.sessionId, actorId: Number(claims.actorId), targetId: Number(claims.targetId),
          kind: 'REQUEST', outcome: 'DENIED', method: request.method, path, ip: origin.ip,
          detail: { code: error?.code || 'IMPERSONATION_INVALID', ipSource: origin.source },
        });
      } catch {
        return { response: privateBoundary({ error: 'No se pudo verificar la seguridad de actuación.', codigo: 'IMPERSONATION_FAIL_CLOSED' }, 503) };
      }
      const status = error?.status === 503 ? 503 : 401;
      return { response: privateBoundary({ error: 'La sesión de actuación no está autorizada.', codigo: error?.code || 'IMPERSONATION_INVALID' }, status) };
    }

    const isBusinessMutation = !SAFE_API_METHODS.has(request.method)
      && !path.startsWith('/api/auth/')
      && path !== '/api/admin/actuar-como';
    if (isBusinessMutation && expectedSession === null) {
      await acting.appendImpersonationAudit({
        sessionId: live.active.sessionId, actorId: live.actor.id, targetId: live.target.id,
        kind: 'REQUEST', outcome: 'DENIED', method: request.method, path, ip: origin.ip, reason: live.reason,
        detail: { code: 'IMPERSONATION_EXPECTED_SESSION_REQUIRED', action, ipSource: origin.source },
      });
      return { response: privateBoundary({ error: 'La solicitud debe confirmar la sesión de actuación vigente.', codigo: 'IMPERSONATION_EXPECTED_SESSION_REQUIRED' }) };
    }

    const route = policy.impersonationRouteDecision(path, request.method, request.nextUrl.searchParams, live.target.id, action);
    if (!route.allowed) {
      await acting.appendImpersonationAudit({
        sessionId: live.active.sessionId, actorId: live.actor.id, targetId: live.target.id,
        kind: 'REQUEST', outcome: 'DENIED', method: request.method, path, ip: origin.ip, reason: live.reason,
        detail: { code: 'IMPERSONATION_ROUTE_DENIED', action, ipSource: origin.source },
      });
      return { response: privateBoundary({ error: 'Esta superficie no está disponible durante una actuación.', codigo: 'IMPERSONATION_ROUTE_DENIED' }) };
    }
    if (route.permission && !await targetHasLiveMatrixPermission(policy, live.target.id, route.permission)) {
      await acting.appendImpersonationAudit({
        sessionId: live.active.sessionId, actorId: live.actor.id, targetId: live.target.id,
        kind: 'REQUEST', outcome: 'DENIED', method: request.method, path, ip: origin.ip, reason: live.reason,
        detail: { code: 'IMPERSONATION_TARGET_PERMISSION_DENIED', purpose: route.purpose, action, ipSource: origin.source },
      });
      return { response: privateBoundary({ error: 'El destino efectivo no dispone del permiso actual para esta superficie.', codigo: 'IMPERSONATION_TARGET_PERMISSION_DENIED' }) };
    }

    // Every forwarded request has a durable pre-dispatch record. The browser
    // body/query/cookies and untrusted headers are never included in the ledger.
    await acting.appendImpersonationAudit({
      sessionId: live.active.sessionId, actorId: live.actor.id, targetId: live.target.id,
      kind: 'REQUEST', outcome: 'ATTEMPT', method: request.method, path, ip: origin.ip, reason: live.reason,
      detail: { purpose: route.purpose, action, ipSource: origin.source },
    });
    headers.set(IMPERSONATION_HEADER, context.signTrustedImpersonationContext({
      v: 'v1', sessionId: live.active.sessionId, actorId: live.actor.id, targetId: live.target.id,
      reason: live.reason, method: request.method, path, action, ip: origin.ip, ipSource: origin.source,
    }));
    return { headers };
  } catch (error) {
    // A DB/audit/configuration failure is never permission to enter a handler.
    return { response: privateBoundary({ error: 'No se pudo verificar la seguridad de actuación.', codigo: 'IMPERSONATION_FAIL_CLOSED' }, 503) };
  }
}
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

function isAuthorizedP2Path(pathname) {
  return process.env.FINANCE_BACKGROUND_SYNC_ENABLED === '1'
    && (process.env.FINANCE_ONEDRIVE_SYNC_ENABLED === '1' || process.env.FINANCE_ISP_SYNC_ENABLED === '1')
    && (pathname === '/api/admin/finanzas/sync-jobs'
      || (process.env.VERCEL_ENV === 'production' && process.env.FINANCE_STAGING_SANDBOX !== '1'
        && (pathname === '/api/cron/finance-sync-worker' || pathname === '/api/cron/finance-sync-daily')));
}

function financeAreas(pathname) {
  const section = pathname.slice('/api/admin/finanzas/'.length).split('/')[0];
  const aliases = {
    dashboard: ['admin.finanzas'],
    'analitica-costes': ['admin.finanzas.analitica_costes'],
    'costes-operadora': ['admin.finanzas.analitica_costes'],
    'reparto-clientes': ['admin.finanzas.analitica_costes'],
    rentabilidad: ['admin.finanzas.analitica_costes'],
    clientes: pathname.startsWith('/api/admin/finanzas/clientes/ggcc-draxton')
      ? ['admin.finanzas.ggcc_draxton'] : [],
    'cobros-pendientes': ['admin.finanzas.cobros_pendientes'],
    conciliacion: ['admin.finanzas.conciliacion'],
    'conciliacion-v2': ['admin.finanzas.conciliacion'],
    'conciliacion-propuestas': ['admin.finanzas.conciliacion'],
    'modo-facil': ['admin.finanzas.conciliacion'],
    'analitica-cliente': ['admin.finanzas.conciliacion'],
    pendientes: ['admin.finanzas.conciliacion'],
    'centros-coste': ['admin.finanzas.conciliacion'],
    'confirming-draxton': ['admin.finanzas.conciliacion'],
    'conciliacion-remesas': ['admin.finanzas.conciliacion_remesas'],
    remesas: pathname === '/api/admin/finanzas/remesas/b6' ? ['admin.finanzas.conciliacion'] : [],
    cuentas: ['admin.finanzas.movimientos', 'admin.finanzas.conciliacion'],
    'datos-fiscales': ['admin.finanzas.datos_fiscales'],
    'estado-cuentas': ['admin.finanzas.importar'],
    'cortes-cobertura': ['admin.finanzas.importar','admin.finanzas.conciliacion','admin.facturacion'],
    'exportar-a3': ['admin.finanzas.exportar_a3'],
    facturas: ['admin.finanzas.facturas'],
    'facturas-emitidas': ['admin.finanzas.facturas_emitidas'],
    'importar-movimientos': ['admin.finanzas.importar'],
    'sincronizar-onedrive': ['admin.finanzas.facturas'],
    // El handler vuelve a comprobar exactamente el permiso de la fuente elegida.
    'sync-jobs': ['admin.finanzas.facturas', 'admin.facturacion'],
    imputacion: ['admin.finanzas.facturas'],
    movimientos: ['admin.finanzas.movimientos'],
    nominas: ['admin.finanzas.conciliacion'],
    'nominas-propuestas': ['admin.finanzas.conciliacion'],
    tickets: ['admin.finanzas.tickets'],
  };
  return aliases[section] || [];
}

export async function middleware(request) {
  const actingBoundary = await impersonationBoundary(request);
  if (actingBoundary.response) return actingBoundary.response;
  // No early return: the profile and financial middleware below must evaluate
  // every acting request with its effective target JWT.
  const trustedHeaders = actingBoundary.headers;
  if (process.env.FINANCE_STAGING_SANDBOX === '1' && request.nextUrl.pathname.startsWith('/api/')) {
    const path = request.nextUrl.pathname;
    const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    // Se amplía por bloques validados, nunca por toda el área financiera.
    const allowed = path === '/api/admin/finanzas/sincronizar-onedrive'
      // El control valida su propia sesión real, CSRF/origen y entorno; esta
      // excepción no habilita ninguna API de negocio durante actuación.
      || path === '/api/admin/actuar-como'
      || (/^\/api\/admin\/finanzas\/facturas\/calidad\/[^/]{1,100}$/.test(path) && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/importar-movimientos' && request.method === 'POST')
      || (/^\/api\/admin\/finanzas\/movimientos\/[^/]{1,100}$/.test(path) && request.method === 'PATCH')
      || ((path === '/api/admin/finanzas/cortes-cobertura' || path === '/api/admin/finanzas/conciliacion-v2') && request.method === 'POST')
      || (path === '/api/admin/finanzas/pendientes' && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/pendientes/documento' && request.method === 'POST')
      || (path === '/api/admin/finanzas/remesas/b6' && request.method === 'POST')
      || (path === '/api/admin/finanzas/confirming-draxton' && request.method === 'POST')
      || (path === '/api/admin/finanzas/centros-coste' && ['POST','PATCH'].includes(request.method))
      || (path === '/api/admin/finanzas/centros-coste/asignar' && request.method === 'PATCH')
      || (path === '/api/admin/finanzas/exportar-a3' && request.method === 'POST')
      || (path === '/api/admin/finanzas/sync-jobs' && ['POST','PATCH'].includes(request.method) && isAuthorizedP2Path(path))
      || (['/api/admin/finanzas/modo-facil', '/api/admin/finanzas/modo-facil/deshacer', '/api/admin/finanzas/modo-facil/foto', '/api/admin/finanzas/modo-facil/reglas'].includes(path) && request.method === 'POST')
      // Aplicación nativa acotada aprobada el 24/10; el handler exige staging,
      // perfil vivo y política. No es una excepción del motor legacy.
      || (['/api/admin/finanzas/modo-facil/terceros', '/api/admin/finanzas/modo-facil/automaticas', '/api/admin/finanzas/reparto-clientes'].includes(path) && request.method === 'POST')
      || (path === '/api/admin/finanzas/modo-facil/terceros/bloque' && request.method === 'POST')
      || path.startsWith('/api/auth/');
    if (path.startsWith('/api/cron/') || (mutating && !allowed)) {
      return NextResponse.json({ error: 'Sandbox de Finanzas: esta acción está bloqueada en staging; no se envían comunicaciones ni se ejecutan sincronizaciones ajenas a los bloques autorizados.' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
    }
  }
  const path = request.nextUrl.pathname;
  const isMutatingApiMethod = !SAFE_API_METHODS.has(request.method);

  // Perfil mínimo vivo: se comprueba antes de cualquier handler, incluso con
  // un JWT GERENTE anterior o una URL escrita a mano. En producción depende
  // del modelo, no del interruptor de UI, para que un rollback de Modo fácil
  // nunca ensanche el acceso heredado de Lorena.
  const mustCheckEasyOnlyProfile = process.env.FINANCE_STAGING_SANDBOX === '1'
    || (process.env.VERCEL_ENV === 'production' && process.env.FINANCE_MODEL_PRODUCTION_ENABLED === '1');
  if (mustCheckEasyOnlyProfile && (
    path === '/admin' || path.startsWith('/admin/') || path === '/empleado' || path.startsWith('/empleado/')
    || (path.startsWith('/api/') && !isNextAuthOrLoginPath(path))
  )) {
    try {
      const [{ getToken }, { isEasyOnlyFinanceUser }, { easyOnlyRequestAllowed, EASY_ONLY_HOME }] = await Promise.all([
        import('next-auth/jwt'), import('@/lib/finanzas/easy-access-profile'), import('@/lib/finanzas/easy-access-core'),
      ]);
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: configuredSessionCookieName() });
      const userId = Number(token?.id);
      if (token?.userType === 'admin' && Number.isSafeInteger(userId) && userId > 0 && await isEasyOnlyFinanceUser(userId)) {
        // Estado/salida son el único escape para una identidad efectiva mínima.
        if (path !== '/api/admin/actuar-como' && !easyOnlyRequestAllowed(path, request.method, request.nextUrl.searchParams, userId)) {
          if (path.startsWith('/api/')) return blockedBoundary('Este perfil sólo permite Modo fácil y Para pedir.', 'EASY_ONLY_ACCESS');
          return NextResponse.redirect(new URL(EASY_ONLY_HOME, request.url));
        }
      }
    } catch {
      return NextResponse.json({ error: 'No se pudo verificar el perfil de acceso.' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
    }
  }

  // Bloqueo externo independiente: no impide confirmar documentación manual.
  if (process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED === '1' && path.startsWith('/api/') && !isNextAuthOrLoginPath(path)) {
    const externalPath = path.startsWith('/api/cron/')
      || path.toLowerCase().split('/').some(segment => segment.startsWith('sync') || segment.startsWith('sincroniz'))
      || isOutboundMailOrCommunicationPath(path);
    if (externalPath && !isAuthorizedP2Path(path)) return blockedBoundary(
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
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET, cookieName: configuredSessionCookieName() });
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
    return continueRequest(trustedHeaders);
  }

  // Las APIs no financieras conservan su autenticación propia.
  if (request.nextUrl.pathname.startsWith('/api/')) return continueRequest(trustedHeaders);

  // Solo proteger en entorno de preview/staging (no en producción ni desarrollo local)
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isStaging = request.nextUrl.hostname.includes('staging');

  // Si no es staging/preview, permitir acceso sin restricciones
  if (!isPreview && !isStaging) {
    return continueRequest(trustedHeaders);
  }

  // Verificar si ya está autenticado (cookie de sesión)
  const authCookie = request.cookies.get('staging-auth');
  if (authCookie?.value === 'authenticated') {
    return continueRequest(trustedHeaders);
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
      const response = continueRequest(trustedHeaders);
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
