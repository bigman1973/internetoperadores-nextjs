import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  B6RemesaServiceError,
  confirmarAsociacionDevolucionRemesaB6,
  confirmarAsociacionFacturasRemesaB6,
} from '../lib/finanzas/b6-remesas-db'
import {
  B6_AUDIT_SCHEMA_VERSION,
  canonicalSha256,
  facturasSourceHash,
  remesaSourceFingerprint,
} from '../lib/finanzas/b6-remesas-pure'
import { confirmarB4, createDocumentoB4, deshacerB4 } from '../lib/finanzas/reconciliation-db'

/**
 * B6 PostgreSQL integration test. It may run only after the reviewed B6 DDL is
 * applied to io_staging_finanzas. Every synthetic fixture, B4 confirmation,
 * B6 write and intentional source edit is confined to one SERIALIZABLE outer
 * transaction that always ends in RollbackSentinel.
 *
 * Authorized execution only:
 * FINANCE_STAGING_SANDBOX=1 B6_ROLLBACK_TEST=1 npx tsx scripts/test-finance-b6-postgres.ts
 */

const DAY = new Date('2042-01-02T09:00:00.000Z')
const TAG = `B6-ROLLBACK-${randomUUID()}`
const IBAN = `ES00${TAG.replaceAll('-', '')}`
type Tx = any
type Snapshot = Record<string, unknown>

class RollbackSentinel extends Error {
  constructor() { super('B6_ROLLBACK_ONLY') }
}

function equal<T>(actual: T, expected: T, message?: string): asserts actual is T {
  assert.equal(actual, expected, message)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function centsAsDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

/** Counts/hashes only: no existing financial data is selected into output. */
async function snapshot(): Promise<Snapshot> {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Snapshot }>>`
    SELECT jsonb_object_agg(nombre, jsonb_build_object('count', cantidad, 'hash', huella)) AS snapshot
    FROM (
      SELECT 'usuarios_admin' AS nombre, count(*)::text AS cantidad,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) AS huella FROM usuarios_admin t
      UNION ALL SELECT 'cuentas_bancarias', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM cuentas_bancarias t
      UNION ALL SELECT 'movimientos_bancarios', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM movimientos_bancarios t
      UNION ALL SELECT 'remesas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM remesas t
      UNION ALL SELECT 'facturas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id), '')) FROM facturas t
      UNION ALL SELECT 'facturas_emitidas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM facturas_emitidas t
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
      UNION ALL SELECT 'asignaciones_devolucion_remesa_b6', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM asignaciones_devolucion_remesa_b6 t
      UNION ALL SELECT 'auditoria_remesa_b6', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM auditoria_remesa_b6 t
    ) x
  `
  equal(rows.length, 1, 'Snapshot B6 no disponible')
  return rows[0].snapshot
}

async function fixtureCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number | string }>>`
    SELECT (
      (SELECT count(*) FROM usuarios_admin WHERE email = ${`${TAG.toLowerCase()}@example.invalid`}) +
      (SELECT count(*) FROM cuentas_bancarias WHERE iban = ${IBAN}) +
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM remesas WHERE nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM facturas WHERE serie_factura = ${TAG}) +
      (SELECT count(*) FROM facturas_emitidas WHERE num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM documentos_conciliables d
        LEFT JOIN remesas r ON r.id = d.remesa_id
        LEFT JOIN facturas_emitidas fi ON fi.id = d.factura_emitida_id
        WHERE r.nombre LIKE ${`${TAG}%`} OR fi.num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM estado_justificacion_movimientos e
        JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM vinculos_movimiento_documento v
        JOIN movimientos_bancarios m ON m.id = v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM operaciones_justificacion_b4 o
        JOIN movimientos_bancarios m ON m.id = o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM eventos_justificacion_b4 e
        JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM asignaciones_devolucion_remesa_b6 a
        JOIN remesas r ON r.id = a.remesa_id WHERE r.nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM auditoria_remesa_b6 a
        JOIN remesas r ON r.id = a.remesa_id WHERE r.nombre LIKE ${`${TAG}%`})
    )::bigint AS total
  `
  return Number(rows[0]?.total ?? 0)
}

async function expectB6(code: string, status: number, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B6RemesaServiceError, `Se esperaba B6RemesaServiceError ${code}`)
    equal(error.status, status, `Estado HTTP inesperado para ${code}`)
    equal(error.code, code, `Código B6 inesperado`)
    return
  }
  assert.fail(`Debía rechazarse con ${code}`)
}

/** A trigger error aborts only the savepoint; the enclosing rollback test remains usable. */
async function sqlBlocked(tx: Tx, savepoint: string, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  let rejected = false
  try {
    await work()
  } catch {
    rejected = true
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  }
  assert(rejected, `La guarda SQL debía bloquear ${savepoint}`)
}

/** Source snapshot excluding the one B6 membership field. */
async function facturaOriginalShape(tx: Tx, id: number) {
  const rows = await tx.$queryRaw<Array<{ sinRemesa: unknown; remesaId: number | null }>>`
    SELECT to_jsonb(f) - 'remesa_id' AS "sinRemesa", f.remesa_id AS "remesaId"
    FROM facturas f WHERE f.id = ${id}
  `
  equal(rows.length, 1, 'Factura sintética no disponible')
  return rows[0]
}

async function issuedOriginalShape(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<Array<{ source: unknown }>>`
    SELECT to_jsonb(fi) AS source FROM facturas_emitidas fi WHERE fi.id = ${id}
  `
  equal(rows.length, 1, 'FI sintética no disponible')
  return rows[0].source
}

async function currentRefundCount(tx: Tx, assignmentId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ total: bigint | number | string }>>`
    SELECT count(*)::bigint AS total
    FROM asignaciones_devolucion_remesa_b6 a
    JOIN vinculos_movimiento_documento v ON v.id = a.vinculo_id AND v.activo = true
    JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
      AND d.activo = true AND d.tipo = 'REMESA'::"TipoDocumentoConciliable"
    JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
      AND o.estado = 'APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id = a.movimiento_id
      AND e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE a.id = CAST(${assignmentId} AS uuid)
  `
  return Number(rows[0]?.total ?? 0)
}

async function run() {
  if (process.env.B6_ROLLBACK_TEST !== '1') throw new Error('B6_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('FINANCE_STAGING_SANDBOX=1 es obligatorio')

  // Sole pre-transaction I/O: fail closed on the isolated database and role. No
  // connection URL, private identity, source row or monetary value is printed.
  const identity = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  equal(identity[0]?.db, 'io_staging_finanzas', 'La prueba sólo admite io_staging_finanzas')
  equal(identity[0]?.usuario, 'io_staging_finanzas', 'La prueba sólo admite el rol aislado')

  const before = await snapshot()
  equal(await fixtureCount(), 0, 'Colisión improbable de marcador B6')

  const singleton = prisma as any
  const realTransaction = singleton.$transaction.bind(singleton)
  let reachedSentinel = false
  let assertions = 0

  try {
    await realTransaction(async (tx: Tx) => {
      // Both B6 and B4 import this singleton. Route their inner transactions and
      // staging-isolation SELECTs to the enclosing transaction: no service may
      // independently commit a fixture. Always restore the singleton in finally.
      const saved = { transaction: singleton.$transaction, queryRaw: singleton.$queryRaw }
      singleton.$transaction = async (callback: (serviceTx: Tx) => Promise<unknown>) => callback(tx)
      singleton.$queryRaw = tx.$queryRaw.bind(tx)

      try {
        // B4's reviewed cross-row guards are deferrable: keep their normal
        // transaction semantics while confirmarB4 writes its operation, lines and
        // current state in sequence, then force all checks immediately below.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
        const actor = await tx.usuarioAdmin.findFirst({
          where: { activo: true, rol: 'SUPER_ADMIN' }, select: { id: true }, take: 1,
        })
        assert(actor, 'Se requiere un SUPER_ADMIN activo preexistente; la prueba no crea un actor con privilegios')
        const actorId = actor.id
        const inactive = await tx.usuarioAdmin.create({
          data: {
            email: `${TAG.toLowerCase()}@example.invalid`, passwordHash: '$2b$12$B6RollbackOnlySyntheticHash',
            nombre: `${TAG}-INACTIVO`, rol: 'VISOR', roles: [], activo: false,
          }, select: { id: true },
        })

        let nextIsp = Number(`17${String(Date.now()).slice(-7)}`)
        let sequence = 0
        const nextIspId = () => {
          nextIsp += 1
          return nextIsp
        }
        const day = (minutes: number) => new Date(DAY.getTime() + minutes * 60_000)

        const remesa = async (label: string, totalCentimos: number) => tx.remesa.create({
          data: {
            ispGestionId: nextIspId(), nombre: `${TAG}-${label}`, fecha: DAY,
            totalImporte: centsAsDecimal(totalCentimos), numeroRegistros: 1,
          }, select: { id: true, ispGestionId: true },
        })
        const factura = async (label: string, totalCentimos: number, remesaId: number | null = null) => tx.factura.create({
          data: {
            ispGestionId: nextIspId(), serieFactura: TAG, numeroDocumento: `${label}-${randomUUID()}`,
            fecha: DAY, idCliente: nextIspId(), codigoCliente: `${TAG}-${label}`,
            nombreCompleto: `${TAG}-${label}`, base: centsAsDecimal(totalCentimos), totalImpuesto: '0.00',
            total: centsAsDecimal(totalCentimos), situacion: 'PENDIENTE', totalPendiente: centsAsDecimal(totalCentimos),
            ...(remesaId === null ? {} : { remesaId }),
          }, select: { id: true, ispGestionId: true },
        })
        const emitted = async (label: string, totalCentimos: number, facturaISPId: number) => tx.facturaEmitida.create({
          data: {
            id: randomUUID(), cliente: `${TAG}-${label}`, cif: `${TAG}-CIF`, numFactura: `${TAG}-${label}-${randomUUID()}`,
            fecha: day(++sequence), base: totalCentimos / 100, importeIva: 0, total: totalCentimos / 100,
            facturaISPId,
          }, select: { id: true },
        })
        const account = await tx.cuentaBancaria.create({
          data: { id: randomUUID(), banco: `${TAG}-BANCO`, iban: IBAN, alias: `${TAG}-CUENTA`, activa: true },
          select: { id: true },
        })
        const movement = async (label: string, cents: number) => {
          const id = randomUUID()
          const moment = day(++sequence)
          await tx.movimientoBancario.create({ data: {
            id, cuentaId: account.id, fechaOperacion: moment, fechaValor: moment,
            concepto: `${TAG}-${label}`, importe: cents / 100, hashUnico: `${TAG}-${label}-${randomUUID()}`,
            referencia: `${TAG}-${label}`, tercero: `${TAG}-TERCERO`,
          } })
          return id
        }
        const associateInput = (remesaRow: { id: number; ispGestionId: number }, invoiceRows: Array<{ id: number; ispGestionId: number; totalCentimos: number }>, key = randomUUID(), expectedTotal?: number) => ({
          action: 'asociar_facturas' as const,
          remesaId: remesaRow.id,
          facturaIdsISP: invoiceRows.map((row) => row.id),
          confirmacion: true as const,
          idempotencyKey: key,
          expectedRemesaTotalCentimos: expectedTotal ?? invoiceRows.reduce((sum, row) => sum + row.totalCentimos, 0),
          expectedRemesaHashSHA256: remesaSourceFingerprint({
            id: remesaRow.id, ispGestionId: remesaRow.ispGestionId, fecha: isoDate(DAY),
            totalCentimos: expectedTotal ?? invoiceRows.reduce((sum, row) => sum + row.totalCentimos, 0),
          }),
          expectedFacturasHashSHA256: facturasSourceHash(invoiceRows.map((row) => ({
            id: row.id, ispGestionId: row.ispGestionId, fecha: isoDate(DAY), totalCentimos: row.totalCentimos,
          }))),
        })
        const b4Confirm = async (movimientoId: string, importeMovimientoCentimos: number, lineas: unknown[]) => {
          return await confirmarB4(actorId, {
            action: 'confirmar', confirmacion: true, idempotencyKey: randomUUID(), version: 1,
            borrador: { movimientoId, importeMovimientoCentimos, estado: 'JUSTIFICADO', lineas },
          }) as any
        }

        // Association source: exactly one new Factura plus its actual explicit FI
        // mirror. The service may only write facturas.remesa_id, never legacy data.
        const associationRemesa = await remesa('ASOCIACION', 10_000)
        const associationFactura = await factura('ASOCIACION-100', 10_000)
        const associationFi = await emitted('ASOCIACION-FI', 10_000, associationFactura.id)
        const associationBefore = await facturaOriginalShape(tx, associationFactura.id)
        const associationFiBefore = await issuedOriginalShape(tx, associationFi.id)
        const associationKey = randomUUID()
        const associationPayload = associateInput(associationRemesa, [{ ...associationFactura, totalCentimos: 10_000 }], associationKey)
        const association: any = await confirmarAsociacionFacturasRemesaB6(actorId, associationPayload)
        equal(association.idempotente, false)
        equal(association.resultado.sumaFacturasCentimos, 10_000)
        equal(association.resultado.totalRemesaCentimos, 10_000)
        equal(association.resultado.facturaIdsISP.length, 1)
        const associationAfter = await facturaOriginalShape(tx, associationFactura.id)
        assert.deepEqual(associationAfter.sinRemesa, associationBefore.sinRemesa, 'Sólo remesa_id puede cambiar en la nueva Factura ISP')
        equal(associationBefore.remesaId, null)
        equal(associationAfter.remesaId, associationRemesa.id)
        assert.deepEqual(await issuedOriginalShape(tx, associationFi.id), associationFiBefore, 'La FI espejo es sólo lectura')
        assertions += 1

        // The persisted sourceHash is immutable source evidence, distinct from
        // request/payload hashes and deliberately independent of membership.
        const associationSourceHash = canonicalSha256({
          version: B6_AUDIT_SCHEMA_VERSION,
          remesa: { id: associationRemesa.id, ispGestionId: associationRemesa.ispGestionId, fecha: isoDate(DAY), totalCentimos: 10_000 },
          facturas: [{ id: associationFactura.id, ispGestionId: associationFactura.ispGestionId, fecha: isoDate(DAY), totalCentimos: 10_000 }],
        })
        const associationAudit = await tx.$queryRaw<Array<{ sourceHash: string }>>`
          SELECT source_hash AS "sourceHash" FROM auditoria_remesa_b6 WHERE id = CAST(${association.auditoriaId} AS uuid)
        `
        equal(associationAudit.length, 1)
        equal(associationAudit[0].sourceHash, associationSourceHash)
        equal(association.resultado.sourceSnapshot.sourceHash, associationSourceHash)
        assertions += 1

        // Replay comes before mutable source reads. An intentionally stale source
        // edit cannot change the immutable result; reusing the key with a changed
        // payload is nevertheless rejected.
        await tx.$executeRaw`
          UPDATE facturas SET total = CAST(${'101.00'} AS numeric) WHERE id = ${associationFactura.id}
        `
        const replay: any = await confirmarAsociacionFacturasRemesaB6(actorId, associationPayload)
        equal(replay.idempotente, true)
        assert.deepEqual(replay.resultado, association.resultado, 'El replay conserva el snapshot comprometido aunque la fuente cambie')
        await expectB6('IDEMPOTENCY_PAYLOAD_MISMATCH', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, {
          ...associationPayload, expectedRemesaTotalCentimos: 10_001,
        }))
        assertions += 1

        // Explicit stale request hash and stale remittance total are distinct 409
        // cases, each based on the current locked synthetic source.
        const staleHashRemesa = await remesa('FUENTE-STALE', 2_500)
        const staleHashFactura = await factura('FUENTE-STALE', 2_500)
        const staleHashPayload = associateInput(staleHashRemesa, [{ ...staleHashFactura, totalCentimos: 2_500 }])
        await expectB6('FUENTE_FACTURAS_CAMBIADA', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, {
          ...staleHashPayload,
          expectedFacturasHashSHA256: facturasSourceHash([{ id: staleHashFactura.id, ispGestionId: staleHashFactura.ispGestionId, fecha: isoDate(DAY), totalCentimos: 2_499 }]),
        }))
        const staleRemesa = await remesa('REMESA-STALE', 2_500)
        const staleRemesaFactura = await factura('REMESA-STALE', 2_500)
        const staleRemesaPayload = associateInput(staleRemesa, [{ ...staleRemesaFactura, totalCentimos: 2_500 }], randomUUID(), 2_499)
        await expectB6('TOTAL_REMESA_CAMBIADO', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, staleRemesaPayload))
        assertions += 1

        // A negative source closes a negative remittance exactly: neither service
        // nor source hash may abs() it.
        const creditRemesa = await remesa('CREDITO', -2_500)
        const creditFactura = await factura('CREDITO', -2_500)
        const credit: any = await confirmarAsociacionFacturasRemesaB6(actorId, associateInput(creditRemesa, [{ ...creditFactura, totalCentimos: -2_500 }]))
        equal(credit.resultado.sumaFacturasCentimos, -2_500)
        equal(credit.resultado.totalRemesaCentimos, -2_500)
        assertions += 1

        // Existing target membership must be complete, and an invoice already in
        // another remittance cannot be reassigned by B6.
        const incompleteFactura = await factura('MEMBRESIA-INCOMPLETA', 10_000)
        await expectB6('MEMBRESIA_EXISTENTE_INCOMPLETA', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, associateInput(
          associationRemesa, [{ ...incompleteFactura, totalCentimos: 10_000 }], randomUUID(), 10_000,
        )))
        const membershipTarget = await remesa('DESTINO-OTRA', 10_000)
        const otherRemesa = await remesa('OTRA', 10_000)
        const alreadyOther = await factura('YA-OTRA', 10_000, otherRemesa.id)
        await expectB6('FACTURA_YA_EN_OTRA_REMESA', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, associateInput(
          membershipTarget, [{ ...alreadyOther, totalCentimos: 10_000 }], randomUUID(), 10_000,
        )))
        assertions += 1

        // Actor checks happen inside the patched transaction and an inactive actor
        // cannot reach either source membership or B6 writes.
        await expectB6('ACTOR_NO_AUTORIZADO', 403, () => confirmarAsociacionFacturasRemesaB6(inactive.id, associateInput(
          staleHashRemesa, [{ ...staleHashFactura, totalCentimos: 2_500 }], randomUUID(), 2_500,
        )))
        assertions += 1

        // Mixed direct-FI/remittance B4 funding is an explicit conflict rather
        // than an inferred financing split. It uses real B4 confirmations.
        const mixedRemesa = await remesa('MIXTA', 1_000)
        const mixedFactura = await factura('MIXTA', 1_000)
        const mixedFi = await emitted('MIXTA-FI', 1_000, mixedFactura.id)
        const mixedRemesaDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'REMESA', sourceId: String(mixedRemesa.id) })
        const mixedFiDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'FACTURA_EMITIDA', sourceId: mixedFi.id })
        await b4Confirm(await movement('MIXTA-REMESA', 1_000), 1_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: mixedRemesaDoc.documento.id, importeCentimos: 1_000 },
        ])
        await b4Confirm(await movement('MIXTA-FI', 1_000), 1_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: mixedFiDoc.documento.id, importeCentimos: 1_000 },
        ])
        await expectB6('FINANCIACION_DIRECTA_Y_REMESA_REQUIERE_REVISION', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, associateInput(
          mixedRemesa, [{ ...mixedFactura, totalCentimos: 1_000 }], randomUUID(), 1_000,
        )))
        assertions += 1

        // Refund proof begins only after one real B4 full initial remittance
        // collection. The refund has one negative REMESA principal and an explicit
        // separate commission: principal (-90.00) is intentionally not bank (-95.00).
        const refundRemesa = await remesa('DEVOLUCION', 10_000)
        const refundFactura = await factura('DEVOLUCION-PRINCIPAL', 9_500)
        const refundRemainder = await factura('DEVOLUCION-RESTO', 500)
        const refundAssociation: any = await confirmarAsociacionFacturasRemesaB6(actorId, associateInput(refundRemesa, [
          { ...refundFactura, totalCentimos: 9_500 }, { ...refundRemainder, totalCentimos: 500 },
        ], randomUUID(), 10_000))
        equal(refundAssociation.resultado.sumaFacturasCentimos, 10_000)
        const refundDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'REMESA', sourceId: String(refundRemesa.id) })
        equal(refundDoc.documento.importeObjetivoCentimos, 10_000)
        await b4Confirm(await movement('DEVOLUCION-COBRO-INICIAL', 10_000), 10_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: refundDoc.documento.id, importeCentimos: 10_000 },
        ])
        const refundMovement = await movement('DEVOLUCION-COMISION', -9_500)
        const refundB4: any = await b4Confirm(refundMovement, -9_500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: refundDoc.documento.id, importeCentimos: -9_000 },
          { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -500 },
        ])
        const refundLines = await tx.vinculoMovimientoDocumento.findMany({
          where: { operacionCreacionId: refundB4.operacion.id, activo: true },
          select: { id: true, importeCentimos: true, tipoLinea: true }, orderBy: { id: 'asc' },
        })
        equal(refundLines.filter((line: any) => line.tipoLinea === 'DOCUMENTO').length, 1)
        const refundPrincipal = refundLines.find((line: any) => line.tipoLinea === 'DOCUMENTO')
        assert(refundPrincipal, 'La devolución B4 requiere su línea REMESA principal real')
        equal(refundPrincipal.importeCentimos, -9_000)
        const refundPayload = {
          action: 'asociar_devolucion' as const, remesaId: refundRemesa.id, facturaISPId: refundFactura.id,
          vinculoId: refundPrincipal.id, movimientoId: refundMovement, confirmacion: true as const, idempotencyKey: randomUUID(),
        }
        const refund: any = await confirmarAsociacionDevolucionRemesaB6(actorId, refundPayload)
        equal(refund.idempotente, false)
        equal(refund.resultado.importeCentimos, -9_000, 'B6 conserva sólo el principal, no prorratea ni absorbe la comisión')
        equal(refund.resultado.sourceSnapshot.capacidadRestanteCentimos, 500)
        equal(await currentRefundCount(tx, refund.resultado.asignacionId), 1)
        assertions += 1

        // Durable duplicate evidence is rejected even with a fresh idempotency key.
        await expectB6('VINCULO_B4_YA_ASIGNADO', 409, () => confirmarAsociacionDevolucionRemesaB6(actorId, {
          ...refundPayload, idempotencyKey: randomUUID(),
        }))

        // Run the deferred DDL proof now while the real B4 link remains current.
        // A later B4 undo must not re-run this INSERT-only guard.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')

        // A
        // A fresh B4 refund with one REMESA document line can still exceed the
        // selected invoice capacity. B6 rejects whole-line proration before
        // assigning/auditing; the surrounding B4 evidence stays valid.
        const overRemesa = await remesa('SOBRECAPACIDAD', 10_000)
        const overFactura = await factura('SOBRECAPACIDAD-OBJETIVO', 5_000)
        const overRemainder = await factura('SOBRECAPACIDAD-RESTO', 5_000)
        await confirmarAsociacionFacturasRemesaB6(actorId, associateInput(overRemesa, [
          { ...overFactura, totalCentimos: 5_000 }, { ...overRemainder, totalCentimos: 5_000 },
        ], randomUUID(), 10_000))
        const overDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'REMESA', sourceId: String(overRemesa.id) })
        await b4Confirm(await movement('SOBRECAPACIDAD-COBRO-INICIAL', 10_000), 10_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: overDoc.documento.id, importeCentimos: 10_000 },
        ])
        const overMovement = await movement('SOBRECAPACIDAD-DEVOLUCION', -6_000)
        const overB4: any = await b4Confirm(overMovement, -6_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: overDoc.documento.id, importeCentimos: -6_000 },
        ])
        const overLine = await tx.vinculoMovimientoDocumento.findFirst({
          where: { operacionCreacionId: overB4.operacion.id, activo: true, tipoLinea: 'DOCUMENTO' }, select: { id: true },
        })
        assert(overLine, 'La evidencia B4 de sobrecapacidad debe contener una sola línea documental real')
        await expectB6('DEVOLUCION_EXCEDE_FACTURA', 422, () => confirmarAsociacionDevolucionRemesaB6(actorId, {
          action: 'asociar_devolucion', remesaId: overRemesa.id, facturaISPId: overFactura.id,
          vinculoId: overLine.id, movimientoId: overMovement, confirmacion: true, idempotencyKey: randomUUID(),
        }))
        assertions += 1

        // The B6 service itself re-computes exact B4 closure and document count.
        // A second actual DOCUMENTO line cannot be hidden as a remittance refund.
        const twoLineRemesa = await remesa('DOS-DOCUMENTOS', 10_000)
        const twoLineFactura = await factura('DOS-DOCUMENTOS-OBJETIVO', 10_000)
        const twoLineFiSource = await factura('DOS-DOCUMENTOS-FI-ISP', -500)
        const twoLineFi = await emitted('DOS-DOCUMENTOS-FI', -500, twoLineFiSource.id)
        await confirmarAsociacionFacturasRemesaB6(actorId, associateInput(twoLineRemesa, [
          { ...twoLineFactura, totalCentimos: 10_000 },
        ], randomUUID(), 10_000))
        const twoLineRemesaDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'REMESA', sourceId: String(twoLineRemesa.id) })
        const twoLineFiDoc: any = await createDocumentoB4(actorId, { action: 'documento', tipoDocumento: 'FACTURA_EMITIDA', sourceId: twoLineFi.id })
        await b4Confirm(await movement('DOS-DOCUMENTOS-COBRO-INICIAL', 10_000), 10_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: twoLineRemesaDoc.documento.id, importeCentimos: 10_000 },
        ])
        const twoLineMovement = await movement('DOS-DOCUMENTOS-DEVOLUCION', -9_500)
        const twoLineB4: any = await b4Confirm(twoLineMovement, -9_500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: twoLineRemesaDoc.documento.id, importeCentimos: -9_000 },
          { tipo: 'DOCUMENTO', documentoConciliableId: twoLineFiDoc.documento.id, importeCentimos: -500 },
        ])
        const twoLinePrincipal = await tx.vinculoMovimientoDocumento.findFirst({
          where: { operacionCreacionId: twoLineB4.operacion.id, activo: true, documentoConciliableId: twoLineRemesaDoc.documento.id },
          select: { id: true },
        })
        assert(twoLinePrincipal, 'Se requiere la línea REMESA real para probar la guarda de documento único')
        await expectB6('IMPORTE_BANCO_VINCULO_INVALIDO', 422, () => confirmarAsociacionDevolucionRemesaB6(actorId, {
          action: 'asociar_devolucion', remesaId: twoLineRemesa.id, facturaISPId: twoLineFactura.id,
          vinculoId: twoLinePrincipal.id, movimientoId: twoLineMovement, confirmacion: true, idempotencyKey: randomUUID(),
        }))
        assertions += 1

        // The new request fingerprint protects remittance identity/date/total in
        // addition to the signed total field and invoice-source fingerprint.
        const hashRemesa = await remesa('HUELLA-REMESA', 1_000)
        const hashFactura = await factura('HUELLA-REMESA', 1_000)
        const hashPayload = associateInput(hashRemesa, [{ ...hashFactura, totalCentimos: 1_000 }])
        await expectB6('FUENTE_REMESA_CAMBIADA', 409, () => confirmarAsociacionFacturasRemesaB6(actorId, {
          ...hashPayload,
          expectedRemesaHashSHA256: remesaSourceFingerprint({
            id: hashRemesa.id, ispGestionId: hashRemesa.ispGestionId, fecha: '2042-01-03', totalCentimos: 1_000,
          }),
        }))
        assertions += 1

        // B6 tables are append-only. Each prohibited DML is isolated by a
        // savepoint so trigger failure never aborts the outer rollback-only test.
        await sqlBlocked(tx, 'b6_asignacion_update', () => tx.$executeRaw`
          UPDATE asignaciones_devolucion_remesa_b6 SET estado = 'CONFIRMADA'::"EstadoAsignacionDevolucionRemesaB6"
          WHERE id = CAST(${refund.resultado.asignacionId} AS uuid)
        `)
        await sqlBlocked(tx, 'b6_asignacion_delete', () => tx.$executeRaw`
          DELETE FROM asignaciones_devolucion_remesa_b6 WHERE id = CAST(${refund.resultado.asignacionId} AS uuid)
        `)
        await sqlBlocked(tx, 'b6_auditoria_update', () => tx.$executeRaw`
          UPDATE auditoria_remesa_b6 SET snapshot_resultado = '{}'::jsonb WHERE id = CAST(${refund.auditoriaId} AS uuid)
        `)
        await sqlBlocked(tx, 'b6_auditoria_delete', () => tx.$executeRaw`
          DELETE FROM auditoria_remesa_b6 WHERE id = CAST(${refund.auditoriaId} AS uuid)
        `)
        assertions += 1

        // The B6 assignment/audit is immutable history, but current capacity must
        // follow current B4 evidence. B4 deshacer is intentionally not blocked by
        // B6's INSERT-only proof, and turns the B6 current-count to zero.
        const refundAuditBeforeUndo = await tx.auditoriaRemesaB6.count({ where: { id: refund.auditoriaId } })
        equal(refundAuditBeforeUndo, 1)
        equal(await tx.asignacionDevolucionRemesaB6.count({ where: { id: refund.resultado.asignacionId } }), 1)
        const undo = await deshacerB4(actorId, {
          action: 'deshacer', confirmacion: true, idempotencyKey: randomUUID(), version: refundB4.estado.version,
          operacionId: refundB4.operacion.id,
          lineas: refundLines.map((line: any) => ({ id: line.id, importeCentimos: line.importeCentimos })),
        }) as any
        equal(undo.idempotente, false)
        equal(await tx.auditoriaRemesaB6.count({ where: { id: refund.auditoriaId } }), 1, 'B4 deshacer no borra auditoría B6')
        equal(await tx.asignacionDevolucionRemesaB6.count({ where: { id: refund.resultado.asignacionId } }), 1, 'B4 deshacer no borra el hecho B6')
        equal(await currentRefundCount(tx, refund.resultado.asignacionId), 0, 'La devolución deja de contar al revertirse su evidencia B4')
        equal(await tx.vinculoMovimientoDocumento.count({ where: { operacionCreacionId: refundB4.operacion.id, activo: true } }), 0)
        assertions += 1

        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        reachedSentinel = true
        throw new RollbackSentinel()
      } finally {
        singleton.$transaction = saved.transaction
        singleton.$queryRaw = saved.queryRaw
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 20_000, timeout: 240_000 })
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error
  }

  assert(reachedSentinel, 'La transacción no alcanzó el rollback obligatorio')
  assert(assertions >= 13, 'Cobertura B6 PostgreSQL incompleta')
  equal(await fixtureCount(), 0, 'El rollback dejó fixtures B6 sintéticos')
  assert.deepEqual(await snapshot(), before, 'Cambió algún dato preexistente tras el rollback B6')
  console.log(`B6 PostgreSQL: ${assertions} invariantes de servicio/DDL verificadas con rollback íntegro.`)
}

run()
  .catch(() => {
    // Never emit credentials, cookies, financial source rows, private identities or amounts.
    console.error('La prueba B6 PostgreSQL no se completó; no se ha autorizado ninguna persistencia.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
