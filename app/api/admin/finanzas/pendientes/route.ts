// B5 — RUTA PROPUESTA: app/api/admin/finanzas/pendientes/route.ts
// No copiar sin revisar nombres Prisma generados después de aplicar la migración B5.
import { NextRequest } from "next/server";
import {readPendingAttachments} from "@/lib/finanzas/pending-attachments";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { privateJson, requireB4FinanceAccess, sameOrigin } from "@/lib/finanzas/reconciliation-auth";
import {
  B5ServiceError,
  VISTAS_PENDIENTES_B5,
  patchGestionPendienteB5,
  readContadoresPendientesB5,
  readPendientesB5,
  readConfiguracionPendientesB5,
  readAvisoTarjetasB5,
  type CoberturaB5,
  type VistaPendientesB5,
} from "@/lib/finanzas/pending-db";

export const dynamic = "force-dynamic";
const MAX_JSON_BYTES = 8 * 1024;

function jsonError(error: unknown) {
  if (error instanceof B5ServiceError) {
    return privateJson({ error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) }, error.status);
  }
  if (error instanceof Error && error.message === "STAGING_ISOLATION_REQUIRED") {
    return privateJson({ error: "Staging aislado no verificado", codigo: "STAGING_ISOLATION_REQUIRED" }, 503);
  }
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "P2002" || code === "P2034") {
    return privateJson({ error: "Conflicto concurrente B5; relea y reintente.", codigo: "CONCURRENT_CONFLICT" }, 409);
  }
  return privateJson({ error: "No se pudo procesar Pendientes B5" }, 500);
}

async function readBoundedJson(req: NextRequest): Promise<{ ok: true; value: unknown } | { ok: false; response: ReturnType<typeof privateJson> }> {
  if (req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return { ok: false, response: privateJson({ error: "Se requiere application/json" }, 415) };
  }
  const length = req.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    return { ok: false, response: privateJson({ error: "Cuerpo demasiado grande" }, 413) };
  }
  if (!req.body) return { ok: false, response: privateJson({ error: "Cuerpo vacío" }, 400) };
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_JSON_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, response: privateJson({ error: "Cuerpo demasiado grande" }, 413) };
      }
      text += decoder.decode(part.value, { stream: true });
    }
    text += decoder.decode();
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, response: privateJson({ error: "El cuerpo debe ser un objeto JSON" }, 400) };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, response: privateJson({ error: "JSON no válido" }, 400) };
  }
}

function optionalId(value: string | null): string | undefined | null {
  if (value === null) return undefined;
  return value.length > 0 && value.length <= 160 ? value : null;
}
function optionalText(value: string | null, max: number): string | undefined | null {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
}
function boundedInteger(value: string | null, fallback: number, min: number, max: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
function isoDay(value: string | null): Date | undefined | null {
  if (value === null) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/**
 * GET supports exactly one resource:
 * - recurso=items (default): one of four B5 views;
 * - recurso=contadores: denominator/numerator by month/account.
 * Both are read-only and private/no-store. `cobertura=TODAS` is the default so
 * legacy rows without a B3 cut remain visible; the response carries coverage
 * metadata and UI must label each account without fechaCorteExtracto. CUBIERTA
 * is the explicit conservative filter.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await requireB4FinanceAccess("lectura", session);
    if ("response" in access) return access.response;

    const p = req.nextUrl.searchParams;
    const recurso = p.get("recurso") ?? "items";
    const cuentaId = optionalId(p.get("cuentaId"));
    const q = optionalText(p.get("q"), 120);
    const desde = isoDay(p.get("desde"));
    const hasta = isoDay(p.get("hasta"));
    const cobertura = p.get("cobertura") ?? "TODAS";
    if (cuentaId === null || q === null || desde === null || hasta === null || (cobertura !== "CUBIERTA" && cobertura !== "TODAS")) {
      return privateJson({ error: "Parámetro de lectura no válido" }, 400);
    }
    const tarjeta = p.get('tarjeta') ?? undefined;
    if (tarjeta && !['9029','6440','2390','8964'].includes(tarjeta)) return privateJson({error:'Tarjeta no válida'},400);
    const common = { cuentaId, q, desde, hasta, tarjeta, cobertura: cobertura as CoberturaB5 };
    if (recurso === 'adjuntos') {const movimientoId=optionalId(p.get('movimientoId'));if(!movimientoId)return privateJson({error:'Movimiento no válido'},400);return privateJson(await readPendingAttachments(movimientoId));}
    if (recurso === 'avisos') return privateJson(await readAvisoTarjetasB5(access.actor.id));
    if (recurso === 'configuracion') return privateJson(await readConfiguracionPendientesB5());
    if (recurso === "contadores") return privateJson(await readContadoresPendientesB5(common));
    if (recurso !== "items") return privateJson({ error: "recurso no admitido" }, 400);

    const vista = p.get("vista");
    const limit = boundedInteger(p.get("limit"), 50, 1, 100);
    const offset = boundedInteger(p.get("offset"), 0, 0, 100_000);
    if (!vista || !(VISTAS_PENDIENTES_B5 as readonly string[]).includes(vista) || limit === null || offset === null) {
      return privateJson({ error: "Parámetro de lectura no válido" }, 400);
    }
    return privateJson(await readPendientesB5({ ...common, vista: vista as VistaPendientesB5, limit, offset }));
  } catch (error) {
    return jsonError(error);
  }
}

/** PATCH only changes a manual B5 management row; never links a document or sets B4 state. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await requireB4FinanceAccess("escritura", session);
    if ("response" in access) return access.response;
    if (!sameOrigin(req)) return privateJson({ error: "Origen de la solicitud no válido" }, 403);
    const body = await readBoundedJson(req);
    if (body.ok === false) return body.response;
    return privateJson(await patchGestionPendienteB5(access.actor.id, body.value));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST() { return privateJson({ error: "Método no permitido" }, 405); }
export async function PUT() { return privateJson({ error: "Método no permitido" }, 405); }
export async function DELETE() { return privateJson({ error: "Método no permitido" }, 405); }
