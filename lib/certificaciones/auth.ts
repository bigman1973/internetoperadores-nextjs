import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  checkAdminAreaRead,
  checkAdminAreaWrite,
} from "@/lib/api-admin-area-read";

export function noStoreJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function authorizeCertification(
  area: string,
  write = false,
  request?: Request,
  verifyOrigin = true,
): Promise<{ actorId: number; response: NextResponse | null }> {
  const denied = (status: number, error: string) => ({
    actorId: 0,
    response: noStoreJson({ error }, status),
  });
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== "admin")
    return denied(401, "No autorizado");
  const actorId = Number(session.user.id);
  if (!Number.isSafeInteger(actorId) || actorId <= 0)
    return denied(401, "No autorizado");
  const actor = await prisma.usuarioAdmin.findUnique({
    where: { id: actorId },
    select: { activo: true, rol: true, roles: true },
  });
  if (!actor?.activo) return denied(401, "No autorizado");
  // Never trust a stale role in a token after permission/role revocation.
  const current = {
    ...session,
    user: { ...session.user, role: actor.rol, roles: actor.roles },
  };
  const permission = await (write ? checkAdminAreaWrite : checkAdminAreaRead)(
    area,
    [],
    current,
  );
  if (permission)
    return denied(
      permission.status,
      permission.status === 401
        ? "No autorizado"
        : `Sin permiso de ${write ? "escritura" : "lectura"}`,
    );
  if (write && verifyOrigin) {
    if (
      !request ||
      request.headers.get("origin") !== new URL(request.url).origin
    )
      return denied(403, "Origen no autorizado");
    if (request.headers.get("sec-fetch-site") === "cross-site")
      return denied(403, "Origen no autorizado");
  }
  return { actorId, response: null };
}
export async function jsonBody(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new Error("BODY_TYPE");
  const declared = Number(request.headers.get("content-length"));
  if (declared > maxBytes) throw new Error("BODY_SIZE");
  if (!request.body) throw new Error("BODY_INVALID");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      bytes += r.value.length;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new Error("BODY_SIZE");
      }
      chunks.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch {
    throw new Error("BODY_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("BODY_INVALID");
  return value as Record<string, unknown>;
}
