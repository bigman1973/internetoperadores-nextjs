import { createHash } from 'node:crypto'

/**
 * Contrato puro C11 de una liquidación confirming ya revisada.
 *
 * Esta capa no parsea archivos ni accede a Prisma. Recibe exclusivamente los
 * valores que el parser documental ya declaró y conserva las ausencias como
 * `null`: ningún componente se completa por porcentaje o por residuo.
 */

export const CONFIRMING_LIQUIDATION_SCHEMA = 'CONFIRMING_LIQUIDATION_DOCUMENTAL_V1' as const
export const MAX_CONFIRMING_LIQUIDATION_CENTS = 2_147_483_647

export type ConfirmingLiquidationBank = 'BBVA' | 'CAIXABANK'
export type ConfirmingLiquidationDocumentRole = 'LIQUIDACION_PDF' | 'DETALLE_FACTURAS_XLS' | 'AVISO_CESION_PDF'
export type ConfirmingLiquidationEvidenceState = 'CUADRA' | 'REQUIERE_REVISION_DOCUMENTAL'

export type ConfirmingLiquidationSourceDocument = Readonly<{
  id: string
  rol: ConfirmingLiquidationDocumentRole
  /** FacturaRecibida local que conserva el archivo controlado. */
  facturaRecibidaId: string
  /** SHA-256 binario de la descarga ya controlada. */
  hashBinario: string
  /** Identificador opaco del archivo ya descargado; nunca es una ruta enviada por navegador. */
  procedencia: 'ARCHIVO_DESCARGADO_CONTROLADO'
  archivoControladoId: string
  oneDriveDriveId: string | null
  oneDriveItemId: string | null
  nombreOriginal: string | null
}>

export type ConfirmingLiquidationInvoiceLine = Readonly<{
  id: string
  /** Puede no existir en una pareja Caixa PDF/XLS; no se inventa. */
  confirmingLineaId: string | null
  facturaEmitidaId: string
  numeroFactura: string
  nominalCentimos: number | null
  fechaEmision: string | null
  /** La emisión se toma de la factura registrada cuando el detalle sólo da otra fecha. */
  fechaEmisionProcedencia?: 'DOCUMENTO' | 'FACTURA_EMITIDA_REGISTRADA'
  /** Fecha literal del detalle, sin reinterpretarla como emisión si no coincide. */
  fechaLineaDocumental?: string | null
  fechaVencimiento: string | null
  /** Sólo BBVA puede declarar estos componentes por línea. Nunca se usan para repartir IVA global. */
  interesesExplicitosCentimos: number | null
  comisionExplicitaCentimos: number | null
}>

export type ConfirmingLiquidationEvidence = Readonly<{
  id: string
  confirmingId: string
  banco: ConfirmingLiquidationBank
  tipoDocumento: 'LIQUIDACION' | 'AVISO_CESION'
  estadoDocumental: ConfirmingLiquidationEvidenceState
  fechaLiquidacion: string | null
  /** Cuenta interna previamente identificada por revisión humana, no inferida del emisor. */
  cuentaDepositariaId: string | null
  documentos: readonly ConfirmingLiquidationSourceDocument[]
  nominalCentimos: number | null
  interesesCentimos: number | null
  comisionCentimos: number | null
  ivaComisionCentimos: number | null
  deduccionTotalCentimos: number | null
  netoBancarioCentimos: number | null
  lineas: readonly ConfirmingLiquidationInvoiceLine[]
  /** Huella canónica de los dos binarios/procedencia, resumen y líneas originales. */
  sourceHash: string
}>

export type ConfirmingLiquidationBlockCode =
  | 'LIQUIDACION_AVISO_CESION_NO_CONFIRMABLE'
  | 'LIQUIDACION_ESTADO_NO_CUADRA'
  | 'LIQUIDACION_HASH_INVALIDO'
  | 'LIQUIDACION_FUENTE_PDF_AUSENTE'
  | 'LIQUIDACION_DETALLE_XLS_AUSENTE'
  | 'LIQUIDACION_FUENTE_DUPLICADA'
  | 'LIQUIDACION_FECHA_AUSENTE_O_INVALIDA'
  | 'LIQUIDACION_CUENTA_DEPOSITARIA_AUSENTE'
  | 'LIQUIDACION_NOMINAL_AUSENTE'
  | 'LIQUIDACION_INTERESES_AUSENTES'
  | 'LIQUIDACION_COMISION_AUSENTE'
  | 'LIQUIDACION_IVA_COMISION_AUSENTE'
  | 'LIQUIDACION_NETO_AUSENTE'
  | 'LIQUIDACION_DEDUCCION_DECLARADA_NO_CUADRA'
  | 'LIQUIDACION_CIERRE_NO_EXACTO'
  | 'LIQUIDACION_SIN_LINEAS'
  | 'LIQUIDACION_FACTURA_REPETIDA'
  | 'LIQUIDACION_FACTURA_IDENTIDAD_AUSENTE'
  | 'LIQUIDACION_NOMINAL_LINEA_AUSENTE'
  | 'LIQUIDACION_FECHA_EMISION_AUSENTE_O_INVALIDA'
  | 'LIQUIDACION_FECHA_VENCIMIENTO_INVALIDA'
  | 'LIQUIDACION_NOMINALES_LINEAS_NO_CUADRAN'
  | 'LIQUIDACION_INTERESES_LINEAS_NO_CUADRAN'
  | 'LIQUIDACION_COMISION_LINEAS_NO_CUADRAN'

export type ConfirmingLiquidationAssessment = Readonly<{
  bloqueos: readonly ConfirmingLiquidationBlockCode[]
  sourceHashCalculado: string
  nominalLineasCentimos: number | null
  deduccionesCentimos: number | null
  netoCalculadoCentimos: number | null
  cuadroExacto: boolean
}>

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('CONFIRMING_LIQUIDATION_CANONICAL_VALUE_INVALID')
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}

function safeCents(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= MAX_CONFIRMING_LIQUIDATION_CENTS ? value : null
}

function sumCents(values: readonly (number | null)[]): number | null {
  let total = 0
  for (const value of values) {
    if (value === null || !Number.isSafeInteger(value)) return null
    total += value
    if (!Number.isSafeInteger(total) || Math.abs(total) > MAX_CONFIRMING_LIQUIDATION_CENTS) return null
  }
  return total
}

export function isCivilDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function stableDocument(document: ConfirmingLiquidationSourceDocument) {
  return {
    id: document.id,
    rol: document.rol,
    facturaRecibidaId: document.facturaRecibidaId,
    hashBinario: document.hashBinario,
    procedencia: document.procedencia,
    archivoControladoId: document.archivoControladoId,
    oneDriveDriveId: document.oneDriveDriveId,
    oneDriveItemId: document.oneDriveItemId,
    nombreOriginal: document.nombreOriginal,
  }
}

function stableLine(line: ConfirmingLiquidationInvoiceLine) {
  return {
    id: line.id,
    confirmingLineaId: line.confirmingLineaId,
    facturaEmitidaId: line.facturaEmitidaId,
    numeroFactura: line.numeroFactura,
    nominalCentimos: line.nominalCentimos,
    fechaEmision: line.fechaEmision,
    fechaEmisionProcedencia: line.fechaEmisionProcedencia ?? 'DOCUMENTO',
    fechaLineaDocumental: line.fechaLineaDocumental ?? null,
    fechaVencimiento: line.fechaVencimiento,
    interesesExplicitosCentimos: line.interesesExplicitosCentimos,
    comisionExplicitaCentimos: line.comisionExplicitaCentimos,
  }
}

/** Hashes source provenance, original binary hashes and every declared economic value. */
export function hashConfirmingLiquidationEvidence(evidence: Omit<ConfirmingLiquidationEvidence, 'sourceHash'>): string {
  return createHash('sha256').update(canonical({
    schema: CONFIRMING_LIQUIDATION_SCHEMA,
    id: evidence.id,
    confirmingId: evidence.confirmingId,
    banco: evidence.banco,
    tipoDocumento: evidence.tipoDocumento,
    estadoDocumental: evidence.estadoDocumental,
    fechaLiquidacion: evidence.fechaLiquidacion,
    cuentaDepositariaId: evidence.cuentaDepositariaId,
    documentos: [...evidence.documentos].sort((left, right) => left.id.localeCompare(right.id)).map(stableDocument),
    resumen: {
      nominalCentimos: evidence.nominalCentimos,
      interesesCentimos: evidence.interesesCentimos,
      comisionCentimos: evidence.comisionCentimos,
      ivaComisionCentimos: evidence.ivaComisionCentimos,
      deduccionTotalCentimos: evidence.deduccionTotalCentimos,
      netoBancarioCentimos: evidence.netoBancarioCentimos,
    },
    lineas: [...evidence.lineas].sort((left, right) => left.id.localeCompare(right.id)).map(stableLine),
  })).digest('hex')
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

/**
 * Validates the settlement itself. It deliberately does not know bank movements,
 * B4 capacity, Prisma or parser implementation details.
 */
export function assessConfirmingLiquidationEvidence(evidence: ConfirmingLiquidationEvidence): ConfirmingLiquidationAssessment {
  const blockers: ConfirmingLiquidationBlockCode[] = []
  const roles = new Map<ConfirmingLiquidationDocumentRole, ConfirmingLiquidationSourceDocument[]>()
  for (const document of evidence.documentos) {
    const bucket = roles.get(document.rol) ?? []
    bucket.push(document)
    roles.set(document.rol, bucket)
    if (!validHash(document.hashBinario) || document.procedencia !== 'ARCHIVO_DESCARGADO_CONTROLADO' || !document.archivoControladoId) blockers.push('LIQUIDACION_HASH_INVALIDO')
  }
  if (evidence.tipoDocumento !== 'LIQUIDACION') blockers.push('LIQUIDACION_AVISO_CESION_NO_CONFIRMABLE')
  if (evidence.estadoDocumental !== 'CUADRA') blockers.push('LIQUIDACION_ESTADO_NO_CUADRA')
  if (!isCivilDay(evidence.fechaLiquidacion)) blockers.push('LIQUIDACION_FECHA_AUSENTE_O_INVALIDA')
  if (!evidence.cuentaDepositariaId) blockers.push('LIQUIDACION_CUENTA_DEPOSITARIA_AUSENTE')
  if ((roles.get('LIQUIDACION_PDF')?.length ?? 0) !== 1) blockers.push('LIQUIDACION_FUENTE_PDF_AUSENTE')
  if (evidence.banco === 'CAIXABANK' && (roles.get('DETALLE_FACTURAS_XLS')?.length ?? 0) !== 1) blockers.push('LIQUIDACION_DETALLE_XLS_AUSENTE')
  if ([...roles.values()].some((items) => items.length > 1) || (roles.get('AVISO_CESION_PDF')?.length ?? 0) > 0) blockers.push('LIQUIDACION_FUENTE_DUPLICADA')

  const nominal = safeCents(evidence.nominalCentimos)
  const intereses = safeCents(evidence.interesesCentimos)
  const comision = safeCents(evidence.comisionCentimos)
  const iva = safeCents(evidence.ivaComisionCentimos)
  const neto = safeCents(evidence.netoBancarioCentimos)
  const deduccion = evidence.deduccionTotalCentimos === null ? null : safeCents(evidence.deduccionTotalCentimos)
  if (nominal === null || nominal <= 0) blockers.push('LIQUIDACION_NOMINAL_AUSENTE')
  if (intereses === null || intereses < 0) blockers.push('LIQUIDACION_INTERESES_AUSENTES')
  if (comision === null || comision < 0) blockers.push('LIQUIDACION_COMISION_AUSENTE')
  if (iva === null || iva < 0) blockers.push('LIQUIDACION_IVA_COMISION_AUSENTE')
  if (neto === null || neto <= 0) blockers.push('LIQUIDACION_NETO_AUSENTE')
  const deductions = sumCents([intereses, comision, iva])
  if (deduccion !== null && deductions !== null && deduccion !== deductions) blockers.push('LIQUIDACION_DEDUCCION_DECLARADA_NO_CUADRA')
  const netCalculated = nominal !== null && deductions !== null ? nominal - deductions : null
  if (netCalculated === null || neto === null || netCalculated !== neto) blockers.push('LIQUIDACION_CIERRE_NO_EXACTO')

  if (!evidence.lineas.length) blockers.push('LIQUIDACION_SIN_LINEAS')
  const invoiceIds = new Set<string>()
  const lineNominals: number[] = []
  for (const line of evidence.lineas) {
    if (!line.facturaEmitidaId || !line.numeroFactura) blockers.push('LIQUIDACION_FACTURA_IDENTIDAD_AUSENTE')
    if (invoiceIds.has(line.facturaEmitidaId)) blockers.push('LIQUIDACION_FACTURA_REPETIDA')
    invoiceIds.add(line.facturaEmitidaId)
    const nominalLine = safeCents(line.nominalCentimos)
    if (nominalLine === null || nominalLine <= 0) blockers.push('LIQUIDACION_NOMINAL_LINEA_AUSENTE')
    else lineNominals.push(nominalLine)
    if (!isCivilDay(line.fechaEmision)) blockers.push('LIQUIDACION_FECHA_EMISION_AUSENTE_O_INVALIDA')
    if (line.fechaVencimiento !== null && !isCivilDay(line.fechaVencimiento)) blockers.push('LIQUIDACION_FECHA_VENCIMIENTO_INVALIDA')
  }
  const nominalLineas = sumCents(lineNominals)
  if (nominal === null || nominalLineas === null || nominalLineas !== nominal) blockers.push('LIQUIDACION_NOMINALES_LINEAS_NO_CUADRAN')
  if (evidence.banco === 'BBVA') {
    const lineIntereses = sumCents(evidence.lineas.map(line => safeCents(line.interesesExplicitosCentimos)))
    const lineComision = sumCents(evidence.lineas.map(line => safeCents(line.comisionExplicitaCentimos)))
    if (lineIntereses === null || lineIntereses !== intereses) blockers.push('LIQUIDACION_INTERESES_LINEAS_NO_CUADRAN')
    if (lineComision === null || lineComision !== comision) blockers.push('LIQUIDACION_COMISION_LINEAS_NO_CUADRAN')
  }

  const calculatedHash = hashConfirmingLiquidationEvidence({ ...evidence, sourceHash: undefined } as Omit<ConfirmingLiquidationEvidence, 'sourceHash'>)
  if (!validHash(evidence.sourceHash) || evidence.sourceHash !== calculatedHash) blockers.push('LIQUIDACION_HASH_INVALIDO')
  const sorted = uniqueSorted(blockers)
  return {
    bloqueos: sorted,
    sourceHashCalculado: calculatedHash,
    nominalLineasCentimos: nominalLineas,
    deduccionesCentimos: deductions,
    netoCalculadoCentimos: netCalculated,
    cuadroExacto: sorted.length === 0,
  }
}
