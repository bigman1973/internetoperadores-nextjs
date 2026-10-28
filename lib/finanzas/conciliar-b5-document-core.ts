/*
 * C3 B5 review core.  This module is deliberately independent from Prisma/Next:
 * the caller must derive every field from a locked, server-side B5/B4 snapshot.
 * It accepts neither a browser document identifier nor a file locator.
 */

export type ConciliarB5TicketCandidate = Readonly<{
  adjuntoB5Id: string
  movimientoId: string
  gastoId: string
  documentoConciliableId: string
  uploadCompleto: boolean
  documentoActivo: boolean
  gastoRevalidable: boolean
  archivoControlado: boolean
  fechaDocumento: string | null
  /** Positive cost copied only for the checked B5 ticket record. */
  importeDocumentoCentimos: number | null
  /** Current Gasto source value, read on the server in exact cents. */
  importeGastoCentimos: number | null
  /** Current B4 wrapper target, signed. */
  importeObjetivoCentimos: number | null
  /** Current active DOCUMENTO capacity, signed. */
  asignadoActivoCentimos: number | null
  referencia: string | null
  tercero: string | null
}>

export type ConciliarB5SupportCandidate = Readonly<{
  adjuntoB5Id: string
  movimientoId: string
  uploadCompleto: boolean
  referencia: string | null
}>

export type ConciliarB5ReviewInput = Readonly<{
  movimientoId: string
  importeMovimientoCentimos: number
  fechaMovimiento: string
  tickets: readonly ConciliarB5TicketCandidate[]
  soportes: readonly ConciliarB5SupportCandidate[]
}>

export type ConciliarB5TicketSource = Readonly<{
  kind: 'PAGO_TICKET_B5'
  movimientoId: string
  adjuntoB5Id: string
  gastoId: string
  documentoConciliableId: string
}>

export type ConciliarB5SupportSource = Readonly<{
  kind: 'PAGO_SOPORTE_B5'
  movimientoId: string
  adjuntoB5Id: string
}>

export type ConciliarB5DocumentReview =
  | Readonly<{ kind: 'NONE' }>
  | Readonly<{
    kind: 'TICKET'
    color: 'VERDE' | 'AMBAR'
    seleccionable: boolean
    motivo: string
    diferenciaCentimos: number
    referencia: string
    tercero: string | null
    fechaDocumento: string | null
    importeDocumentoCentimos: number | null
    source: ConciliarB5TicketSource
  }>
  | Readonly<{
    kind: 'SOPORTE'
    color: 'AMBAR'
    seleccionable: false
    motivo: string
    /** A support never asserts a financial amount. */
    importeDocumentoCentimos: null
    referencia: string
    source: ConciliarB5SupportSource
  }>

const OPAQUE = /^[A-Za-z0-9_-]{1,160}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

function isOpaque(value: unknown): value is string { return typeof value === 'string' && OPAQUE.test(value) }
function isCents(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= -2_147_483_648 && value <= 2_147_483_647 }
function day(value: unknown): string | null {
  if (typeof value !== 'string' || !DAY.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}
function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() && value.length <= 300 ? value.trim() : fallback
}
function safeDifference(left: number, right: number): number | null {
  const result = left - right
  return Number.isSafeInteger(result) ? result : null
}

type ReviewedTicket = Readonly<{ candidate: ConciliarB5TicketCandidate; motivo: string; diferenciaCentimos: number; exacto: boolean }>

/**
 * Evaluates only the closed invariants which are available in the persisted
 * snapshot.  `confirmEasyReconciliationTx` must still lock and re-read the
 * ticket source, B4 wrapper, capacity, actor ACL and movement version at the
 * final explicit confirmation.
 */
export function reviewConciliarB5Ticket(input: Readonly<{
  movimientoId: string
  importeMovimientoCentimos: number
  fechaMovimiento: string
  candidate: ConciliarB5TicketCandidate
}>): ReviewedTicket | null {
  const movementDay = day(input.fechaMovimiento)
  const item = input.candidate
  if (!isOpaque(input.movimientoId) || !isCents(input.importeMovimientoCentimos) || input.importeMovimientoCentimos >= 0 || !movementDay) return null
  if (!isOpaque(item.adjuntoB5Id) || item.movimientoId !== input.movimientoId || !isOpaque(item.gastoId) || !isOpaque(item.documentoConciliableId)) return null
  if (!item.uploadCompleto) return null

  const documentCents = isCents(item.importeDocumentoCentimos) ? item.importeDocumentoCentimos : null
  const gastoCents = isCents(item.importeGastoCentimos) ? item.importeGastoCentimos : null
  const targetCents = isCents(item.importeObjetivoCentimos) ? item.importeObjetivoCentimos : null
  const allocatedCents = isCents(item.asignadoActivoCentimos) ? item.asignadoActivoCentimos : null
  const documentDay = day(item.fechaDocumento)
  const difference = targetCents === null ? 0 : safeDifference(input.importeMovimientoCentimos, targetCents)
  if (difference === null) return null

  if (!item.documentoActivo) return { candidate: item, motivo: 'El documento del ticket ya no está vigente.', diferenciaCentimos: difference, exacto: false }
  if (!item.gastoRevalidable) return { candidate: item, motivo: 'El gasto del ticket ha cambiado y debe revisarse.', diferenciaCentimos: difference, exacto: false }
  if (!item.archivoControlado) return { candidate: item, motivo: 'No se puede abrir el archivo privado del ticket.', diferenciaCentimos: difference, exacto: false }
  if (documentCents === null || documentCents <= 0 || gastoCents === null || gastoCents <= 0 || targetCents === null || allocatedCents === null) {
    return { candidate: item, motivo: 'Faltan importes válidos para comprobar el ticket.', diferenciaCentimos: difference, exacto: false }
  }
  if (documentCents !== gastoCents || targetCents !== -documentCents) {
    return { candidate: item, motivo: 'Los importes guardados del ticket no coinciden entre sí.', diferenciaCentimos: difference, exacto: false }
  }
  if (allocatedCents !== 0) return { candidate: item, motivo: 'Este ticket ya se ha utilizado para justificar otro pago.', diferenciaCentimos: difference, exacto: false }
  if (!documentDay) return { candidate: item, motivo: 'Falta una fecha documental verificable en el ticket.', diferenciaCentimos: difference, exacto: false }
  if (documentDay > movementDay) return { candidate: item, motivo: 'La fecha del ticket es posterior al cargo bancario.', diferenciaCentimos: difference, exacto: false }
  if (targetCents !== input.importeMovimientoCentimos) return { candidate: item, motivo: 'El importe del cargo no coincide exactamente con el ticket.', diferenciaCentimos: difference, exacto: false }
  return { candidate: item, motivo: 'Ticket recibido: importe y fecha coinciden; revisa el archivo antes de confirmar.', diferenciaCentimos: 0, exacto: true }
}

/**
 * Selects the server-side C3 review result.  A completed SOPORTE is visible but
 * never supplies an amount or a selectable source.  Two exact tickets are an
 * ambiguity, not an arbitrary choice.
 */
export function selectConciliarB5DocumentReview(input: ConciliarB5ReviewInput): ConciliarB5DocumentReview {
  const tickets = input.tickets
    .map(candidate => reviewConciliarB5Ticket({ movimientoId: input.movimientoId, importeMovimientoCentimos: input.importeMovimientoCentimos, fechaMovimiento: input.fechaMovimiento, candidate }))
    .filter((item): item is ReviewedTicket => item !== null)
    .sort((left, right) => left.candidate.adjuntoB5Id.localeCompare(right.candidate.adjuntoB5Id))
  const exact = tickets.filter(item => item.exacto)

  if (exact.length === 1) {
    const item = exact[0].candidate
    return {
      kind: 'TICKET', color: 'VERDE', seleccionable: true, motivo: exact[0].motivo, diferenciaCentimos: 0,
      referencia: text(item.referencia, 'Ticket recibido'), tercero: typeof item.tercero === 'string' && item.tercero.trim() ? item.tercero.trim() : null,
      fechaDocumento: day(item.fechaDocumento), importeDocumentoCentimos: item.importeDocumentoCentimos,
      source: { kind: 'PAGO_TICKET_B5', movimientoId: input.movimientoId, adjuntoB5Id: item.adjuntoB5Id, gastoId: item.gastoId, documentoConciliableId: item.documentoConciliableId },
    }
  }

  if (exact.length > 1) {
    const item = exact[0].candidate
    return {
      kind: 'TICKET', color: 'AMBAR', seleccionable: false, motivo: 'Hay más de un ticket exacto para el mismo cargo; revísalos antes de elegir uno.', diferenciaCentimos: 0,
      referencia: text(item.referencia, 'Ticket recibido'), tercero: typeof item.tercero === 'string' && item.tercero.trim() ? item.tercero.trim() : null,
      fechaDocumento: day(item.fechaDocumento), importeDocumentoCentimos: item.importeDocumentoCentimos,
      source: { kind: 'PAGO_TICKET_B5', movimientoId: input.movimientoId, adjuntoB5Id: item.adjuntoB5Id, gastoId: item.gastoId, documentoConciliableId: item.documentoConciliableId },
    }
  }

  if (tickets.length) {
    const item = tickets[0]
    return {
      kind: 'TICKET', color: 'AMBAR', seleccionable: false, motivo: item.motivo, diferenciaCentimos: item.diferenciaCentimos,
      referencia: text(item.candidate.referencia, 'Ticket recibido'), tercero: typeof item.candidate.tercero === 'string' && item.candidate.tercero.trim() ? item.candidate.tercero.trim() : null,
      fechaDocumento: day(item.candidate.fechaDocumento), importeDocumentoCentimos: isCents(item.candidate.importeDocumentoCentimos) ? item.candidate.importeDocumentoCentimos : null,
      source: { kind: 'PAGO_TICKET_B5', movimientoId: input.movimientoId, adjuntoB5Id: item.candidate.adjuntoB5Id, gastoId: item.candidate.gastoId, documentoConciliableId: item.candidate.documentoConciliableId },
    }
  }

  const support = input.soportes
    .filter(item => item.uploadCompleto && item.movimientoId === input.movimientoId && isOpaque(item.adjuntoB5Id))
    .sort((left, right) => left.adjuntoB5Id.localeCompare(right.adjuntoB5Id))[0]
  if (support) {
    return {
      kind: 'SOPORTE', color: 'AMBAR', seleccionable: false,
      motivo: 'Hay un archivo recibido. Revísalo: no acredita por sí solo un importe ni justifica el cargo.',
      importeDocumentoCentimos: null, referencia: text(support.referencia, 'Archivo recibido'),
      source: { kind: 'PAGO_SOPORTE_B5', movimientoId: input.movimientoId, adjuntoB5Id: support.adjuntoB5Id },
    }
  }
  return { kind: 'NONE' }
}
