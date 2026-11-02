/* Regresión B4/G7: contrato estático puro; no abre Prisma, SQL, red ni variables de entorno. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const reconciliation = readFileSync('lib/finanzas/reconciliation-db.ts', 'utf8')
const precheck = readFileSync('lib/finanzas/conciliar-precheck.ts', 'utf8')
const collections = readFileSync('lib/finanzas/easy-collections-db.ts', 'utf8')
const easyReconciliation = readFileSync('lib/finanzas/easy-reconciliation-db.ts', 'utf8')

function between(source: string, start: string, end: string): string {
  const startAt = source.indexOf(start)
  assert.notEqual(startAt, -1, `No se encontró inicio: ${start}`)
  const endAt = source.indexOf(end, startAt + start.length)
  assert.notEqual(endAt, -1, `No se encontró fin: ${end}`)
  return source.slice(startAt, endAt)
}

test('Conciliar importa y ejecuta los dos preflights B4 de servidor', () => {
  assert.match(precheck, /import \{ preflightB4DraftTx, preflightB4SourceLinesTx, B4ServiceError \} from '\.\/reconciliation-db'/)
  assert.match(precheck, /await preflightB4DraftTx\(tx,noDocumentDraft\(/)
  assert.match(precheck, /await preflightB4SourceLinesTx\(tx,\{movimientoId,importeCentimos:row\.importeCentimos,version:version!,lineas:/)
})

test('confirmar B4 reutiliza un único preflight después de su cerrojo y antes de DML', () => {
  const confirm = between(reconciliation, 'async function confirmarB4TxInternal', '/** Confirma B4 y B8')
  const lockAt = confirm.indexOf('await advisoryAndMovementLock(tx, movimientoId)')
  const preflightAt = confirm.indexOf('await preflightB4DraftTx(tx, { version: raw.version as number, borrador: solicitudB4.borrador }, true)')
  const createAt = confirm.indexOf('operacionJustificacionB4.create')
  assert.ok(lockAt >= 0 && preflightAt > lockAt && createAt > preflightAt, 'confirmar debe bloquear, prevalidar y sólo después crear la operación')
  assert.doesNotMatch(confirm, /const movement: any = await \(tx\.movimientoBancario as any\)\.findUnique/)
  assert.doesNotMatch(confirm, /const validation = validarBorradorMovimiento\(/)
})

test('el preflight B4 conserva importe, wrappers, fuentes vivas, versión y archivo', () => {
  const draft = between(reconciliation, 'export async function preflightB4DraftTx', 'export type B4VirtualDocument')
  assert.match(draft, /const movimientoId = stringId\(\(raw\.borrador as JsonRecord \| undefined\)\?\.movimientoId, 'borrador\.movimientoId'\)/)
  assert.match(draft, /exactSourceDecimal\(tx,'movimientos_bancarios','importe',movement\.id\)/)
  assert.match(draft, /importeMovimientoCentimos !== movementCents/)
  assert.match(draft, /if \(lock\) await lockDocuments\(tx, docIds\)/)
  assert.match(draft, /for \(const doc of docs\) await evidenceForWrapper\(tx, doc\)/)
  assert.match(draft, /const plan = validateB4LoadedDraft\(raw, movementCents, docs, nets\)/)
  assert.match(draft, /const previousVersion = validateB4LoadedState\(previous, raw\.version\)/)
  assert.match(reconciliation, /function validateB4LoadedDraft[\s\S]*validarBorradorMovimiento\(normalizedDraft,/)
  assert.match(reconciliation, /function validateB4LoadedState[\s\S]*if \(previousVersion !== version\) fail\(409, 'VERSION_CONFLICT'/)
  assert.match(reconciliation, /function validateB4LoadedState[\s\S]*if \(previous\?\.estado === 'JUSTIFICADO' \|\| previous\?\.estado === 'NO_REQUIERE'\)/)
  assert.match(draft, /assertArchivosFinancierosParaNuevoCargoJustificadoTx\(tx, \{ movimientoId, estado: plan\.borrador\.estado, documentoConciliableIds: docIds \}\)/)
  assert.doesNotMatch(draft, /operacionJustificacionB4\.create|vinculoMovimientoDocumento\.create|estadoJustificacionMovimientoB4\.create/)
})

test('las líneas B4 preparadas sólo usan evidencia de fuente y wrappers virtuales no persistentes', () => {
  const sourceLines = between(reconciliation, 'export async function preflightB4SourceLinesTx', 'async function confirmarB4TxInternal')
  assert.match(sourceLines, /const evidence = await sourceEvidence\(tx, line\.tipoDocumento, line\.sourceId\)/)
  assert.match(sourceLines, /documentoConciliable\.findFirst\(\{ where: evidence\.pointer \}\)/)
  assert.match(sourceLines, /DOCUMENTO_EXISTENTE_INCOHERENTE/)
  assert.match(sourceLines, /const doc = existing \?\? \{ id: `00000000-0000-4000-8000-/)
  assert.match(sourceLines, /return preflightB4DraftTx\(base,\{version:input\.version,borrador:/)
  assert.doesNotMatch(sourceLines, /documentoConciliable\.create|createDocumentoB4Tx|confirmarB4Tx/)
})

test('Cobros preflight reutiliza la selección final en modo sin bloqueo ni efectos', () => {
  const selected = between(collections, 'async function selectedUnderLockTx', 'function b4Lines')
  assert.match(selected, /selectedUnderLockTx\(tx: Tx, generationId: string, selected: readonly EasyCollectionSelection\[\], lock = true\)/)
  assert.match(selected, /proposalsTx\(tx, generationId, selected\.map\(item => item\.propuestaId\), lock\)/)
  assert.match(selected, /proposalPopulationSql\(generationId, selected\.map\(item => item\.propuestaId\), lock\)/)
  assert.match(selected, /assertEasyCollectionBlockSelection\(result\.map\(selectionFacts\)\)/)
  assert.match(selected, /export async function preflightEasyCollectionSelectionTx\(base: Prisma\.TransactionClient, selection: EasyCollectionSelection\)/)
  assert.match(selected, /currentGenerationTx\(tx,false\)/)
  assert.match(selected, /selectedUnderLockTx\(tx,generation\.id,\[selection\],false\)/)
  assert.doesNotMatch(selected, /confirmarB4Tx|createDocumentoB4Tx|eventoJustificacionB4\.create/)
})

test('las candidatas fáciles comparten la revalidación con lock sólo para confirmar', () => {
  const helper = between(easyReconciliation, 'async function lockMovement', 'async function replayReceipt')
  assert.match(helper, /async function lockMovement\(tx: Tx, movimientoId: string, lock = true\)/)
  assert.match(helper, /if \(lock\) await tx\.\$queryRaw`SELECT pg_advisory_xact_lock/)
  assert.match(helper, /WHERE m\.id=\$\{movimientoId\} \$\{lock \? Prisma\.sql`FOR UPDATE OF m` : Prisma\.empty\}/)
  assert.match(easyReconciliation, /export async function inspectEasyCandidatesTx\(tx: Prisma\.TransactionClient, movimientoId: string, lock = true\)/)
  assert.match(easyReconciliation, /lockMovement\(asTx\(tx\), movimientoId, lock\)/)
  assert.match(precheck, /preflightConciliarReceivedInvoiceTx\(tx,row\)/)
  assert.match(precheck, /preflightConciliarB5TicketTx\(tx,row\)/)
})

console.log('OK: B4 y Cobros comparten preflights de servidor; importe, evidencia, versión, archivo y bloqueos de confirmación siguen cerrados.')
