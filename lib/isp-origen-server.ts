import { AsyncLocalStorage } from 'node:async_hooks'
import type { Prisma } from '@prisma/client'
import {
  ISP_ORIGEN_CATALOG, ISP_SOURCE_WRITERS, ISP_CRM_ALIASES, ISP_LEGACY_FISCAL_HEADER,
  persistedClienteOrigin, isIspMirror, rejectIspOrigen, sourceWriterFields,
  type IspPolicyModel, type IspSourceWriter, type IspIdentityAccount,
} from './isp-origen-policy'
export type { IspSourceWriter } from './isp-origen-policy'

/** Read-only structural interface: injected live singleton/transaction, never a frozen snapshot. */
export type IspOwnershipReadDb = { [delegate: string]: any }
export type IspEmpresaOwnership = Readonly<{ linked: boolean; empresaId: string; cuentas: readonly IspIdentityAccount[]; evidence: readonly string[] }>
const LIMIT = 501
const areaSelect = { id: true, ispClienteId: true, codigo: true, nombre: true, cif: true, nif: true, docNormalizado: true, clienteWebId: true, crmEmpresaId: true, crmContactoId: true }
const clienteSelect = { id: true, ispGestionId: true, clienteIdIsp: true, codigo: true, nombre: true, nif: true, cif: true }
async function readRows(db: IspOwnershipReadDb, delegate: string, where: unknown, select: Record<string, boolean>): Promise<any[]> {
  try {
    if (!db[delegate] || typeof db[delegate].findMany !== 'function') rejectIspOrigen()
    const rows = await db[delegate].findMany({ where, select, take: LIMIT })
    if (!Array.isArray(rows) || rows.length >= LIMIT) rejectIspOrigen()
    return rows
  } catch { rejectIspOrigen() }
}
function delegateName(model: string): string { return model[0].toLowerCase() + model.slice(1) }
function normalizedWhere(where: any): any {
  if (!where || typeof where !== 'object') return where
  const pairs: Record<string, string[]> = { empresaId_clienteId: ['empresaId', 'clienteId'], codigoCliente_anio_mes: ['codigoCliente', 'anio', 'mes'], ispClienteRowId_tipo_destinoId: ['ispClienteRowId', 'tipo', 'destinoId'] }
  const result = { ...where }
  for (const [key, columns] of Object.entries(pairs)) if (key in result) {
    const value = result[key]; delete result[key]
    if (!value || typeof value !== 'object' || columns.some(column => !(column in value))) rejectIspOrigen()
    for (const column of columns) result[column] = value[column]
  }
  return result
}
export async function readIspEmpresaOwnership(db: IspOwnershipReadDb, empresaId: string): Promise<IspEmpresaOwnership> {
  if (typeof empresaId !== 'string' || !empresaId) rejectIspOrigen()
  const empresas = await readRows(db, 'crmEmpresa', { id: empresaId }, { id: true })
  if (empresas.length !== 1) rejectIspOrigen()
  const direct = await readRows(db, 'ispClienteArea1', { crmEmpresaId: empresaId }, areaSelect)
  const links = await readRows(db, 'crmEmpresaCliente', { empresaId }, { empresaId: true, clienteId: true })
  const cuentas = new Map<string, IspIdentityAccount>()
  const evidence: string[] = []
  const addArea = (row: any, why: string) => {
    if (typeof row.id !== 'string' || !row.id || typeof row.ispClienteId !== 'string' || !row.ispClienteId) rejectIspOrigen()
    cuentas.set(`area1:${row.id}`, { ...row, fuente: 'AREA1' }); evidence.push(why)
  }
  direct.forEach(row => addArea(row, 'AREA1_DIRECTO'))
  for (const link of links) {
    const clientes = await readRows(db, 'clienteWeb', { id: link.clienteId }, clienteSelect)
    if (clientes.length !== 1) rejectIspOrigen()
    const area = await readRows(db, 'ispClienteArea1', { OR: [{ clienteWebId: link.clienteId }, { ispClienteId: clientes[0].ispGestionId }] }, areaSelect)
    if (area.length) area.forEach(row => addArea(row, 'AREA1_LEGACY'))
    else {
      const origin = persistedClienteOrigin(clientes[0])
      if (origin === 'unknown') rejectIspOrigen()
      if (origin === 'source') { cuentas.set(`legacy:${clientes[0].id}`, { ...clientes[0], fuente: 'LEGACY' }); evidence.push('LEGACY_ID_PERSISTIDO') }
    }
  }
  const confirmed = await readRows(db, 'ispVinculoArea1', { tipo: { in: ['CRM_EMPRESA', 'CREAR_EMPRESA'] }, destinoId: empresaId, estado: 'CONFIRMADO' }, { ispClienteRowId: true })
  for (const link of confirmed) {
    const source = await readRows(db, 'ispClienteArea1', { id: link.ispClienteRowId }, areaSelect)
    if (source.length !== 1 || source[0].crmEmpresaId !== empresaId) rejectIspOrigen()
    addArea(source[0], 'VINCULO_CONFIRMADO_EFECTIVO')
  }
  return Object.freeze({ linked: cuentas.size > 0, empresaId, cuentas: Object.freeze([...cuentas.values()]), evidence: Object.freeze([...new Set(evidence)]) })
}

/** Internal transaction identity supplied only by the singleton callback wrapper. */
type TransactionScope = { tx: Prisma.TransactionClient; active: boolean; fence?: Promise<void> }
const txScope = new AsyncLocalStorage<TransactionScope>()
export async function runWithIspPrismaTransaction<T>(tx: Prisma.TransactionClient, callback: () => T | Promise<T>): Promise<T> {
  const context: TransactionScope = { tx, active: true }
  return txScope.run(context, async () => { try { return await callback() } finally { context.active = false } })
}
/** Fixed global ownership fence: acquired before any ownership decision, released by PostgreSQL at tx end. */
export async function acquireIspOrigenFenceTx(tx: Prisma.TransactionClient): Promise<void> {
  const context = txScope.getStore()
  if (typeof window !== 'undefined' || !context?.active || context.tx !== tx || process.env.IO_PRODUCTION_READ_ONLY === '1') rejectIspOrigen()
  if (!context.fence) context.fence = (async () => {
    try {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'isp-origen:ownership:v1'}, 0))::text AS locked`
    } catch { rejectIspOrigen() }
  })()
  await context.fence
  if (!context.active || txScope.getStore() !== context) rejectIspOrigen()
}
export type IspSourceInvoiceItem = Readonly<{ facturaISPId: number; idExterno: string }>
type SourceScope = { writer: IspSourceWriter; tx: Prisma.TransactionClient; active: boolean; item?: IspSourceInvoiceItem }
const sourceScope = new AsyncLocalStorage<SourceScope>()
const invocationScope = new AsyncLocalStorage<{ capability: SourceScope; model: string; action: string }>()
const MUTATIONS = new Set(['create', 'createOne', 'createMany', 'createManyAndReturn', 'update', 'updateOne', 'updateMany', 'upsert', 'upsertOne', 'delete', 'deleteOne', 'deleteMany'])
const RAW = new Set(['executeRaw', 'executeRawUnsafe', 'queryRaw', 'queryRawUnsafe', '$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe'])
const createAction = (action: string) => action.startsWith('create')
const deleteAction = (action: string) => action.startsWith('delete')
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value)

function validateSourceData(writer: IspSourceWriter, model: string, action: string, args: any): void {
  if (!record(args) || deleteAction(action)) rejectIspOrigen()
  if (writer === 'finance-p2' && model === 'FacturaEmitida' && action !== 'create' && action !== 'createOne') rejectIspOrigen()
  if (writer === 'isp-facturas' && model === 'FacturaEmitida' && !['create', 'createOne', 'update', 'updateOne'].includes(action)) rejectIspOrigen()
  const branches = action.startsWith('upsert') ? [[true, args.create], [false, args.update]] as const : [[createAction(action), args.data]] as const
  for (const [create, payload] of branches) {
    const allowed = sourceWriterFields(writer, model, create)
    if (!allowed) rejectIspOrigen()
    const rows = Array.isArray(payload) ? payload : [payload]
    if (!rows.length) rejectIspOrigen()
    for (const data of rows) {
      if (!record(data)) rejectIspOrigen()
      for (const [field, value] of Object.entries(data)) {
        if (!allowed.includes(field)) rejectIspOrigen()
        // No atomic/nested object operations. Decimal/Date are scalar values, not envelopes.
        if (record(value) && !(value instanceof Date) && typeof value.toFixed !== 'function') rejectIspOrigen()
      }
      if (writer === 'crm-xlsx' && create && 'id' in data && (typeof data.id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(data.id))) rejectIspOrigen()
      if (writer === 'isp-clients' && create && (typeof data.passwordHash !== 'string' || !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(data.passwordHash))) rejectIspOrigen()
      if (model === 'IspFacturacionMensualArea1' && 'mes' in data && (!Number.isInteger(data.mes) || data.mes < 1 || data.mes > 12)) rejectIspOrigen()
      if (writer === 'finance-p2' && create && model === 'Factura') {
        if (data.situacion !== 'PENDIENTE' || String(data.totalPendiente) !== String(data.total)) rejectIspOrigen()
      }
      if (writer === 'finance-p2' && create && model === 'FacturaEmitida') {
        if (data.origenSistema !== 'ISPGestion' || data.estado !== 'EMITIDA' || data.importeCobrado !== 0 || data.fechaCobro !== null || data.tipoIrpf !== 0 || data.importeIrpf !== 0 || !Number.isSafeInteger(data.facturaISPId) || data.facturaISPId < 1) rejectIspOrigen()
      }
      if (writer === 'isp-facturas' && model === 'FacturaEmitida') {
        if (ISP_LEGACY_FISCAL_HEADER.some(field => !(field in data))) rejectIspOrigen()
        if (create && (data.origenSistema !== 'ISPGestion' || data.estado !== 'EMITIDA' || data.importeCobrado !== 0 || data.fechaCobro !== null || data.tipoIrpf !== 0 || data.importeIrpf !== 0)) rejectIspOrigen()
      }
      if (model === 'ClienteWeb' && create && (typeof data.ispGestionId !== 'string' || !/^[1-9][0-9]*$/.test(data.ispGestionId))) rejectIspOrigen()
    }
  }
  if (!createAction(action) && (!record(args.where) || Object.keys(args.where).length === 0)) rejectIspOrigen()
}
/** Callback gets a revocable facade bound to the exact tx; the original tx has no ambient source authority. */
export async function runWithIspSourceWrite<T>(writer: IspSourceWriter, callback: (writerTx: Prisma.TransactionClient) => T | Promise<T>): Promise<T> {
  const context = txScope.getStore()
  if (!context?.active) rejectIspOrigen()
  return runWithIspSourceWriteTx(writer, context.tx, callback)
}
export async function runWithIspSourceWriteTx<T>(writer: IspSourceWriter, tx: Prisma.TransactionClient, callback: (writerTx: Prisma.TransactionClient) => T | Promise<T>, item?: IspSourceInvoiceItem): Promise<T> {
  if (typeof window !== 'undefined' || !ISP_SOURCE_WRITERS.includes(writer) || sourceScope.getStore()
    || txScope.getStore()?.tx !== tx || !txScope.getStore()?.active || process.env.IO_PRODUCTION_READ_ONLY === '1') rejectIspOrigen()
  if (item && (writer !== 'isp-facturas' || !Number.isSafeInteger(item.facturaISPId) || item.facturaISPId < 1 || typeof item.idExterno !== 'string' || !/^[1-9][0-9]*$/.test(item.idExterno))) rejectIspOrigen()
  const accreditedItem = item ? Object.freeze({ facturaISPId: item.facturaISPId, idExterno: item.idExterno }) : undefined
  await acquireIspOrigenFenceTx(tx)
  const scope: SourceScope = { writer, tx, active: true, ...(accreditedItem ? { item: accreditedItem } : {}) }
  const delegates = new Map<string, unknown>()
  const facade = new Proxy(tx as any, { get(target, property) {
    if (typeof property !== 'string' || property.startsWith('$')) rejectIspOrigen()
    const model = Object.keys(ISP_ORIGEN_CATALOG).find(name => delegateName(name) === property)
    if (!model || !sourceWriterFields(writer, model, true)) rejectIspOrigen()
    if (!delegates.has(property)) delegates.set(property, new Proxy(target[property], { get(delegate, action) {
      if (typeof action !== 'string' || typeof delegate[action] !== 'function') rejectIspOrigen()
      return async (args: unknown) => {
        if (!scope.active || txScope.getStore()?.tx !== tx || !txScope.getStore()?.active) rejectIspOrigen()
        if (MUTATIONS.has(action)) validateSourceData(writer, model, action, args)
        else if (!['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(action)) rejectIspOrigen()
        return invocationScope.run({ capability: scope, model, action }, async () => await delegate[action](args))
      }
    } }))
    return delegates.get(property)
  } }) as Prisma.TransactionClient
  return sourceScope.run(scope, async () => { try { return await callback(facade) } finally { scope.active = false } })
}

export type IspGuardParams = Readonly<{ model?: string | null; action: string; args: any; runInTransaction?: boolean }>
export type IspGuardOptions = Readonly<{
  db: IspOwnershipReadDb
  /** Inject DMMF relationship edges; unknown protected nested forms are rejected, panel nested stays usable. */
  relations?: Readonly<Record<string, Readonly<Record<string, string>>>>
  rawTemplate?: string | null
  rawReadOnly?: boolean
  rawTokens?: readonly Readonly<{ kind: string; value: string }>[] | null
}>
async function requireOwnershipFence(params: IspGuardParams, options: IspGuardOptions): Promise<void> {
  const context = txScope.getStore()
  if (!context?.active || options.db !== context.tx || params.runInTransaction === false) rejectIspOrigen()
  await acquireIspOrigenFenceTx(context.tx)
}
async function validateLegacyInvoice(scope: SourceScope, action: string, args: any, db: IspOwnershipReadDb): Promise<void> {
  const item = scope.item
  if (!item || db !== scope.tx) rejectIspOrigen()
  const source = await readRows(db, 'factura', { id: item.facturaISPId }, {
    id: true, ispGestionId: true, nombreCompleto: true, nifCif: true, numeroDocumento: true, serieFactura: true,
    fecha: true, base: true, totalImpuesto: true, total: true, documento: true,
  })
  if (source.length !== 1 || String(source[0].ispGestionId) !== item.idExterno) rejectIspOrigen()
  const row = source[0], base = Number(row.base), iva = Number(row.totalImpuesto), total = Number(row.total)
  if (![base, iva, total].every(Number.isFinite) || !(row.fecha instanceof Date) || !Number.isFinite(row.fecha.getTime())) rejectIspOrigen()
  const header: Record<string, unknown> = { cliente: row.nombreCompleto, cif: row.nifCif, numFactura: row.numeroDocumento, serie: row.serieFactura,
    fecha: row.fecha, base, tipoIva: base === 0 ? 0 : Number(((iva / base) * 100).toFixed(8)), importeIva: iva, total, concepto: String(row.documento || '') }
  for (const field of ISP_LEGACY_FISCAL_HEADER) {
    const actual = args.data[field], expected = header[field]
    if (field === 'fecha' ? !(actual instanceof Date) || actual.getTime() !== row.fecha.getTime() : actual !== expected) rejectIspOrigen()
  }
  if (createAction(action)) {
    if (args.data.idExterno !== item.idExterno) rejectIspOrigen()
    const collisions = await readRows(db, 'facturaEmitida', { OR: [{ idExterno: item.idExterno }, { facturaISPId: item.facturaISPId }] }, { id: true })
    if (collisions.length) rejectIspOrigen()
  } else {
    if (!record(args.where) || Object.keys(args.where).length !== 1 || typeof args.where.id !== 'string') rejectIspOrigen()
    const existing = await readRows(db, 'facturaEmitida', args.where, { id: true, origenSistema: true, idExterno: true, facturaISPId: true })
    if (existing.length !== 1 || existing[0].origenSistema !== 'ISPGestion' || existing[0].idExterno !== item.idExterno
      || existing[0].facturaISPId != null && existing[0].facturaISPId !== item.facturaISPId) rejectIspOrigen()
    const collisions = await readRows(db, 'facturaEmitida', { facturaISPId: item.facturaISPId }, { id: true })
    if (collisions.some(row => row.id !== existing[0].id)) rejectIspOrigen()
  }
}
/** Candidate read is bounded by one exact normalized document, never a whole-table ownership grant. */
async function contractCandidates(tx: Prisma.TransactionClient, document: string): Promise<any[]> {
  try {
    const rows = await tx.$queryRaw<any[]>`SELECT id, isp_cliente_id AS "ispClienteId", codigo, nombre, nombre_comercial AS "nombreComercial", cif, nif, doc_normalizado AS "docNormalizado"
      FROM area1_isp_clientes
      WHERE doc_normalizado = ${document}
         OR (CASE WHEN length(regexp_replace(upper(coalesce(cif,'')), '[^0-9A-Z]', '', 'g')) = 11 AND regexp_replace(upper(coalesce(cif,'')), '[^0-9A-Z]', '', 'g') LIKE 'ES%'
              THEN right(regexp_replace(upper(coalesce(cif,'')), '[^0-9A-Z]', '', 'g'), 9) ELSE regexp_replace(upper(coalesce(cif,'')), '[^0-9A-Z]', '', 'g') END) = ${document}
         OR (CASE WHEN length(regexp_replace(upper(coalesce(nif,'')), '[^0-9A-Z]', '', 'g')) = 11 AND regexp_replace(upper(coalesce(nif,'')), '[^0-9A-Z]', '', 'g') LIKE 'ES%'
              THEN right(regexp_replace(upper(coalesce(nif,'')), '[^0-9A-Z]', '', 'g'), 9) ELSE regexp_replace(upper(coalesce(nif,'')), '[^0-9A-Z]', '', 'g') END) = ${document}
      ORDER BY isp_cliente_id ASC LIMIT 501`
    if (!Array.isArray(rows) || rows.length >= LIMIT) rejectIspOrigen()
    return rows
  } catch { rejectIspOrigen() }
}
async function validateContractAssignment(scope: SourceScope, action: string, args: any, db: IspOwnershipReadDb): Promise<void> {
  const { asignarContrato, indexarClientesPorDoc, normalizarDocumento } = await import('./crm-isp-import-core')
  const branches = action.startsWith('upsert') ? [[true, args.create], [false, args.update]] as const : [[createAction(action), args.data]] as const
  for (const [create, payload] of branches) for (const data of Array.isArray(payload) ? payload : [payload]) {
    const fields = ['ispClienteRowId', 'asignacionCliente', 'candidatosCliente']
    const derived = fields.some(field => field in data)
    if (!derived && !create && !('docNormalizado' in data) && !('clienteNombreFichero' in data)) continue
    if (create && !derived || derived && !fields.every(field => field in data) || !('docNormalizado' in data) || typeof data.clienteNombreFichero !== 'string'
      || data.docNormalizado !== normalizarDocumento(data.docNormalizado)) rejectIspOrigen()
    if (derived && (!Array.isArray(data.candidatosCliente) || data.candidatosCliente.some((v: any) => typeof v !== 'string')
      || new Set(data.candidatosCliente).size !== data.candidatosCliente.length)) rejectIspOrigen()
    const rows = data.docNormalizado ? await contractCandidates(scope.tx, data.docNormalizado) : []
    if (rows.some(row => typeof row.id !== 'string' || !row.id || typeof row.ispClienteId !== 'string' || !row.ispClienteId
      || typeof row.codigo !== 'string' || typeof row.nombre !== 'string') || new Set(rows.map(row => row.ispClienteId)).size !== rows.length) rejectIspOrigen()
    const expected = asignarContrato(data as any, indexarClientesPorDoc(rows as any))
    const selected = expected.ispClienteId ? rows.find(row => row.ispClienteId === expected.ispClienteId) : null
    if (!derived) {
      const current = await readRows(db, 'ispContratoArea1', normalizedWhere(args.where), { id: true, ispClienteRowId: true })
      // An ambiguous/absent partial export may refresh its source header only;
      // it must physically omit, not falsify/clear, the prior derived assignment.
      if (!current.length || selected || current.some(row => row.ispClienteRowId == null)) rejectIspOrigen()
      continue
    }
    if (data.ispClienteRowId !== (selected?.id ?? null) || data.asignacionCliente !== expected.asignacion
      || JSON.stringify([...data.candidatosCliente].sort()) !== JSON.stringify([...expected.candidatos].sort())) rejectIspOrigen()
    if (!create) {
      const current = await readRows(db, 'ispContratoArea1', normalizedWhere(args.where), { id: true, ispClienteRowId: true })
      // A partial export must not erase or replace a source association when it cannot establish an unequivocal candidate.
      if (current.some(row => row.ispClienteRowId != null && row.ispClienteRowId !== data.ispClienteRowId) && !selected) rejectIspOrigen()
    }
  }
}
const associationModels = new Set(['IspVinculoArea1', 'CrmEmpresaCliente'])
const protectedNestedModels = new Set([...Object.keys(ISP_ORIGEN_CATALOG), ...associationModels])
function checkNested(model: string, data: any, relations: IspGuardOptions['relations']): void {
  if (!record(data)) return
  for (const [field, target] of Object.entries(relations?.[model] ?? {})) {
    const envelope = data[field]
    if (envelope == null) continue
    if (!record(envelope)) rejectIspOrigen()
    // Scalar panel nested writes never acquire source authority by sharing a parent.
    if (protectedNestedModels.has(target) || field === 'ispClientesArea1' || field === 'facturaISP') rejectIspOrigen()
    for (const [operation, value] of Object.entries(envelope)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (record(item)) {
          if (['update', 'upsert', 'connectOrCreate', 'updateMany'].includes(operation)) {
            checkNested(target, item.data ?? item.update, relations); checkNested(target, item.create, relations)
          } else if (operation === 'create' || operation === 'createMany') {
            if (operation === 'createMany') for (const row of Array.isArray(item.data) ? item.data : [item.data]) checkNested(target, row, relations)
            else checkNested(target, item, relations)
          } else if (operation === 'delete' || operation === 'deleteMany') {
            // Cascading panel parents may hide protected descendants: no generic nested delete.
            if (Object.values(relations?.[target] ?? {}).some(m => protectedNestedModels.has(m))) rejectIspOrigen()
          }
        }
      }
    }
  }
}
async function clienteOrigin(db: IspOwnershipReadDb, row: any): Promise<'manual' | 'source' | 'unknown'> {
  const evidence = [{ clienteWebId: row.id }]
  if (typeof row.ispGestionId === 'string' && row.ispGestionId) (evidence as any[]).push({ ispClienteId: row.ispGestionId })
  const area = await readRows(db, 'ispClienteArea1', { OR: evidence }, { id: true })
  return persistedClienteOrigin(row, area.length > 0)
}
async function sourceLinkedCliente(db: IspOwnershipReadDb, clienteId: number): Promise<boolean> {
  const rows = await readRows(db, 'clienteWeb', { id: clienteId }, clienteSelect)
  if (rows.length !== 1) rejectIspOrigen()
  const origin = await clienteOrigin(db, rows[0]); if (origin === 'unknown') rejectIspOrigen()
  return origin === 'source'
}
async function checkAssociation(model: string, action: string, args: any, db: IspOwnershipReadDb): Promise<void> {
  if (model === 'IspVinculoArea1') {
    if (createAction(action)) {
      const rows = Array.isArray(args.data) ? args.data : [args.data]
      if (rows.some((row: any) => !record(row) || row.estado === 'CONFIRMADO')) rejectIspOrigen()
      return
    }
    const rows = await readRows(db, 'ispVinculoArea1', normalizedWhere(args.where), { id: true, estado: true })
    if (rows.some(row => row.estado === 'CONFIRMADO')) rejectIspOrigen()
    if (args.data?.estado === 'CONFIRMADO' && (!rows.length || rows.some(row => row.estado !== 'PENDIENTE'))) rejectIspOrigen()
    // Confirming is additive; demoting/reassigning confirmed evidence was checked above.
    return
  }
  if (createAction(action)) return // explicit association delegate validates destination/auth; no source authority
  const rows = await readRows(db, 'crmEmpresaCliente', normalizedWhere(args.where), { empresaId: true, clienteId: true })
  const touchesKey = deleteAction(action) || action.startsWith('upsert') || Object.keys(args.data ?? {}).some(field => ['empresaId', 'clienteId'].includes(field))
  if (touchesKey) {
    const affected = rows
    for (const row of affected) if (await sourceLinkedCliente(db, row.clienteId)) {
      // A key reassignment is not an unlink command. Remove only inside a live tx,
      // and only if independent source evidence will remain after this entire batch.
      if (!deleteAction(action) || !txScope.getStore()?.active) rejectIspOrigen()
      const direct = await readRows(db, 'ispClienteArea1', { crmEmpresaId: row.empresaId }, { id: true })
      if (direct.length) continue
      const links = await readRows(db, 'crmEmpresaCliente', { empresaId: row.empresaId }, { empresaId: true, clienteId: true })
      let remaining = false
      for (const link of links) {
        if (affected.some(deleting => deleting.empresaId === link.empresaId && deleting.clienteId === link.clienteId)) continue
        if (await sourceLinkedCliente(db, link.clienteId)) remaining = true
      }
      if (!remaining) rejectIspOrigen()
    }
  }
}
function guardRaw(options: IspGuardOptions, inSource: boolean): void {
  if (options.rawReadOnly) return
  const tokens = options.rawTokens
  // No source DML raw registry exists: a loader cannot spend its capability on raw/panel SQL.
  if (inSource || !tokens?.length) rejectIspOrigen()
  const values = tokens.map(t => t.kind === 'quoted' ? t.value.slice(1, -1).replace(/""/g, '"').toLowerCase() : t.value.toLowerCase())
  const sourceTables = new Set([...Object.values(ISP_ORIGEN_CATALOG).map(c => c.table), 'crm_empresa_clientes', 'area1_isp_vinculos'])
  const rowLock = (i: number) => tokens[i]?.kind === 'ident' && values[i] === 'update'
    && (values[i - 1] === 'for' || values[i - 3] === 'for' && values[i - 2] === 'no' && values[i - 1] === 'key')
  const dml = (i: number) => tokens[i]?.kind === 'ident' && ['insert', 'update', 'delete', 'merge', 'truncate', 'alter', 'drop'].includes(values[i]) && values[i - 1] !== '.' && !rowLock(i)
  const hasDml = values.some((_, i) => dml(i))
  // DDL/multiple-target grammars are not a reviewed source or panel template.
  if (hasDml && values.some(value => ['truncate', 'alter', 'drop'].includes(value))) rejectIspOrigen()
  if (!hasDml) {
    // Preserve existing SELECTs, locks, session read-only setting and read helper calls unchanged.
    if (values[0] === 'select' || values[0] === 'with' || values.join(' ') === 'set transaction read only') return
    rejectIspOrigen()
  }
  // Collect every syntactic DML target, including modifying CTEs, schema qualification and ONLY.
  let targets = 0
  for (let i = 0; i < values.length; i++) {
    if (!dml(i)) continue
    // ON CONFLICT DO UPDATE has no new target; inherits INSERT target already examined.
    if (values[i] === 'update' && values[i - 1] === 'do') continue
    let cursor = i + 1
    if (['insert', 'merge'].includes(values[i])) { if (values[cursor] !== 'into') rejectIspOrigen(); cursor++ }
    if (values[i] === 'delete') { if (values[cursor] !== 'from') rejectIspOrigen(); cursor++ }
    if (['table', 'only'].includes(values[cursor])) cursor++
    if (!['ident', 'quoted'].includes(tokens[cursor]?.kind)) rejectIspOrigen()
    let table = values[cursor]
    if (values[cursor + 1] === '.') { cursor += 2; if (!['ident', 'quoted'].includes(tokens[cursor]?.kind)) rejectIspOrigen(); table = values[cursor] }
    // FK SetNull/cascade operates without another Prisma delegate event.
    // Contact/person fields remain panel, but an opaque raw delete/PK rewrite
    // cannot prove absence of source evidence and must use the checked ORM.
    if (table === 'crm_registros_hubspot' && (values[i] === 'delete' || values[i] === 'merge')) rejectIspOrigen()
    if (table === 'crm_registros_hubspot' && values[i] === 'update') {
      const set = values.indexOf('set', cursor + 1)
      const end = values.indexOf('where', set + 1)
      for (let p = set + 1; p < (end < 0 ? values.length : end); p++) if (values[p] === 'id' && values[p + 1] === '=') rejectIspOrigen()
    }
    if (sourceTables.has(table)) {
      // Exact narrow financial panel UPDATEs retain their semantics; no header/source permission.
      if (values[i] === 'update' && (table === 'facturas_emitidas' || table === 'facturas')) {
        let p = cursor + 1
        if (values[p] === 'as') { p += 2 } else if (values[p] !== 'set') p++
        if (values[p] !== 'set') rejectIspOrigen()
        p++
        const allowed = table === 'facturas' ? new Set(['remesa_id', 'updated_at']) : new Set(['estado', 'importe_cobrado', 'fecha_cobro', 'imputacion', 'forma_cobro', 'remesa_ref', 'proyecto_singular_id', 'factura_isp_id', 'updated_at'])
        let depth = 0; let expectColumn = true; let columns = 0
        for (; p < values.length && !(depth === 0 && ['where', 'returning'].includes(values[p])); p++) {
          if (expectColumn) { if (!allowed.has(values[p]) || values[p + 1] !== '=') rejectIspOrigen(); columns++; expectColumn = false; p++; continue }
          if (values[p] === '(') depth++
          if (values[p] === ')') { depth--; if (depth < 0) rejectIspOrigen() }
          if (depth === 0 && values[p] === ',') expectColumn = true
          if (['select', 'insert', 'update', 'delete', 'merge', 'from'].includes(values[p]) || values[p] === ';') rejectIspOrigen()
          // Values/CASE/operators are permitted, calls only a fixed pure scalar subset.
          if (values[p + 1] === '(' && tokens[p]?.kind === 'ident' && !['coalesce', 'nullif', 'greatest', 'least', 'round', 'cast', 'now', 'clock_timestamp', 'in'].includes(values[p])) rejectIspOrigen()
        }
        if (!columns || expectColumn || depth !== 0) rejectIspOrigen()
      } else rejectIspOrigen()
    }
    targets++
  }
  if (!targets) rejectIspOrigen()
}

/** Called by the actual singleton $use before impersonation/audit bypasses. */
export async function guardPrismaIspOrigenMutation<T>(params: IspGuardParams, next: () => Promise<T>, options: IspGuardOptions): Promise<T> {
  const scope = sourceScope.getStore()
  if (RAW.has(params.action)) { guardRaw(options, !!scope); return next() }
  if (!MUTATIONS.has(params.action)) return next()
  const model = params.model
  if (!model || !record(params.args)) rejectIspOrigen()
  const args = params.args
  if (scope) {
    const invocation = invocationScope.getStore()
    if (!scope.active || txScope.getStore()?.tx !== scope.tx || !txScope.getStore()?.active || options.db !== scope.tx || !invocation || invocation.capability !== scope || invocation.model !== model || invocation.action !== params.action || params.runInTransaction === false) rejectIspOrigen()
    validateSourceData(scope.writer, model, params.action, args)
    if (scope.writer === 'crm-xlsx' && model === 'IspContratoArea1') await validateContractAssignment(scope, params.action, args, options.db)
    if (scope.writer === 'isp-facturas' && model === 'FacturaEmitida') await validateLegacyInvoice(scope, params.action, args, options.db)
    if (model === 'ClienteWeb' && !createAction(params.action)) {
      const rows = await readRows(options.db, 'clienteWeb', args.where, clienteSelect)
      for (const row of rows) if (await clienteOrigin(options.db, row) !== 'source') rejectIspOrigen()
    }
    if (scope.writer === 'finance-p2' && model === 'FacturaEmitida' && createAction(params.action)) {
      const source = await readRows(options.db, 'factura', { id: args.data.facturaISPId }, { id: true, ispGestionId: true })
      if (source.length !== 1 || String(source[0].ispGestionId) !== args.data.idExterno) rejectIspOrigen()
    }
    // A detached continuation may lose authority while the ownership SELECT is
    // awaiting. Recheck immediately before next(), not just on facade entry.
    if (!scope.active || !txScope.getStore()?.active || txScope.getStore()?.tx !== scope.tx) rejectIspOrigen()
    return next()
  }
  const dataBranches = params.action.startsWith('upsert') ? [args.create, args.update] : [args.data]
  for (const payload of dataBranches) for (const data of Array.isArray(payload) ? payload : [payload]) checkNested(model, data, options.relations)
  if (associationModels.has(model)) { await requireOwnershipFence(params, options); await checkAssociation(model, params.action, args, options.db); return next() }
  const catalogue = ISP_ORIGEN_CATALOG[model as IspPolicyModel]
  if (!catalogue) {
    if (model === 'CrmRegistroHubspot' && !deleteAction(params.action) && record(args.data) && 'id' in args.data) rejectIspOrigen()
    if (deleteAction(params.action) && model === 'CrmRegistroHubspot') {
      await requireOwnershipFence(params, options)
      const contacts = await readRows(options.db, 'crmRegistroHubspot', args.where, { id: true })
      for (const row of contacts) if ((await readRows(options.db, 'ispClienteArea1', { crmContactoId: row.id }, { id: true })).length) rejectIspOrigen()
    }
    return next()
  }
  if (['IspContratoArea1', 'IspFacturacionMensualArea1', 'ContratoServicio', 'Remesa'].includes(model)) rejectIspOrigen()
  if (model === 'IspClienteArea1') {
    // Source writes never allowed ambiently. Only additive links and consent decisions are panel operations.
    if (deleteAction(params.action) || createAction(params.action) || params.action.startsWith('upsert')) rejectIspOrigen()
    if (!record(args.data) || Object.keys(args.data).some(field => !(field in catalogue.panelFields) && !(field in catalogue.mixedFields))) rejectIspOrigen()
    if (!Object.keys(args.data).some(field => field in catalogue.panelFields)) return next()
    await requireOwnershipFence(params, options)
    const rows = await readRows(options.db, 'ispClienteArea1', args.where, areaSelect)
    for (const row of rows) for (const field of Object.keys(catalogue.panelFields)) if (field in args.data) {
      const value = args.data[field]
      if (record(value) || (row[field] != null && value !== row[field])) rejectIspOrigen()
    }
    return next()
  }
  if (model === 'Factura') {
    if (deleteAction(params.action) || createAction(params.action) || params.action.startsWith('upsert') || !record(args.data) || Object.keys(args.data).some(field => !(field in catalogue.panelFields))) rejectIspOrigen()
    return next()
  }
  if (model === 'ClienteWeb') {
    if (createAction(params.action) || params.action.startsWith('upsert')) {
      for (const data of Array.isArray(args.data ?? args.create) ? args.data ?? args.create : [args.data ?? args.create]) {
        if (!record(data) || data.id !== undefined || persistedClienteOrigin({ ...data, id: 1 }) !== 'manual') rejectIspOrigen()
      }
      if (!params.action.startsWith('upsert')) return next()
    }
    const data = params.action.startsWith('upsert') ? args.update : args.data
    if (!deleteAction(params.action) && record(data) && Object.keys(data).every(field => field in catalogue.panelFields)) return next()
    await requireOwnershipFence(params, options)
    const rows = await readRows(options.db, 'clienteWeb', args.where, clienteSelect)
    for (const row of rows) {
      if (await clienteOrigin(options.db, row) !== 'manual') rejectIspOrigen()
      if (record(data) && ['id', 'ispGestionId', 'clienteIdIsp'].some(field => field in data)) rejectIspOrigen()
    }
    return next()
  }
  if (model === 'CrmEmpresa') {
    if (createAction(params.action)) return next()
    const data = params.action.startsWith('upsert') ? args.update : args.data
    if (!deleteAction(params.action) && (!record(data) || !ISP_CRM_ALIASES.some(field => field in data) && !('id' in data))) return next()
    await requireOwnershipFence(params, options)
    const rows = await readRows(options.db, 'crmEmpresa', args.where, { id: true, nombre: true, nif: true, nifNormalizado: true })
    const linked = []
    for (const row of rows) if ((await readIspEmpresaOwnership(options.db, row.id)).linked) linked.push(row)
    if (linked.length) {
      if (deleteAction(params.action) || !record(data)) rejectIspOrigen()
      // Equality is safe only if the protected write is physically omitted for
      // the whole reached set. No normalization/null coercion or partial stripping.
      for (const field of ISP_CRM_ALIASES) if (field in data) {
        if (rows.some(row => row[field] !== data[field])) rejectIspOrigen()
        delete data[field]
      }
    }
    if (record(data) && 'id' in data) rejectIspOrigen()
    return next()
  }
  if (model === 'FacturaEmitida') {
    const payload = params.action.startsWith('upsert') ? args.create : args.data
    if (createAction(params.action) || params.action.startsWith('upsert')) {
      for (const data of Array.isArray(payload) ? payload : [payload]) if (!record(data) || isIspMirror(data)) rejectIspOrigen()
      if (!params.action.startsWith('upsert')) return next()
    }
    const data = params.action.startsWith('upsert') ? args.update : args.data
    // Identity provenance cannot be asserted by a manual header writer. B7 FK-only additive relation stays independent.
    if (record(data) && ['origenSistema', 'idExterno', 'id'].some(field => field in data)) rejectIspOrigen()
    if (!deleteAction(params.action) && record(data) && Object.keys(data).every(field => field in catalogue.panelFields)) return next()
    const rows = await readRows(options.db, 'facturaEmitida', args.where, { id: true, origenSistema: true, idExterno: true, facturaISPId: true })
    if (rows.some(isIspMirror)) rejectIspOrigen()
    return next()
  }
  rejectIspOrigen()
}
