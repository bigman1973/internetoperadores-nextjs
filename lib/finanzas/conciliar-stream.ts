export type ConciliarBatchProgress =
  | Readonly<{ kind: 'row-applied'; completed: number; total: number; rowId: string }>
  | Readonly<{ kind: 'attempt-rolled-back'; completed: number; total: number; retrying: boolean }>

export type ConciliarNdjsonError = Readonly<{ code: string; message: string }>

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

/** Closed response envelope. It never serializes a command, a projection source,
 * amounts, SQL error details or an uncommitted row result. */
function committedResult(value: unknown): JsonRecord {
  const raw = record(value)
  const outcomes = Array.isArray(raw.outcomes) ? raw.outcomes : []
  return {
    ...(typeof raw.operationId === 'string' ? { operationId: raw.operationId } : {}),
    outcomes,
    ...(typeof raw.refreshedAt === 'string' ? { refreshedAt: raw.refreshedAt } : {}),
    projectionSynchronized: raw.projectionSynchronized === true,
    ...(raw.projection !== undefined ? { projection: raw.projection } : {}),
  }
}

function errorRecord(value: unknown): ConciliarNdjsonError {
  const raw = record(value)
  const code = typeof raw.codigo === 'string' && /^[A-Z0-9_]{2,160}$/.test(raw.codigo) ? raw.codigo : 'CONCILIAR_REQUEST_FAILED'
  const message = typeof raw.error === 'string' && raw.error.trim() ? raw.error.slice(0, 900) : 'No se pudo completar la confirmación del lote.'
  return { code, message }
}

export function acceptsConciliarNdjson(value: string | null): boolean {
  if (!value) return false
  return value.split(',').some(part => part.trim().toLowerCase().split(';', 1)[0] === 'application/x-ndjson')
}

/**
 * Starts one already-authorized Conciliar confirmation. `row-applied` means its
 * DML has run in the still-open serializable transaction, never that it committed.
 * A later rollback/retry explicitly retracts all provisional progress. The only
 * event containing outcomes is `committed`, emitted after `execute` resolves.
 */
export function streamConciliarConfirmation(input: Readonly<{
  total: number
  execute: (onProgress: (event: ConciliarBatchProgress) => void) => Promise<unknown>
  actionResponse: (result: unknown) => unknown
  actionErrorResponse: (error: unknown) => unknown
}>): Response {
  const encoder = new TextEncoder()
  const total = Number.isSafeInteger(input.total) && input.total > 0 ? input.total : 1
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // A client disconnect is not a business cancellation. In particular it must
      // never throw through `onProgress`, which is running inside the live
      // SERIALIZABLE transaction, nor make a committed operation look reverted.
      const emit = (value: JsonRecord) => {
        if (cancelled) return false
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`))
          return true
        } catch {
          cancelled = true
          return false
        }
      }
      let completed = 0
      let committed = false
      try {
        emit({ type: 'started', total, state: 'CONFIRMANDO', message: `Confirmando 0 de ${total}…`, provisional: true })
        const result = await input.execute((event) => {
          if (event.kind === 'row-applied') {
            completed = event.completed
            emit({
              type: 'progress', state: 'CONFIRMANDO', rowId: event.rowId,
              completed: event.completed, total: event.total,
              message: `Confirmando ${event.completed} de ${event.total}…`,
              provisional: true,
            })
            return
          }
          completed = 0
          emit({
            type: event.retrying ? 'retrying' : 'rolled_back',
            state: event.retrying ? 'REINTENTANDO' : 'REVERTIDO',
            completed: event.completed, total: event.total,
            message: event.retrying
              ? 'La transacción se reintentará: el avance anterior no se confirmó.'
              : 'La transacción se revirtió: ninguna fila del avance anterior se confirmó.',
            provisional: false,
          })
        })
        // runConciliarAction resolves only after Prisma commits its interactive
        // transaction. Set this before response normalization: a serialization
        // failure is uncertain to the transport, never a transaction rollback.
        committed = true
        try {
          emit({ type: 'committed', state: 'CONFIRMADO', provisional: false, result: committedResult(input.actionResponse(result)) })
        } catch {
          emit({
            type: 'uncertain', state: 'INCIERTO', provisional: false,
            message: 'La operación puede haberse confirmado, pero no se pudo preparar la respuesta. Reintenta con la misma clave de idempotencia.',
          })
        }
      } catch (error) {
        if (!committed) {
          let mapped: ConciliarNdjsonError = { code: 'CONCILIAR_REQUEST_FAILED', message: 'No se pudo completar la confirmación del lote.' }
          try { mapped = errorRecord(input.actionErrorResponse(error)) } catch { /* closed generic error */ }
          emit({
            type: 'rolled_back', state: 'REVERTIDO', completed, total,
            message: `No se confirmó ninguna fila de este intento: ${mapped.message}`,
            code: mapped.code, provisional: false,
          })
        }
      } finally {
        if (!cancelled) {
          try { controller.close() } catch { /* Reader cancellation is transport-only. */ }
        }
      }
    },
    cancel() {
      // Do not propagate cancellation to `execute`: the HTTP reader disappeared,
      // but its authorized, audited transaction must finish deterministically.
      cancelled = true
    },
  })
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  })
}
