import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  B4ServiceError,
  confirmarB4,
  createDocumentoB4,
  deshacerB4,
} from '../lib/finanzas/reconciliation-db'
import { convertirImporteUiACentimos } from '../lib/finanzas/reconciliation-core'

/**
 * Prueba de integración B4 para ejecutar SÓLO tras aplicar el DDL B4 en
 * io_staging_finanzas. Todas las escrituras se hacen en una transacción
 * SERIALIZABLE exterior que termina siempre en rollback intencional.
 *
 * Ejecución autorizada (nunca contra otro destino):
 *   FINANCE_STAGING_SANDBOX=1 B4_ROLLBACK_TEST=1 npx tsx scripts/test-finance-b4-postgres.ts
 */

const DAY = Date.UTC(2042, 0, 2, 9, 0, 0)
const TAG = `B4-ROLLBACK-${randomUUID()}`
const FIXTURE_IBAN = `ES00${TAG.replaceAll('-', '')}`

class RollbackSentinel extends Error {
  constructor() { super('B4_ROLLBACK_ONLY') }
}

type Snapshot = Record<string, unknown>
type DocResult = { documento: { id: string; tipo: string; importeObjetivoCentimos: number | null }; created: boolean }

function assertEqual<T>(actual: T, expected: T, message?: string): asserts actual is T {
  assert.equal(actual, expected, message)
}

function plusMinutes(n: number) {
  return new Date(DAY + n * 60_000)
}

async function b4Snapshot(): Promise<Snapshot> {
  // No business values leave PostgreSQL: this is only a private count + row-hash
  // snapshot used after the rollback to prove pre-existing rows did not change.
  const rows = await prisma.$queryRaw<Array<{ snapshot: Snapshot }>>`
    SELECT jsonb_object_agg(nombre, jsonb_build_object('count', cantidad, 'hash', huella)) AS snapshot
    FROM (
      SELECT 'cuentas_bancarias' AS nombre, count(*)::text AS cantidad,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS huella FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos_bancarios', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM movimientos_bancarios t
      UNION ALL SELECT 'facturas_recibidas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM facturas_recibidas t
      UNION ALL SELECT 'facturas_emitidas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM facturas_emitidas t
      UNION ALL SELECT 'documentos_aapp', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM documentos_aapp t
      UNION ALL SELECT 'pagos_fraccionados', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM pagos_fraccionados t
      UNION ALL SELECT 'documentos_conciliables', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM documentos_conciliables t
      UNION ALL SELECT 'estado_justificacion_movimientos', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.movimiento_id), '')) FROM estado_justificacion_movimientos t
      UNION ALL SELECT 'vinculos_movimiento_documento', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM vinculos_movimiento_documento t
      UNION ALL SELECT 'operaciones_justificacion_b4', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM operaciones_justificacion_b4 t
      UNION ALL SELECT 'eventos_justificacion_b4', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM eventos_justificacion_b4 t
    ) agregados
  `
  assert.equal(rows.length, 1, 'Snapshot B4 no disponible')
  return rows[0].snapshot
}

async function fixtureCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>`
    SELECT (
      (SELECT count(*) FROM cuentas_bancarias WHERE iban = ${FIXTURE_IBAN}) +
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM facturas_recibidas WHERE num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM facturas_emitidas WHERE num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM documentos_aapp WHERE titulo = ${TAG}) +
      (SELECT count(*) FROM pagos_fraccionados p JOIN documentos_aapp a ON a.id = p.documento_id WHERE a.titulo = ${TAG}) +
      (SELECT count(*) FROM documentos_prestamo WHERE referencia LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM documentos_conciliables d
        LEFT JOIN facturas_recibidas fr ON fr.id = d.factura_recibida_id
        LEFT JOIN facturas_emitidas fe ON fe.id = d.factura_emitida_id
        LEFT JOIN documentos_aapp a ON a.id = d.documento_aapp_id
        LEFT JOIN pagos_fraccionados pf ON pf.id = d.pago_fraccionado_id
        LEFT JOIN documentos_aapp apf ON apf.id = pf.documento_id
        LEFT JOIN documentos_prestamo dp ON dp.id = d.documento_prestamo_id
        WHERE fr.num_factura LIKE ${`${TAG}%`} OR fe.num_factura LIKE ${`${TAG}%`} OR a.titulo = ${TAG} OR apf.titulo = ${TAG} OR dp.referencia LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM estado_justificacion_movimientos e JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM vinculos_movimiento_documento v JOIN movimientos_bancarios m ON m.id = v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM operaciones_justificacion_b4 o JOIN movimientos_bancarios m ON m.id = o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM eventos_justificacion_b4 e JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`})
    )::bigint AS count
  `
  return Number(rows[0]?.count ?? 0)
}

async function expectB4(code: string, status: number, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B4ServiceError, `Se esperaba B4ServiceError ${code}`)
    assertEqual(error.status, status, `Estado HTTP inesperado para ${code}`)
    assertEqual(error.code, code, `Código B4 inesperado`)
    return
  }
  assert.fail(`Debía rechazarse con ${code}`)
}

async function expectSqlBlocked(tx: any, savepoint: string, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  let blocked = false
  try {
    await work()
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
  } catch {
    blocked = true
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  }
  assert(blocked, `La guarda SQL debía bloquear ${savepoint}`)
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
}

async function run() {
  if (process.env.B4_ROLLBACK_TEST !== '1') throw new Error('B4_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('FINANCE_STAGING_SANDBOX=1 es obligatorio')

  // This is the only non-transactional identity read. Every service call repeats
  // the same staging fence before it reaches its (patched) inner transaction.
  const identity = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  assertEqual(identity[0]?.db, 'io_staging_finanzas', 'La prueba sólo admite io_staging_finanzas')
  assertEqual(identity[0]?.usuario, 'io_staging_finanzas', 'La prueba sólo admite el rol aislado')

  const actor = await prisma.usuarioAdmin.findFirst({
    where: { activo: true, rol: 'SUPER_ADMIN' },
    select: { id: true },
    take: 1,
  })
  assert(actor, 'Se requiere un SUPER_ADMIN activo ya existente; la prueba no crea usuarios')

  const before = await b4Snapshot()
  assertEqual(await fixtureCount(), 0, 'Colisión improbable de marcador de fixture')
  const originalTransaction = (prisma as any).$transaction.bind(prisma)
  let reachedSentinel = false
  let movementSequence = 0

  try {
    await originalTransaction(async (tx: any) => {
      const savedTransaction = (prisma as any).$transaction
      // Service calls retain their actual Prisma delegates/SQL, but their inner
      // Serializable transaction is routed to this outer rollback-only one.
      ;(prisma as any).$transaction = async (callback: (serviceTx: any) => Promise<unknown>) => callback(tx)

      try {
        const b4tx = tx as any
        const account = await tx.cuentaBancaria.create({
          data: {
            id: randomUUID(),
            banco: 'BANCO PRUEBA B4',
            iban: FIXTURE_IBAN,
            alias: 'CUENTA SINTETICA B4',
            activa: true,
          },
          select: { id: true },
        })

        const movement = async (importe: number, label: string) => {
          movementSequence += 1
          const id = randomUUID()
          const date = plusMinutes(movementSequence)
          await tx.movimientoBancario.create({
            data: {
              id,
              cuentaId: account.id,
              fechaOperacion: date,
              fechaValor: date,
              concepto: `PRUEBA B4 ${label}`,
              importe,
              hashUnico: `${TAG}-${randomUUID()}`,
              referencia: randomUUID(),
              tercero: 'CLIENTE PRUEBA B4',
            },
          })
          return id
        }

        const received = async (total: number, quality: 'VALIDA' | 'COPIA' | 'REVISAR_LECTURA' = 'VALIDA', copiaDeId: string | null = null) => {
          const id = randomUUID()
          const seq = randomUUID()
          await tx.facturaRecibida.create({
            data: {
              id,
              proveedor: 'CLIENTE PRUEBA B4',
              cif: 'B4-SINTETICO',
              numFactura: `${TAG}-${seq}`,
              fecha: plusMinutes(++movementSequence),
              base: total,
              tipoIva: 0,
              importeIva: 0,
              tipoIrpf: 0,
              importeIrpf: 0,
              total,
              concepto: 'FACTURA SINTETICA B4',
              estado: 'PENDIENTE_REVISION',
              calidad: quality,
              copiaDeId,
              fechaProvenancia: 'DOCUMENTO',
              deducibleIva: true,
            },
            select: { id: true },
          })
          return id
        }

        const emitted = async (total: number) => {
          const id = randomUUID()
          await tx.facturaEmitida.create({
            data: {
              id,
              cliente: 'CLIENTE PRUEBA B4',
              cif: 'B4-SINTETICO',
              numFactura: `${TAG}-${randomUUID()}`,
              fecha: plusMinutes(++movementSequence),
              base: total,
              tipoIva: 0,
              importeIva: 0,
              tipoIrpf: 0,
              importeIrpf: 0,
              total,
              concepto: 'FACTURA EMITIDA SINTETICA B4',
              estado: 'EMITIDA',
            },
            select: { id: true },
          })
          return id
        }

        const document = async (tipoDocumento: string, sourceId: string): Promise<DocResult> => {
          const result = await createDocumentoB4(actor.id, { action: 'documento', tipoDocumento, sourceId }) as DocResult
          assert(result.created, `El envoltorio ${tipoDocumento} sintético debe ser nuevo`)
          return result
        }

        const justified = async (movimientoId: string, importeMovimientoCentimos: number, lineas: unknown[], idempotencyKey = randomUUID(), version = 1) => {
          return await confirmarB4(actor.id, {
            action: 'confirmar',
            confirmacion: true,
            idempotencyKey,
            version,
            borrador: { movimientoId, importeMovimientoCentimos, estado: 'JUSTIFICADO', lineas },
          }) as any
        }

        const noRequire = async (movimientoId: string, motivoNoRequiere: string, idempotencyKey = randomUUID()) => {
          return await confirmarB4(actor.id, {
            action: 'confirmar',
            confirmacion: true,
            idempotencyKey,
            version: 1,
            borrador: { movimientoId, importeMovimientoCentimos: 0, estado: 'NO_REQUIERE', motivoNoRequiere, lineas: [] },
          }) as any
        }

        // Core rejects binary float residue before any source or B4 row is trusted.
        assert(!convertirImporteUiACentimos(0.1 + 0.2).ok, '0.30000000000000004 debe rechazarse como importe UI')

        // 1:N: two received invoices consume one signed bank outflow exactly.
        const oneToManyA = await document('FACTURA_RECIBIDA', await received(40))
        const oneToManyB = await document('FACTURA_RECIBIDA', await received(60))
        assertEqual(oneToManyA.documento.importeObjetivoCentimos, -4000)
        assertEqual(oneToManyB.documento.importeObjetivoCentimos, -6000)
        const oneToManyMovement = await movement(-100, 'UNO-A-MUCHOS')
        await justified(oneToManyMovement, -10000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: oneToManyA.documento.id, importeCentimos: -4000 },
          { tipo: 'DOCUMENTO', documentoConciliableId: oneToManyB.documento.id, importeCentimos: -6000 },
        ])

        // N:1: partial payments preserve sign and consume capacity cumulatively.
        const partial = await document('FACTURA_RECIBIDA', await received(100))
        const partialFirst = await movement(-40, 'PARCIAL-UNO')
        const partialSecond = await movement(-60, 'PARCIAL-DOS')
        await justified(partialFirst, -4000, [{ tipo: 'DOCUMENTO', documentoConciliableId: partial.documento.id, importeCentimos: -4000 }])
        await justified(partialSecond, -6000, [{ tipo: 'DOCUMENTO', documentoConciliableId: partial.documento.id, importeCentimos: -6000 }])

        // Confirming: absolute amounts 95/100/5 are persisted as the signed plan
        // bank -9500 = factura recibida -10000 + intereses +500.
        const confirming = await document('FACTURA_RECIBIDA', await received(100))
        const confirmingMovement = await movement(-95, 'CONFIRMING')
        await justified(confirmingMovement, -9500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: confirming.documento.id, importeCentimos: -10000 },
          { tipo: 'DIFERENCIA', motivoDiferencia: 'INTERESES', importeCentimos: 500 },
        ])

        // Invoice received plus commission: -10500 = -10000 + -500.
        const commission = await document('FACTURA_RECIBIDA', await received(100))
        const commissionMovement = await movement(-105, 'COMISION')
        await justified(commissionMovement, -10500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: commission.documento.id, importeCentimos: -10000 },
          { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -500 },
        ])

        // A negative received-invoice credit note deliberately has a positive B4
        // target; the service must not abs() source values. A negative issued
        // invoice retains its own negative target as a separate source type.
        const receivedCredit = await document('FACTURA_RECIBIDA', await received(-25))
        assertEqual(receivedCredit.documento.importeObjetivoCentimos, 2500)
        await justified(await movement(25, 'ABONO-RECIBIDA'), 2500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: receivedCredit.documento.id, importeCentimos: 2500 },
        ])
        const issuedCredit = await document('FACTURA_EMITIDA', await emitted(-20))
        assertEqual(issuedCredit.documento.importeObjetivoCentimos, -2000)
        await justified(await movement(-20, 'ABONO-EMITIDA'), -2000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: issuedCredit.documento.id, importeCentimos: -2000 },
        ])

        // Revised fiscal source syntax is explicit; numeric IDs without aapp:/cuota:
        // must not be inferred by the service.
        const fiscal = await tx.documentoAAPP.create({
          data: { organismo: 'hacienda', titulo: TAG, fechaDocumento: plusMinutes(++movementSequence), importe: 20, estado: 'pendiente' },
          select: { id: true },
        })
        const instalment = await tx.pagoFraccionado.create({
          data: { documentoId: fiscal.id, numeroCuota: 1, totalCuotas: 1, importe: 5, fechaVencimiento: plusMinutes(++movementSequence) },
          select: { id: true },
        })
        const aapp = await document('IMPUESTO_TGSS', `aapp:${fiscal.id}`)
        const cuota = await document('IMPUESTO_TGSS', `cuota:${instalment.id}`)
        assertEqual(aapp.documento.importeObjetivoCentimos, -2000)
        assertEqual(cuota.documento.importeObjetivoCentimos, -500)

        await expectB4('EVIDENCIA_PRESTAMO_NO_ENCONTRADA', 404, () => document('PRESTAMO', randomUUID()))
        const loan = await b4tx.documentoPrestamo.create({
          data: { id: randomUUID(), referencia: `${TAG}-${randomUUID()}`, fecha: plusMinutes(++movementSequence), importeObjetivoCentimos: null },
          select: { id: true },
        })
        const unknownLoan = await document('PRESTAMO', loan.id)
        assertEqual(unknownLoan.documento.importeObjetivoCentimos, null)
        const unknownLoanMovement = await movement(-1, 'PRESTAMO-DESCONOCIDO')
        await expectB4('VALIDATION_ERROR', 400, () => justified(unknownLoanMovement, -100, [
          { tipo: 'DOCUMENTO', documentoConciliableId: unknownLoan.documento.id, importeCentimos: -100 },
        ]))
        const canonical = await received(10)
        const copied = await received(10, 'COPIA', canonical)
        const review = await received(10, 'REVISAR_LECTURA')
        await expectB4('FACTURA_NO_ECONOMICA', 422, () => document('FACTURA_RECIBIDA', copied))
        await expectB4('FACTURA_NO_ECONOMICA', 422, () => document('FACTURA_RECIBIDA', review))

        // Legacy binary-float source is rejected before it can become cents.
        const fractionalMovement = await movement(0.30000000000000004, 'FRACCION-LEGACY')
        // Prisma's input serializer may shorten a Float: persist the exact test
        // residue as SQL text, exclusively on this rollback-only synthetic row.
        await tx.$executeRaw`UPDATE movimientos_bancarios SET importe=CAST(${'0.30000000000000004'} AS double precision) WHERE id=${fractionalMovement}`
        await expectB4('IMPORTE_FUENTE_NO_EXACTO', 422, () => justified(fractionalMovement, 0, []))

        // JUSTIFICADO with a zero bank amount is invalid and leaves no fields/state.
        const zeroDoc = await document('FACTURA_RECIBIDA', await received(1))
        const zeroMovement = await movement(0, 'CERO-JUSTIFICADO')
        await expectB4('VALIDATION_ERROR', 400, () => justified(zeroMovement, 0, [
          { tipo: 'DOCUMENTO', documentoConciliableId: zeroDoc.documento.id, importeCentimos: -100 },
        ]))
        assertEqual(await b4tx.estadoJustificacionMovimientoB4.count({ where: { movimientoId: zeroMovement } }), 0)
        assertEqual(await b4tx.operacionJustificacionB4.count({ where: { movimientoId: zeroMovement } }), 0)
        assertEqual(await b4tx.vinculoMovimientoDocumento.count({ where: { movimientoId: zeroMovement } }), 0)
        assertEqual(await b4tx.eventoJustificacionB4.count({ where: { movimientoId: zeroMovement } }), 0)

        // Capacity refusal is a service-level 400 and cannot create a partial op.
        const capacityDoc = await document('FACTURA_RECIBIDA', await received(100))
        const capacityMovement = await movement(-101, 'CAPACIDAD')
        await expectB4('VALIDATION_ERROR', 400, () => justified(capacityMovement, -10100, [
          { tipo: 'DOCUMENTO', documentoConciliableId: capacityDoc.documento.id, importeCentimos: -10100 },
        ]))

        // Confirmation/reversal/idempotency: three audit events each operation,
        // inactive original lines, virtual initial state restored, and replay stays
        // a replay even after the original operation is REVERTIDA.
        const reversibleDoc = await document('FACTURA_RECIBIDA', await received(75))
        const reversibleMovement = await movement(-75, 'REVERSIBLE')
        const confirmationKey = randomUUID()
        const confirmationInput = {
          action: 'confirmar', confirmacion: true, idempotencyKey: confirmationKey, version: 1,
          borrador: {
            movimientoId: reversibleMovement, importeMovimientoCentimos: -7500, estado: 'JUSTIFICADO',
            lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: reversibleDoc.documento.id, importeCentimos: -7500 }],
          },
        }
        const applied = await confirmarB4(actor.id, confirmationInput) as any
        assertEqual(applied.idempotente, false)
        const replayBeforeUndo = await confirmarB4(actor.id, confirmationInput) as any
        assertEqual(replayBeforeUndo.idempotente, true)
        assertEqual(await b4tx.eventoJustificacionB4.count({ where: { movimientoId: reversibleMovement } }), 3)
        const originalLines = await b4tx.vinculoMovimientoDocumento.findMany({
          where: { movimientoId: reversibleMovement, activo: true }, select: { id: true, importeCentimos: true },
        })
        const undone = await deshacerB4(actor.id, {
          action: 'deshacer', confirmacion: true, idempotencyKey: randomUUID(), version: 2,
          operacionId: applied.operacion.id,
          lineas: originalLines.map((line: any) => ({ id: line.id, importeCentimos: line.importeCentimos })),
        }) as any
        assertEqual(undone.idempotente, false)
        const stateAfterUndo = await b4tx.estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId: reversibleMovement } })
        assertEqual(stateAfterUndo.estado, 'SIN_DOCUMENTO')
        assertEqual(stateAfterUndo.version, 3)
        assertEqual(await b4tx.vinculoMovimientoDocumento.count({ where: { movimientoId: reversibleMovement, activo: true } }), 0)
        assertEqual(await b4tx.vinculoMovimientoDocumento.count({ where: { movimientoId: reversibleMovement, activo: false } }), 1)
        assertEqual(await b4tx.eventoJustificacionB4.count({ where: { movimientoId: reversibleMovement } }), 6)
        const replayAfterUndo = await confirmarB4(actor.id, confirmationInput) as any
        assertEqual(replayAfterUndo.idempotente, true)
        assertEqual(await b4tx.eventoJustificacionB4.count({ where: { movimientoId: reversibleMovement } }), 6)
        const originalOperation = await b4tx.operacionJustificacionB4.findUnique({ where: { id: applied.operacion.id }, select: { estado: true } })
        assertEqual(originalOperation.estado, 'REVERTIDA')

        await expectB4('IDEMPOTENCY_PAYLOAD_MISMATCH', 409, () => confirmarB4(actor.id, {
          ...confirmationInput,
          borrador: { ...confirmationInput.borrador, lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: reversibleDoc.documento.id, importeCentimos: -7400 }] },
        }))

        const versionDoc = await document('FACTURA_RECIBIDA', await received(10))
        const versionMovement = await movement(-10, 'VERSION')
        await expectB4('VERSION_CONFLICT', 409, () => justified(versionMovement, -1000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: versionDoc.documento.id, importeCentimos: -1000 },
        ], randomUUID(), 2))

        // Build a NO_REQUIERE operation only to exercise SQL constraints under
        // SAVEPOINT; it is also entirely rolled back by the outer sentinel.
        const constraintMovement = await movement(0, 'CONSTRAINTS')
        const noReq = await noRequire(constraintMovement, 'MOVIMIENTO_TECNICO_BANCO')
        const strictDoc = await document('FACTURA_RECIBIDA', await received(1))
        const noReqMovement = await movement(0, 'NO-REQ-RAW')
        await expectSqlBlocked(tx, 'b4_invalid_no_req', async () => {
          await tx.$executeRaw`
            INSERT INTO estado_justificacion_movimientos
              (movimiento_id, estado, motivo_no_requiere, version, updated_at, actualizado_por_id)
            VALUES (${noReqMovement}, 'NO_REQUIERE'::"EstadoJustificacionMovimiento", NULL, 1, CURRENT_TIMESTAMP, ${actor.id})
          `
        })
        await expectSqlBlocked(tx, 'b4_line_state_strict', async () => {
          await tx.$executeRaw`
            INSERT INTO vinculos_movimiento_documento
              (id, movimiento_id, documento_conciliable_id, tipo_linea, importe_centimos, motivo_diferencia,
               activo, operacion_creacion_id, created_at, updated_at)
            VALUES (CAST(${randomUUID()} AS uuid), ${constraintMovement}, CAST(${strictDoc.documento.id} AS uuid),
              'DOCUMENTO'::"TipoLineaVinculo", -100, NULL, true, CAST(${noReq.operacion.id} AS uuid), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          `
        })

        const event = await b4tx.eventoJustificacionB4.findFirst({
          where: { movimientoId: reversibleMovement }, select: { id: true }, orderBy: { createdAt: 'asc' },
        })
        assert(event, 'La confirmación debe haber producido una bitácora')
        await expectSqlBlocked(tx, 'b4_event_update', () => tx.$executeRaw`
          UPDATE eventos_justificacion_b4 SET detalle = '{}'::jsonb WHERE id = CAST(${event.id} AS uuid)
        `)
        await expectSqlBlocked(tx, 'b4_event_delete', () => tx.$executeRaw`
          DELETE FROM eventos_justificacion_b4 WHERE id = CAST(${event.id} AS uuid)
        `)

        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        reachedSentinel = true
        throw new RollbackSentinel()
      } finally {
        ;(prisma as any).$transaction = savedTransaction
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 20_000 })
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error
  }

  assert(reachedSentinel, 'La transacción no alcanzó el rollback obligatorio')
  assertEqual(await fixtureCount(), 0, 'El rollback dejó fixtures B4 sintéticos')
  assert.deepEqual(await b4Snapshot(), before, 'Cambió algún dato preexistente tras el rollback')
  console.log('B4 PostgreSQL: servicio real, guardas y rollback aislado verificados; no persiste ningún fixture.')
}

run()
  .catch(error => {
    // Do not print financial rows, amounts, connection data, or personal data.
    console.error('La prueba B4 PostgreSQL no se completó; no se ha autorizado ninguna persistencia.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
