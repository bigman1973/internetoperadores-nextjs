/** Conexión REAL de los importadores con el recibo, sobre una BD en memoria (0 BD/red/HTTP). */
import assert from 'node:assert/strict'
import { aplicarImportacion } from '../lib/crm-isp-import'
import { escribirHistorial } from '../lib/area1-hubspot-historial'
import { aplicarIspConRecibo, ErrorImportacionNoAuditada } from '../lib/area1-import-recibo'
let ok = 0
const t = async (n: string, f: () => any) => { await f(); ok++; console.log('ok', n) }
const auditDb = (fallar = false) => { const filas: any[] = []; return { filas, auditoriaPermisosArea4: { create: async ({ data }: any) => { if (fallar) throw new Error('x'); filas.push(data); return data } } } as any }

// ---------- ISP: tx en memoria con snapshot/rollback de los recibos ----------
function ispDb(opts: { rellenos: number; existentes: any[] }) {
  const audit: any[] = []
  const tx: any = new Proxy({}, { get: (_t, model: string) => {
    if (model === 'auditoriaPermisosArea4') return { create: async ({ data }: any) => { audit.push(data); return data } }
    return new Proxy({}, { get: (_m, metodo: string) => async (args: any) => {
      if (model === 'ispVinculoArea1' && metodo === 'findMany') return opts.existentes
      if (model === 'ispClienteArea1' && metodo === 'updateMany' && args?.where && Object.values(args.where).includes(null)) return { count: opts.rellenos }
      if (metodo === 'findMany') return []
      if (metodo === 'findUnique') return null
      return { count: 0 }
    } })
  } })
  const db: any = { audit, auditoriaPermisosArea4: { create: async ({ data }: any) => { audit.push(data); return data } },
    $transaction: async (fn: any) => { const antes = audit.length; try { return await fn(tx) } catch (e) { audit.length = antes; throw e } } }
  return db
}
const planIsp = (propuestas: any[], web: number | null) => ({
  hash: 'f'.repeat(64), resumen: {}, brevoVerificado: true,
  clientes: [{ clase: 'SIN_CAMBIOS', rowId: 'r1', c: {}, marketing: { estado: 'OK', motivo: null }, vinculo: { clienteWebId: web, crmContactoId: null, crmEmpresaId: null, propuestas } }],
  contratos: [], facturacion: [], ausentes: { clientes: [], contratos: [] },
}) as any
const meta = { ficheroNombre: 'x.xlsx', bytes: 1, actorId: 7, actorEmail: 'a' }
const prop = { tipo: 'CRM_EMPRESA', destinoId: 'e1', motivo: 'CIF', confianza: 'ALTA', detalle: null }
const ejecutarIsp = (db: any, plan: any) => aplicarIspConRecibo(db, plan, 7, (dentro) => aplicarImportacion(db, plan, meta, dentro as any))

// ---------- HubSpot ----------
const fila = (i: number) => ({ id: `a${i}`, hubspotId: `h${i}`, objeto: 'NOTA', tipo: 'NOTA', contactoId: 'c1', contactosExtra: [], titulo: 't', descripcion: 'd', fechaActividad: new Date(0).toISOString(), direccion: null, resultado: null, creadoPorNombre: 'HubSpot', metadatos: {}, tarea: null })
const resultadoVacio = () => ({ modo: 'importar', resumen: {}, errores: {}, consentimientos: { contactosIO: 0, porEstado: {}, conBajaPorTipo: 0, conRebote: 0, guardados: 0 }, importados: { actividades: 0, tareas: 0, relacionesContacto: 0 } }) as any
function hsDb(o: { fallaLote: (n: number) => boolean; fallaCierre?: boolean }) {
  let n = 0
  return {
    $executeRaw: async () => 0,
    crmSincronizacionHubspot: { create: async () => ({ id: 'journal-1' }), update: async ({ data }: any) => { if (o.fallaCierre && data.estado === 'ERROR') throw new Error('cierre'); return {} } },
    $transaction: async (fn: any) => {
      const lote = ++n
      const tx = {
        $queryRaw: async (_s: any, payload: string) => JSON.parse(payload).map((r: any) => ({ id: r.id, hubspot_id: r.hubspot_id })),
        crmActividadContacto: { createMany: async ({ data }: any) => { if (o.fallaLote(lote)) throw Object.assign(new Error('relaciones a@b.com'), { code: 'P2003' }); return { count: data.length } } },
        crmTarea: { createMany: async ({ data }: any) => ({ count: data.length }) },
      }
      return fn(tx) // si lanza, PostgreSQL revierte el lote entero
    },
  } as any
}
const hs = (db: any, filas: any[], audit: any) => escribirHistorial(db, { filas, consent: [], resultado: resultadoVacio(), errores: {}, resumen: {} as any, ejecutadoPor: 'x', auditoria: { actorId: 7, db: audit }, reloj: () => 0, t0: 0 })

async function main() {
  await t('ISP real: propuesta OBSOLETO reactivada → EXITO con actualizados > 0', async () => {
    const db = ispDb({ rellenos: 0, existentes: [{ id: 'v1', ispClienteRowId: 'r1', tipo: 'CRM_EMPRESA', destinoId: 'e1', estado: 'OBSOLETO', motivo: 'CIF', confianza: 'ALTA' }] })
    const r = await ejecutarIsp(db, planIsp([prop], null))
    assert.equal(r.recibo.resultado, 'EXITO'); assert.equal(r.recibo.conteos.propuestas.actualizados, 1); assert.equal(db.audit.length, 1)
  })
  await t('ISP real: vínculo directo null→id rellenado → EXITO, vinculosDirectos.actualizados = 1', async () => {
    const r = await ejecutarIsp(ispDb({ rellenos: 1, existentes: [] }), planIsp([], 55))
    assert.equal(r.recibo.resultado, 'EXITO'); assert.equal(r.recibo.conteos.vinculosDirectos.actualizados, 1)
  })
  await t('ISP real: PENDIENTE con motivo/confianza distintos → EXITO', async () => {
    const r = await ejecutarIsp(ispDb({ rellenos: 0, existentes: [{ id: 'v1', ispClienteRowId: 'r1', tipo: 'CRM_EMPRESA', destinoId: 'e1', estado: 'PENDIENTE', motivo: 'EMAIL', confianza: 'MEDIA' }] }), planIsp([prop], null))
    assert.equal(r.recibo.resultado, 'EXITO'); assert.equal(r.recibo.conteos.propuestas.actualizados, 1)
  })
  await t('ISP real: repetición sin negocio (PENDIENTE igual, vínculo ya puesto) → DUPLICADO', async () => {
    const r = await ejecutarIsp(ispDb({ rellenos: 0, existentes: [{ id: 'v1', ispClienteRowId: 'r1', tipo: 'CRM_EMPRESA', destinoId: 'e1', estado: 'PENDIENTE', motivo: 'CIF', confianza: 'ALTA' }] }), planIsp([prop], 55))
    assert.equal(r.recibo.resultado, 'DUPLICADO'); assert.equal(r.recibo.conteos.propuestas.actualizados, 0); assert.equal(r.recibo.conteos.vinculosDirectos.actualizados, 0)
  })
  await t('ISP real: recibo dentro de tx falla → rollback (0 recibos de éxito) y ERROR aparte', async () => {
    const db = ispDb({ rellenos: 1, existentes: [] }); let llamadas = 0
    const orig = db.auditoriaPermisosArea4.create
    const plan = planIsp([], 55)
    await assert.rejects(aplicarIspConRecibo(db, plan, 7, (dentro) => aplicarImportacion(db, plan, meta, async (tx, r) => { llamadas++; await dentro({ auditoriaPermisosArea4: { create: async () => { throw new Error('audit') } } } as any, r) })))
    assert.equal(llamadas, 1); assert.equal(db.audit.length, 1); assert.equal(db.audit[0].despues.resultado, 'ERROR'); assert.equal(db.audit[0].despues.conteos.vinculosDirectos.actualizados, 0); void orig
  })
  await t('HubSpot real: primer lote revertido tras insertar actividad → ERROR, comprometidos 0', async () => {
    const audit = auditDb()
    await assert.rejects(hs(hsDb({ fallaLote: (n) => n === 1 }), [fila(1)], audit))
    const d = audit.filas[0].despues
    assert.equal(d.resultado, 'ERROR'); assert.equal(d.conteos.actividades.creados, 0); assert.equal(d.conteos.relacionesContacto.creados, 0); assert.equal(d.journalId, 'journal-1')
    assert.doesNotMatch(JSON.stringify(d), /@|relaciones a/)
  })
  await t('HubSpot real: lote 1 comprometido y lote 2 revertido → PARCIAL solo con el lote 1', async () => {
    const audit = auditDb(); const filas = Array.from({ length: 501 }, (_, i) => fila(i))
    await assert.rejects(hs(hsDb({ fallaLote: (n) => n === 2 }), filas, audit))
    const d = audit.filas[0].despues
    assert.equal(d.resultado, 'PARCIAL'); assert.equal(d.conteos.actividades.creados, 500); assert.equal(d.conteos.relacionesContacto.creados, 500)
  })
  await t('HubSpot real: falla también el cierre del journal → recibo PARCIAL igualmente, causa original conservada', async () => {
    const audit = auditDb(); const filas = Array.from({ length: 501 }, (_, i) => fila(i))
    await assert.rejects(hs(hsDb({ fallaLote: (n) => n === 2, fallaCierre: true }), filas, audit), (e: any) => e.code === 'P2003')
    const d = audit.filas[0].despues
    assert.equal(d.resultado, 'PARCIAL'); assert.equal(d.erroresCodigos.cierreJournal, 'CIERRE_JOURNAL_FALLIDO'); assert.equal(d.erroresCodigos.importacion, 'P2003')
  })
  await t('HubSpot real: cierre y auditoría fallan → ErrorImportacionNoAuditada con la causa original', async () => {
    const filas = Array.from({ length: 501 }, (_, i) => fila(i))
    await assert.rejects(hs(hsDb({ fallaLote: (n) => n === 2, fallaCierre: true }), filas, auditDb(true)), (e: any) => e instanceof ErrorImportacionNoAuditada && e.causa?.code === 'P2003')
  })
  await t('HubSpot real: todo comprometido → EXITO con conteos reales', async () => {
    const audit = auditDb()
    const r: any = await hs(hsDb({ fallaLote: () => false }), [fila(1), fila(2)], audit)
    assert.equal(r.recibo.resultado, 'EXITO'); assert.equal(audit.filas[0].despues.conteos.actividades.creados, 2)
  })
  console.log(`\n${ok} pruebas OK`)
}
main().catch((e) => { console.error(e); process.exit(1) })
