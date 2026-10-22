import assert from 'node:assert/strict'
import test from 'node:test'
import {
  b6ReadUrl,
  canonicalJsonB6,
  crearPayloadAsociarDevolucionB6,
  crearPayloadAsociarFacturasB6,
  facturaEsMiembroActualB6,
  facturaPuedeAsociarseB6,
  facturasSourceHashB6,
  parseDevolucionesB4ResponseB6,
  parseFacturasISPChoicesResponseB6,
  parseMiembrosRemesaResponseB6,
  puedePrepararAsociacionFacturasB6,
  remesaPuedeAsociarseB6,
  sumSignedCentimosB6,
} from '../components/finanzas/remesas-b6/remesas-b6-parser'

const HASH = 'a'.repeat(64)
const UUID = '123e4567-e89b-12d3-a456-426614174000'

function fuenteImporte(centimos: number | null, exacto = true) {
  return exacto
    ? { texto: String(centimos), centimos, exacto: true, codigoFuente: null }
    : { texto: 'origen roto', centimos: null, exacto: false, codigoFuente: 'IMPORTE_FUENTE_NO_EXACTO' }
}

function fuenteFecha(exacta = true) {
  return exacta
    ? { iso: '2026-10-01', exacta: true, codigoFuente: null }
    : { iso: null, exacta: false, codigoFuente: 'FECHA_FUENTE_DESCONOCIDA' }
}

function facturaRaw(id: number, totalCentimos: number, remesaId: number | null = null) {
  return {
    id, ispGestionId: id * 10, serieFactura: 'F', numeroDocumento: String(id), nombreCompleto: 'Cliente', codigoCliente: 'C',
    fecha: fuenteFecha(), importe: fuenteImporte(totalCentimos), remesaId, facturaEmitidaActual: null,
    source: { id, ispGestionId: id * 10, fecha: id === 7 ? '2026-10-01' : '2026-10-02', totalCentimos, sourceFingerprintSHA256: HASH },
    tieneEvidenciaDirectaB4: false,
  }
}

test('el hash de fuentes es canónico, ordenado por ID y coincide con SHA-256 esperado', async () => {
  const parsed = parseFacturasISPChoicesResponseB6({
    recurso: 'facturasISPchoices', remesaId: 99, paginacion: { limit: 100, offset: 0, total: 2 },
    items: [facturaRaw(7, 1200, 99), facturaRaw(2, -200, 99)],
  })
  assert.equal(canonicalJsonB6({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}')
  assert.equal(
    await facturasSourceHashB6(parsed.items),
    '9680f2569d292e51a5b3aaf6cd4386b5d23763fc36a2a33adc217fd17836adc9',
  )
  assert.equal(sumSignedCentimosB6(parsed.items), 1000)
})

test('los payloads son exactos, ordenan IDs y mantienen una key de reintento proporcionada', () => {
  const remesaHash = 'b'.repeat(64)
  const facturas = crearPayloadAsociarFacturasB6(99, 1000, remesaHash, [7, 2], HASH, UUID)
  assert.deepEqual(facturas, {
    action: 'asociar_facturas', remesaId: 99, facturaIdsISP: [2, 7], confirmacion: true,
    idempotencyKey: UUID, expectedRemesaTotalCentimos: 1000, expectedRemesaHashSHA256: remesaHash, expectedFacturasHashSHA256: HASH,
  })
  assert.deepEqual(Object.keys(facturas).sort(), [
    'action', 'confirmacion', 'expectedFacturasHashSHA256', 'expectedRemesaHashSHA256', 'expectedRemesaTotalCentimos', 'facturaIdsISP', 'idempotencyKey', 'remesaId',
  ])
  const devolucion = crearPayloadAsociarDevolucionB6(99, 7, UUID, 'mov-b4-7', UUID)
  assert.deepEqual(devolucion, {
    action: 'asociar_devolucion', remesaId: 99, facturaISPId: 7, vinculoId: UUID,
    movimientoId: 'mov-b4-7', confirmacion: true, idempotencyKey: UUID,
  })
})

test('una fuente desconocida queda visible pero bloqueada para asociación', () => {
  const raw = facturaRaw(7, 1200)
  raw.importe = fuenteImporte(null, false)
  raw.source = null
  const factura = parseFacturasISPChoicesResponseB6({
    recurso: 'facturasISPchoices', remesaId: 99, paginacion: { limit: 100, offset: 0, total: 1 }, items: [raw],
  }).items[0]
  assert.equal(facturaPuedeAsociarseB6(factura, 99), false)
  assert.throws(() => sumSignedCentimosB6([factura]), /FUENTE_FACTURA_DESCONOCIDA/)

  const remesa = {
    id: 99, ispGestionId: 1, nombre: 'R', fecha: fuenteFecha(false), importe: fuenteImporte(1000), numeroRegistros: 1,
    targetSource: { totalCentimos: 1000, sourceFingerprintSHA256: HASH },
  }
  assert.equal(remesaPuedeAsociarseB6(remesa), false)
})

test('la devolución B4 requiere facturaAsignadaId null y una factura ya miembro actual', () => {
  const miembro = parseFacturasISPChoicesResponseB6({
    recurso: 'facturasISPchoices', remesaId: 99, paginacion: { limit: 100, offset: 0, total: 1 }, items: [facturaRaw(7, 1200, 99)],
  }).items[0]
  assert.equal(facturaEsMiembroActualB6(miembro, 99), true)
  assert.equal(facturaEsMiembroActualB6({ ...miembro, remesaId: null }, 99), false)
  assert.deepEqual(parseDevolucionesB4ResponseB6({
    recurso: 'devolucionesB4', paginacion: { limit: 100, offset: 0, total: 1 },
    items: [{ vinculoId: UUID, movimientoId: 'mov-b4-7', remesaId: 99, fecha: '2026-10-03', concepto: 'Devolución', importeDocumentoCentimos: -1200, importeBancoCentimos: -1190, facturaAsignadaId: null }],
  }).items[0].importeBancoCentimos, -1190)
  assert.throws(() => parseDevolucionesB4ResponseB6({
    recurso: 'devolucionesB4', paginacion: { limit: 100, offset: 0, total: 1 },
    items: [{ vinculoId: UUID, movimientoId: 'mov-b4-7', remesaId: 99, fecha: '2026-10-03', concepto: 'Devolución', importeDocumentoCentimos: -1200, importeBancoCentimos: -1200, facturaAsignadaId: 7 }],
  }), /facturaAsignadaId/)
})

test('las URLs usan limit<=100, offset<=100000 y miembros exige remesa', () => {
  assert.equal(
    b6ReadUrl('facturasISPchoices', { remesaId: 99, limit: 100, offset: 100000, q: 'cliente' }),
    '/api/admin/finanzas/remesas/b6?recurso=facturasISPchoices&limit=100&offset=100000&q=cliente&remesaId=99',
  )
  assert.throws(() => b6ReadUrl('remesasLista', { limit: 101 }), /PAGINACION_UI_B6_INVALIDA/)
  assert.throws(() => b6ReadUrl('remesasLista', { offset: 100001 }), /PAGINACION_UI_B6_INVALIDA/)
  assert.throws(() => b6ReadUrl('miembrosRemesa'), /REMESA_UI_B6_OBLIGATORIA/)
})

test('membresía completa vacía y catálogo de 3.600 no impiden preparar dos fuentes seleccionadas; lectura incompleta bloquea', () => {
  const miembros = parseMiembrosRemesaResponseB6({
    recurso: 'miembrosRemesa', remesaId: 99, paginacion: { limit: 100, offset: 0, total: 0 }, items: [],
  })
  assert.equal(miembros.items.length, 0)

  // El total del catálogo no participa en la guarda de POST: sólo sus dos
  // filas elegidas con fuente conocida, más la captura completa de miembros.
  const catalogoDe3600 = { recurso: 'facturasISPchoices', remesaId: 99, paginacion: { limit: 100, offset: 0, total: 3600 }, items: [facturaRaw(7, 1200), facturaRaw(2, -200)] }
  const seleccionadas = parseFacturasISPChoicesResponseB6(catalogoDe3600).items
  const remesa = {
    id: 99, ispGestionId: 1, nombre: 'R', fecha: fuenteFecha(), importe: fuenteImporte(1000), numeroRegistros: 0,
    targetSource: { totalCentimos: 1000, sourceFingerprintSHA256: HASH },
  }
  assert.equal(puedePrepararAsociacionFacturasB6(remesa, seleccionadas, true), true)
  assert.equal(puedePrepararAsociacionFacturasB6(remesa, seleccionadas, false), false)
})
