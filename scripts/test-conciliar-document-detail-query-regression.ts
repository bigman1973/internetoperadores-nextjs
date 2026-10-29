/*
 * Regresión pura: no abre Prisma ni DATABASE_URL. Ejecuta el lector real contra
 * un cliente de cola sintético para contar sus viajes SQL y clasificar la misma
 * plantilla Prisma.Sql que usaría producción.
 *
 * npx tsx --test scripts/test-conciliar-document-detail-query-regression.ts
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { readConciliarDocumentDetail } from '../lib/finanzas/conciliar-document-detail'

const HASH = 'a'.repeat(64)
const FINGERPRINT = 'b'.repeat(64)
const ROW_ID = 'fila_documental_sintetica'

type QueuedClient = Readonly<{
  queries: string[]
  client: { $queryRaw: <T>(statement: unknown) => Promise<T> }
}>

function sqlStrings(statement: unknown): string[] {
  const strings = (statement as { strings?: unknown }).strings
  assert(Array.isArray(strings) && strings.every(value => typeof value === 'string'), 'se esperaba Prisma.Sql con plantilla literal')
  return strings
}

function queued(...answers: unknown[]): QueuedClient {
  const queries: string[] = []
  return {
    queries,
    client: {
      async $queryRaw<T>(statement: unknown): Promise<T> {
        const strings = sqlStrings(statement)
        assert.equal(classifyPrisma5RawSqlStatement([{ strings }]), 'read_only', 'cada lectura del detalle debe pasar el clasificador')
        queries.push(strings.join('?'))
        assert(answers.length > 0, 'el lector emitió una consulta adicional no esperada')
        return answers.shift() as T
      },
    },
  }
}

function projection(source: Record<string, unknown>, grupo: string | null = null) {
  return {
    id: ROW_ID,
    movimiento_id: 'movimiento-sintetico',
    fecha: '2026-10-28',
    concepto: 'Abono documental sintético',
    banco: 'Banco sintético',
    cuenta: 'Cuenta sintética',
    importe_centimos: 9_876,
    pendiente_centimos: 9_876,
    color: 'VERDE',
    grupo,
    motivo: 'Evidencia sintética.',
    documento: null,
    propuesta: null,
    seleccionable: true,
    diferencia_centimos: 0,
    links_movimiento: [],
    detail: null,
    tab: 'COBROS',
    source,
    source_fingerprint: FINGERPRINT,
    updated_at: '2026-10-29T11:00:00.000Z',
  }
}

function confirmingBundle() {
  const document = {
    rol: 'LIQUIDACION_PDF',
    nombreOriginal: 'liquidacion-sintetica.pdf',
    facturaRecibidaId: 'confirming-sintetico',
    hashBinario: HASH,
    procedencia: 'ARCHIVO_DESCARGADO_CONTROLADO',
    archivoControladoId: 'archivo-sintetico',
    oneDriveDriveId: null,
    oneDriveItemId: null,
  }
  const line = {
    confirmingLineaId: 'linea-confirming-sintetica',
    facturaEmitidaId: 'factura-emitida-sintetica',
    numeroFactura: 'F-SINT-001',
    cliente: 'Cliente sintético',
    fechaEmision: '2026-10-01',
    fechaVencimiento: '2026-10-28',
    nominalCentimos: 10_000,
    interesesExplicitosCentimos: 100,
    comisionExplicitaCentimos: 20,
  }
  return {
    liquidacionId: '00000000-0000-4000-8000-000000000001',
    confirmingId: 'confirming-sintetico',
    liquidacionKey: 'liquidacion-sintetica',
    banco: 'CAIXABANK',
    estadoDocumental: 'CUADRA',
    fechaLiquidacion: '2026-10-28',
    cuentaDepositariaId: 'cuenta-depositaria-sintetica',
    cuentaIban: 'ES0000000000000000000000',
    nominalCentimos: 10_000,
    interesesCentimos: 100,
    comisionCentimos: 20,
    ivaComisionCentimos: 4,
    deduccionTotalCentimos: 124,
    netoBancarioCentimos: 9_876,
    sourceHash: HASH,
    proveedor: 'Proveedor sintético',
    sourceSnapshot: {
      schema: 'CONFIRMING_LIQUIDATION_DOCUMENTAL_V1',
      liquidacionKey: 'liquidacion-sintetica',
      confirmingId: 'confirming-sintetico',
      banco: 'CAIXABANK',
      fechaLiquidacion: '2026-10-28',
      cuentaDepositariaId: 'cuenta-depositaria-sintetica',
      sourceHash: HASH,
      documentos: [{ id: 'documento-sintetico', ...document }],
      resumen: {
        nominalCentimos: 10_000,
        interesesCentimos: 100,
        comisionCentimos: 20,
        ivaComisionCentimos: 4,
        deduccionTotalCentimos: 124,
        netoBancarioCentimos: 9_876,
      },
      lineas: [{
        id: 'linea-snapshot-sintetica',
        ...line,
        fechaEmisionProcedencia: 'DOCUMENTAL',
        fechaLineaDocumental: '2026-10-01',
      }],
    },
    documents: [document],
    lines: [line],
  }
}

function assertProjectionThenOneSourceRead(queries: readonly string[], sourceTable: string): void {
  assert.equal(queries.length, 2, 'el detalle debe hacer proyección + una única ampliación de fuente')
  assert.match(queries[0]!, /FROM conciliar_proyecciones/)
  assert.match(queries[1]!, new RegExp(`FROM ${sourceTable}`))
}

test('confirming hace una sola lectura C11 consolidada después de la proyección', async () => {
  const database = queued(
    [projection({ kind: 'COBRO_CONFIRMING', confirmingId: 'confirming-sintetico', confirmingSourceHash: HASH })],
    [confirmingBundle()],
  )
  const detail = await readConciliarDocumentDetail(ROW_ID, 1, database.client as never)
  assert.equal(detail.kind, 'CONFIRMING')
  assert.equal(detail.cuadreExacto, true)
  assert.equal(detail.lineas.length, 1)
  assertProjectionThenOneSourceRead(database.queries, 'liquidaciones_confirming_documentales l')
  assert.match(database.queries[1]!, /json_agg\(row_to_json\(document\)/)
  assert.match(database.queries[1]!, /json_agg\(row_to_json\(line\)/)
  assert.match(database.queries[1]!, /NOT EXISTS \(/)
  assert.match(database.queries[1]!, /LIMIT \?/) // 2.000 + 1 sigue parametrizado y acotado.
})

test('factura de proveedor conserva una única lectura de fuente después de la proyección', async () => {
  const database = queued(
    [{ ...projection({ kind: 'PAGO_FACTURA_RECIBIDA', facturaRecibidaId: 'factura-recibida-sintetica' }), importe_centimos: -9_876, pendiente_centimos: -9_876 }],
    [{ numeroFactura: 'PR-SINT-001', proveedor: 'Proveedor sintético', fechaFactura: '2026-10-01', fechaVencimiento: null, totalTexto: '98.76' }],
  )
  const detail = await readConciliarDocumentDetail(ROW_ID, 1, database.client as never)
  assert.equal(detail.kind, 'FACTURA')
  assert.equal(detail.cuadreExacto, true)
  assertProjectionThenOneSourceRead(database.queries, 'facturas_recibidas fr')
})

test('remesa usa una única CTE B7 persistida y rechaza cualquier composición parcial', async () => {
  const database = queued(
    [projection({ kind: 'COBRO_PROPUESTA', movimientoId: 'movimiento-sintetico', remesaId: 1 }, 'REMESA_VENCIMIENTO')],
    [{ receiptCount: 1, receiptId: '00000000-0000-4000-8000-000000000002', numeroFactura: 'RE-SINT-001', cliente: 'Cliente sintético', fechaFactura: '2026-10-01', importeCentimos: 9_876 }],
  )
  const detail = await readConciliarDocumentDetail(ROW_ID, 1, database.client as never)
  assert.equal(detail.kind, 'REMESA')
  assert.equal(detail.cuadreExacto, true)
  assertProjectionThenOneSourceRead(database.queries, 'recibos_cobro_remesa_b7 r')
  assert.match(database.queries[1]!, /WITH candidatos AS \(/)
  assert.match(database.queries[1]!, /LIMIT \?/) // 2.000 + 1 sigue parametrizado y acotado.
})
