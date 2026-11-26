import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import {
  confirmingDocumentosSameOrigin, readConfirmingDocumentosMultipart,
  leerConfirmingDocumento, ConfirmingDocumentosError,
} from '@/lib/finanzas/confirming-documentos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/** Manual file read only, staging only. POST requires both live L/E by contract,
 * but never persists a lot, archives the binary or confirms any bank collection. */
export async function POST(request: NextRequest) {
  try {
    await assertPrototypeStaging()
    const session = await getServerSession(authOptions)
    const actingSession = session as typeof session & { impersonation?: unknown }
    if (actingSession?.impersonation != null || (session?.user as { impersonation?: unknown } | undefined)?.impersonation != null) {
      return privateJson({ error: 'La lectura manual no está disponible durante actuación.', codigo: 'CONFIRMING_ACTING_FORBIDDEN' }, 403)
    }
    const readable = await requireB4FinanceAccess('lectura', session)
    if ('response' in readable) return readable.response
    const writable = await requireB4FinanceAccess('escritura', session)
    if ('response' in writable) return writable.response
    if (readable.actor.id !== writable.actor.id || !confirmingDocumentosSameOrigin(request)) {
      return privateJson({ error: 'Se requiere el Origin HTTPS exacto de esta solicitud.', codigo: 'CONFIRMING_ORIGIN_INVALID' }, 403)
    }
    // No acting override, actor ID, movement, URL, drive/item or action is accepted.
    if (request.nextUrl.search) return privateJson({ error: 'La lectura manual no admite parámetros de consulta.', codigo: 'CONFIRMING_QUERY_INVALID' }, 400)
    const file = await readConfirmingDocumentosMultipart(request)
    return privateJson(await leerConfirmingDocumento(file))
  } catch (error) {
    if (error instanceof PrototypeStagingError || error instanceof ConfirmingDocumentosError) {
      return privateJson({ error: error.message, codigo: error.code }, error.status)
    }
    return privateJson({ error: 'No se pudo completar la lectura manual. No se ha archivado ni confirmado ningún cobro.', codigo: 'CONFIRMING_DOCUMENT_READ_FAILED' }, 503)
  }
}

// Folder inventory remains the separate existing opt-in GET; no duplicate reader.
export async function GET() { return privateJson({ error: 'Método no permitido. Seleccione un archivo para lectura manual.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
