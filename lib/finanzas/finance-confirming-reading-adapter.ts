import { createHash } from 'node:crypto'
import { parseBBVACesionCreditos, parseCaixaBankPDF, parseCaixaBankXLS, type ConfirmingParseResult } from './confirming-parser'
import { type FinanceConfirmingReadingParsePlan } from './finance-confirming-reading-event'

/**
 * Adaptador local de bytes para el hook confirming. El integrador obtiene los
 * bytes por su canal ya protegido; este módulo no conoce Graph, rutas, cuentas
 * internas ni Prisma. Sólo acepta un plan clasificado y nunca persiste/confirmar
 * B4. El puerto opcional existe exclusivamente para tests de texto/fixtures.
 */
export class FinanceConfirmingReadingAdapterError extends Error {
  constructor(public readonly code: 'PLAN_NO_EJECUTABLE' | 'FUENTE_CAMBIADA' | 'NOMBRE_NO_SEGURO', message: string) {
    super(message)
    this.name = 'FinanceConfirmingReadingAdapterError'
  }
}

export type FinanceConfirmingReadingParserPort = Readonly<{
  parseBBVA?: (content: Buffer, originalName: string) => Promise<ConfirmingParseResult>
  parseCaixaPdf?: (content: Buffer, originalName: string) => Promise<ConfirmingParseResult>
  parseCaixaXls?: (content: Buffer, originalName: string) => ConfirmingParseResult
}>

export type FinanceConfirmingReadingParsedProposal = Readonly<{
  kind: 'RESULTADO_PARSER_PROPUESTO'
  parse: ConfirmingParseResult
  propuestaAutomatica: true
  confirmarB4Automaticamente: false
  persistirResultado: false
  requiereParejaCaixaExplicita: boolean
}>

function safeName(value: string): boolean {
  return !!value && value.length <= 240 && !/[\\/\0\r\n]/.test(value)
}

function hash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/**
 * Normalización exclusiva para cotejo interno de una cuenta declarada literalmente
 * por el PDF. No valida ni revela una cuenta interna: rechaza controles y deja
 * una longitud conservadora de IBAN para que el repositorio haga igualdad exacta.
 */
export function normalizeDeclaredConfirmingIban(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').replace(/[\s\-]/g, '').toUpperCase()
  return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(normalized) ? normalized : null
}

/**
 * Ejecuta exclusivamente el parser indicado en el plan para bytes cuyo hash
 * coincide con el evento. BBVA reutiliza su extractor de página 2 con columnas
 * físicas desplazadas; Caixa conserva PDF y XLS separados hasta que C11 reciba
 * una pareja declarada. Ningún resultado se interpreta como confirmación.
 */
export async function parseFinanceConfirmingReadingControlledContent(input: Readonly<{
  plan: FinanceConfirmingReadingParsePlan
  contenidoControlado: Buffer
  nombreOriginal: string
  parserPort?: FinanceConfirmingReadingParserPort
}>): Promise<FinanceConfirmingReadingParsedProposal | null> {
  if (input.plan.kind !== 'EJECUTAR_PARSER_PARA_PROPUESTA' || !input.plan.parser) {
    throw new FinanceConfirmingReadingAdapterError('PLAN_NO_EJECUTABLE', 'El plan de lectura no autoriza procesar contenido.')
  }
  if (!safeName(input.nombreOriginal)) {
    throw new FinanceConfirmingReadingAdapterError('NOMBRE_NO_SEGURO', 'El nombre controlado del archivo no es válido.')
  }
  if (!input.plan.dedupeKey || !input.plan.versionContenido || !/^[a-f0-9]{64}$/.test(input.plan.hashBinario) || !input.contenidoControlado.length) {
    throw new FinanceConfirmingReadingAdapterError('FUENTE_CAMBIADA', 'Falta contenido controlado vigente para la lectura.')
  }
  const actualHash = hash(input.contenidoControlado)
  if (actualHash !== input.plan.hashBinario) {
    throw new FinanceConfirmingReadingAdapterError('FUENTE_CAMBIADA', 'El contenido controlado cambió desde el evento de lectura.')
  }
  let parse: ConfirmingParseResult
  if (input.plan.parser === 'C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS') {
    parse = input.parserPort?.parseBBVA
      ? await input.parserPort.parseBBVA(input.contenidoControlado, input.nombreOriginal)
      : await parseBBVACesionCreditos(input.contenidoControlado, input.nombreOriginal)
  } else if (input.plan.parser === 'C11_CAIXA_PDF') {
    parse = input.parserPort?.parseCaixaPdf
      ? await input.parserPort.parseCaixaPdf(input.contenidoControlado, input.nombreOriginal)
      : await parseCaixaBankPDF(input.contenidoControlado, input.nombreOriginal)
  } else {
    parse = input.parserPort?.parseCaixaXls
      ? input.parserPort.parseCaixaXls(input.contenidoControlado, input.nombreOriginal)
      : parseCaixaBankXLS(input.contenidoControlado, input.nombreOriginal)
  }
  if (parse.sourceHash !== actualHash) {
    throw new FinanceConfirmingReadingAdapterError('FUENTE_CAMBIADA', 'La huella del resultado no coincide con el contenido controlado.')
  }
  return {
    kind: 'RESULTADO_PARSER_PROPUESTO', parse, propuestaAutomatica: true,
    confirmarB4Automaticamente: false, persistirResultado: false,
    requiereParejaCaixaExplicita: input.plan.requiereParejaCaixaExplicita,
  }
}
