import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { HttpGuardError, readJsonLimited, sameOrigin } from '@/lib/finanzas/sync-jobs/api-guards'
import { ConciliarValidationError, parseConciliarCommand, parseConciliarGetInput, type ConciliarCommand } from '@/lib/finanzas/conciliar-contract'
import { conciliarActionErrorResponse, runConciliarAction } from '@/lib/finanzas/conciliar-actions'
import { conciliarDbErrorResponse, readConciliarProjection, readConciliarRow } from '@/lib/finanzas/conciliar-db'
import { scheduleConciliarProjectionRefresh } from '@/lib/finanzas/conciliar-refresh'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 180

const MAX_JSON_BYTES = 16 * 1024
const MAX_QUERY_BYTES = 1024

function errorResponse(error: unknown) {
  if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof ConciliarValidationError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof HttpGuardError) {
    const body = error.code === 'JSON_REQUIRED' ? { error: 'Se requiere application/json.', codigo: error.code }
      : error.code === 'JSON_TOO_LARGE' ? { error: 'El cuerpo JSON supera el límite permitido.', codigo: error.code }
        : error.code === 'INVALID_JSON' ? { error: 'El cuerpo JSON no es válido.', codigo: error.code }
          : { error: 'El cuerpo JSON es obligatorio.', codigo: error.code }
    return privateJson(body, error.status)
  }
  const action = conciliarActionErrorResponse(error)
  if (action.status !== 500 || action.body.codigo !== 'CONCILIAR_ACCION_FALLIDA') return privateJson(action.body, action.status)
  const read = conciliarDbErrorResponse(error)
  if (read.status !== 500 || read.body.codigo !== 'CONCILIAR_LECTURA_FALLIDA') return privateJson(read.body, read.status)
  return privateJson({ error: 'No se pudo completar la solicitud de Conciliar.', codigo: 'CONCILIAR_REQUEST_FAILED' }, 500)
}

function queryRecord(request: NextRequest): Record<string, string | null> {
  if (request.nextUrl.search.length > MAX_QUERY_BYTES) throw new ConciliarValidationError(400, 'VALIDATION_ERROR', 'La consulta supera el límite permitido.')
  const result: Record<string, string | null> = {}
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) throw new ConciliarValidationError(400, 'VALIDATION_ERROR', 'La consulta contiene campos repetidos.')
    result[key] = value
  }
  return result
}

function refreshedAt(): string { return new Date().toISOString() }

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.slice(0, 900) : fallback
}
function operationId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined
}
function code(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^[A-Z0-9_]{2,160}$/.test(value) ? value : fallback
}
function readResponse(value: unknown) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  if (!raw || typeof raw.updatedAt !== 'string' || Number.isNaN(new Date(raw.updatedAt).getTime())) {
    throw new ConciliarValidationError(503, 'PROYECCION_NO_DISPONIBLE', 'La proyección de Conciliar aún no está preparada; actualiza cuando finalice la reconstrucción.')
  }
  const accounts = Array.isArray(raw.cuentas) ? raw.cuentas.map(valueForAccount => {
    const account = valueForAccount && typeof valueForAccount === 'object' && !Array.isArray(valueForAccount) ? valueForAccount as Record<string, unknown> : {}
    return { id: account.id, banco: account.banco, cuenta: account.cuenta ?? account.alias ?? null }
  }) : []
  return { ...raw, cuentas: accounts }
}
function normalizeOutcome(value: unknown, fallbackId: string, defaultOperationId?: string) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const ok = raw.ok === true
  const id = typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 240 ? raw.id : fallbackId
  const outcomeOperationId = operationId(raw.operationId) ?? defaultOperationId
  return {
    id,
    ok,
    code: code(raw.code ?? raw.codigo, ok ? 'APLICADA' : 'ACCION_NO_COMPLETADA'),
    message: text(raw.message ?? raw.error, ok ? 'Acción realizada.' : 'No se pudo completar la acción.'),
    ...(outcomeOperationId ? { operationId: outcomeOperationId } : {}),
  }
}

function actionResponse(command: ConciliarCommand, result: unknown) {
  const raw = result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {}
  const resultOperationId = operationId(raw.operationId)
  if (command.action === 'deshacer') {
    const undone = raw.ok === true
    return {
      // The client associates receipt state with the original confirmation.
      // The internal reversal receipt remains server-side audit metadata.
      operationId: command.operationId,
      undone,
      message: undone ? 'La acción se ha deshecho.' : text(raw.message, 'La acción ya no se puede deshacer.'),
      refreshedAt: refreshedAt(),
    }
  }
  const candidates = Array.isArray(raw.outcomes) ? raw.outcomes : command.action === 'pedir'
    ? [{ id: command.id, ok: raw.ok === true, code: raw.ok === true ? 'PEDIDO_REGISTRADO' : 'PEDIDO_NO_REGISTRADO', message: raw.ok === true ? 'Añadido a Para pedir.' : raw.message }]
    : []
  const outcomes = candidates.map(item => normalizeOutcome(item, command.action === 'pedir' ? command.id : 'fila', resultOperationId))
  if (outcomes.length === 0) throw new Error('CONCILIAR_ACTION_RESPONSE_INCOMPLETE')
  return { ...(resultOperationId ? { operationId: resultOperationId } : {}), outcomes, refreshedAt: refreshedAt() }
}

/** GET is projection-only: it never rebuilds, creates documents, sends requests or writes B4/B5. */
export async function GET(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const query = queryRecord(request)
    const rowId = query.rowId
    if (rowId !== undefined) {
      if (Object.keys(query).length !== 1 || !rowId) throw new ConciliarValidationError(400, 'VALIDATION_ERROR', 'rowId debe ser la única consulta de detalle.')
      return privateJson(await readConciliarRow(rowId))
    }
    return privateJson(readResponse(await readConciliarProjection(parseConciliarGetInput(query))))
  } catch (error) { return errorResponse(error) }
}

/** POST accepts only an exact closed JSON command. No browser fields select sources, amounts or file locators. */
export async function POST(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const access = await requireB4FinanceAccess('escritura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    if (!sameOrigin(request)) return privateJson({ error: 'Origen de la solicitud no válido.', codigo: 'INVALID_ORIGIN' }, 403)
    const command = (await readJsonLimited(request, MAX_JSON_BYTES)) as unknown
    // Parse here as well as in the action service: malformed input cannot reach it
    // and the route retains the exact command needed to normalize the UI response.
    const parsed = parseConciliarCommand(command)
    const result = await runConciliarAction(access.actor.id, parsed)
    scheduleConciliarProjectionRefresh(access.actor.id)
    return privateJson(actionResponse(parsed, result))
  } catch (error) { return errorResponse(error) }
}

export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function HEAD() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function OPTIONS() { return privateJson({ error: 'Método no permitido.' }, 405) }
