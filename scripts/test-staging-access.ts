import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { NextResponse } from 'next/server'
import * as access from '../lib/staging-access'

const source = fs.readFileSync('middleware.js', 'utf8')
  .replace("import { NextResponse } from 'next/server';", '')
  .replace(/  const \{ STAGING_ACCESS_PATH, STAGING_ACCESS_HEADERS, stagingAccessHtml, safeStagingReturn, readStagingAccessForm \} = await import\('\.\/lib\/staging-access'\);/, '')
  .replace(/const validUser = [^;]+;/, "const validUser = 'synthetic-reviewer';")
  .replace(/const validPassword = [^;]+;/, "const validPassword = 'synthetic-password';")
  .replace('export async function middleware', 'async function middleware')
  .replace('export const config', 'const config') + '\nthis.run = middleware;'
let checks = 0
function check(condition: unknown) { assert.ok(condition); checks++ }
async function run(path: string, options: { method?: string; headers?: Record<string, string>; body?: string; cookie?: boolean; production?: boolean; env?: Record<string, string> } = {}) {
  const origin = options.production ? 'https://www.internetoperadores.com' : 'https://staging.internetoperadores.com'
  const request = new Request(origin + path, { method: options.method || 'GET', headers: options.headers, body: options.body }) as any
  request.nextUrl = new URL(request.url)
  request.cookies = { getAll: () => options.cookie ? [{ name: 'staging-auth', value: 'authenticated' }] : [], get: (key: string) => key === 'staging-auth' && options.cookie ? { value: 'authenticated' } : undefined }
  const context: any = { process: { env: { VERCEL_ENV: options.production ? 'production' : 'preview', ...(options.env || {}) } }, Set, Map, Buffer, Headers, URL, NextResponse, atob, console, ...access }
  vm.createContext(context)
  vm.runInContext(source, context)
  return context.run(request) as Promise<NextResponse>
}
async function main() {
  for (const path of ['/', '/tarifas/empresa', '/admin']) {
    const denied = await run(path)
    check(denied.status === 307)
    check(new URL(denied.headers.get('location')!).pathname === access.STAGING_ACCESS_PATH)
    check(!denied.headers.has('www-authenticate'))
    const allowed = await run(path, { cookie: true })
    check(allowed.headers.get('x-middleware-next') === '1')
    const production = await run(path, { production: true })
    check(production.headers.get('x-middleware-next') === '1')
  }
  const page = await run('/acceso-staging?next=%2Ftarifas%2Fempresa')
  check(page.status === 200)
  check(!page.headers.has('www-authenticate'))
  const html = await page.text()
  check(html.includes('Acceso al entorno de pruebas'))
  check(html.includes('method="post"'))
  check(!html.includes('synthetic-password'))
  check(page.headers.get('cache-control') === 'private, no-store')
  check(page.headers.get('referrer-policy') === 'same-origin')
  check(page.headers.get('content-security-policy')!.includes("frame-ancestors 'none'"))
  const body = new URLSearchParams({ username: 'synthetic-reviewer', password: 'synthetic-password', next: '/admin' }).toString()
  const headers = { origin: 'https://staging.internetoperadores.com', 'content-type': 'application/x-www-form-urlencoded' }
  const valid = await run('/acceso-staging', { method: 'POST', headers, body })
  check(valid.status === 303)
  check(valid.headers.get('location') === 'https://staging.internetoperadores.com/admin')
  check(valid.cookies.get('staging-auth')?.value === 'authenticated')
  const cookieHeader = valid.headers.get('set-cookie')!
  check(['HttpOnly', 'Secure', 'SameSite=strict', 'Path=/'].every(value => cookieHeader.includes(value)))
  check(!cookieHeader.includes('next-auth'))
  const invalid = await run('/acceso-staging', { method: 'POST', headers, body: body.replace('synthetic-password', 'incorrect') })
  check(invalid.status === 200)
  check(!invalid.cookies.get('staging-auth'))
  check((await invalid.text()).includes('No se ha podido validar'))
  const csrf = await run('/acceso-staging', { method: 'POST', headers: { ...headers, origin: 'https://other.invalid' }, body })
  check(csrf.status === 403)
  check(!csrf.cookies.get('staging-auth'))
  const large = await run('/acceso-staging', { method: 'POST', headers, body: body + '&large=' + 'x'.repeat(3000) })
  check(large.status === 403)
  const malformed = await run('/', { headers: { authorization: 'Basic ?bad%' } })
  check(malformed.status === 307)
  const basic = await run('/', { headers: { authorization: 'Basic ' + Buffer.from('synthetic-reviewer:synthetic-password').toString('base64') } })
  check(basic.headers.get('x-middleware-next') === '1')
  check(basic.cookies.get('staging-auth')?.value === 'authenticated')
  for (const scheme of ['basic', 'BASIC']) {
    const compatible = await run('/', { headers: { authorization: scheme + ' ' + Buffer.from('synthetic-reviewer:synthetic-password').toString('base64') } })
    check(compatible.headers.get('x-middleware-next') === '1')
  }
  for (const unsafe of ['https://other.invalid', '//other.invalid', '/\\other.invalid', '/%5Cother.invalid', '/%2Fother.invalid', '/api/cron/finance-sync-daily', '/acceso-staging', '/%0aevil']) check(access.safeStagingReturn(unsafe) === '/')
  check(access.safeStagingReturn('/tarifas/empresa?busqueda=fibra') === '/tarifas/empresa?busqueda=fibra')
  check(!access.stagingAccessHtml('/?x="<script>').includes('<script>'))
  const cronPreview = await run('/api/cron/asistente-informe', { env: { FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', ASSISTANT_CRON_ENABLED: 'true', ASSISTANT_MODE: 'extractivo', NODE_ENV: 'production' } })
  check(cronPreview.status === 403)
  const cronStaging = await run('/api/cron/asistente-informe', { production: true, env: { FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', ASSISTANT_CRON_ENABLED: 'true', ASSISTANT_MODE: 'extractivo', NODE_ENV: 'production', FINANCE_STAGING_SANDBOX: '1' } })
  check(cronStaging.status === 403)
  const cronReadOnly = await run('/api/cron/asistente-informe', { production: true, env: { FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', ASSISTANT_CRON_ENABLED: 'true', ASSISTANT_MODE: 'extractivo', NODE_ENV: 'production', FINANCE_DEPLOYMENT_READ_ONLY: '1' } })
  check(cronReadOnly.status === 403)
  const cronWrongMethod = await run('/api/cron/asistente-informe', { method: 'POST', production: true, env: { FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', ASSISTANT_CRON_ENABLED: 'true', ASSISTANT_MODE: 'extractivo', NODE_ENV: 'production' } })
  check(cronWrongMethod.status === 403)
  const cronProduction = await run('/api/cron/asistente-informe', { production: true, env: { FINANCE_EXTERNAL_ACTIONS_DISABLED: '1', ASSISTANT_CRON_ENABLED: 'true', ASSISTANT_MODE: 'extractivo', NODE_ENV: 'production' } })
  check(cronProduction.headers.get('x-middleware-next') === '1') // El handler aún exige horario y Bearer CRON_SECRET.
  console.log(`STAGING_ACCESS_TEST_OK: ${checks} comprobaciones sintéticas, sin red ni BD`)
}
main().catch(error => { console.error(error.name, error.message, `comprobaciones previas: ${checks}`); process.exitCode = 1 })
