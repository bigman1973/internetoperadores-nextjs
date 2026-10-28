export type ConciliarClientBatchProgress = Readonly<{ completed: number; total: number; retrying: boolean }>;

export class ConciliarStreamUncertainError extends Error {}
export class ConciliarStreamRejectedError extends Error {
  constructor(readonly code: string) { super('El lote no se ha guardado. Revisa las filas y actualiza antes de volver a confirmar.'); }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ConciliarStreamUncertainError('La respuesta del lote no se pudo comprobar.');
  return value as Record<string, unknown>;
}

/** Un único POST. Sólo la trama committed autoriza resultados definitivos.
 * El avance no inventa filas completadas y no sobrevive a un rollback/reintento.
 */
export async function readConciliarBatchResponse(
  response: Response,
  selectedIds: readonly string[],
  onProgress: (progress: ConciliarClientBatchProgress) => void,
): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) return response.json().catch(() => {
    if (response.ok) throw new ConciliarStreamUncertainError('El resultado del lote llegó incompleto.');
    return null;
  });
  if (!response.body) throw new ConciliarStreamUncertainError('No se pudo leer el resultado del lote.');
  const allowed = new Set(selectedIds);
  const total = selectedIds.length;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  let lastCompleted = 0;
  const frame = (line: string): { committed: boolean; result?: unknown } => {
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { throw new ConciliarStreamUncertainError('El resultado del lote llegó incompleto.'); }
    const event = record(parsed);
    if (event.type === 'committed') {
      const result = record(event.result);
      if (event.provisional !== false || !Array.isArray(result.outcomes) || result.outcomes.length !== total) throw new ConciliarStreamUncertainError('No se pudo comprobar el recibo completo del lote.');
      const seen = new Set<string>();
      for (const raw of result.outcomes) {
        const outcome = record(raw);
        if (typeof outcome.id !== 'string' || !allowed.has(outcome.id) || seen.has(outcome.id) || typeof outcome.ok !== 'boolean') throw new ConciliarStreamUncertainError('El recibo no corresponde a todas las filas seleccionadas.');
        seen.add(outcome.id);
      }
      return { committed: true, result };
    }
    if (event.type === 'uncertain') throw new ConciliarStreamUncertainError('No pudimos comprobar el resultado. Reintenta exactamente la misma acción.');
    if (event.type === 'rolled_back') {
      onProgress({ completed: 0, total, retrying: false });
      throw new ConciliarStreamRejectedError(typeof event.code === 'string' && /^[A-Z0-9_]{2,160}$/.test(event.code) ? event.code : 'LOTE_REVERTIDO');
    }
    if (event.type === 'retrying') {
      lastCompleted = 0;
      onProgress({ completed: 0, total, retrying: true });
      return { committed: false };
    }
    if (event.type === 'started' || event.type === 'progress') {
      const completed = event.type === 'started' ? 0 : event.completed;
      if (event.total !== total || !Number.isSafeInteger(completed) || (completed as number) < lastCompleted || (completed as number) > total || (completed as number) < 0 || event.provisional !== true) throw new ConciliarStreamUncertainError('El progreso recibido no corresponde al lote seleccionado.');
      if (event.type === 'progress' && (typeof event.rowId !== 'string' || !allowed.has(event.rowId))) throw new ConciliarStreamUncertainError('El progreso no corresponde a las filas seleccionadas.');
      lastCompleted = completed as number;
      onProgress({ completed: lastCompleted, total, retrying: false });
      return { committed: false };
    }
    throw new ConciliarStreamUncertainError('El formato del progreso no se pudo comprobar.');
  };
  try {
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch { throw new ConciliarStreamUncertainError('La conexión se interrumpió antes de comprobar el resultado.'); }
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 4 * 1024 * 1024) throw new ConciliarStreamUncertainError('La respuesta del lote supera el límite de lectura.');
      buffer += decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = frame(line);
        if (event.committed) return event.result;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = frame(buffer.trim());
      if (event.committed) return event.result;
    }
    throw new ConciliarStreamUncertainError('La conexión terminó sin un recibo de confirmación guardado.');
  } finally { reader.releaseLock(); }
}
