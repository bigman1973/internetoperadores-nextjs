import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import { HIGH_RISK_API_MANIFEST, highRiskApiRequirement } from '../lib/high-risk-api-policy'
import { hasAltaContractCapability } from '../lib/altas/contrato-access'

type Token = { id: string; userType: 'admin'; role?: string } | null

const policy = {
  highRiskApiRequirement,
}

let token: Token = null
let active = true
let role = 'VISOR'
let granularPermissions = 1
let grantedArea: string | null = null
let grantedAction: 'lectura' | 'escritura' | null = null
let altaContractToken = 'contract-capability-1234567890'

const source = readFileSync('middleware.js', 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const module = { exports: {} as Record<string, unknown> }

vm.runInNewContext(code, {
  module,
  exports: module.exports,
  process: { env: {} },
  console,
  performance,
  Headers,
  URL,
  require: (name: string) => {
    if (name === 'next/server') return { NextResponse }
    if (name === './lib/admin-render-surface') return { ADMIN_RENDER_SURFACE_HEADER: 'x-test-render-surface', adminRenderSurface: () => 'test' }
    if (name === './lib/finanzas/conciliar-runtime') return { conciliarRuntimeConfigured: () => null }
    if (name === './lib/high-risk-api-policy') return policy
    if (name === './lib/altas/contrato-access') return { hasAltaContractCapability }
    if (name === 'next-auth/jwt') return { getToken: async () => token }
    if (name === '@/lib/prisma') {
      return {
        default: {
          usuarioAdmin: {
            findUnique: async () => token ? { id: Number(token.id), activo: active, rol: role, roles: [] } : null,
          },
          altaServicio: {
            findUnique: async ({ where }: { where: { id: string } }) => where.id === 'alta-publica' ? { token: altaContractToken } : null,
          },
          permisoUsuario: { count: async () => granularPermissions },
        },
      }
    }
    if (name === '@/lib/permisos') {
      return {
        verificarPermisoServer: async (_id: number, area: string) => ({
          lectura: grantedArea === area && (grantedAction === 'lectura' || grantedAction === 'escritura'),
          escritura: grantedArea === area && grantedAction === 'escritura',
        }),
      }
    }
    throw new Error(`Módulo inesperado: ${name}`)
  },
})

const middleware = module.exports.middleware as (request: NextRequest) => Promise<Response>

async function status(path: string, method = 'GET'): Promise<number> {
  return (await middleware(new NextRequest(`https://panel.example.test${path}`, { method }))).status
}

function routeFiles(root: string): string[] {
  return readdirSync(root).flatMap(entry => {
    const file = join(root, entry)
    return statSync(file).isDirectory() ? routeFiles(file) : (entry === 'route.ts' ? [file] : [])
  })
}

function assertHighRiskTreeCoverage(root: string): number {
  let checks = 0
  for (const file of routeFiles(root)) {
    const route = `/api/${relative('app/api', file).split(sep).slice(0, -1).join('/')}`
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
      const method = match[1]
      assert.ok(highRiskApiRequirement(route, method), `${method} ${route} debe estar en la guardia central`)
      checks += 1
    }
  }
  return checks
}

async function run(): Promise<void> {
  // El manifiesto mantiene visible cada familia de la auditoría y prueba su área/acción.
  for (const [path, method, area, action] of HIGH_RISK_API_MANIFEST) {
    const requirement = highRiskApiRequirement(path, method)
    assert.deepEqual(requirement && { area: requirement.area, action: requirement.action }, { area, action }, `${method} ${path}`)
  }
  assert.equal(highRiskApiRequirement('/api/admin/facturacion', 'OPTIONS'), null, 'OPTIONS no ejecuta el handler ni expone datos')
  assert.equal(highRiskApiRequirement('/api/asistente/config', 'GET'), null, 'Las APIs públicas ajenas al manifiesto no se capturan')
  const draxtonChecks = assertHighRiskTreeCoverage('app/api/admin/clientes/ggcc/draxton')
  const exagridChecks = assertHighRiskTreeCoverage('app/api/admin/clientes/ggcc/exagrid')
  assert.ok(draxtonChecks > 30 && exagridChecks >= 3, 'La cobertura incluye todos los manejadores de GGCC auditados')

  token = null
  active = true
  granularPermissions = 1
  grantedArea = null
  grantedAction = null
  assert.equal(await status('/api/admin/facturacion'), 401, 'Sin sesión administrativa no se alcanza facturación')
  assert.equal(await status('/api/admin/facturacion-banco'), 401, 'Sin sesión administrativa no se alcanza Facturación bancaria')
  assert.equal(await status('/api/admin/facturacion/resumen'), 401, 'Sin sesión administrativa no se alcanza el resumen de Facturación')
  assert.equal(await status('/api/admin/clientes/ggcc/draxton/contratos'), 401, 'Sin sesión administrativa no se alcanza Draxton')
  assert.equal(await status(`/api/altas/contrato?altaId=alta-publica&token=${altaContractToken}`), 200, 'El contrato público exige y acepta sólo la capacidad de su propia alta')
  assert.equal(await status('/api/altas/contrato?altaId=alta-publica&token=capacidad-invalida'), 401, 'Un token de contrato inválido no sustituye la sesión administrativa')

  token = { id: '202', userType: 'admin', role: 'VISOR' }
  assert.equal(await status('/api/admin/facturacion'), 403, 'Un administrador sin permiso de lectura queda bloqueado')
  assert.equal(await status('/api/admin/leads/generar-propuesta/pdf'), 403, 'Un GET con posible efecto exige escritura')

  grantedArea = 'admin.facturacion'
  grantedAction = 'lectura'
  assert.equal(await status('/api/admin/facturacion'), 200, 'El permiso persistido de lectura permite la consulta')
  assert.equal(await status('/api/admin/facturacion-banco'), 200, 'El permiso de Facturación permite el espacio bancario')
  assert.equal(await status('/api/admin/facturacion/resumen'), 200, 'El permiso de Facturación permite el resumen histórico')
  assert.equal(await status('/api/sync-facturas', 'POST'), 403, 'Lectura no habilita una sincronización')

  grantedArea = 'admin.altas_pendientes'
  assert.equal(await status('/api/altas/contrato?altaId=alta-publica'), 200, 'El personal autorizado puede abrir el contrato sin exponer el token')

  active = false
  assert.equal(await status('/api/admin/facturacion'), 401, 'La baja revoca el acceso aunque el JWT siga presente')
  active = true

  // Una sesión efectiva de actuación usa el id del destino. El actor privilegiado
  // nunca se consulta ni se toma como autorización de la petición.
  token = { id: '303', userType: 'admin', role: 'SUPER_ADMIN' }
  role = 'VISOR'
  granularPermissions = 1
  grantedArea = null
  grantedAction = null
  assert.equal(await status('/api/admin/clientes/ggcc/draxton/finanzas'), 403, 'Actuar como respeta el permiso del destino efectivo')
  grantedArea = 'admin.clientes.ggcc.draxton.finanzas'
  grantedAction = 'lectura'
  assert.equal(await status('/api/admin/clientes/ggcc/draxton/finanzas'), 200, 'Actuar como permite sólo el área concedida al destino')

  assert.equal(await status('/api/admin/facturacion', 'OPTIONS'), 200, 'El preflight no recibe datos ni llega al manejador')
  assert.equal(await status('/api/asistente/config'), 200, 'Una ruta fuera del manifiesto conserva su política propia')
  console.log(JSON.stringify({ passed: true, manifestRoutes: HIGH_RISK_API_MANIFEST.length, draxtonChecks, exagridChecks, anonymous: true, deniedRole: true, activeRevocation: true, impersonationEffectiveIdentity: true }))
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
