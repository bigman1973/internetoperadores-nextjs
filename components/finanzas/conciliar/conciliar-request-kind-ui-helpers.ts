/* Helper propio del bloque 2C: no depende de estado, red, Prisma ni acciones. */
import type { ConciliarRequestKindDecision } from '@/lib/finanzas/conciliar-request-kind-core'

export type ConciliarRequestKindUiCopy = Readonly<{
  groupLabel: string
  queueLabel: string
  requestLabel: string | null
  confirmationNotice: string
}>

const GROUP_LABEL: Readonly<Record<NonNullable<ConciliarRequestKindDecision['group']>, string>> = {
  GASTOS_BANCO: 'Gastos del banco',
  NOMINAS: 'Nóminas',
  IMPUESTOS: 'Impuestos',
  PRESTAMOS: 'Préstamos',
  TARJETA: 'Tarjeta',
  FACTURA_RECIBIDA: 'Facturas de proveedor',
}

const REQUEST_LABEL: Readonly<Record<ConciliarRequestKindDecision['requestAction'], string | null>> = {
  NO_PEDIR: null,
  PEDIR_JUSTIFICANTE_MODELO: 'Pedir justificante del modelo',
  PEDIR_CUADRO_AMORTIZACION: 'Pedir cuadro de amortización',
  PEDIR_TICKET_O_FACTURA: 'Pedir ticket o factura',
  PEDIR_JUSTIFICANTE_GENERAL: 'Pedir justificante general',
}

/**
 * Sólo presenta una decisión que el servidor ya derivó. No habilita botones de
 * confirmación ni transforma una solicitud en un envío, correo o escritura.
 */
export function conciliarRequestKindUiCopy(decision: ConciliarRequestKindDecision): ConciliarRequestKindUiCopy {
  return Object.freeze({
    groupLabel: decision.group === null ? 'Revisar justificante' : GROUP_LABEL[decision.group],
    queueLabel: decision.isParaPedir ? 'Para pedir' : 'No va a Para pedir',
    requestLabel: REQUEST_LABEL[decision.requestAction],
    confirmationNotice: 'La conciliación requiere confirmación humana.',
  })
}
