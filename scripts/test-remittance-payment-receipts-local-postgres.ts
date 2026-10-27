/*
 * Integración PostgreSQL LOCAL, opt-in y rollback-only para recibos B7 de abonos
 * parciales de remesa. No carga dotenv, no ejecuta DDL/migraciones, no llama red y
 * nunca usa DATABASE_URL implícita.
 *
 * Uso autorizado (sobre una copia local ya migrada, incluida la adaptación local
 * de la guarda de la migración B7):
 *   REMITTANCE_LOCAL_DATABASE_URL='postgresql://…@127.0.0.1:5432/io_local_conciliar_test_x' \
 *   pnpm exec tsx scripts/test-remittance-payment-receipts-local-postgres.ts
 *
 * Todos los datos son sintéticos y viven dentro de una única transacción
 * SERIALIZABLE que termina obligatoriamente en RollbackSentinel. La salida
 * satisfactoria no contiene IDs, importes, usuarios, URL ni datos financieros.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, writeFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'

type Tx = any
type Db = any

class RollbackSentinel extends Error {
  constructor() { super('REMITTANCE_PAYMENT_RECEIPTS_LOCAL_ROLLBACK_ONLY') }
}

const TAG = `REMESA-RECIBO-LOCAL-${randomUUID()}`
const DAY = new Date(Date.UTC(2044, 1, 3, 12, 0, 0))
const BANK_DAY = new Date(Date.UTC(2044, 1, 4, 12, 0, 0))
// Deliberately later than ordinary fixture dates so this append-only generation is
// the current generation even in a populated local restoration.
const GENERATION_AT = new Date(Date.UTC(2099, 0, 1, 0, 0, 0))
const PRIVATE_ERROR_FILE = '/home/ubuntu/conciliar-emitidas-aprobada-20261027/privado/remesas-local-error.txt'
const FIRST_CENTS = 3_000
const SECOND_CENTS = 7_000
const REMITTANCE_CENTS = FIRST_CENTS + SECOND_CENTS

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function centsDecimal(cents: number): string {
  assert(Number.isSafeInteger(cents), 'Los fixtures requieren céntimos enteros seguros.')
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

function centsFloat(cents: number): number {
  return Number(centsDecimal(cents))
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function localUrl(): { raw: string; database: string } {
  const raw = process.env.REMITTANCE_LOCAL_DATABASE_URL
  assert(raw, 'REMITTANCE_LOCAL_DATABASE_URL es obligatoria; DATABASE_URL implícita nunca se acepta.')
  const url = new URL(raw)
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'La URL debe usar PostgreSQL.')
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  assert(['127.0.0.1', '::1', 'localhost'].includes(host), 'Sólo se permite PostgreSQL local por loopback.')
  assert(url.pathname.length > 1, 'La URL local debe nombrar una base de datos.')
  const database = decodeURIComponent(url.pathname.slice(1))
  assert(
    database === 'io_restore_emitidas_20261027_1025' || /^io_local_conciliar_test(?:_[a-z0-9_]+)?$/i.test(database),
    'La base debe ser la restauración local autorizada o una io_local_conciliar_test sintética.',
  )
  return { raw, database }
}

async function assertLocalIdentity(db: Db, database: string): Promise<void> {
  const rows = await db.$queryRaw<Array<{ database: string; host: string | null }>>`
    SELECT current_database() AS database, host(inet_server_addr()) AS host LIMIT 1
  `
  assert.equal(rows.length, 1, 'La identidad local debe responder exactamente una fila.')
  assert.equal(rows[0]?.database, database, 'La conexión no apunta a la base local autorizada.')
  assert(['127.0.0.1', '::1', null].includes(rows[0]?.host ?? null), 'El servidor PostgreSQL no es loopback local.')
}

async function assertPrerequisites(db: Db): Promise<void> {
  const rows = await db.$queryRaw<Array<{ ready: boolean }>>`
    SELECT (
      to_regclass('public.modo_facil_generaciones_cobro') IS NOT NULL
      AND to_regclass('public.modo_facil_propuestas_cobro') IS NOT NULL
      AND to_regclass('public.recibos_cobro_remesa_b7') IS NOT NULL
      AND to_regclass('public.lineas_recibo_cobro_remesa_b7') IS NOT NULL
      AND to_regprocedure('b7_assert_recibo_cobro_remesa_insertado(uuid)') IS NOT NULL
    ) AS ready
  `
  assert.equal(rows.length, 1, 'No se pudo verificar el esquema local.')
  assert.equal(rows[0]?.ready, true, 'Falta la migración B7 de recibos o sus prerrequisitos locales.')
}

/** Counts only this random fixture marker and all its known descendants. */
async function fixtureCount(db: Db): Promise<number> {
  const rows = await db.$queryRaw<Array<{ total: bigint | number | string }>>`
    SELECT (
      (SELECT count(*) FROM usuarios_admin WHERE email = ${`${TAG.toLowerCase()}@example.invalid`}) +
      (SELECT count(*) FROM cuentas_bancarias WHERE alias = ${TAG}) +
      (SELECT count(*) FROM movimientos_bancarios WHERE hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM remesas WHERE nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM facturas WHERE serie_factura = ${TAG}) +
      (SELECT count(*) FROM facturas_emitidas WHERE num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM identidad_factura_isp_eventos_b7 e
        JOIN facturas_emitidas fi ON fi.id=e.factura_emitida_id WHERE fi.num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM modo_facil_generaciones_cobro WHERE fuente = ${TAG}) +
      (SELECT count(*) FROM modo_facil_propuestas_cobro p
        JOIN modo_facil_generaciones_cobro g ON g.id=p.generacion_id WHERE g.fuente = ${TAG}) +
      (SELECT count(*) FROM documentos_conciliables d
        LEFT JOIN remesas r ON r.id=d.remesa_id
        LEFT JOIN facturas_emitidas fi ON fi.id=d.factura_emitida_id
        WHERE r.nombre LIKE ${`${TAG}%`} OR fi.num_factura LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM estado_justificacion_movimientos e
        JOIN movimientos_bancarios m ON m.id=e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM vinculos_movimiento_documento v
        JOIN movimientos_bancarios m ON m.id=v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM operaciones_justificacion_b4 o
        JOIN movimientos_bancarios m ON m.id=o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM eventos_justificacion_b4 e
        JOIN movimientos_bancarios m ON m.id=e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM auditoria_remesa_b6 a
        JOIN remesas r ON r.id=a.remesa_id WHERE r.nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM recibos_cobro_remesa_b7 rc
        JOIN remesas r ON r.id=rc.remesa_id WHERE r.nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM lineas_recibo_cobro_remesa_b7 l
        JOIN recibos_cobro_remesa_b7 rc ON rc.id=l.recibo_id
        JOIN remesas r ON r.id=rc.remesa_id WHERE r.nombre LIKE ${`${TAG}%`})
    )::bigint AS total
  `
  return Number(rows[0]?.total ?? 0)
}

async function receiptCounts(tx: Tx, remesaId: number): Promise<{ headers: number; lines: number; audits: number }> {
  const rows = await tx.$queryRaw<Array<{ headers: bigint | number | string; lines: bigint | number | string; audits: bigint | number | string }>>`
    SELECT
      (SELECT count(*) FROM recibos_cobro_remesa_b7 WHERE remesa_id=${remesaId})::bigint AS headers,
      (SELECT count(*) FROM lineas_recibo_cobro_remesa_b7 l
        JOIN recibos_cobro_remesa_b7 r ON r.id=l.recibo_id WHERE r.remesa_id=${remesaId})::bigint AS lines,
      (SELECT count(*) FROM auditoria_remesa_b6
        WHERE remesa_id=${remesaId} AND accion='ASOCIACION_FACTURAS_CONFIRMADA'::"AccionAuditoriaRemesaB6")::bigint AS audits
  `
  assert.equal(rows.length, 1, 'No se pudieron contar los recibos sintéticos.')
  return { headers: Number(rows[0]?.headers ?? 0), lines: Number(rows[0]?.lines ?? 0), audits: Number(rows[0]?.audits ?? 0) }
}

async function currentUndoInput(tx: Tx, operationId: string): Promise<{ version: number; lineas: Array<{ id: string; importeCentimos: number }> }> {
  const state = await tx.$queryRaw<Array<{ version: number | bigint | string }>>`
    SELECT e.version FROM estado_justificacion_movimientos e
    JOIN operaciones_justificacion_b4 o ON o.movimiento_id=e.movimiento_id
    WHERE o.id=CAST(${operationId} AS uuid)
    LIMIT 1 FOR UPDATE OF e,o
  `
  assert.equal(state.length, 1, 'No existe el estado B4 vivo para el deshacer.')
  const active = await tx.$queryRaw<Array<{ id: string; importeCentimos: number | bigint | string }>>`
    SELECT id::text AS id,importe_centimos AS "importeCentimos"
    FROM vinculos_movimiento_documento
    WHERE operacion_creacion_id=CAST(${operationId} AS uuid) AND activo=true
    ORDER BY id ASC FOR UPDATE
  `
  assert(active.length > 0, 'El deshacer requiere líneas B4 vivas.')
  return {
    version: Number(state[0]?.version),
    lineas: active.map(row => ({ id: row.id, importeCentimos: Number(row.importeCentimos) })),
  }
}

/** A rejected SQL guard must leave the surrounding rollback-only transaction usable. */
async function sqlMustReject(tx: Tx, savepoint: string, work: () => Promise<unknown>, forceDeferred = false): Promise<void> {
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  let rejected = false
  try {
    await work()
    if (forceDeferred) await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
  } catch {
    rejected = true
  }
  await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  assert(rejected, `La guarda SQL debía rechazar ${savepoint}.`)
  // The receipt guard is deferrable and the rest of the fixture continues in the
  // same outer transaction, exactly as production confirmation does before commit.
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
}

function paymentRow(population: any, invoiceId: string): any {
  const row = population.invoices.find((item: any) => item.invoiceId === invoiceId)
  assert(row, 'La factura sintética debe figurar en la población B7 real.')
  return row
}

function recordPrivateError(error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : 'UNKNOWN_LOCAL_REMITTANCE_TEST_FAILURE'
  try {
    writeFileSync(PRIVATE_ERROR_FILE, detail, { encoding: 'utf8', mode: 0o600 })
    chmodSync(PRIVATE_ERROR_FILE, 0o600)
  } catch {
    // The test deliberately emits no public diagnostic: the private stack is only
    // best-effort when its parent directory is unavailable.
  }
}

async function run(): Promise<void> {
  const { raw: url, database } = localUrl()
  assert.notEqual(process.env.NODE_ENV, 'production', 'La prueba local nunca se ejecuta en producción.')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'La prueba local nunca se ejecuta en producción.')

  const savedDatabaseUrl = process.env.DATABASE_URL
  const savedStagingSandbox = process.env.FINANCE_STAGING_SANDBOX
  // These assignments intentionally precede every dynamic project import. lib/prisma
  // is then instantiated from this explicit local URL, never from a dotenv default.
  process.env.FINANCE_STAGING_SANDBOX = '0'
  process.env.DATABASE_URL = url

  const client = new PrismaClient({ datasources: { db: { url } } })
  let shared: { $disconnect: () => Promise<void>; $queryRaw: any } | null = null
  let reachedSentinel = false
  const assertions: string[] = []

  try {
    const [
      receiptDb,
      reconciliationDb,
      b7Db,
      receiptCore,
      easyCore,
      prismaModule,
    ] = await Promise.all([
      import('../lib/finanzas/remittance-payment-receipts-db'),
      import('../lib/finanzas/reconciliation-db'),
      import('../lib/finanzas/bank-invoicing-db'),
      import('../lib/finanzas/remittance-payment-receipts-core'),
      import('../lib/finanzas/easy-collections-core'),
      import('../lib/prisma'),
    ])
    shared = prismaModule.default as typeof shared

    await assertLocalIdentity(client, database)
    await assertLocalIdentity(shared, database)
    await assertPrerequisites(client)
    assert.equal(await fixtureCount(client), 0, 'Existe una colisión previa del marcador sintético local.')
    assertions.push('local-loopback-allowlist-and-receipt-prerequisites')

    try {
      await client.$transaction(async (tx: Tx) => {
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')

        let ispSeed = 1_900_000_000 + (Date.now() % 10_000_000)
        const nextIsp = () => ++ispSeed
        const actor = await tx.usuarioAdmin.create({
          data: {
            email: `${TAG.toLowerCase()}@example.invalid`,
            passwordHash: '$2b$12$RemittanceReceiptLocalRollbackOnlySyntheticHash',
            nombre: `${TAG}-SUPERADMIN`, rol: 'SUPER_ADMIN', roles: ['CONTABILIDAD'], activo: true,
          },
          select: { id: true },
        })
        const account = await tx.cuentaBancaria.create({
          data: {
            id: randomUUID(), banco: `${TAG}-BANCO`, alias: TAG,
            iban: `ES00${randomUUID().replaceAll('-', '').slice(0, 30)}`,
            activa: true, fechaCorteExtracto: null,
          },
          select: { id: true },
        })
        const remesa = await tx.remesa.create({
          data: {
            ispGestionId: nextIsp(), nombre: `${TAG}-REMESA`, fecha: DAY,
            totalImporte: centsDecimal(REMITTANCE_CENTS), numeroRegistros: 2,
          },
          select: { id: true, ispGestionId: true, fecha: true },
        })

        const sourceAndMirror = async (label: string, cents: number) => {
          const ispGestionId = nextIsp()
          const source = await tx.factura.create({
            data: {
              ispGestionId, serieFactura: TAG, numeroDocumento: `${TAG}-${label}`,
              fecha: DAY, idCliente: nextIsp(), codigoCliente: `${TAG}-${label}`,
              nombreCompleto: `${TAG}-CLIENTE-${label}`, nifCif: `${TAG}-CIF-${label}`,
              base: centsDecimal(cents), totalImpuesto: '0.00', total: centsDecimal(cents),
              situacion: 'PENDIENTE', totalPendiente: centsDecimal(cents),
            },
            select: {
              id: true, ispGestionId: true, serieFactura: true, numeroDocumento: true,
              fecha: true, nombreCompleto: true, nifCif: true, total: true,
            },
          })
          const issued = await tx.facturaEmitida.create({
            data: {
              id: randomUUID(), cliente: source.nombreCompleto, cif: source.nifCif,
              numFactura: source.numeroDocumento, serie: source.serieFactura, fecha: source.fecha,
              base: centsFloat(cents), tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0,
              total: centsFloat(cents), concepto: `${TAG}-${label}`, origenSistema: 'ISPGestion',
              idExterno: String(source.ispGestionId), facturaISPId: source.id,
            },
            select: { id: true, facturaISPId: true, numFactura: true },
          })
          assert.equal(issued.facturaISPId, source.id, 'La FI debe nacer con su FK ISP explícita.')
          await tx.$executeRaw`
            INSERT INTO identidad_factura_isp_eventos_b7
              (id,factura_emitida_id,factura_isp_id,actor_id,fuente_hash,snapshot)
            VALUES (
              CAST(${randomUUID()} AS uuid),${issued.id},${source.id},${actor.id},
              ${sha(`${TAG}:identity:${issued.id}:${source.id}`)},
              CAST(${JSON.stringify({ idExterno: String(source.ispGestionId), noAcreditaCobro: true })} AS jsonb)
            )
          `
          return { source, issued, cents }
        }

        const first = await sourceAndMirror('FI-PRIMER-ABONO', FIRST_CENTS)
        const second = await sourceAndMirror('FI-SEGUNDO-ABONO', SECOND_CENTS)
        assertions.push('synthetic-superadmin-account-and-exact-fi-isp-identity-audit')

        const movement = async (label: string, cents: number) => {
          const id = randomUUID()
          await tx.movimientoBancario.create({
            data: {
              id, cuentaId: account.id, fechaOperacion: BANK_DAY, fechaValor: BANK_DAY,
              importe: centsFloat(cents), concepto: `${TAG}-${label}`, referencia: `${TAG}-${label}`,
              tercero: `${TAG}-ORDENANTE`, hashUnico: `${TAG}-${label}-${randomUUID()}`,
            },
          })
          return id
        }
        const firstMovementId = await movement('ABONO-UNO', FIRST_CENTS)
        const secondMovementId = await movement('ABONO-DOS', SECOND_CENTS)

        const generationId = randomUUID()
        await tx.$executeRaw`
          INSERT INTO modo_facil_generaciones_cobro(id,creada_at,fuente,resumen)
          VALUES(CAST(${generationId} AS uuid),${GENERATION_AT},${TAG},'{}'::jsonb)
        `

        const proposal = (movementId: string, cents: number, composition: unknown[]) => {
          const id = randomUUID()
          const lineas = [{ tipo: 'DOCUMENTO' as const, tipoDocumento: 'REMESA' as const, sourceId: String(remesa.id), importeCentimos: cents }]
          const fingerprint = easyCore.easyCollectionFingerprint({
            v: 1, movimientoId: movementId, movimientoParId: null, importeMovimientoCentimos: cents,
            metodo: 'REMESA_VENCIMIENTO', nivel: 'EXACTA', estadoPropuesto: 'JUSTIFICADO',
            motivoNoRequiere: null, lineas,
          })
          return {
            id, movementId, cents, lineas, composition, fingerprint,
            selection: { propuestaId: id, movimientoId: movementId, fingerprint },
          }
        }
        const firstProposal = proposal(firstMovementId, FIRST_CENTS, [
          { facturaEmitidaId: first.issued.id, importeCentimos: FIRST_CENTS },
        ])
        const secondProposal = proposal(secondMovementId, SECOND_CENTS, [
          { facturaEmitidaId: second.issued.id, importeCentimos: SECOND_CENTS },
        ])
        const insertProposal = async (item: any) => tx.$executeRaw`
          INSERT INTO modo_facil_propuestas_cobro
            (id,generacion_id,movimiento_id,movimiento_par_id,importe_movimiento_centimos,metodo,nivel,estado_propuesto,motivo_no_requiere,lineas,composicion,explicacion,fingerprint)
          VALUES(
            CAST(${item.id} AS uuid),CAST(${generationId} AS uuid),${item.movementId},NULL,${item.cents},
            'REMESA_VENCIMIENTO','EXACTA','JUSTIFICADO',NULL,
            CAST(${JSON.stringify(item.lineas)} AS jsonb),CAST(${JSON.stringify(item.composition)} AS jsonb),${TAG},${item.fingerprint}
          )
        `
        await insertProposal(firstProposal)
        await insertProposal(secondProposal)
        const firstSeal = receiptDb.remittanceSealForProposal({
          propuestaId: firstProposal.id, movimientoId: firstProposal.movementId, fingerprint: firstProposal.fingerprint,
          metodo: 'REMESA_VENCIMIENTO', importeMovimientoCentimos: firstProposal.cents,
          lineas: firstProposal.lineas, composicion: firstProposal.composition,
        })
        const secondSeal = receiptDb.remittanceSealForProposal({
          propuestaId: secondProposal.id, movimientoId: secondProposal.movementId, fingerprint: secondProposal.fingerprint,
          metodo: 'REMESA_VENCIMIENTO', importeMovimientoCentimos: secondProposal.cents,
          lineas: secondProposal.lineas, composicion: secondProposal.composition,
        })
        assert(firstSeal && secondSeal, 'Las propuestas sintéticas deben sellarse con el helper real.')
        assert.equal(await fixtureCount(tx), 14, 'El contador de fixtures debe cubrir la semilla completa antes de B4/B6/B7.')
        assertions.push('current-generation-two-complete-disjoint-remittance-proposals')

        const receiptInput = (item: any, seal: any, idempotencyKey: string) => ({
          selection: item.selection,
          idempotencyKey,
          seal,
          blockId: randomUUID(),
          keyHash: easyCore.easyCollectionsDigest({ kind: 'REMITTANCE_LOCAL_BLOCK', proposalId: item.id, idempotencyKey }),
          requestHash: easyCore.easyCollectionsDigest({ kind: 'REMITTANCE_LOCAL_REQUEST', selection: item.selection, seal, idempotencyKey }),
        })
        const firstInput = receiptInput(firstProposal, firstSeal, randomUUID())
        const firstConfirmation: any = await receiptDb.confirmarReciboRemesaCompuestaTx(tx, actor.id, firstInput)
        assert.equal(firstConfirmation.idempotente, false, 'El primer abono debe crear evidencia nueva.')
        assert(typeof firstConfirmation.reciboId === 'string' && typeof firstConfirmation.operationB4Id === 'string', 'La confirmación debe devolver recibo y operación B4.')

        // The header trigger is deferred. A structurally valid one-cent extra line
        // must be rejected by its actual deferred sum guard, then rolled back to a
        // savepoint without poisoning the one outer transaction.
        const malformedSnapshot = {
          schemaVersion: receiptCore.B7_REMESA_RECEIPT_SCHEMA_VERSION,
          facturaEmitida: { id: second.issued.id, totalCentimos: SECOND_CENTS, fecha: dateOnly(DAY) },
          facturaISP: { id: second.source.id, totalCentimos: SECOND_CENTS, fecha: dateOnly(DAY) },
          fechaBanco: dateOnly(BANK_DAY), importeCentimos: 1, compositionOrdinals: [999],
        }
        await sqlMustReject(tx, 'recibo_un_centimo_diferido', async () => {
          await tx.$executeRaw`
            INSERT INTO lineas_recibo_cobro_remesa_b7
              (recibo_id,ordinal,factura_emitida_id,factura_isp_id,importe_centimos,source_hash,snapshot)
            VALUES(
              CAST(${firstConfirmation.reciboId} AS uuid),2,${second.issued.id},${second.source.id},1,
              ${receiptCore.remittanceReceiptHash(malformedSnapshot)},CAST(${JSON.stringify(malformedSnapshot)} AS jsonb)
            )
          `
        }, true)
        assertions.push('deferred-receipt-one-cent-sum-guard')

        const afterFirst = await b7Db.readBankInvoicingPopulation(tx as any, {
          enabled: true,
          assertIsolatedStaging: async () => undefined,
        })
        const firstAfterFirst = paymentRow(afterFirst, first.issued.id)
        const secondAfterFirst = paymentRow(afterFirst, second.issued.id)
        assert.deepEqual(
          [firstAfterFirst.paidDocumentaryCents, firstAfterFirst.remainingCents, firstAfterFirst.paymentState],
          [FIRST_CENTS, 0, 'COBRADA_CALCULADA'],
          'El primer recibo sólo debe pagar su FI explícita.',
        )
        assert.deepEqual(
          [secondAfterFirst.paidDocumentaryCents, secondAfterFirst.remainingCents, secondAfterFirst.paymentState],
          [0, SECOND_CENTS, 'PENDIENTE_COBRO'],
          'La FI del segundo subconjunto debe seguir pendiente.',
        )
        assertions.push('real-b7-reader-first-partial-receipt-only-pays-first-fi')

        const secondInput = receiptInput(secondProposal, secondSeal, randomUUID())
        const secondConfirmation: any = await receiptDb.confirmarReciboRemesaCompuestaTx(tx, actor.id, secondInput)
        assert.equal(secondConfirmation.idempotente, false, 'El segundo abono debe crear evidencia nueva.')
        const replay: any = await receiptDb.confirmarReciboRemesaCompuestaTx(tx, actor.id, secondInput)
        assert.equal(replay.idempotente, true, 'La misma clave debe devolver el recibo inmutable.')
        assert.equal(replay.reciboId, secondConfirmation.reciboId, 'El replay no puede crear otro recibo.')
        assert.deepEqual(await receiptCounts(tx, remesa.id), { headers: 2, lines: 2, audits: 1 }, 'Los dos abonos deben conservar una asociación B6 completa única.')

        const afterSecond = await b7Db.readBankInvoicingPopulation(tx as any, {
          enabled: true,
          assertIsolatedStaging: async () => undefined,
        })
        for (const issuedId of [first.issued.id, second.issued.id]) {
          const row = paymentRow(afterSecond, issuedId)
          assert.deepEqual([row.paidDocumentaryCents, row.remainingCents, row.paymentState], [issuedId === first.issued.id ? FIRST_CENTS : SECOND_CENTS, 0, 'COBRADA_CALCULADA'])
        }
        assertions.push('second-disjoint-receipt-completes-remittance-and-replay-does-not-duplicate')

        // This forces receipt headers that were validly inserted in the same
        // transaction through their actual DEFERRABLE trigger before undo emulates
        // a later committed transaction. The outer transaction remains rollback-only.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')

        const firstUndo = await currentUndoInput(tx, firstConfirmation.operationB4Id)
        const undone: any = await reconciliationDb.deshacerB4Tx(tx, actor.id, {
          action: 'deshacer', confirmacion: true, idempotencyKey: randomUUID(),
          version: firstUndo.version, operacionId: firstConfirmation.operationB4Id, lineas: firstUndo.lineas,
        })
        assert.equal(undone.idempotente, false, 'El deshacer B4 debe ser una reversión efectiva.')
        const afterUndo = await b7Db.readBankInvoicingPopulation(tx as any, {
          enabled: true,
          assertIsolatedStaging: async () => undefined,
        })
        const firstAfterUndo = paymentRow(afterUndo, first.issued.id)
        const secondAfterUndo = paymentRow(afterUndo, second.issued.id)
        assert.deepEqual([firstAfterUndo.paidDocumentaryCents, firstAfterUndo.remainingCents, firstAfterUndo.paymentState], [0, FIRST_CENTS, 'PENDIENTE_COBRO'])
        assert.deepEqual([secondAfterUndo.paidDocumentaryCents, secondAfterUndo.remainingCents, secondAfterUndo.paymentState], [SECOND_CENTS, 0, 'COBRADA_CALCULADA'])
        assert.deepEqual(await receiptCounts(tx, remesa.id), { headers: 2, lines: 2, audits: 1 }, 'Deshacer B4 conserva recibos y auditoría B6 append-only.')
        assertions.push('actual-b4-undo-reopens-only-reverted-subset-and-retains-receipt-audit')

        // The original receipt is retained but its B4 link is inactive. A new human
        // confirmation with a new key must create a new link/receipt and consume
        // only live capacity, never historical reverted capacity.
        const reconfirmationInput = receiptInput(firstProposal, firstSeal, randomUUID())
        const reconfirmed: any = await receiptDb.confirmarReciboRemesaCompuestaTx(tx, actor.id, reconfirmationInput)
        assert.equal(reconfirmed.idempotente, false, 'La reconfirmación con una clave nueva debe crear evidencia nueva.')
        assert.notEqual(reconfirmed.reciboId, firstConfirmation.reciboId, 'La reconfirmación debe usar un recibo nuevo.')
        assert.notEqual(reconfirmed.operationB4Id, firstConfirmation.operationB4Id, 'La reconfirmación debe crear un vínculo B4 nuevo.')
        assert.deepEqual(await receiptCounts(tx, remesa.id), { headers: 3, lines: 3, audits: 1 }, 'La capacidad debe ignorar el recibo revertido y mantener un solo audit B6.')

        const afterReconfirm = await b7Db.readBankInvoicingPopulation(tx as any, {
          enabled: true,
          assertIsolatedStaging: async () => undefined,
        })
        for (const issuedId of [first.issued.id, second.issued.id]) {
          const row = paymentRow(afterReconfirm, issuedId)
          assert.equal(row.paymentState, 'COBRADA_CALCULADA', 'Sólo los dos vínculos B4 actualmente vivos deben acreditar el cobro.')
        }
        assertions.push('reconfirmation-uses-new-b4-link-new-receipt-and-live-capacity-only')

        // Root and line tables are independently append-only. Updating transaction_id
        // is deliberately included: it cannot fake a post-commit line insertion.
        await sqlMustReject(tx, 'recibo_root_update_append_only', () => tx.$executeRaw`
          UPDATE recibos_cobro_remesa_b7
          SET transaction_id=transaction_id
          WHERE id=CAST(${reconfirmed.reciboId} AS uuid)
        `)
        await sqlMustReject(tx, 'recibo_root_delete_append_only', () => tx.$executeRaw`
          DELETE FROM recibos_cobro_remesa_b7 WHERE id=CAST(${reconfirmed.reciboId} AS uuid)
        `)
        await sqlMustReject(tx, 'recibo_line_update_append_only', () => tx.$executeRaw`
          UPDATE lineas_recibo_cobro_remesa_b7 SET importe_centimos=importe_centimos
          WHERE recibo_id=CAST(${reconfirmed.reciboId} AS uuid) AND ordinal=1
        `)
        await sqlMustReject(tx, 'recibo_line_delete_append_only', () => tx.$executeRaw`
          DELETE FROM lineas_recibo_cobro_remesa_b7
          WHERE recibo_id=CAST(${reconfirmed.reciboId} AS uuid) AND ordinal=1
        `)
        assertions.push('receipt-root-and-lines-append-only-update-delete-guards')

        // Validate the reconfirmed root's actual deferred constraint after all
        // negative savepoint probes, then make rollback the sole transaction end.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        assert((await fixtureCount(tx)) > 0, 'Los fixtures deben existir sólo dentro de la transacción exterior.')
        reachedSentinel = true
        throw new RollbackSentinel()
      }, { isolationLevel: 'Serializable', maxWait: 10_000, timeout: 90_000 })
    } catch (error) {
      if (!(error instanceof RollbackSentinel)) throw error
    }

    assert(reachedSentinel, 'La prueba no alcanzó el rollback obligatorio.')
    assert.equal(await fixtureCount(client), 0, 'El rollback obligatorio debe eliminar todos los fixtures sintéticos y sus descendientes.')
    assertions.push('rollback-erases-all-synthetic-fixtures')
    console.log(JSON.stringify({
      test: 'remittance-payment-receipts-local-postgres',
      synthetic: true,
      localOnly: true,
      rollback: true,
      passed: true,
      assertions,
    }))
  } finally {
    try {
      await client.$disconnect()
    } finally {
      if (shared) await shared.$disconnect()
      if (savedDatabaseUrl === undefined) delete process.env.DATABASE_URL
      else process.env.DATABASE_URL = savedDatabaseUrl
      if (savedStagingSandbox === undefined) delete process.env.FINANCE_STAGING_SANDBOX
      else process.env.FINANCE_STAGING_SANDBOX = savedStagingSandbox
    }
  }
}

run().catch(error => {
  recordPrivateError(error)
  process.exitCode = 1
})
