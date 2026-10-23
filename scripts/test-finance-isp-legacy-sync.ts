import assert from 'node:assert/strict'
import test from 'node:test'

import { createIspIssuedInvoiceProvider } from '../lib/finanzas/sync-jobs/providers/isp/isp-issued-invoice-provider'
import type { SyncSourceItem } from '../lib/finanzas/sync-jobs/types'

const item: SyncSourceItem = {
  key: 'isp-factura:17',
  tipo: 'ISP_FACTURA',
  data: {
    id: '17',
    serie_factura: 'CLL',
    numero_documento: 'CLL26/17',
    fecha: '2026-10-22',
    id_cliente: '9',
    codigo_cliente: 'C-9',
    nombrecompleto: 'Cliente de prueba',
    nif_cif: 'B12345678',
    documento: 'Servicio octubre',
    base: '100.00',
    total_impuesto: '21.00',
    total: '121.00',
  },
}

const sourceDate = new Date('2026-10-22T00:00:00.000Z')

function existingFactura(overrides: Record<string, unknown> = {}) {
  return {
    id: 41,
    ispGestionId: 17,
    serieFactura: 'CLL',
    numeroDocumento: 'CLL26/17',
    documento: 'Metadato legacy',
    fecha: sourceDate,
    idCliente: 9,
    codigoCliente: 'LEGACY-C-9',
    nombreCompleto: 'Cliente de prueba',
    nifCif: 'B12345678',
    ejercicio: 2025,
    base: '100.00',
    totalImpuesto: '21.00',
    total: '121.00',
    facturaEmitidaB4: null,
    ...overrides,
  }
}

function exactLegacyFI(overrides: Record<string, unknown> = {}) {
  return {
    id: 'fi-legacy-17',
    origenSistema: 'ISPGestion',
    idExterno: '17',
    numFactura: 'CLL26/17',
    serie: 'CLL',
    cliente: 'Cliente de prueba',
    cif: 'B12345678',
    fecha: sourceDate,
    base: '100.00',
    importeIva: '21.00',
    total: '121.00',
    facturaISPId: null,
    // These payment/bank-adjacent fields must never be changed by this provider.
    estado: 'COBRADA',
    importeCobrado: '121.00',
    fechaCobro: sourceDate,
    imputacion: 'LEGACY',
    formaCobro: 'TRANSFERENCIA',
    ...overrides,
  }
}

type FakeTxInput = {
  factura: Record<string, unknown>
  exactExternalFI: Record<string, unknown> | null
}

function fakeTx(input: FakeTxInput) {
  const calls = {
    facturaUpdates: [] as Array<Record<string, unknown>>,
    facturaEmitidaUpdates: [] as Array<Record<string, unknown>>,
    facturaEmitidaCreates: [] as Array<Record<string, unknown>>,
    auditCreates: [] as Array<Record<string, unknown>>,
    wrapperCreates: [] as Array<Record<string, unknown>>,
  }
  return {
    calls,
    tx: {
      factura: {
        findUnique: async () => input.factura,
        update: async ({ data }: { data: Record<string, unknown> }) => { calls.facturaUpdates.push(data) },
        create: async () => { throw new Error('No debe crear Factura para un legacy existente') },
      },
      facturaEmitida: {
        findUnique: async () => input.exactExternalFI,
        update: async ({ data }: { data: Record<string, unknown> }) => { calls.facturaEmitidaUpdates.push(data) },
        create: async ({ data }: { data: Record<string, unknown> }) => { calls.facturaEmitidaCreates.push(data) },
      },
      identidadFacturaISPEventoB7: {
        create: async ({ data }: { data: Record<string, unknown> }) => { calls.auditCreates.push(data) },
      },
      documentoConciliable: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => { calls.wrapperCreates.push(data) },
      },
      usuarioAdmin: { findUnique: async () => null },
    },
  }
}

async function prepared(provider: ReturnType<typeof createIspIssuedInvoiceProvider>) {
  const value = await provider.prepare(item)
  assert.equal((value as { kind?: unknown }).kind, 'VALID')
  return value
}

test('FI legacy exacta, sin FK y sin autorización de enlace actualiza sólo metadata verificada', async () => {
  const provider = createIspIssuedInvoiceProvider({
    request: async () => [],
    allowExistingIdentityLink: false,
  })
  const legacy = exactLegacyFI()
  const fake = fakeTx({ factura: existingFactura(), exactExternalFI: legacy })

  const outcome = await provider.apply(fake.tx as never, item, await prepared(provider), null)

  assert.equal(outcome, 'ACTUALIZADA')
  assert.deepEqual(fake.calls.facturaUpdates, [{
    serieFactura: 'CLL', numeroDocumento: 'CLL26/17', documento: 'Servicio octubre', fecha: sourceDate,
    idCliente: 9, codigoCliente: 'C-9', nombreCompleto: 'Cliente de prueba', nifCif: 'B12345678', ejercicio: 2026,
  }])
  assert.deepEqual(fake.calls.facturaEmitidaUpdates, [])
  assert.deepEqual(fake.calls.facturaEmitidaCreates, [])
  assert.deepEqual(fake.calls.auditCreates, [])
  assert.deepEqual(fake.calls.wrapperCreates, [])
  assert.equal(legacy.facturaISPId, null)
  assert.equal(legacy.estado, 'COBRADA')
  assert.equal(legacy.importeCobrado, '121.00')
  assert.equal(legacy.formaCobro, 'TRANSFERENCIA')
})

test('FI legacy exacta y metadata ya verificada queda SIN_CAMBIOS sin crear FK ni tocar cobros', async () => {
  const provider = createIspIssuedInvoiceProvider({ request: async () => [], allowExistingIdentityLink: false })
  const legacy = exactLegacyFI()
  const fake = fakeTx({
    factura: existingFactura({ documento: 'Servicio octubre', codigoCliente: 'C-9', ejercicio: 2026 }),
    exactExternalFI: legacy,
  })

  const outcome = await provider.apply(fake.tx as never, item, await prepared(provider), null)

  assert.equal(outcome, 'SIN_CAMBIOS')
  assert.deepEqual(fake.calls.facturaUpdates, [])
  assert.deepEqual(fake.calls.facturaEmitidaUpdates, [])
  assert.deepEqual(fake.calls.auditCreates, [])
  assert.equal(legacy.facturaISPId, null)
  assert.equal(legacy.estado, 'COBRADA')
})

test('conflicto real de FI legacy vinculada a otra Factura permanece REVISAR y da motivo cerrado', async () => {
  const provider = createIspIssuedInvoiceProvider({
    request: async () => [],
    allowExistingIdentityLink: false,
  })
  const fake = fakeTx({ factura: existingFactura(), exactExternalFI: exactLegacyFI({ facturaISPId: 42 }) })
  const preparedValue = await prepared(provider)

  const outcome = await provider.apply(fake.tx as never, item, preparedValue, null)

  assert.equal(outcome, 'REVISAR')
  assert.deepEqual((provider as any).describeOutcome({ item, prepared: preparedValue, outcome }), { safeError: 'ISP_SOURCE_REQUIRES_REVIEW' })
  assert.deepEqual(fake.calls.facturaUpdates, [])
  assert.deepEqual(fake.calls.facturaEmitidaUpdates, [])
  assert.deepEqual(fake.calls.auditCreates, [])
})

test('FI con identidad financiera distinta permanece REVISAR con motivo genérico saneado', async () => {
  const provider = createIspIssuedInvoiceProvider({
    request: async () => [],
  })
  const fake = fakeTx({ factura: existingFactura(), exactExternalFI: exactLegacyFI({ total: '120.99' }) })
  const preparedValue = await prepared(provider)

  const outcome = await provider.apply(fake.tx as never, item, preparedValue, null)

  assert.equal(outcome, 'REVISAR')
  assert.deepEqual((provider as any).describeOutcome({ item, prepared: preparedValue, outcome }), { safeError: 'ISP_SOURCE_REQUIRES_REVIEW' })
  assert.deepEqual(fake.calls.facturaUpdates, [])
  assert.deepEqual(fake.calls.facturaEmitidaUpdates, [])
  assert.deepEqual(fake.calls.auditCreates, [])
})

test('fuente inválida termina ERROR con motivo saneado sin acceder a la transacción', async () => {
  const provider = createIspIssuedInvoiceProvider({
    request: async () => [],
  })
  const invalidItem: SyncSourceItem = { ...item, data: { ...(item.data as Record<string, any>), total: '121.001' } }
  const invalidPrepared = await provider.prepare(invalidItem)

  const outcome = await provider.apply({} as never, invalidItem, invalidPrepared, null)

  assert.equal(outcome, 'ERROR')
  assert.deepEqual((provider as any).describeOutcome({ item: invalidItem, prepared: invalidPrepared, outcome }), { safeError: 'CENTIMOS_NO_EXACTOS' })
})
