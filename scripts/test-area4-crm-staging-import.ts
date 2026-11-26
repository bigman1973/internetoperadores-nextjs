import assert from 'node:assert/strict'
import { File } from 'node:buffer'
import { readFileSync } from 'node:fs'
import test, { after, beforeEach } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as requestPolicy from '../lib/area4/request-policy'
import * as crmStagingImport from '../lib/area4/crm-staging-import'
import * as auditModule from '../lib/area4/audit'
import * as renderSurface from '../lib/admin-render-surface'
import * as highRiskPolicy from '../lib/high-risk-api-policy'
import * as altaContract from '../lib/altas/contrato-access'
import * as easyCore from '../lib/finanzas/easy-access-core'
import * as m365LegacyPolicy from '../lib/m365-legacy-policy'

// Full REAL middleware source, including sandbox, external and readonly fences.
// Only session/database I/O and the unrelated Conciliar runtime/profile are synthetic.
// No handler is loaded, no XLSX/hash import is performed, and no network/DB is used.
const ISP = '/api/admin/crm/isp/importar'
const HUB = '/api/admin/crm/hubspot/historial'
const FILE_LIMIT = 4 * 1024 * 1024
const MULTIPART_LIMIT = FILE_LIMIT + 64 * 1024
const HASH = 'a'.repeat(64) // Syntax fixture only; the native handler must verify the real file hash.
const STAGE: Record<string, string | undefined> = {
  AREA4_OWNER_USER_ID: '3', FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview',
  VERCEL_GIT_COMMIT_REF: 'staging',
  DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@fixture.invalid/io_staging_finanzas',
  FINANCE_DEPLOYMENT_READ_ONLY: '0', IO_PRODUCTION_READ_ONLY: '0',
  FINANCE_EXTERNAL_ACTIONS_DISABLED: '0', FINANCE_BACKGROUND_SYNC_ENABLED: '0',
  FINANCE_ONEDRIVE_SYNC_ENABLED: '0', FINANCE_ISP_SYNC_ENABLED: '0',
  FINANCE_MODEL_PRODUCTION_ENABLED: '0',
}
const savedEnv = Object.fromEntries(Object.keys(STAGE).map(key => [key, process.env[key]]))
function environment(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...STAGE, ...overrides })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
let principal: any
let token: any
let adopted = true
let auditFailure = false
let markerFailure = false
let easyOnly = false
let checks = 0
let originalBodiesChecked = 0
const entries: any[] = []
const projections: any[] = []
const commands: any[] = []
const database = {
  usuarioAdmin: { findUnique: async ({ where, select }: any) => {
    projections.push(select)
    if (markerFailure && select.permisosArea4Vivos) throw { code: 'P2022', meta: { column: 'usuarios_admin.permisos_area4_vivos' } }
    if (!principal || where.id !== principal.id) return null
    return { ...principal, permisosArea4Vivos: adopted, permisos: [] }
  } },
  $transaction: async (fn: any) => fn({ auditoriaPermisosArea4: { create: async ({ data }: any) => {
    if (auditFailure) throw new Error('SYNTHETIC_AUDIT_FAILURE')
    entries.push(data)
    return data
  } } }),
}
const source = readFileSync('proxy.js', 'utf8') + '\nmodule.exports.area4Boundary = area4RegisteredAdminApiBoundary;'
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const mod: any = { exports: {} }
vm.runInNewContext(code, {
  module: mod, exports: mod.exports, process: { env: process.env },
  console: { error() {}, info() {}, warn() {} }, Headers, URL, URLSearchParams,
  performance, TextDecoder, TextEncoder, Request, Response, FormData, Blob, File,
  ReadableStream, Buffer, Uint8Array, ArrayBuffer, JSON, atob,
  require(name: string) {
    if (name === 'next/server') return { NextRequest, NextResponse }
    if (name === './lib/admin-render-surface') return renderSurface
    if (name === './lib/finanzas/conciliar-runtime') return { conciliarRuntimeConfigured: () => null }
    if (name === './lib/high-risk-api-policy') return highRiskPolicy
    if (name === './lib/altas/contrato-access') return altaContract
    if (name === './lib/m365-legacy-policy') return m365LegacyPolicy
    if (name === 'next-auth/jwt') return { getToken: async () => token }
    if (name === '@/lib/area4/section-registry') return registry
    if (name === '@/lib/area4/policy') return policy
    if (name === '@/lib/area4/crm-staging-import') return crmStagingImport
    if (name === '@/lib/area4/request-policy') return { ...requestPolicy,
      area4RequestCapabilities(input: any) {
        const capabilities = requestPolicy.area4RequestCapabilities(input)
        commands.push({ input, capabilities })
        return capabilities
      },
    }
    if (name === '@/lib/area4/audit') return auditModule
    if (name === '@/lib/prisma') return { default: database }
    if (name === '@/lib/finanzas/easy-access-profile') return { isEasyOnlyFinanceUser: async () => easyOnly }
    if (name === '@/lib/finanzas/easy-access-core') return easyCore
    if (name === '@/lib/impersonation') return { readImpersonationClaims: () => null }
    // Unexpected dependencies (especially import handlers, Prisma and network clients)
    // are never silently stubbed into success.
    throw new Error(`Unexpected module in CRM-only harness: ${name}`)
  },
})
beforeEach(() => {
  environment()
  principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [] }
  token = { id: '3', userType: 'admin', role: 'SUPER_ADMIN' }
  adopted = true; auditFailure = false; markerFailure = false; easyOnly = false
  entries.length = 0; projections.length = 0; commands.length = 0
})
after(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  console.log(JSON.stringify({ checks, originalBodiesChecked,
    evidence: 'REAL_FULL_MIDDLEWARE_SYNTHETIC_SESSION_AND_DB_ACTUAL_REGISTRY_POLICY_REQUEST_POLICY_HELPER_AUDIT',
    handlersExecuted: false, importsExecuted: false, databaseWrites: false, networkRequests: false,
    renderedPages: false, httpAcceptance: false, importSuccessClaimed: false,
    confirmationAudit: 'INTENTO_ANTES_DEL_HANDLER_ONLY' }))
})

type WireBody = { body: Buffer; contentType: string }
type Field = readonly [string, string]
function multipart(fields: readonly Field[] = [], options: { filename?: string; fileBytes?: number; files?: number; omitFile?: boolean } = {}): WireBody {
  const boundary = 'area4-synthetic-crm-boundary'
  const parts: Buffer[] = []
  if (!options.omitFile) {
    for (let i = 0; i < (options.files ?? 1); i++) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fichero"; filename="${options.filename ?? 'synthetic.xlsx'}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`))
      // Not a workbook. Native A1 file/real hash validation is deliberately not invoked.
      parts.push(Buffer.alloc(options.fileBytes ?? 8, 65), Buffer.from('\r\n'))
    }
  }
  for (const [name, value] of fields) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` }
}
function json(body: unknown, raw = false): WireBody {
  return { body: Buffer.from(raw ? String(body) : JSON.stringify(body)), contentType: 'application/json' }
}
function apply(fields: readonly Field[] = []): WireBody {
  return multipart([['modo', 'aplicar'], ['confirmacion', 'APLICAR'], ['hashEsperado', HASH], ...fields])
}
async function invoke(path: string, wire?: WireBody, options: {
  method?: string; headers?: Record<string, string>; boundaryOnly?: boolean
} = {}) {
  const method = options.method ?? 'POST'
  const request = new NextRequest(`https://area4.example.test${path}`, {
    method,
    headers: { origin: 'https://area4.example.test', 'sec-fetch-site': 'same-origin',
      ...(wire ? { 'Content-Type': wire.contentType } : {}), ...options.headers },
    ...(wire ? { body: new Uint8Array(wire.body) } : {}),
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  let response: NextResponse | null
  try {
    response = await Promise.race([
      options.boundaryOnly ? mod.exports.area4Boundary(request) : mod.exports.proxy(request),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`UNCONSUMED_CLONE_TIMEOUT ${method} ${path}`)), 3000) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
  assert.equal(request.bodyUsed, false, 'el middleware no consume el cuerpo original del handler')
  if (wire) {
    assert.deepEqual(Buffer.from(await request.arrayBuffer()), wire.body, 'el cuerpo original sigue íntegro y legible DESPUÉS del middleware')
    originalBodiesChecked++
  }
  checks++
  return response
}
function continues(response: NextResponse | null) {
  assert.ok(response, 'el middleware completo debe devolver NextResponse real')
  assert.equal(response.headers.get('x-middleware-next'), '1', 'solo continuación real; no es éxito HTTP/importación')
}
function denied(response: NextResponse | null, status: number) {
  assert.ok(response)
  assert.equal(response.status, status)
  assert.notEqual(response.headers.get('x-middleware-next'), '1')
}
function attempt(path: string) {
  assert.equal(entries.length, 1, 'solo C genera un recibo de intento; no V, E ni resultado de importación')
  const receipt = entries[0]
  assert.equal(receipt.actorId, 3)
  assert.equal(receipt.objetivoUsuarioId, null, 'el intento CRM no modifica una identidad administrativa')
  assert.equal(receipt.areaCodigo, 'admin.crm')
  assert.equal(receipt.operacion, 'CONFIRMACION_SOLICITADA')
  assert.equal(receipt.origen, path)
  assert.deepEqual(JSON.parse(JSON.stringify(receipt.despues)), {
    fase: 'ANTES_DEL_HANDLER', resultado: 'INTENTO', metodo: 'POST', capacidad: 'confirmar',
  })
  assert.doesNotMatch(JSON.stringify(receipt), /synthetic\.xlsx|hashEsperado|confirmacion|conteos|journalId|EXITO/)
}

test('registro real: dos contratos exactos, pendientes, límites y baseline histórico intacto', () => {
  assert.equal(crmStagingImport.area4CrmStagingImportContract(ISP, 'POST'), 'isp-multipart-v1')
  assert.equal(crmStagingImport.area4CrmStagingImportContract(HUB, 'POST'), 'hubspot-confirm-v1')
  const isp = registry.area4RegisteredSurface(ISP, 'api')!
  const hub = registry.area4RegisteredSurface(HUB, 'api')!
  assert.equal(isp.baseline, false)
  assert.equal(hub.baseline, false)
  assert.deepEqual(registry.AREA4_SECTION_REGISTRY.flatMap(section => section.surfaces)
    .filter(surface => surface.request?.stagingImport).map(surface => surface.path).sort(), [HUB, ISP].sort())
  assert.equal(isp.surface.request?.multipartBodyLimit, MULTIPART_LIMIT)
  assert.equal(isp.surface.request?.readOnlyReview, 'isp-closed-simulation')
  assert.equal(hub.surface.request?.commandBodyLimit, 16 * 1024)
  assert.deepEqual(isp.surface.request?.requiredActions?.POST, ['C'])
  assert.deepEqual(hub.surface.request?.requiredActions?.POST, ['C'])
  assert.equal(registry.AREA4_BASELINE_DESCRIPTORS_SHA256, '46f6730c0eb75836ee9fbf311d6ebb38b1b5e70babedc56591f6d6c97854a92f')
  assert.equal(registry.AREA4_BASELINE_IDENTITIES_SHA256, '1fd44a77bd14022b2e72de292e7081daf5b7590ec2f8c11c6416844afba0470c')
})

test('ISP simular explícito y por defecto: owner intrínseco, únicamente V, sin audit y cuerpo intacto', async () => {
  for (const fields of [[], [['modo', 'simular']], [['modo', 'simular'], ['consultarBrevo', '0']], [['consultarBrevo', '1']]] as readonly (readonly Field[])[]) {
    const wire = multipart(fields)
    continues(await invoke(ISP, wire))
    assert.equal(entries.length, 0)
    const command = commands.filter(item => item.input.path === ISP && item.input.body).at(-1)
    assert.ok(command, 'la política real debe recibir el comando cerrado decodificado')
    assert.deepEqual(JSON.parse(JSON.stringify(command.input.body)), { modo: 'simular' })
    assert.deepEqual([...command.capabilities], ['lectura'])
  }
})

test('ISP aplicar: owner sin grants, V/E/C y audit INTENTO antes del handler, no importación', async () => {
  continues(await invoke(ISP, apply()))
  attempt(ISP)
  assert.deepEqual([...commands.filter(item => item.input.path === ISP && item.input.body).at(-1).capabilities], ['lectura', 'escritura', 'confirmar'])
})

test('HubSpot JSON exacto confirmar:true: V/E/C y audit INTENTO, cuerpo intacto', async () => {
  continues(await invoke(HUB, json({ confirmar: true })))
  attempt(HUB)
  assert.deepEqual([...commands.filter(item => item.input.path === HUB && item.input.body).at(-1).capabilities], ['lectura', 'escritura', 'confirmar'])
})

test('el branch precede ambos escapes legacy: owner no adoptado/esquema ausente sigue validando cuerpo y C', async () => {
  adopted = false; markerFailure = true
  continues(await invoke(ISP, apply()))
  attempt(ISP)
  entries.length = 0
  denied(await invoke(HUB, json({ confirmar: false })), 400)
  assert.equal(entries.length, 0)
  assert.equal(projections.some(select => select.permisosArea4Vivos), false, 'no entrar en compatibilidad legacy de adopción')
})

const badEnvironments: readonly [string, Record<string, string | undefined>][] = [
  ['producción', { VERCEL_ENV: 'production' }], ['VERCEL_ENV ausente', { VERCEL_ENV: undefined }],
  ['development', { VERCEL_ENV: 'development' }], ['otra ref', { VERCEL_GIT_COMMIT_REF: 'area4-usuarios-permisos' }],
  ['ref ausente', { VERCEL_GIT_COMMIT_REF: undefined }], ['sandbox ausente', { FINANCE_STAGING_SANDBOX: undefined }],
  ['sandbox cero', { FINANCE_STAGING_SANDBOX: '0' }], ['sandbox booleano textual', { FINANCE_STAGING_SANDBOX: 'true' }],
  ['sandbox otro valor', { FINANCE_STAGING_SANDBOX: '2' }], ['sandbox espacios', { FINANCE_STAGING_SANDBOX: ' 1' }],
  ['readonly financiero', { FINANCE_DEPLOYMENT_READ_ONLY: '1' }], ['readonly IO', { IO_PRODUCTION_READ_ONLY: '1' }],
  ['DSN ausente', { DATABASE_URL: undefined }], ['DSN malformado', { DATABASE_URL: 'not-a-url' }],
  ['DSN esquema incorrecto', { DATABASE_URL: 'https://io_staging_finanzas@fixture.invalid/io_staging_finanzas' }],
  ['DSN usuario ajeno', { DATABASE_URL: 'postgresql://postgres:synthetic@fixture.invalid/io_staging_finanzas' }],
  ['DSN base ajena', { DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@fixture.invalid/railway' }],
  ['DSN ambos ajenos', { DATABASE_URL: 'postgresql://postgres:synthetic@fixture.invalid/railway' }],
  ['DSN usuario inválido codificado', { DATABASE_URL: 'postgresql://%ZZ:synthetic@fixture.invalid/io_staging_finanzas' }],
  ['DSN base sufijo', { DATABASE_URL: 'postgresql://io_staging_finanzas@fixture.invalid/io_staging_finanzas_backup' }],
]
test('Enabled real y middleware completo deniegan ambos POST en todos los entornos no autorizados', async () => {
  assert.equal(crmStagingImport.area4CrmStagingImportEnabled(STAGE), true)
  for (const [label, overrides] of badEnvironments) {
    assert.equal(crmStagingImport.area4CrmStagingImportEnabled({ ...STAGE, ...overrides }), false, label)
    environment(overrides)
    for (const [path, body] of [[ISP, apply()], [HUB, json({ confirmar: true })]] as const) {
      denied(await invoke(path, body), 403)
      // The extracted registered branch must itself fail closed: the sandbox
      // rejection above cannot hide an owner/legacy escape in the central guard.
      denied(await invoke(path, body, { boundaryOnly: true }), 403)
      assert.equal(entries.length, 0, `${label}: sin intento auditado`)
    }
  }
})

test('identidad viva prevalece: sin sesión/fila, inactivo, SA secundario, otro owner, GERENTE y actuación', async () => {
  const cases: readonly [string, () => void, number][] = [
    ['sin sesión', () => { token = null }, 401],
    ['sesión ajena', () => { token.userType = 'empleado' }, 401],
    ['sin fila viva', () => { principal = null }, 401],
    ['id cero en JWT', () => { token.id = '0' }, 401],
    ['id no numérico en JWT', () => { token.id = 'not-an-id' }, 401],
    ['inactivo', () => { principal.activo = false }, 401],
    ['SA secundario id3', () => { principal.rol = 'VISOR'; principal.roles = ['SUPER_ADMIN'] }, 403],
    ['SA otro id', () => { principal.id = 4; token.id = '4' }, 403],
    ['GERENTE legacy', () => { principal.rol = 'GERENTE'; adopted = false }, 403],
    ['owner actuando', () => { token.impersonation = { actorId: '3', targetId: '3', syntheticOnly: true } }, 403],
    ['claim actuación vacío', () => { token.impersonation = {} }, 403],
  ]
  for (const [label, mutate, expected] of cases) {
    for (const [path, wire] of [[ISP, multipart()], [HUB, json({ confirmar: true })]] as const) {
      principal = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [] }
      token = { id: '3', userType: 'admin', role: 'SUPER_ADMIN' }; adopted = false
      mutate()
      denied(await invoke(path, wire), expected)
      assert.equal(entries.length, 0, `${label}: sin auditoría de una operación autorizada`)
    }
  }
})

test('origen exacto HTTPS requerido: host hermano same-site, cross-site o cabecera ausente no confirma', async () => {
  const noOrigin = new Request(`https://area4.example.test${ISP}`, { method: 'POST' })
  assert.equal(crmStagingImport.area4CrmStagingImportOriginAllowed(noOrigin), false)
  assert.equal(crmStagingImport.area4CrmStagingImportOriginAllowed(new Request(`http://area4.example.test${ISP}`, {
    method: 'POST', headers: { origin: 'http://area4.example.test' },
  })), false)
  const invalidOrigins: readonly Record<string, string>[] = [
    { origin: '' }, { origin: 'null' }, { origin: 'https://other.example.test' },
    { origin: 'https://malicioso.internetoperadores.com', 'sec-fetch-site': 'same-site' },
    { 'sec-fetch-site': 'same-site' }, { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'none' }, { 'sec-fetch-site': '' },
  ]
  for (const headers of invalidOrigins) {
    for (const [path, wire] of [[ISP, apply()], [HUB, json({ confirmar: true })]] as const) {
      const response = await invoke(path, wire, { headers })
      denied(response, 403)
      assert.equal((await response!.json()).codigo, 'ORIGIN_NOT_ALLOWED')
      assert.equal(entries.length, 0)
      assert.equal(commands.length, 0, 'rechazo previo al decoder y la decisión de capacidades')
    }
  }
})

const neighbours = [
  '/api/admin/crm/isp/vinculos', '/api/admin/crm/isp/importar/vecina', '/api/admin/crm/hubspot/historial/vecina',
  '/api/admin/crm/hubspot/vinculos', '/api/admin/crm/contactos/synthetic/actividades',
  '/api/admin/crm/contactos/synthetic/actividades/synthetic/m365',
  '/api/admin/crm/contactos/synthetic/m365/borrador', '/api/admin/crm/m365/vecina',
  `${ISP}/`, `${HUB}/`, ISP.replace('importar', '%69mportar'), HUB.replace('historial', '%68istorial'),
  ISP.replace('/isp/', '/ISP/'), HUB.replace('/hubspot/', '/HubSpot/'),
]
test('vecinos, vínculos, M365 y variantes no canónicas nunca heredan la excepción POST', async () => {
  for (const path of neighbours) {
    assert.equal(crmStagingImport.area4CrmStagingImportContract(path, 'POST'), null, path)
    // Víctor 26/11: el POST de actividades sin cuerpo local válido sigue cerrado,
    // ahora con respuesta informativa 503; ninguna ruta hereda la importación.
    const response = await invoke(path, json({ confirmar: true }))
    denied(response, path === '/api/admin/crm/contactos/synthetic/actividades' ? 503 : 403)
    if (path === '/api/admin/crm/contactos/synthetic/actividades') assert.equal((await response!.json()).code, m365LegacyPolicy.M365_LEGACY_PENDING_CODE)
  }
  assert.equal(entries.length, 0)
})

test('wrong methods: no contrato para GET/HEAD/OPTIONS ni PUT/PATCH/DELETE; escrituras vecinas cerradas', async () => {
  for (const path of [ISP, HUB]) {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE', 'post']) {
      assert.equal(crmStagingImport.area4CrmStagingImportContract(path, method), null, `${method} ${path}`)
    }
    // Safe/native requests are not import-authorized; do not invent handler semantics.
    for (const method of ['PUT', 'PATCH', 'DELETE']) denied(await invoke(path, json({ confirmar: true }), { method }), 403)
  }
  assert.equal(entries.length, 0)
})

test('ISP multipart cerrado: duplicados de cada campo, desconocidos, modo y selectores no aceptados', async () => {
  const invalid: readonly [string, WireBody][] = [
    ['fichero duplicado', multipart([], { files: 2 })],
    ['modo duplicado', multipart([['modo', 'simular'], ['modo', 'aplicar']])],
    ['Brevo duplicado', multipart([['consultarBrevo', '0'], ['consultarBrevo', '1']])],
    ['confirmación duplicada', apply([['confirmacion', 'APLICAR']])],
    ['hash duplicado', apply([['hashEsperado', HASH]])],
    ['campo desconocido', multipart([['actorId', '3']])],
    ['selector action', multipart([['action', 'simular']])],
    ['modo desconocido', multipart([['modo', 'desconocido']])],
    ['confirmación no permitida en simular', multipart([['modo', 'simular'], ['confirmacion', 'APLICAR']])],
    ['hash no permitido en simular', multipart([['modo', 'simular'], ['hashEsperado', HASH]])],
    ['modo vacío', multipart([['modo', '']])],
    ['modo case', multipart([['modo', 'SIMULAR']])],
    ['Brevo true', multipart([['consultarBrevo', 'true']])],
    ['Brevo vacío', multipart([['consultarBrevo', '']])],
    ['sin fichero', multipart([], { omitFile: true })],
    ['extensión ajena', multipart([], { filename: 'synthetic.csv' })],
  ]
  for (const [label, body] of invalid) {
    denied(await invoke(ISP, body), 400)
    assert.equal(entries.length, 0, label)
  }
  denied(await invoke(ISP, json({ modo: 'simular' })), 415)
})

test('ISP aplicar exige confirmación literal y hash SHA256 lowerhex; invalidar no genera audit', async () => {
  const invalidFields: readonly (readonly Field[])[] = [
    [['modo', 'aplicar']],
    [['modo', 'aplicar'], ['confirmacion', 'aplicar'], ['hashEsperado', HASH]],
    [['modo', 'aplicar'], ['confirmacion', 'APLICAR'], ['hashEsperado', HASH.toUpperCase()]],
    [['modo', 'aplicar'], ['confirmacion', 'APLICAR'], ['hashEsperado', 'a'.repeat(63)]],
    [['modo', 'aplicar'], ['confirmacion', 'APLICAR'], ['hashEsperado', 'g'.repeat(64)]],
    [['modo', 'aplicar'], ['hashEsperado', HASH]],
    [['modo', 'aplicar'], ['confirmacion', 'APLICAR']],
    [['modo', 'aplicar'], ['confirmacion', ' APLICAR'], ['hashEsperado', HASH]],
  ]
  for (const fields of invalidFields) denied(await invoke(ISP, multipart(fields)), 400)
  assert.equal(entries.length, 0)
})

test('HubSpot estricto: false, string true, claves extra, JSON inválido y tipo no JSON', async () => {
  for (const body of [{ confirmar: false }, { confirmar: 'true' }, {}, { confirmar: true, actorId: 3 }, { confirmar: true, hashEsperado: HASH }, [true], null, true]) {
    denied(await invoke(HUB, json(body)), 400)
  }
  for (const raw of ['{broken', '{"confirmar":true,"confirmar":false}']) {
    denied(await invoke(HUB, json(raw, true)), 400)
  }
  denied(await invoke(HUB, multipart()), 415)
  assert.equal(entries.length, 0)
})

test('HubSpot JSON exacto no debe aceptar confirmar duplicado cuyo último valor sea true', async () => {
  for (const raw of ['{"confirmar":false,"confirmar":true}', '{"confirmar":true,"confirmar":true}']) {
    const response = await invoke(HUB, json(raw, true))
    assert.notEqual(response?.headers.get('x-middleware-next'), '1', `JSON duplicado no es la confirmación única exigida: ${raw}`)
    denied(response, 400)
  }
  assert.equal(entries.length, 0)
})

test('límites sin Content-Length: 4MiB XLSX permitido, fichero/total multipart/JSON excesivo denegados sin atascar clone', async () => {
  continues(await invoke(ISP, multipart([], { fileBytes: FILE_LIMIT })))
  assert.equal(entries.length, 0)
  denied(await invoke(ISP, multipart([], { fileBytes: FILE_LIMIT + 1 })), 413)
  const excessiveMultipart = multipart([['modo', 'x'.repeat(MULTIPART_LIMIT)]])
  assert.ok(excessiveMultipart.body.length > MULTIPART_LIMIT)
  denied(await invoke(ISP, excessiveMultipart), 413)
  // Valid exact object plus whitespace isolates body size from unknown-field rejection.
  const excessiveJson = json(`${JSON.stringify({ confirmar: true })}${' '.repeat(16 * 1024)}`, true)
  denied(await invoke(HUB, excessiveJson), 400)
  assert.equal(entries.length, 0)
})

test('Content-Length inválido o superior al contrato no evita el límite físico ni consume original', async () => {
  for (const [path, wire, limit] of [[ISP, multipart(), MULTIPART_LIMIT], [HUB, json({ confirmar: true }), 16 * 1024]] as const) {
    for (const length of ['garbage', '-1', String(limit + 1)]) {
      denied(await invoke(path, wire, { headers: { 'Content-Length': length } }), path === ISP && length === String(limit + 1) ? 413 : 400)
    }
  }
  assert.equal(entries.length, 0)
})

test('fallo del audit real deniega 503 solo a C; simular no escribe y puede continuar', async () => {
  auditFailure = true
  denied(await invoke(ISP, apply()), 503)
  denied(await invoke(HUB, json({ confirmar: true })), 503)
  continues(await invoke(ISP, multipart()))
  assert.equal(entries.length, 0)
})

test('flags externos 1 no cierran los dos POST locales ni abren mail, sync o M365', async () => {
  environment({ FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', FINANCE_BACKGROUND_SYNC_ENABLED: '1',
    FINANCE_ONEDRIVE_SYNC_ENABLED: '1', FINANCE_ISP_SYNC_ENABLED: '1' })
  continues(await invoke(ISP, multipart()))
  continues(await invoke(ISP, apply()))
  assert.equal(entries.length, 1)
  continues(await invoke(HUB, json({ confirmar: true })))
  assert.equal(entries.length, 2)
  for (const path of ['/api/admin/crm/enviar-correo', '/api/admin/crm/mail', '/api/admin/crm/sync',
    '/api/admin/crm/sincronizar', '/api/admin/crm/contactos/synthetic/m365/borrador']) {
    for (const method of ['POST', 'PATCH', 'DELETE']) denied(await invoke(path, json({ confirmar: true }), { method }), 403)
  }
  assert.equal(entries.length, 2, 'los vecinos denegados no emiten intentos')
})

test('fences completos externos/readonly preceden al branch registrado, independientemente del sandbox', async () => {
  environment({ FINANCE_STAGING_SANDBOX: '0', FINANCE_EXTERNAL_ACTIONS_DISABLED: '1' })
  for (const path of ['/api/admin/crm/mail', '/api/admin/crm/sync']) {
    const response = await invoke(path, json({ confirmar: true }))
    denied(response, 403)
    assert.equal((await response!.json()).codigo, 'FINANCE_EXTERNAL_ACTIONS_DISABLED')
  }
  environment({ FINANCE_STAGING_SANDBOX: '0', FINANCE_DEPLOYMENT_READ_ONLY: '1' })
  for (const path of [ISP, HUB]) {
    const response = await invoke(path, path === ISP ? apply() : json({ confirmar: true }))
    denied(response, 403)
    assert.equal((await response!.json()).codigo, 'FINANCE_DEPLOYMENT_READ_ONLY')
  }
  assert.equal(projections.length, 0, 'estos fences niegan antes de la lectura de identidad Area4')
  assert.equal(entries.length, 0)
})

test('el perfil mínimo vivo no adquiere la excepción al ser owner en la sesión sintética', async () => {
  easyOnly = true
  for (const [path, wire] of [[ISP, multipart()], [HUB, json({ confirmar: true })]] as const) {
    const response = await invoke(path, wire)
    denied(response, 403)
    assert.equal((await response!.json()).codigo, 'EASY_ONLY_ACCESS')
  }
  assert.equal(entries.length, 0)
})
