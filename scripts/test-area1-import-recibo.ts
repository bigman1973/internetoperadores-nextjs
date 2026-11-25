import assert from 'node:assert/strict'
import { propietarioImportacion, aplicarIspConRecibo, ErrorImportacionNoAuditada, ErrorAuditoriaImportacion, ORIGEN_RECIBO_HUBSPOT, ORIGEN_RECIBO_ISP, reciboHubspot, reciboIspError, reciboIspExito, registrarReciboImportacion } from '../lib/area1-import-recibo'
let ok = 0
const t = async (n: string, f: () => any) => { await f(); ok++; console.log('ok', n) }
const fakeDb = (fallar = false) => { const filas: any[] = []; return { filas, auditoriaPermisosArea4: { create: async ({ data }: any) => { if (fallar) throw new Error('boom con datos@x.com'); filas.push(data); return data } } } as any }
const plan = (c: string[], k: string[] = [], f: string[] = [], aus = 0) => ({ hash: 'a'.repeat(64), clientes: c.map((clase) => ({ clase })) as any, contratos: k.map((clase) => ({ clase })) as any, facturacion: f.map((clase) => ({ clase })) as any, ausentes: { clientes: new Array(aus), contratos: [] } })
const aplicado = { importacionId: 'imp1', propuestasNuevas: 0, propuestasObsoletas: 0 }
const pii = (o: any) => assert.doesNotMatch(JSON.stringify(o), /@|boom|\.xlsx|CIF|nombre/i)
async function main() {
  await t('ISP éxito: conteos reales, hash y journalId', () => {
    const r = reciboIspExito(plan(['NUEVO', 'NUEVO', 'ACTUALIZADO', 'SIN_CAMBIOS'], ['NUEVO'], ['NUEVO', 'NUEVO']), { ...aplicado, propuestasNuevas: 3 }, 1200)
    assert.equal(r.resultado, 'EXITO'); assert.equal(r.conteos.clientes.creados, 2); assert.equal(r.conteos.clientes.actualizados, 1); assert.equal(r.conteos.clientes.omitidos, 1)
    assert.equal(r.conteos.facturacion.creados, 2); assert.equal(r.conteos.propuestas.creados, 3); assert.ok(r.hash && r.journalId); pii(r)
  })
  await t('ISP duplicado solo si nada cambió', () => {
    assert.equal(reciboIspExito(plan(['SIN_CAMBIOS'], ['SIN_CAMBIOS']), aplicado, 5).resultado, 'DUPLICADO')
    assert.equal(reciboIspExito(plan(['SIN_CAMBIOS'], [], [], 1), aplicado, 5).resultado, 'EXITO', 'ausentes marcados = cambio')
    assert.equal(reciboIspExito(plan(['SIN_CAMBIOS']), { ...aplicado, propuestasObsoletas: 1 }, 5).resultado, 'EXITO')
  })
  await t('ISP error: conteos a cero, sin mensaje crudo', () => {
    const r = reciboIspError('h'.repeat(64), Object.assign(new Error('fallo con a@b.com'), { code: 'P2002' }), 10)
    assert.equal(r.resultado, 'ERROR'); assert.equal(r.erroresCodigos?.aplicar, 'P2002'); assert.equal(r.conteos.clientes.creados, 0); pii(r)
    assert.equal(reciboIspError(undefined, new Error('x'), 1).erroresCodigos?.aplicar, 'APLICACION_FALLIDA')
  })
  await t('ISP: el recibo de éxito se escribe dentro de la tx con actor y origen', async () => {
    const tx = fakeDb(), db = fakeDb()
    const r = await aplicarIspConRecibo(db, plan(['NUEVO']), 7, async (dentro) => { await dentro(tx, aplicado); return aplicado })
    assert.equal(tx.filas.length, 1); assert.equal(db.filas.length, 0)
    const f = tx.filas[0]; assert.equal(f.actorId, 7); assert.equal(f.operacion, 'CRM_IMPORTACION_ISP'); assert.equal(f.areaCodigo, 'admin.crm'); assert.equal(f.origen, ORIGEN_RECIBO_ISP); assert.equal(f.objetivoUsuarioId, null); assert.equal(f.antes, undefined); assert.equal(r.recibo.resultado, 'EXITO')
  })
  await t('ISP: si falla el recibo dentro de la tx, se propaga (rollback) y se registra ERROR aparte', async () => {
    const tx = fakeDb(true), db = fakeDb()
    await assert.rejects(aplicarIspConRecibo(db, plan(['NUEVO']), 7, async (dentro) => { await dentro(tx, aplicado); return aplicado }))
    assert.equal(db.filas.length, 1); assert.equal(db.filas[0].despues.resultado, 'ERROR'); assert.equal(db.filas[0].despues.conteos.clientes.creados, 0); pii(db.filas[0].despues)
  })
  await t('ISP: si falla la importación, ERROR aparte y se relanza el error original', async () => {
    const db = fakeDb(); const e = new Error('rollback')
    await assert.rejects(aplicarIspConRecibo(db, plan(['NUEVO']), 7, async () => { throw e }), (x) => x === e)
    assert.equal(db.filas[0].despues.resultado, 'ERROR')
  })
  await t('ISP: si también falla el recibo de error, no se silencia', async () => {
    await assert.rejects(aplicarIspConRecibo(fakeDb(true), plan(['NUEVO']), 7, async () => { throw new Error('x') }), ErrorImportacionNoAuditada)
  })
  await t('HubSpot: EXITO, DUPLICADO, PARCIAL y ERROR según lo comprometido', () => {
    const base = { journalId: 'j1', importados: { actividades: 10, tareas: 2, relacionesContacto: 12 }, consentimientosGuardados: 100, erroresLectura: {}, duracionMs: 5 }
    assert.equal(reciboHubspot(base).resultado, 'EXITO')
    assert.equal(reciboHubspot({ ...base, importados: { actividades: 0, tareas: 0, relacionesContacto: 0 }, consentimientosGuardados: 0 }).resultado, 'DUPLICADO')
    assert.equal(reciboHubspot({ ...base, fallo: Object.assign(new Error('mensaje@x.com'), { code: 'P2034' }) }).resultado, 'PARCIAL')
    const e = reciboHubspot({ ...base, importados: { actividades: 0, tareas: 0, relacionesContacto: 0 }, consentimientosGuardados: 0, fallo: new Error('x') })
    assert.equal(e.resultado, 'ERROR'); pii(e)
    const p = reciboHubspot({ ...base, erroresLectura: { CORREO: 'sin scopes' } })
    assert.equal(p.resultado, 'PARCIAL', 'lecturas fallidas con datos comprometidos no son EXITO'); assert.equal(p.erroresCodigos?.CORREO, 'LECTURA_HUBSPOT_FALLIDA'); pii(p)
    assert.equal(reciboHubspot({ ...base, importados: { actividades: 0, tareas: 0, relacionesContacto: 0 }, consentimientosGuardados: 0, erroresLectura: { CORREO: 'x' } }).resultado, 'ERROR')
  })
  await t('HubSpot: consentimientos cuentan como actualizados, no como no-op', () => {
    const r = reciboHubspot({ journalId: 'j', importados: { actividades: 0, tareas: 0, relacionesContacto: 0 }, consentimientosGuardados: 50, erroresLectura: {}, duracionMs: 1 })
    assert.equal(r.resultado, 'EXITO'); assert.equal(r.conteos.consentimientos.actualizados, 50)
  })
  await t('Recibo exige hash o journalId', async () => {
    await assert.rejects(registrarReciboImportacion(fakeDb(), { actorId: 1, origen: ORIGEN_RECIBO_ISP, despues: { resultado: 'ERROR', conteos: {}, duracionMs: 1 } }), ErrorAuditoriaImportacion)
    const db = fakeDb(); await registrarReciboImportacion(db, { actorId: 1, origen: ORIGEN_RECIBO_HUBSPOT, despues: { resultado: 'ERROR', journalId: 'j', conteos: {}, duracionMs: 1 } })
    assert.equal(db.filas[0].operacion, 'CRM_IMPORTACION_HUBSPOT'); assert.equal(db.filas[0].origen, 'crm.hubspot.historial')
  })
  await t('Propietario: vivo y sin actuación → actorId del principal', async () => {
    const r = await propietarioImportacion({ requireOwner: async () => ({ ok: true, principal: { id: 42 }, session: { user: { id: '999' } } }) })
    assert.equal(r.ok, true); assert.equal(r.actorId, 42, 'nunca el id de la sesión/JWT')
  })
  await t('Propietario: con «Actuar como» → 403 antes de despachar', async () => {
    let despachado = false
    const r = await propietarioImportacion({ requireOwner: async () => ({ ok: true, principal: { id: 42 }, session: { impersonation: { actorId: 42, targetId: 7 } } }) })
    if (r.ok) despachado = true
    assert.equal(r.ok, false); assert.equal(r.response?.status, 403); assert.equal(despachado, false)
    assert.deepEqual(await r.response!.json(), { error: 'No disponible durante actuación' })
  })
  await t('Propietario: sin sesión o no propietario → respuesta del Área 4 tal cual', async () => {
    const r401 = new Response(null, { status: 401 }), r403 = new Response(null, { status: 403 })
    assert.equal((await propietarioImportacion({ requireOwner: async () => ({ ok: false, response: r401 }) })).response, r401)
    assert.equal((await propietarioImportacion({ requireOwner: async () => ({ ok: false, response: r403 }) })).response, r403)
    assert.equal((await propietarioImportacion({ requireOwner: async () => ({ ok: true, principal: { id: 0 }, session: {} }) })).ok, false)
  })
  await t('Handlers: propietarioImportacion antes de servicios/negocio en ambas rutas', () => {
    const fs = require('node:fs')
    const isp = fs.readFileSync('app/api/admin/crm/isp/importar/route.ts', 'utf8')
    assert.ok(isp.indexOf('propietarioImportacion()') < isp.indexOf('obtenerBajas(prisma') && isp.indexOf('propietarioImportacion()') > 0)
    assert.ok(isp.indexOf('propietarioImportacion()') < isp.indexOf('leerFicheroIsp(buffer)'))
    const hs = fs.readFileSync('app/api/admin/crm/hubspot/historial/route.ts', 'utf8')
    assert.ok(hs.indexOf('propietarioImportacion()') > 0 && hs.indexOf('propietarioImportacion()') < hs.indexOf("ejecutar('importar'"))
  })
  console.log(`\n${ok} pruebas OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
