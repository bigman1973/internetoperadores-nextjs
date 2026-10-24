import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { privateJson, requireB4FinanceAccess, sameOrigin } from '@/lib/finanzas/reconciliation-auth'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { readStrictMultipart, UploadValidationError, validatePendingDocument } from '@/lib/finanzas/pending-document-helper'
import { createPendingDocument, PendingDocumentServiceError } from '@/lib/finanzas/pending-document-upload'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60
function errorResponse(error: unknown) {
  if (error instanceof PrototypeStagingError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof UploadValidationError || error instanceof PendingDocumentServiceError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  const code = (error as { code?: unknown } | null)?.code
  if (code === 'P2002' || code === 'P2034') return privateJson({ error: 'Conflicto concurrente; relea y reintente con la misma clave.', codigo: 'CONCURRENT_CONFLICT' }, 409)
  return privateJson({ error: 'No se pudo preparar la foto de ticket.' }, 500)
}

/** B5 is the sole upload provider path. It stores in STAGING_FINANZAS_NO_CONTABILIZAR and never confirms B4. */
export async function POST(req: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions)
    const readable = await requireB4FinanceAccess('lectura', session)
    if ('response' in readable) return readable.response
    const writable = await requireB4FinanceAccess('escritura', session)
    if ('response' in writable) return writable.response
    if (readable.actor.id !== writable.actor.id || !sameOrigin(req)) return privateJson({ error: 'Origen de la solicitud no válido' }, 403)
    const input = validatePendingDocument(await readStrictMultipart(req))
    if (input.tipoDocumento !== 'TICKET') return privateJson({ error: 'Modo Fácil foto sólo admite tipoDocumento=TICKET.', codigo: 'TICKET_REQUERIDO' }, 422)
    const result = await createPendingDocument(writable.actor.id, input)
    // Do not expose authenticated/provider URLs. Upload merely returns the reviewed B4 wrapper for a later explicit confirmation.
    return privateJson({ ok: true, idempotent: result.idempotent, idAdjunto: result.idAdjunto, tipoDocumento: result.tipoDocumento, documentoConciliableId: result.documentoConciliableId }, result.idempotent ? 200 : 201)
  } catch (error) { return errorResponse(error) }
}
export async function GET() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido' }, 405) }
