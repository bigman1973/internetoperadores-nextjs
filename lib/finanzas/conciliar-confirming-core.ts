import { createHash } from 'node:crypto'

/**
 * Núcleo puro de conciliación documental confirming.
 *
 * No importa Prisma, no descarga documentos, no mira bancos emisores ni escribe.
 * La única fuente de intereses es `interesesDecimal` de una ConfirmingLinea ya
 * guardada. `gastosFinancieros` se transporta sólo como señal de revisión y no
 * participa jamás en ningún cálculo.
 */

export const CONFIRMING_DRAXTON_FOLDER = '3. Confirming Draxton 2026' as const
export const MAX_CENTS = 2_147_483_647

export type ConfirmingReviewState =
  | 'LISTO_PARA_CONFIRMACION_B4'
  | 'REQUIERE_REVISION_DOCUMENTAL'
  | 'REQUIERE_REVISION_AMBIGUEDAD'
  | 'BLOQUEADO_IDENTIDAD_FACTURA'
  | 'BLOQUEADO_CAPACIDAD_B4'
  | 'BLOQUEADO_INTERES_NO_EXPLICITO'
  | 'BLOQUEADO_CIERRE_NO_EXACTO'
  | 'BLOQUEADO_DOCUMENTO_INCOMPLETO'

export type ConfirmingBlockCode =
  | 'DOCUMENTO_FUERA_DE_CARPETA_CONFIRMING'
  | 'DOCUMENTO_SIN_ITEM_ONEDRIVE'
  | 'DOCUMENTO_SIN_DRIVE_ONEDRIVE'
  | 'DOCUMENTO_FECHA_INVALIDA'
  | 'LINEA_SIN_FACTURA_EMITIDA'
  | 'LINEA_FACTURA_NO_ENCONTRADA'
  | 'LINEA_NUMERO_FACTURA_NO_COINCIDE'
  | 'LINEA_IMPORTE_FACTURA_NO_COINCIDE'
  | 'FACTURA_REPETIDA_EN_DOCUMENTO'
  | 'FACTURA_FECHA_INVALIDA'
  | 'FACTURA_FECHA_POSTERIOR_AL_MOVIMIENTO'
  | 'FACTURA_SIN_DOCUMENTO_B4'
  | 'FACTURA_B4_STALE_O_SIN_CAPACIDAD'
  | 'INTERES_NO_EXPLICITO'
  | 'COMISION_NO_EXACTA'
  | 'CIERRE_CONFIRMING_NO_EXACTO'
  | 'MOVIMIENTO_NO_ES_ABONO'
  | 'MOVIMIENTO_B4_NO_DISPONIBLE'
  | 'MOVIMIENTO_FUERA_DE_VENTANA_DOCUMENTAL'
  | 'MOVIMIENTO_AMBIGUO_ENTRE_DOCUMENTOS'
  | 'SELECCION_CONFIRMING_AMBIGUA'
  | 'SELECCION_CONFIRMING_NO_ACOTADA'
  | 'DECIMAL_NO_EXACTO'

export type ConfirmingB4Line = Readonly<
  | {
      tipo: 'DOCUMENTO'
      documentoConciliableId: string
      importeCentimos: number
      facturaEmitidaId: string
    }
  | {
      tipo: 'DIFERENCIA'
      motivoDiferencia: 'INTERESES' | 'COMISION'
      importeCentimos: number
      confirmingLineaId: string
    }
>

export type StoredConfirmingDocument = Readonly<{
  id: string
  fechaDocumento: string | null
  proveedor: string | null
  /** Referencia propia del soporte confirming, nunca inferida desde una línea. */
  referenciaDocumento?: string | null
  carpetaOrigen: string | null
  archivoOneDrive: string | null
  oneDriveRutaActual: string | null
  /** B1: la evidencia puede subsistir aunque el documento haya sido movido. */
  rutaConfirmingHistorica?: boolean
  oneDriveItemId: string | null
  oneDriveDriveId: string | null
}>

export type StoredConfirmingLine = Readonly<{
  id: string
  confirmingId: string
  numFactura: string
  importeDecimal: string
  /** Importe explícitamente parseado de la columna/interés documental, nunca un residuo. */
  interesesDecimal: string | null
  /** Comisión explícita, tratada de forma separada del interés. */
  comisionDecimal: string | null
  /** Campo histórico potencialmente agregado. Se prohíbe usarlo para cerrar/importar interés. */
  gastosFinancierosDecimal: string | null
  facturaEmitidaId: string | null
}>

export type StoredFacturaEmitida = Readonly<{
  id: string
  numFactura: string
  cliente: string | null
  fecha: string | null
  totalDecimal: string
}>

export type StoredDocumentoB4 = Readonly<{
  id: string
  facturaEmitidaId: string
  activo: boolean
  objetivoCentimos: number | null
  asignadoCentimos: number
}>

export type StoredMovimientoConfirming = Readonly<{
  id: string
  fecha: string
  importeCentimos: number
  estadoB4: 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE' | 'DESCONOCIDO'
  banco: string | null
  cuenta: string | null
  concepto: string
  tercero: string | null
}>

export type ConfirmingInterestSupportSeed = Readonly<{
  confirmingLineaId: string
  confirmingId: string
  movimientoId: string
  facturaEmitidaId: string
  importeInteresCentimos: number
  documento: Pick<StoredConfirmingDocument, 'id' | 'fechaDocumento' | 'carpetaOrigen' | 'archivoOneDrive' | 'oneDriveRutaActual' | 'rutaConfirmingHistorica' | 'oneDriveItemId' | 'oneDriveDriveId'>
  facturaNumero: string
  facturaFecha: string | null
}>

/** Evidencia completa y estable del confirming; no depende del estado B4. */
export type ConfirmingInterestEvidenceLine = Readonly<{
  confirmingLineaId: string
  confirmingId: string
  facturaEmitidaId: string | null
  numeroDocumento: string | null
  importeFacturaCentimos: number | null
  facturaNumero: string | null
  facturaFecha: string | null
  facturaTotalCentimos: number | null
  importeInteresCentimos: number | null
  importeComisionCentimos: number | null
  gastosFinancierosCentimos: number | null
}>

export type ConciliarConfirmingCandidate = Readonly<{
  id: string
  movimientoId: string
  confirmingId: string
  fechaDocumento: string | null
  grupoBusqueda: 'GRUPO_DRAXTON'
  sociedadDocumento: string | null
  estado: ConfirmingReviewState
  bloqueos: readonly ConfirmingBlockCode[]
  requiereConfirmacionHumana: true
  noEscrituras: true
  /** Nunca exige ni compara banco emisor con banco depositario. */
  bancoDepositario: string | null
  cuentaDepositaria: string | null
  importeMovimientoCentimos: number
  totalFacturasCentimos: number | null
  totalInteresesExplicitosCentimos: number | null
  totalComisionesExplicitasCentimos: number | null
  totalLineasB4Centimos: number | null
  lineasB4: readonly ConfirmingB4Line[]
  facturas: readonly Readonly<{
    confirmingLineaId: string
    facturaEmitidaId: string | null
    numeroDocumento: string
    numeroFacturaEmitida: string | null
    sociedadFactura: string | null
    importeCentimos: number | null
    fechaFactura: string | null
    documentoConciliableId: string | null
    restanteB4Centimos: number | null
  }>[]
  soportesIntereses: readonly ConfirmingInterestSupportSeed[]
  /** Siempre true cuando el campo histórico gastosFinancieros tenía un valor: se ignoró a propósito. */
  gastosFinancierosHistoricosIgnorados: boolean
  sourceHash: string | null
}>

export type ConciliarConfirmingCoreInput = Readonly<{
  documentos: readonly StoredConfirmingDocument[]
  lineas: readonly StoredConfirmingLine[]
  facturasEmitidas: readonly StoredFacturaEmitida[]
  documentosB4: readonly StoredDocumentoB4[]
  movimientos: readonly StoredMovimientoConfirming[]
}>

export type ConciliarConfirmingCoreResult = Readonly<{
  candidates: readonly ConciliarConfirmingCandidate[]
  documentosBloqueados: readonly Readonly<{
    confirmingId: string
    bloqueos: readonly ConfirmingBlockCode[]
  }>[]
  warningCodes: readonly string[]
}>

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('CONFIRMING_CANONICAL_VALUE_INVALID')
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}

function nonEmpty(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}

function integer(value: unknown): number | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'bigint') {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

/** Parses SQL decimal text exactly into signed cents. It never rounds a Float. */
export function centsFromExactDecimal(value: unknown): number | null {
  const text = typeof value === 'string' ? value.trim() : null
  if (!text || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return null
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, decimal = ''] = unsigned.split('.')
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0') || '0')
  const signed = negative ? -cents : cents
  return Number.isSafeInteger(signed) && Math.abs(signed) <= MAX_CENTS ? signed : null
}

export function normalizeConfirmingInvoiceNumber(value: unknown): string | null {
  const raw = nonEmpty(value)
  if (!raw) return null
  const normalized = raw
    .toLocaleUpperCase('es-ES')
    .replace(/[\s\u00a0]+/g, '')
    .replace(/[‐‑‒–—―]/g, '-')
  return normalized.length <= 160 ? normalized : null
}

/** Exact canonical C9 folder segment check, not a confirming word heuristic. */
export function hasConfirmingDraxtonPath(document: Pick<StoredConfirmingDocument, 'carpetaOrigen' | 'archivoOneDrive' | 'oneDriveRutaActual' | 'rutaConfirmingHistorica'>): boolean {
  if (document.rutaConfirmingHistorica === true) return true
  return [document.carpetaOrigen, document.archivoOneDrive, document.oneDriveRutaActual]
    .map(nonEmpty)
    .some((path) => path?.split(/[\\/]+/).some((segment) => segment.trim().toLocaleLowerCase('es-ES') === CONFIRMING_DRAXTON_FOLDER.toLocaleLowerCase('es-ES')) === true)
}

/**
 * Stable hash tied to source location, document date and the exact persisted line
 * values. It deliberately excludes gastosFinancieros because it must not become
 * an implicit interest source.
 */
export function hashConfirmingInterestSource(seed: ConfirmingInterestSupportSeed): string {
  const doc = seed.documento
  return createHash('sha256').update(canonical({
    schema: 'CONFIRMING_INTERES_DOCUMENTAL_V1',
    confirmingLineaId: seed.confirmingLineaId,
    confirmingId: seed.confirmingId,
    movimientoId: seed.movimientoId,
    facturaEmitidaId: seed.facturaEmitidaId,
    importeInteresCentimos: seed.importeInteresCentimos,
    facturaNumero: seed.facturaNumero,
    facturaFecha: seed.facturaFecha,
    documento: {
      id: doc.id,
      fechaDocumento: doc.fechaDocumento,
      carpetaOrigen: doc.carpetaOrigen,
      archivoOneDrive: doc.archivoOneDrive,
      oneDriveRutaActual: doc.oneDriveRutaActual,
      rutaConfirmingHistorica: doc.rutaConfirmingHistorica === true,
      oneDriveItemId: doc.oneDriveItemId,
      oneDriveDriveId: doc.oneDriveDriveId,
    },
  })).digest('hex')
}

/**
 * Hash que se entrega a C10. Incluye todas las líneas persistidas y sus campos
 * explícitos, pero nunca wrappers, vínculos ni estado B4: B4 puede consumirse
 * entre lectura y aplicación sin alterar la fuente documental revisada.
 */
export function hashConfirmingInterestEvidence(input: Readonly<{
  movimientoId: string
  documento: Pick<StoredConfirmingDocument, 'id' | 'fechaDocumento' | 'proveedor' | 'referenciaDocumento' | 'carpetaOrigen' | 'archivoOneDrive' | 'oneDriveRutaActual' | 'rutaConfirmingHistorica' | 'oneDriveItemId' | 'oneDriveDriveId'>
  lineas: readonly ConfirmingInterestEvidenceLine[]
}>): string {
  const doc = input.documento
  return createHash('sha256').update(canonical({
    schema: 'CONFIRMING_EVIDENCIA_DOCUMENTAL_V2',
    movimientoId: input.movimientoId,
    documento: {
      id: doc.id,
      fechaDocumento: doc.fechaDocumento,
      proveedor: doc.proveedor,
      referenciaDocumento: doc.referenciaDocumento ?? null,
      carpetaOrigen: doc.carpetaOrigen,
      archivoOneDrive: doc.archivoOneDrive,
      oneDriveRutaActual: doc.oneDriveRutaActual,
      rutaConfirmingHistorica: doc.rutaConfirmingHistorica === true,
      oneDriveItemId: doc.oneDriveItemId,
      oneDriveDriveId: doc.oneDriveDriveId,
    },
    lineas: [...input.lineas]
      .sort((left, right) => left.confirmingLineaId.localeCompare(right.confirmingLineaId))
      .map((line) => ({ ...line })),
  })).digest('hex')
}

/** Gastos agregados sólo explican una comisión explícita cuando no hay interés. */
export function hasUnexplainedConfirmingHistoricalExpense(input: Readonly<{
  importeInteresCentimos: number | null
  importeComisionCentimos: number | null
  gastosFinancierosCentimos: number | null
}>): boolean {
  if (input.gastosFinancierosCentimos === null || input.gastosFinancierosCentimos <= 0) return false
  return (input.importeInteresCentimos === null || input.importeInteresCentimos <= 0)
    && input.importeComisionCentimos !== input.gastosFinancierosCentimos
}

function sourceBlockers(document: StoredConfirmingDocument): ConfirmingBlockCode[] {
  const blockers: ConfirmingBlockCode[] = []
  if (!hasConfirmingDraxtonPath(document)) blockers.push('DOCUMENTO_FUERA_DE_CARPETA_CONFIRMING')
  if (!nonEmpty(document.oneDriveItemId)) blockers.push('DOCUMENTO_SIN_ITEM_ONEDRIVE')
  if (!nonEmpty(document.oneDriveDriveId)) blockers.push('DOCUMENTO_SIN_DRIVE_ONEDRIVE')
  return blockers
}

function sumExact(values: readonly number[]): number | null {
  let total = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null
    total += value
    if (!Number.isSafeInteger(total) || Math.abs(total) > MAX_CENTS) return null
  }
  return total
}

function stateFor(blockers: readonly ConfirmingBlockCode[], exactClose: boolean, ambiguous: boolean): ConfirmingReviewState {
  if (blockers.includes('LINEA_SIN_FACTURA_EMITIDA') || blockers.includes('LINEA_FACTURA_NO_ENCONTRADA') || blockers.includes('LINEA_NUMERO_FACTURA_NO_COINCIDE') || blockers.includes('LINEA_IMPORTE_FACTURA_NO_COINCIDE') || blockers.includes('FACTURA_REPETIDA_EN_DOCUMENTO')) return 'BLOQUEADO_IDENTIDAD_FACTURA'
  if (blockers.includes('FACTURA_SIN_DOCUMENTO_B4') || blockers.includes('FACTURA_B4_STALE_O_SIN_CAPACIDAD')) return 'BLOQUEADO_CAPACIDAD_B4'
  if (blockers.includes('INTERES_NO_EXPLICITO')) return 'BLOQUEADO_INTERES_NO_EXPLICITO'
  if (blockers.includes('DOCUMENTO_FUERA_DE_CARPETA_CONFIRMING') || blockers.includes('DOCUMENTO_SIN_ITEM_ONEDRIVE') || blockers.includes('DOCUMENTO_SIN_DRIVE_ONEDRIVE') || blockers.includes('DOCUMENTO_FECHA_INVALIDA') || blockers.includes('FACTURA_FECHA_INVALIDA') || blockers.includes('FACTURA_FECHA_POSTERIOR_AL_MOVIMIENTO')) return 'BLOQUEADO_DOCUMENTO_INCOMPLETO'
  if (blockers.includes('SELECCION_CONFIRMING_AMBIGUA') || blockers.includes('SELECCION_CONFIRMING_NO_ACOTADA')) return 'REQUIERE_REVISION_AMBIGUEDAD'
  if (!exactClose || blockers.includes('CIERRE_CONFIRMING_NO_EXACTO') || blockers.includes('MOVIMIENTO_NO_ES_ABONO') || blockers.includes('MOVIMIENTO_B4_NO_DISPONIBLE') || blockers.includes('MOVIMIENTO_FUERA_DE_VENTANA_DOCUMENTAL')) return 'BLOQUEADO_CIERRE_NO_EXACTO'
  if (ambiguous || blockers.includes('MOVIMIENTO_AMBIGUO_ENTRE_DOCUMENTOS')) return 'REQUIERE_REVISION_AMBIGUEDAD'
  return 'LISTO_PARA_CONFIRMACION_B4'
}

function candidateId(movimientoId: string, confirmingId: string): string {
  return `confirming:${movimientoId}:${confirmingId}`
}

function civilDay(value: string | null): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? Math.floor(date.getTime() / 86_400_000) : null
}

const MAX_CONFIRMING_SUBSET_STATES = 100_000

type ConfirmingLinePlan = Readonly<{
  fact: ConciliarConfirmingCandidate['facturas'][number]
  b4: ConfirmingB4Line | null
  interest: Omit<ConfirmingInterestSupportSeed, 'movimientoId'> | null
  invoiceCentimos: number | null
  interestCentimos: number | null
  commissionCentimos: number | null
  netCentimos: number | null
  facturaDay: number | null
  blockers: readonly ConfirmingBlockCode[]
}>

type ExactSubsetResult = Readonly<{
  kind: 'UNIQUE' | 'AMBIGUOUS' | 'NONE' | 'LIMIT'
  indexes: readonly number[]
}>

/**
 * Finds at most one exact subset. All eligible line net amounts are positive,
 * allowing the dynamic program to discard sums above the bank credit. Two
 * different selections for the same cents make the answer ambiguous; neither
 * ordering nor any invoice number is used as a tie-breaker.
 */
function uniqueExactSubset(values: readonly number[], target: number): ExactSubsetResult {
  if (!Number.isSafeInteger(target) || target <= 0 || values.some((value) => !Number.isSafeInteger(value) || value <= 0)) return { kind: 'NONE', indexes: [] }
  const states = new Map<number, { indexes: readonly number[]; multiple: boolean }>()
  states.set(0, { indexes: [], multiple: false })
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    const prior = [...states.entries()]
    for (const [sum, state] of prior) {
      const nextSum = sum + value
      if (!Number.isSafeInteger(nextSum) || nextSum > target) continue
      const next = { indexes: [...state.indexes, index], multiple: state.multiple }
      const previous = states.get(nextSum)
      if (!previous) {
        states.set(nextSum, next)
        if (states.size > MAX_CONFIRMING_SUBSET_STATES) return { kind: 'LIMIT', indexes: [] }
      } else {
        // The new path cannot be the same subset: it contains the current index,
        // while every snapshot path predates it.
        previous.multiple = true
      }
    }
  }
  const result = states.get(target)
  if (!result) return { kind: 'NONE', indexes: [] }
  return result.multiple ? { kind: 'AMBIGUOUS', indexes: [] } : { kind: 'UNIQUE', indexes: result.indexes }
}

/**
 * Builds B4-ready reviewing candidates. Group membership is displayed as context
 * only. It never searches another Draxton company to replace a missing invoice
 * mapping, and it never uses a bank-emitter/depositary match as a requirement.
 */
export function buildConciliarConfirmingCandidates(input: ConciliarConfirmingCoreInput): ConciliarConfirmingCoreResult {
  const documents = new Map(input.documentos.map((item) => [item.id, item]))
  const linesByDocument = new Map<string, StoredConfirmingLine[]>()
  for (const line of input.lineas) {
    const bucket = linesByDocument.get(line.confirmingId) ?? []
    bucket.push(line)
    linesByDocument.set(line.confirmingId, bucket)
  }
  const invoices = new Map(input.facturasEmitidas.map((item) => [item.id, item]))
  const b4ByInvoice = new Map<string, StoredDocumentoB4[]>()
  for (const row of input.documentosB4) {
    const bucket = b4ByInvoice.get(row.facturaEmitidaId) ?? []
    bucket.push(row)
    b4ByInvoice.set(row.facturaEmitidaId, bucket)
  }

  const candidates: ConciliarConfirmingCandidate[] = []
  const blockedDocuments: Array<{ confirmingId: string; bloqueos: readonly ConfirmingBlockCode[] }> = []
  const documentPlans = new Map<string, {
    document: StoredConfirmingDocument
    sourceBlockers: ConfirmingBlockCode[]
    lines: ConfirmingLinePlan[]
    ignoredExpense: boolean
    evidenceLines: ConfirmingInterestEvidenceLine[]
  }>()

  for (const [confirmingId, storedLines] of linesByDocument) {
    const confirmingDocument = documents.get(confirmingId)
    if (!confirmingDocument) {
      blockedDocuments.push({ confirmingId, bloqueos: ['DOCUMENTO_FUERA_DE_CARPETA_CONFIRMING'] })
      continue
    }
    const blockers = sourceBlockers(confirmingDocument)
    if (civilDay(confirmingDocument.fechaDocumento) === null) blockers.push('DOCUMENTO_FECHA_INVALIDA')
    const evidenceLines: ConfirmingInterestEvidenceLine[] = []
    const linePlans: ConfirmingLinePlan[] = []
    const invoiceOccurrences = new Map<string, number>()
    for (const line of storedLines) {
      if (line.facturaEmitidaId) invoiceOccurrences.set(line.facturaEmitidaId, (invoiceOccurrences.get(line.facturaEmitidaId) ?? 0) + 1)
    }
    let ignoredExpense = false

    for (const line of storedLines.sort((left, right) => left.id.localeCompare(right.id))) {
      if (line.gastosFinancierosDecimal !== null && centsFromExactDecimal(line.gastosFinancierosDecimal) !== null) ignoredExpense = true
      const invoiceAmount = centsFromExactDecimal(line.importeDecimal)
      const interest = line.interesesDecimal === null ? null : centsFromExactDecimal(line.interesesDecimal)
      const commission = line.comisionDecimal === null ? null : centsFromExactDecimal(line.comisionDecimal)
      const historicalExpense = line.gastosFinancierosDecimal === null ? null : centsFromExactDecimal(line.gastosFinancierosDecimal)
      const invoice = line.facturaEmitidaId ? invoices.get(line.facturaEmitidaId) : undefined
      const invoiceTotal = invoice ? centsFromExactDecimal(invoice.totalDecimal) : null
      const expectedNumber = invoice ? normalizeConfirmingInvoiceNumber(invoice.numFactura) : null
      const sourceNumber = normalizeConfirmingInvoiceNumber(line.numFactura)
      const docRows = line.facturaEmitidaId ? (b4ByInvoice.get(line.facturaEmitidaId) ?? []).filter((row) => row.activo) : []
      const usableDoc = docRows.length === 1 ? docRows[0] : undefined
      const remaining = usableDoc && usableDoc.objetivoCentimos !== null
        ? usableDoc.objetivoCentimos - usableDoc.asignadoCentimos
        : null

      evidenceLines.push({
        confirmingLineaId: line.id,
        confirmingId,
        facturaEmitidaId: line.facturaEmitidaId,
        numeroDocumento: sourceNumber,
        importeFacturaCentimos: invoiceAmount,
        facturaNumero: expectedNumber,
        facturaFecha: invoice?.fecha ?? null,
        facturaTotalCentimos: invoiceTotal,
        importeInteresCentimos: interest,
        importeComisionCentimos: commission,
        gastosFinancierosCentimos: historicalExpense,
      })

      const lineBlockers: ConfirmingBlockCode[] = []
      if (!line.facturaEmitidaId) lineBlockers.push('LINEA_SIN_FACTURA_EMITIDA')
      if (line.facturaEmitidaId && !invoice) lineBlockers.push('LINEA_FACTURA_NO_ENCONTRADA')
      if (!sourceNumber || !expectedNumber || sourceNumber !== expectedNumber) lineBlockers.push('LINEA_NUMERO_FACTURA_NO_COINCIDE')
      if (invoiceAmount === null || invoiceTotal === null || invoiceAmount <= 0 || invoiceTotal <= 0 || invoiceAmount !== invoiceTotal) lineBlockers.push('LINEA_IMPORTE_FACTURA_NO_COINCIDE')
      if ((line.interesesDecimal !== null && interest === null) || (line.comisionDecimal !== null && commission === null) || (line.gastosFinancierosDecimal !== null && historicalExpense === null)) lineBlockers.push('DECIMAL_NO_EXACTO')
      if (line.facturaEmitidaId && (invoiceOccurrences.get(line.facturaEmitidaId) ?? 0) !== 1) lineBlockers.push('FACTURA_REPETIDA_EN_DOCUMENTO')
      if (!usableDoc) lineBlockers.push('FACTURA_SIN_DOCUMENTO_B4')
      if (remaining === null || invoiceAmount === null || remaining !== invoiceAmount || remaining <= 0) lineBlockers.push('FACTURA_B4_STALE_O_SIN_CAPACIDAD')
      // Un confirming sin gasto puede cerrar a nominal sin interés. Si el parser
      // histórico comunica gasto positivo pero no trae interés explícito, no se
      // convierte ese residuo en interés ni se presenta como conciliable.
      // Una comisión explícita que coincide exactamente con el gasto no es un
      // interés ausente. Cualquier otro total histórico queda bloqueado en vez de
      // separar o deducir un supuesto interés.
      // `null` means absent, not zero. A selected line must carry its own exact
      // documentary interest (including literal 0.00); no bank residual may fill it.
      if (line.interesesDecimal === null || interest === null || interest < 0) lineBlockers.push('INTERES_NO_EXPLICITO')
      if (hasUnexplainedConfirmingHistoricalExpense({ importeInteresCentimos: interest, importeComisionCentimos: commission, gastosFinancierosCentimos: historicalExpense })) lineBlockers.push('INTERES_NO_EXPLICITO')
      if (commission !== null && commission < 0) lineBlockers.push('COMISION_NO_EXACTA')
      const facturaDay = civilDay(invoice?.fecha ?? null)
      if (invoice && facturaDay === null) lineBlockers.push('FACTURA_FECHA_INVALIDA')
      // Unlike interest, the document may omit a separate commission column.
      // That absence means no commission; it must never turn into an inferred
      // interest or a bank-residual adjustment.
      const net = invoiceAmount !== null && interest !== null
        ? sumExact([invoiceAmount, -interest, -(commission ?? 0)])
        : null
      if (net === null || net <= 0) lineBlockers.push('CIERRE_CONFIRMING_NO_EXACTO')
      const fact: ConciliarConfirmingCandidate['facturas'][number] = {
        confirmingLineaId: line.id,
        facturaEmitidaId: line.facturaEmitidaId,
        numeroDocumento: line.numFactura,
        numeroFacturaEmitida: invoice?.numFactura ?? null,
        sociedadFactura: invoice?.cliente ?? null,
        importeCentimos: invoiceAmount,
        fechaFactura: invoice?.fecha ?? null,
        documentoConciliableId: usableDoc?.id ?? null,
        restanteB4Centimos: remaining,
      }
      const interestSeed = interest !== null && interest > 0 && line.facturaEmitidaId && invoice && expectedNumber
        ? {
          confirmingLineaId: line.id,
          confirmingId,
          facturaEmitidaId: line.facturaEmitidaId,
          importeInteresCentimos: interest,
          documento: confirmingDocument,
          facturaNumero: expectedNumber,
          facturaFecha: invoice.fecha,
        }
        : null
      const b4Line = invoiceAmount !== null && invoiceAmount > 0 && usableDoc && line.facturaEmitidaId
        ? { tipo: 'DOCUMENTO' as const, documentoConciliableId: usableDoc.id, importeCentimos: invoiceAmount, facturaEmitidaId: line.facturaEmitidaId }
        : null
      linePlans.push({ fact, b4: b4Line, interest: interestSeed, invoiceCentimos: invoiceAmount, interestCentimos: interest, commissionCentimos: commission ?? 0, netCentimos: net, facturaDay, blockers: uniqueSorted(lineBlockers) })
    }

    documentPlans.set(confirmingId, {
      document: confirmingDocument,
      sourceBlockers: uniqueSorted(blockers),
      lines: linePlans,
      ignoredExpense,
      evidenceLines,
    })
  }

  for (const movement of input.movimientos) {
    const allPlans = [...documentPlans.entries()]
    const movementDay = civilDay(movement.fecha)
    const selections = new Map<string, ExactSubsetResult>()
    const withinWindows = new Map<string, boolean>()
    for (const [confirmingId, plan] of allPlans) {
      const documentDay = civilDay(plan.document.fechaDocumento)
      const withinDocumentWindow = documentDay !== null && movementDay !== null && movementDay - documentDay >= 0 && movementDay - documentDay <= 4
      withinWindows.set(confirmingId, withinDocumentWindow)
      const eligible = plan.lines.filter((line) => line.blockers.length === 0 && movementDay !== null && line.facturaDay !== null && line.facturaDay <= movementDay && line.netCentimos !== null)
      selections.set(confirmingId, uniqueExactSubset(eligible.map((line) => line.netCentimos!), movement.importeCentimos))
    }
    const exactMatches = allPlans.filter(([confirmingId, plan]) => selections.get(confirmingId)?.kind === 'UNIQUE' && withinWindows.get(confirmingId) === true && plan.sourceBlockers.length === 0)
    for (const [confirmingId, plan] of allPlans) {
      const selection = selections.get(confirmingId) ?? { kind: 'NONE' as const, indexes: [] }
      const withinDocumentWindow = withinWindows.get(confirmingId) === true
      const eligible = plan.lines.filter((line) => line.blockers.length === 0 && movementDay !== null && line.facturaDay !== null && line.facturaDay <= movementDay && line.netCentimos !== null)
      const selected = selection.kind === 'UNIQUE' ? selection.indexes.map((index) => eligible[index]) : []
      const blockers = [...plan.sourceBlockers]
      if (movement.importeCentimos <= 0) blockers.push('MOVIMIENTO_NO_ES_ABONO')
      if (movement.estadoB4 !== 'SIN_DOCUMENTO') blockers.push('MOVIMIENTO_B4_NO_DISPONIBLE')
      // The PDF and every chosen issued invoice must predate the bank credit;
      // a document may settle only within the following four civil days.
      const amountMatches = selection.kind === 'UNIQUE'
      // A defective unused line is not allowed to poison a separately proven,
      // unique selected subset. When no subset can be proven, keep those facts in
      // the diagnostic candidate so review sees why no exact closing is eligible.
      if (!amountMatches) blockers.push(...plan.lines.flatMap((line) => line.blockers))
      // A cierre exacto fuera de ventana se muestra bloqueado; un documento dentro
      // de ventana pero sin cierre se expone sólo para lectura/revisión humana.
      if (!withinDocumentWindow) blockers.push('MOVIMIENTO_FUERA_DE_VENTANA_DOCUMENTAL')
      if (selection.kind === 'AMBIGUOUS') blockers.push('SELECCION_CONFIRMING_AMBIGUA')
      if (selection.kind === 'LIMIT') blockers.push('SELECCION_CONFIRMING_NO_ACOTADA')
      if (!amountMatches) blockers.push('CIERRE_CONFIRMING_NO_EXACTO')
      if (!amountMatches && !withinDocumentWindow) continue
      const ambiguous = amountMatches && exactMatches.length > 1
      if (ambiguous) blockers.push('MOVIMIENTO_AMBIGUO_ENTRE_DOCUMENTOS')
      const invoiceTotal = amountMatches ? sumExact(selected.map((line) => line.invoiceCentimos ?? Number.NaN)) : null
      const interestTotal = amountMatches ? sumExact(selected.map((line) => line.interestCentimos ?? Number.NaN)) : null
      const commissionTotal = amountMatches ? sumExact(selected.map((line) => line.commissionCentimos ?? Number.NaN)) : null
      const b4 = amountMatches ? selected.flatMap((line) => line.b4 ? [line.b4] : []) : []
      // B4 aggregates explicit reductions while support records retain the chosen
      // ConfirmingLinea IDs. Unused PDF lines never enter either payload.
      if (interestTotal !== null && interestTotal > 0) b4.push({ tipo: 'DIFERENCIA', motivoDiferencia: 'INTERESES', importeCentimos: -interestTotal, confirmingLineaId: `confirming:${confirmingId}:intereses` })
      if (commissionTotal !== null && commissionTotal > 0) b4.push({ tipo: 'DIFERENCIA', motivoDiferencia: 'COMISION', importeCentimos: -commissionTotal, confirmingLineaId: `confirming:${confirmingId}:comision` })
      const b4Total = amountMatches ? sumExact(b4.map((line) => line.importeCentimos)) : null
      if (amountMatches && (invoiceTotal === null || interestTotal === null || commissionTotal === null || b4Total !== movement.importeCentimos)) blockers.push('DECIMAL_NO_EXACTO')
      const seeds = amountMatches
        ? selected.flatMap((line) => line.interest ? [{ ...line.interest, movimientoId: movement.id }] : [])
        : []
      const sourceHash = seeds.length > 0
        ? hashConfirmingInterestEvidence({ movimientoId: movement.id, documento: plan.document, lineas: plan.evidenceLines })
        : null
      candidates.push({
        id: candidateId(movement.id, confirmingId),
        movimientoId: movement.id,
        confirmingId,
        fechaDocumento: plan.document.fechaDocumento,
        grupoBusqueda: 'GRUPO_DRAXTON',
        sociedadDocumento: plan.document.proveedor,
        estado: stateFor(uniqueSorted(blockers), amountMatches, ambiguous),
        bloqueos: uniqueSorted(blockers),
        requiereConfirmacionHumana: true,
        noEscrituras: true,
        bancoDepositario: movement.banco,
        cuentaDepositaria: movement.cuenta,
        importeMovimientoCentimos: movement.importeCentimos,
        totalFacturasCentimos: invoiceTotal,
        totalInteresesExplicitosCentimos: interestTotal,
        totalComisionesExplicitasCentimos: commissionTotal,
        totalLineasB4Centimos: b4Total,
        lineasB4: b4,
        facturas: amountMatches ? selected.map((line) => line.fact) : [],
        soportesIntereses: seeds,
        gastosFinancierosHistoricosIgnorados: plan.ignoredExpense,
        sourceHash,
      })
    }
  }

  for (const [confirmingId, plan] of documentPlans) {
    if (!candidates.some((candidate) => candidate.confirmingId === confirmingId) && plan.sourceBlockers.length) {
      blockedDocuments.push({ confirmingId, bloqueos: plan.sourceBlockers })
    }
  }

  return {
    candidates: candidates.sort((left, right) => left.movimientoId.localeCompare(right.movimientoId) || left.confirmingId.localeCompare(right.confirmingId)),
    documentosBloqueados: blockedDocuments.sort((left, right) => left.confirmingId.localeCompare(right.confirmingId)),
    warningCodes: uniqueSorted([
      'SIN_FILTRO_BANCO_EMISOR_DEPOSITARIO',
      'GASTOS_FINANCIEROS_HISTORICOS_NO_SE_USAN_PARA_INFERIR_INTERESES',
      'GRUPO_DRAXTON_ES_CONTEXTO_NO_REASIGNACION_AUTOMATICA',
      'INTERESES_SOLO_DESDE_CAMPO_EXPLICITO_DE_LINEA_PERSISTIDA',
    ]),
  }
}
