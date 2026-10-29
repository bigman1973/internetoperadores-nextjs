import {
  buildConfirmingLiquidationCandidates,
  type BuildConfirmingLiquidationCandidatesInput,
  type ConfirmingLiquidationCandidate,
} from './confirming-liquidation-candidate-core'
import {
  assessConfirmingLiquidationEvidence,
  type ConfirmingLiquidationEvidence,
  type ConfirmingLiquidationSourceDocument,
} from './confirming-liquidation-core'

/**
 * Proyección aislada para «Conciliar > Revisar lectura».
 *
 * Recibe sólo evidencia C11 previamente parseada desde un archivo controlado.
 * No abre ficheros, no busca en Graph/OneDrive, no usa OCR, no persiste y nunca
 * confirma B4. Una lectura exacta es siempre una PROPUESTA humana, nunca una
 * conciliación realizada por este módulo.
 */
export const FINANCE_CONFIRMING_READING_SCHEMA = 'FINANCE_CONFIRMING_READING_V1' as const

export type FinanceConfirmingReadingSourceRole = 'LIQUIDACION_PDF' | 'DETALLE_FACTURAS_XLS'

export type FinanceConfirmingReadingControlledSource = Readonly<{
  /** Identificador opaco del archivo privado; no es ruta ni localizador externo. */
  archivoPrivadoId: string
  /** Debe corresponder a una fuente declarada por C11. */
  evidenciaDocumentoId: string
  rol: FinanceConfirmingReadingSourceRole
  hashBinario: string
  versionContenido: string
}>

export type FinanceConfirmingReadingReason =
  | 'ARCHIVO_PRIVADO_NO_CONTROLADO'
  | 'ARCHIVO_PRIVADO_DUPLICADO'
  | 'PAREJA_CAIXA_PDF_XLS_INCOMPLETA'
  | 'PAREJA_CAIXA_PDF_XLS_NO_DECLARADA'
  | 'EVIDENCIA_C11_INCOMPLETA'
  | 'CUADRE_C11_NO_EXACTO'
  | 'MOVIMIENTO_AMBIGUO'
  | 'CUENTA_DEPOSITARIA_NO_COINCIDE'
  | 'NETO_BANCARIO_NO_COINCIDE'
  | 'MOVIMIENTO_NO_DISPONIBLE'
  | 'LECTURA_NO_APTA_PARA_PROPUESTA'

export type FinanceConfirmingReadingReviewItem = Readonly<{
  kind: 'REVISAR_LECTURA'
  liquidacionId: string
  movimientoId: string | null
  archivoPrivadoId: string
  motivo: FinanceConfirmingReadingReason
  /** Sólo una referencia opaca; la apertura real sigue protegida por Conciliar. */
  fuenteVersion: string
  propuestaAutomatica: false
  confirmarB4Automaticamente: false
}>

export type FinanceConfirmingReadingProposal = Readonly<{
  kind: 'PROPUESTA_CONFIRMACION_HUMANA'
  liquidacionId: string
  movimientoId: string
  sourceHash: string
  /** Este panel nunca presenta verde parcial ni ejecuta B4. */
  estadoVisual: 'PROPUESTA_PENDIENTE_REVISION_HUMANA'
  propuestaAutomatica: true
  confirmarB4Automaticamente: false
  requiereConfirmacionHumana: true
  noEscrituras: true
}>

export type FinanceConfirmingReadingResult = Readonly<{
  schema: typeof FINANCE_CONFIRMING_READING_SCHEMA
  automaticas: false
  accionExterna: 'NINGUNA'
  confirmacionesB4Automaticas: false
  propuestas: readonly FinanceConfirmingReadingProposal[]
  revisarLectura: readonly FinanceConfirmingReadingReviewItem[]
}>

type CandidateInput = Omit<BuildConfirmingLiquidationCandidatesInput, 'liquidaciones'>

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function sourceRole(role: ConfirmingLiquidationSourceDocument['rol']): FinanceConfirmingReadingSourceRole | null {
  return role === 'LIQUIDACION_PDF' || role === 'DETALLE_FACTURAS_XLS' ? role : null
}

function sourceProblems(
  evidence: ConfirmingLiquidationEvidence,
  sources: readonly FinanceConfirmingReadingControlledSource[],
): FinanceConfirmingReadingReason[] {
  const reasons: FinanceConfirmingReadingReason[] = []
  const expected = evidence.documentos.flatMap((document) => {
    const rol = sourceRole(document.rol)
    return rol ? [{ id: document.id, rol, hash: document.hashBinario }] : []
  })
  const seen = new Set<string>()
  for (const source of sources) {
    const key = `${source.evidenciaDocumentoId}:${source.rol}`
    if (seen.has(key)) reasons.push('ARCHIVO_PRIVADO_DUPLICADO')
    seen.add(key)
    const match = expected.find((item) => item.id === source.evidenciaDocumentoId && item.rol === source.rol && item.hash === source.hashBinario)
    if (!match || !source.archivoPrivadoId || !source.versionContenido || !isHash(source.hashBinario)) reasons.push('ARCHIVO_PRIVADO_NO_CONTROLADO')
  }
  if (sources.length !== expected.length || expected.some((item) => !sources.some((source) => source.evidenciaDocumentoId === item.id && source.rol === item.rol && source.hashBinario === item.hash))) {
    reasons.push('ARCHIVO_PRIVADO_NO_CONTROLADO')
  }
  const pdf = sources.filter((source) => source.rol === 'LIQUIDACION_PDF')
  const xls = sources.filter((source) => source.rol === 'DETALLE_FACTURAS_XLS')
  if (evidence.banco === 'CAIXABANK' && (pdf.length !== 1 || xls.length !== 1)) reasons.push('PAREJA_CAIXA_PDF_XLS_INCOMPLETA')
  // La asociación se recibe ya declarada en C11: no se deduce por fecha, nombre,
  // subcarpeta ni orden de llegada.
  if (evidence.banco === 'CAIXABANK' && (pdf.length === 1 && xls.length === 1) && evidence.documentos.length !== 2) reasons.push('PAREJA_CAIXA_PDF_XLS_NO_DECLARADA')
  return uniqueSorted(reasons)
}

function primaryPrivateFile(sources: readonly FinanceConfirmingReadingControlledSource[]): FinanceConfirmingReadingControlledSource {
  const selected = sources.find((source) => source.rol === 'LIQUIDACION_PDF') ?? sources[0]
  return selected ?? { archivoPrivadoId: 'archivo-privado-no-disponible', evidenciaDocumentoId: '', rol: 'LIQUIDACION_PDF', hashBinario: '', versionContenido: 'sin-version' }
}

function reasonForCandidate(candidate: ConfirmingLiquidationCandidate): FinanceConfirmingReadingReason {
  if (candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_AMBIGUO')) return 'MOVIMIENTO_AMBIGUO'
  if (candidate.bloqueos.includes('LIQUIDACION_CUENTA_DEPOSITARIA_NO_COINCIDE')) return 'CUENTA_DEPOSITARIA_NO_COINCIDE'
  if (candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_NETO_NO_COINCIDE')) return 'NETO_BANCARIO_NO_COINCIDE'
  if (candidate.bloqueos.includes('LIQUIDACION_MOVIMIENTO_B4_NO_DISPONIBLE')) return 'MOVIMIENTO_NO_DISPONIBLE'
  return 'LECTURA_NO_APTA_PARA_PROPUESTA'
}

/**
 * Convierte evidencia C11 y movimientos ya autorizados por Conciliar en una
 * bandeja de lectura. El caller debe enviar sólo los movimientos dentro de su
 * ámbito; este módulo no amplía permisos ni realiza una búsqueda financiera.
 */
export function buildFinanceConfirmingReading(input: Readonly<{
  evidence: ConfirmingLiquidationEvidence
  fuentesControladas: readonly FinanceConfirmingReadingControlledSource[]
  candidatos: CandidateInput
}>): FinanceConfirmingReadingResult {
  const assessment = assessConfirmingLiquidationEvidence(input.evidence)
  const file = primaryPrivateFile(input.fuentesControladas)
  const review: FinanceConfirmingReadingReviewItem[] = []
  const sourceIssues = sourceProblems(input.evidence, input.fuentesControladas)
  for (const motivo of sourceIssues) {
    review.push({ kind: 'REVISAR_LECTURA', liquidacionId: input.evidence.id, movimientoId: null, archivoPrivadoId: file.archivoPrivadoId, motivo, fuenteVersion: file.versionContenido, propuestaAutomatica: false, confirmarB4Automaticamente: false })
  }
  if (assessment.bloqueos.length) {
    review.push({
      kind: 'REVISAR_LECTURA', liquidacionId: input.evidence.id, movimientoId: null, archivoPrivadoId: file.archivoPrivadoId,
      motivo: assessment.cuadroExacto ? 'EVIDENCIA_C11_INCOMPLETA' : 'CUADRE_C11_NO_EXACTO', fuenteVersion: file.versionContenido,
      propuestaAutomatica: false, confirmarB4Automaticamente: false,
    })
  }
  // Ninguna mitad de una pareja Caixa puede llegar a verde: se deja en bandeja
  // hasta disponer de la pareja explícita y validada por C11.
  if (review.length) {
    return { schema: FINANCE_CONFIRMING_READING_SCHEMA, automaticas: false, accionExterna: 'NINGUNA', confirmacionesB4Automaticas: false, propuestas: [], revisarLectura: review }
  }

  const candidates = buildConfirmingLiquidationCandidates({ ...input.candidatos, liquidaciones: [input.evidence] }).candidates
  const proposals: FinanceConfirmingReadingProposal[] = []
  for (const candidate of candidates) {
    if (candidate.estado === 'LISTO_PARA_CONFIRMACION_B4') {
      proposals.push({
        kind: 'PROPUESTA_CONFIRMACION_HUMANA', liquidacionId: candidate.liquidacionId, movimientoId: candidate.movimientoId,
        sourceHash: candidate.sourceHash, estadoVisual: 'PROPUESTA_PENDIENTE_REVISION_HUMANA', propuestaAutomatica: true,
        confirmarB4Automaticamente: false, requiereConfirmacionHumana: true, noEscrituras: true,
      })
    } else {
      review.push({ kind: 'REVISAR_LECTURA', liquidacionId: candidate.liquidacionId, movimientoId: candidate.movimientoId, archivoPrivadoId: file.archivoPrivadoId, motivo: reasonForCandidate(candidate), fuenteVersion: file.versionContenido, propuestaAutomatica: false, confirmarB4Automaticamente: false })
    }
  }
  return {
    schema: FINANCE_CONFIRMING_READING_SCHEMA, automaticas: false, accionExterna: 'NINGUNA', confirmacionesB4Automaticas: false,
    propuestas: proposals.sort((a, b) => a.movimientoId.localeCompare(b.movimientoId)),
    revisarLectura: review.sort((a, b) => `${a.movimientoId ?? ''}:${a.motivo}`.localeCompare(`${b.movimientoId ?? ''}:${b.motivo}`)),
  }
}
