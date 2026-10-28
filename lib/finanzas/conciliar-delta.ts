import { Prisma } from '@prisma/client'
import { readBankInvoicingPopulation, type B7ReadDatabase } from '@/lib/finanzas/bank-invoicing-db'
import { readConciliarConfirmingCandidates } from './conciliar-confirming'
import {
  collectionProjectionForMovement,
  confirmingProjectionForMovement,
  emittedProjection,
  insertProjectionBatches,
  proposalCompositionInvoiceIds,
  readCollectionClientIdentityProfiles,
  readStrictOwnTransfers,
  unresolvedMovements,
  type ConciliarInvoiceDateIndex,
  type RebuildRow,
} from './conciliar-db'
import { conciliarColorRank, conciliarProjectionRowId, safeInteger } from './conciliar-core'
import type { ConciliarColor } from './conciliar-contract'

/**
 * Delta de recibo B7/B4. El lector B7 publicado hoy carga la población canónica
 * completa con límites duros de 25.000 por fuente y ejecuta calculateBankInvoicing
 * una sola vez; este módulo sólo sustituye las filas de un subgrafo FI/propuesta
 * cerrado. No promete un presupuesto temporal: evita DELETE/INSERT global, no
 * acredita <2 s.
 */
const MAX_DELTA_ROWS = 25_000
const MAX_RECEIPT_LINES = 2_000
const MAX_CONFIRMING_MOVEMENTS = 500
const CONFIRMING_MOVEMENT_BATCH = 100

type Tx = Prisma.TransactionClient & Record<string, any>
type DeltaKind = 'B7_REMESA' | 'CONFIRMING_B4'
type DeltaAction = 'CONFIRMAR' | 'DESHACER'

export type ConciliarProjectionDeltaInput = Readonly<{
  /** La acción ya bloqueó estado_proyeccion_conciliar antes de B4/B7. */
  projectionWasDirty: boolean
  action: DeltaAction
  /** Sólo es un gate de clase persistida; nunca aporta IDs/importes financieros. */
  sourceKind: 'COBRO_PROPUESTA' | 'COBRO_CONFIRMING'
  /** Operación B4 original de la confirmación, no la operación de reversión. */
  originalOperationB4Id: string
  movimientoId: string
}>

export type ConciliarProjectionDeltaResult = Readonly<{
  projectionSynchronized: boolean
  kind?: DeltaKind
  invoiceIds?: readonly string[]
}>

/** Forma pura de la dependencia propuesta -> FI para pruebas de cierre. */
export type DeltaProposalDependency = Readonly<{ movimientoId: string; invoiceIds: readonly string[] }>

/** El estado dirty previo siempre pertenece a una modificación que este delta no
 * ha observado. Nunca se limpia, aunque el resto de la fuente sea legible. */
export function canAttemptConciliarProjectionDelta(input: ConciliarProjectionDeltaInput): boolean {
  return !input.projectionWasDirty
    && input.originalOperationB4Id.length > 0
    && input.movimientoId.length > 0
}

/**
 * Cierra una componente propuesta/FI con datos ya obtenidos. Si una FI cambia de
 * estado B7, toda propuesta que la cita y toda FI citada por esas propuestas se
 * vuelve a evaluar; repetir hasta punto fijo evita referencias COBROS/EMITIDAS
 * obsoletas fuera del alcance inicial.
 */
export function closeDeltaProposalDependencies(
  initialInvoiceIds: readonly string[],
  proposals: readonly DeltaProposalDependency[],
  maximum = MAX_DELTA_ROWS,
): Readonly<{ invoiceIds: readonly string[]; movimientoIds: readonly string[] }> | null {
  if (!Number.isSafeInteger(maximum) || maximum < 1) return null
  const invoices = new Set(initialInvoiceIds.filter(id => typeof id === 'string' && id.length > 0))
  const selected = new Set<string>()
  if (!invoices.size || invoices.size > maximum) return null
  let changed = true
  while (changed) {
    changed = false
    for (const proposal of proposals) {
      if (!proposal.movimientoId || selected.has(proposal.movimientoId)) continue
      const ids = [...new Set(proposal.invoiceIds.filter(id => typeof id === 'string' && id.length > 0))]
      if (!ids.some(id => invoices.has(id))) continue
      selected.add(proposal.movimientoId)
      if (selected.size > maximum) return null
      for (const id of ids) {
        if (invoices.has(id)) continue
        invoices.add(id)
        if (invoices.size > maximum) return null
        changed = true
      }
    }
  }
  return { invoiceIds: [...invoices].sort(), movimientoIds: [...selected].sort() }
}

type ReceiptDescriptor = Readonly<{ receiptId: string; remesaId: number; movementId: string }>
type Scope = Readonly<{ kind: DeltaKind; invoiceIds: readonly string[] }>
type ProposalRow = Record<string, any>
type Candidate = Readonly<{ movementId: string; color: ConciliarColor; rowId: string; propuestaId: string | null }>
type ClosedProposalScope = Readonly<{ invoiceIds: readonly string[]; proposals: readonly ProposalRow[] }>

/** Sólo representa una fuente/precedencia que no permite un parche exacto.
 * No cubre errores SQL: P2034 debe subir al retry SERIALIZABLE del llamador. */
class DeltaIneligibleError extends Error {}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}
function sameSorted(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
function normalInteger(value: unknown): number | null {
  const parsed = safeInteger(value)
  return parsed !== null && parsed > 0 ? parsed : null
}
function proposalIds(proposal: ProposalRow): string[] {
  return proposalCompositionInvoiceIds(proposal.composicion)
}

async function b7ReceiptByOriginalOperation(tx: Tx, operationB4Id: string): Promise<ReceiptDescriptor | null> {
  const rows = await tx.$queryRaw<Array<{ receiptId: string; remesaId: number | bigint | string; movementId: string }>>(Prisma.sql`
    SELECT r.id::text AS "receiptId",r.remesa_id AS "remesaId",r.movimiento_id AS "movementId"
    FROM recibos_cobro_remesa_b7 r
    WHERE r.operacion_b4_id=CAST(${operationB4Id} AS uuid)
    ORDER BY r.id ASC LIMIT 2 FOR KEY SHARE OF r
  `)
  if (rows.length !== 1 || !rows[0]?.receiptId || !rows[0].movementId) return null
  const remesaId = normalInteger(rows[0].remesaId)
  return remesaId === null ? null : { receiptId: rows[0].receiptId, remesaId, movementId: rows[0].movementId }
}

async function advisoryRemesa(tx: Tx, remesaId: number): Promise<void> {
  // El guard de Prisma revisa esta forma exacta. No se convierte el void a
  // bigint (inválido); text es la representación de salida ya usada por B6.
  const key = `B6:remesa:${remesaId}`
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${key} AS text),0))::text AS locked`)
}

async function remesaScope(tx: Tx, descriptor: ReceiptDescriptor): Promise<Scope | null> {
  await advisoryRemesa(tx, descriptor.remesaId)
  const remesa = await tx.$queryRaw<Array<{ id: number | bigint | string }>>(Prisma.sql`
    SELECT id FROM remesas WHERE id=${descriptor.remesaId} LIMIT 2 FOR UPDATE
  `)
  if (remesa.length !== 1) return null
  const receiptLines = await tx.$queryRaw<Array<{ invoiceId: string; facturaISPId: number | bigint | string }>>(Prisma.sql`
    SELECT l.factura_emitida_id AS "invoiceId",l.factura_isp_id AS "facturaISPId"
    FROM lineas_recibo_cobro_remesa_b7 l
    WHERE l.recibo_id=CAST(${descriptor.receiptId} AS uuid)
    ORDER BY l.ordinal ASC LIMIT ${MAX_RECEIPT_LINES + 1} FOR KEY SHARE OF l
  `)
  if (!receiptLines.length || receiptLines.length > MAX_RECEIPT_LINES
    || receiptLines.some(line => !line.invoiceId || normalInteger(line.facturaISPId) === null)
    || new Set(receiptLines.map(line => line.invoiceId)).size !== receiptLines.length
    || new Set(receiptLines.map(line => String(line.facturaISPId))).size !== receiptLines.length) return null
  const members = await tx.$queryRaw<Array<{ invoiceId: string; facturaISPId: number | bigint | string }>>(Prisma.sql`
    SELECT fi.id AS "invoiceId",f.id AS "facturaISPId"
    FROM facturas f JOIN facturas_emitidas fi ON fi.factura_isp_id=f.id
    WHERE f.remesa_id=${descriptor.remesaId}
    ORDER BY fi.id ASC LIMIT ${MAX_DELTA_ROWS + 1} FOR UPDATE OF f,fi
  `)
  const invoiceIds = uniqueSorted(members.map(member => member.invoiceId))
  if (!invoiceIds.length || members.length > MAX_DELTA_ROWS || invoiceIds.length !== members.length
    || members.some(member => normalInteger(member.facturaISPId) === null)
    || !receiptLines.every(line => invoiceIds.includes(line.invoiceId))) return null
  return { kind: 'B7_REMESA', invoiceIds }
}

async function confirmingScope(tx: Tx, input: ConciliarProjectionDeltaInput): Promise<Scope | null> {
  if (input.sourceKind !== 'COBRO_CONFIRMING') return null
  // The original B4 DOCUMENTO links are durable evidence. On undo they are
  // inactive history, but still identify the original exact FI set without C9 UI
  // data, leg.result, cached candidates or parsing a confirming document.
  const documents = await tx.$queryRaw<Array<{ movementId: string; invoiceId: string }>>(Prisma.sql`
    SELECT v.movimiento_id AS "movementId",d.factura_emitida_id AS "invoiceId"
    FROM operaciones_justificacion_b4 o
    JOIN vinculos_movimiento_documento v ON v.operacion_creacion_id=o.id
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    WHERE o.id=CAST(${input.originalOperationB4Id} AS uuid)
      AND o.movimiento_id=${input.movimientoId}
      AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
      AND d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable"
      AND d.factura_emitida_id IS NOT NULL
    ORDER BY d.factura_emitida_id ASC,v.id ASC LIMIT ${MAX_RECEIPT_LINES + 1}
    FOR KEY SHARE OF o,v,d
  `)
  const directIds = uniqueSorted(documents.map(row => row.invoiceId))
  if (!directIds.length || documents.length > MAX_RECEIPT_LINES || directIds.length !== documents.length
    || documents.some(row => row.movementId !== input.movimientoId)) return null
  // Lock FI rows first. A LEFT JOIN target is nullable and PostgreSQL rejects
  // FOR UPDATE OF f there; Factura source rows are locked in a separate inner
  // query below, so missing legacy FI->Factura remains a safe no-remesa case.
  const directSources = await tx.$queryRaw<Array<{ invoiceId: string; facturaISPId: number | bigint | string | null }>>(Prisma.sql`
    SELECT fi.id AS "invoiceId",fi.factura_isp_id AS "facturaISPId"
    FROM facturas_emitidas fi
    WHERE fi.id IN (${Prisma.join(directIds.map(id => Prisma.sql`${id}`))})
    ORDER BY fi.id ASC LIMIT ${directIds.length + 1} FOR UPDATE OF fi
  `)
  if (directSources.length !== directIds.length || new Set(directSources.map(row => row.invoiceId)).size !== directIds.length) return null
  if (directSources.some(row => row.facturaISPId !== null && normalInteger(row.facturaISPId) === null)) return null
  const facturaISPIds = [...new Set(directSources.flatMap(row => {
    const id = normalInteger(row.facturaISPId)
    return id === null ? [] : [id]
  }))].sort((left, right) => left - right)
  const facturaSources = facturaISPIds.length ? await tx.$queryRaw<Array<{ id: number | bigint | string; remesaId: number | bigint | string | null }>>(Prisma.sql`
    SELECT f.id,f.remesa_id AS "remesaId"
    FROM facturas f
    WHERE f.id IN (${Prisma.join(facturaISPIds.map(id => Prisma.sql`${id}`))})
    ORDER BY f.id ASC LIMIT ${facturaISPIds.length + 1} FOR KEY SHARE OF f
  `) : []
  if (facturaSources.length !== facturaISPIds.length) return null
  const remesaIds = [...new Set(facturaSources.flatMap(row => {
    const id = normalInteger(row.remesaId)
    return id === null ? [] : [id]
  }))].sort((a, b) => a - b)
  for (const remesaId of remesaIds) await advisoryRemesa(tx, remesaId)
  if (remesaIds.length) {
    const remesas = await tx.$queryRaw<Array<{ id: number | bigint | string }>>(Prisma.sql`
      SELECT id FROM remesas WHERE id IN (${Prisma.join(remesaIds.map(id => Prisma.sql`${id}`))})
      ORDER BY id ASC LIMIT ${remesaIds.length + 1} FOR UPDATE
    `)
    if (remesas.length !== remesaIds.length) return null
  }
  const members = remesaIds.length ? await tx.$queryRaw<Array<{ invoiceId: string }>>(Prisma.sql`
    SELECT fi.id AS "invoiceId"
    FROM facturas f JOIN facturas_emitidas fi ON fi.factura_isp_id=f.id
    WHERE f.remesa_id IN (${Prisma.join(remesaIds.map(id => Prisma.sql`${id}`))})
    ORDER BY fi.id ASC LIMIT ${MAX_DELTA_ROWS + 1} FOR UPDATE OF f,fi
  `) : []
  const invoiceIds = uniqueSorted([...directIds, ...members.map(row => row.invoiceId)])
  if (members.length > MAX_DELTA_ROWS || invoiceIds.length > MAX_DELTA_ROWS
    || !directIds.every(id => invoiceIds.includes(id))) return null
  return { kind: 'CONFIRMING_B4', invoiceIds }
}

async function findScope(tx: Tx, input: ConciliarProjectionDeltaInput): Promise<Scope | null> {
  const receipt = await b7ReceiptByOriginalOperation(tx, input.originalOperationB4Id)
  if (receipt) {
    if (input.sourceKind !== 'COBRO_PROPUESTA' || receipt.movementId !== input.movimientoId) return null
    return remesaScope(tx, receipt)
  }
  return confirmingScope(tx, input)
}

/** Returns every current-generation proposal for any movement whose current
 * proposal set touches the frontier. We retain all siblings because rebuild's
 * proposalByMovement picks the first one before rendering. */
async function proposalsTouchingInvoices(tx: Tx, invoiceIds: readonly string[]): Promise<ProposalRow[] | null> {
  if (!invoiceIds.length) return []
  const rows = await tx.$queryRaw<ProposalRow[]>(Prisma.sql`
    WITH current_generation AS (SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1)
    SELECT p.id::text AS "propuestaId",p.movimiento_id AS "movimientoId",p.movimiento_par_id AS "movimientoParId",p.fingerprint,p.metodo,p.nivel,
      p.estado_propuesto AS "estadoPropuesto",p.composicion,p.explicacion,p.lineas,p.importe_movimiento_centimos AS "importeCentimos",p.motivo_no_requiere AS "motivoNoRequiere",
      m.fecha_operacion::date::text AS fecha,m.concepto,m.referencia,m.info_adicional AS "info_adicional",m.tercero,
      b4_importe_bancario_centimos(m.importe) AS "importeCentimosMovimiento",c.id AS "cuentaId",c.banco,c.alias AS cuenta,COALESCE(e.version,1) AS "versionB4"
    FROM modo_facil_propuestas_cobro p
    JOIN current_generation g ON g.id=p.generacion_id
    JOIN movimientos_bancarios m ON m.id=p.movimiento_id
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE p.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE')
      AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND EXISTS (
        SELECT 1
        FROM modo_facil_propuestas_cobro touched
        WHERE touched.generacion_id=p.generacion_id
          AND touched.movimiento_id=p.movimiento_id
          AND touched.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE')
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(touched.composicion)='array' THEN touched.composicion ELSE COALESCE(touched.composicion->'items','[]'::jsonb) END) entry
            WHERE entry->>'facturaEmitidaId' IN (${Prisma.join(invoiceIds.map(id => Prisma.sql`${id}`))})
          )
      )
    ORDER BY p.movimiento_id ASC,p.id ASC LIMIT ${MAX_DELTA_ROWS + 1} FOR KEY SHARE OF p,m,c
  `)
  return rows.length > MAX_DELTA_ROWS ? null : rows
}

function canonicalProposalRows(rows: readonly ProposalRow[]): ProposalRow[] | null {
  const byMovement = new Map<string, ProposalRow>()
  for (const row of rows) {
    const movementId = typeof row.movimientoId === 'string' ? row.movimientoId : ''
    const proposalId = typeof row.propuestaId === 'string' ? row.propuestaId : ''
    if (!movementId || !proposalId) return null
    if (!byMovement.has(movementId)) byMovement.set(movementId, row)
  }
  // rebuildConciliarProjectionTx walks unresolved movements by fecha DESC,id ASC
  // and preserves the first same-color FI candidate. Keep that order here too:
  // sorting only by movement id changes otherwise-valid ties after an undo.
  return [...byMovement.values()].sort((left, right) => {
    const leftDate = typeof left.fecha === 'string' ? left.fecha : ''
    const rightDate = typeof right.fecha === 'string' ? right.fecha : ''
    return rightDate.localeCompare(leftDate) || String(left.movimientoId).localeCompare(String(right.movimientoId))
  })
}

async function closedProposalScope(tx: Tx, initialInvoiceIds: readonly string[]): Promise<ClosedProposalScope | null> {
  const initial = uniqueSorted(initialInvoiceIds)
  if (!initial.length || initial.length > MAX_DELTA_ROWS) return null
  const invoices = new Set(initial)
  const proposalsByMovement = new Map<string, ProposalRow>()
  const seenProposalIds = new Set<string>()
  let frontier = initial
  while (frontier.length) {
    const raw = await proposalsTouchingInvoices(tx, frontier)
    if (!raw) return null
    for (const row of raw) {
      const proposalId = typeof row.propuestaId === 'string' ? row.propuestaId : ''
      if (!proposalId) return null
      seenProposalIds.add(proposalId)
      if (seenProposalIds.size > MAX_DELTA_ROWS) return null
    }
    const canonical = canonicalProposalRows(raw)
    if (!canonical) return null
    const next = new Set<string>()
    for (const proposal of canonical) {
      const movementId = String(proposal.movimientoId)
      if (proposalsByMovement.has(movementId)) continue
      proposalsByMovement.set(movementId, proposal)
      if (proposalsByMovement.size > MAX_DELTA_ROWS) return null
      for (const invoiceId of proposalIds(proposal)) {
        if (invoices.has(invoiceId)) continue
        invoices.add(invoiceId)
        if (invoices.size > MAX_DELTA_ROWS) return null
        next.add(invoiceId)
      }
    }
    frontier = [...next].sort()
  }
  const proposals = [...proposalsByMovement.values()].sort((left, right) => {
    const leftDate = typeof left.fecha === 'string' ? left.fecha : ''
    const rightDate = typeof right.fecha === 'string' ? right.fecha : ''
    return rightDate.localeCompare(leftDate) || String(left.movimientoId).localeCompare(String(right.movimientoId))
  })
  const closed = closeDeltaProposalDependencies(initial, proposals.map(proposal => ({ movimientoId: String(proposal.movimientoId), invoiceIds: proposalIds(proposal) })))
  if (!closed || !sameSorted(closed.invoiceIds, [...invoices].sort()) || !sameSorted(closed.movimientoIds, proposals.map(row => String(row.movimientoId)).sort())) return null
  return { invoiceIds: closed.invoiceIds, proposals }
}

function projectionMovement(proposal: ProposalRow): Record<string, unknown> | null {
  const cents = safeInteger(proposal.importeCentimosMovimiento)
  const version = safeInteger(proposal.versionB4)
  if (!proposal.movimientoId || cents === null || version === null || !proposal.cuentaId || typeof proposal.fecha !== 'string') return null
  return {
    id: String(proposal.movimientoId), importeCentimos: cents, versionB4: version, cuentaId: String(proposal.cuentaId), fecha: proposal.fecha,
    concepto: proposal.concepto, referencia: proposal.referencia, info_adicional: proposal.info_adicional, tercero: proposal.tercero, banco: proposal.banco, cuenta: proposal.cuenta,
  }
}

function canonicalInvoiceDates(bank: Awaited<ReturnType<typeof readBankInvoicingPopulation>>): ConciliarInvoiceDateIndex {
  // Exactly the index constructed by rebuildConciliarProjectionTx: no direct
  // facturas_emitidas reread can silently disagree with B7's canonical source.
  return new Map(bank.invoices.map(item => [item.invoiceId, item.fechaISO]))
}

async function confirmingCandidatesForMovements(tx: Tx, movementIds: readonly string[]): Promise<Map<string, any> | null> {
  const ids = uniqueSorted(movementIds)
  if (ids.length > MAX_CONFIRMING_MOVEMENTS) return null
  const candidates = new Map<string, any>()
  for (let start = 0; start < ids.length; start += CONFIRMING_MOVEMENT_BATCH) {
    const read = await readConciliarConfirmingCandidates(tx, { movimientoIds: ids.slice(start, start + CONFIRMING_MOVEMENT_BATCH) })
    // The explicit list is bounded to at most 100 IDs, so it cannot itself be
    // truncated. C11 can still flag its broad uniqueness universe as truncated;
    // in that case it returns the requested candidate already downgraded to the
    // same deterministic review row that the full rebuild renders. It is safe to
    // repaint that exact row, but never to infer an unrequested movement.
    for (const candidate of read.candidates) {
      if (!ids.includes(candidate.movimientoId) || candidates.has(candidate.movimientoId)) return null
      candidates.set(candidate.movimientoId, candidate)
    }
  }
  return candidates
}

async function rebuildClosedCobros(
  tx: Tx,
  input: ConciliarProjectionDeltaInput,
  proposals: readonly ProposalRow[],
  invoiceDates: ConciliarInvoiceDateIndex,
  issuedReferences: readonly unknown[],
): Promise<Readonly<{ rows: readonly RebuildRow[]; candidates: ReadonlyMap<string, Candidate> }> | null> {
  const proposalMovementIds = proposals.map(proposal => String(proposal.movimientoId))
  const movementIds = uniqueSorted([...proposalMovementIds, ...(input.action === 'DESHACER' ? [input.movimientoId] : [])])
  const transfers = await readStrictOwnTransfers(tx)
  // The canonical transfer constructor needs broader balance evidence. A proposal
  // movement whose precedence is transfer is therefore not safe to repaint here.
  if (movementIds.some(id => transfers.has(id))) return null
  const confirming = await confirmingCandidatesForMovements(tx, movementIds)
  if (!confirming) return null
  const clientIdentityProfiles = await readCollectionClientIdentityProfiles(tx, proposals.map(proposal => String(proposal.propuestaId)))
  const clientIdentityByProposal = clientIdentityProfiles ?? new Map()
  const rowsByMovement = new Map<string, RebuildRow>()
  const candidates = new Map<string, Candidate>()
  for (const proposal of proposals) {
    const movement = projectionMovement(proposal)
    if (!movement) return null
    const movementId = String(movement.id)
    let row: RebuildRow
    try {
      const confirmingCandidate = confirming.get(movementId)
      row = confirmingCandidate
        ? await confirmingProjectionForMovement(tx, movement, confirmingCandidate)
        : collectionProjectionForMovement(movement, proposal, invoiceDates, issuedReferences, clientIdentityByProposal.get(String(proposal.propuestaId)))
    } catch {
      return null
    }
    rowsByMovement.set(movementId, row)
    // Rebuild only makes FI candidates while the live movement renders through
    // COBRO_PROPUESTA; confirming and transfer precedence deliberately suppress it.
    if (row.source.kind !== 'COBRO_PROPUESTA') continue
    for (const invoiceId of proposalIds(proposal)) {
      const previous = candidates.get(invoiceId)
      const next: Candidate = { movementId, color: row.row.color, rowId: row.row.id, propuestaId: String(proposal.propuestaId) }
      if (!previous || conciliarColorRank(next.color) < conciliarColorRank(previous.color)) candidates.set(invoiceId, next)
    }
  }
  if (input.action === 'DESHACER' && !rowsByMovement.has(input.movimientoId)) {
    const [movement] = await unresolvedMovements(tx, input.movimientoId)
    if (!movement) return null
    try {
      const confirmingCandidate = confirming.get(input.movimientoId)
      rowsByMovement.set(input.movimientoId, confirmingCandidate
        ? await confirmingProjectionForMovement(tx, movement, confirmingCandidate)
        : collectionProjectionForMovement(movement, undefined, invoiceDates, issuedReferences))
    } catch {
      return null
    }
  }
  return { rows: [...rowsByMovement.values()], candidates }
}

/**
 * Recalculates the B7 canonical population, closes proposal/FI dependencies, and
 * replaces only deterministic EMITIDAS/COBROS rows in that closed subgraph.
 * Returning false never clears dirty nor writes a projection row.
 */
export async function applyConciliarProjectionDeltaTx(base: Prisma.TransactionClient, input: ConciliarProjectionDeltaInput): Promise<ConciliarProjectionDeltaResult> {
  const tx = base as Tx
  if (!canAttemptConciliarProjectionDelta(input)) return { projectionSynchronized: false }
  let scope: Scope | null
  let closed: ClosedProposalScope | null
  let bank: Awaited<ReturnType<typeof readBankInvoicingPopulation>>
  let cobros: Readonly<{ rows: readonly RebuildRow[]; candidates: ReadonlyMap<string, Candidate> }> | null
  try {
    scope = await findScope(tx, input)
    if (!scope || !scope.invoiceIds.length || scope.invoiceIds.length > MAX_DELTA_ROWS) return { projectionSynchronized: false }
    closed = await closedProposalScope(tx, scope.invoiceIds)
    if (!closed) return { projectionSynchronized: false }

    // Full canonical source read, bounded in bank-invoicing-db at 25k per source.
    // It is intentionally reused instead of an independent amount-delta formula.
    bank = await readBankInvoicingPopulation(tx as unknown as B7ReadDatabase, {
      enabled: true, assertIsolatedStaging: async () => undefined,
    })
    cobros = await rebuildClosedCobros(tx, input, closed.proposals, canonicalInvoiceDates(bank), bank.invoices.map(item => item.numFactura))
    if (!cobros) return { projectionSynchronized: false }
  } catch (error) {
    // This block is intentionally only pre-DML. A source ambiguity preserves the
    // dirty trigger and falls back; post-DML errors below must abort SERIALIZABLE.
    if (error instanceof DeltaIneligibleError) return { projectionSynchronized: false }
    throw error
  }

  const affectedInvoices = new Set(closed!.invoiceIds)
  const settlements = bank!.invoices.filter(invoice => affectedInvoices.has(invoice.invoiceId))
  // reasons are canonical B7 diagnostics. A review row with ordinary reasons is
  // still exactly renderable by emittedProjection; do not turn it into a false
  // fallback merely because it is not a COBRADA_CALCULADA settlement.
  const emitted = settlements.flatMap(settlement => {
    const row = emittedProjection(settlement, cobros!.candidates.get(settlement.invoiceId))
    return row ? [row] : []
  })
  const dirty = await tx.$queryRaw<Array<{ dirty: boolean }>>(Prisma.sql`
    SELECT dirty_at IS NOT NULL AS dirty FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1 FOR UPDATE
  `)
  if (dirty.length !== 1 || dirty[0]?.dirty !== true) return { projectionSynchronized: false }

  const emittedRowIds = closed!.invoiceIds.map(invoiceId => conciliarProjectionRowId('EMITIDAS', `PENDIENTE_FACTURA_EMITIDA:${invoiceId}`))
  const cobroMovementIds = uniqueSorted([
    ...closed!.proposals.map(proposal => String(proposal.movimientoId)),
    input.movimientoId,
  ])
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM conciliar_proyecciones WHERE tab='EMITIDAS' AND id IN (${Prisma.join(emittedRowIds.map(id => Prisma.sql`${id}`))})
  `)
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM conciliar_proyecciones WHERE tab='COBROS' AND movimiento_id IN (${Prisma.join(cobroMovementIds.map(id => Prisma.sql`${id}`))})
  `)
  await insertProjectionBatches(tx, [...emitted, ...cobros!.rows])
  const state = await tx.$queryRaw<Array<{ projectionVersion: bigint | number }>>(Prisma.sql`
    UPDATE estado_proyeccion_conciliar
    SET dirty_at=NULL,dirty_reason=NULL,rebuilt_at=CURRENT_TIMESTAMP,projection_version=projection_version+1
    WHERE singleton=true AND dirty_at IS NOT NULL
    RETURNING projection_version AS "projectionVersion"
  `)
  if (state.length !== 1) throw new Error('CONCILIAR_DELTA_STATE_CHANGED')
  return { projectionSynchronized: true, kind: scope!.kind, invoiceIds: closed!.invoiceIds }
}
