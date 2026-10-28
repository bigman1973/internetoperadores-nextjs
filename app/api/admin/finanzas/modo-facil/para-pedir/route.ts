import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging';
import { ParaPedirProjectionError, readParaPedirProjection } from '@/lib/finanzas/para-pedir-projection-read';
import { ParaPedirValidationError, parseParaPedirInput } from '@/lib/finanzas/para-pedir-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const MAX_QUERY_BYTES = 1_024;

function errorResponse(error: unknown) {
  if (error instanceof FinanceEasyRuntimeError || error instanceof ParaPedirProjectionError || error instanceof ParaPedirValidationError) {
    return privateJson({ error: error.message, codigo: error.code }, error.status);
  }
  return privateJson({ error: 'No se pudo leer la lista de documentación pendiente.', codigo: 'PARA_PEDIR_LECTURA_FALLIDA' }, 500);
}

function queryRecord(request: NextRequest): Record<string, string | null> {
  if (request.nextUrl.search.length > MAX_QUERY_BYTES) {
    throw new ParaPedirValidationError(400, 'VALIDATION_ERROR', 'La consulta supera el límite permitido.');
  }
  const query: Record<string, string | null> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      throw new ParaPedirValidationError(400, 'VALIDATION_ERROR', 'La consulta contiene campos repetidos.');
    }
    query[key] = value;
  }
  return query;
}

/** GET consume exclusivamente la foto de proyección y la auditoría B5 existente. */
export async function GET(request: NextRequest) {
  try {
    const runtimeContext = await assertFinanceEasyRuntime();
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions));
    if ('response' in access) return access.response;
    const response = await readParaPedirProjection(parseParaPedirInput(queryRecord(request)));
    return privateJson({ ...response, stagingOnly: runtimeContext.stagingOnly });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() { return privateJson({ error: 'Para pedir sólo registra lectura. Pedir desde Conciliar marca el estado auditado y no envía avisos.' }, 405); }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405); }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405); }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405); }
