import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  EasyReconciliationServiceError,
  confirmEasyReconciliationTx,
  inspectEasyCandidatesTx,
  mutateEasyRuleTx,
} from '../lib/finanzas/easy-reconciliation-db'
import { createPendingDocument } from '../lib/finanzas/pending-document-upload'
import { validatePendingDocument, type PendingDocumentInput } from '../lib/finanzas/pending-document-helper'
import { deshacerB4Tx } from '../lib/finanzas/reconciliation-db'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'

/**
 * Modo Fácil PostgreSQL integration proof.
 *
 * Execute only through the private staging runner after the proposal-rules DDL:
 * node /home/ubuntu/finanzas-20261022-2012/ejecutar_privado.cjs staging scripts/test-finance-easy-postgres.ts
 *
 * Every fixture, B5 reservation/finalization, B4 operation, receipt, rule and
 * audit is routed to one outer SERIALIZABLE transaction and rolled back. The
 * injected provider is a fake boundary only: no Graph/OneDrive call is made.
 */
const TAG = `MF-ROLLBACK-${randomUUID()}`
const PDF = Buffer.from(`%PDF-1.4\n${TAG}\n%%EOF\n`, 'utf8')
const DAY = (day: number, minute = 0) => new Date(Date.UTC(2044, 0, day, 10, minute, 0))
type Tx = any
class RollbackOnly extends Error { constructor() { super('MODO_FACIL_ROLLBACK_ONLY') } }

function actorId(): number {
  const value = Number(process.env.FINANCE_P1_ACTOR_ID)
  assert(Number.isSafeInteger(value) && value > 0, 'FINANCE_P1_ACTOR_ID debe ser un actor privado válido')
  return value
}
function controlledDrive(): string {
  const primary = process.env.SHAREPOINT_DRIVE_ID?.trim()
  const alias = process.env.DRIVE_ID?.trim()
  assert(primary || alias, 'Se requiere SHAREPOINT_DRIVE_ID o DRIVE_ID para probar evidencia controlada')
  assert(!(primary && alias && primary !== alias), 'La biblioteca financiera configurada es conflictiva')
  const drive = primary || alias!
  assert(/^[A-Za-z0-9!_.~-]{4,220}$/.test(drive), 'La biblioteca financiera configurada no es válida')
  return drive
}
function uuidV4(): string { return randomUUID() }
function legacy(row: any) {
  return {
    importe: row.importe,
    fechaOperacion: row.fechaOperacion?.toISOString(),
    fechaValor: row.fechaValor?.toISOString(),
    concepto: row.concepto,
    referencia: row.referencia,
    infoAdicional: row.infoAdicional,
    tercero: row.tercero,
    conciliado: row.conciliado,
    facturaId: row.facturaId,
    facturaEmitidaId: row.facturaEmitidaId,
    gastoId: row.gastoId,
    tipoDocumento: row.tipoDocumento,
    documentoRecibido: row.documentoRecibido,
  }
}
async function expectEasy(code: string, work: () => Promise<unknown>) {
  try { await work() } catch (error) {
    assert(error instanceof EasyReconciliationServiceError, `Se esperaba EasyReconciliationServiceError para ${code}`)
    assert.equal(error.code, code, `Código esperado ${code}`)
    return
  }
  assert.fail(`Debía fallar con ${code}`)
}
async function rawCount(tx: Tx, table: string): Promise<number> {
  assert(/^[a-z_]+$/.test(table), 'Tabla no permitida')
  const rows = await tx.$queryRawUnsafe(`SELECT count(*)::text AS count FROM "${table}"`) as Array<{ count: string }>
  return Number(rows[0]?.count ?? 0)
}
async function snapshot() {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>`
    SELECT jsonb_object_agg(nombre,jsonb_build_object('count',cantidad,'hash',huella)) AS snapshot FROM (
      SELECT 'cuentas_bancarias' nombre,count(*)::text cantidad,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) huella FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos_bancarios',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM movimientos_bancarios t
      UNION ALL SELECT 'facturas_recibidas',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM facturas_recibidas t
      UNION ALL SELECT 'gastos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM gastos t
      UNION ALL SELECT 'documentos_conciliables',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM documentos_conciliables t
      UNION ALL SELECT 'estado_justificacion_movimientos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id::text),'')) FROM estado_justificacion_movimientos t
      UNION ALL SELECT 'vinculos_movimiento_documento',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM vinculos_movimiento_documento t
      UNION ALL SELECT 'operaciones_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_justificacion_b4 t
      UNION ALL SELECT 'eventos_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM eventos_justificacion_b4 t
      UNION ALL SELECT 'gestiones_pendientes_movimiento_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM gestiones_pendientes_movimiento_b5 t
      UNION ALL SELECT 'auditorias_gestiones_pendientes_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM auditorias_gestiones_pendientes_b5 t
      UNION ALL SELECT 'adjuntos_pendientes_b5',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM adjuntos_pendientes_b5 t
      UNION ALL SELECT 'reglas_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM reglas_modo_facil t
      UNION ALL SELECT 'recibos_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM recibos_modo_facil t
      UNION ALL SELECT 'auditorias_reglas_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM auditorias_reglas_modo_facil t
    ) x
  `
  assert.equal(rows.length, 1, 'No se pudo tomar snapshot')
  return rows[0].snapshot
}
function ticketInput(movimientoId: string, versionGestion = 1): PendingDocumentInput {
  return validatePendingDocument({
    fields: {
      movimientoId,
      versionGestion: String(versionGestion),
      tipoDocumento: 'TICKET',
      fechaDocumento: '2044-01-04',
      importeDocumento: '12.34',
      nombreProveedor: `${TAG}-TICKET-PROVEEDOR`,
      concepto: `${TAG}-TICKET-CONTROLADO`,
      confirmacionDocumento: 'true',
      idempotencyKey: uuidV4(),
    },
    file: { mimeType: 'application/pdf', bytes: PDF },
  })
}

/** Routes all B5 service writes to the caller's outer rollback transaction. B4
 * access/runtime queries remain their normal read-only calls, exactly as they do
 * in service execution; no fake permission or provider is introduced. */
async function routed<T>(tx: Tx, work: () => Promise<T>): Promise<T> {
  const singleton = prisma as any
  const saved = {
    transaction: singleton.$transaction,
    queryRaw: singleton.$queryRaw,
    account: singleton.cuentaBancaria,
    adjunto: singleton.adjuntoPendienteB5,
  }
  singleton.$transaction = async (callback: (serviceTx: Tx) => Promise<unknown>) => callback(tx)
  singleton.$queryRaw = tx.$queryRaw.bind(tx)
  singleton.cuentaBancaria = tx.cuentaBancaria
  singleton.adjuntoPendienteB5 = tx.adjuntoPendienteB5
  try { return await work() } finally {
    singleton.$transaction = saved.transaction
    singleton.$queryRaw = saved.queryRaw
    singleton.cuentaBancaria = saved.account
    singleton.adjuntoPendienteB5 = saved.adjunto
  }
}

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.VERCEL_ENV, 'preview', 'VERCEL_ENV=preview es obligatorio')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'FINANCE_EXTERNAL_ACTIONS_DISABLED=1 es obligatorio')
  const actor = actorId()
  const drive = controlledDrive()
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'Sólo staging aislado')
  const access = await requireB4ActorAccess(actor, 'escritura')
  assert(access.ok, 'El actor privado no conserva escritura B4')
  const tables = await prisma.$queryRaw<Array<{ name: string | null }>>`
    SELECT to_regclass('reglas_modo_facil')::text AS name
    UNION ALL SELECT to_regclass('recibos_modo_facil')::text
    UNION ALL SELECT to_regclass('auditorias_reglas_modo_facil')::text
  `
  assert(tables.every((row) => row.name !== null), 'Aplicar primero la migración proposal-only de Modo Fácil')

  const before = await snapshot()
  let completed = false
  let cases = 0
  try {
    await prisma.$transaction(async (tx: Tx) => routed(tx, async () => {
      const account = await tx.cuentaBancaria.create({
        data: { id: uuidV4(), banco: `${TAG}-BANCO`, iban: `ES00${TAG.replaceAll('-', '').slice(0, 28)}`, alias: `${TAG}-CUENTA`, activa: true, fechaCorteExtracto: DAY(31) },
        select: { id: true },
      })
      let serial = 0
      const movement = async (label: string, amount = -12.34, concept = `${TAG}-PAGO`) => {
        serial += 1
        const id = uuidV4()
        await tx.movimientoBancario.create({ data: {
          id, cuentaId: account.id, fechaOperacion: DAY(5, serial), fechaValor: DAY(5, serial), importe: amount,
          concepto: concept, referencia: `${TAG}-REF-${label}`, infoAdicional: `${TAG}-INFO-${label}`,
          tercero: `${TAG}-PROVEEDOR`, hashUnico: `${TAG}-${label}-${uuidV4()}`,
        } })
        return id
      }
      const invoice = async (label: string, total = 12.34) => {
        serial += 1
        const id = uuidV4()
        await tx.facturaRecibida.create({ data: {
          id, proveedor: `${TAG}-PROVEEDOR`, numFactura: `${TAG}-${label}-${uuidV4()}`, fecha: DAY(4, serial),
          base: total, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total,
          estado: 'PENDIENTE_REVISION', calidad: 'VALIDA', naturalezaDocumento: 'FACTURA_RECIBIDA',
          oneDriveDriveId: drive, oneDriveItemId: `item-${uuidV4().replaceAll('-', '')}`,
        } })
        return id
      }
      const singleCandidate = async (movimientoId: string, expectedRule: string | null = null) => {
        const rows = (await inspectEasyCandidatesTx(tx, movimientoId)).filter(row => row.suggestion.exacta)
        assert.ok(rows.length >= 1, 'El fixture debe producir al menos una sugerencia exacta para elección humana')
        assert.equal(rows[0].reglaAplicadaId, expectedRule, 'La regla sólo debe ser el cue esperado')
        assert.equal(rows[0].suggestion.exacta, true, 'La sugerencia debe ser exacta al céntimo')
        assert.equal(rows[0].suggestion.archivoDisponible, true, 'El cargo debe tener evidencia controlada')
        return rows[0].suggestion
      }

      // 1. GET-equivalent candidate inspection is projection-only; no wrapper is
      // created before the explicit human confirmation.
      const firstMovement = await movement('PRIMERA')
      const firstInvoice = await invoice('PRIMERA')
      const initialDocs = await rawCount(tx, 'documentos_conciliables')
      const firstSuggestion = await singleCandidate(firstMovement)
      assert.equal(firstSuggestion.documentoConciliableId, null, 'El GET no materializa wrapper')
      assert.equal(await rawCount(tx, 'documentos_conciliables'), initialDocs, 'La lectura no escribe')
      const firstLegacy = legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: firstMovement } }))
      const firstPayload = { action: 'confirmar_factura' as const, movimientoId: firstMovement, version: 1, sugerenciaId: firstSuggestion.id, idempotencyKey: uuidV4(), confirmacion: true as const }
      const firstConfirmed: any = await confirmEasyReconciliationTx(tx, actor, firstPayload)
      assert.equal(firstConfirmed.ok, true); assert.equal(firstConfirmed.movimientoId, firstMovement); assert.equal(firstConfirmed.reversible, true)
      const firstState = await tx.estadoJustificacionMovimientoB4.findUniqueOrThrow({ where: { movimientoId: firstMovement } })
      assert.equal(firstState.estado, 'JUSTIFICADO'); assert.equal(firstState.version, 2)
      const firstReceipt = await tx.$queryRaw<Array<{ action: string; suggestion_id: string | null }>>`
        SELECT accion AS action,sugerencia_id AS suggestion_id FROM recibos_modo_facil WHERE operacion_b4_id=CAST(${firstConfirmed.operacionId} AS uuid)
      `
      assert.deepEqual(firstReceipt, [{ action: 'confirmar_factura', suggestion_id: firstSuggestion.id }])
      assert.deepEqual(legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: firstMovement } })), firstLegacy, 'Nunca muta columnas legacy')
      const firstReplay: any = await confirmEasyReconciliationTx(tx, actor, firstPayload)
      assert.deepEqual(firstReplay, firstConfirmed, 'El mismo payload/UUID reintenta exactamente el recibo')
      await expectEasy('IDEMPOTENCY_PAYLOAD_MISMATCH', () => confirmEasyReconciliationTx(tx, actor, { ...firstPayload, sugerenciaId: `mf1_${'f'.repeat(64)}` }))
      cases += 1

      // 2. A source changing after the visible suggestion is stale; the server
      // regenerates candidates and refuses the old stable selection.
      const staleMovement = await movement('STALE')
      const staleInvoice = await invoice('STALE')
      const staleSuggestion = await singleCandidate(staleMovement)
      await tx.facturaRecibida.update({ where: { id: staleInvoice }, data: { total: 12.35, base: 12.35 } })
      await expectEasy('SUGERENCIA_OBSOLETA', () => confirmEasyReconciliationTx(tx, actor, {
        action: 'confirmar_factura', movimientoId: staleMovement, version: 1, sugerenciaId: staleSuggestion.id, idempotencyKey: uuidV4(), confirmacion: true,
      }))
      cases += 1

      // 3. NO_REQUIERE is contextual: the bank wording must prove the closed
      // reason; fiscal/payroll/financing/purchase families remain blocked even
      // when no legacy FK exists and even if commission wording appears.
      const commissionMovement = await movement('COMISION', -0.01, `${TAG} COMISION BANCARIA DE MANTENIMIENTO`)
      const commission: any = await confirmEasyReconciliationTx(tx, actor, {
        action: 'no_requiere', movimientoId: commissionMovement, version: 1, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: uuidV4(), confirmacion: true,
      })
      assert.equal(commission.ok, true)
      const purchaseMovement = await movement('COMPRA-CERO-COMISION', -0.01, `${TAG} COMPRA TARJETA COMISION 0,00`)
      await expectEasy('NO_REQUIERE_FUERA_DE_AMBITO', () => confirmEasyReconciliationTx(tx, actor, {
        action: 'no_requiere', movimientoId: purchaseMovement, version: 1, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: uuidV4(), confirmacion: true,
      }))
      const fiscalMovement = await movement('FISCAL-244', -12.34, `${TAG} PAGO MODELO 244 AEAT`)
      await expectEasy('NO_REQUIERE_FUERA_DE_AMBITO', () => confirmEasyReconciliationTx(tx, actor, {
        action: 'no_requiere', movimientoId: fiscalMovement, version: 1, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: uuidV4(), confirmacion: true,
      }))
      const unexplainedMovement = await movement('SIN-CONTEXTO', -0.01, `${TAG} CARGO DESCONOCIDO`)
      await expectEasy('NO_REQUIERE_SIN_CONTEXTO_BANCARIO', () => confirmEasyReconciliationTx(tx, actor, {
        action: 'no_requiere', movimientoId: unexplainedMovement, version: 1, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: uuidV4(), confirmacion: true,
      }))
      cases += 1

      // 4. Fake provider flow uses the existing B5 service exactly but routes its
      // two internal transactions to our outer rollback. It proves the reservation
      // is not committed outside the fixture and upload never auto-confirms B4.
      const ticketMovement = await movement('TICKET')
      const ticketLegacy = legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: ticketMovement } }))
      let providerCalls = 0
      const ticketCreated: any = await createPendingDocument(actor, ticketInput(ticketMovement), async () => {
        providerCalls += 1
        return { driveId: drive, itemId: `item-${uuidV4().replaceAll('-', '')}`, authenticatedWebUrl: `https://fixture.invalid/${TAG}.pdf` }
      })
      assert.equal(providerCalls, 1, 'Sólo se invoca el fake provider')
      assert(ticketCreated.gastoId && ticketCreated.documentoConciliableId, 'B5 ticket debe crear gasto y wrapper B4')
      assert.equal(await tx.vinculoMovimientoDocumento.count({ where: { movimientoId: ticketMovement } }), 0, 'Subir evidencia no concilia')
      assert.deepEqual(legacy(await tx.movimientoBancario.findUniqueOrThrow({ where: { id: ticketMovement } })), ticketLegacy)
      const ticketSuggestion = await singleCandidate(ticketMovement)
      assert.equal(ticketSuggestion.documentoConciliableId, ticketCreated.documentoConciliableId)
      await confirmEasyReconciliationTx(tx, actor, { action: 'confirmar_factura', movimientoId: ticketMovement, version: 1, sugerenciaId: ticketSuggestion.id, idempotencyKey: uuidV4(), confirmacion: true })
      cases += 1

      // 5. A source wrapper is rolled back if a later B4 event fails. This checks
      // the Tx variant shares the same B4 transaction, instead of leaving a
      // partially committed legal wrapper after the failed confirmation.
      const failMovement = await movement('FALLA-DESPues-WRAPPER')
      const failInvoice = await invoice('FALLA-DESPues-WRAPPER')
      const failSuggestion = await singleCandidate(failMovement)
      const failDocsBefore = await tx.documentoConciliable.count({ where: { facturaRecibidaId: failInvoice } })
      await tx.$executeRawUnsafe('SAVEPOINT easy_after_wrapper_failure')
      await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION pg_temp.easy_fail_after_wrapper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.movimiento_id='${failMovement}' THEN RAISE EXCEPTION 'EASY_SYNTHETIC_AFTER_WRAPPER' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$`)
      await tx.$executeRawUnsafe('CREATE TRIGGER easy_fail_after_wrapper_tr BEFORE INSERT ON eventos_justificacion_b4 FOR EACH ROW EXECUTE FUNCTION pg_temp.easy_fail_after_wrapper()')
      let failedAfterWrapper = false
      try {
        await confirmEasyReconciliationTx(tx, actor, { action: 'confirmar_factura', movimientoId: failMovement, version: 1, sugerenciaId: failSuggestion.id, idempotencyKey: uuidV4(), confirmacion: true })
      } catch { failedAfterWrapper = true }
      assert(failedAfterWrapper, 'La inyección debía fallar después de crear wrapper')
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT easy_after_wrapper_failure')
      assert.equal(await tx.documentoConciliable.count({ where: { facturaRecibidaId: failInvoice } }), failDocsBefore, 'No queda wrapper tras fallo')
      assert.equal(await tx.operacionJustificacionB4.count({ where: { movimientoId: failMovement } }), 0, 'No queda operación parcial')
      cases += 1

      // 6. Create a rule from the first own receipt, prove that it only changes
      // candidate priority, confirm a second human click, then reverse the source
      // B4 operation: the still-stored rule immediately ceases to apply.
      const createdRule: any = await mutateEasyRuleTx(tx, actor, { action: 'crear', operacionId: firstConfirmed.operacionId, modo: 'SOLO_PROPONER', confirmacion: true })
      assert.equal(createdRule.activa, true); assert.equal(createdRule.version, 1)
      const secondMovement = await movement('REGLA-ACTIVA')
      await invoice('REGLA-ACTIVA')
      const secondSuggestion = await singleCandidate(secondMovement, createdRule.reglaId)
      const secondConfirmed: any = await confirmEasyReconciliationTx(tx, actor, { action: 'confirmar_factura', movimientoId: secondMovement, version: 1, sugerenciaId: secondSuggestion.id, idempotencyKey: uuidV4(), confirmacion: true })
      const usage = await tx.$queryRaw<Array<{ count: string }>>`
        SELECT count(*)::text AS count FROM auditorias_reglas_modo_facil
        WHERE regla_id=CAST(${createdRule.reglaId} AS uuid) AND accion='USO_CONFIRMADO' AND operacion_b4_id=CAST(${secondConfirmed.operacionId} AS uuid)
      `
      assert.equal(Number(usage[0]?.count ?? 0), 1, 'El uso confirmado se audita y no edita la regla')
      const firstLink = await tx.vinculoMovimientoDocumento.findFirstOrThrow({ where: { movimientoId: firstMovement, activo: true }, select: { id: true, importeCentimos: true } })
      const undone: any = await deshacerB4Tx(tx, actor, {
        action: 'deshacer', confirmacion: true, idempotencyKey: uuidV4(), version: 2, operacionId: firstConfirmed.operacionId,
        lineas: [{ id: firstLink.id, importeCentimos: firstLink.importeCentimos }],
      })
      assert.equal(undone.estado.estado, 'SIN_DOCUMENTO')
      const revertedMovement = await movement('REGLA-FUENTE-REVERTIDA')
      await invoice('REGLA-FUENTE-REVERTIDA')
      await singleCandidate(revertedMovement, null)
      // Current version is still 1 because reversal invalidates effective use, not
      // the immutable stored rule. A stale version fails; the sole legal update
      // is the audited active -> inactive transition with +1.
      await expectEasy('VERSION_CONFLICT', () => mutateEasyRuleTx(tx, actor, { action: 'desactivar', reglaId: createdRule.reglaId, version: 2, confirmacion: true }))
      const disabled: any = await mutateEasyRuleTx(tx, actor, { action: 'desactivar', reglaId: createdRule.reglaId, version: 1, confirmacion: true })
      assert.deepEqual(disabled, { ok: true, reglaId: createdRule.reglaId, activa: false, version: 2, modo: 'SOLO_PROPONER' })
      const disabledAudit = await tx.$queryRaw<Array<{ count: string }>>`
        SELECT count(*)::text AS count FROM auditorias_reglas_modo_facil
        WHERE regla_id=CAST(${createdRule.reglaId} AS uuid) AND accion='DESACTIVADA'
      `
      assert.equal(Number(disabledAudit[0]?.count ?? 0), 1)
      cases += 1

      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      completed = true
      throw new RollbackOnly()
    }), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15_000, timeout: 180_000 })
  } catch (error) {
    if (!(error instanceof RollbackOnly)) throw error
  }
  assert(completed, 'No se alcanzó el rollback obligatorio')
  assert.equal(cases, 6, 'Casos Modo Fácil incompletos')
  assert.deepEqual(await snapshot(), before, 'El rollback alteró algún dato previo, legacy o de auditoría')
  console.log(JSON.stringify({ passed: true, rollback: true, providerMockOnly: true, cases, confirmations: true, stale: true, idempotency: true, noRequiereContextual: true, ticketB5: true, failureAfterWrapper: true, rules: true, reversal: true, legacyUnchanged: true }))
}

run()
  .catch((error) => { console.error('MODO_FACIL_POSTGRES_FAILED', error instanceof Error ? error.message.slice(0, 300) : 'desconocido'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
