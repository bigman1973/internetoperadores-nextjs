import 'dotenv/config'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import {
  B4ServiceError,
  confirmarB4,
  createB8CurrentSourceValidator,
  createDocumentoB4,
  deshacerB4,
} from '../lib/finanzas/reconciliation-db'
import { solicitudB4SinCentroCosteFinanzas } from '../lib/finanzas/reconciliation-core'
import {
  asignarCentroCosteFinanzas,
  B8CentroCosteServiceError,
  crearCentroCosteFinanzas,
  leerAnaliticaCentrosCoste,
} from '../lib/finanzas/centros-coste-db'
import { eleccionesDesdeLineasB4, metadataHashEleccionesCentro, sha256Canonical } from '../lib/finanzas/centros-coste-core'

/**
 * B8 PostgreSQL integration test.  It is intentionally inert unless explicitly
 * authorized after the reviewed B4+B8 DDL is installed in io_staging_finanzas:
 *
 * FINANCE_STAGING_SANDBOX=1 B8_ROLLBACK_TEST=1 npx tsx scripts/test-finance-b8-postgres.ts
 *
 * Every synthetic user, account, movement, manual FI, B4 operation and B8 row
 * exists only in one outer SERIALIZABLE transaction.  RollbackSentinel is the
 * only successful exit from that transaction.  No fixture, identity, source
 * value, connection value, or baseline data is printed.
 */

type Tx = any
type Snapshot = Record<string, Readonly<{ count: number; hmacSha256: string }>>

const DAY = new Date('2042-01-02T09:00:00.000Z')
const TAG = `B8-ROLLBACK-${randomUUID()}`
const CODE_TAG = TAG.replace(/[^A-Z0-9]/g, '')
const CENTRO_A_CODIGO = `${CODE_TAG}A`
const CENTRO_B_CODIGO = `${CODE_TAG}B`
const FAKE_IBAN = `ES00${TAG.replaceAll('-', '')}`
const SNAPSHOT_HMAC_KEY = `private-baseline:${TAG}`

class RollbackSentinel extends Error {
  constructor() { super('B8_ROLLBACK_ONLY') }
}

function equal<T>(actual: T, expected: T, message?: string): asserts actual is T {
  assert.equal(actual, expected, message)
}

/**
 * Full jsonb row text is PostgreSQL's canonical JSONB representation.  The HMAC
 * stays private in process memory; only count/HMAC are retained for before/after.
 * `vinculos_movimiento_documento` is deliberately included, so B8 FK/version
 * fields are covered together with all B4 fields on the same historical ledger.
 */
const SNAPSHOT_TABLES = [
  'usuarios_admin',
  'cuentas_bancarias',
  'movimientos_bancarios',
  'facturas_emitidas',
  'documentos_conciliables',
  'estado_justificacion_movimientos',
  'vinculos_movimiento_documento',
  'operaciones_justificacion_b4',
  'eventos_justificacion_b4',
  'centros_coste_finanzas',
  'auditorias_centros_coste_finanzas_b8',
  'recibos_eleccion_centro_b8',
] as const

async function financialSnapshot(): Promise<Snapshot> {
  const result: Snapshot = {}
  for (const table of SNAPSHOT_TABLES) {
    // Table names are a closed local constant, never caller input.  No selected
    // row is logged or returned to the caller; it feeds only the private HMAC.
    const rows = await prisma.$queryRawUnsafe<Array<{ canonical: string }>>(`
      SELECT to_jsonb(t)::text AS canonical
      FROM "${table}" t
      ORDER BY to_jsonb(t)::text
    `)
    const hmac = createHmac('sha256', SNAPSHOT_HMAC_KEY).update(`${table}\u0000`, 'utf8')
    for (const row of rows) hmac.update(row.canonical).update('\n')
    result[table] = { count: rows.length, hmacSha256: hmac.digest('hex') }
  }
  return result
}

/** Counts only marker-linked synthetic facts; it never returns source data. */
async function fixtureCount(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint | number | string }>>`
    SELECT (
      (SELECT count(*) FROM usuarios_admin WHERE nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM cuentas_bancarias WHERE iban = ${FAKE_IBAN}) +
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM facturas_emitidas WHERE num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM documentos_conciliables d
        JOIN facturas_emitidas fi ON fi.id = d.factura_emitida_id
        WHERE fi.num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM estado_justificacion_movimientos e
        JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM vinculos_movimiento_documento v
        JOIN movimientos_bancarios m ON m.id = v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM operaciones_justificacion_b4 o
        JOIN movimientos_bancarios m ON m.id = o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM eventos_justificacion_b4 e
        JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM centros_coste_finanzas WHERE codigo IN (${CENTRO_A_CODIGO}, ${CENTRO_B_CODIGO})) +
      (SELECT count(*) FROM auditorias_centros_coste_finanzas_b8 a
        JOIN usuarios_admin u ON u.id = a.actor_id WHERE u.nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM recibos_eleccion_centro_b8 r
        JOIN usuarios_admin u ON u.id = r.actor_id WHERE u.nombre LIKE ${`${TAG}%`})
    )::bigint AS total
  `
  return Number(rows[0]?.total ?? 0)
}

async function expectB4(code: string, status: number, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B4ServiceError, `Se esperaba B4ServiceError ${code}`)
    equal(error.status, status, `Estado HTTP inesperado para ${code}`)
    equal(error.code, code, `Código B4 inesperado`)
    return
  }
  assert.fail(`Debía rechazarse con ${code}`)
}

async function expectB8(code: string, status: number, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B8CentroCosteServiceError, `Se esperaba B8CentroCosteServiceError ${code}`)
    equal(error.status, status, `Estado HTTP inesperado para ${code}`)
    equal(error.code, code, `Código B8 inesperado`)
    return
  }
  assert.fail(`Debía rechazarse con ${code}`)
}

async function validateDeferredGuardsBeforeLaterOperation(tx: Tx) {
  // B8's constraint trigger is UPDATE OF centre/version and is INITIALLY
  // DEFERRED.  This emulates the commit of the confirmation/PATCH before a
  // later B4 deshacer while preserving the single outer rollback transaction.
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
}

function receiptMapping(value: any): unknown[] {
  const mapping = value?.mapping
  assert(Array.isArray(mapping), 'El recibo B8 debe conservar mapping como array')
  return mapping
}

async function primaryFacts(tx: Tx, linkId: string, operationId: string) {
  const db = tx as any
  const [line, receipts, audits] = await Promise.all([
    db.vinculoMovimientoDocumento.findUnique({
      where: { id: linkId },
      select: { id: true, activo: true, importeCentimos: true, centroCosteFinanzasId: true, versionCentroCoste: true, operacionCreacionId: true, operacionAnulacionId: true },
    }),
    db.reciboEleccionCentroB8.count({ where: { operacionB4Id: operationId } }),
    db.auditoriaCentroCosteFinanzasB8.count({ where: { vinculoMovimientoDocumentoId: linkId } }),
  ])
  return { line, receipts, audits }
}

async function run() {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('FINANCE_STAGING_SANDBOX=1 es obligatorio')
  if (process.env.B8_ROLLBACK_TEST !== '1') throw new Error('B8_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('B8_IN_PRODUCTION_NO_WRITE')

  // The only pre-transaction database read.  It fails closed before any fixture
  // exists and does not disclose a URL, secrets, rows, or identity in output.
  const identity = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  equal(identity[0]?.db, 'io_staging_finanzas', 'La prueba sólo admite io_staging_finanzas')
  equal(identity[0]?.usuario, 'io_staging_finanzas', 'La prueba sólo admite el rol io_staging_finanzas')

  const before = await financialSnapshot()
  equal(await fixtureCount(), 0, 'Colisión improbable de marcador B8')

  const singleton = prisma as any
  const realTransaction = singleton.$transaction.bind(singleton)
  let reachedSentinel = false

  try {
    await realTransaction(async (tx: Tx) => {
      // B4, B8 and staging-safety import the same Prisma singleton.  Every B4/B8
      // service transaction and its safety $queryRaw run on this one outer tx.
      const saved = { transaction: singleton.$transaction, queryRaw: singleton.$queryRaw }
      singleton.$transaction = async (callback: (serviceTx: Tx) => Promise<unknown>) => callback(tx)
      singleton.$queryRaw = tx.$queryRaw.bind(tx)

      try {
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
        const db = tx as any
        let sequence = 0
        const at = (minutes: number) => new Date(DAY.getTime() + minutes * 60_000)

        // Both actors are synthetic rows confined to this transaction.  `email`
        // is a required legacy String column, so it receives a non-email marker;
        // no real actor or email address is selected, used, or printed.
        const superAdmin = await db.usuarioAdmin.create({
          data: {
            email: `${TAG}:SUPER_ADMIN`,
            passwordHash: '$2b$12$B8RollbackOnlySyntheticHash',
            nombre: `${TAG}-SUPER_ADMIN`,
            rol: 'SUPER_ADMIN',
            roles: [],
            activo: true,
          },
          select: { id: true },
        })
        const viewer = await db.usuarioAdmin.create({
          data: {
            email: `${TAG}:VISOR`,
            passwordHash: '$2b$12$B8RollbackOnlySyntheticHash',
            nombre: `${TAG}-VISOR`,
            rol: 'VISOR',
            roles: [],
            activo: true,
          },
          select: { id: true },
        })
        const actorId = superAdmin.id

        // A fake account is the only bank fixture.  Its movements are keyed by
        // TAG and are never joined to or derived from pre-existing finance data.
        const cuentaFake = await db.cuentaBancaria.create({
          data: { id: randomUUID(), banco: `${TAG}-BANCO`, iban: FAKE_IBAN, alias: `${TAG}-CUENTA-FAKE`, activa: true },
          select: { id: true },
        })
        const movement = async (label: string, cents: number) => {
          const id = randomUUID()
          const moment = at(++sequence)
          await db.movimientoBancario.create({
            data: {
              id,
              cuentaId: cuentaFake.id,
              fechaOperacion: moment,
              fechaValor: moment,
              concepto: `${TAG}-${label}`,
              importe: cents / 100,
              hashUnico: `${TAG}-${label}-${randomUUID()}`,
              referencia: `${TAG}-${label}`,
              tercero: `${TAG}-TERCERO`,
            },
          })
          return id
        }

        // Deliberately manual FI 100.00, with no optional facturaISPId: this B8
        // exercise does not create, infer, or audit B7 identity.
        const manualFi100AndDocument = async (label: string) => {
          const fi = await db.facturaEmitida.create({
            data: {
              id: randomUUID(),
              cliente: `${TAG}-CLIENTE-${label}`,
              cif: `${TAG}-CIF`,
              numFactura: `${TAG}-${label}-${randomUUID()}`,
              fecha: at(++sequence),
              base: 100,
              tipoIva: 0,
              importeIva: 0,
              tipoIrpf: 0,
              importeIrpf: 0,
              total: 100,
              concepto: `${TAG}-FI-MANUAL-${label}`,
              estado: 'EMITIDA',
              origenSistema: 'MANUAL_SINTETICO_B8',
            },
            select: { id: true, facturaISPId: true },
          })
          equal(fi.facturaISPId, null, 'La FI B8 debe ser manual y no tener FK ISP opcional')
          const created = await createDocumentoB4(actorId, {
            action: 'documento',
            tipoDocumento: 'FACTURA_EMITIDA',
            sourceId: fi.id,
          }) as any
          assert(created.created, 'El envoltorio B4 de la FI sintética debe ser nuevo')
          equal(created.documento.importeObjetivoCentimos, 10_000, 'FI manual 100.00 debe mantener objetivo firmado de 10000')
          return { fi, documentoId: created.documento.id }
        }

        const confirmDocument = async (movimientoId: string, documentoConciliableId: string, idempotencyKey: string, centroCosteFinanzasId?: string) => {
          const line = {
            tipo: 'DOCUMENTO' as const,
            documentoConciliableId,
            importeCentimos: 10_000,
            ...(centroCosteFinanzasId === undefined ? {} : { centroCosteFinanzasId }),
          }
          const raw = {
            action: 'confirmar' as const,
            confirmacion: true as const,
            idempotencyKey,
            version: 1,
            borrador: { movimientoId, importeMovimientoCentimos: 10_000, estado: 'JUSTIFICADO' as const, lineas: [line] },
          }
          return { raw, result: await confirmarB4(actorId, raw) as any }
        }

        // 1. Catalogue mutation is strictly live SUPER_ADMIN; a synthetic VISOR
        // has no permission record and cannot write it.
        const centroA = await crearCentroCosteFinanzas(actorId, { codigo: CENTRO_A_CODIGO, nombre: `${TAG} Centro A` })
        equal(centroA.centro.version, 1)
        await expectB8('SOLO_SUPER_ADMIN', 403, () => crearCentroCosteFinanzas(viewer.id, {
          codigo: `${CODE_TAG}V`, nombre: `${TAG} Centro Visor`,
        }))

        // 2. A B4 DOCUMENTO confirmation carrying a centre writes B4+B8 atomically.
        // The B4 economic snapshot/hash intentionally excludes only that B8 field.
        const primary = await manualFi100AndDocument('PRIMARIO')
        const primaryMovementId = await movement('DOCUMENTO-CENTRO', 10_000)
        const primaryKey = randomUUID()
        const primaryConfirmed = await confirmDocument(primaryMovementId, primary.documentoId, primaryKey, centroA.centro.id)
        equal(primaryConfirmed.result.idempotente, false)
        const primaryOperationId = primaryConfirmed.result.operacion.id as string
        const primaryLine = await db.vinculoMovimientoDocumento.findFirst({
          where: { operacionCreacionId: primaryOperationId, activo: true, tipoLinea: 'DOCUMENTO' },
          select: { id: true, importeCentimos: true, centroCosteFinanzasId: true, versionCentroCoste: true },
        })
        assert(primaryLine, 'La confirmación B4 debe crear una línea DOCUMENTO')
        equal(primaryLine.importeCentimos, 10_000)
        equal(primaryLine.centroCosteFinanzasId, centroA.centro.id)
        equal(primaryLine.versionCentroCoste, 1)
        equal(await db.auditoriaCentroCosteFinanzasB8.count({ where: { vinculoMovimientoDocumentoId: primaryLine.id } }), 1)
        const primaryReceipt = await db.reciboEleccionCentroB8.findUnique({ where: { operacionB4Id: primaryOperationId } })
        assert(primaryReceipt, 'JUSTIFICADO debe crear recibo B8 incluso antes de replay')
        const primaryOperation = await db.operacionJustificacionB4.findUnique({ where: { id: primaryOperationId } })
        assert(primaryOperation, 'La operación B4 confirmada debe existir')
        const economicBody = solicitudB4SinCentroCosteFinanzas(primaryConfirmed.raw)
        assert.deepEqual(primaryOperation.snapshotSolicitud, economicBody, 'El snapshot B4 no conserva centro B8')
        equal(primaryOperation.payloadHash, sha256Canonical(economicBody), 'El hash B4 es sólo económico')
        assert(!JSON.stringify(primaryOperation.snapshotSolicitud).includes('centroCosteFinanzasId'), 'El snapshot B4 no puede copiar el centro')
        // Validates the deferred UPDATE OF centre/version guard for the B4->B8
        // sequence before the test continues under DEFERRED constraints again.
        await validateDeferredGuardsBeforeLaterOperation(tx)

        // 3. Exact same B4+B8 selection replays without a second receipt or audit.
        const beforeReplay = await primaryFacts(tx, primaryLine.id, primaryOperationId)
        const replay = await confirmarB4(actorId, primaryConfirmed.raw) as any
        equal(replay.idempotente, true)
        assert.deepEqual(await primaryFacts(tx, primaryLine.id, primaryOperationId), beforeReplay, 'Replay no puede crear recibo ni auditoría nueva')

        // 4. Same economic B4 body/key with another centre collides at the separate
        // B8 receipt gate and cannot mutate the original FK/version/history.
        const centroB = await crearCentroCosteFinanzas(actorId, { codigo: CENTRO_B_CODIGO, nombre: `${TAG} Centro B` })
        const differentCentreRaw = {
          ...primaryConfirmed.raw,
          borrador: {
            ...primaryConfirmed.raw.borrador,
            lineas: [{ ...primaryConfirmed.raw.borrador.lineas[0], centroCosteFinanzasId: centroB.centro.id }],
          },
        }
        const beforeCollision = await primaryFacts(tx, primaryLine.id, primaryOperationId)
        await expectB4('B8_PAYLOAD_COLLISION', 409, () => confirmarB4(actorId, differentCentreRaw))
        assert.deepEqual(await primaryFacts(tx, primaryLine.id, primaryOperationId), beforeCollision, 'La colisión B8 no puede mutar B4 ni B8')

        // 5. Omitting a centre is the explicit B8 notselected choice; NO_REQUIERE
        // still receives its immutable empty receipt and never creates a B8 line.
        const notSelected = await manualFi100AndDocument('SIN-CENTRO')
        const notSelectedConfirmed = await confirmDocument(await movement('DOCUMENTO-SIN-CENTRO', 10_000), notSelected.documentoId, randomUUID())
        const notSelectedReceipt = await db.reciboEleccionCentroB8.findUnique({ where: { operacionB4Id: notSelectedConfirmed.result.operacion.id } })
        assert(notSelectedReceipt, 'DOCUMENTO sin centro debe producir recibo B8 notselected')
        const choices = eleccionesDesdeLineasB4(notSelectedConfirmed.raw.borrador.lineas)
        assert(choices.ok, 'La elección sin centro debe canonicalizarse')
        if (choices.ok) equal(notSelectedReceipt.metadataHash, metadataHashEleccionesCentro(choices.value))
        const notSelectedRequestMapping = receiptMapping(notSelectedReceipt.snapshotSolicitud)
        const notSelectedResultMapping = receiptMapping(notSelectedReceipt.snapshotResultado)
        equal((notSelectedRequestMapping[0] as any)?.centroCosteFinanzasId, null)
        equal((notSelectedResultMapping[0] as any)?.centroCosteFinanzasId, null)
        const noRequireConfirmed = await confirmarB4(actorId, {
          action: 'confirmar',
          confirmacion: true,
          idempotencyKey: randomUUID(),
          version: 1,
          borrador: {
            movimientoId: await movement('NO-REQUIERE', 0),
            importeMovimientoCentimos: 0,
            estado: 'NO_REQUIERE',
            motivoNoRequiere: 'MOVIMIENTO_TECNICO_BANCO',
            lineas: [],
          },
        }) as any
        const noRequireReceipt = await db.reciboEleccionCentroB8.findUnique({ where: { operacionB4Id: noRequireConfirmed.operacion.id } })
        assert(noRequireReceipt, 'NO_REQUIERE debe producir recibo B8 de mapping vacío')
        assert.deepEqual(receiptMapping(noRequireReceipt.snapshotSolicitud), [])
        assert.deepEqual(receiptMapping(noRequireReceipt.snapshotResultado), [])

        // 6. Explicit PATCH uses the B8 version and idempotency contract; a stale
        // writer is rejected after current proof without adding an audit.
        const patchKey = randomUUID()
        const patched = await asignarCentroCosteFinanzas(actorId, {
          mode: 'asignar',
          vinculoMovimientoDocumentoId: primaryLine.id,
          centroCosteFinanzasId: centroB.centro.id,
          versionCentroCoste: 1,
          idempotencyKey: patchKey,
        }, createB8CurrentSourceValidator()) as any
        equal(patched.idempotente, false)
        equal(patched.resultado.versionCentroCosteAnterior, 1)
        equal(patched.resultado.versionCentroCosteResultante, 2)
        const patchAudit = await db.auditoriaCentroCosteFinanzasB8.findUnique({
          where: { actorId_idempotencyKey: { actorId, idempotencyKey: patchKey } },
          select: { id: true },
        })
        assert(patchAudit, 'PATCH correcto debe dejar auditoría idempotente')
        equal((await primaryFacts(tx, primaryLine.id, primaryOperationId)).audits, 2)
        await expectB8('VERSION_CONFLICT', 409, () => asignarCentroCosteFinanzas(actorId, {
          mode: 'asignar',
          vinculoMovimientoDocumentoId: primaryLine.id,
          centroCosteFinanzasId: centroA.centro.id,
          versionCentroCoste: 1,
          idempotencyKey: randomUUID(),
        }, createB8CurrentSourceValidator()))
        const afterStalePatch = await primaryFacts(tx, primaryLine.id, primaryOperationId)
        equal(afterStalePatch.line?.centroCosteFinanzasId, centroB.centro.id)
        equal(afterStalePatch.line?.versionCentroCoste, 2)
        equal(afterStalePatch.audits, 2)

        // 7. A mutable manual-FI total no longer matching the B4 wrapper makes the
        // source stale.  No PATCH write succeeds and that line contributes no B8
        // analytical sum; it is a gap, never a synthetic zero.  The fixture source
        // is restored before the later undo evidence test.
        await db.facturaEmitida.update({ where: { id: primary.fi.id }, data: { total: 101 } })
        try {
          await expectB8('B8_DOCUMENT_SOURCE_STALE', 409, () => asignarCentroCosteFinanzas(actorId, {
            mode: 'asignar',
            vinculoMovimientoDocumentoId: primaryLine.id,
            centroCosteFinanzasId: centroA.centro.id,
            versionCentroCoste: 2,
            idempotencyKey: randomUUID(),
          }, createB8CurrentSourceValidator()))
          const staleAnalytic = await leerAnaliticaCentrosCoste({
            actorId,
            fechaCorte: null,
            requiredCurrentSourceValidator: createB8CurrentSourceValidator(),
          }) as any
          assert(!staleAnalytic.items.some((item: any) => item.centroCosteFinanzasId === centroB.centro.id), 'Fuente stale no suma analítica B8')
          assert(staleAnalytic.gaps.some((gap: any) => gap.codigo === 'DOCUMENT_SOURCE_STALE'), 'Fuente stale debe comunicarse como gap')
          const afterStaleSource = await primaryFacts(tx, primaryLine.id, primaryOperationId)
          equal(afterStaleSource.line?.centroCosteFinanzasId, centroB.centro.id)
          equal(afterStaleSource.line?.versionCentroCoste, 2)
          equal(afterStaleSource.audits, 2)
        } finally {
          await db.facturaEmitida.update({ where: { id: primary.fi.id }, data: { total: 100 } })
        }

        // 8. Validate all deferred B4/B8 constraints now (as if the prior B8
        // confirmation/PATCH had committed), then undo B4.  History retains its
        // B8 FK/version, receipt and audits; only current analytics excludes the
        // inactive ledger line.
        await validateDeferredGuardsBeforeLaterOperation(tx)
        const historyBeforeUndo = await primaryFacts(tx, primaryLine.id, primaryOperationId)
        const activeLines = await db.vinculoMovimientoDocumento.findMany({
          where: { operacionCreacionId: primaryOperationId, activo: true },
          select: { id: true, importeCentimos: true },
        })
        equal(activeLines.length, 1)
        const undone = await deshacerB4(actorId, {
          action: 'deshacer',
          confirmacion: true,
          idempotencyKey: randomUUID(),
          version: primaryConfirmed.result.estado.version,
          operacionId: primaryOperationId,
          lineas: activeLines.map((line: any) => ({ id: line.id, importeCentimos: line.importeCentimos })),
        }) as any
        equal(undone.idempotente, false)
        const historyAfterUndo = await primaryFacts(tx, primaryLine.id, primaryOperationId)
        equal(historyAfterUndo.receipts, historyBeforeUndo.receipts)
        equal(historyAfterUndo.audits, historyBeforeUndo.audits)
        equal(historyAfterUndo.line?.activo, false)
        equal(historyAfterUndo.line?.centroCosteFinanzasId, centroB.centro.id, 'B4 deshacer conserva FK B8 histórica')
        equal(historyAfterUndo.line?.versionCentroCoste, 2, 'B4 deshacer conserva versión B8 histórica')
        const afterUndoAnalytic = await leerAnaliticaCentrosCoste({
          actorId,
          fechaCorte: null,
          requiredCurrentSourceValidator: createB8CurrentSourceValidator(),
        }) as any
        assert(!afterUndoAnalytic.items.some((item: any) => item.centroCosteFinanzasId === centroB.centro.id), 'Línea B4 inactiva no entra en analítica actual')
        assert(afterUndoAnalytic.gaps.some((gap: any) => gap.codigo === 'VINCULO_INACTIVO'), 'La exclusión actual debe señalar vínculo inactivo')

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
  equal(await fixtureCount(), 0, 'El rollback dejó fixtures B8 sintéticos')
  assert.deepEqual(await financialSnapshot(), before, 'Cambió algún dato financiero/B4/B8 preexistente tras rollback')
  console.log('B8 PostgreSQL: 8 casos verificados bajo rollback serializable; no persiste ningún fixture.')
}

run()
  .catch(() => {
    // Deliberately no rows, amounts, identities, URLs, environment values, or
    // connection diagnostics are emitted by this rollback-only test.
    console.error('La prueba B8 PostgreSQL no se completó; no se ha autorizado ninguna persistencia.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
