export type ConciliarConfirmationNoticeInput = Readonly<{
  action: 'confirmar' | 'pedir';
  succeeded: number;
  failed: number;
  labels: readonly string[];
}>;

/** Only called after the client has parsed a committed server receipt. It never
 * accepts or prints operation IDs, hashes, actor IDs, or file locations. */
export function formatConciliarConfirmationNotice(input: ConciliarConfirmationNoticeInput): string {
  if (input.action === 'pedir') return 'Añadido a Para pedir. No se ha enviado ningún aviso.';
  if (input.failed > 0) return `${input.succeeded} confirmada(s); ${input.failed} necesita(n) revisión. Revisa el resultado del lote.`;
  if (input.succeeded > 1) return `Confirmadas ${input.succeeded} filas. Abre Confirmados hoy para el detalle.`;
  const label = input.labels[0]?.trim();
  return label ? `Confirmado: ${label}.` : 'Confirmado. Abre Confirmados hoy para el detalle.';
}
