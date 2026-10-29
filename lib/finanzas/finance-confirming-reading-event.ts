import { createHash } from 'node:crypto'

/**
 * Hook de cambio de contenido para fuentes confirming ya inventariadas.
 * No enumera Graph, no descarga, no invoca OCR y no confirma B4. El integrador
 * aporta bytes/control documental y deduplica `dedupeKey` antes de ejecutar el
 * parser existente. Los resultados del parser sólo alimentan una propuesta.
 */
export const FINANCE_CONFIRMING_READING_EVENT_SCHEMA = 'FINANCE_CONFIRMING_READING_EVENT_V1' as const

export type FinanceConfirmingReadingContentKind = 'ARCHIVO_NUEVO' | 'CONTENIDO_CAMBIADO'
export type FinanceConfirmingReadingDocumentKind = 'BBVA_PDF' | 'CAIXA_PDF' | 'CAIXA_XLS' | 'OTRO'

export type FinanceConfirmingReadingContentEvent = Readonly<{
  kind: FinanceConfirmingReadingContentKind
  archivoPrivadoId: string
  versionContenido: string
  hashBinario: string
  tipoDetectado: FinanceConfirmingReadingDocumentKind
  /** Hash que ya fue procesado para esta misma versión, si existe. */
  hashProcesadoAnterior: string | null
}>

export type FinanceConfirmingReadingParsePlan = Readonly<{
  schema: typeof FINANCE_CONFIRMING_READING_EVENT_SCHEMA
  kind: 'EJECUTAR_PARSER_PARA_PROPUESTA' | 'SIN_CAMBIO' | 'REVISAR_LECTURA'
  dedupeKey: string
  archivoPrivadoId: string
  /** Versión y huella del contenido privado que originó este plan. */
  versionContenido: string
  hashBinario: string
  parser: 'C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS' | 'C11_CAIXA_PDF' | 'C11_CAIXA_XLS' | null
  /** Caixa sólo será propuesta final cuando C11 reciba pareja PDF/XLS explícita. */
  requiereParejaCaixaExplicita: boolean
  propuestaAutomatica: true
  confirmarB4Automaticamente: false
  persistirResultado: false
  motivo: 'TIPO_NO_CLASIFICADO' | 'CONTENIDO_YA_PROCESADO' | null
}>

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function parserFor(kind: FinanceConfirmingReadingDocumentKind): FinanceConfirmingReadingParsePlan['parser'] {
  if (kind === 'BBVA_PDF') return 'C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS'
  if (kind === 'CAIXA_PDF') return 'C11_CAIXA_PDF'
  if (kind === 'CAIXA_XLS') return 'C11_CAIXA_XLS'
  return null
}

/**
 * Determina la unidad idempotente de parseo. Repetir el mismo evento conserva
 * la misma clave, por lo que el orquestador puede ignorarlo sin escribir datos.
 */
export function planFinanceConfirmingReadingParser(event: FinanceConfirmingReadingContentEvent): FinanceConfirmingReadingParsePlan {
  const parser = parserFor(event.tipoDetectado)
  const safeHash = validHash(event.hashBinario) ? event.hashBinario : 'hash-invalido'
  const dedupeKey = hash([FINANCE_CONFIRMING_READING_EVENT_SCHEMA, event.archivoPrivadoId, event.versionContenido, safeHash, event.tipoDetectado].join(':'))
  const base = {
    schema: FINANCE_CONFIRMING_READING_EVENT_SCHEMA,
    dedupeKey,
    archivoPrivadoId: event.archivoPrivadoId,
    versionContenido: event.versionContenido,
    hashBinario: event.hashBinario,
    parser,
    requiereParejaCaixaExplicita: event.tipoDetectado === 'CAIXA_PDF' || event.tipoDetectado === 'CAIXA_XLS',
    propuestaAutomatica: true,
    confirmarB4Automaticamente: false,
    persistirResultado: false,
  } as const
  if (!event.archivoPrivadoId || !event.versionContenido || !validHash(event.hashBinario) || parser === null) {
    return { ...base, kind: 'REVISAR_LECTURA', motivo: 'TIPO_NO_CLASIFICADO' }
  }
  if (event.hashProcesadoAnterior === event.hashBinario) {
    return { ...base, kind: 'SIN_CAMBIO', motivo: 'CONTENIDO_YA_PROCESADO' }
  }
  return { ...base, kind: 'EJECUTAR_PARSER_PARA_PROPUESTA', motivo: null }
}

/**
 * Adaptador de ejecución opcional para un parser inyectado sobre bytes ya
 * controlados por el integrador. No hay Graph/OCR ni persistencia aquí; incluso
 * una lectura correcta devuelve sólo un resultado de propuesta para revisión.
 */
export async function runFinanceConfirmingReadingParserProposal<T>(input: Readonly<{
  plan: FinanceConfirmingReadingParsePlan
  parseControlledContent: () => Promise<T>
}>): Promise<Readonly<{
  plan: FinanceConfirmingReadingParsePlan
  parsed: T | null
  propuestaAutomatica: true
  confirmarB4Automaticamente: false
  persistirResultado: false
}>> {
  if (input.plan.kind !== 'EJECUTAR_PARSER_PARA_PROPUESTA') {
    return { plan: input.plan, parsed: null, propuestaAutomatica: true, confirmarB4Automaticamente: false, persistirResultado: false }
  }
  return { plan: input.plan, parsed: await input.parseControlledContent(), propuestaAutomatica: true, confirmarB4Automaticamente: false, persistirResultado: false }
}
