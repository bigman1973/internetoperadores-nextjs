/* C3 B5 integration guards: static only. No Prisma connection, DML, network, build or tsc. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')
const read = (file: string) => readFileSync(resolve(root, file), 'utf8')
const contract = read('lib/finanzas/conciliar-contract.ts')
const db = read('lib/finanzas/conciliar-db.ts')
const actions = read('lib/finanzas/conciliar-actions.ts')

assert.match(contract, /'PAGO_TICKET_B5'/)
for (const field of ['adjuntoB5Id?: string', 'gastoId?: string', 'documentoConciliableId?: string', 'versionB4?: number']) {
  assert.match(contract, new RegExp(field.replace(/[?]/g, '\\?')))
}

const sourceRead = db.match(/async function b5DocumentSources[\s\S]*?\n}\n\nfunction isControlledB5TicketFile/)?.[0]
assert(sourceRead, 'la lectura B5 acotada debe existir')
assert.match(sourceRead, /a\.estado='UPLOAD_COMPLETO'/)
assert.match(sourceRead, /a\.tipo_documento IN \('TICKET','SOPORTE'\)/)
assert.match(sourceRead, /a\.movimiento_id AS "movimientoId"/)
assert.match(sourceRead, /LIMIT \$\{MAX_REBUILD_ROWS \+ 1}/)
assert.match(sourceRead, /documento_conciliable_id=d\.id/)
assert.match(sourceRead, /operation\.revertida_at IS NULL/)
assert.doesNotMatch(sourceRead, /authenticated_web_url|downloadUrl|https?:\/\//i)

const reviewBlock = db.match(/const b5Review = selectConciliarB5DocumentReview\([\s\S]*?\n    }\n    const aliases = movementPartyAliases/)?.[0]
assert(reviewBlock, 'la proyección debe revisar B5 antes de heurísticas de proveedor')
assert(reviewBlock!.indexOf('selectConciliarB5DocumentReview') < reviewBlock!.indexOf('const aliases = movementPartyAliases'))
assert.match(reviewBlock!, /PAGO_TICKET_B5/)
assert.match(reviewBlock!, /ADJUNTO_B5:/)
assert.match(reviewBlock!, /seleccionable: b5Review\.seleccionable/)
assert.match(reviewBlock!, /SOPORTE[\s\S]*nunca[\s\S]*importe|SOPORTE intentionally has no ConciliarDocument/)
assert.doesNotMatch(reviewBlock!, /PAGO_SOPORTE_B5/)

const b5Action = actions.match(/async function confirmB5Ticket[\s\S]*?\n}\n\nasync function confirmPayroll/)?.[0]
assert(b5Action, 'la rama explícita de confirmación B5 debe existir')
assert.match(b5Action!, /inspectEasyCandidatesTx\(tx, movimientoId\)/)
assert.match(b5Action!, /liveB5TicketSourceTx\(tx, row\.source, movimientoId\)/)
assert.match(b5Action!, /suggestion\.tipo === 'TICKET'/)
assert.match(b5Action!, /suggestion\.sourceId === live\.gastoId/)
assert.match(b5Action!, /suggestion\.documentoConciliableId === live\.documentoConciliableId/)
assert.match(b5Action!, /suggestion\.exacta === true/)
assert.match(b5Action!, /suggestion\.archivoDisponible === true/)
assert.match(b5Action!, /suggestion\.importeCentimos === row\.importeCentimos/)
assert.match(b5Action!, /confirmEasyReconciliationTx\(tx, actorId/)
assert.match(b5Action!, /confirmacion: true/)
assert.doesNotMatch(b5Action!, /createDocumentoB4Tx|\.gasto\.create|documentoConciliable\.create/)

const liveSource = actions.match(/async function liveB5TicketSourceTx[\s\S]*?\n}\n\n\/\*\* PAGO_TICKET_B5/)?.[0]
assert(liveSource, 'la revalidación viva de adjunto B5 debe existir')
assert.match(liveSource!, /a\.movimiento_id=\$\{movimientoId}/)
assert.match(liveSource!, /a\.estado='UPLOAD_COMPLETO'/)
assert.match(liveSource!, /a\.gasto_id=\$\{gastoId}/)
assert.match(liveSource!, /a\.documento_conciliable_id=CAST\(\$\{documentoConciliableId} AS uuid\)/)
assert.match(liveSource!, /d\.tipo='TICKET'/)
assert.match(liveSource!, /d\.activo=true/)
assert.match(liveSource!, /TARJETA_EMPRESA/)
assert.match(liveSource!, /a\.fecha_documento::date=g\.fecha::date/)
assert.match(liveSource!, /a\.importe_documento_centimos=b4_importe_bancario_centimos\(g\.importe\)/)
assert.match(liveSource!, /d\.importe_objetivo_centimos=-b4_importe_bancario_centimos\(g\.importe\)/)
assert.match(liveSource!, /b4_importe_bancario_centimos\(m\.importe\)=-b4_importe_bancario_centimos\(g\.importe\)/)
assert.match(liveSource!, /g\.fecha::date<=m\.fecha_operacion::date/)
assert.match(liveSource!, /capacity\.asignado=0/)
assert.match(liveSource!, /bibliotecaFinancieraConfigurada/)
assert.doesNotMatch(liveSource!, /authenticated_web_url|downloadUrl|https?:\/\//i)

assert.match(actions, /case 'PAGO_TICKET_B5': return confirmB5Ticket/)
console.log('OK: C3 B5 proyecta sólo UPLOAD_COMPLETO del mismo movimiento, conserva SOPORTE ámbar, y confirma únicamente tras revalidación B5/B4 viva sin crear fuentes alternativas.')
