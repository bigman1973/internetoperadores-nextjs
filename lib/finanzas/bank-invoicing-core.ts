/**
 * B7 — cálculo puro de facturación emitida desde evidencia bancaria B4/B6.
 *
 * No importa Prisma, no consulta entorno, red ni base de datos. Todos los importes
 * son céntimos firmados. Las conversiones de fuente son deliberadamente estrictas:
 * nunca se redondea ni se sustituye un importe desconocido por cero.
 */

export const B7_MAX_B4_CENTS = 2_147_483_647
export const B7_MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER

export type PaymentState = 'COBRADA_CALCULADA' | 'PENDIENTE_COBRO' | 'PENDIENTE_COBRO_REVISION'
export type PaymentSource = 'B4_DIRECTO' | 'B4_REMESA'
export type B4DocumentKind = 'FACTURA_EMITIDA' | 'REMESA'

export interface CanonicalInvoiceInput {
  /** FacturaEmitida.id: única población canónica de B7. */
  id: string
  /** Texto exacto de facturas_emitidas.total::text; jamás un importe UI. */
  sourceTotalText: string | null
  /** B2/económica ya acreditada por el lector; false bloquea toda imputación. */
  b2Economic: boolean
  numFactura: string | null
  cliente: string | null
  fechaISO: string | null
  fechaVencimientoISO: string | null
  /** Único puente permitido a Factura: FK explícita, nunca heurística. */
  facturaISPId: number | null
}

/** Evidencia de una línea B4, incluida la revalidación actual del movimiento físico. */
export interface B4DocumentLineInput {
  lineId: string
  movementId: string
  invoiceId?: string
  remittanceId?: string
  signedCents: number | null
  active: boolean
  documentActive: boolean
  documentKind: B4DocumentKind
  wrapperTargetCents: number | null
  operationApplied: boolean
  operationReverted: boolean
  movementJustified: boolean
  physicalBankCents: number | null
  sumAllActiveCents: number | null
  activeDocumentLineCount: number | null
  /** Every active line in the physical B4 closure is APLICADA and unreverted. */
  allActiveLinesApplied: boolean
}

/** Diferencia B4; la caja sólo se atribuye cuando el movimiento tiene un único DOCUMENTO FI. */
export interface B4DifferenceLineInput {
  movementId: string
  signedCents: number | null
  active: boolean
  operationApplied: boolean
  operationReverted: boolean
  movementJustified: boolean
  physicalBankCents: number | null
  sumAllActiveCents: number | null
  /** Every active line in the physical B4 closure is APLICADA and unreverted. */
  allActiveLinesApplied: boolean
}

export interface RemittanceMemberInput {
  facturaISPId: number
  /** null significa FI mirror ausente: no se adivina ni se ignora. */
  invoiceId: string | null
  facturaISPSourceTotalText: string | null
  facturaEmitidaSourceTotalText: string | null
}

/** Una asignación B6 de devolución, que debe volver a demostrar prueba B4 vigente. */
export interface RemittanceRefundInput {
  linkId: string | null
  facturaISPId: number | null
  signedCents: number | null
  confirmed: boolean
  confirmedByHuman: boolean
  active: boolean
  documentActive: boolean
  documentKind: B4DocumentKind | null
  operationApplied: boolean
  operationReverted: boolean
  movementJustified: boolean
  physicalBankCents: number | null
  sumAllActiveCents: number | null
  activeDocumentLineCount: number | null
  /** Every active line in the physical B4 closure is APLICADA and unreverted. */
  allActiveLinesApplied: boolean
}

/** Relación B6 real: Factura.remesa_id más auditoría humana de asociación confirmada. */
export interface ExplicitRemittanceInput {
  remittanceId: string
  sourceTotalText: string | null
  wrapperTargetCents: number | null
  wrapperActive: boolean
  /** Current wrappers for this source remittance; anything other than one blocks B7. */
  wrapperCount: number | null
  humanConfirmedAssociation: boolean
  /** No current B6 human audit proves the exact dated source snapshot. */
  humanAssociationStale: boolean
  members: RemittanceMemberInput[]
  bankDocumentLines: B4DocumentLineInput[]
  refunds: RemittanceRefundInput[]
}

export interface BankCoverage {
  status: 'KNOWN' | 'PARTIAL' | 'UNKNOWN'
  asOf: string | null
  activeAccountCount: number
  accountsWithKnownCutoff: number
}

export interface InvoiceSettlement {
  invoiceId: string
  numFactura: string | null
  cliente: string | null
  fechaISO: string | null
  fechaVencimientoISO: string | null
  facturaISPId: number | null
  /** total de FacturaEmitida, firmado y exacto; null si la fuente no es conciliable. */
  targetCents: number | null
  /** Sólo DOCUMENTO B4 confirmado; null cuando una revisión impide atribuirlo. */
  paidDocumentaryCents: number | null
  remainingCents: number | null
  /** Caja sólo para FI directa con un DOCUMENTO por movimiento; remesa siempre null. */
  cashCents: number | null
  attributableCashDifferenceCents: number | null
  paymentSources: PaymentSource[]
  paymentState: PaymentState
  reasons: string[]
}

export interface B7MoneyAggregate {
  /** Total completo sólo si no hay componentes desconocidos/revisión. */
  cents: number | null
  /** Parte conocida, útil para diagnóstico; null si incluso esa suma desborda. */
  knownCents: number | null
  unknownInvoiceCount: number
}

export interface BankInvoicingSummary {
  /** KPI 1 — Facturado (FacturaEmitida canónica, firmado). */
  facturado: B7MoneyAggregate
  /** KPI 2 — Cobro documental B4/B6 confirmado. */
  cobroDocumentalConfirmado: B7MoneyAggregate
  /** KPI 3 — Pendiente que no está confirmado por banco. */
  pendienteNoConfirmado: B7MoneyAggregate
  /** KPI 4 — Diferencias de caja B4: atribuibles y sin atribuir, sin afectar deuda. */
  diferenciasCaja: {
    atribuible: B7MoneyAggregate
    sinAtribuir: B7MoneyAggregate
  }
  invoicesTotal: number
  cobradasCalculadas: number
  pendientesCobro: number
  revisiones: number
}

export interface BankInvoicingResult {
  invoices: InvoiceSettlement[]
  summary: BankInvoicingSummary
  bankCoverage: BankCoverage
  calculationBasis: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA'
}

export interface BankInvoicingInput {
  invoices: CanonicalInvoiceInput[]
  directDocumentLines?: B4DocumentLineInput[]
  differenceLines?: B4DifferenceLineInput[]
  explicitRemittances?: ExplicitRemittanceInput[]
  bankCoverage?: Partial<BankCoverage>
}

const EXACT_MONEY = /^([+-]?)(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/

/** `Float::text`/`numeric::text` to cents, exact and signed. No Math.round or abs. */
export function exactSourceCents(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && (!Number.isFinite(value) || !Number.isSafeInteger(value * 100))) return null
  const match = EXACT_MONEY.exec(String(value))
  if (!match) return null
  const integer = BigInt(match[2])
  const decimal = BigInt((match[3] ?? '').padEnd(2, '0') || '0')
  const signed = (integer * BigInt(100) + decimal) * (match[1] === '-' ? BigInt(-1) : BigInt(1))
  return bigIntToSafeNumber(signed)
}

function bigIntToSafeNumber(value: bigint): number | null {
  const max = BigInt(Number.MAX_SAFE_INTEGER)
  if (value > max || value < -max) return null
  return Number(value)
}

function isB4Cents(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && value >= -B7_MAX_B4_CENTS && value <= B7_MAX_B4_CENTS
}

function isSafeCents(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && value >= -B7_MAX_SAFE_CENTS && value <= B7_MAX_SAFE_CENTS
}

function sumSafe(values: Iterable<number>): number | null {
  let total = BigInt(0)
  for (const value of values) {
    if (!isSafeCents(value)) return null
    total += BigInt(value)
  }
  return bigIntToSafeNumber(total)
}

function addBig(map: Map<string, bigint>, key: string, cents: number) {
  map.set(key, (map.get(key) ?? BigInt(0)) + BigInt(cents))
}

function mapBigToSafe(map: Map<string, bigint>, key: string): number | null {
  return bigIntToSafeNumber(map.get(key) ?? BigInt(0))
}

function isDateISO(value: string | null): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
}

function normalCoverage(input?: Partial<BankCoverage>): BankCoverage {
  const activeAccountCount = Number.isSafeInteger(input?.activeAccountCount) && input!.activeAccountCount! >= 0 ? input!.activeAccountCount! : 0
  const accountsWithKnownCutoff = Number.isSafeInteger(input?.accountsWithKnownCutoff) && input!.accountsWithKnownCutoff! >= 0
    ? input!.accountsWithKnownCutoff!
    : 0
  if (input?.status === 'KNOWN' && activeAccountCount > 0 && accountsWithKnownCutoff === activeAccountCount && typeof input.asOf === 'string') {
    return { status: 'KNOWN', asOf: input.asOf, activeAccountCount, accountsWithKnownCutoff }
  }
  if (accountsWithKnownCutoff > 0 && accountsWithKnownCutoff < activeAccountCount) {
    return { status: 'PARTIAL', asOf: null, activeAccountCount, accountsWithKnownCutoff }
  }
  return { status: 'UNKNOWN', asOf: null, activeAccountCount, accountsWithKnownCutoff }
}

function isCurrentB4Document(line: B4DocumentLineInput, kind: B4DocumentKind): boolean {
  return line.active
    && line.documentActive
    && line.documentKind === kind
    && line.operationApplied
    && !line.operationReverted
    && line.movementJustified
    && isB4Cents(line.signedCents)
    && line.signedCents !== 0
    && isB4Cents(line.wrapperTargetCents)
    && line.wrapperTargetCents !== 0
    && isB4Cents(line.physicalBankCents)
    && isSafeCents(line.sumAllActiveCents)
    && line.sumAllActiveCents === line.physicalBankCents
    && Number.isSafeInteger(line.activeDocumentLineCount)
    && line.activeDocumentLineCount! >= 1
    && line.allActiveLinesApplied === true
}

function isCurrentB4Difference(line: B4DifferenceLineInput): boolean {
  return line.active
    && line.operationApplied
    && !line.operationReverted
    && line.movementJustified
    && isB4Cents(line.signedCents)
    && line.signedCents !== 0
    && isB4Cents(line.physicalBankCents)
    && isSafeCents(line.sumAllActiveCents)
    && line.sumAllActiveCents === line.physicalBankCents
    && line.allActiveLinesApplied === true
}

function signedRange(target: number, paid: number): boolean {
  if (target > 0) return paid >= 0 && paid <= target
  if (target < 0) return paid <= 0 && paid >= target
  return false
}

interface WorkItem {
  invoice: CanonicalInvoiceInput
  target: number | null
  directPaid: bigint
  remittancePaid: bigint | null
  directSources: Set<string>
  remittanceSources: Set<string>
  directMovementDocumentCounts: Map<string, number>
  directDifference: bigint
  reasons: Set<string>
}

function addReason(item: WorkItem | undefined, reason: string) {
  item?.reasons.add(reason)
}

function settlementSummary(invoices: InvoiceSettlement[], unallocatedDifference: number | null): BankInvoicingSummary {
  const facturado: number[] = []
  const paid: number[] = []
  const pending: number[] = []
  const attributableDifference: number[] = []
  let facturadoUnknown = 0
  let paidUnknown = 0
  let pendingUnknown = 0
  let cobradasCalculadas = 0
  let pendientesCobro = 0
  let revisiones = 0

  for (const invoice of invoices) {
    if (invoice.targetCents === null) facturadoUnknown++
    else facturado.push(invoice.targetCents)
    if (invoice.paidDocumentaryCents === null) paidUnknown++
    else paid.push(invoice.paidDocumentaryCents)
    if (invoice.remainingCents === null) pendingUnknown++
    else pending.push(invoice.remainingCents)
    // Null is the intentional per-invoice presentation for “not provable by FI”;
    // it contributes no difference. Actual unallocated/invalid B4 differences are
    // tracked separately in `sinAtribuir`, which may itself be unknown.
    if (invoice.attributableCashDifferenceCents !== null) attributableDifference.push(invoice.attributableCashDifferenceCents)
    if (invoice.paymentState === 'COBRADA_CALCULADA') cobradasCalculadas++
    else if (invoice.paymentState === 'PENDIENTE_COBRO') pendientesCobro++
    else revisiones++
  }

  const aggregate = (values: number[], unknownInvoiceCount: number): B7MoneyAggregate => {
    const knownCents = sumSafe(values)
    return {
      cents: unknownInvoiceCount === 0 ? knownCents : null,
      knownCents,
      unknownInvoiceCount: unknownInvoiceCount + (knownCents === null ? 1 : 0),
    }
  }
  const sinAtribuir = unallocatedDifference === null
    ? { cents: null, knownCents: null, unknownInvoiceCount: 1 }
    : { cents: unallocatedDifference, knownCents: unallocatedDifference, unknownInvoiceCount: 0 }

  return {
    facturado: aggregate(facturado, facturadoUnknown),
    cobroDocumentalConfirmado: aggregate(paid, paidUnknown),
    pendienteNoConfirmado: aggregate(pending, pendingUnknown),
    diferenciasCaja: { atribuible: aggregate(attributableDifference, 0), sinAtribuir },
    invoicesTotal: invoices.length,
    cobradasCalculadas,
    pendientesCobro,
    revisiones,
  }
}

/** Returns a new summary for any selected population; it never relies on a page subset. */
export function summarizeBankInvoicing(invoices: InvoiceSettlement[], unallocatedDifference: number | null = 0): BankInvoicingSummary {
  return settlementSummary(invoices, unallocatedDifference)
}

/**
 * Core B7 settlement. The only settlement evidence accepted is a current B4
 * DOCUMENTO proof. `Factura.situacion`, FI `estado`, cobro/fecha cobro, and every
 * ISP payment field are absent by design.
 */
export function calculateBankInvoicing(input: BankInvoicingInput): BankInvoicingResult {
  const coverage = normalCoverage(input.bankCoverage)
  const work = new Map<string, WorkItem>()

  for (const invoice of input.invoices) {
    if (!invoice?.id || work.has(invoice.id)) continue
    const sourceTarget = exactSourceCents(invoice.sourceTotalText)
    const reasons = new Set<string>()
    if (!invoice.b2Economic) reasons.add('FUENTE_B2_NO_ECONOMICA')
    if (sourceTarget === null) reasons.add('IMPORTE_FUENTE_INEXACTO_O_AUSENTE')
    // Cero exacto es una cantidad conocida y neutra, no un importe desconocido ni
    // una factura cobrada. B4 no admite capacidad DOCUMENTO cero.
    if (sourceTarget === 0) reasons.add('TOTAL_CERO_SIN_COBRO_EXIGIBLE')
    if (!isDateISO(invoice.fechaISO)) reasons.add('FECHA_FUENTE_DESCONOCIDA')
    work.set(invoice.id, {
      invoice,
      target: invoice.b2Economic && sourceTarget !== null ? sourceTarget : null,
      directPaid: BigInt(0),
      remittancePaid: BigInt(0),
      directSources: new Set(),
      remittanceSources: new Set(),
      directMovementDocumentCounts: new Map(),
      directDifference: BigInt(0),
      reasons,
    })
  }

  const validDirectByMovement = new Map<string, Set<string>>()
  const directDocumentCountByMovement = new Map<string, number>()
  for (const line of input.directDocumentLines ?? []) {
    if (line.active === false) continue // B4 revertida: historia, no evidencia actual.
    const item = line.invoiceId ? work.get(line.invoiceId) : undefined
    if (!item) continue
    const target = item.target
    const sourceMatchesWrapper = target !== null && isB4Cents(line.wrapperTargetCents) && line.wrapperTargetCents === target
    if (!isCurrentB4Document(line, 'FACTURA_EMITIDA') || !sourceMatchesWrapper) {
      item.reasons.add(!sourceMatchesWrapper ? 'ENVOLTORIO_FI_NO_COINCIDE_CON_FUENTE' : 'EVIDENCIA_B4_DIRECTA_NO_VIGENTE')
      continue
    }
    item.directPaid += BigInt(line.signedCents!)
    item.directSources.add(line.movementId)
    item.directMovementDocumentCounts.set(line.movementId, line.activeDocumentLineCount!)
    const ids = validDirectByMovement.get(line.movementId) ?? new Set<string>()
    ids.add(item.invoice.id)
    validDirectByMovement.set(line.movementId, ids)
    const previous = directDocumentCountByMovement.get(line.movementId)
    directDocumentCountByMovement.set(line.movementId, previous === undefined ? line.activeDocumentLineCount! : Math.max(previous, line.activeDocumentLineCount!))
  }

  let unallocatedDifference = BigInt(0)
  let unallocatedDifferenceUnknown = false
  for (const difference of input.differenceLines ?? []) {
    if (!isCurrentB4Difference(difference)) {
      if (difference.active) unallocatedDifferenceUnknown = true
      continue
    }
    const ids = validDirectByMovement.get(difference.movementId)
    const count = directDocumentCountByMovement.get(difference.movementId)
    if (ids?.size === 1 && count === 1) {
      const id = [...ids][0]
      work.get(id)!.directDifference += BigInt(difference.signedCents!)
    } else {
      unallocatedDifference += BigInt(difference.signedCents!)
    }
  }

  for (const remittance of input.explicitRemittances ?? []) {
    const activeBankLines = remittance.bankDocumentLines.filter(line => line.active !== false)
    if (activeBankLines.length === 0) continue // Sin abono actual: no se acredita cobro ni se invalida otro documento.
    const sourceGoal = exactSourceCents(remittance.sourceTotalText)
    const memberIds = new Set<string>()
    const touched = new Set<WorkItem>()
    const memberByISP = new Map<number, RemittanceMemberInput>()
    let membershipInvalid = !remittance.humanConfirmedAssociation || sourceGoal === null || sourceGoal === 0
      || !remittance.wrapperActive || remittance.wrapperCount !== 1
      || !isB4Cents(remittance.wrapperTargetCents) || remittance.wrapperTargetCents !== sourceGoal

    for (const member of remittance.members) {
      if (!Number.isSafeInteger(member.facturaISPId) || memberByISP.has(member.facturaISPId)) {
        membershipInvalid = true
        continue
      }
      memberByISP.set(member.facturaISPId, member)
      const item = member.invoiceId ? work.get(member.invoiceId) : undefined
      if (!item || member.invoiceId === null || item.invoice.facturaISPId !== member.facturaISPId) {
        membershipInvalid = true
        continue
      }
      memberIds.add(member.invoiceId)
      touched.add(item)
      const ispTarget = exactSourceCents(member.facturaISPSourceTotalText)
      const fiTarget = exactSourceCents(member.facturaEmitidaSourceTotalText)
      if (ispTarget === null || fiTarget === null || ispTarget === 0 || fiTarget === 0 || ispTarget !== fiTarget || item.target === null || item.target !== fiTarget) {
        membershipInvalid = true
      }
    }
    if (!remittance.members.length || memberIds.size !== remittance.members.length) membershipInvalid = true
    const memberTargetSum = sumSafe([...memberIds].map((id) => work.get(id)!.target!))
    if (memberTargetSum === null || sourceGoal === null || memberTargetSum !== sourceGoal) membershipInvalid = true

    const currentLines: B4DocumentLineInput[] = []
    let linesInvalid = false
    const lineIds = new Set<string>()
    for (const line of activeBankLines) {
      if (lineIds.has(line.lineId)) { linesInvalid = true; continue }
      lineIds.add(line.lineId)
      const wrapperMatches = sourceGoal !== null && isB4Cents(line.wrapperTargetCents) && line.wrapperTargetCents === sourceGoal
      if (!isCurrentB4Document(line, 'REMESA') || !wrapperMatches) {
        linesInvalid = true
        continue
      }
      currentLines.push(line)
    }
    if (!currentLines.length) linesInvalid = true

    for (const item of touched) {
      item.remittanceSources.add(remittance.remittanceId)
      if (item.directSources.size > 0) item.reasons.add('SOLAPAMIENTO_FI_DIRECTA_Y_REMESA')
    }
    const overlap = [...touched].some((item) => item.directSources.size > 0)
    if (membershipInvalid || linesInvalid || overlap) {
      const reason = overlap ? 'SOLAPAMIENTO_FI_DIRECTA_Y_REMESA'
        : membershipInvalid && remittance.humanAssociationStale ? 'REMESA_ASOCIACION_HUMANA_FUENTE_OBSOLETA'
          : membershipInvalid ? 'REMESA_FUENTE_O_MAPA_FI_INEXACTO'
          : 'REMESA_EVIDENCIA_B4_NO_VIGENTE'
      for (const item of touched) item.reasons.add(reason)
      continue
    }

    const net = sumSafe(currentLines.map((line) => line.signedCents!))
    const grossPositive = sumSafe(currentLines.filter((line) => line.signedCents! > 0).map((line) => line.signedCents!))
    if (net === null || grossPositive === null || sourceGoal === null) {
      for (const item of touched) item.reasons.add('REMESA_SUMA_NO_SEGURA')
      continue
    }

    // Net exact equals source objective: full collection, including a later re-credit
    // after a refund. We never add a refund twice in this branch.
    if (net === sourceGoal) {
      for (const id of memberIds) work.get(id)!.remittancePaid = BigInt(work.get(id)!.target!)
      continue
    }

    // The only partial path: original gross credit is exactly the remittance goal,
    // and every current negative REMESA DOCUMENTO has one current human-confirmed B6
    // assignment to one explicitly mapped invoice.
    const positives = currentLines.filter((line) => line.signedCents! > 0)
    const negatives = currentLines.filter((line) => line.signedCents! < 0)
    const negativeById = new Map(negatives.map((line) => [line.lineId, line]))
    const refundsByInvoice = new Map<string, bigint>()
    const refundLinks = new Set<string>()
    // A split/repeated gross round is not an individual-payment proof. The full
    // net branch above remains valid; only the refund exception requires one
    // identifiable original collection plus exact B6 allocation of every return.
    let refundsInvalid = sourceGoal <= 0 || grossPositive !== sourceGoal || positives.length !== 1 || negatives.length === 0
    let refundTotal = BigInt(0)

    for (const refund of remittance.refunds) {
      if (!refund.linkId || refundLinks.has(refund.linkId)) { refundsInvalid = true; continue }
      const line = negativeById.get(refund.linkId)
      if (!line) { continue } // historical/stale B6 fact: it is not current refund capacity.
      refundLinks.add(refund.linkId)
      const member = refund.facturaISPId === null ? undefined : memberByISP.get(refund.facturaISPId)
      const item = member?.invoiceId ? work.get(member.invoiceId) : undefined
      const currentProof = refund.confirmed
        && refund.confirmedByHuman
        && refund.active
        && refund.documentActive
        && refund.documentKind === 'REMESA'
        && refund.operationApplied
        && !refund.operationReverted
        && refund.movementJustified
        && isB4Cents(refund.signedCents)
        && refund.signedCents! < 0
        && isB4Cents(refund.physicalBankCents)
        && isSafeCents(refund.sumAllActiveCents)
        && refund.sumAllActiveCents === refund.physicalBankCents
        && refund.activeDocumentLineCount === 1
        && refund.allActiveLinesApplied === true
        && refund.signedCents === line.signedCents
      if (!currentProof || !item || item.invoice.facturaISPId !== refund.facturaISPId) {
        refundsInvalid = true
        continue
      }
      refundTotal += BigInt(refund.signedCents!)
      addBig(refundsByInvoice, item.invoice.id, refund.signedCents!)
    }
    if (refundLinks.size !== negativeById.size) refundsInvalid = true
    const expectedRefund = BigInt(grossPositive) - BigInt(net)
    if (refundTotal !== -expectedRefund) refundsInvalid = true

    if (refundsInvalid) {
      for (const item of touched) item.reasons.add('REMESA_DEVOLUCION_SIN_ATRIBUCION_B6_EXACTA')
      continue
    }
    for (const id of memberIds) {
      const item = work.get(id)!
      const paid = BigInt(item.target!) + (refundsByInvoice.get(id) ?? BigInt(0))
      const safePaid = bigIntToSafeNumber(paid)
      if (safePaid === null || !signedRange(item.target!, safePaid)) {
        for (const affected of touched) affected.reasons.add('REMESA_DEVOLUCION_FUERA_DE_RANGO')
        break
      }
      item.remittancePaid = paid
    }
  }

  const settlements: InvoiceSettlement[] = []
  for (const item of work.values()) {
    const target = item.target
    const hasDirect = item.directSources.size > 0
    const hasRemittance = item.remittanceSources.size > 0
    const directPaid = bigIntToSafeNumber(item.directPaid)
    const remittancePaid = item.remittancePaid === null ? null : bigIntToSafeNumber(item.remittancePaid)
    if (target === null || directPaid === null || remittancePaid === null) item.reasons.add('SUMA_NO_SEGURA_O_FUENTE_INEXACTA')

    let paid: number | null = target === null || directPaid === null || remittancePaid === null ? null : bigIntToSafeNumber(BigInt(directPaid) + BigInt(remittancePaid))
    if (paid !== null && !signedRange(target!, paid)) item.reasons.add('COBRO_DOCUMENTAL_FUERA_DE_RANGO_FIRMADO')
    const zeroKnown = target === 0 && item.reasons.has('TOTAL_CERO_SIN_COBRO_EXIGIBLE')
    const review = item.reasons.size > 0
    // A zero source has a verified neutral debt but no payment evidence. It must
    // neither become unknown nor appear as a calculated collection.
    if (zeroKnown) paid = 0
    const remaining = zeroKnown ? 0 : !review && paid !== null && target !== null ? target - paid : null
    const settled = !review && remaining === 0
    const allDirectSingleDocument = hasDirect && [...item.directMovementDocumentCounts.values()].every((count) => count === 1)
    const directDifference = bigIntToSafeNumber(item.directDifference)
    const cash = !review && hasDirect && !hasRemittance && allDirectSingleDocument && paid !== null && directDifference !== null
      ? bigIntToSafeNumber(BigInt(paid) + BigInt(directDifference))
      : null

    settlements.push({
      invoiceId: item.invoice.id,
      numFactura: item.invoice.numFactura ?? null,
      cliente: item.invoice.cliente ?? null,
      fechaISO: item.invoice.fechaISO ?? null,
      fechaVencimientoISO: item.invoice.fechaVencimientoISO ?? null,
      facturaISPId: item.invoice.facturaISPId ?? null,
      targetCents: target,
      paidDocumentaryCents: zeroKnown ? 0 : review ? null : paid,
      remainingCents: remaining,
      cashCents: cash,
      attributableCashDifferenceCents: !review && hasDirect && !hasRemittance && allDirectSingleDocument ? directDifference : null,
      paymentSources: ([...(hasDirect ? ['B4_DIRECTO' as const] : []), ...(hasRemittance ? ['B4_REMESA' as const] : [])]).sort(),
      paymentState: review ? 'PENDIENTE_COBRO_REVISION' : settled ? 'COBRADA_CALCULADA' : 'PENDIENTE_COBRO',
      reasons: [...item.reasons].sort(),
    })
  }

  const difference = unallocatedDifferenceUnknown ? null : bigIntToSafeNumber(unallocatedDifference)
  return {
    invoices: settlements,
    summary: settlementSummary(settlements, difference),
    bankCoverage: coverage,
    calculationBasis: 'B4_ACTIVE_APLICADA_NO_REVERTIDA_JUSTIFICADO_DOCUMENTO__B6_EXPLICITA',
  }
}
