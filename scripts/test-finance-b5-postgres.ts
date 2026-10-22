import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { B5ServiceError, patchGestionPendienteB5, readContadoresPendientesB5, readPendientesB5 } from '../lib/finanzas/pending-db'
import { PendingDocumentServiceError, createPendingDocument } from '../lib/finanzas/pending-document-upload'
import { cardFromBankText } from '../lib/finanzas/card-holders'
import { validarPatchGestionB5 } from '../lib/finanzas/pending-core'
import { validatePendingDocument, type PendingDocumentInput } from '../lib/finanzas/pending-document-helper'
import { createDocumentoB4, confirmarB4 } from '../lib/finanzas/reconciliation-db'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'

/**
 * B5 real PostgreSQL integration test. Every fixture and every B5/B4 write is
 * contained in one outer SERIALIZABLE transaction that always ends in rollback.
 * It must only run against the explicitly isolated Finanzas staging database:
 * FINANCE_STAGING_SANDBOX=1 B5_ROLLBACK_TEST=1 npx tsx scripts/test-finance-b5-postgres.ts
 */
const TAG = `B5-ROLLBACK-${randomUUID()}`
const IBAN = `ES00${TAG.replaceAll('-', '')}`
const PDF = Buffer.from(`%PDF-1.4\n${TAG}\n%%EOF\n`, 'utf8')
const JANUARY_START = new Date('2042-01-01T00:00:00.000Z')
const JANUARY_END = new Date('2042-01-31T00:00:00.000Z')
const CUT = new Date('2042-01-05T00:00:00.000Z')
type Tx = any
type Snapshot = Record<string, unknown>

class RollbackSentinel extends Error { constructor() { super('B5_ROLLBACK_ONLY') } }
function equal<T>(actual: T, expected: T, message?: string): asserts actual is T { assert.equal(actual, expected, message) }
function day(n: number, minute = 0) { return new Date(Date.UTC(2042, 0, n, 9, minute, 0)) }

function actorPrivate(): number {
  // Private actor ID is never logged or returned by this script.
  const id = Number(readFileSync('/home/ubuntu/finanzas-b4-20261022/actor-private', 'utf8').trim())
  assert(Number.isSafeInteger(id) && id > 0, 'Actor privado inválido')
  return id
}

/** Counts/hashes only: no values from pre-existing financial rows are emitted. */
async function snapshot(): Promise<Snapshot> {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Snapshot }>>`
    SELECT jsonb_object_agg(nombre,jsonb_build_object('count',cantidad,'hash',huella)) AS snapshot FROM (
      SELECT 'cuentas_bancarias' nombre,count(*)::text cantidad,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) huella FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos_bancarios',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM movimientos_bancarios t
      UNION ALL SELECT 'facturas_recibidas',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM facturas_recibidas t
      UNION ALL SELECT 'facturas_emitidas',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM facturas_emitidas t
      UNION ALL SELECT 'gastos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM gastos t
      UNION ALL SELECT 'documentos_conciliables',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM documentos_conciliables t
      UNION ALL SELECT 'estado_justificacion_movimientos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id::text),'')) FROM estado_justificacion_movimientos t
      UNION ALL SELECT 'vinculos_movimiento_documento',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM vinculos_movimiento_documento t
      UNION ALL SELECT 'operaciones_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_justificacion_b4 t
      UNION ALL SELECT 'eventos_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM eventos_justificacion_b4 t
      UNION ALL SELECT 'gestiones_pendientes_movimiento_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM gestiones_pendientes_movimiento_b5 t
      UNION ALL SELECT 'auditorias_gestiones_pendientes_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM auditorias_gestiones_pendientes_b5 t
      UNION ALL SELECT 'adjuntos_pendientes_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM adjuntos_pendientes_b5 t
      UNION ALL SELECT 'tarjetas_financieras_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.last4::text),'')) FROM tarjetas_financieras_b5 t
      UNION ALL SELECT 'usuarios_admin',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM usuarios_admin t
    ) x
  `
  equal(rows.length, 1, 'Snapshot B5 no disponible')
  return rows[0].snapshot
}

async function fixtureCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT (
      (SELECT count(*) FROM cuentas_bancarias WHERE iban=${IBAN})+
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM facturas_recibidas WHERE num_factura LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM gastos WHERE concepto LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM documentos_conciliables d LEFT JOIN facturas_recibidas f ON f.id=d.factura_recibida_id LEFT JOIN gastos g ON g.id=d.gasto_id WHERE f.num_factura LIKE ${`${TAG}%`} OR g.concepto LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM estado_justificacion_movimientos e JOIN movimientos_bancarios m ON m.id=e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM vinculos_movimiento_documento v JOIN movimientos_bancarios m ON m.id=v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM operaciones_justificacion_b4 o JOIN movimientos_bancarios m ON m.id=o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM eventos_justificacion_b4 e JOIN movimientos_bancarios m ON m.id=e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM gestiones_pendientes_movimiento_b5 g JOIN movimientos_bancarios m ON m.id=g.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM auditorias_gestiones_pendientes_b5 a JOIN movimientos_bancarios m ON m.id=a.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM adjuntos_pendientes_b5 a JOIN movimientos_bancarios m ON m.id=a.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})+
      (SELECT count(*) FROM usuarios_admin WHERE email=${`${TAG.toLowerCase()}@example.invalid`})
    )::bigint AS count
  `
  return Number(rows[0]?.count ?? 0)
}

async function expectService(code: string, status: number, action: () => Promise<unknown>) {
  try { await action() } catch (error: any) {
    assert(error instanceof B5ServiceError || error instanceof PendingDocumentServiceError, `Se esperaba servicio B5: ${code}`)
    equal(error.status, status, `Estado de ${code}`)
    equal(error.code, code, `Código de ${code}`)
    return
  }
  assert.fail(`Debía fallar: ${code}`)
}

async function sqlBlocked(tx: Tx, name: string, action: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`SAVEPOINT ${name}`)
  let rejected = false
  try { await action() } catch { rejected = true; await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`) }
  assert(rejected, `La guarda SQL debía bloquear ${name}`)
}

async function b5Counts(tx: Tx) {
  return {
    gestion: await tx.gestionPendienteMovimientoB5.count(), audit: await tx.auditoriaGestionPendienteB5.count(),
    adjunto: await tx.adjuntoPendienteB5.count(), gasto: await tx.gasto.count(), documento: await tx.documentoConciliable.count(),
    estadoB4: await tx.estadoJustificacionMovimientoB4.count(), vinculoB4: await tx.vinculoMovimientoDocumento.count(),
  }
}

function legacy(row: any) {
  return {
    importe: row.importe, fechaOperacion: row.fechaOperacion?.toISOString(), fechaValor: row.fechaValor?.toISOString(),
    concepto: row.concepto, referencia: row.referencia, infoAdicional: row.infoAdicional, tercero: row.tercero,
    conciliado: row.conciliado, facturaId: row.facturaId, facturaEmitidaId: row.facturaEmitidaId, gastoId: row.gastoId,
    tipoDocumento: row.tipoDocumento, documentoRecibido: row.documentoRecibido,
  }
}

function input(args: {
  movimientoId: string; versionGestion: number; tipoDocumento: 'SOPORTE' | 'TICKET'; idempotencyKey?: string
  fechaDocumento?: string; importeDocumento?: string; concepto?: string
}): PendingDocumentInput {
  return validatePendingDocument({
    fields: {
      movimientoId: args.movimientoId, versionGestion: String(args.versionGestion), tipoDocumento: args.tipoDocumento,
      fechaDocumento: args.fechaDocumento ?? '', importeDocumento: args.importeDocumento ?? '',
      nombreProveedor: `${TAG}-TERCERO-PROVEEDOR`, concepto: args.concepto ?? `${TAG}-CONCEPTO-${args.tipoDocumento}`,
      confirmacionDocumento: 'true', idempotencyKey: args.idempotencyKey ?? randomUUID(),
    }, file: { mimeType: 'application/pdf', bytes: PDF },
  })
}

/**
 * Services import the Prisma singleton. Route its inner transaction, singleton
 * raw SELECTs, account coverage delegate and reservation pre-read to our outer
 * transaction. Global permission reads remain read-only and are not patched.
 */
async function routed<T>(tx: Tx, work: () => Promise<T>): Promise<T> {
  const p = prisma as any
  const saved = { transaction: p.$transaction, queryRaw: p.$queryRaw, account: p.cuentaBancaria, adjunto: p.adjuntoPendienteB5 }
  p.$transaction = async (callback: (serviceTx: Tx) => Promise<unknown>) => callback(tx)
  p.$queryRaw = tx.$queryRaw.bind(tx)
  p.cuentaBancaria = tx.cuentaBancaria
  p.adjuntoPendienteB5 = tx.adjuntoPendienteB5
  try { return await work() } finally {
    p.$transaction = saved.transaction
    p.$queryRaw = saved.queryRaw
    p.cuentaBancaria = saved.account
    p.adjuntoPendienteB5 = saved.adjunto
  }
}

async function run() {
  if (process.env.B5_ROLLBACK_TEST !== '1') throw new Error('B5_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('FINANCE_STAGING_SANDBOX=1 es obligatorio')
  const identity = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`SELECT current_database() db,current_user usuario`
  equal(identity[0]?.db, 'io_staging_finanzas', 'Sólo io_staging_finanzas')
  equal(identity[0]?.usuario, 'io_staging_finanzas', 'Sólo rol aislado')

  const actorId = actorPrivate()
  const actor = await prisma.usuarioAdmin.findUnique({ where: { id: actorId }, select: { activo: true } })
  assert(actor?.activo, 'Actor privado inactivo o inexistente')
  assert((await requireB4ActorAccess(actorId, 'escritura')).ok, 'Actor privado sin escritura B4')

  // Pure regressions: bare invoice digits are not cards; B4 terminal states are not editable B5 states.
  equal(cardFromBankText(`${TAG}-FACTURA-FR9029/1`), null)
  equal(cardFromBankText(`${TAG}-TARJETA *9029`)?.terminacion, '9029')
  equal(validarPatchGestionB5({ movimientoId: 'x', version: 1, responsableAdminId: null, estado: 'VINCULADO', nota: null }).ok, false)
  equal(validarPatchGestionB5({ movimientoId: 'x', version: 1, responsableAdminId: null, estado: 'NO_REQUIERE', nota: null }).ok, false)

  const before = await snapshot()
  equal(await fixtureCount(), 0, 'Colisión de marcador B5')
  const realTransaction = (prisma as any).$transaction.bind(prisma)
  let sentinel = false
  let cases = 0

  try {
    await realTransaction(async (tx: Tx) => routed(tx, async () => {
      const account = await tx.cuentaBancaria.create({
        data: { id: randomUUID(), banco: `${TAG}-BANCO`, iban: IBAN, alias: `${TAG}-CUENTA-ACTIVA`, activa: true, fechaCorteExtracto: CUT },
        select: { id: true },
      })
      let sequence = 0
      const movement = async (label: string, amount: number, opts: { day?: number; card?: boolean; bare?: boolean } = {}) => {
        const id = randomUUID(); sequence += 1
        await tx.movimientoBancario.create({ data: {
          id, cuentaId: account.id, fechaOperacion: day(opts.day ?? 4, sequence), fechaValor: day(opts.day ?? 4, sequence),
          concepto: opts.card ? `${TAG}-${label} TARJETA *9029` : opts.bare ? `${TAG}-${label} FACTURA FR9029/1` : `${TAG}-${label}`,
          importe: amount, hashUnico: `${TAG}-${label}-${randomUUID()}`, referencia: `${TAG}-REF-${label}`,
          infoAdicional: `${TAG}-METADATA-${label}`, tercero: `${TAG}-TERCERO-PROVEEDOR`,
        } })
        return id
      }
      const invoice = async (label: string, total: number, calidad: 'VALIDA' | 'COPIA' | 'REVISAR_LECTURA' = 'VALIDA', copiaDeId: string | null = null) => {
        const id = randomUUID(); sequence += 1
        await tx.facturaRecibida.create({ data: {
          id, proveedor: `${TAG}-PROVEEDOR-${label}`, cif: `${TAG}-CIF-${label}`, numFactura: `${TAG}-${label}-${randomUUID()}`,
          fecha: day(3, sequence), base: total, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total,
          concepto: `${TAG}-FACTURA-${label}`, estado: 'PENDIENTE_REVISION', calidad, copiaDeId, fechaProvenancia: 'DOCUMENTO', deducibleIva: true,
        } })
        return id
      }

      // One historical Jan-2042 active source with B3 cut on Jan-05 and explicit masked-card/provider metadata.
      const cardMovement = await movement('CARGO-CARD', -50, { card: true })
      const bareMovement = await movement('BARE-9029', -7, { bare: true })
      const managementMovement = await movement('GESTION', -9)
      const inactiveMovement = await movement('RESPONSABLE-INACTIVO', -9)
      const supportMovement = await movement('SOPORTE', -8)
      const ticketMovement = await movement('TICKET-CARGO', -50, { day: 10 })
      const incomingMovement = await movement('TICKET-ABONO', 50)
      const failedMovement = await movement('STORE-FALLO', -11)
      const noRequireMovement = await movement('NO-REQUIERE', 0)
      const guardMovement = await movement('SQL-GUARDA', -1)
      const inactive = await tx.usuarioAdmin.create({ data: {
        email: `${TAG.toLowerCase()}@example.invalid`, passwordHash: '$2b$12$C6UzMDM.H6dfI/f/IKcEe.7D.a1yBhhltWlHOCyHkwFeMmfOQ2LRK',
        nombre: `${TAG}-INACTIVO`, rol: 'VISOR', roles: [], activo: false,
      }, select: { id: true } })

      // 1. GET projection is virtual: default PENDIENTE/version 1 with no DML, and card SQL rejects bare invoice 9029.
      const readBefore = await b5Counts(tx)
      const cardRead: any = await readPendientesB5({ vista: 'CARGOS_SIN_DOCUMENTO', cuentaId: account.id, tarjeta: '9029', cobertura: 'CUBIERTA', desde: JANUARY_START, hasta: JANUARY_END, limit: 10 })
      equal(cardRead.items.length, 1)
      equal(cardRead.items[0].id, cardMovement)
      equal(cardRead.items[0].gestion.estadoManual, 'PENDIENTE')
      equal(cardRead.items[0].gestion.version, 1)
      equal(cardRead.items[0].tarjeta.terminacion, '9029')
      equal(cardRead.coberturaCuentas.cuentas[0].fechaCorteExtracto, '2042-01-05')
      assert.deepEqual(await b5Counts(tx), readBefore)
      const bareRead: any = await readPendientesB5({ vista: 'CARGOS_SIN_DOCUMENTO', cuentaId: account.id, q: 'FR9029/1', limit: 10 })
      equal(bareRead.items[0]?.tarjeta, null)
      equal(bareRead.items[0]?.id, bareMovement)
      cases += 1

      // 2. PATCH is explicit actor assignment and exact optimistic version/audit behavior; terminal B4 names are 400, stale is 409.
      const patch = { movimientoId: managementMovement, version: 1, responsableAdminId: actorId, estado: 'PEDIDO', nota: `${TAG}-PEDIDO` }
      await expectService('VALIDATION_ERROR', 400, () => patchGestionPendienteB5(actorId, { ...patch, estado: 'VINCULADO' }))
      await expectService('VALIDATION_ERROR', 400, () => patchGestionPendienteB5(actorId, { ...patch, estado: 'NO_REQUIERE' }))
      const patched: any = await patchGestionPendienteB5(actorId, patch)
      assert.deepEqual(patched.gestion, { ...patch, version: 2 })
      const audit = await tx.auditoriaGestionPendienteB5.findFirst({ where: { movimientoId: managementMovement } })
      assert(audit, 'PATCH debe auditar')
      equal(await tx.auditoriaGestionPendienteB5.count({ where: { movimientoId: managementMovement } }), 1)
      assert.deepEqual(audit.snapshotAnterior, { responsableAdminId: null, estado: 'PENDIENTE', nota: null, version: 1 })
      assert.deepEqual(audit.snapshotResultado, { responsableAdminId: actorId, estado: 'PEDIDO', nota: `${TAG}-PEDIDO`, version: 2 })
      await expectService('VERSION_CONFLICT', 409, () => patchGestionPendienteB5(actorId, patch))
      await expectService('RESPONSABLE_NO_ACTIVO', 422, () => patchGestionPendienteB5(actorId, { movimientoId: inactiveMovement, version: 1, responsableAdminId: inactive.id, estado: 'PEDIDO', nota: `${TAG}-INACTIVO` }))
      cases += 1

      // 3. Actual B4 partial confirmation drives the B5 signed invoice remaining amount; copied/quarantined FRs are excluded and a credit remains positive.
      const partialInvoice = await invoice('PARCIAL-100', 100)
      const partialDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'FACTURA_RECIBIDA', sourceId: partialInvoice })
      equal(partialDoc.documento.importeObjetivoCentimos, -10000)
      await confirmarB4(actorId, { action: 'confirmar', confirmacion: true, idempotencyKey: randomUUID(), version: 1, borrador: {
        movimientoId: cardMovement, importeMovimientoCentimos: -5000, estado: 'JUSTIFICADO',
        lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: partialDoc.documento.id, importeCentimos: -5000 }],
      } })
      const creditInvoice = await invoice('CREDITO-NEGATIVO', -25)
      await tx.documentoConciliable.create({ data: { id: randomUUID(), tipo: 'FACTURA_RECIBIDA', facturaRecibidaId: creditInvoice, importeObjetivoCentimos: 2500, activo: true } })
      const copied = await invoice('COPIA-EXCLUIDA', 10, 'COPIA', partialInvoice)
      const quarantined = await invoice('CUARENTENA-EXCLUIDA', 10, 'REVISAR_LECTURA')
      await tx.documentoConciliable.createMany({ data: [
        { id: randomUUID(), tipo: 'FACTURA_RECIBIDA', facturaRecibidaId: copied, importeObjetivoCentimos: -1000, activo: true },
        { id: randomUUID(), tipo: 'FACTURA_RECIBIDA', facturaRecibidaId: quarantined, importeObjetivoCentimos: -1000, activo: true },
      ] })
      const pendingInvoices: any = await readPendientesB5({ vista: 'FACTURAS_RECIBIDAS_SIN_PAGO', q: TAG, limit: 100 })
      const byId = new Map<string, any>(pendingInvoices.items.map((item: any): [string, any] => [item.id, item]))
      equal(byId.get(partialInvoice)?.importePendienteCentimos, -5000)
      equal(byId.get(creditInvoice)?.importeObjetivoCentimos, 2500)
      equal(byId.get(creditInvoice)?.importePendienteCentimos, 2500)
      assert(!byId.has(copied) && !byId.has(quarantined), 'Copias/cuarentena deben excluirse')
      const counters: any = await readContadoresPendientesB5({ cuentaId: account.id, cobertura: 'CUBIERTA', desde: JANUARY_START, hasta: JANUARY_END })
      equal(counters.contadores.length, 1)
      equal(counters.contadores[0].importeJustificadoCentimos, '5000')
      equal(counters.contadores[0].importeEvaluableCentimos, '14500')
      equal(counters.contadores[0].porcentajeJustificadoBps, 3448)
      cases += 1

      // 4. B4 terminal state blocks PATCH. DDL independently blocks terminal management and retains B5 audits immutable.
      await confirmarB4(actorId, { action: 'confirmar', confirmacion: true, idempotencyKey: randomUUID(), version: 1, borrador: {
        movimientoId: noRequireMovement, importeMovimientoCentimos: 0, estado: 'NO_REQUIERE', motivoNoRequiere: 'MOVIMIENTO_TECNICO_BANCO', lineas: [],
      } })
      await expectService('AUTORIDAD_B4', 409, () => patchGestionPendienteB5(actorId, { movimientoId: noRequireMovement, version: 1, responsableAdminId: null, estado: 'PEDIDO', nota: `${TAG}-B4-BLOQUEADO` }))
      await sqlBlocked(tx, 'b5_invalid_no_req', () => tx.$executeRaw`
        INSERT INTO gestiones_pendientes_movimiento_b5 (id,movimiento_id,responsable_admin_id,nota,estado,version,created_at,updated_at)
        VALUES (CAST(${randomUUID()} AS uuid),${guardMovement},NULL,NULL,'NO_REQUIERE'::"EstadoGestionPendienteB5",1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      `)
      await sqlBlocked(tx, 'b5_audit_update', () => tx.$executeRaw`UPDATE auditorias_gestiones_pendientes_b5 SET snapshot_resultado='{}'::jsonb WHERE id=CAST(${audit.id} AS uuid)`)
      await sqlBlocked(tx, 'b5_audit_delete', () => tx.$executeRaw`DELETE FROM auditorias_gestiones_pendientes_b5 WHERE id=CAST(${audit.id} AS uuid)`)
      cases += 1

      // 5. Unknown SOPORTE creates only evidence + RECIBIDO human audit; no expense/wrapper/link/legacy rewrite. Same request replays before stale-version/provider work.
      const supportBefore = await b5Counts(tx)
      const supportLegacy = legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: supportMovement } }))
      const supportKey = randomUUID()
      const support = input({ movimientoId: supportMovement, versionGestion: 1, tipoDocumento: 'SOPORTE', idempotencyKey: supportKey, fechaDocumento: '', importeDocumento: '', concepto: `${TAG}-SOPORTE-UNKNOWN` })
      equal(support.fechaDocumento, null); equal(support.importeCentimos, null)
      let supportStores = 0
      const store = async () => { supportStores += 1; return { driveId: 'fixture-drive', itemId: `fixture-item-${randomUUID()}`, authenticatedWebUrl: 'https://fixture.sharepoint.com/fixture.pdf' } }
      const createdSupport: any = await createPendingDocument(actorId, support, store as any)
      equal(createdSupport.idempotent, false); equal(createdSupport.gastoId, null); equal(createdSupport.documentoConciliableId, null); equal(supportStores, 1)
      const supportAfter = await b5Counts(tx)
      equal(supportAfter.adjunto, supportBefore.adjunto + 1); equal(supportAfter.gestion, supportBefore.gestion + 1); equal(supportAfter.audit, supportBefore.audit + 1)
      equal(supportAfter.gasto, supportBefore.gasto); equal(supportAfter.documento, supportBefore.documento); equal(supportAfter.estadoB4, supportBefore.estadoB4); equal(supportAfter.vinculoB4, supportBefore.vinculoB4)
      const supportGestion = await tx.gestionPendienteMovimientoB5.findUniqueOrThrow({ where: { movimientoId: supportMovement } })
      equal(supportGestion.estado, 'RECIBIDO'); equal(supportGestion.version, 2)
      assert.deepEqual(legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: supportMovement } })), supportLegacy)
      const replay: any = await createPendingDocument(actorId, support, store as any)
      equal(replay.idempotent, true); equal(replay.idAdjunto, createdSupport.idAdjunto); equal(supportStores, 1)
      await expectService('IDEMPOTENCY_KEY_REUSED', 409, () => createPendingDocument(actorId, input({ movimientoId: supportMovement, versionGestion: 1, tipoDocumento: 'SOPORTE', idempotencyKey: supportKey, concepto: `${TAG}-PAYLOAD-DISTINTO` }), store as any))
      equal(supportStores, 1)
      cases += 1

      // 6. TICKET cost (12.34) intentionally differs from -50 bank source. It creates approved Gasto and signed -1234 wrapper but never a bank link.
      const ticketBefore = await b5Counts(tx)
      const ticketLegacy = legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: ticketMovement } }))
      const ticket = input({ movimientoId: ticketMovement, versionGestion: 1, tipoDocumento: 'TICKET', fechaDocumento: '2042-01-10', importeDocumento: '12.34', concepto: `${TAG}-TICKET-12-34` })
      let ticketStores = 0
      const createdTicket: any = await createPendingDocument(actorId, ticket, async () => { ticketStores += 1; return { driveId: 'fixture-drive', itemId: `fixture-item-${randomUUID()}`, authenticatedWebUrl: 'https://fixture.sharepoint.com/fixture.pdf' } })
      assert(createdTicket.gastoId && createdTicket.documentoConciliableId, 'Ticket sin gasto/wrapper')
      equal(ticketStores, 1)
      const gasto = await tx.gasto.findUniqueOrThrow({ where: { id: createdTicket.gastoId } })
      const ticketDoc = await tx.documentoConciliable.findUniqueOrThrow({ where: { id: createdTicket.documentoConciliableId } })
      equal(gasto.importe, 12.34); equal(gasto.estado, 'APROBADO'); equal(ticketDoc.tipo, 'TICKET'); equal(ticketDoc.importeObjetivoCentimos, -1234)
      equal(await tx.vinculoMovimientoDocumento.count({ where: { movimientoId: ticketMovement } }), 0)
      assert.deepEqual(legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: ticketMovement } })), ticketLegacy)
      const ticketAfter = await b5Counts(tx)
      equal(ticketAfter.adjunto, ticketBefore.adjunto + 1); equal(ticketAfter.gasto, ticketBefore.gasto + 1); equal(ticketAfter.documento, ticketBefore.documento + 1); equal(ticketAfter.gestion, ticketBefore.gestion + 1); equal(ticketAfter.audit, ticketBefore.audit + 1)
      cases += 1

      // 7. Incoming-positive TICKET stops before store/reservation. Mock provider failure after a valid SOPORTE reservation leaves only RESERVADO and all financial/B4/legacy state intact.
      const incomingBefore = await b5Counts(tx); let incomingStores = 0
      await expectService('TICKET_REQUIERE_CARGO', 422, () => createPendingDocument(actorId, input({ movimientoId: incomingMovement, versionGestion: 1, tipoDocumento: 'TICKET', fechaDocumento: '2042-01-04', importeDocumento: '1.00' }), async () => { incomingStores += 1; return { driveId: 'fixture-drive', itemId: `fixture-item-${randomUUID()}`, authenticatedWebUrl: 'https://fixture.sharepoint.com/fixture.pdf' } }))
      equal(incomingStores, 0); assert.deepEqual(await b5Counts(tx), incomingBefore)
      const failedBefore = await b5Counts(tx)
      const failedLegacy = legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: failedMovement } }))
      const failed = input({ movimientoId: failedMovement, versionGestion: 1, tipoDocumento: 'SOPORTE', concepto: `${TAG}-STORE-FALLO` })
      let failedStores = 0; let didFail = false
      try { await createPendingDocument(actorId, failed, async () => { failedStores += 1; throw new Error('fixture-store-failure') }) } catch { didFail = true }
      assert(didFail); equal(failedStores, 1)
      const failedAfter = await b5Counts(tx)
      equal(failedAfter.adjunto, failedBefore.adjunto + 1); equal(failedAfter.gasto, failedBefore.gasto); equal(failedAfter.documento, failedBefore.documento); equal(failedAfter.gestion, failedBefore.gestion); equal(failedAfter.audit, failedBefore.audit); equal(failedAfter.estadoB4, failedBefore.estadoB4); equal(failedAfter.vinculoB4, failedBefore.vinculoB4)
      const reservation = await tx.adjuntoPendienteB5.findUniqueOrThrow({ where: { actorId_idempotencyKey: { actorId, idempotencyKey: failed.idempotencyKey } } })
      equal(reservation.estado, 'RESERVADO')
      assert.deepEqual(legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: failedMovement } })), failedLegacy)
      cases += 1

      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      sentinel = true
      throw new RollbackSentinel()
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 180_000 })
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error
  }

  assert(sentinel, 'No se alcanzó el rollback obligatorio')
  equal(cases, 7, 'Casos B5 incompletos')
  equal(await fixtureCount(), 0, 'El rollback dejó fixtures B5')
  assert.deepEqual(await snapshot(), before, 'Cambió algún dato financiero/B4/B5/Gasto preexistente')
  console.log(`B5 PostgreSQL: ${cases} casos aislados y rollback íntegro verificados.`)
}

run()
  .catch(() => { console.error('La prueba B5 PostgreSQL no se completó; no se ha autorizado ninguna persistencia.'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
