import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { NextResponse } from 'next/server'
import * as puertas from '../lib/area1-puertas-produccion'

const PAGE = 'app/admin/crm/empresas/[id]/page.tsx'
const API = 'app/api/admin/crm/empresas/[id]/resumen-ia/route.ts'
let checks = 0
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++ }
const equal = (actual: unknown, expected: unknown, message: string) => { assert.deepEqual(actual, expected, message); checks++ }
const prod = { VERCEL_ENV: 'production', AREA1_FICHA_NUEVA_PRODUCCION: '1' }
for (const role of ['SUPER_ADMIN', 'GERENTE']) {
  equal(puertas.fichaNuevaDisponibleParaRol(role, [], prod), true, `${role} con puerta habilitada`)
  equal(puertas.fichaNuevaDisponibleParaRol(role, [], { VERCEL_ENV: 'production' }), false, `${role} no abre una puerta apagada`)
}
for (const role of ['CONTABILIDAD', 'VENTAS', 'MARKETING', 'DRAxton', 'VISOR', 'EMPLEADO', 'SUPERADMIN', 'gerente', undefined, null]) {
  equal(puertas.fichaNuevaDisponibleParaRol(role, [], prod), false, `rol no habilitado: ${role}`)
}
equal(puertas.fichaNuevaDisponibleParaRol('VENTAS', ['GERENTE'], prod), true, 'rol Gerente secundario vivo')
equal(puertas.fichaNuevaDisponibleParaRol('GERENTE', [], { ...prod, AREA1_FICHA_NUEVA_PRODUCCION: 'true' }), false, 'valor no habilitante')
equal(puertas.fichaNuevaDisponibleParaRol('VENTAS', [], { VERCEL_ENV: 'preview' }), true, 'staging conserva la ficha existente')
equal(puertas.importacionesCrmCerradas(prod), true, 'abrir ficha no abre importaciones')

function load(file: string, modules: Record<string, unknown>) {
  const source = fs.readFileSync(file, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  const box: { exports: Record<string, any> } = { exports: {} }
  const sandbox = { module: box, exports: box.exports, process, console, URL, Request, Response,
    require: (name: string) => {
      if (name in modules) return modules[name]
      if (name.endsWith('.css')) return {}
      if (name === 'react/jsx-runtime') return require(name)
      throw new Error(`UNEXPECTED_IMPORT:${name}`)
    },
    fetch: () => { throw new Error('NETWORK_FORBIDDEN') },
  }
  vm.runInNewContext(code, sandbox, { filename: file, timeout: 3000 })
  return box.exports
}
async function scenario(role: string, opts: { roles?: string[]; active?: boolean; flag?: string; acting?: boolean; edit?: string; env?: string } = {}) {
  const previous = { env: process.env.VERCEL_ENV, flag: process.env.AREA1_FICHA_NUEVA_PRODUCCION }
  process.env.VERCEL_ENV = opts.env || 'production'
  if (opts.flag === undefined) process.env.AREA1_FICHA_NUEVA_PRODUCCION = '1'
  else if (opts.flag === '') delete process.env.AREA1_FICHA_NUEVA_PRODUCCION
  else process.env.AREA1_FICHA_NUEVA_PRODUCCION = opts.flag
  const calls = { principal: 0, ficha: 0, connection: 0, cache: 0, old: 0, ia: 0, writes: 0 }
  const session = { user: { id: '3', role: 'SUPER_ADMIN', name: 'Fixture' }, impersonation: opts.acting ? {} : undefined }
  const principal = { activo: opts.active !== false, rol: role, roles: opts.roles || [] }
  const oldCompany = { id: 'company-fixture', nombre: 'Fixture', tipo: 'CLIENTE', contactos: [], clientes: [], _count: { contactos: 0, clientes: 0 }, updatedAt: new Date('2026-09-30'), sincronizadoAt: null }
  const prisma = {
    usuarioAdmin: { findUnique: async () => { calls.principal++; return principal } },
    crmEmpresa: { findFirst: async () => { calls.old++; return oldCompany } },
    area1CrmFichaIa: {
      findUnique: async () => { calls.cache++; return { puntos: ['Dato de fixture'], createdAt: new Date('2026-09-30') } },
      upsert: async () => { calls.writes++; throw new Error('WRITE_FORBIDDEN') },
    },
  }
  const defaults: Record<string, unknown> = {
    '@/lib/prisma': prisma,
    '@/lib/area1-puertas-produccion': puertas,
    '@/lib/area1-ficha-cliente': { cargarFichaCliente: async () => { calls.ficha++; return { id: 'company-fixture', contextoIa: {} } }, generarPuntosIa: async () => { calls.ia++; throw new Error('IA_FORBIDDEN') }, MODELO_FICHA_IA: () => 'fixture' },
    '@/lib/area1-m365': { avisoAislamiento: () => null, bloqueoActuacion: (s: typeof session) => s.impersonation ? 'No disponible durante actuación' : null },
  }
  try {
    const api = load(API, { ...defaults, crypto: require('node:crypto'), 'next/server': { NextResponse }, 'next-auth': { getServerSession: async () => session }, openai: class { constructor() { calls.ia++; throw new Error('IA_FORBIDDEN') } }, '@/lib/auth': { authOptions: {} }, '@/lib/crm-empresas-auth': { authorizeCrmEmpresas: async () => ({ status: 200, user: { id: 3, role: 'SUPER_ADMIN' } }) } })
    const result: NextResponse = await api.GET(new Request('https://fixture.invalid'), { params: Promise.resolve({ id: 'company-fixture' }) })
    const apiCalls = { ...calls }
    const Ficha = () => null
    const Old = () => null
    const components = Object.fromEntries(['CrmCompanyContactsMore', 'CrmIspFichaResumen'].map(n => [`@/components/admin/${n}`, () => null]))
    const page = load(PAGE, { ...defaults, ...components, 'next/navigation': { notFound: () => { throw new Error('NOT_FOUND') } }, '@/lib/permisos': { registrarArea: async () => null, verificarPermisoServer: async () => ({ escritura: true }) }, '@/lib/admin-area-auth': { requireAdminAreaRead: async () => session }, '@/lib/crm-empresas-auth': { canAccessCrmRelated: async () => true }, '@/components/admin/CrmCompanyWorkspace': Old, '@/components/admin/FichaCliente': Ficha, '@/lib/area1-crm-resumen-vista': { nivelDe: (r: string) => r === 'SUPER_ADMIN' ? 'SUPERADMIN' : r === 'GERENTE' ? 'GERENTE' : 'COMERCIAL' }, '@/lib/email': { getDefaultEmailSender: () => 'fixture.invalid' }, '@/lib/outlook-user-connection': { getOutlookConnectionStatus: async () => { calls.connection++; return { m365: false, envios: false, connected: false } } }, '@/components/io-ui/fonts': { ioFontClasses: 'fixture-font' } })
    const rendered = await page.default({ params: Promise.resolve({ id: 'company-fixture' }), searchParams: Promise.resolve({ editar: opts.edit }) })
    const pageNew = rendered.type === 'div' && rendered.props.children?.type === Ficha
    return { status: result.status, apiCalls, pageNew, calls }
  } finally {
    for (const [key, value] of [['VERCEL_ENV', previous.env], ['AREA1_FICHA_NUEVA_PRODUCCION', previous.flag]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value
    }
  }
}
async function main() {
  for (const role of ['SUPER_ADMIN', 'GERENTE']) {
    const result = await scenario(role)
    equal(result.status, 200, `${role}: API autorizada y cacheada`)
    equal(result.pageNew, true, `${role}: página nueva`)
    equal(result.calls.ia + result.calls.writes, 0, `${role}: fixture sin proveedores ni escrituras`)
  }
  for (const role of ['VENTAS', 'CONTABILIDAD', 'VISOR']) {
    const result = await scenario(role)
    equal(result.status, 404, `${role}: API no disponible pese a sesión antigua Superadmin`)
    equal(result.apiCalls.cache + result.apiCalls.ficha + result.apiCalls.ia, 0, `${role}: negativa anterior a datos/IA`)
    equal(result.pageNew, false, `${role}: editor anterior`)
    equal(result.calls.ficha + result.calls.connection, 0, `${role}: fallback sin ficha/conexión`)
  }
  const revoked = await scenario('SUPER_ADMIN', { active: false })
  equal(revoked.status, 404, 'principal inactivo no accede a resumen')
  equal(revoked.pageNew, false, 'principal inactivo no carga ficha nueva')
  const secondary = await scenario('VENTAS', { roles: ['GERENTE'] })
  equal(secondary.status, 200, 'roles vivos secundarios en API')
  equal(secondary.pageNew, true, 'roles vivos secundarios en página')
  const off = await scenario('SUPER_ADMIN', { flag: '' })
  equal(off.status, 404, 'puerta cerrada antes de sesión/caché')
  equal(off.calls.principal + off.calls.ficha + off.calls.connection + off.calls.cache, 0, 'sin carga nueva con puerta apagada')
  const edit = await scenario('SUPER_ADMIN', { edit: '1' })
  equal(edit.pageNew, false, 'editar=1 conserva editor anterior')
  const acting = await scenario('SUPER_ADMIN', { acting: true })
  equal(acting.status, 403, 'actuación sigue prohibida en resumen')
  equal(acting.apiCalls.principal + acting.apiCalls.cache + acting.apiCalls.ficha, 0, 'actuación se rechaza antes de lector de rol/datos')
  const preview = await scenario('VENTAS', { env: 'preview' })
  equal(preview.status, 200, 'staging mantiene resumen autorizado existente')
  equal(preview.pageNew, true, 'staging mantiene ficha existente para roles autorizados')
  ok(!fs.readFileSync(PAGE, 'utf8').includes('AREA1_IMPORTACIONES_PRODUCCION'), 'ficha no abre importaciones por su cuenta')
  console.log(`TANDA3_FICHA_ROLES ${checks}/${checks} PASS; página y handler nativos en VM, sin red ni BD`)
}
main().catch(e => { console.error(e); process.exitCode = 1 })
