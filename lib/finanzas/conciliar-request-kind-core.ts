/**
 * Clasificación pura de los tipos documentales que no deben convertirse en una
 * propuesta ficticia de factura. No importa Prisma, HTTP, Graph, B4 ni rutas.
 *
 * La decisión sólo describe cómo presentar o pedir revisión. Una fila verde de
 * este módulo tampoco autoriza B4: toda confirmación continúa requiriendo la
 * revalidación, auditoría, ACL y confirmación humana de la acción existente.
 */

export const CONCILIAR_REQUEST_KINDS = [
  'GASTO_BANCO',
  'NOMINA_PERSONAL',
  'IMPUESTOS',
  'PRESTAMO',
  'TARJETA',
  'PROVEEDOR_DOCUMENTADO',
  'DESCONOCIDO',
] as const

export type ConciliarRequestKind = typeof CONCILIAR_REQUEST_KINDS[number]
export type ConciliarRequestColor = 'VERDE' | 'AMBAR' | 'ROJO'
export type ConciliarRequestGroup = 'GASTOS_BANCO' | 'NOMINAS' | 'IMPUESTOS' | 'PRESTAMOS' | 'TARJETA' | 'FACTURA_RECIBIDA' | null
export type ConciliarRequestAction = 'NO_PEDIR' | 'PEDIR_JUSTIFICANTE_MODELO' | 'PEDIR_CUADRO_AMORTIZACION' | 'PEDIR_TICKET_O_FACTURA' | 'PEDIR_JUSTIFICANTE_GENERAL'
export type ConciliarPayrollReview = 'NOT_APPLICABLE' | 'EXACT_PERSONAL' | 'MISSING_PERSONAL' | 'AMBIGUOUS_PERSONAL'
export type ConciliarProviderReview = 'NONE' | 'EXACT_DOCUMENT_REFERENCE' | 'CANDIDATE_WITHOUT_REFERENCE' | 'NUMBER_CONFLICT' | 'REFERENCE_MISSING' | 'AMBIGUOUS'

export type ConciliarRequestKindInput = Readonly<{
  /** Sólo se clasifican cargos de pago; otros signos permanecen a cargo del flujo de cobros. */
  importeCentimos: unknown
  concepto?: unknown
  referencia?: unknown
  infoAdicional?: unknown
  tercero?: unknown
  /** Evidencia ya obtenida de Personal; este núcleo no busca ni selecciona nóminas. */
  payrollReview?: ConciliarPayrollReview
  /** Evidencia ya obtenida por el asignador de proveedor; nunca se inventa una candidata. */
  providerReview?: ConciliarProviderReview
  /** Se muestra únicamente para una candidata que el llamador ya obtuvo de forma controlada. */
  providerCandidateReference?: unknown
  /** El adaptador puede aportar instrumento bancario ya validado; no se deduce de un nombre de comercio. */
  cardInstrument?: boolean
}>

export type ConciliarRequestKindDecision = Readonly<{
  kind: ConciliarRequestKind
  color: ConciliarRequestColor
  group: ConciliarRequestGroup
  reasonCode:
    | 'GASTO_BANCO_IDENTIFICADO'
    | 'NOMINA_PERSONAL_EXACTA'
    | 'NOMINA_PERSONAL_FALTANTE'
    | 'NOMINA_PERSONAL_AMBIGUA'
    | 'IMPUESTO_SIN_JUSTIFICANTE'
    | 'PRESTAMO_SIN_CUADRO'
    | 'TARJETA_SIN_TICKET'
    | 'PROVEEDOR_REFERENCIA_EXACTA'
    | 'PROVEEDOR_SIN_REFERENCIA'
    | 'PROVEEDOR_NUMERO_NO_COINCIDE'
    | 'PROVEEDOR_REFERENCIA_SIN_FACTURA'
    | 'PROVEEDOR_AMBIGUO'
    | 'JUSTIFICANTE_GENERAL_REQUERIDO'
  motive: string
  requestAction: ConciliarRequestAction
  /** Sólo describe la cola: no crea un pedido, correo, aviso ni escritura. */
  isParaPedir: boolean
  /** El módulo no otorga autorización de B4 ni de ningún otro efecto financiero. */
  automaticConfirmationForbidden: true
  /** Incluso con verde se conserva confirmación humana separada. */
  requiresHumanConfirmation: true
  /** La referencia es sólo una candidata ya leída por el adaptador, nunca una invención. */
  suggestedDocumentReference: string | null
}>

function safeText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1_200)
    : ''
}

/** Normalización sólo para comparar texto bancario; conserva el dato fuente fuera de este módulo. */
export function normalizeConciliarRequestText(value: unknown): string {
  return safeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .toLocaleUpperCase('es-ES')
}

function bankText(input: ConciliarRequestKindInput): string {
  return [input.concepto, input.referencia, input.infoAdicional, input.tercero]
    .map(normalizeConciliarRequestText)
    .filter(Boolean)
    .join(' ')
}

function validNegativeCents(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= -2_147_483_648 && value < 0
}

function knownPayrollReview(value: unknown): ConciliarPayrollReview {
  return value === 'EXACT_PERSONAL' || value === 'MISSING_PERSONAL' || value === 'AMBIGUOUS_PERSONAL' || value === 'NOT_APPLICABLE'
    ? value
    : 'NOT_APPLICABLE'
}

function knownProviderReview(value: unknown): ConciliarProviderReview {
  return value === 'EXACT_DOCUMENT_REFERENCE' || value === 'CANDIDATE_WITHOUT_REFERENCE' || value === 'NUMBER_CONFLICT' || value === 'REFERENCE_MISSING' || value === 'AMBIGUOUS' || value === 'NONE'
    ? value
    : 'NONE'
}

function candidateReference(value: unknown): string | null {
  const valueText = safeText(value)
  return valueText.length > 0 && valueText.length <= 240 ? valueText : null
}

function hasPayrollCue(text: string): boolean {
  return /\b(?:NOMINAS?|PAYROLL)\b/u.test(text)
}

function hasTaxCue(text: string): boolean {
  return /\b(?:AEAT|HACIENDA|TGSS|SEGURIDAD\s+SOCIAL|AUTOLIQUIDACION|IMPUESTO(?:S)?|MODELO\s*\d{2,3}|IVA|IRPF|I\.S\.)\b/u.test(text)
}

function hasLoanCue(text: string): boolean {
  return /\b(?:PRESTAMO|PRESTEC|AMORTIZACION|LEASING|CUOTA\s+(?:DE\s+)?CREDITO)\b/u.test(text)
}

function hasCardCue(text: string, cardInstrument: boolean | undefined): boolean {
  return cardInstrument === true || /\b(?:TARJETA|CARD|VISA|MASTERCARD|AMEX|TPV|POS|AMAZON|UBER)\b/u.test(text)
}

function isExplicitZeroCommission(text: string): boolean {
  return /\b(?:COMISION(?:ES)?|GASTOS?\s+DE\s+DEVOLUCION|LIQUIDACION\s+POR\s+EMISION)\s*(?:DE|POR)?\s*[:=]?\s*0(?:[,.]0+)?(?![\d,.])\b/u.test(text)
}

/**
 * Sólo reconoce gastos bancarios explícitos. Excluye tarjeta, préstamo y una
 * comisión textual a cero: un texto ambiguo no puede ocultar un ticket ni
 * transformar un cargo de tarjeta en una comisión verde.
 */
export function isExplicitConciliarBankFee(input: Readonly<{ amountCents: unknown; text: unknown; cardInstrument?: boolean }>): boolean {
  if (!validNegativeCents(input.amountCents)) return false
  const text = normalizeConciliarRequestText(input.text)
  if (!text || hasCardCue(text, input.cardInstrument) || hasLoanCue(text) || isExplicitZeroCommission(text)) return false
  return /\b(?:LIQUIDACION\s+POR\s+EMISION|COMISION(?:ES)?|GASTOS?\s+DEVOLUCIONES?\s+DE\s+RECIBOS?|GASTOS?\s+DE\s+DEVOLUCION(?:ES)?|CUOTA(?:S)?\s+(?:DE\s+)?MANTENIMIENTO)\b/u.test(text)
}

function decision(input: Readonly<{
  kind: ConciliarRequestKind
  color: ConciliarRequestColor
  group: ConciliarRequestGroup
  reasonCode: ConciliarRequestKindDecision['reasonCode']
  motive: string
  requestAction: ConciliarRequestAction
  suggestedDocumentReference?: string | null
}>): ConciliarRequestKindDecision {
  const isParaPedir = input.requestAction !== 'NO_PEDIR'
  return Object.freeze({
    kind: input.kind,
    color: input.color,
    group: input.group,
    reasonCode: input.reasonCode,
    motive: input.motive,
    requestAction: input.requestAction,
    isParaPedir,
    automaticConfirmationForbidden: true as const,
    requiresHumanConfirmation: true as const,
    suggestedDocumentReference: input.suggestedDocumentReference ?? null,
  })
}

function payrollDecision(review: ConciliarPayrollReview): ConciliarRequestKindDecision {
  if (review === 'EXACT_PERSONAL') {
    return decision({
      kind: 'NOMINA_PERSONAL', color: 'VERDE', group: 'NOMINAS', reasonCode: 'NOMINA_PERSONAL_EXACTA',
      motive: 'La nómina de Personal coincide; requiere confirmación humana antes de conciliar.', requestAction: 'NO_PEDIR',
    })
  }
  if (review === 'AMBIGUOUS_PERSONAL') {
    return decision({
      kind: 'NOMINA_PERSONAL', color: 'AMBAR', group: 'NOMINAS', reasonCode: 'NOMINA_PERSONAL_AMBIGUA',
      motive: 'Hay varias nóminas de Personal posibles; revísalas antes de decidir.', requestAction: 'NO_PEDIR',
    })
  }
  return decision({
    kind: 'NOMINA_PERSONAL', color: 'AMBAR', group: 'NOMINAS', reasonCode: 'NOMINA_PERSONAL_FALTANTE',
    motive: 'No se ha encontrado una nómina de Personal que cierre con el movimiento; revísalo antes de decidir.', requestAction: 'NO_PEDIR',
  })
}

function providerDecision(review: Exclude<ConciliarProviderReview, 'NONE'>, reference: string | null): ConciliarRequestKindDecision {
  if (review === 'EXACT_DOCUMENT_REFERENCE' && reference !== null) {
    return decision({
      kind: 'PROVEEDOR_DOCUMENTADO', color: 'VERDE', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_REFERENCIA_EXACTA',
      motive: 'La referencia documental coincide; requiere confirmación humana antes de conciliar.', requestAction: 'NO_PEDIR', suggestedDocumentReference: reference,
    })
  }
  if (review === 'NUMBER_CONFLICT') {
    return decision({
      kind: 'PROVEEDOR_DOCUMENTADO', color: 'AMBAR', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_NUMERO_NO_COINCIDE',
      motive: 'El número citado no coincide con la factura candidata; revísalo antes de confirmar.', requestAction: 'NO_PEDIR', suggestedDocumentReference: reference,
    })
  }
  if (review === 'REFERENCE_MISSING') {
    return decision({
      kind: 'PROVEEDOR_DOCUMENTADO', color: 'ROJO', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_REFERENCIA_SIN_FACTURA',
      motive: 'El banco cita una factura que no está disponible para este cargo.', requestAction: 'PEDIR_JUSTIFICANTE_GENERAL', suggestedDocumentReference: null,
    })
  }
  if (review === 'AMBIGUOUS') {
    return decision({
      kind: 'PROVEEDOR_DOCUMENTADO', color: 'AMBAR', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_AMBIGUO',
      motive: 'Hay más de una factura candidata; no se selecciona ninguna automáticamente.', requestAction: 'NO_PEDIR', suggestedDocumentReference: null,
    })
  }
  return decision({
    kind: 'PROVEEDOR_DOCUMENTADO', color: 'AMBAR', group: 'FACTURA_RECIBIDA', reasonCode: 'PROVEEDOR_SIN_REFERENCIA',
    motive: 'Hay una factura candidata, pero el banco no cita su número; revísala antes de confirmar.', requestAction: 'NO_PEDIR', suggestedDocumentReference: reference,
  })
}

/**
 * Clasifica un cargo ya normalizado por el adaptador. Devuelve `null` ante un
 * importe inválido o no negativo para que el llamador mantenga su flujo de
 * cobros; para todo cargo válido sin evidencia específica retorna una petición
 * roja de justificante general, nunca una afirmación de "falta la factura".
 */
export function classifyConciliarRequestKind(input: ConciliarRequestKindInput): ConciliarRequestKindDecision | null {
  if (!input || !validNegativeCents(input.importeCentimos)) return null
  const text = bankText(input)
  const payroll = knownPayrollReview(input.payrollReview)
  const provider = knownProviderReview(input.providerReview)
  const reference = candidateReference(input.providerCandidateReference)

  if (isExplicitConciliarBankFee({ amountCents: input.importeCentimos, text, cardInstrument: input.cardInstrument })) {
    return decision({
      kind: 'GASTO_BANCO', color: 'VERDE', group: 'GASTOS_BANCO', reasonCode: 'GASTO_BANCO_IDENTIFICADO',
      motive: 'Cargo bancario identificado; no necesita factura y requiere confirmación humana.', requestAction: 'NO_PEDIR',
    })
  }
  if (payroll !== 'NOT_APPLICABLE' || hasPayrollCue(text)) return payrollDecision(payroll)
  if (hasTaxCue(text)) {
    return decision({
      kind: 'IMPUESTOS', color: 'ROJO', group: 'IMPUESTOS', reasonCode: 'IMPUESTO_SIN_JUSTIFICANTE',
      motive: 'Pedir justificante del modelo.', requestAction: 'PEDIR_JUSTIFICANTE_MODELO',
    })
  }
  if (hasLoanCue(text)) {
    return decision({
      kind: 'PRESTAMO', color: 'ROJO', group: 'PRESTAMOS', reasonCode: 'PRESTAMO_SIN_CUADRO',
      motive: 'Pedir cuadro de amortización.', requestAction: 'PEDIR_CUADRO_AMORTIZACION',
    })
  }
  if (provider !== 'NONE') return providerDecision(provider, reference)
  if (hasCardCue(text, input.cardInstrument)) {
    return decision({
      kind: 'TARJETA', color: 'ROJO', group: 'TARJETA', reasonCode: 'TARJETA_SIN_TICKET',
      motive: 'Pedir ticket o factura.', requestAction: 'PEDIR_TICKET_O_FACTURA',
    })
  }
  return decision({
    kind: 'DESCONOCIDO', color: 'ROJO', group: null, reasonCode: 'JUSTIFICANTE_GENERAL_REQUERIDO',
    motive: 'Pedir justificante general del movimiento.', requestAction: 'PEDIR_JUSTIFICANTE_GENERAL',
  })
}
