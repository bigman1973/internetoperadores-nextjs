export class ConciliarDbError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export function conciliarDbErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof ConciliarDbError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  const code = String((error as { code?: unknown } | null)?.code ?? '')
  if (['P2002', 'P2034', '40001', '40P01', '55P03'].includes(code)) return { status: 409, body: { error: 'La información cambió mientras se procesaba. Actualiza y vuelve a intentarlo.', codigo: 'CONCURRENT_CONFLICT' } }
  if (code === '42P01' || code === '42704') return { status: 503, body: { error: 'La proyección de Conciliar aún no está preparada en este entorno.', codigo: 'CONCILIAR_MIGRATION_PENDING' } }
  return { status: 500, body: { error: 'No se pudo leer la conciliación. Inténtalo de nuevo.', codigo: 'CONCILIAR_LECTURA_FALLIDA' } }
}
