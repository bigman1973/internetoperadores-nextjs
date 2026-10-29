import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  CONFIRMING_READING_UNAVAILABLE_MESSAGE,
  getConfirmingReadingReviewPresentation,
} from '../components/finanzas/confirming/ConfirmingReadingReviewQueue'
import type { FinanceConfirmingReadingQueueDto } from '../lib/finanzas/finance-confirming-reading-contract'

const available = (entries: FinanceConfirmingReadingQueueDto['entries']): FinanceConfirmingReadingQueueDto => ({
  schema: 'FINANCE_CONFIRMING_READING_QUEUE_V1',
  state: 'AVAILABLE',
  updatedAt: null,
  entries,
  unavailableCode: null,
})

const entry: FinanceConfirmingReadingQueueDto['entries'][number] = {
  id: 'queue-entry-for-test',
  kind: 'REVISAR_LECTURA',
  liquidacionId: null,
  movimientoId: null,
  archivoPrivadoId: 'private-file-for-test',
  fuenteVersion: 'v1',
  bancoOrigen: 'BBVA',
  pareja: 'NO_REQUIERE_PAREJA',
  motivo: 'LECTURA_NO_APTA_PARA_PROPUESTA',
  motivos: ['LECTURA_NO_APTA_PARA_PROPUESTA'],
  resumen: {
    nominalCentimos: 10_000,
    facturasDocumentales: 1,
    interesesCentimos: 0,
    comisionCentimos: 0,
    ivaComisionCentimos: 0,
    netoBancarioCentimos: 10_000,
    cuentaDepositariaDeclarada: true,
  },
  propuesta: null,
  confirmarB4Automaticamente: false,
  noEscrituras: true,
}

test('cola disponible y vacía: no es visible', () => {
  assert.deepEqual(getConfirmingReadingReviewPresentation(available([])), {
    visible: false,
    kind: 'EMPTY',
    allowsConfirmations: false,
  })
})

test('cola disponible con documentos: se muestra', () => {
  assert.deepEqual(getConfirmingReadingReviewPresentation(available([entry])), {
    visible: true,
    kind: 'READY',
    allowsConfirmations: false,
  })
})

test('fallo de carga: permanece visible con un aviso honesto, no como un vacío', () => {
  const unavailable: FinanceConfirmingReadingQueueDto = {
    schema: 'FINANCE_CONFIRMING_READING_QUEUE_V1',
    state: 'UNAVAILABLE',
    updatedAt: null,
    entries: [],
    unavailableCode: 'LECTURA_CONFIRMING_PERSISTENCIA_NO_DISPONIBLE',
  }
  assert.deepEqual(getConfirmingReadingReviewPresentation(unavailable), {
    visible: true,
    kind: 'UNAVAILABLE',
    allowsConfirmations: false,
  })
  assert.match(CONFIRMING_READING_UNAVAILABLE_MESSAGE, /No se ha podido cargar/)
  assert.doesNotMatch(CONFIRMING_READING_UNAVAILABLE_MESSAGE, /No hay lecturas/i)
})

test('la bandeja no ofrece controles que activen confirmaciones', () => {
  const source = readFileSync(resolve('components/finanzas/confirming/ConfirmingReadingReviewQueue.tsx'), 'utf8')
  assert.doesNotMatch(source, /<(?:button|form)\b/)
  assert.doesNotMatch(source, /\bonClick=/)
  for (const queue of [available([]), available([entry])]) {
    assert.equal(getConfirmingReadingReviewPresentation(queue).allowsConfirmations, false)
  }
})
