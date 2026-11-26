import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { impersonationRequestAllowed, isSensitiveImpersonationPath } from '../lib/impersonation-policy'
import { appendArea4Audit } from '../lib/area4/audit'
import * as crmStagingImport from '../lib/area4/crm-staging-import'
import * as m365LegacyPolicy from '../lib/m365-legacy-policy'
import { NextRequest } from 'next/server'

// Runs the exact sandbox block copied from current middleware source in a VM.
// This is not an HTTP acceptance test, and it never executes any handler.
const source = readFileSync('proxy.js', 'utf8')
const start = source.indexOf("  if (process.env.FINANCE_STAGING_SANDBOX === '1' && request.nextUrl.pathname.startsWith('/api/')) {")
const end = source.indexOf('\n  const path = request.nextUrl.pathname;', start)
assert.ok(start >= 0 && end > start, 'la guarda real debe existir; no sustituirla por una simulación del resultado')
const block = source.slice(start, end)
const parserStart = source.indexOf('async function area4JsonCommand(')
const parserEnd = source.indexOf('\n}', parserStart) + 2
assert.ok(parserStart >= 0 && parserEnd > parserStart)
const parser = source.slice(parserStart, parserEnd)
const code = ts.transpileModule(`${parser}\n(async function(request) { ${block}\n return null; })(request)`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
async function gate(sandbox: string | undefined, path: string, method: string): Promise<{ status: number } | null> {
  return await runInNewContext(code, {
    process: { env: { FINANCE_STAGING_SANDBOX: sandbox, VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging',
      DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@fixture.invalid/io_staging_finanzas' } },
    request: new NextRequest('https://fixture.example.test' + path, { method }),
    ...m365LegacyPolicy,
    TextDecoder,
    NextResponse: { json: (_body: unknown, options: { status: number }) => ({ status: options.status }) },
    isAuthorizedP2Path: () => false,
    require(name: string) {
      if (name === '@/lib/area4/crm-staging-import') return crmStagingImport
      throw new Error(`Unexpected sandbox module: ${name}`)
    },
  })
}
const activity = '/api/admin/crm/contactos/synthetic-contact/actividades'
const event = `${activity}/synthetic-activity/m365`
const draft = '/api/admin/crm/contactos/synthetic-contact/m365/borrador'

test('CRM cerrado: sin cuerpo local válido ambos POST y mutaciones vecinas siguen denegados', async () => {
  for (const path of [activity, event, draft, `${event}/vecina`, `${activity}/synthetic-activity/outlook`]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await gate('1', path, method))?.status, path === activity && method === 'POST' ? 503 : 403, `${method} ${path}`)
  }
})
test('el hold no inventa permisos GET/HEAD/OPTIONS ni extiende la excepción al perfil de producción', async () => {
  for (const path of [activity, event, draft]) {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(await gate('1', path, method), null)
    assert.equal(await gate(undefined, path, 'POST'), null, 'ausencia del gate no significa autorización del handler')
  }
  assert.equal(await gate('1', '/api/admin/usuarios/propuestas', 'POST'), null, 'se conserva la API propia validada')
})
test('segmento m365 es sensible durante actuación: ambas rutas reales y cualquier vecina quedan denegadas', () => {
  for (const path of [event, draft, '/api/admin/crm/m365/vecina']) {
    assert.equal(isSensitiveImpersonationPath(path), true)
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(impersonationRequestAllowed(path, method), false)
  }
  assert.equal(isSensitiveImpersonationPath('/api/admin/crm/contactos/synthetic-contact/datos'), false, 'no se bloquea todo CRM por presentar M365')
})

test('helper real acepta las dos operaciones de importación y preserva únicamente el recibo minimizado proporcionado', async () => {
  const entries: any[] = []
  const tx = { auditoriaPermisosArea4: { create: async ({ data }: any) => { entries.push(data); return data } } } as unknown as Parameters<typeof appendArea4Audit>[0]
  for (const [operacion, origen] of [['CRM_IMPORTACION_ISP', 'crm.isp.aplicar'], ['CRM_IMPORTACION_HUBSPOT', 'crm.hubspot.historial']] as const) {
    const despues = { resultado: 'EXITO', journalId: 'synthetic-journal', conteos: { actividades: { creados: 1, actualizados: 0, omitidos: 0, errores: 0 } }, duracionMs: 1 }
    await appendArea4Audit(tx, { actorId: 901, objetivoUsuarioId: null, operacion, areaCodigo: 'admin.crm', origen, antes: null, despues })
    assert.equal(entries.at(-1).operacion, operacion)
    assert.equal(entries.at(-1).actorId, 901)
    assert.equal(entries.at(-1).objetivoUsuarioId, null)
    assert.deepEqual(entries.at(-1).despues, despues)
    assert.doesNotMatch(JSON.stringify(entries.at(-1)), /email|CIF|fichero_nombre|payload|password/)
  }
  assert.equal(entries.length, 2)
})
test('fallo del INSERT auditado no se silencia: el caller puede revertir su propia transacción', async () => {
  const failure = new Error('synthetic-audit-insert-failure')
  const tx = { auditoriaPermisosArea4: { create: async () => { throw failure } } } as unknown as Parameters<typeof appendArea4Audit>[0]
  await assert.rejects(appendArea4Audit(tx, { actorId: 901, operacion: 'CRM_IMPORTACION_ISP', areaCodigo: 'admin.crm', origen: 'crm.isp.aplicar', antes: null, despues: { resultado: 'ERROR', journalId: 'synthetic-journal', conteos: {}, duracionMs: 1 } }), failure)
})
