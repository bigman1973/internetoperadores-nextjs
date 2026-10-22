import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { assertFinanceStagingIsolated } from '../lib/finanzas/staging-safety'
import { createDocumentoB4, confirmarB4, deshacerB4, B4ServiceError } from '../lib/finanzas/reconciliation-db'
import {
  confirmarAsociacionDevolucionRemesaB6,
  confirmarAsociacionFacturasRemesaB6,
  B6RemesaServiceError,
} from '../lib/finanzas/b6-remesas-db'
import { facturasSourceHash, remesaSourceFingerprint } from '../lib/finanzas/b6-remesas-pure'
import { readBankInvoicing } from '../lib/finanzas/bank-invoicing-db'
import { parseBankInvoicingDto } from '../components/finanzas/facturacion-banco/typesparser'

/**
 * B7 PostgreSQL integration test.
 *
 * It is deliberately executable only on the isolated finance staging database. Every
 * synthetic financial source, B4/B6 operation and B7 identity fact is inside one
 * SERIALIZABLE transaction that always ends in RollbackSentinel. The B7 reader is
 * injected with that transaction directly; it never opens or owns an outer database
 * transaction of its own.
 *
 * Authorized execution only:
 * FINANCE_STAGING_SANDBOX=1 B7_ROLLBACK_TEST=1 npx tsx scripts/test-finance-b7-postgres.ts
 */

const DAY = new Date('2042-01-02T09:00:00.000Z')
const TAG = `B7-ROLLBACK-${randomUUID()}`
const IBAN = `ES00${TAG.split('-').join('')}`
const PRIVATE_ERROR_FILE = '/home/ubuntu/finanzas-b7-20261022/b7-postgres-error-private.txt'
type Tx = any
type Snapshot = Record<string, unknown>

class RollbackSentinel extends Error {
  constructor() { super('B7_ROLLBACK_ONLY') }
}

function equal<T>(actual: T, expected: T, message?: string): asserts actual is T {
  assert.equal(actual, expected, message)
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** Signed integer cents to an exact source decimal string; never abs() or rounding. */
function centsDecimal(cents: number): string {
  assert(Number.isSafeInteger(cents), 'Los fixtures B7 requieren céntimos enteros seguros')
  const sign = cents < 0 ? '-' : ''
  const absolute = Math.abs(cents)
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`
}

/** Float source fields are supplied only from an exact decimal fixture representation. */
function centsFloat(cents: number): number {
  return Number(centsDecimal(cents))
}

function finiteSyntheticIspSeed(): number {
  // Stays below PostgreSQL Int and has enough entropy for a rollback-only fixture.
  return 1_900_000_000 + (Date.now() % 10_000_000)
}

/**
 * Snapshot exactly 28 financial/B4/B6/B7 tables. It returns only counts and aggregate
 * row hashes; no existing financial row, user identity or monetary source is emitted.
 */
const SNAPSHOT_TABLES = [
  'usuarios_admin',
  'cuentas_bancarias',
  'movimientos_bancarios',
  'facturas',
  'facturas_emitidas',
  'remesas',
  'facturas_recibidas',
  'confirming_lineas',
  'gastos',
  'nominas',
  'conciliaciones_remesas',
  'sub_remesas_banco',
  'devoluciones_remesas',
  'importaciones_extracto',
  'facturas_contratos_draxton',
  'documentos_aapp',
  'obligaciones_aapp',
  'pagos_fraccionados',
  'documentos_prestamo',
  'traspasos_internos',
  'documentos_conciliables',
  'estado_justificacion_movimientos',
  'vinculos_movimiento_documento',
  'operaciones_justificacion_b4',
  'eventos_justificacion_b4',
  'asignaciones_devolucion_remesa_b6',
  'auditoria_remesa_b6',
  'identidad_factura_isp_eventos_b7',
] as const

async function snapshotFinancialTables(): Promise<Snapshot> {
  const fragments = SNAPSHOT_TABLES.map((table) => `
    SELECT '${table}'::text AS nombre, count(*)::text AS cantidad,
      md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text)), '')) AS huella
    FROM "${table}" t
  `)
  const rows = await prisma.$queryRawUnsafe<Array<{ snapshot: Snapshot }>>(`
    SELECT jsonb_object_agg(nombre, jsonb_build_object('count', cantidad, 'hash', huella)) AS snapshot
    FROM (${fragments.join('\nUNION ALL\n')}) financial_snapshot
  `)
  equal(rows.length, 1, 'No se pudo crear el snapshot financiero B7')
  equal(Object.keys(rows[0].snapshot ?? {}).length, SNAPSHOT_TABLES.length, 'El snapshot B7 debe cubrir 28 tablas')
  return rows[0].snapshot
}

/** Counts only synthetic keys and synthetic descendants; it never selects source values. */
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
        JOIN movimientos_bancarios m
 ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM vinculos_movimiento_documento v
        JOIN movimientos_bancarios m ON m.id = v.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM operaciones_justificacion_b4 o
        JOIN movimientos_bancarios m ON m.id = o.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM eventos_justificacion_b4 e
        JOIN movimientos_bancarios m ON m.id = e.movimiento_id WHERE m.hash_unico LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM asignaciones_devolucion_remesa_b6 a
        JOIN remesas r ON r.id = a.remesa_id WHERE r.nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM auditoria_remesa_b6 a
        JOIN remesas r ON r.id = a.remesa_id WHERE r.nombre LIKE ${`${TAG}%`}) +
      (SELECT count(*) FROM identidad_factura_isp_eventos_b7 i
        JOIN facturas_emitidas fi ON fi.id = i.factura_emitida_id WHERE fi.num_factura LIKE ${`${TAG}%`})
    )::bigint AS total
  `
  return Number(rows[0]?.total ?? 0)
}

async function expectB4(code: string, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B4ServiceError, `Se esperaba B4ServiceError ${code}`)
    equal(error.code, code, `Código B4 inesperado`)
    return
  }
  assert.fail(`Debía rechazarse con ${code}`)
}

async function expectB6(code: string, work: () => Promise<unknown>) {
  try {
    await work()
  } catch (error) {
    assert(error instanceof B6RemesaServiceError, `Se esperaba B6RemesaServiceError ${code}`)
    equal(error.code, code, `Código B6 inesperado`)
    return
  }
  assert.fail(`Debía rechazarse con ${code}`)
}

async function expectRejected(work: () => Promise<unknown>, message: string) {
  let rejected = false
  try {
    await work()
  } catch {
    rejected = true
  }
  assert(rejected, message)
}

/** A trigger error must not poison the enclosing rollback-only transaction. */
async function sqlBlocked(tx: Tx, savepoint: string, work: () => Promise<unknown>) {
  await tx.$executeRawUnsafe(`SAVEPOINT ${savepoint}`)
  let rejected = false
  try {
    await work()
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
  } catch {
    rejected = true
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${savepoint}`)
  }
  assert(rejected, `La guarda SQL debía bloquear ${savepoint}`)
  await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
}

function sha(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function identitySnapshot(idExterno: string) {
  return { idExterno, noAcreditaCobro: true }
}

/**
 * The B7 audit trigger accepts a direct initial FI FK when FI and ISP metadata are
 * exact. It is intentionally not a payment proof.
 */
async function insertIdentityEvent(tx: Tx, input: { fiId: string; facturaId: number; actorId: number; idExterno: string }) {
  const id = randomUUID()
  await tx.$executeRaw`
    INSERT INTO identidad_factura_isp_eventos_b7
      (id, factura_emitida_id, factura_isp_id, actor_id, fuente_hash, snapshot)
    VALUES (
      CAST(${id} AS uuid), ${input.fiId}, ${input.facturaId}, ${input.actorId},
      ${sha(`${TAG}:identity:${input.fiId}:${input.facturaId}`)},
      CAST(${JSON.stringify(identitySnapshot(input.idExterno))} AS jsonb)
    )
  `
  return id
}

function associationInput(
  remesa: { id: number; ispGestionId: number; fecha: Date; totalCentimos: number },
  facturas: Array<{ id: number; ispGestionId: number; fecha: Date; totalCentimos: number }>,
) {
  const sourceFacturas = facturas.map((factura) => ({
    id: factura.id,
    ispGestionId: factura.ispGestionId,
    fecha: isoDate(factura.fecha),
    totalCentimos: factura.totalCentimos,
  }))
  return {
    action: 'asociar_facturas' as const,
    remesaId: remesa.id,
    facturaIdsISP: facturas.map((factura) => factura.id),
    confirmacion: true as const,
    idempotencyKey: randomUUID(),
    expectedRemesaTotalCentimos: remesa.totalCentimos,
    expectedRemesaHashSHA256: remesaSourceFingerprint({
      id: remesa.id,
      ispGestionId: remesa.ispGestionId,
      fecha: isoDate(remesa.fecha),
      totalCentimos: remesa.totalCentimos,
    }),
    expectedFacturasHashSHA256: facturasSourceHash(sourceFacturas),
  }
}

/**
 * Executes the actual reader SQL on tx, then restricts result arrays to this test's
 * synthetic logical population. This is needed because the production reader rightly
 * summarizes every real FI; a fixture-only summary must not include pre-existing data.
 */
function fixtureReaderDb(tx: Tx, scope: {
  fiIds: Set<string>
  remesaIds: Set<number>
  movementIds: Set<string>
}) {
  return {
    async $queryRawUnsafe<T>(statement: string): Promise<T> {
      const rows = await (tx.$queryRawUnsafe(statement) as Promise<any[]>)
      const keep = (row: any) => {
        if (statement.includes('FROM facturas_emitidas fe')) return scope.fiIds.has(row.id)
        if (statement.includes("d.tipo = 'FACTURA_EMITIDA'")) return scope.fiIds.has(row.invoiceId)
        if (statement.includes("v.tipo_linea = 'DIFERENCIA'")) return scope.movementIds.has(row.movementId)
        if (statement.includes('FROM remesas r')) return scope.remesaIds.has(Number(row.remittanceId))
        if (statement.includes("d.tipo = 'REMESA'")) return scope.remesaIds.has(Number(row.remittanceId))
        if (statement.includes('FROM asignaciones_devolucion_remesa_b6')) return scope.remesaIds.has(Number(row.remittanceId))
        if (statement.includes('FROM auditoria_remesa_b6')) return scope.remesaIds.has(Number(row.remittanceId))
        // Coverage has no FI identity. Its value cannot create payment evidence.
        return true
      }
      return (Array.isArray(rows) ? rows.filter(keep) : rows) as T
    },
  }
}

function invoiceById(dto: any, id: string) {
  const row = dto.items.find((item: any) => item.invoiceId === id)
  assert(row, 'La FI sintética debe figurar en la respuesta B7')
  return row
}

async function run() {
  if (process.env.B7_ROLLBACK_TEST !== '1') throw new Error('B7_ROLLBACK_TEST=1 es obligatorio')
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('FINANCE_STAGING_SANDBOX=1 es obligatorio')
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') throw new Error('B7_IN_PRODUCTION_NO_WRITE')

  // The only pre-transaction I/O. It fails closed before any fixture or service call.
  const identity = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  equal(identity[0]?.db, 'io_staging_finanzas', 'La prueba B7 sólo admite io_staging_finanzas')
  equal(identity[0]?.usuario, 'io_staging_finanzas', 'La prueba B7 sólo admite el rol aislado')

  const before = await snapshotFinancialTables()
  equal(await fixtureCount(), 0, 'Colisión improbable de marcador de fixture B7')

  const singleton = prisma as any
  const realTransaction = singleton.$transaction.bind(singleton)
  let reachedSentinel = false
  let assertions = 0

  try {
    await realTransaction(async (tx: Tx) => {
      // B4, B6 and staging safety import the root singleton. Route only the calls
      // made while this test is running to this tx, then restore in finally.
      const saved = {
        transaction: singleton.$transaction,
        queryRaw: singleton.$queryRaw,
        queryRawUnsafe: singleton.$queryRawUnsafe,
      }
      singleton.$transaction = async (callback: (serviceTx: Tx) => Promise<unknown>) => callback(tx)
      singleton.$queryRaw = tx.$queryRaw.bind(tx)
      singleton.$queryRawUnsafe = tx.$queryRawUnsafe.bind(tx)

      try {
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
        let sequence = 0
        let nextIsp = finiteSyntheticIspSeed()
        const nextIspId = () => ++nextIsp
        const at = (minutes: number) => new Date(DAY.getTime() + minutes * 60_000)

        // This is synthetic and active inside the enclosing rollback only. No real
        // user is read or used as a financial actor.
        const actor = await tx.usuarioAdmin.create({
          data: {
            email: `${TAG.toLowerCase()}@example.invalid`,
            passwordHash: '$2b$12$B7RollbackOnlySyntheticHash',
            nombre: `${TAG}-SUPERADMIN`,
            rol: 'SUPER_ADMIN',
            roles: ['CONTABILIDAD'],
            activo: true,
          },
          select: { id: true },
        })

        const account = await tx.cuentaBancaria.create({
          data: {
            id: randomUUID(), banco: `${TAG}-CAIXA`, iban: IBAN,
            alias: `${TAG}-CAIXA-CASH95`, activa: true,
            // Deliberately unknown coverage: it does not manufacture a paid state.
            fechaCorteExtracto: null,
          },
          select: { id: true },
        })

        const movement = async (label: string, cents: number) => {
          const id = randomUUID()
          const moment = at(++sequence)
          await tx.movimientoBancario.create({
            data: {
              id, cuentaId: account.id, fechaOperacion: moment, fechaValor: moment,
              concepto: `${TAG}-${label}`, importe: centsFloat(cents),
              hashUnico: `${TAG}-${label}-${randomUUID()}`,
              referencia: `${TAG}-${label}`, tercero: `${TAG}-TERCERO`,
            },
          })
          return id
        }

        const factura = async (label: string, cents: number, date = DAY) => {
          const ispGestionId = nextIspId()
          const row = await tx.factura.create({
            data: {
              ispGestionId,
              serieFactura: TAG,
              numeroDocumento: `${TAG}-${label}-${randomUUID()}`,
              fecha: date,
              idCliente: nextIspId(),
              codigoCliente: `${TAG}-${label}`,
              nombreCompleto: `${TAG}-CLIENTE-${label}`,
              nifCif: `${TAG}-NIF-${label}`,
              base: centsDecimal(cents), totalImpuesto: '0.00', total: centsDecimal(cents),
              situacion: 'COBRADA', totalPendiente: '0.00',
            },
            select: {
              id: true, ispGestionId: true, serieFactura: true, numeroDocumento: true,
              fecha: true, nombreCompleto: true, nifCif: true,
            },
          })
          return { ...row, totalCentimos: cents }
        }

        /** Direct FI creation with an explicit nullable B7 FK is allowed by the guard. */
        const emitted = async (label: string, cents: number, source: any | null, options?: { mapped?: boolean; estado?: 'EMITIDA' | 'COBRADA'; metadataMismatch?: boolean }) => {
          const id = randomUUID()
          const mapped = options?.mapped !== false && source !== null
          const cliente = source ? (options?.metadataMismatch ? `${TAG}-ALTERED-${label}` : source.nombreCompleto) : `${TAG}-CLIENTE-${label}`
          const row = await tx.facturaEmitida.create({
            data: {
              id,
              cliente,
              cif: source ? source.nifCif : `${TAG}-CIF-${label}`,
              numFactura: source ? source.numeroDocumento : `${TAG}-${label}-${randomUUID()}`,
              serie: source ? source.serieFactura : TAG,
              fecha: source ? source.fecha : at(++sequence),
              base: centsFloat(cents), tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0,
              total: centsFloat(cents),
              concepto: `${TAG}-${label}`,
              estado: options?.estado ?? 'EMITIDA',
              importeCobrado: options?.estado === 'COBRADA' ? centsFloat(cents) : 0,
              fechaCobro: options?.estado === 'COBRADA' ? at(++sequence) : null,
              origenSistema: source ? 'ISPGestion' : 'MANUAL_SINTETICO',
              idExterno: source ? String(source.ispGestionId) : null,
              ...(mapped && source ? { facturaISPId: source.id } : {}),
            },
            select: { id: true, facturaISPId: true },
          })
          return row
        }

        const remesa = async (label: string, cents: number, date = DAY) => {
          const row = await tx.remesa.create({
            data: {
              ispGestionId: nextIspId(), nombre: `${TAG}-${label}`, fecha: date,
              totalImporte: centsDecimal(cents), numeroRegistros: 1,
            },
            select: { id: true, ispGestionId: true, fecha: true },
          })
          return { ...row, totalCentimos: cents }
        }

        const b4Confirm = async (movimientoId: string, importeMovimientoCentimos: number, lineas: unknown[]) => {
          return confirmarB4(actor.id, {
            action: 'confirmar', confirmacion: true, idempotencyKey: randomUUID(), version: 1,
            borrador: { movimientoId, importeMovimientoCentimos, estado: 'JUSTIFICADO', lineas },
          }) as Promise<any>
        }

        // Common exact FI/ISP source proof: all values are fictitious, direct FK
        // mappings are explicit and the identity events prove only identity, never payment.
        const cashFactura = await factura('CAIXA-CASH-100', 10_000)
        const sourceFactura = await factura('OLD-COBRADA-100', 10_000)
        const partFactura = await factura('PARTE-50', 5_000)
        const otherFactura = await factura('OTHER-30', 3_000)
        const heuristicFactura = await factura('METADATA-SIN-FK-50', 5_000)
        const remesaFactura40 = await factura('REMESA-40', 4_000)
        const remesaFactura60 = await factura('REMESA-60', 6_000)
        const zeroFactura = await factura('CERO', 0)

        const cashFi = await emitted('CAIXA-CASH-100', 10_000, cashFactura)
        const oldCobradoFi = await emitted('OLD-COBRADA-100', 10_000, sourceFactura, { estado: 'COBRADA' })
        const partFi = await emitted('PARTE-50', 5_000, partFactura)
        const otherFi = await emitted('OTHER-30', 3_000, otherFactura)
        const remesaFi40 = await emitted('REMESA-40', 4_000, remesaFactura40)
        const remesaFi60 = await emitted('REMESA-60', 6_000, remesaFactura60)
        const zeroFi = await emitted('CERO', 0, zeroFactura)
        // Matching idExterno/metadata alone is deliberately not an FK proof.
        const heuristicFi = await emitted('HEURISTICA-SIN-FK', 5_000, heuristicFactura, { mapped: false })

        for (const [fi, source] of [
          [cashFi, cashFactura], [oldCobradoFi, sourceFactura], [partFi, partFactura], [otherFi, otherFactura],
          [remesaFi40, remesaFactura40], [remesaFi60, remesaFactura60], [zeroFi, zeroFactura],
        ] as Array<[any, any]>) {
          equal(fi.facturaISPId, source.id, 'La FI sintética debe nacer con FK ISP explícita')
          await insertIdentityEvent(tx, { fiId: fi.id, facturaId: source.id, actorId: actor.id, idExterno: String(source.ispGestionId) })
        }
        equal(heuristicFi.facturaISPId, null, 'Los metadatos nunca pueden inferir una FK B7')
        assertions += 1

        // The immutable identity audit rejects an event that does not exactly match
        // current financial source metadata, and itself cannot be altered or deleted.
        const badIdentityFactura = await factura('IDENTIDAD-MALA', 1_000)
        const badIdentityFi = await emitted('IDENTIDAD-MALA', 1_000, badIdentityFactura, { metadataMismatch: true })
        await sqlBlocked(tx, 'b7_identity_metadata_mismatch', () => insertIdentityEvent(tx, {
          fiId: badIdentityFi.id, facturaId: badIdentityFactura.id, actorId: actor.id,
          idExterno: String(badIdentityFactura.ispGestionId),
        }))
        const identityRow = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id::text AS id FROM identidad_factura_isp_eventos_b7 WHERE factura_emitida_id = ${cashFi.id}
        `
        equal(identityRow.length, 1)
        await sqlBlocked(tx, 'b7_identity_event_update', () => tx.$executeRaw`
          UPDATE identidad_factura_isp_eventos_b7 SET fuente_hash = ${sha(`${TAG}:mutated`)} WHERE id = CAST(${identityRow[0].id} AS uuid)
        `)
        await sqlBlocked(tx, 'b7_identity_event_delete', () => tx.$executeRaw`
          DELETE FROM identidad_factura_isp_eventos_b7 WHERE id = CAST(${identityRow[0].id} AS uuid)
        `)
        assertions += 1

        // A relationship update is prohibited until its append-only approved B7
        // identity root exists. Direct FI creation above remains intentionally legal.
        const relationFactura = await factura('RELACION-AUDITADA', 2_000)
        const relationFi = await emitted('RELACION-AUDITADA', 2_000, relationFactura, { mapped: false })
        await sqlBlocked(tx, 'b7_fk_update_without_identity', () => tx.$executeRaw`
          UPDATE facturas_emitidas SET factura_isp_id = ${relationFactura.id} WHERE id = ${relationFi.id}
        `)
        await insertIdentityEvent(tx, { fiId: relationFi.id, facturaId: relationFactura.id, actorId: actor.id, idExterno: String(relationFactura.ispGestionId) })
        await tx.$executeRaw`
          UPDATE facturas_emitidas SET factura_isp_id = ${relationFactura.id} WHERE id = ${relationFi.id}
        `
        assertions += 1

        // B4 direct FI proof: exact 100.00 documentary collection, 95.00 physical
        // cash and explicit -5.00 commission. Cash never changes documentary debt.
        const cashDoc: any = await createDocumentoB4(actor.id, {
          action: 'documento', tipoDocumento: 'FACTURA_EMITIDA', sourceId: cashFi.id,
        })
        equal(cashDoc.documento.importeObjetivoCentimos, 10_000)
        const cashMovement = await movement('CAIXA-CASH-95', 9_500)
        await b4Confirm(cashMovement, 9_500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: cashDoc.documento.id, importeCentimos: 10_000 },
          { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -500 },
        ])

        // Exact B6 membership and a real B4 REMESA closure: 100.00 document plus
        // -5.00 explicit commission closes a 95.00 physical bank movement. Neither
        // the fee nor cash is prorated across the 40/60 FI members.
        const mainRemesa = await remesa('REMESA-100', 10_000)
        const mainAssociation: any = await confirmarAsociacionFacturasRemesaB6(actor.id, associationInput(mainRemesa, [
          remesaFactura40, remesaFactura60,
        ]))
        equal(mainAssociation.resultado.sumaFacturasCentimos, 10_000)
        const remesaDoc: any = await createDocumentoB4(actor.id, {
          action: 'documento', tipoDocumento: 'REMESA', sourceId: String(mainRemesa.id),
        })
        equal(remesaDoc.documento.importeObjetivoCentimos, 10_000)
        const remesaMovement = await movement('REMESA-95-COMISION', 9_500)
        const remesaB4: any = await b4Confirm(remesaMovement, 9_500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: remesaDoc.documento.id, importeCentimos: 10_000 },
          { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -500 },
        ])
        assertions += 1

        // Only now force the valid phase. Later source and trigger probes run deferred
        // and are restored before the final immediate validation; B4 calls follow it.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')

        const scope = {
          fiIds: new Set([cashFi.id, oldCobradoFi.id, partFi.id, otherFi.id, remesaFi40.id, remesaFi60.id, zeroFi.id, heuristicFi.id]),
          remesaIds: new Set([mainRemesa.id]),
          movementIds: new Set([cashMovement, remesaMovement]),
        }
        const readFixture = async () => readBankInvoicing(
          fixtureReaderDb(tx, scope),
          { enabled: true, assertIsolatedStaging: async () => assertFinanceStagingIsolated() },
          new URLSearchParams('limit=100'),
        )

        const initial = await readFixture()
        const parsedInitial = parseBankInvoicingDto(initial)
        assert(parsedInitial.ok, 'El DTO B7 de fixture debe conservar contrato UI')
        equal(initial.diagnostics.ispPaymentFieldsRead, false)
        equal(initial.diagnostics.mutations, false)
        const cashRow = invoiceById(initial, cashFi.id)
        assert.deepEqual(
          [cashRow.targetCents, cashRow.paidDocumentaryCents, cashRow.remainingCents, cashRow.cashCents, cashRow.attributableCashDifferenceCents],
          [10_000, 10_000, 0, 9_500, -500],
          'La comisión directa sólo ajusta caja, no deuda documental',
        )
        const remesa40Row = invoiceById(initial, remesaFi40.id)
        const remesa60Row = invoiceById(initial, remesaFi60.id)
        assert.deepEqual([remesa40Row.paidDocumentaryCents, remesa40Row.remainingCents, remesa40Row.cashCents], [4_000, 0, null])
        assert.deepEqual([remesa60Row.paidDocumentaryCents, remesa60Row.remainingCents, remesa60Row.cashCents], [6_000, 0, null])
        equal(initial.summary.diferenciasCaja.sinAtribuir.cents, -500, 'La comisión de remesa no se prorratea a FI')
        equal(initial.summary.diferenciasCaja.atribuible.cents, -500)
        const oldCobradoRow = invoiceById(initial, oldCobradoFi.id)
        equal(oldCobradoRow.paymentState, 'PENDIENTE_COBRO', 'El estado COBRADA legado no acredita un pago B7')
        equal(oldCobradoRow.paidDocumentaryCents, 0)
        const zeroRow = invoiceById(initial, zeroFi.id)
        assert.deepEqual([zeroRow.targetCents, zeroRow.paidDocumentaryCents, zeroRow.remainingCents, zeroRow.cashCents], [0, 0, 0, null])
        equal(zeroRow.paymentState, 'PENDIENTE_COBRO_REVISION', 'Cero conocido no equivale a factura cobrada')
        equal(invoiceById(initial, heuristicFi.id).facturaISPId, null, 'No existe prueba FK heurística')
        assertions += 1

        // Reader proof rechecks the physical bank text now, rather than trusting a
        // historical B4 wrapper target. The deliberately malformed synthetic Float
        // blocks paid state before deferred constraints are forced, then is restored.
        await tx.$executeRaw`
          UPDATE movimientos_bancarios SET importe = CAST(${'94.00'} AS double precision) WHERE id = ${cashMovement}
        `
        const goalMismatch = invoiceById(await readFixture(), cashFi.id)
        equal(goalMismatch.paymentState, 'PENDIENTE_COBRO_REVISION')
        equal(goalMismatch.paidDocumentaryCents, null)
        await tx.$executeRaw`
          UPDATE movimientos_bancarios SET importe = CAST(${'95.00'} AS double precision) WHERE id = ${cashMovement}
        `
        await tx.$executeRaw`
          UPDATE movimientos_bancarios SET importe = CAST(${'0.30000000000000004'} AS double precision) WHERE id = ${cashMovement}
        `
        const physicallyStale = invoiceById(await readFixture(), cashFi.id)
        equal(physicallyStale.paymentState, 'PENDIENTE_COBRO_REVISION')
        equal(physicallyStale.paidDocumentaryCents, null)
        equal(physicallyStale.remainingCents, null)
        await tx.$executeRaw`
          UPDATE movimientos_bancarios SET importe = CAST(${'95.00'} AS double precision) WHERE id = ${cashMovement}
        `
        equal(invoiceById(await readFixture(), cashFi.id).paymentState, 'COBRADA_CALCULADA')
        assertions += 1

        // A Float residue is read as physical bank source text and rejected before it
        // can become a B4 proof. It must never make any synthetic FI paid.
        const residueMovement = await movement('FLOAT-RESIDUO', 30)
        await tx.$executeRaw`
          UPDATE movimientos_bancarios SET importe = CAST(${'0.30000000000000004'} AS double precision) WHERE id = ${residueMovement}
        `
        await expectB4('IMPORTE_FUENTE_NO_EXACTO', () => b4Confirm(residueMovement, 0, []))
        const nanMovement = await movement('FLOAT-NAN', 1)
        await tx.$executeRawUnsafe(`UPDATE movimientos_bancarios SET importe = 'NaN'::double precision WHERE id = '${nanMovement}'`)
        const nanProof = await tx.$queryRaw<Array<{ cents: number | null }>>`
          SELECT b4_importe_bancario_centimos(importe) AS cents FROM movimientos_bancarios WHERE id = ${nanMovement}
        `
        equal(nanProof[0]?.cents, null, 'La función física B4 debe rechazar NaN exacto')
        // Prisma rejects Float NaN while hydrating the source before B4 can create
        // an operation. That earlier rejection is safe and no financial row is paid.
        await expectRejected(() => b4Confirm(nanMovement, 0, []), 'NaN no puede atravesar la fuente B4')
        equal(invoiceById(await readFixture(), cashFi.id).paymentState, 'COBRADA_CALCULADA')
        assertions += 1

        // Actual current source values, not wrapper history, control B7. Mutating the
        // synthetic remittance goal makes every member review/null before any deferred
        // constraint is forced; restoration is also exclusively synthetic.
        await tx.$executeRaw`UPDATE remesas SET total_importe = CAST(${'101.00'} AS numeric) WHERE id = ${mainRemesa.id}`
        let response = await readFixture()
        for (const id of [remesaFi40.id, remesaFi60.id]) {
          const row = invoiceById(response, id)
          equal(row.paymentState, 'PENDIENTE_COBRO_REVISION')
          equal(row.paidDocumentaryCents, null)
          equal(row.remainingCents, null)
        }
        await tx.$executeRaw`UPDATE remesas SET total_importe = CAST(${'100.00'} AS numeric) WHERE id = ${mainRemesa.id}`
        equal(invoiceById(await readFixture(), remesaFi40.id).paymentState, 'COBRADA_CALCULADA')
        assertions += 1

        // The immutable B6 source root becomes stale when the same IDs acquire a
        // different source date. A new human association with the current exact hash
        // revalidates it; restoring the original synthetic date then reuses the exact
        // original root, never a heuristic or an external row.
        const changedFacturaDate = at(2_880)
        await tx.$executeRaw`UPDATE facturas SET fecha = ${changedFacturaDate}::date WHERE id = ${remesaFactura40.id}`
        response = await readFixture()
        equal(invoiceById(response, remesaFi40.id).paymentState, 'PENDIENTE_COBRO_REVISION')
        equal(invoiceById(response, remesaFi40.id).paidDocumentaryCents, null)
        const reassociatedFactura: any = await confirmarAsociacionFacturasRemesaB6(actor.id, associationInput(
          mainRemesa,
          [{ ...remesaFactura40, fecha: changedFacturaDate }, remesaFactura60],
        ))
        assert.notEqual(reassociatedFactura.resultado.sourceSnapshot.sourceHash, mainAssociation.resultado.sourceSnapshot.sourceHash)
        equal(invoiceById(await readFixture(), remesaFi40.id).paymentState, 'COBRADA_CALCULADA')
        await tx.$executeRaw`UPDATE facturas SET fecha = ${DAY}::date WHERE id = ${remesaFactura40.id}`
        equal(invoiceById(await readFixture(), remesaFi40.id).paymentState, 'COBRADA_CALCULADA')

        const changedRemesaDate = at(4_320)
        await tx.$executeRaw`UPDATE remesas SET fecha = ${changedRemesaDate}::date WHERE id = ${mainRemesa.id}`
        response = await readFixture()
        equal(invoiceById(response, remesaFi60.id).paymentState, 'PENDIENTE_COBRO_REVISION')
        equal(invoiceById(response, remesaFi60.id).remainingCents, null)
        const reassociatedRemesa: any = await confirmarAsociacionFacturasRemesaB6(actor.id, associationInput(
          { ...mainRemesa, fecha: changedRemesaDate },
          [remesaFactura40, remesaFactura60],
        ))
        assert.notEqual(reassociatedRemesa.resultado.sourceSnapshot.sourceHash, mainAssociation.resultado.sourceSnapshot.sourceHash)
        equal(invoiceById(await readFixture(), remesaFi60.id).paymentState, 'COBRADA_CALCULADA')
        await tx.$executeRaw`UPDATE remesas SET fecha = ${DAY}::date WHERE id = ${mainRemesa.id}`
        equal(invoiceById(await readFixture(), remesaFi60.id).paymentState, 'COBRADA_CALCULADA')
        assertions += 1

        // A signed B6 refund is one actual negative REMESA line plus a separate
        // commission: bank -40.50, documentary principal -40.00, capacity assigned
        // wholly to the 40 FI. No fee is prorated and the other FI stays fully paid.
        const refundMovement = await movement('REMESA-REFUND-40-FEE', -4_050)
        const refundB4: any = await b4Confirm(refundMovement, -4_050, [
          { tipo: 'DOCUMENTO', documentoConciliableId: remesaDoc.documento.id, importeCentimos: -4_000 },
          { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -50 },
        ])
        const refundLine = await tx.vinculoMovimientoDocumento.findFirst({
          where: { operacionCreacionId: refundB4.operacion.id, activo: true, tipoLinea: 'DOCUMENTO' },
          select: { id: true, importeCentimos: true },
        })
        assert(refundLine, 'La devolución requiere una línea REMESA B4 real')
        equal(refundLine.importeCentimos, -4_000)
        const refund: any = await confirmarAsociacionDevolucionRemesaB6(actor.id, {
          action: 'asociar_devolucion', remesaId: mainRemesa.id, facturaISPId: remesaFactura40.id,
          vinculoId: refundLine.id, movimientoId: refundMovement, confirmacion: true, idempotencyKey: randomUUID(),
        })
        equal(refund.resultado.importeCentimos, -4_000)
        // Emular el commit de la asociación B6 antes de la operación posterior
        // de deshacer, manteniendo toda la prueba bajo el rollback exterior.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
        response = await readFixture()
        assert.deepEqual(
          [invoiceById(response, remesaFi40.id).paidDocumentaryCents, invoiceById(response, remesaFi40.id).remainingCents, invoiceById(response, remesaFi40.id).cashCents],
          [0, 4_000, null],
          'La devolución no prorratea caja ni comisión',
        )
        assert.deepEqual(
          [invoiceById(response, remesaFi60.id).paidDocumentaryCents, invoiceById(response, remesaFi60.id).remainingCents],
          [6_000, 0],
        )
        assertions += 1

        // B4 reversal removes current proof and B7 deduction, but B6's immutable
        // assignment/audit facts remain retained. No FI becomes paid by history alone.
        const refundLines = await tx.vinculoMovimientoDocumento.findMany({
          where: { operacionCreacionId: refundB4.operacion.id, activo: true },
          select: { id: true, importeCentimos: true },
        })
        const undoRefund: any = await deshacerB4(actor.id, {
          action: 'deshacer', confirmacion: true, idempotencyKey: randomUUID(), version: refundB4.estado.version,
          operacionId: refundB4.operacion.id,
          lineas: refundLines.map((line: any) => ({ id: line.id, importeCentimos: line.importeCentimos })),
        })
        equal(undoRefund.idempotente, false)
        equal(await tx.asignacionDevolucionRemesaB6.count({ where: { id: refund.resultado.asignacionId } }), 1)
        equal(await tx.auditoriaRemesaB6.count({ where: { id: refund.auditoriaId } }), 1)
        response = await readFixture()
        const reversed40 = invoiceById(response, remesaFi40.id)
        assert.equal(reversed40.paymentState, 'COBRADA_CALCULADA', `Reversión B4 conservó revisión: ${reversed40.reasons.join(',')}`)
        equal(reversed40.paidDocumentaryCents, 4_000)
        equal(reversed40.remainingCents, 0)
        equal(reversed40.cashCents, null)
        assertions += 1

        // A credit FI uses its signed negative source exactly. B4's direct document
        // line is negative too, so it closes at -25.00 with zero remaining.
        const creditFactura = await factura('NOTA-CREDITO-25', -2_500)
        const creditFi = await emitted('NOTA-CREDITO-25', -2_500, creditFactura)
        await insertIdentityEvent(tx, { fiId: creditFi.id, facturaId: creditFactura.id, actorId: actor.id, idExterno: String(creditFactura.ispGestionId) })
        const creditDoc: any = await createDocumentoB4(actor.id, {
          action: 'documento', tipoDocumento: 'FACTURA_EMITIDA', sourceId: creditFi.id,
        })
        equal(creditDoc.documento.importeObjetivoCentimos, -2_500)
        const creditMovement = await movement('NOTA-CREDITO-25', -2_500)
        await b4Confirm(creditMovement, -2_500, [
          { tipo: 'DOCUMENTO', documentoConciliableId: creditDoc.documento.id, importeCentimos: -2_500 },
        ])
        scope.fiIds.add(creditFi.id)
        scope.movementIds.add(creditMovement)
        const creditRow = invoiceById(await readFixture(), creditFi.id)
        assert.deepEqual([creditRow.targetCents, creditRow.paidDocumentaryCents, creditRow.remainingCents, creditRow.paymentState], [-2_500, -2_500, 0, 'COBRADA_CALCULADA'])
        assertions += 1

        // Mixed B4 funding is refused by the actual B6 association service. This uses
        // a separate synthetic source so it cannot contaminate the fixture reader.
        const mixedFactura = await factura('MIXTA-100', 10_000)
        const mixedFi = await emitted('MIXTA-100', 10_000, mixedFactura)
        await insertIdentityEvent(tx, { fiId: mixedFi.id, facturaId: mixedFactura.id, actorId: actor.id, idExterno: String(mixedFactura.ispGestionId) })
        const mixedRemesa = await remesa('MIXTA-100', 10_000)
        const mixedRemesaDoc: any = await createDocumentoB4(actor.id, { action: 'documento', tipoDocumento: 'REMESA', sourceId: String(mixedRemesa.id) })
        const mixedFiDoc: any = await createDocumentoB4(actor.id, { action: 'documento', tipoDocumento: 'FACTURA_EMITIDA', sourceId: mixedFi.id })
        await b4Confirm(await movement('MIXTA-REMESA', 10_000), 10_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: mixedRemesaDoc.documento.id, importeCentimos: 10_000 },
        ])
        await b4Confirm(await movement('MIXTA-FI', 10_000), 10_000, [
          { tipo: 'DOCUMENTO', documentoConciliableId: mixedFiDoc.documento.id, importeCentimos: 10_000 },
        ])
        await expectB6('FINANCIACION_DIRECTA_Y_REMESA_REQUIERE_REVISION', () => confirmarAsociacionFacturasRemesaB6(
          actor.id, associationInput(mixedRemesa, [mixedFactura]),
        ))
        assertions += 1

        // The negative condition has been restored (all current source values equal
        // their synthetic roots). Deferred B4 DDL is now forced only for a valid phase.
        await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
        reachedSentinel = true
        throw new RollbackSentinel()
      } finally {
        singleton.$transaction = saved.transaction
        singleton.$queryRaw = saved.queryRaw
        singleton.$queryRawUnsafe = saved.queryRawUnsafe
      }
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 20_000,
      timeout: 180_000,
    })
  } catch (error) {
    if (!(error instanceof RollbackSentinel)) throw error
  }

  assert(reachedSentinel, 'La transacción no alcanzó el rollback obligatorio B7')
  assert(assertions >= 12, 'Cobertura B7 PostgreSQL incompleta')
  equal(await fixtureCount(), 0, 'El rollback B7 dejó fixtures sintéticos')
  assert.deepEqual(await snapshotFinancialTables(), before, 'El rollback B7 alteró datos financieros preexistentes')
  console.log(`B7 PostgreSQL: ${assertions} invariantes B4/B6/B7 verificadas; 28 tablas sin persistencia.`)
}

run()
  .catch((error) => {
    // The detailed failure stays in the specifically authorized private diagnostics
    // directory; console deliberately contains no DB URL, SQL parameters or source data.
    try {
      const detail = error instanceof Error ? `${error.name}: ${error.stack ?? error.message}` : 'B7_TEST_FAILED'
      writeFileSync(PRIVATE_ERROR_FILE, `${detail}\n`, { mode: 0o600 })
    } catch { /* private diagnostic failure must not disclose data */ }
    console.error('La prueba B7 PostgreSQL no se completó; no se ha autorizado ninguna persistencia.')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
