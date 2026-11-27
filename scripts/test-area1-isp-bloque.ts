/** Área 1 · Confirmación en bloque de vínculos ISP → empresa. BD en memoria, 0 BD/red/HTTP, datos ficticios. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AsyncLocalStorage } from 'node:async_hooks'
import * as crypto from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import type { CandidatoBloque } from '../lib/area1-isp-bloque'
import * as importCore from '../lib/crm-isp-import-core'
import * as auditCore from '../lib/area4/audit'
import { area4RegisteredSurface } from '../lib/area4/section-registry'
// Same actual core/guard instance is shared by the resolver and transaction wrapper.
// No Prisma singleton is loaded, and even the VM environment uses a fictitious loopback DSN.
const env = { DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@127.0.0.1:1/io_staging_finanzas',
  FINANCE_STAGING_SANDBOX: '1', VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'staging',
  IO_PRODUCTION_READ_ONLY: '0', FINANCE_DEPLOYMENT_READ_ONLY: '0', FINANCE_EXTERNAL_ACTIONS_DISABLED: '1' }
const forbiddenIo = () => { throw new Error('EXTERNAL_IO_FORBIDDEN') }
const dependencies: Record<string, any> = {
  'node:async_hooks': { AsyncLocalStorage }, 'node:crypto': crypto,
  '@/lib/crm-isp-import-core': importCore, './crm-isp-import-core': importCore,
  '@/lib/area4/audit': auditCore, '@/lib/prisma': { default: new Proxy({}, { get: forbiddenIo }) },
  'next-auth': { getServerSession: forbiddenIo }, '@/lib/auth': { authOptions: {} },
  '@/lib/area1-puertas-produccion': { importacionesCrmCerradas: forbiddenIo },
  '@/lib/brevo-config': { getBrevoApiKey: forbiddenIo }, '@/lib/brevo-fetch': { brevoFetch: forbiddenIo },
}
function load(file: string) {
  const module: any = { exports: {} }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText
  vm.runInNewContext(code, { module, exports: module.exports, require(name: string) {
    if (!(name in dependencies)) throw new Error(`UNEXPECTED_DEPENDENCY ${name}`)
    return dependencies[name]
  }, process: { env }, console, Date, Buffer, Set, Map, performance, fetch: forbiddenIo }, { filename: file })
  return module.exports
}
dependencies['./isp-origen-policy'] = load('lib/isp-origen-policy.ts')
const sourceCore = dependencies['@/lib/isp-origen-server'] = load('lib/isp-origen-server.ts')
const receipt = dependencies['@/lib/area1-import-recibo'] = load('lib/area1-import-recibo.ts')
dependencies['@/lib/crm-isp-import'] = load('lib/crm-isp-import.ts')
const { seleccionarBloque, huellaBloque, enmascararDoc, simularBloque, confirmarBloque, ErrorBloque, CONFIRMACION_BLOQUE } = load('lib/area1-isp-bloque.ts') as typeof import('../lib/area1-isp-bloque')
const { ErrorImportacionNoAuditada, ORIGEN_RECIBO_VINCULOS_BLOQUE } = receipt
let ok = 0
const t = async (n: string, f: () => any) => { await f(); ok++; console.log('ok', n) }

function señal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function acotado<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('INTERCALADO_TIMEOUT')), 3000) })]) }
  finally { if (timer) clearTimeout(timer) }
}

// ---------- BD en memoria (solo los modelos que toca el bloque) ----------
type Estado = { vinculos: any[]; clientes: any[]; empresas: any[]; enlaces: any[]; audit: any[]; creadas: string[] }
function semilla(): Estado {
  const clientes: any[] = [], empresas: any[] = [], vinculos: any[] = []
  const add = (i: number, o: { nombreEmp?: string; destino?: string; activa?: boolean; yaEmpresa?: string | null; web?: number | null } = {}) => {
    const eid = o.destino || `e${i}`
    if (!empresas.find((e) => e.id === eid)) empresas.push({ id: eid, nombre: o.nombreEmp ?? `Empresa Prueba ${i} SL`, activo: o.activa ?? true })
    clientes.push({ id: `r${i}`, codigo: `C${String(i).padStart(4, '0')}`, docNormalizado: `B000000${String(i).padStart(2, '0')}`, nombre: `EMPRESA PRUEBA ${i}, S.L.`, crmEmpresaId: o.yaEmpresa ?? null, crmContactoId: null, clienteWebId: o.web === undefined ? 100 + i : o.web, _contratos: 2 })
    vinculos.push({ id: `v${String(i).padStart(3, '0')}`, ispClienteRowId: `r${i}`, tipo: 'CRM_EMPRESA', destinoId: eid, motivo: 'NIF', confianza: 'ALTA', estado: 'PENDIENTE', detalle: null })
  }
  for (let i = 1; i <= 5; i++) add(i, { web: i === 5 ? null : undefined })
  add(6, { nombreEmp: 'Otra Razón Social SA' })            // nombre distinto
  add(7, { destino: 'eX', nombreEmp: 'Empresa Prueba 7 SL' }); add(8, { destino: 'eX' }) // empresa compartida
  add(9, { activa: false })                                  // destino inactivo
  add(10, { yaEmpresa: 'eZ' })                               // ya tiene empresa
  // ruido que no entra: otra propuesta del mismo cliente (se volverá OBSOLETA) y una CREAR_EMPRESA
  vinculos.push({ id: 'v900', ispClienteRowId: 'r1', tipo: 'CREAR_EMPRESA', destinoId: 'nuevo', motivo: 'SIN_CANDIDATO', confianza: 'ALTA', estado: 'PENDIENTE' })
  vinculos.push({ id: 'v901', ispClienteRowId: 'r11', tipo: 'CRM_EMPRESA', destinoId: 'e11', motivo: 'NOMBRE', confianza: 'BAJA', estado: 'PENDIENTE' })
  return { vinculos, clientes, empresas, enlaces: [], audit: [], creadas: [] }
}
const match = (row: any, where: any = {}): boolean => Object.entries(where).every(([k, v]: any) => {
  if (k === 'OR') return v.some((branch: any) => match(row, branch))
  if (k === 'AND') return v.every((branch: any) => match(row, branch))
  if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k])
  if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not
  return row[k] === v
})
type EventoTx = { tx: number; operacion: string }
function memDb(opts: { fallaEn?: string; fallaAudit?: 'siempre' | 'dentro'; alSolicitarFence?: (tx: number) => void } = {}) {
  let s = semilla()
  let siguienteTx = 0, colaFence = Promise.resolve()
  const eventos: EventoTx[] = []
  const cliente = (id: string) => s.clientes.find((c) => c.id === id)
  const api = (enTx = false): any => ({
    ispVinculoArea1: {
      findMany: async ({ where }: any) => {
        const r = s.vinculos.filter((v) => match(v, where)).map((v) => { const c = cliente(v.ispClienteRowId); return { ...v, cliente: { ...c, _count: { contratos: c._contratos } } } })
        return r
      },
      groupBy: async ({ where }: any) => { const m = new Map<string, number>(); for (const v of s.vinculos.filter((v) => match(v, where))) m.set(v.destinoId, (m.get(v.destinoId) || 0) + 1); return [...m].map(([destinoId, n]) => ({ destinoId, _count: { _all: n } })) },
      findUnique: async ({ where }: any) => { const v = s.vinculos.find((x) => x.id === where.id); return v ? { ...v, cliente: { ...cliente(v.ispClienteRowId) } } : null },
      update: async ({ where, data }: any) => { if (opts.fallaEn === where.id && data.estado === 'CONFIRMADO') throw Object.assign(new Error('fallo con dato juan@ejemplo.es'), { code: 'P2034' }); Object.assign(s.vinculos.find((x) => x.id === where.id), data); return {} },
      updateMany: async ({ where, data }: any) => { const rows = s.vinculos.filter((v) => match(v, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length } },
    },
    ispClienteArea1: {
      findMany: async ({ where }: any = {}) => s.clientes.filter((c) => match(c, where)).map((c) => ({ ...c })),
      findUnique: async ({ where }: any) => { const c = s.clientes.find((c) => match(c, where)); return c ? { ...c } : null },
      update: async ({ where, data }: any) => { Object.assign(cliente(where.id), data); return {} },
      updateMany: async ({ where, data }: any) => { const rows = s.clientes.filter((c) => match(c, where)); rows.forEach((c) => Object.assign(c, data)); return { count: rows.length } },
      findFirst: async () => null,
    },
    crmEmpresa: {
      findMany: async ({ where }: any) => s.empresas.filter((e) => where.id.in.includes(e.id)),
      findFirst: async ({ where }: any) => s.empresas.find((e) => e.id === where.id && e.activo === where.activo) || null,
      create: async () => { s.creadas.push('empresa'); return { id: 'nueva' } },
    },
    crmRegistroHubspot: { create: async () => { s.creadas.push('contacto'); return { id: 'nuevo' } } },
    crmEmpresaContacto: { create: async () => { s.creadas.push('empresaContacto'); return {} } },
    crmEmpresaCliente: {
      count: async ({ where }: any) => s.enlaces.filter((e) => where.clienteId.in.includes(e.clienteId)).length,
      findUnique: async ({ where }: any) => s.enlaces.find((e) => e.clienteId === where.clienteId) || null,
      create: async ({ data }: any) => { s.enlaces.push(data); return data },
    },
    auditoriaPermisosArea4: { create: async ({ data }: any) => {
      assert.equal(enTx, data.despues.resultado === 'EXITO', 'EXITO dentro de la tx; ERROR después del rollback')
      if (opts.fallaAudit === 'siempre' || (opts.fallaAudit === 'dentro' && enTx)) throw new Error('audit')
      s.audit.push(data); return data
    } },
  })
  const db: any = api()
  db.$transaction = async (fn: any) => {
    let copia = structuredClone(s)
    const tx = api(true), id = ++siguienteTx
    let liberarFence: (() => void) | undefined
    const registrar = (operacion: string) => eventos.push({ tx: id, operacion })
    for (const [model, delegate] of Object.entries(tx) as Array<[string, Record<string, (...args: any[]) => any>]>) {
      for (const [action, original] of Object.entries(delegate)) {
        delegate[action] = (...args: any[]) => { registrar(`${model}.${action}`); return original(...args) }
      }
    }
    let fences = 0
    tx.$queryRaw = async (strings: TemplateStringsArray, ...values: unknown[]) => {
      assert.equal(strings.join('?'), 'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))::text AS locked')
      assert.deepEqual(values, ['isp-origen:ownership:v1']); assert.equal(++fences, 1)
      registrar('LOCK_SOLICITADO')
      const anterior = colaFence
      colaFence = new Promise<void>((resolve) => { liberarFence = resolve })
      opts.alSolicitarFence?.(id)
      await anterior
      // READ COMMITTED synthetic baseline: rollback must not undo another tx's
      // source refresh committed while this callback was waiting for the fence.
      copia = structuredClone(s)
      registrar('LOCK_OBTENIDO')
      return [{ locked: '' }]
    }
    for (const [model, actions] of [['ispClienteArea1', ['update', 'updateMany']], ['ispVinculoArea1', ['update', 'updateMany']], ['crmEmpresaCliente', ['create']]] as const) {
      for (const action of actions) {
        const original = tx[model][action]
        tx[model][action] = (args: any) => sourceCore.guardPrismaIspOrigenMutation({ model: model[0].toUpperCase() + model.slice(1), action, args, runInTransaction: true }, () => original(args), { db: tx })
      }
    }
    try {
      const r = await sourceCore.runWithIspPrismaTransaction(tx, () => fn(tx))
      registrar('COMMIT'); return r
    } catch (e) { s = copia; registrar('ROLLBACK'); throw e }
    finally { if (liberarFence) { registrar('LOCK_LIBERADO'); liberarFence() } }
  }
  db.estado = () => s
  db.eventos = eventos
  return db
}
const cand = (o: Partial<CandidatoBloque> = {}): CandidatoBloque => ({ id: 'v1', ispClienteRowId: 'r1', destinoId: 'e1', codigoIsp: 'C1', doc: 'B00000001', nombreIsp: 'ACME, S.L.', nombreEmpresa: 'Acme SL', empresaActiva: true, clienteYaConEmpresa: false, clienteWebId: 1, contratos: 1, ...o })

async function main() {
  await t('selección: nombre igual (normalizado) entra; distinto, compartida, inactiva y ya vinculada salen', () => {
    const sel = seleccionarBloque([cand(), cand({ id: 'v2', nombreEmpresa: 'Otra' }), cand({ id: 'v3', destinoId: 'eX' }), cand({ id: 'v4', empresaActiva: false, destinoId: 'e4' }), cand({ id: 'v5', clienteYaConEmpresa: true, destinoId: 'e5' }), cand({ id: 'v6', nombreEmpresa: null, destinoId: 'e6' })],
      new Map([['e1', 1], ['eX', 2], ['e4', 1], ['e5', 1], ['e6', 1]]))
    assert.deepEqual(structuredClone(sel.incluidos.map((c: CandidatoBloque) => c.id)), ['v1'])
    const m = Object.fromEntries(sel.excluidos.map((e) => [e.c.id, e.motivos]))
    assert.deepEqual(structuredClone(m), { v2: ['NOMBRE_DISTINTO'], v3: ['EMPRESA_COMPARTIDA'], v4: ['EMPRESA_INACTIVA'], v5: ['CLIENTE_YA_CON_EMPRESA'], v6: ['NOMBRE_DISTINTO'] })
  })
  await t('huella: estable con el orden, cambia si cambia una propuesta', () => {
    const a = [cand(), cand({ id: 'v2', destinoId: 'e2' })]
    assert.equal(huellaBloque(a), huellaBloque([...a].reverse()))
    assert.notEqual(huellaBloque(a), huellaBloque([cand(), cand({ id: 'v2', destinoId: 'e3' })]))
    assert.notEqual(huellaBloque(a), huellaBloque([cand()]))
    assert.match(huellaBloque(a), /^[0-9a-f]{64}$/)
  })
  await t('enmascarado del NIF', () => { assert.equal(enmascararDoc('B12345678'), 'B****78'); assert.equal(enmascararDoc(null), 'sin NIF') })
  let simulada: any
  await t('simular: solo lectura; recuentos y ejemplos sin datos personales', async () => {
    const db = memDb(); const antes = JSON.stringify(db.estado())
    simulada = await simularBloque(db)
    assert.equal(JSON.stringify(db.estado()), antes)
    assert.equal(simulada.vinculos, 5); assert.equal(simulada.empresas, 5); assert.equal(simulada.enlacesClienteWeb, 4); assert.equal(simulada.contratos, 10); assert.equal(simulada.fichasNuevas, 0)
    assert.deepEqual({ ...simulada.excluidos }, { NOMBRE_DISTINTO: 2, EMPRESA_COMPARTIDA: 2, EMPRESA_INACTIVA: 1, CLIENTE_YA_CON_EMPRESA: 1, total: 5 }) // r8 comparte y tiene otro nombre (como en staging)
    const txt = JSON.stringify(simulada.ejemplos)
    assert.ok(simulada.ejemplos.length <= 10 && !/B000000/.test(txt) && !/PRUEBA/.test(txt), 'sin NIF completo ni nombres')
  })
  await t('confirmar: huella distinta → 409, sin escrituras ni recibo', async () => {
    const db = memDb(); const antes = JSON.stringify(db.estado())
    await assert.rejects(confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: '0'.repeat(64) }), (e: any) => e instanceof ErrorBloque && e.codigo === 'HASH_DISTINTO' && e.status === 409)
    assert.equal(JSON.stringify(db.estado()), antes)
  })
  await t('confirmar: una propuesta cambia entre simular y confirmar → 409 sin recibo', async () => {
    const db = memDb()
    db.estado().clientes.find((c: any) => c.id === 'r2').clienteWebId = 999 // la propuesta cambia después de simular
    await assert.rejects(confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: simulada.hash }), (e: any) => e?.codigo === 'HASH_DISTINTO')
    assert.equal(db.estado().audit.length, 0)
  })
  await t('intercalado real: refresh fuente con PENDIENTE mientras bloque espera fence → relee bajo lock, HASH_DISTINTO y cero enlaces/EXITO', async () => {
    const refreshConFence = señal(), permitirRefresh = señal(), bloqueEsperandoFence = señal()
    const db = memDb({ alSolicitarFence: (tx) => { if (tx === 2) bloqueEsperandoFence.resolve() } })
    const antes = await simularBloque(db), nombreAnterior = db.estado().clientes[0].nombre
    assert.equal(antes.vinculos, 5)
    const refresh = db.$transaction(async (tx: any) => {
      await sourceCore.acquireIspOrigenFenceTx(tx)
      refreshConFence.resolve()
      await permitirRefresh.promise
      // The same protected mutation is denied ambiently, even with a live fence.
      // Only the real, tx-bound source writer facade can refresh the source name.
      await assert.rejects(tx.ispClienteArea1.update({ where: { id: 'r1' }, data: { nombre: 'Nombre Fuente Refrescado SA' } }),
        (e: any) => e?.code === 'ISP_ORIGEN_NO_EDITABLE')
      assert.equal(db.estado().clientes[0].nombre, nombreAnterior)
      await sourceCore.runWithIspSourceWriteTx('crm-xlsx', tx, (writerTx: any) =>
        writerTx.ispClienteArea1.update({ where: { id: 'r1' }, data: { nombre: 'Nombre Fuente Refrescado SA' } }))
      assert.equal(db.estado().vinculos.find((v: any) => v.id === 'v001').estado, 'PENDIENTE')
    })
    let rechazo: Promise<void> | undefined, bloqueTerminado = false
    try {
      await acotado(refreshConFence.promise)
      rechazo = assert.rejects(confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: antes.hash }),
        (e: any) => e instanceof ErrorBloque && e.codigo === 'HASH_DISTINTO' && e.status === 409)
        .finally(() => { bloqueTerminado = true })
      await acotado(bloqueEsperandoFence.promise)
      assert.equal(bloqueTerminado, false, 'confirmar permanece esperando la adquisición del lock')
      assert.deepEqual(db.eventos.filter((e: EventoTx) => e.tx === 2).map((e: EventoTx) => e.operacion), ['LOCK_SOLICITADO'],
        'ninguna lectura de candidatos/destinos ni decisión de selección antes de obtener el fence')
      assert.equal(db.estado().clientes[0].nombre, nombreAnterior)
      permitirRefresh.resolve()
      await acotado(refresh)
      await acotado(rechazo)
      const traza: EventoTx[] = db.eventos
      const bloque = traza.filter((e) => e.tx === 2).map((e) => e.operacion)
      assert.deepEqual(bloque, ['LOCK_SOLICITADO', 'LOCK_OBTENIDO', 'ispVinculoArea1.findMany', 'ispVinculoArea1.groupBy', 'crmEmpresa.findMany', 'ROLLBACK', 'LOCK_LIBERADO'])
      assert.ok(traza.findIndex((e) => e.tx === 1 && e.operacion === 'COMMIT') < traza.findIndex((e) => e.tx === 2 && e.operacion === 'LOCK_OBTENIDO'))
      assert.equal(traza.filter((e) => e.tx === 1 && e.operacion === 'ispClienteArea1.update').length, 1, 'solo el refresh acreditado alcanza la escritura')
      const s = db.estado()
      assert.equal(s.clientes[0].nombre, 'Nombre Fuente Refrescado SA', 'rollback del bloque no deshace el refresh ya comprometido')
      assert.ok(s.vinculos.every((v: any) => v.estado === 'PENDIENTE'))
      assert.ok(s.clientes.every((c: any) => c.crmEmpresaId === (c.id === 'r10' ? 'eZ' : null)))
      assert.equal(s.enlaces.length, 0); assert.deepEqual(s.creadas, [])
      assert.equal(s.audit.filter((a: any) => a.despues.resultado === 'EXITO').length, 0)
      assert.equal(s.audit.length, 0, 'HASH_DISTINTO no genera ni siquiera un recibo ERROR')
      const despues = await simularBloque(db)
      assert.equal(despues.vinculos, 4); assert.notEqual(despues.hash, antes.hash)
      assert.equal(despues.excluidos.NOMBRE_DISTINTO, antes.excluidos.NOMBRE_DISTINTO + 1)
    } finally {
      permitirRefresh.resolve()
      await Promise.allSettled([refresh, ...(rechazo ? [rechazo] : [])])
    }
  })
  await t('confirmar: EXITO con recibo dentro de la tx, solo los 5, sin crear fichas', async () => {
    const db = memDb()
    const r = await confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: simulada.hash })
    const s = db.estado()
    assert.equal(r.vinculos, 5); assert.equal(r.enlacesClienteWeb, 4); assert.equal(r.obsoletas, 1)
    assert.deepEqual(s.creadas, [])
    assert.deepEqual(s.vinculos.filter((v: any) => v.estado === 'CONFIRMADO').map((v: any) => v.id), ['v001', 'v002', 'v003', 'v004', 'v005'])
    assert.equal(s.vinculos.find((v: any) => v.id === 'v900').estado, 'OBSOLETO')
    assert.equal(s.vinculos.find((v: any) => v.id === 'v006').estado, 'PENDIENTE')
    assert.equal(s.clientes.find((c: any) => c.id === 'r1').crmEmpresaId, 'e1')
    assert.equal(s.audit.length, 1)
    const a = s.audit[0]
    assert.equal(a.origen, ORIGEN_RECIBO_VINCULOS_BLOQUE); assert.equal(a.actorId, 7); assert.equal(a.operacion, 'CRM_IMPORTACION_ISP')
    assert.equal(a.despues.resultado, 'EXITO'); assert.equal(a.despues.hash, simulada.hash); assert.equal(a.despues.conteos.vinculosEmpresa.actualizados, 5)
    // segunda vez: ya no hay nada que confirmar
    const s2 = await simularBloque(db); assert.equal(s2.vinculos, 0)
    await assert.rejects(confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: s2.hash }), (e: any) => e?.codigo === 'BLOQUE_VACIO')
  })
  await t('confirmar: fallo a mitad → rollback total + recibo ERROR aparte sin PII', async () => {
    const db = memDb({ fallaEn: 'v003' }); const vinc = JSON.stringify(db.estado().vinculos)
    const clientes = JSON.stringify(db.estado().clientes), empresas = JSON.stringify(db.estado().empresas)
    await assert.rejects(confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: simulada.hash }), (e: any) => e?.code === 'P2034')
    const s = db.estado()
    assert.equal(JSON.stringify(s.vinculos), vinc); assert.equal(s.enlaces.length, 0)
    assert.equal(JSON.stringify(s.clientes), clientes); assert.equal(JSON.stringify(s.empresas), empresas); assert.deepEqual(s.creadas, [])
    assert.equal(s.audit.length, 1); assert.equal(s.audit[0].despues.resultado, 'ERROR'); assert.equal(s.audit[0].despues.conteos.vinculosEmpresa.actualizados, 0)
    assert.ok(!/ejemplo\.es|juan/.test(JSON.stringify(s.audit)))
  })
  await t('confirmar: si falla el recibo dentro, se revierte; si falla también el de ERROR → no auditada', async () => {
    const db = memDb({ fallaAudit: 'dentro' })
    await assert.rejects(confirmarBloque(db, { actorId: 7, actor: 'a', hashEsperado: simulada.hash }))
    assert.equal(db.estado().vinculos.filter((v: any) => v.estado === 'CONFIRMADO').length, 0); assert.equal(db.estado().audit[0].despues.resultado, 'ERROR')
    const db2 = memDb({ fallaAudit: 'siempre' })
    await assert.rejects(confirmarBloque(db2, { actorId: 7, actor: 'a', hashEsperado: simulada.hash }), (e: any) => e instanceof ErrorImportacionNoAuditada)
    assert.equal(db2.estado().vinculos.filter((v: any) => v.estado === 'CONFIRMADO').length, 0)
  })
  const ruta = readFileSync('app/api/admin/crm/isp/vinculos/bloque/route.ts', 'utf8')
  await t('ruta: superadmin; confirmar exige propietario vivo, frase y huella; simular bloquea «Actuar como»', () => {
    const post = ruta.slice(ruta.indexOf('export async function POST'))
    assert.ok(post.indexOf('autorizarSuperadminIsp') < post.indexOf('propietarioImportacion') && post.indexOf('propietarioImportacion') < post.indexOf('confirmarBloque('))
    assert.ok(post.includes('CONFIRMACION_BLOQUE') && /\[0-9a-f\]\{64\}/.test(post) && post.includes('owner.actorId'))
    assert.ok(ruta.slice(0, ruta.indexOf('export async function POST')).includes('bloqueoActuacion'))
    assert.equal(CONFIRMACION_BLOQUE, 'CONFIRMAR_BLOQUE')
    assert.ok(!/console\.log/.test(ruta))
  })
  await t('ruta registrada en el registry del Área 4', () => {
    assert.ok(area4RegisteredSurface('/api/admin/crm/isp/vinculos/bloque', 'api'))
  })
  assert.equal(ok, 12)
  console.log(`\n${ok}/12 OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
