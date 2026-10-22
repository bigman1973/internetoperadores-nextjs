// B5 external preparation — target: app/api/admin/finanzas/pendientes/documento/route.ts
// Not applied to the repository. This route does not call the legacy tickets/upload API.
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { privateJson, requireB4FinanceAccess, sameOrigin } from "@/lib/finanzas/reconciliation-auth";
import { readStrictMultipart, UploadValidationError, validatePendingDocument } from "@/lib/finanzas/pending-document-helper";
import { createPendingDocument, PendingDocumentServiceError } from "@/lib/finanzas/pending-document-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(error: unknown) {
  if (error instanceof UploadValidationError || error instanceof PendingDocumentServiceError) {
    return privateJson({ error: error.message, codigo: error.code }, error.status);
  }
  if (error instanceof Error && error.message === "STAGING_ISOLATION_REQUIRED") {
    return privateJson({ error: "Staging aislado no verificado", codigo: "STAGING_ISOLATION_REQUIRED" }, 503);
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2002" || code === "P2034") {
    return privateJson({ error: "Conflicto concurrente; relea y reintente con la misma clave.", codigo: "CONCURRENT_CONFLICT" }, 409);
  }
  return privateJson({ error: "No se pudo preparar el documento pendiente" }, 500);
}

/**
 * POST /api/admin/finanzas/pendientes/documento
 * All request fields and the sole `archivo` part are parsed with stream bounds;
 * Request.formData() is intentionally forbidden because it buffers uncontrolled
 * multipart bodies before application limits can be enforced.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // This endpoint explicitly requires BOTH live B4 capabilities. The second
    // call supplies the real, revalidated actor ID; no actor IDs enter the form.
    const readable = await requireB4FinanceAccess("lectura", session);
    if ("response" in readable) return readable.response;
    const writable = await requireB4FinanceAccess("escritura", session);
    if ("response" in writable) return writable.response;
    if (readable.actor.id !== writable.actor.id || !sameOrigin(req)) {
      return privateJson({ error: "Origen de la solicitud no válido" }, 403);
    }
    const multipart = await readStrictMultipart(req);
    const input = validatePendingDocument(multipart);
    const result = await createPendingDocument(writable.actor.id, input);
    return privateJson(result, result.idempotent ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() { return privateJson({ error: "Método no permitido" }, 405); }
export async function PUT() { return privateJson({ error: "Método no permitido" }, 405); }
export async function PATCH() { return privateJson({ error: "Método no permitido" }, 405); }
export async function DELETE() { return privateJson({ error: "Método no permitido" }, 405); }
