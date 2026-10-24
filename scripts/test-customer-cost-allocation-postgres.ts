import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { CustomerCostAllocationError, currentUtcPeriod, parseAllocationRequest } from '../lib/finanzas/customer-cost-allocation-core'
import {
  confirmCustomerCostAllocationTx,
  listCandidateContracts,
  listEligibleSources,
  previewCustomerCostAllocation,
} from '../lib/finanzas/customer-cost-allocation-db'
import { digest, invoiceSnapshot } from '../lib/finanzas/operator-costs'

/**
 * Private staging proof for the customer-cost allocation ledger.
 *
 * Execute only after the reviewed migration has been applied to isolated staging:
 *   FINANCE_STAGING_SANDBOX=1 CUSTOMER_COST_ALLOCATION_ROLLBACK_TEST=1 \
 *   npx tsx scripts/test-customer-cost-allocation-postgres.ts
 *
 * It creates only tagged synthetic fixtures inside one outer SERIALIZABLE
 * transaction and always raises RollbackOnly. No fixture, decision or trigger
 * survives. No external provider, request route or UI is called.
 */
const TAG = `CUSTOMER-ALLOCATION-ROLLBACK-${randomUUID()}`
const ROLLBACK = new Error('CUSTOMER_COST_ALLOCATION_ROLLBACK_ONLY')
type Tx = Prisma.TransactionClient

function hash(label: string): string { return digest({ schema: 'CUSTOMER_COST_ALLOCATION_TEST', tag: TAG, label }) }
function currentMonthDate(): Date { return new Date(`${currentUtcPeriod()}-01T00:00:00.000Z`) }
function currentMonthEnd(): Date {
  const date = currentMonthDate()
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(date.getUTCDate() - 1)
  return date
}
function asCount(value: bigint | number | string | null | undefined): number { return Number(value ?? 0) }
function snapshotLegacy(invoice: { proveedor: string; numFactura: string | null; fecha: Date; base: number; concepto: string | null; lineasDetalle: string | null }) {
  return {
    proveedor: invoice.proveedor, numFactura: invoice.numFactura, fecha: invoice.fecha.toISOString(), base: invoice.base,
    concepto: invoice.concepto, lineasDetalle: invoice.lineasDetalle,
  }
}
async function expectCode(code: string, work: () => Promise<unknown>) {
  try { await work() } catch (error) {
    assert(error instanceof CustomerCostAllocationError, `Se esperaba CustomerCostAllocationError ${code}`)
    assert.equal(error.code, code, `Código esperado ${code}`)
    return
  }
  assert.fail(`Debía fallar con ${code}`)
}
async function rollbackSavepoint(tx: Tx, name: string, work: () => Promise<unknown>) {
  assert(/^[a-z_]+$/.test(name), 'SAVEPOINT no permitido')
  await tx.$executeRawUnsafe(`SAVEPOINT ${name}`)
  try { await work() } finally {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`)
    await tx.$executeRawUnsafe(`RELEASE SAVEPOINT ${name}`)
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
  }
}
async function ledgerCounts(tx: Tx) {
  const rows = await tx.$queryRaw<Array<{ repartos: bigint | number; lineas: bigint | number; contratos: bigint | number; auditorias: bigint | number }>>(Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM repartos_coste_cliente)::bigint AS repartos,
      (SELECT COUNT(*) FROM repartos_coste_cliente_lineas)::bigint AS lineas,
      (SELECT COUNT(*) FROM repartos_coste_cliente_contratos)::bigint AS contratos,
      (SELECT COUNT(*) FROM auditorias_reparto_coste_cliente)::bigint AS auditorias
  `)
  const row = rows[0]
  return { repartos: asCount(row?.repartos), lineas: asCount(row?.lineas), contratos: asCount(row?.contratos), auditorias: asCount(row?.auditorias) }
}
async function databaseSnapshot() {
  const rows = await prisma.$queryRaw<Array<{ snapshot: Record<string, unknown> }>>(Prisma.sql`
    SELECT jsonb_object_agg(nombre, jsonb_build_object('count', cantidad, 'hash', huella)) AS snapshot
    FROM (
      SELECT 'usuarios_admin'::text AS nombre, count(*)::text AS cantidad,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) AS huella FROM usuarios_admin t
      UNION ALL SELECT 'clientes_web', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM clientes_web t
      UNION ALL SELECT 'tarifas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM tarifas t
      UNION ALL SELECT 'contratos_servicio', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM contratos_servicio t
      UNION ALL SELECT 'facturas_recibidas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM facturas_recibidas t
      UNION ALL SELECT 'fuentes_coste_operadora', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM fuentes_coste_operadora t
      UNION ALL SELECT 'documentos_coste_operadora', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM documentos_coste_operadora t
      UNION ALL SELECT 'repartos_coste_cliente', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM repartos_coste_cliente t
      UNION ALL SELECT 'repartos_coste_cliente_lineas', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM repartos_coste_cliente_lineas t
      UNION ALL SELECT 'repartos_coste_cliente_contratos', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM repartos_coste_cliente_contratos t
      UNION ALL SELECT 'auditorias_reparto_coste_cliente', count(*)::text,
        md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY t.id::text), '')) FROM auditorias_reparto_coste_cliente t
    ) s
  `)
  assert.equal(rows.length, 1, 'No se pudo tomar el baseline de reparto')
  return rows[0].snapshot
}
async function routedRead<T>(tx: Tx, work: () => Promise<T>): Promise<T> {
  const singleton = prisma as typeof prisma & { $queryRaw: typeof tx.$queryRaw }
  const original = singleton.$queryRaw
  singleton.$queryRaw = tx.$queryRaw.bind(tx) as typeof singleton.$queryRaw
  try { return await work() } finally { singleton.$queryRaw = original }
}

async function run() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX, '1', 'FINANCE_STAGING_SANDBOX=1 es obligatorio')
  assert.equal(process.env.CUSTOMER_COST_ALLOCATION_ROLLBACK_TEST, '1', 'CUSTOMER_COST_ALLOCATION_ROLLBACK_TEST=1 es obligatorio')
  assert.notEqual(process.env.NODE_ENV, 'production', 'CUSTOMER_COST_ALLOCATION_IN_PRODUCTION_NO_WRITE')
  assert.notEqual(process.env.VERCEL_ENV, 'production', 'CUSTOMER_COST_ALLOCATION_IN_PRODUCTION_NO_WRITE')
  const identity = await prisma.$queryRaw<Array<{ db: string; role: string; ledger: string | null }>>(Prisma.sql`
    SELECT current_database() AS db, current_user AS role, to_regclass('repartos_coste_cliente')::text AS ledger
  `)
  assert.deepEqual(identity[0], { db: 'io_staging_finanzas', role: 'io_staging_finanzas', ledger: 'repartos_coste_cliente' }, 'Aplicar primero el DDL revisado únicamente en staging aislado')
  const before = await databaseSnapshot()
  let completed = false

  try {
    await prisma.$transaction(async (tx: Tx) => {
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
      const actor = await tx.usuarioAdmin.create({
        data: { email: `${TAG}@example.invalid`, passwordHash: 'CUSTOMER_ALLOCATION_ROLLBACK_NO_LOGIN', nombre: TAG, rol: 'SUPER_ADMIN', roles: [], activo: true },
        select: { id: true },
      })
      const date = currentMonthDate()
      const invoice = await tx.facturaRecibida.create({
        data: {
          id: randomUUID(), proveedor: `${TAG}-PROVEEDOR`, numFactura: `${TAG}-FR`, fecha: date,
          base: 150, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total: 150,
          concepto: `${TAG} factura de operadora revisada`, lineasDetalle: null, estado: 'VALIDADA', calidad: 'VALIDA',
          naturalezaDocumento: 'FACTURA_RECIBIDA', conflictoIdentidad: false, duplicadoExterno: false, imputadoAVentas: false,
        },
        select: { id: true, proveedor: true, numFactura: true, fecha: true, base: true, concepto: true, lineasDetalle: true, estado: true, imputadoAVentas: true },
      })
      const sourceInvoiceSnapshot = invoiceSnapshot(invoice)
      const source = await tx.fuenteCosteOperadora.create({
        data: {
          id: randomUUID(), claveOrigen: hash('source-origin'), origen: 'PROPIA', empresaPagadora: `${TAG}-EMPRESA`, periodo: currentUtcPeriod(),
          estado: 'REVISADO', snapshot: sourceInvoiceSnapshot, fuenteVersion: hash('source-version'), version: 1, creadoPor: actor.id,
        },
        select: { id: true, version: true },
      })
      await tx.documentoCosteOperadora.create({ data: { id: randomUUID(), fuenteId: source.id, facturaId: invoice.id, rol: 'ORIGINAL', version: digest(sourceInvoiceSnapshot) } })

      const clients = await Promise.all(['A', 'B'].map((suffix) => tx.clienteWeb.create({
        data: {
          email: `${TAG}-${suffix}@example.invalid`, passwordHash: 'CUSTOMER_ALLOCATION_ROLLBACK_NO_LOGIN', ispGestionId: `${TAG}-ISP-${suffix}`,
          clienteIdIsp: `${TAG}-CLIENTE-${suffix}`, nombre: `${TAG}-CLIENTE-${suffix}`, activo: true,
        }, select: { id: true, clienteIdIsp: true },
      })))
      const tariffs = await Promise.all(['A', 'B'].map((suffix) => tx.tarifa.create({
        data: {
          tipoCliente: 'EMPRESA', categoria: `${TAG}-CATEGORIA`, nombre: `${TAG}-TARIFA-${suffix}`,
          precioSinIva: suffix === 'A' ? 100 : 50, precioConIva: suffix === 'A' ? 100 : 50, tipoPeriodicidad: 1, activa: true,
        }, select: { id: true, nombre: true },
      })))
      const uniqueBase = Number(`${Date.now()}`.slice(-8))
      const contracts = await Promise.all(clients.map((client, index) => tx.contratoServicio.create({
        data: {
          ispGestionContratoId: uniqueBase + index + 1, clienteId: client.clienteIdIsp!, titulo: `${TAG}-CONTRATO-${index + 1}`,
          tarifa: tariffs[index].nombre, precio: index === 0 ? 100 : 50, activo: true, fechaInicio: date, fechaBaja: null,
        }, select: { id: true },
      })))

      const previewInput = parseAllocationRequest({
        action: 'preview', fuenteId: source.id, sourceVersion: source.version, invoiceSnapshotHash: digest(sourceInvoiceSnapshot),
        periodoServicio: currentUtcPeriod(), clasificacion: 'REPARTIBLE',
        selecciones: contracts.map((contract, index) => ({ clienteId: clients[index].id, contratoId: contract.id })),
      })
      const ledgerBeforeRead = await ledgerCounts(tx)
      const [listed, candidates, preview] = await routedRead(tx, async () => Promise.all([
        listEligibleSources(TAG, 1),
        listCandidateContracts(source.id, currentUtcPeriod(), TAG),
        previewCustomerCostAllocation(previewInput),
      ]))
      assert.equal(listed.fuentes.length, 1, 'GET de fuentes sólo muestra una fuente existente REVISADO')
      assert.equal(candidates.contratos.filter((contract) => contract.seleccionable).length, 2, 'Las tarifas mensuales 100/50 son seleccionables')
      assert.equal(preview.fuente.costeCentimos, '15000', 'La previsualización usa exactamente la base de la fuente')
      assert.equal(preview.lineas.reduce((sum, line) => sum + BigInt(line.costeCentimos), BigInt(0)), BigInt(preview.fuente.costeCentimos), 'La previsualización cierra contra la base')
      assert.deepEqual(await ledgerCounts(tx), ledgerBeforeRead, 'Las lecturas GET/preview no materializan ningún reparto')

      const sourceBeforeConfirm = snapshotLegacy(invoice)
      const confirmInput = parseAllocationRequest({ ...previewInput, action: 'confirm', idempotencyKey: randomUUID() })
      const confirmed = await confirmCustomerCostAllocationTx(tx, actor.id, confirmInput)
      assert.equal(confirmed.idempotente, false)
      assert.equal(confirmed.reparto.clasificacion, 'REPARTIBLE')
      assert.equal(confirmed.lineas.reduce((sum, line) => sum + BigInt(line.costeCentimos), BigInt(0)), BigInt(15000))
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
      assert.deepEqual(await ledgerCounts(tx), { repartos: ledgerBeforeRead.repartos + 1, lineas: ledgerBeforeRead.lineas + 2, contratos: ledgerBeforeRead.contratos + 2, auditorias: ledgerBeforeRead.auditorias + 1 })
      const sourceAfterConfirm = await tx.facturaRecibida.findUniqueOrThrow({ where: { id: invoice.id }, select: { proveedor: true, numFactura: true, fecha: true, base: true, concepto: true, lineasDetalle: true } })
      assert.deepEqual(snapshotLegacy(sourceAfterConfirm), sourceBeforeConfirm, 'Confirmar no reescribe la fuente ni ningún campo legacy de factura')

      const replay = await confirmCustomerCostAllocationTx(tx, actor.id, confirmInput)
      assert.equal(replay.idempotente, true, 'La misma clave devuelve el recibo ya creado')
      assert.equal(replay.reparto.id, confirmed.reparto.id)
      await expectCode('IDEMPOTENCY_PAYLOAD_MISMATCH', () => confirmCustomerCostAllocationTx(tx, actor.id, { ...confirmInput, periodoServicio: currentUtcPeriod() === '2099-12' ? '2099-11' : '2099-12' }))

      // A stale source must not turn an identical idempotency replay into a new
      // decision. Restore its business fields afterwards so the next explicit
      // replacement validates the original source again.
      await tx.facturaRecibida.update({ where: { id: invoice.id }, data: { base: 150.01, total: 150.01 } })
      const staleReplay = await confirmCustomerCostAllocationTx(tx, actor.id, confirmInput)
      assert.equal(staleReplay.idempotente, true, 'El replay se resuelve antes de validar una fuente ya cambiada')
      assert.deepEqual(await ledgerCounts(tx), { repartos: ledgerBeforeRead.repartos + 1, lineas: ledgerBeforeRead.lineas + 2, contratos: ledgerBeforeRead.contratos + 2, auditorias: ledgerBeforeRead.auditorias + 1 }, 'Un replay con fuente cambiada no crea una decisión nueva')
      await tx.facturaRecibida.update({ where: { id: invoice.id }, data: { base: 150, total: 150 } })

      const punctualInput = parseAllocationRequest({
        action: 'confirm', fuenteId: source.id, sourceVersion: source.version, invoiceSnapshotHash: digest(sourceInvoiceSnapshot),
        periodoServicio: currentUtcPeriod(), clasificacion: 'PUNTUAL', selecciones: [], idempotencyKey: randomUUID(),
      })
      const punctual = await confirmCustomerCostAllocationTx(tx, actor.id, punctualInput)
      assert.equal(punctual.idempotente, false)
      assert.equal(punctual.reparto.clasificacion, 'PUNTUAL')
      assert.equal(punctual.lineas.length, 0, 'PUNTUAL se guarda sin líneas de cliente')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE')
      await tx.$executeRawUnsafe('SET CONSTRAINTS ALL DEFERRED')
      const statuses = await tx.$queryRaw<Array<{ id: string; estado: string; clasificacion: string }>>(Prisma.sql`
        SELECT id, estado, clasificacion FROM repartos_coste_cliente
        WHERE fuente_coste_operadora_id = ${source.id} ORDER BY version ASC
      `)
      assert.deepEqual(statuses, [
        { id: confirmed.reparto.id, estado: 'RENUNCIADO', clasificacion: 'REPARTIBLE' },
        { id: punctual.reparto.id, estado: 'VIGENTE', clasificacion: 'PUNTUAL' },
      ], 'Sustituir por PUNTUAL invalida el REPARTIBLE vigente sin borrar su evidencia')

      // Prove that the DB's deferred closure guard rejects a duplicate/excess
      // allocation even when callers bypass the service. This fixture uses a
      // second synthetic source only to avoid the partial unique current-source
      // index; the savepoint rolls back the deliberate violation immediately.
      const guardSource = await tx.fuenteCosteOperadora.create({
        data: {
          id: randomUUID(), claveOrigen: hash('guard-source-origin'), origen: 'PROPIA', empresaPagadora: `${TAG}-GUARD`, periodo: currentUtcPeriod(),
          estado: 'BORRADOR', snapshot: sourceInvoiceSnapshot, fuenteVersion: hash('guard-source-version'), version: 1, creadoPor: actor.id,
        }, select: { id: true },
      })
      const guardInvoice = await tx.facturaRecibida.create({
        data: {
          id: randomUUID(), proveedor: `${TAG}-GUARD-PROVEEDOR`, numFactura: `${TAG}-GUARD-FR`, fecha: date,
          base: 1, tipoIva: 0, importeIva: 0, tipoIrpf: 0, importeIrpf: 0, total: 1,
          concepto: `${TAG} factura exclusiva para guarda`, estado: 'VALIDADA', calidad: 'VALIDA', naturalezaDocumento: 'FACTURA_RECIBIDA',
        }, select: { id: true },
      })
      await rollbackSavepoint(tx, 'duplicate_sum_guard', async () => {
        const badAllocation = randomUUID()
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO repartos_coste_cliente (id, fuente_coste_operadora_id, factura_recibida_id, version, estado, clasificacion, periodo_servicio, coste_centimos, source_version, source_snapshot_hash, snapshot_fuente, snapshot_seleccion, idempotency_key, payload_hash, creado_por)
          VALUES (${badAllocation}, ${guardSource.id}, ${guardInvoice.id}, 1, 'VIGENTE', 'REPARTIBLE', ${date}, ${BigInt(100)}, 1, ${hash('guard-source-snapshot')},
            ${JSON.stringify({ schema: 'CUSTOMER_COST_SOURCE_SNAPSHOT_V1' })}::jsonb, ${JSON.stringify({ schema: 'CUSTOMER_COST_SELECTION_V1' })}::jsonb,
            ${randomUUID()}, ${hash('guard-payload')}, ${actor.id})
        `)
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO repartos_coste_cliente_contratos (id, reparto_id, cliente_id, contrato_id, venta_periodo_centimos, unidades_periodo_meses, venta_normalizada_doceavos_centimo, snapshot_contrato)
          VALUES (${randomUUID()}, ${badAllocation}, ${clients[0].id}, ${contracts[0].id}, ${BigInt(10000)}, 1, ${BigInt(120000)},
            ${JSON.stringify({ schema: 'CUSTOMER_CONTRACT_SNAPSHOT_V1' })}::jsonb)
        `)
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO repartos_coste_cliente_lineas (id, reparto_id, cliente_id, venta_normalizada_doceavos_centimo, resto_numerador, orden_resto, coste_centimos, snapshot_cliente)
          VALUES (${randomUUID()}, ${badAllocation}, ${clients[0].id}, ${BigInt(120000)}, 0, 1, ${BigInt(200)}, ${JSON.stringify({ id: clients[0].id, nombre: `${TAG}-DUPLICATE-SUM` })}::jsonb)
        `)
        await assert.rejects(() => tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE'), /suma exacta|REPARTIBLE/i, 'La suma duplicada debe fallar al cerrar los constraints')
      })

      // A failure raised after header/lines but before audit must be atomic. The
      // transaction-local trigger is rolled back together with the savepoint.
      const failureInput = parseAllocationRequest({ ...previewInput, action: 'confirm', idempotencyKey: randomUUID() })
      const beforeFailure = await ledgerCounts(tx)
      await tx.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION pg_temp.customer_allocation_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key = '${failureInput.idempotencyKey}' THEN RAISE EXCEPTION 'CUSTOMER_ALLOCATION_SYNTHETIC_FAILURE' USING ERRCODE = '23514'; END IF; RETURN NEW; END; $$`)
      await tx.$executeRawUnsafe('CREATE TRIGGER customer_allocation_fail_audit_tr BEFORE INSERT ON auditorias_reparto_coste_cliente FOR EACH ROW EXECUTE FUNCTION pg_temp.customer_allocation_fail_audit()')
      await rollbackSavepoint(tx, 'atomic_failure', async () => {
        await assert.rejects(() => confirmCustomerCostAllocationTx(tx, actor.id, failureInput), /CUSTOMER_ALLOCATION_SYNTHETIC_FAILURE/)
      })
      assert.deepEqual(await ledgerCounts(tx), beforeFailure, 'Un fallo posterior no deja cabecera, líneas, contratos ni auditoría parcial')

      completed = true
      throw ROLLBACK
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120_000, maxWait: 15_000 })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
  assert(completed, 'La prueba no alcanzó el rollback obligatorio')
  assert.deepEqual(await databaseSnapshot(), before, 'El rollback alteró el staging preexistente')
  console.log(JSON.stringify({ passed: true, rollback: true, readOnly: true, previewExact: true, idempotency: true, staleReplay: true, puntualSubstitution: true, duplicateSumGuard: true, atomicFailure: true, sourceLegacyUnchanged: true }))
}

run()
  .catch((error) => { console.error('CUSTOMER_COST_ALLOCATION_POSTGRES_FAILED', error instanceof Error ? error.message.slice(0, 400) : 'desconocido'); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
