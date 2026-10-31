/**
 * Política declarativa para APIs internas de alto riesgo.
 *
 * Se mantiene separada del middleware para poder revisar y probar el mapa sin
 * tocar rutas de negocio. Sólo incluye superficies administrativas o de
 * integración interna: los flujos públicos basados en capacidad (pago, alta o
 * cuestionario) necesitan su propio control de capacidad, no un permiso admin.
 */
const READ_METHODS = new Set(['GET', 'HEAD'])

function access(area, method, legacyRoles = [], forcedAction) {
  if (method === 'OPTIONS') return null
  return Object.freeze({
    area,
    action: forcedAction || (READ_METHODS.has(method) ? 'lectura' : 'escritura'),
    legacyRoles: Object.freeze([...legacyRoles]),
  })
}

const LEGACY = Object.freeze({
  clientes: ['VENTAS'],
  contratos: ['VENTAS'],
  tarifas: ['VENTAS'],
  leads: ['MARKETING', 'VENTAS'],
  facturacion: ['CONTABILIDAD'],
  altas: ['VENTAS'],
})

function draxtonRequirement(pathname, method) {
  const root = '/api/admin/clientes/ggcc/draxton/'
  const relative = pathname.slice(root.length)
  let area = 'admin.clientes.ggcc.draxton'

  if (relative === 'actualizaciones' || relative.startsWith('actualizaciones/')) {
    area = 'admin.clientes.ggcc.draxton.actualizaciones'
  } else if (
    relative === 'buscar-clientes'
    || relative === 'empresas-grupo'
    || relative === 'contratos'
    || relative.startsWith('contratos/')
    || relative === 'contratos-proveedor'
    || relative.startsWith('contratos-proveedor/')
    || relative === 'facturas-contrato'
    || relative === 'facturas-resumen'
  ) {
    area = 'admin.clientes.ggcc.draxton.contratos'
  } else if (relative === 'finanzas' || relative.startsWith('finanzas/')) {
    area = 'admin.clientes.ggcc.draxton.finanzas'
  } else if (relative === 'guardias' || relative.startsWith('guardias/')) {
    area = 'admin.clientes.ggcc.draxton.contrato_guardias'
  } else if (relative === 'informes' || relative.startsWith('informes/')) {
    area = 'admin.clientes.ggcc.draxton.informes'
  } else if (relative === 'kpis' || relative.startsWith('kpis/')) {
    area = 'admin.clientes.ggcc.draxton.kpis'
  } else if (relative === 'organigrama' || relative.startsWith('organigrama/')) {
    area = 'admin.clientes.ggcc.draxton.organigrama'
  } else if (relative === 'personal-contrato') {
    area = 'admin.clientes.ggcc.draxton.personal'
  } else if (
    relative === 'proyectos-contrato'
    || relative.startsWith('proyectos-contrato/')
    || relative === 'proyectos-facturas'
    || relative === 'proyectos-personal'
    || relative === 'proyectos-proveedores'
  ) {
    // La API de proyectos-contrato sirve hoy a dos pantallas. Mientras no se
    // separen sus datos, exige la subárea más restrictiva que la consume.
    area = 'admin.clientes.ggcc.draxton.proyectos_singulares'
  } else if (relative === 'seguimiento' || relative.startsWith('seguimiento/')) {
    area = 'admin.clientes.ggcc.draxton.seguimiento'
  }

  return access(area, method, LEGACY.clientes)
}

/**
 * Devuelve el permiso vivo exigido por una API de alto riesgo o null cuando la
 * ruta no pertenece a este cierre. OPTIONS queda fuera para conservar CORS sin
 * exponer datos ni ejecutar manejadores.
 */
export function highRiskApiRequirement(pathname, method) {
  if (method === 'OPTIONS') return null

  if (pathname === '/api/ispgestion-proxy') {
    return access('admin.clientes', method, LEGACY.clientes, 'escritura')
  }
  if (pathname === '/api/test-ispgestion' || pathname === '/api/test-stripe' || pathname === '/api/test-stripe-fetch') {
    return access('admin.configuracion', method, [], 'escritura')
  }
  if (pathname === '/api/sync-contratos') return access('admin.contratos', method, LEGACY.contratos, 'escritura')
  if (pathname === '/api/sync-facturas') return access('admin.facturacion', method, LEGACY.facturacion, 'escritura')
  if (pathname === '/api/sync-tarifas') return access('admin.tarifas', method, LEGACY.tarifas, 'escritura')

  if (pathname === '/api/admin/facturacion') return access('admin.facturacion', method, LEGACY.facturacion)
  if (/^\/api\/admin\/clientes\/[^/]+\/facturas$/.test(pathname)) return access('admin.clientes', method, LEGACY.clientes)
  if (pathname === '/api/admin/configuracion/estrategias' || /^\/api\/admin\/configuracion\/estrategias\/[^/]+$/.test(pathname)) {
    return access('admin.configuracion.estrategias', method)
  }
  if (pathname === '/api/admin/leads/generar-propuesta/pdf') return access('admin.leads.generales', method, LEGACY.leads, 'escritura')
  if (pathname === '/api/admin/leads/generar-propuesta' || /^\/api\/admin\/leads\/[^/]+\/hubspot-deal$/.test(pathname)) {
    return access('admin.leads.generales', method, LEGACY.leads, 'escritura')
  }
  if (pathname === '/api/contratos') return access('admin.contratos', method, LEGACY.contratos)
  if (pathname === '/api/altas/contrato') return access('admin.altas_pendientes', method, LEGACY.altas)

  if (pathname.startsWith('/api/admin/clientes/ggcc/draxton/')) return draxtonRequirement(pathname, method)
  if (pathname === '/api/admin/clientes/ggcc/exagrid/finanzas' || pathname === '/api/admin/clientes/ggcc/exagrid/finanzas/pdf') {
    return access('admin.clientes.ggcc.exagrid.finanzas', method, LEGACY.clientes)
  }

  return null
}

export const HIGH_RISK_API_MANIFEST = Object.freeze([
  ['/api/ispgestion-proxy', 'POST', 'admin.clientes', 'escritura'],
  ['/api/test-ispgestion', 'GET', 'admin.configuracion', 'escritura'],
  ['/api/test-stripe', 'GET', 'admin.configuracion', 'escritura'],
  ['/api/test-stripe-fetch', 'GET', 'admin.configuracion', 'escritura'],
  ['/api/sync-contratos', 'POST', 'admin.contratos', 'escritura'],
  ['/api/sync-facturas', 'POST', 'admin.facturacion', 'escritura'],
  ['/api/sync-tarifas', 'POST', 'admin.tarifas', 'escritura'],
  ['/api/admin/facturacion', 'GET', 'admin.facturacion', 'lectura'],
  ['/api/admin/clientes/999/facturas', 'GET', 'admin.clientes', 'lectura'],
  ['/api/admin/configuracion/estrategias', 'POST', 'admin.configuracion.estrategias', 'escritura'],
  ['/api/admin/configuracion/estrategias/999', 'PATCH', 'admin.configuracion.estrategias', 'escritura'],
  ['/api/admin/leads/generar-propuesta', 'POST', 'admin.leads.generales', 'escritura'],
  ['/api/admin/leads/generar-propuesta/pdf', 'GET', 'admin.leads.generales', 'escritura'],
  ['/api/admin/leads/999/hubspot-deal', 'POST', 'admin.leads.generales', 'escritura'],
  ['/api/contratos', 'GET', 'admin.contratos', 'lectura'],
  ['/api/altas/contrato', 'GET', 'admin.altas_pendientes', 'lectura'],
  ['/api/admin/clientes/ggcc/draxton/actualizaciones', 'POST', 'admin.clientes.ggcc.draxton.actualizaciones', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/contratos/informe-pdf', 'GET', 'admin.clientes.ggcc.draxton.contratos', 'lectura'],
  ['/api/admin/clientes/ggcc/draxton/finanzas', 'GET', 'admin.clientes.ggcc.draxton.finanzas', 'lectura'],
  ['/api/admin/clientes/ggcc/draxton/guardias/informe', 'GET', 'admin.clientes.ggcc.draxton.contrato_guardias', 'lectura'],
  ['/api/admin/clientes/ggcc/draxton/informes', 'PUT', 'admin.clientes.ggcc.draxton.informes', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/kpis/mensuales', 'POST', 'admin.clientes.ggcc.draxton.kpis', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/organigrama', 'GET', 'admin.clientes.ggcc.draxton.organigrama', 'lectura'],
  ['/api/admin/clientes/ggcc/draxton/personal-contrato', 'POST', 'admin.clientes.ggcc.draxton.personal', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/proyectos-contrato/upload', 'POST', 'admin.clientes.ggcc.draxton.proyectos_singulares', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/proyectos-facturas', 'GET', 'admin.clientes.ggcc.draxton.proyectos_singulares', 'lectura'],
  ['/api/admin/clientes/ggcc/draxton/proyectos-personal', 'DELETE', 'admin.clientes.ggcc.draxton.proyectos_singulares', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/proyectos-proveedores', 'PUT', 'admin.clientes.ggcc.draxton.proyectos_singulares', 'escritura'],
  ['/api/admin/clientes/ggcc/draxton/seguimiento/balance-mensual', 'GET', 'admin.clientes.ggcc.draxton.seguimiento', 'lectura'],
  ['/api/admin/clientes/ggcc/exagrid/finanzas', 'POST', 'admin.clientes.ggcc.exagrid.finanzas', 'escritura'],
  ['/api/admin/clientes/ggcc/exagrid/finanzas/pdf', 'GET', 'admin.clientes.ggcc.exagrid.finanzas', 'lectura'],
])
