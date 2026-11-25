import type { ParaPedirMovimiento } from './para-pedir-contract';

/** La fecha procede de la auditoría B5 ya validada por el contrato de lectura. */
export function formatParaPedirAuditDay(day: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}` : 'fecha no verificable';
}

/**
 * Etiqueta de sólo presentación. Nunca completa una auditoría ausente con la
 * fecha, el actor o cualquier dato enviado por el navegador.
 */
export function paraPedirStatusLabel(movement: Pick<ParaPedirMovimiento, 'estadoPedido' | 'pedido'>): string {
  if (movement.estadoPedido === 'PEDIDO') {
    if (!movement.pedido) return 'Pedido sin auditoría verificable';
    const actor = movement.pedido.actorNombre ? ` (por ${movement.pedido.actorNombre})` : '';
    return `Pedida el ${formatParaPedirAuditDay(movement.pedido.dia)}${actor}`;
  }
  if (movement.estadoPedido === 'PEDIDO_SIN_AUDITORIA') return 'Pedido sin auditoría verificable';
  if (movement.estadoPedido === 'RECIBIDO') return 'Documento recibido · revisar y confirmar';
  return 'Falta pedirla';
}
