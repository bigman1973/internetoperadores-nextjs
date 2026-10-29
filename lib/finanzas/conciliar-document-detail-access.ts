/** Error público de frontera; no incluye datos de fila ni de documento. */
export class ConciliarDocumentDetailError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
    this.name = 'ConciliarDocumentDetailError'
  }
}

/**
 * Guard puro de defensa en profundidad. La ruta revalida B4 en vivo antes de
 * llamarlo; el lector tampoco acepta un actor ausente o no válido.
 */
export function assertConciliarDocumentDetailActor(actorId: number): void {
  if (!Number.isSafeInteger(actorId) || actorId < 1) {
    throw new ConciliarDocumentDetailError(403, 'SIN_PERMISO_ACTUAL', 'No se pudo validar el acceso financiero actual.')
  }
}
