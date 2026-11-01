/* Parejas propias humanas Conciliar: puro, sin BD, red, DML ni datos reales. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseConciliarCommand } from '../lib/finanzas/conciliar-contract'
import {
  classifyConciliarHumanOwnTransferRows,
  humanOwnTransferActionForProjection,
  parseConciliarHumanOwnTransferLegResult,
  parseConciliarHumanOwnTransferSource,
  preflightConciliarHumanOwnTransfer,
  preflightConciliarHumanOwnTransferTx,
  withConciliarHumanOwnTransferSealSnapshotTx,
  type ConciliarManualOwnTransferLiveMovement,
} from '../lib/finanzas/conciliar-human-own-transfer'

const PRIMARY = 'synthetic-own-leg-out'
const PAIRED = 'synthetic-own-leg-in'
const HASH = 'b'.repeat(64)
const UUID = '11111111-1111-4111-8111-111111111111'

function movement(input: Readonly<Partial<ConciliarManualOwnTransferLiveMovement> & Pick<ConciliarManualOwnTransferLiveMovement, 'id' | 'cuentaId' | 'fecha' | 'importeCentimos'>>): ConciliarManualOwnTransferLiveMovement {
  return {
    id: input.id,
    cuentaId: input.cuentaId,
    fecha: input.fecha,
    importeCentimos: input.importeCentimos,
    versionB4: 4,
    concepto: 'TRASPASO INTERNO SINTÉTICO',
    referencia: null,
    infoAdicional: null,
    tercero: null,
    banco: 'Banco sintético',
    tieneTerceroConfirmado: false,
    tieneVinculoDocumental: false,
    tieneCuentaPropiaConfirmada: false,
    ...input,
  }
}

const legs = [
  movement({ id: PRIMARY, cuentaId: 'synthetic-account-a', fecha: '2026-10-10', importeCentimos: -12_345 }),
  movement({ id: PAIRED, cuentaId: 'synthetic-account-b', fecha: '2026-10-13', importeCentimos: 12_345 }),
]
const attested = new Set(['synthetic-account-a', 'synthetic-account-b'])
const PAIR = classifyConciliarHumanOwnTransferRows({ movements: legs, attestedOwnAccountIds: attested, registeredAttestedOwnIbanKeys: new Set() }).reviews.get(PRIMARY)?.transferFingerprint
if (!PAIR) throw new Error('Fixture de pareja humana no clasificable.')
const source = {
  kind: 'TRANSFERENCIA_PROPIA_MANUAL',
  movimientoId: PRIMARY,
  movimientoParId: PAIRED,
  pairId: PAIR,
  proofSource: 'DECLARACION_MANUAL_AUDITADA_V1',
  versionB4: 4,
} as const

test('una fila verde manual expone sólo la capacidad humana cuando conserva fuente completa y no seleccionable', () => {
  assert.deepEqual(humanOwnTransferActionForProjection({ color: 'VERDE', seleccionable: false, grupo: 'TRASPASOS_PROPIOS', source }), {
    kind: 'CONFIRMAR_PAREJA_PROPIA', pairId: PAIR,
  })
  assert.equal(humanOwnTransferActionForProjection({ color: 'VERDE', seleccionable: true, grupo: 'TRASPASOS_PROPIOS', source }), null)
  assert.equal(humanOwnTransferActionForProjection({ color: 'AMBAR', seleccionable: false, grupo: 'TRASPASOS_PROPIOS', source }), null)
  assert.equal(parseConciliarHumanOwnTransferSource({ ...source, pairId: 'no-hash' }), null)
  assert.equal(parseConciliarHumanOwnTransferSource({ ...source, unexpected: true }), null)
})

test('el preflight humano exige exactamente el mismo par recíproco, atestado, opuesto y único', () => {
  const valid = preflightConciliarHumanOwnTransfer({ source, movements: legs, attestedOwnAccountIds: attested, registeredAttestedOwnIbanKeys: new Set() })
  assert.equal(valid?.primary.id, PRIMARY)
  assert.equal(valid?.paired.id, PAIRED)
  assert.equal(preflightConciliarHumanOwnTransfer({ source, movements: [legs[0]!, { ...legs[1]!, fecha: '2026-10-14' }], attestedOwnAccountIds: attested, registeredAttestedOwnIbanKeys: new Set() }), null)
  assert.equal(preflightConciliarHumanOwnTransfer({ source, movements: [...legs, movement({ id: 'synthetic-ambiguous', cuentaId: 'synthetic-account-c', fecha: '2026-10-12', importeCentimos: 12_345 })], attestedOwnAccountIds: new Set([...attested, 'synthetic-account-c']), registeredAttestedOwnIbanKeys: new Set() }), null)
  assert.equal(preflightConciliarHumanOwnTransfer({ source, movements: [{ ...legs[0]!, tieneTerceroConfirmado: true }, legs[1]!], attestedOwnAccountIds: attested, registeredAttestedOwnIbanKeys: new Set() }), null)
  assert.equal(preflightConciliarHumanOwnTransfer({ source, movements: [{ ...legs[0]!, tieneVinculoDocumental: true }, legs[1]!], attestedOwnAccountIds: attested, registeredAttestedOwnIbanKeys: new Set() }), null)
})

test('el comando humano está cerrado, limita a veinte parejas y no acepta prueba ni importes de navegador', () => {
  const parsed = parseConciliarCommand({
    action: 'confirmar_traspasos_propios_manual', idempotencyKey: UUID,
    items: [{ id: 'synthetic-row', decisionHash: HASH }],
  })
  assert.equal(parsed.action, 'confirmar_traspasos_propios_manual')
  assert.throws(() => parseConciliarCommand({
    action: 'confirmar_traspasos_propios_manual', idempotencyKey: UUID,
    items: [{ id: 'synthetic-row', decisionHash: HASH, pairId: PAIR }],
  }))
  assert.throws(() => parseConciliarCommand({
    action: 'confirmar_traspasos_propios_manual', idempotencyKey: UUID,
    items: Array.from({ length: 21 }, (_, index) => ({ id: `synthetic-row-${index}`, decisionHash: HASH })),
  }))
})

test('el recibo humano de pata exige modo, fuente, pareja y UUID completos para un undo atómico', () => {
  const receipt = {
    state: 'confirmada',
    sourceKind: 'TRANSFERENCIA_PROPIA_MANUAL',
    confirmationMode: 'HUMANA_PAREJA_ATESTADA_V1',
    proofSource: 'DECLARACION_MANUAL_AUDITADA_V1',
    pairId: PAIR,
    pairedOperationB4Id: '22222222-2222-4222-8222-222222222222',
    pairedMovementId: PAIRED,
    primaryMovementId: PRIMARY,
  }
  assert.deepEqual(parseConciliarHumanOwnTransferLegResult(receipt), receipt)
  assert.equal(parseConciliarHumanOwnTransferLegResult({ ...receipt, confirmationMode: 'AUTO' }), null)
  assert.equal(parseConciliarHumanOwnTransferLegResult({ ...receipt, pairedOperationB4Id: 'not-a-uuid' }), null)
  assert.equal(parseConciliarHumanOwnTransferLegResult({ ...receipt, unexpected: true }), null)
})

/** A read-only fake transaction. Its fixed query order mirrors the bounded
 * population, ownership schema, ownership proof and attested IBAN reads. */
function snapshotTx(population: readonly ConciliarManualOwnTransferLiveMovement[]) {
  let reads = 0
  const tx = {
    async $queryRaw() {
      reads += 1
      if (reads === 1) return population
      if (reads === 2) return [{ found: null }]
      if (reads === 3) return [...new Set(population.map(item => String(item.cuentaId)))].map(accountId => ({ accountId }))
      if (reads === 4) return []
      throw new Error(`LECTURA_FUERA_DE_FOTO_${reads}`)
    },
  }
  return { tx, reads: () => reads }
}

test('la foto G7 manual es proporcional, decide igual dentro de su callback y no cruza acciones', async () => {
  const stable = snapshotTx(legs)
  const inSnapshot = await withConciliarHumanOwnTransferSealSnapshotTx(stable.tx as never, async () => {
    const first = await preflightConciliarHumanOwnTransferTx(stable.tx as never, source, -12_345)
    const repeated = await Promise.all(Array.from({ length: 40 }, () =>
      preflightConciliarHumanOwnTransferTx(stable.tx as never, source, -12_345)))
    await assert.rejects(
      preflightConciliarHumanOwnTransferTx(stable.tx as never, { ...source, pairId: 'c'.repeat(64) }, -12_345),
      (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'TRANSFERENCIA_CAMBIADA',
      'un hash de pareja cambiado no puede recibir la decisión previa de la misma foto',
    )
    return { first, repeated }
  })
  assert.equal(stable.reads(), 4, 'cuarenta filas del mismo sellado sólo cargan una población, prueba e IBAN')
  assert.equal(inSnapshot.first.canonicalSource.pairId, PAIR)
  assert.ok(inSnapshot.repeated.every(result => result.canonicalSource.pairId === inSnapshot.first.canonicalSource.pairId), 'la decisión no cambia dentro de la misma foto')

  const altered = snapshotTx([...legs, movement({ id: 'synthetic-ambiguous', cuentaId: 'synthetic-account-c', fecha: '2026-10-12', importeCentimos: 12_345 })])
  await assert.rejects(
    withConciliarHumanOwnTransferSealSnapshotTx(altered.tx as never, async () =>
      preflightConciliarHumanOwnTransferTx(altered.tx as never, source, -12_345)),
    (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'TRANSFERENCIA_CAMBIADA',
    'una población/fuente alterada no puede heredar la decisión sellada',
  )

  await assert.rejects(
    preflightConciliarHumanOwnTransferTx(stable.tx as never, source, -12_345),
    /LECTURA_FUERA_DE_FOTO_5/,
    'fuera del callback la acción repite las lecturas vivas; no recibe la foto previa',
  )
  assert.equal(stable.reads(), 5)
})

console.log('OK: capacidad humana, preflight recíproco, contrato cerrado de veinte parejas y recibo reversible verificados con fixtures sintéticas.')
