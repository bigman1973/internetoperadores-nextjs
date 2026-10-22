import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_B8_METADATA_JSON_BYTES,
  metadataB8JsonAcotado,
  solicitudB4SinCentroCosteFinanzas,
} from '../lib/finanzas/reconciliation-core'
import {
  eleccionesDesdeLineasB4,
  metadataHashEleccionesCentro,
} from '../lib/finanzas/centros-coste-core'

const DOCUMENTO = '11111111-1111-4111-8111-111111111111'
const CENTRO_A = '22222222-2222-4222-8222-222222222222'
const CENTRO_B = '33333333-3333-4333-8333-333333333333'

function economicHash(value: unknown): string {
  const canonical = (input: unknown): string => {
    if (Array.isArray(input)) return `[${input.map(canonical).join(',')}]`
    if (input && typeof input === 'object') {
      const record = input as Record<string, unknown>
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
    }
    return JSON.stringify(input)
  }
  return canonical(value)
}

test('B8: centro no cambia hash ni snapshot económico B4', () => {
  const base = {
    action: 'confirmar', confirmacion: true, idempotencyKey: 'key', version: 1,
    borrador: {
      movimientoId: 'mov-1', importeMovimientoCentimos: 1250, estado: 'JUSTIFICADO',
      lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: DOCUMENTO, importeCentimos: 1250 }],
    },
  }
  const first = {
    ...base,
    borrador: {
      ...base.borrador,
      lineas: [{ ...base.borrador.lineas[0], centroCosteFinanzasId: CENTRO_A }],
    },
  }
  const second = {
    ...base,
    borrador: {
      ...base.borrador,
      lineas: [{ ...base.borrador.lineas[0], centroCosteFinanzasId: CENTRO_B }],
    },
  }
  const economicFirst = solicitudB4SinCentroCosteFinanzas(first)
  const economicSecond = solicitudB4SinCentroCosteFinanzas(second)
  assert.deepEqual(economicFirst, economicSecond)
  assert.equal(economicHash(economicFirst), economicHash(economicSecond))

  const choicesA = eleccionesDesdeLineasB4(first.borrador.lineas)
  const choicesB = eleccionesDesdeLineasB4(second.borrador.lineas)
  assert.equal(choicesA.ok, true)
  assert.equal(choicesB.ok, true)
  if (choicesA.ok && choicesB.ok) assert.notEqual(metadataHashEleccionesCentro(choicesA.value), metadataHashEleccionesCentro(choicesB.value))
})

test('B8: centro en DIFERENCIA se conserva para rechazo explícito, no se borra al preparar economía', () => {
  const raw = {
    action: 'confirmar', confirmacion: true, idempotencyKey: 'key', version: 1,
    borrador: {
      movimientoId: 'mov-1', importeMovimientoCentimos: 100,
      estado: 'JUSTIFICADO',
      lineas: [
        { tipo: 'DOCUMENTO', documentoConciliableId: DOCUMENTO, importeCentimos: 200 },
        { tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -100, centroCosteFinanzasId: CENTRO_A },
      ],
    },
  }
  const choices = eleccionesDesdeLineasB4(raw.borrador.lineas)
  assert.equal(choices.ok, false)
  if (!choices.ok) assert.ok(choices.errors.some((error) => error.codigo === 'CENTRO_EN_DIFERENCIA'))
  const economic = solicitudB4SinCentroCosteFinanzas(raw) as typeof raw
  assert.equal((economic.borrador.lineas[1] as { centroCosteFinanzasId?: string }).centroCosteFinanzasId, CENTRO_A)
})

test('B8: metadata JSON queda limitado a 32 KiB y acepta elecciones pequeñas', () => {
  assert.equal(metadataB8JsonAcotado({ elecciones: [] }), true)
  assert.equal(metadataB8JsonAcotado({ elecciones: 'x'.repeat(MAX_B8_METADATA_JSON_BYTES) }), false)
})
