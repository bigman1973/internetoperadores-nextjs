import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { NextRequest, NextResponse } from 'next/server'
import * as registry from '../lib/area4/section-registry'
import * as policy from '../lib/area4/policy'
import * as requests from '../lib/area4/request-policy'
import * as documents from '../lib/area4/documentos-boundary'
import * as render from '../lib/admin-render-surface'
import * as risk from '../lib/high-risk-api-policy'
import * as alta from '../lib/altas/contrato-access'
import * as easy from '../lib/finanzas/easy-access-core'
import * as m365 from '../lib/m365-legacy-policy'
import * as actingPolicy from '../lib/impersonation-policy'
const env: Record<string, string | undefined> = { AREA4_OWNER_USER_ID: '3', VERCEL_ENV: 'production', DATABASE_URL: 'postgresql://postgres@yamanote.proxy.rlwy.net:34880/railway', FINANCE_MODEL_PRODUCTION_ENABLED: '1', FINANCE_EASY_PRODUCTION_ENABLED: '1', FINANCE_AUTOMATIC_LINKS_DISABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_ENABLED: '1', FINANCE_DOCUMENTOS_PRODUCTION_DRIVE_ID: 'drive-fixture', FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID: 'folder-fixture', FINANCE_EXTERNAL_ACTIONS_DISABLED: '1' }
const originalOwner = process.env.AREA4_OWNER_USER_ID
process.env.AREA4_OWNER_USER_ID = '3'
let token: any = { id: '3', userType: 'admin', role: 'SUPER_ADMIN' }, principal: any = { id: 3, activo: true, rol: 'SUPER_ADMIN', roles: [], permisosArea4Vivos: false, permisos: [] }
let liveReads = 0, nativeAcl = 0, network = 0, easyOnly = true, count = 0
const db: any = { usuarioAdmin: { findUnique: async () => { liveReads++; return principal } }, permisoArea: { findMany: async () => [] }, $transaction: async (fn: any) => fn(db), auditoriaPermisosArea4: { create: async ({ data }: any) => data } }
const modules: any = {
  'next/server': { NextRequest, NextResponse }, 'next-auth/jwt': { getToken: async () => token },
  'next-auth': { getServerSession: async () => token ? { user: token, ...(token.impersonation !== undefined ? { impersonation: token.impersonation } : {}) } : null },
  '@/lib/auth': { authOptions: {} }, '@/lib/prisma': { default: db },
  '@/lib/area4/section-registry': registry, './section-registry': registry,
  '@/lib/area4/policy': policy, './policy': policy,
  '@/lib/area4/request-policy': { ...requests, area4RequestCapabilities(input: any) { nativeAcl++; return requests.area4RequestCapabilities(input) } },
  '@/lib/area4/documentos-boundary': documents,
  './lib/admin-render-surface': render, './lib/high-risk-api-policy': risk, './lib/altas/contrato-access': alta, './lib/m365-legacy-policy': m365,
  './lib/finanzas/conciliar-runtime': { conciliarRuntimeConfigured: () => null },
  '@/lib/finanzas/easy-access-profile': { isEasyOnlyFinanceUser: async () => easyOnly }, '@/lib/finanzas/easy-access-core': easy,
  '@/lib/impersonation': { readImpersonationClaims: () => null, nextAuthSessionCookieName: () => '__Secure-next-auth.session-token' },
  '@/lib/impersonation-policy': actingPolicy, '@/lib/impersonation-context': {}, '@/lib/area4/surface-access': { readArea4SurfaceAccessUser: async () => null },
  '@/lib/area1-puertas-produccion': { importacionesCrmCerradas: () => true },
}
function load(file: string) {
  const module: any = { exports: {} }
  const source = readFileSync(file, 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, require(name: string) { assert.ok(name in modules, `Import no declarado: ${name}`); return modules[name] },
    process: { env }, console: { error() {}, warn() {} }, Headers, URL, URLSearchParams, performance, TextEncoder, TextDecoder, Request, Response, FormData, Blob, ReadableStream, Buffer, Uint8Array, ArrayBuffer, JSON, atob, Date, Set, Map,
    fetch() { network++; throw Error('NO_NETWORK') },
  }, { filename: file })
  return module.exports
}
modules['@/lib/area4/live-admin'] = load('lib/area4/live-admin.ts')
modules['@/lib/area4/audit'] = load('lib/area4/audit.ts')
const entry = load('proxy.js').proxy
const URL_BASE = 'https://fixture.example.invalid', ROOT = '/api/admin/finanzas/documentos'
async function check(name: string, path: string, method: string, status: number, override: any = {}) {
  const request = new NextRequest(URL_BASE + path, { method, headers: { origin: URL_BASE, 'sec-fetch-site': 'same-origin', ...override } })
  const result = await entry(request)
  if (result.status !== status) console.error(name, await result.clone().text())
  assert.equal(result.status, status, name); assert.equal(result.headers.get('x-middleware-next'), status === 200 ? '1' : null, name)
  count++; console.log('OK', name)
}
async function main() {
  for (const path of [ROOT, ROOT+'/revision-fixture', ROOT+'/comparacion']) await check('easyOnly V pasa routing y ACL viva '+path, path, 'GET', 200)
  for (const path of [ROOT, ROOT+'/revision-fixture']) await check('E pasa routing y ACL viva '+path, path, 'POST', 200)
  assert.ok(liveReads > 0 && nativeAcl > 0, 'la excepción no evita la frontera nativa')
  for (const flag of ['IO_PRODUCTION_READ_ONLY', 'FINANCE_DEPLOYMENT_READ_ONLY']) { env[flag]='1'; await check('readonly V '+flag, ROOT, 'GET', 200); await check('readonly write '+flag, ROOT, 'POST', 404); delete env[flag] }
  await check('POST comparación cerrado',ROOT+'/comparacion','POST',404)
  await check('vecino nested cerrado',ROOT+'/revision/extra','GET',404)
  await check('sin Origin propio',ROOT,'POST',403,{ origin: 'https://outside.invalid' })
  await check('same-site insuficiente',ROOT,'POST',403,{ 'sec-fetch-site':'same-site' })
  await check('acting header cerrado',ROOT,'GET',403,{ 'x-io-acting-session':'' })
  await check('next-action cerrado',ROOT,'GET',403,{ 'next-action':'fixture' })
  env.FINANCE_DOCUMENTOS_PRODUCTION_ENABLED='0'; await check('flag apagado V cerrado',ROOT,'GET',404); env.FINANCE_DOCUMENTOS_PRODUCTION_ENABLED='1'
  env.FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID='root'; await check('root prohibido',ROOT,'GET',404); env.FINANCE_DOCUMENTOS_PRODUCTION_FOLDER_ITEM_ID='folder-fixture'
  token=null; await check('sin sesión',ROOT,'GET',401); token={ id:'3', userType:'admin', role:'SUPER_ADMIN' }
  principal=null; await check('JWT no sustituye cuenta viva',ROOT,'GET',401); principal={ id:3, activo:true, rol:'SUPER_ADMIN', roles:[], permisos:[] }
  principal={ id:7, activo:true, rol:'VISOR', roles:[], permisos:[], permisosArea4Vivos:false }; token={ id:'7',userType:'admin',role:'SUPER_ADMIN' }
  await check('sin consentimiento NEW aun JWT Superadmin',ROOT,'GET',403)
  principal={ id:3, activo:true, rol:'SUPER_ADMIN', roles:[], permisos:[] };token={ id:'3',userType:'admin',role:'SUPER_ADMIN' }
  await check('excepción no abre vecinos financieros','/api/admin/finanzas/facturas','GET',403)
  assert.equal(network,0);console.log(`${count}/${count} PASS · proxy real, ACL real, datos sintéticos y cero Graph/BD/HTTP`)
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(() => { if (originalOwner === undefined) delete process.env.AREA4_OWNER_USER_ID; else process.env.AREA4_OWNER_USER_ID = originalOwner })
