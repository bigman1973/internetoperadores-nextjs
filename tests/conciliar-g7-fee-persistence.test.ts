import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertConciliarFeeFinancialPackageCounts,
  prepareConciliarBankFeeBatchRows,
  type ConciliarBankFeeBatchInput,
  type ConciliarBankFeeLockedSource,
} from '../lib/finanzas/conciliar-batch'
import { ConciliarBatchProviderError } from '../lib/finanzas/conciliar-batch'

const actorId = 17
const operationId = '11111111-1111-4111-8111-111111111111'

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

function input(size: number): ConciliarBankFeeBatchInput {
  return {
    action: 'confirmar_comisiones_conciliar_lote',
    operationId,
    items: Array.from({ length: size }, (_, index) => ({
      rowId: `row-${index}`,
      movimientoId: `fee-${index}`,
      version: 1,
      importeMovimientoCentimos: -100 - index,
      idempotencyKey: uuid(index + 1),
    })),
  }
}

function source(item: ConciliarBankFeeBatchInput['items'][number], index: number): ConciliarBankFeeLockedSource {
  return {
    movementId: item.movimientoId,
    importeCentimos: item.importeMovimientoCentimos,
    concepto: 'COMISIÓN DE MANTENIMIENTO',
    referencia: null,
    infoAdicional: null,
    tercero: null,
    banco: 'Banco de prueba',
    estado: index % 2 === 0 ? null : 'SIN_DOCUMENTO',
    motivoNoRequiere: null,
    version: item.version,
    entityId: index === 1 ? null : `aapp-${index}`,
    entityName: 'Administración de prueba',
    entityNif: 'A00000000',
    activeP1Id: null,
    p1Version: 0,
  }
}

function prepared(size = 3) {
  const command = input(size)
  return prepareConciliarBankFeeBatchRows(command, actorId, command.items.map(source))
}

function counts(rows: ReturnType<typeof prepared>) {
  return {
    operations: rows.length,
    states: rows.length,
    events: rows.length * 3,
    receipts: rows.length,
    p1: rows.filter(row => row.p1 !== null).length,
  }
}

function rejects(code: string, run: () => void) {
  assert.throws(run, error => error instanceof ConciliarBatchProviderError && error.code === code)
}

test('G7 package accepts only exact dependent financial counts', () => {
  const rows = prepared()
  assert.doesNotThrow(() => assertConciliarFeeFinancialPackageCounts([counts(rows)], rows))
  rejects('B4_OPERACIONES_NO_CREADAS', () => assertConciliarFeeFinancialPackageCounts([], rows))
  rejects('B4_OPERACIONES_NO_CREADAS', () => assertConciliarFeeFinancialPackageCounts([counts(rows), counts(rows)], rows))
  rejects('B4_OPERACIONES_NO_CREADAS', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), operations: rows.length - 1 }], rows))
  rejects('VERSION_CONFLICT', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), states: rows.length - 1 }], rows))
  rejects('B4_AUDITORIA_NO_CREADA', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), events: rows.length * 3 - 1 }], rows))
  rejects('B8_RECIBOS_NO_CREADOS', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), receipts: rows.length - 1 }], rows))
  rejects('P1_DECISIONES_NO_CREADAS', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), p1: counts(rows).p1 - 1 }], rows))
  rejects('B4_AUDITORIA_NO_CREADA', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), events: '9' }], rows))
  rejects('B8_RECIBOS_NO_CREADOS', () => assertConciliarFeeFinancialPackageCounts([{ ...counts(rows), receipts: Number.NaN }], rows))
})

test('G7 package chains operations through state, events, B8 and optional P1 without base-table rereads', () => {
  const source = readFileSync('lib/finanzas/conciliar-fee-persistence.ts', 'utf8')
  for (const token of [
    'WITH requested AS',
    'operations AS',
    'inserted_states AS',
    'updated_states AS',
    'states AS',
    'events AS',
    'audited AS',
    'receipts AS',
    'p1 AS',
    "'NO_REQUIERE'::\"EstadoJustificacionMovimiento\"",
    "'COMISION_BANCARIA'::\"MotivoNoRequiere\"",
    "'SOLICITUD'),('APROBACION'),('APLICACION'",
    "'CONFIRMADA'::\"EstadoDecisionTerceroModoFacil\"",
    "'BANCO'::\"TipoTerceroModoFacil\"",
    "'ENTIDAD_FISCAL'::\"OrigenTerceroModoFacil\"",
  ]) assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(source, /FROM operations o JOIN states s ON s\.movimiento_id=o\.movimiento_id/)
  assert.match(source, /FROM operations o JOIN audited a ON a\.operacion_id=o\.id/)
  assert.match(source, /FROM requested r JOIN receipts b ON b\.operacion_b4_id=CAST\(r\."operationB4Id" AS uuid\)/)
  assert.doesNotMatch(source, /(?:SELECT|FROM)\s+(?:operaciones_justificacion_b4|estado_justificacion_movimientos|eventos_justificacion_b4|recibos_eleccion_centro_b8|decisiones_tercero_modo_facil)\b[\s\S]*\bWHERE\b[\s\S]*\boperations\b/i)
})
