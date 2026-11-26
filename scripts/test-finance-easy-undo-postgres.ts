import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { confirmEasyReconciliationTx, inspectEasyCandidatesTx } from '../lib/finanzas/easy-reconciliation-db'
import { EasyUndoServiceError, undoEasyTx } from '../lib/finanzas/easy-reconciliation-undo'
import { createDocumentoB4Tx } from '../lib/finanzas/reconciliation-db'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'
import { calculateBankInvoicing, exactSourceCents, type B4DocumentLineInput } from '../lib/finanzas/bank-invoicing-core'

/**
 * Private staging-only integration proof. One outer SERIALIZABLE transaction,
 * mandatory intentional rollback, fictitious source rows, no external provider.
 *
 * Only the coordinator may execute, with its isolated staging environment loaded:
 * pnpm exec tsx scripts/test-finance-easy-undo-postgres.ts
 * Required: FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview
 * FINANCE_EXTERNAL_ACTIONS_DISABLED=1 FINANCE_P1_ACTOR_ID=<live B4 actor>.
 * Required DDL: B4, Modo Fácil receipts/rules and B8 receipts.
 *
 * Roundtrip equality is ECONOMIC, not physical: B4 version advances 1->2->3,
 * operations/receipts persist and events are append-only. Physical global equality
 * is asserted only AFTER the outer rollback, not after an ordinary undo.
 * B7 calculation is the real pure core fed scoped, live SQL evidence; this test
 * does not exercise the whole-population B7 reader, HTTP/auth cookies or UI.
 */
const TAG = `MF-UNDO-ROLLBACK-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 10, 0, 0))
type Tx = any
class RollbackOnly extends Error { constructor() { super('MODO_FACIL_UNDO_ROLLBACK_ONLY') } }

function actorId(): number {
  const value = Number(process.env.FINANCE_P1_ACTOR_ID)
  assert(Number.isSafeInteger(value) && value > 0, 'FINANCE_P1_ACTOR_ID debe venir del runner privado')
  return value
}

async function snapshot() {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>`
    SELECT jsonb_object_agg(nombre,jsonb_build_object('count',cantidad,'hash',huella)) AS snapshot FROM (
      SELECT 'cuentas_bancarias' nombre,count(*)::text cantidad,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) huella FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos_bancarios',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM movimientos_bancarios t
      UNION ALL SELECT 'facturas_emitidas',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM facturas_emitidas t
      UNION ALL SELECT 'documentos_conciliables',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM documentos_conciliables t
      UNION ALL SELECT 'estado_justificacion_movimientos',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.movimiento_id::text),'')) FROM estado_justificacion_movimientos t
      UNION ALL SELECT 'vinculos_movimiento_documento',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM vinculos_movimiento_documento t
      UNION ALL SELECT 'operaciones_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM operaciones_justificacion_b4 t
      UNION ALL SELECT 'eventos_justificacion_b4',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM eventos_justificacion_b4 t
      UNION ALL SELECT 'recibos_modo_facil',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM recibos_modo_facil t
      UNION ALL SELECT 'recibos_eleccion_centro_b8',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM recibos_eleccion_centro_b8 t
      UNION ALL SELECT 'auditorias_centros_coste_finanzas_b8',count(*)::text,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY t.id::text),'')) FROM auditorias_centros_coste_finanzas_b8 t
    ) x LIMIT 1
  `
  assert.equal(rows.length, 1, 'No se pudo tomar el snapshot global')
  return rows[0].snapshot
}

async function expectUndo(code: string, work: () => Promise<unknown>) {
  try { await work() } catch (error) {
    assert(error instanceof EasyUndoServiceError, `Se esperaba EasyUndoServiceError ${code}`)
    assert.equal(error.code, code)
    return
  }
  assert.fail(`Debía rechazar ${code}`)
}

/** Scoped physical rows for audit/replay, never used as roundtrip economic equality. */
async function physical(tx: Tx, movimientoId: string) {
  const tables = ['movimientos_bancarios', 'estado_justificacion_movimientos', 'vinculos_movimiento_documento', 'operaciones_justificacion_b4', 'eventos_justificacion_b4'] as const
  const result: Record<string, any[]> = {}
  for (const table of tables) {
    const column = table === 'movimientos_bancarios' ? 'id' : 'movimiento_id'
    result[table] = await tx.$queryRaw(Prisma.sql`
      SELECT to_jsonb(t) AS row FROM ${Prisma.raw(table)} t
      WHERE ${Prisma.raw(column)}=${movimientoId} ORDER BY to_jsonb(t)::text LIMIT 100
    `)
    assert(result[table].length < 100, `Snapshot local truncado en ${table}`)
  }
  result.recibos_modo_facil = await tx.$queryRaw(Prisma.sql`
    SELECT to_jsonb(r) AS row FROM recibos_modo_facil r
    JOIN operaciones_justificacion_b4 o ON o.id=r.operacion_b4_id
    WHERE o.movimiento_id=${movimientoId} ORDER BY r.id LIMIT 100
  `)
  result.recibos_eleccion_centro_b8 = await tx.$queryRaw(Prisma.sql`
    SELECT to_jsonb(r) AS row FROM recibos_eleccion_centro_b8 r
    JOIN operaciones_justificacion_b4 o ON o.id=r.operacion_b4_id
    WHERE o.movimiento_id=${movimientoId} ORDER BY r.id LIMIT 100
  `)
  result.auditorias_centros_coste_finanzas_b8 = await tx.$queryRaw(Prisma.sql`
    SELECT to_jsonb(a) AS row FROM auditorias_centros_coste_finanzas_b8 a
    JOIN vinculos_movimiento_documento v ON v.id=a.vinculo_movimiento_documento_id
    WHERE v.movimiento_id=${movimientoId} ORDER BY a.id LIMIT 100
  `)
  return result
}

/** Economic projection plus the SEPARATE monotonically advancing B4 version. */
async function business(tx: Tx, movimientoId: string, facturaId?: string, documentoId?: string) {
  const movement = await tx.movimientoBancario.findUniqueOrThrow({ where: { id: movimientoId }, select: {
    id: true, cuentaId: true, importe: true, fechaOperacion: true, fechaValor: true,
    concepto: true, referencia: true, infoAdicional: true, tercero: true,
    conciliado: true, pendienteFactura: true, facturaId: true, facturaEmitidaId: true,
    gastoId: true, tipoDocumento: true, documentoRecibido: true, notaConciliacion: true,
  } })
  const current = await tx.estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId }, select: { estado: true, motivoNoRequiere: true, version: true } })
  const lines = await tx.vinculoMovimientoDocumento.findMany({ where: { movimientoId, activo: true }, select: {
    documentoConciliableId: true, tipoLinea: true, importeCentimos: true, motivoDiferencia: true,
  }, orderBy: { id: 'asc' }, take: 100 })
  const estado = current?.estado ?? 'SIN_DOCUMENTO'
  let invoice: any = null, document: any = null, settlement: any = null
  if (facturaId && documentoId) {
    const source = await tx.$queryRaw(Prisma.sql`
      SELECT id,total::text AS total_text,estado::text AS estado,importe_cobrado::text AS cobrado_text,
        fecha_cobro,cliente,num_factura,fecha::date::text AS fecha,fecha_vencimiento::date::text AS vencimiento,factura_isp_id
      FROM facturas_emitidas WHERE id=${facturaId} LIMIT 1
    `)
    assert.equal(source.length, 1)
    invoice = source[0]
    document = await tx.documentoConciliable.findUniqueOrThrow({ where: { id: documentoId }, select: { id: true, tipo: true, activo: true, importeObjetivoCentimos: true, version: true, facturaEmitidaId: true } })
    const evidence = await tx.$queryRaw(Prisma.sql`
      SELECT v.id::text AS line_id,v.movimiento_id,v.importe_centimos,v.activo,
        o.estado::text AS operation_state,o.revertida_at,m.importe::text AS bank_text,
        COALESCE(e.estado::text,'SIN_DOCUMENTO') AS movement_state,
        (SELECT COALESCE(SUM(a.importe_centimos),0)::text FROM vinculos_movimiento_documento a WHERE a.movimiento_id=v.movimiento_id AND a.activo=true) AS sum_active,
        (SELECT COUNT(*)::int FROM vinculos_movimiento_documento a WHERE a.movimiento_id=v.movimiento_id AND a.activo=true AND a.tipo_linea='DOCUMENTO') AS count_documents,
        NOT EXISTS(SELECT 1 FROM vinculos_movimiento_documento a JOIN operaciones_justificacion_b4 p ON p.id=a.operacion_creacion_id WHERE a.movimiento_id=v.movimiento_id AND a.activo=true AND (p.estado::text<>'APLICADA' OR p.revertida_at IS NOT NULL)) AS all_active_applied
      FROM vinculos_movimiento_documento v JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
      JOIN movimientos_bancarios m ON m.id=v.movimiento_id
      LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
      WHERE v.documento_conciliable_id=CAST(${documentoId} AS uuid) ORDER BY v.id LIMIT 100
    `)
    const directDocumentLines: B4DocumentLineInput[] = evidence.map((row: any) => ({
      lineId: row.line_id, movementId: row.movimiento_id, invoiceId: facturaId,
      signedCents: row.importe_centimos, active: row.activo, documentActive: document.activo,
      documentKind: 'FACTURA_EMITIDA', wrapperTargetCents: document.importeObjetivoCentimos,
      operationApplied: row.operation_state === 'APLICADA', operationReverted: row.revertida_at !== null,
      movementJustified: row.movement_state === 'JUSTIFICADO', physicalBankCents: exactSourceCents(row.bank_text),
      sumAllActiveCents: Number(row.sum_active), activeDocumentLineCount: row.count_documents, allActiveLinesApplied: row.all_active_applied,
    }))
    settlement = calculateBankInvoicing({ invoices: [{
      id: facturaId, sourceTotalText: invoice.total_text, b2Economic: true,
      numFactura: invoice.num_factura, cliente: invoice.cliente, fechaISO: invoice.fecha,
      fechaVencimientoISO: invoice.vencimiento, facturaISPId: invoice.factura_isp_id,
    }], directDocumentLines }).invoices[0]
  }
  return { version: current?.version ?? 1, economic: {
    movement, estado, motivoNoRequiere: current?.motivoNoRequiere ?? null,
    activos: lines, asignadoCentimos: lines.reduce((sum: number, line: any) => sum + line.importeCentimos, 0),
    pendientes: estado === 'SIN_DOCUMENTO' ? 1 : 0, reconciliadoB4: estado === 'JUSTIFICADO',
    invoice, document, settlement,
  } }
}

async function roundtrip(tx: Tx, actor: number, input: any, facturaId?: string, documentoId?: string) {
  const movimientoId = input.movimientoId
  const initial = await business(tx, movimientoId, facturaId, documentoId)
  assert.equal(initial.version, 1)
  assert.equal(initial.economic.pendientes, 1)
  assert.equal(initial.economic.activos.length, 0)
  if (facturaId) {
    assert.equal(initial.economic.invoice.estado, 'EMITIDA')
    assert.equal(initial.economic.settlement.paymentState, 'PENDIENTE_COBRO')
    assert.equal(initial.economic.settlement.paidDocumentaryCents, 0)
  }
  const confirmed: any = await confirmEasyReconciliationTx(tx, actor, input)
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.reversible, true)
  const applied = await business(tx, movimientoId, facturaId, documentoId)
  assert.equal(applied.version, initial.version + 1)
  assert.equal(applied.economic.pendientes, 0)
  assert.equal(applied.economic.estado, facturaId ? 'JUSTIFICADO' : 'NO_REQUIERE')
  if (facturaId) {
    assert.equal(applied.economic.activos.length, 1)
    assert.equal(applied.economic.settlement.paymentState, 'COBRADA_CALCULADA')
    assert.equal(applied.economic.settlement.remainingCents, 0)
    assert.equal(applied.economic.settlement.paidDocumentaryCents, documentoId ? applied.economic.document.importeObjetivoCentimos : 0)
    assert.deepEqual(applied.economic.invoice, initial.economic.invoice, 'B4 no modifica campos legacy de cobro de FacturaEmitida')
  }
  const confirmation = await physical(tx, movimientoId)
  const undoPayload = { action: 'deshacer' as const, confirmacion: true as const, operacionId: confirmed.operacionId, idempotencyKey: randomUUID() }
  assert.deepEqual(await undoEasyTx(tx, actor, undoPayload), { ok: true, idempotente: false })
  const undone = await business(tx, movimientoId, facturaId, documentoId)
  assert.deepEqual(undone.economic, initial.economic, 'Confirmar -> deshacer restaura negocio, activos, reconciliado, pendientes y cobro calculado')
  assert.equal(undone.version, applied.version + 1, 'Deshacer avanza versión; no la restaura')
  const afterUndo = await physical(tx, movimientoId)
  assert.equal(afterUndo.operaciones_justificacion_b4.length, confirmation.operaciones_justificacion_b4.length + 1)
  assert.equal(afterUndo.eventos_justificacion_b4.length, confirmation.eventos_justificacion_b4.length + 3)
  for (const event of confirmation.eventos_justificacion_b4) {
    assert.deepEqual(afterUndo.eventos_justificacion_b4.find(row => row.row.id === event.row.id), event, 'Evento original append-only intacto')
  }
  assert.deepEqual(afterUndo.recibos_modo_facil, confirmation.recibos_modo_facil, 'El recibo original se conserva')
  assert.deepEqual(afterUndo.recibos_eleccion_centro_b8, confirmation.recibos_eleccion_centro_b8, 'El recibo B8 se conserva')
  assert.deepEqual(afterUndo.auditorias_centros_coste_finanzas_b8, confirmation.auditorias_centros_coste_finanzas_b8, 'La auditoría B8 se conserva')
  const original = afterUndo.operaciones_justificacion_b4.find(row => row.row.id === confirmed.operacionId)!.row
  assert.equal(original.estado, 'REVERTIDA')
  assert.notEqual(original.revertida_at, null)
  if (facturaId) {
    assert.equal(afterUndo.vinculos_movimiento_documento.length, 1, 'Se retiene la línea histórica, no se borra')
    const line = afterUndo.vinculos_movimiento_documento[0].row
    assert.equal(line.activo, false)
    assert(line.operacion_anulacion_id, 'La línea queda atribuida a la reversión')
    const candidates = await inspectEasyCandidatesTx(tx, movimientoId)
    assert(candidates.some((candidate: any) => candidate.suggestion.sourceId === facturaId && candidate.suggestion.exacta), 'La factura vuelve a ser candidata exacta pendiente')
  }
  assert.deepEqual(await undoEasyTx(tx, actor, undoPayload), { ok: true, idempotente: true })
  assert.deepEqual(await physical(tx, movimientoId), afterUndo, 'Segundo deshacer mismo UUID no escribe ni versión ni auditoría')
  assert.deepEqual(await business(tx, movimientoId, facturaId, documentoId), undone)
  await expectUndo('OPERACION_NO_REVERSIBLE', () => undoEasyTx(tx, actor, { ...undoPayload, idempotencyKey: randomUUID() }))
  assert.deepEqual(await physical(tx, movimientoId), afterUndo, 'UUID nuevo no produce segunda reversión')
  return { action: input.action, confirmed: true, undo: true, economicRestored: true, version: [initial.version, applied.version, undone.version], appendOnlyAudit: true, replayNoEffect: true, changedKeyRejected: true }
}

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.VERCEL_ENV, 'preview', 'VERCEL_ENV=preview es obligatorio')
  assert.equal(process.env.FINANCE_EXTERNAL_ACTIONS_DISABLED, '1', 'FINANCE_EXTERNAL_ACTIONS_DISABLED=1 es obligatorio')
  assert.notEqual(process.env.IO_PRODUCTION_READ_ONLY, '1', 'El ejecutor read-only no admite esta prueba')
  const actor = actorId()
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db,current_user AS role LIMIT 1`
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas' }, 'Sólo staging aislado')
  for (const facet of ['lectura', 'escritura'] as const) {
    const access = await requireB4ActorAccess(actor, facet)
    assert(access.ok, `El actor P1 debe conservar acceso B4 de ${facet}`)
  }
  const receiptTable = await prisma.$queryRaw<Array<{ name: string | null }>>`SELECT to_regclass('recibos_modo_facil')::text AS name LIMIT 1`
  assert.notEqual(receiptTable[0]?.name, null, 'Aplicar antes el DDL de recibos Modo Fácil')
  const before = await snapshot()
  let completed = false
  const cases: any[] = []
  try {
    await prisma.$transaction(async (tx: Tx) => {
      const account = await tx.cuentaBancaria.create({ data: { id: randomUUID(), banco: `${TAG}-BANCO`, iban: `ES00${TAG.replaceAll('-', '').slice(0, 28)}`, alias: TAG, activa: true, fechaCorteExtracto: DAY }, select: { id: true } })
      const movement = async (importe: number, concepto: string) => {
        const id = randomUUID()
        await tx.movimientoBancario.create({ data: { id, cuentaId: account.id, fechaOperacion: DAY, fechaValor: DAY, importe, concepto: `${TAG} ${concepto}`, referencia: `${TAG}-REF`, infoAdicional: TAG, tercero: `${TAG}-CLIENTE`, hashUnico: `${TAG}-${randomUUID()}` } })
        return id
      }
      cases.push(await roundtrip(tx, actor, { action: 'no_requiere', movimientoId: await movement(-0.01, 'COMISION BANCARIA DE MANTENIMIENTO'), version: 1, motivoNoRequiere: 'COMISION_BANCARIA', idempotencyKey: randomUUID(), confirmacion: true }))
      const facturaId = randomUUID()
      await tx.facturaEmitida.create({ data: {
        id: facturaId, cliente: `${TAG}-CLIENTE`, numFactura: `${TAG}-FACTURA`, fecha: DAY,
        base: 12.34, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total: 12.34,
        concepto: `${TAG} FACTURA EMITIDA FICTICIA`, estado: 'EMITIDA', importeCobrado: 0, fechaCobro: null,
      } })
      // Seed a real, reusable B4 wrapper BEFORE the initial business snapshot.
      // Undo deactivates allocations, not the canonical wrapper or source invoice.
      const wrapper: any = await createDocumentoB4Tx(tx, actor, { action: 'documento', tipoDocumento: 'FACTURA_EMITIDA', sourceId: facturaId })
      assert.equal(wrapper.created, true)
      const documentoId = wrapper.documento.id
      const movimientoId = await movement(12.34, 'TRANSFERENCIA COBRO FACTURA')
      const candidates = await inspectEasyCandidatesTx(tx, movimientoId)
      const suggestion = candidates.find((candidate: any) => candidate.suggestion.sourceId === facturaId)?.suggestion
      assert(suggestion?.exacta, 'La factura emitida ficticia debe ser candidata exacta')
      assert.equal(suggestion.documentoConciliableId, documentoId, 'La confirmación reutiliza el envoltorio preparado')
      cases.push(await roundtrip(tx, actor, { action: 'confirmar_factura', movimientoId, version: 1, sugerenciaId: suggestion.id, idempotencyKey: randomUUID(), confirmacion: true }, facturaId, documentoId))
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      completed = true
      throw new RollbackOnly()
    }, { isolationLevel: 'Serializable', maxWait: 15_000, timeout: 120_000 })
  } catch (error) { if (!(error instanceof RollbackOnly)) throw error }
  assert(completed, 'No se alcanzó el rollback obligatorio')
  assert.deepEqual(await snapshot(), before, 'El rollback alteró datos preexistentes')
  console.log(JSON.stringify({ passed: true, rollback: true, cases, limits: ['Staging isolated SERIALIZABLE rollback-only', 'FacturaEmitida + reusable wrapper; not received invoices/tickets/new-wrapper cleanup', 'B7 pure core with live scoped evidence, not full reader or UI/HTTP', 'No concurrent separate sessions; no external providers'] }))
}
run()
  .catch((error) => { console.error('MODO_FACIL_UNDO_POSTGRES_FAILED', error instanceof Error ? error.message.slice(0, 300) : 'desconocido'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
