import assert from 'node:assert/strict'
import test from 'node:test'
import { parseThirdPartyRead, parseThirdPartySearchCandidates } from '../components/finanzas/easy/newThirdPartyWorkspace'

const candidateId = `p1_${'a'.repeat(64)}`
const contextual = { bloque: 'REVISION_INDIVIDUAL' as const, codigo: 'CONTEXTO_CONFIRMING', aviso: 'El concepto indica confirming y requiere revisión individual. La ficha fiscal no se corrige automáticamente.' }

function response(stagingOnly: boolean | undefined) {
  return {
    ...(stagingOnly === undefined ? {} : { stagingOnly }),
    automaticas: false,
    periodo: { desde: '2026-01-01', hasta: '2026-10-08' },
    contador: {
      cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: 1,
      cargos: { movimientos: 0, importeCentimos: '0', identificados: 0 },
      cobros: { movimientos: 1, importeCentimos: '1234', identificados: 0 },
      identificados: 0, propuestosTexto: 1, sinIdentificar: 0,
    },
    total: 1,
    limit: 25,
    offset: 0,
    movimientos: [{
      id: 'mov-01', fecha: '2026-01-03', concepto: 'CONFIRMING', importeCentimos: 1234,
      cuenta: { banco: 'Banco', alias: null },
      paso1: {
        estadoPaso1: 'PROPUESTO', tipoTercero: null, etiqueta: null, origenPaso1: null, decisionId: null, version: 0,
        propuestaTexto: 'Draxton confirming',
        candidatos: [{ id: candidateId, tipoTercero: 'PROVEEDOR', etiqueta: 'Proveedor acreditado', origenPaso1: 'ENTIDAD_FISCAL', clasificacionContextual: contextual }],
      },
      paso2: { estadoPaso2: 'SIN_DOCUMENTO' },
    }],
  }
}

test('el parser individual acepta stagingOnly false veraz y exige el booleano', () => {
  const production = parseThirdPartyRead(response(false))
  assert.equal(production.total, 1)
  assert.equal(production.movimientos[0].paso1.candidatos[0].clasificacionContextual?.bloque, 'REVISION_INDIVIDUAL')
  assert.match(production.movimientos[0].paso1.candidatos[0].clasificacionContextual?.aviso ?? '', /no se corrige automáticamente/i)
  assert.throws(() => parseThirdPartyRead(response(undefined)), /lectura aislada sin automatismos/)
  assert.throws(() => parseThirdPartyRead({ ...response(false), automaticas: true }), /lectura aislada sin automatismos/)
})

test('el aviso contextual no cierra la confirmación individual y los DTOs previos siguen siendo legibles', () => {
  const current = parseThirdPartySearchCandidates({ candidatos: [{ id: candidateId, tipoTercero: 'PROVEEDOR', etiqueta: 'Proveedor acreditado', origenPaso1: 'ENTIDAD_FISCAL', clasificacionContextual: contextual }] })
  assert.equal(current[0].clasificacionContextual?.codigo, 'CONTEXTO_CONFIRMING')
  const legacy = parseThirdPartySearchCandidates({ candidatos: [{ id: candidateId, tipoTercero: 'PROVEEDOR', etiqueta: 'Proveedor acreditado', origenPaso1: 'ENTIDAD_FISCAL' }] })
  assert.equal(legacy.length, 1)
  assert.equal(legacy[0].clasificacionContextual, undefined)
})
