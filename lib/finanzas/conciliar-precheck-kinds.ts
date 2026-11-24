import type { ConciliarProjectionSource } from './conciliar-contract'
/** Closed source registry. Adding a source requires a validator, not a default green. */
export const CONCILIAR_PRECHECK_KINDS = ['COBRO_PROPUESTA','COBRO_CONFIRMING','PAGO_FACTURA_RECIBIDA','PAGO_TICKET_B5','PAGO_NOMINA','COMISION_BANCARIA','PENDIENTE_FACTURA_EMITIDA','TRANSFERENCIA_PROPIA','TRANSFERENCIA_PROPIA_MANUAL'] as const satisfies readonly ConciliarProjectionSource['kind'][]
