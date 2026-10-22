import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verificarPermisoServer } from "@/lib/permisos";
import { checkAdminAreaRead, checkAdminAreaWrite } from "@/lib/api-admin-area-read";
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { prepareA3ParallelDraft, type A3AccountConfig, type A3ExportInput, type A3Incidence, type A3Line, type A3Scope } from "@/lib/finanzas/a3-parallel-core";
import { A3ReadLimitError, buildA3AccountConfig, computeA3DataHash, parseA3Month, parseA3Scope, readA3ConfigMetadata, readA3ParallelInput, type A3ConfigRequest, type A3ReviewMappings } from "@/lib/finanzas/a3-parallel-db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const AREA = "admin.finanzas.exportar_a3";
const LEGACY_ROLES = ["SUPER_ADMIN", "GERENTE", "CONTABILIDAD"];
const MAX_BODY_BYTES = 64 * 1024;
const PAGE_SIZE = 100;
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache", "Expires": "0", "Vary": "Cookie" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

type UnknownRecord = Record<string, unknown>;
type ReviewSource = Exclude<A3Scope, "todo">;
type RequestPayload = Readonly<{
  action: "preview" | "download";
  mes: string;
  scope: A3Scope;
  config: A3ConfigRequest;
  mappings: A3ReviewMappings;
  expectedHash: string | null;
  confirmacion: boolean;
  page: Readonly<{ source: ReviewSource | null; offset: number; linesOffset: number }>;
}>;
function record(value: unknown): UnknownRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}; }
function limitedString(value: unknown, length = 200): string | null { return typeof value === "string" && value.length <= length ? value : null; }
function account(value: unknown): string | null { const output = limitedString(value, 20); return output && /^\d+$/.test(output) ? output : null; }
function id(value: unknown): string | null { const output = limitedString(value, 36); return output && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(output) ? output : null; }
function source(value: unknown): ReviewSource | null { return value === "fi" || value === "fr" || value === "gastos" || value === "nominas" || value === "bank" ? value : null; }
function reviewDate(value: unknown): string | null { const output = limitedString(value, 10); return output && /^\d{4}-\d{2}-\d{2}$/.test(output) ? output : null; }
function requiredAccount(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = account(value);
  if (!parsed) throw new Error("A3_INPUT_ACCOUNT_INVALID");
  return parsed;
}
function requiredId(value: unknown): string {
  const parsed = id(value);
  if (!parsed) throw new Error("A3_INPUT_ID_INVALID");
  return parsed;
}

/** Counts bytes from the actual stream as Content-Length alone is not authoritative. */
async function parseBoundedJson(req: NextRequest): Promise<{ value: UnknownRecord } | { response: NextResponse }> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return { response: json({ error: 'Se requiere application/json' }, 415) };
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) return { response: json({ error: "Solicitud demasiado grande" }, 413) };
  const reader = req.body?.getReader();
  if (!reader) return { response: json({ error: "Cuerpo JSON requerido" }, 400) };
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      if (!part.value) continue;
      total += part.value.byteLength;
      if (total > MAX_BODY_BYTES) { try { await reader.cancel("body limit"); } catch { /* stream already failed */ } return { response: json({ error: "Solicitud demasiado grande" }, 413) }; }
      chunks.push(part.value);
    }
  } catch { return { response: json({ error: "No se pudo leer la solicitud" }, 400) }; }
  finally { try { reader.releaseLock(); } catch { /* no effect */ } }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
    return { value: parsed as UnknownRecord };
  } catch { return { response: json({ error: "JSON no válido" }, 400) }; }
}
function mappingsFrom(value: unknown): A3ReviewMappings {
  const raw = record(value); const gastos: Record<string, { cuentaGasto: string | null; cuentaContrapartida: string | null }> = {}; const movimientos: Record<string, { cuentaContrapartida: string | null; contraparteHumana: string | null }> = {}; const nominas: Record<string, { fechaNominaISO: string | null }> = {};
  const rawGastos = Object.entries(record(raw.gastoById)); const rawMovimientos = Object.entries(record(raw.movimientoById)); const rawNominas = Object.entries(record(raw.nominaById));
  if (rawGastos.length > 50_000 || rawMovimientos.length > 50_000 || rawNominas.length > 50_000) throw new Error("A3_INPUT_MAPPING_LIMIT");
  for (const [key, entry] of rawGastos) { const valid = requiredId(key); const item = record(entry); gastos[valid] = { cuentaGasto: requiredAccount(item.cuentaGasto), cuentaContrapartida: requiredAccount(item.cuentaContrapartida) }; }
  for (const [key, entry] of rawMovimientos) { const valid = requiredId(key); const item = record(entry); const human = item.contraparteHumana === null || item.contraparteHumana === undefined || item.contraparteHumana === "" ? null : limitedString(item.contraparteHumana, 180); if (item.contraparteHumana !== null && item.contraparteHumana !== undefined && item.contraparteHumana !== "" && human === null) throw new Error("A3_INPUT_COUNTERPARTY_INVALID"); movimientos[valid] = { cuentaContrapartida: requiredAccount(item.cuentaContrapartida), contraparteHumana: human }; }
  for (const [key, entry] of rawNominas) { const valid = requiredId(key); const date = record(entry).fechaNominaISO; if (date !== null && date !== undefined && date !== "" && !reviewDate(date)) throw new Error("A3_INPUT_DATE_INVALID"); nominas[valid] = { fechaNominaISO: reviewDate(date) }; }
  return { gastoById: gastos, movimientoById: movimientos, nominaById: nominas };
}
function configFrom(value: unknown): A3ConfigRequest {
  const raw = record(value); const selection = raw.selection === "manual" ? "manual" : "profile";
  const rawAccounts = record(raw.accounts); const accounts: Record<string, string | null> = {};
  const accountEntries = Object.entries(rawAccounts); if (accountEntries.length > 30) throw new Error("A3_INPUT_ACCOUNT_LIMIT");
  for (const [key, accountValue] of accountEntries) { if (!/^[a-zA-Z]+[a-zA-Z0-9]*$/.test(key)) throw new Error("A3_INPUT_ACCOUNT_FIELD_INVALID"); accounts[key] = requiredAccount(accountValue); }
  const rawBanks = record(raw.bankAccountByCuentaId); const bankAccountByCuentaId: Record<string, string | null> = {};
  const bankEntries = Object.entries(rawBanks); if (bankEntries.length > 500) throw new Error("A3_INPUT_BANK_LIMIT");
  for (const [key, accountValue] of bankEntries) bankAccountByCuentaId[requiredId(key)] = requiredAccount(accountValue);
  return { selection, profileId: limitedString(raw.profileId, 120), explicitlySelected: raw.explicitlySelected === true, accounts, bankAccountByCuentaId };
}
function payloadFrom(raw: UnknownRecord): RequestPayload {
  const action = raw.action === "download" ? "download" : raw.action === "preview" ? "preview" : null;
  const mes = limitedString(raw.mes, 7); if (!action || !mes) throw new Error("A3_REQUEST_INVALID");
  const pageRaw = record(raw.page); const rawOffset = pageRaw.offset; const rawLinesOffset = pageRaw.linesOffset;
  const offset = typeof rawOffset === "number" && Number.isSafeInteger(rawOffset) && rawOffset >= 0 && rawOffset <= 50_000 ? rawOffset : 0;
  const linesOffset = typeof rawLinesOffset === "number" && Number.isSafeInteger(rawLinesOffset) && rawLinesOffset >= 0 && rawLinesOffset <= 5_000_000 ? rawLinesOffset : 0;
  return { action, mes, scope: parseA3Scope(raw.scope), config: configFrom(raw.config), mappings: mappingsFrom(raw.mappings), expectedHash: limitedString(raw.expectedHash, 128), confirmacion: raw.confirmacion === true, page: { source: source(pageRaw.source), offset, linesOffset } };
}
async function authorize(req: NextRequest, write: boolean): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  const denied = write ? await checkAdminAreaWrite(AREA, LEGACY_ROLES, session) : await checkAdminAreaRead(AREA, LEGACY_ROLES, session);
  if (denied) { denied.headers.set("Cache-Control", "private, no-store"); return denied; }
  if (!session?.user || !Number.isInteger(Number(session.user.id))) return json({ error: "No autorizado" }, 401);
  const actor = await prisma.usuarioAdmin.findUnique({ where: { id: Number(session.user.id) }, select: { activo: true } });
  if (!actor?.activo) return json({ error: "Actor administrativo inactivo" }, 403);
  return null;
}
/** Revalidates the active actor and this exact finance export area inside the data snapshot. */
async function requireSnapshotActor(actorId: number, write: boolean, tx: Prisma.TransactionClient): Promise<void> {
  const actor = await tx.usuarioAdmin.findUnique({ where: { id: actorId }, select: { activo: true, rol: true, roles: true } });
  if (!actor?.activo) throw new Error("A3_ACTOR_INACTIVE");
  const permission = await verificarPermisoServer(actorId, AREA, actor.rol, tx);
  if (write ? permission.escritura : permission.lectura) return;
  const granular = await tx.permisoUsuario.count({ where: { usuarioId: actorId, OR: [{ lectura: true }, { escritura: true }] } });
  if (granular === 0 && [actor.rol, ...(actor.roles ?? [])].some((role) => LEGACY_ROLES.includes(role))) return;
  throw new Error("A3_FINANCE_EXPORT_FORBIDDEN");
}
async function readSnapshot(payload: RequestPayload, actorId: number): Promise<{ config: A3AccountConfig; input: A3ExportInput; dataHash: string }> {
  return prisma.$transaction(async (tx) => {
    await requireSnapshotActor(actorId, payload.action === "download", tx);
    const config = await buildA3AccountConfig(payload.config, tx);
    const input = await readA3ParallelInput(payload.scope, parseA3Month(payload.mes), config, payload.mappings, tx);
    return { config, input, dataHash: await computeA3DataHash(parseA3Month(payload.mes), payload.scope, input) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
function isSameOrigin(req: NextRequest): boolean { return req.headers.get("origin") === req.nextUrl.origin; }
function summary(incidences: readonly A3Incidence[]): Readonly<Record<string, Readonly<{ bloqueantes: number; revision: number }>>> {
  const output: Record<string, { bloqueantes: number; revision: number }> = {};
  for (const incidence of incidences) { const current = output[incidence.sourceType] ?? { bloqueantes: 0, revision: 0 }; if (incidence.severity === "BLOQUEANTE") current.bloqueantes += 1; else current.revision += 1; output[incidence.sourceType] = current; }
  return output;
}
function missingMappingCount(incidences: readonly A3Incidence[]): number {
  return incidences.filter((item) => ["CUENTA_CONFIGURACION_FALTANTE", "CUENTA_RETENCION_PROVEEDOR_PENDIENTE", "CUENTA_CONTRAPARTIDA_FALTANTE", "CONTRAPARTE_BANCO_FALTANTE", "PERFIL_NO_SELECCIONADO"].includes(item.code)).length;
}
function lineJson(line: A3Line) { return { asiento: line.asiento, apunte: line.apunte, fecha: line.fecha, cuenta: line.cuenta, concepto: line.concepto, debeCentimos: line.debeCentimos.toString(), haberCentimos: line.haberCentimos.toString(), documento: line.documento, diario: line.diario }; }
function sourceItems(input: A3ExportInput, wanted: ReviewSource | null, offset: number) {
  const list: Array<{ source: ReviewSource; id: string; fecha: string; label: string }> = [];
  if (!wanted || wanted === "fi") for (const item of input.facturasEmitidas ?? []) list.push({ source: "fi", id: item.id, fecha: item.fecha, label: `FI ${item.numFactura ?? "sin documento"} · ${item.cliente ?? "sin cliente"}` });
  if (!wanted || wanted === "fr") for (const item of input.facturasRecibidas ?? []) list.push({ source: "fr", id: item.id, fecha: item.fecha, label: `FR ${item.numFactura ?? "sin documento"} · ${item.proveedor ?? "sin proveedor"}` });
  if (!wanted || wanted === "gastos") for (const item of input.gastos ?? []) list.push({ source: "gastos", id: item.id, fecha: item.fecha, label: `Gasto · ${item.comercio ?? item.concepto ?? "sin concepto"}` });
  if (!wanted || wanted === "nominas") for (const item of input.nominas ?? []) list.push({ source: "nominas", id: item.id, fecha: `${item.anio}-${String(item.mes).padStart(2, "0")}`, label: `Nómina · ${item.empleado ?? "sin empleado"}` });
  if (!wanted || wanted === "bank") for (const item of input.movimientosBancarios ?? []) list.push({ source: "bank", id: item.id, fecha: item.fechaOperacion, label: `Banco · ${item.tercero ?? item.concepto ?? "sin contraparte"}` });
  return { items: list.slice(offset, offset + PAGE_SIZE), offset, nextOffset: offset + PAGE_SIZE < list.length ? offset + PAGE_SIZE : null, total: list.length };
}
function previewResponse(period: string, scope: A3Scope, config: A3AccountConfig, dataHash: string, input: A3ExportInput, page: RequestPayload["page"]) {
  const draft = prepareA3ParallelDraft(input);
  return json({
    kind: "A3_BORRADOR_PARALELO", period, scope, configVersionSHA: config.configVersionSHA, dataHash,
    readiness: draft.readiness, reviewRequired: true, assertion: "Borrador para prueba externa; no verificado A3, no enviado ni registrado.",
    counts: { lines: draft.totals.lines, seats: draft.totals.entries, debeCentimos: draft.totals.debeCentimos, haberCentimos: draft.totals.haberCentimos, excludedBySource: draft.totals.excludedBySource, incidences: draft.incidences.length, missingMappings: missingMappingCount(draft.incidences) },
    incidenceSummary: summary(draft.incidences), incidences: draft.incidences.slice(0, PAGE_SIZE), incidenceNextOffset: draft.incidences.length > PAGE_SIZE ? PAGE_SIZE : null,
    lines: draft.lines.slice(page.linesOffset, page.linesOffset + PAGE_SIZE).map(lineJson), linesOffset: page.linesOffset, linesNextOffset: page.linesOffset + PAGE_SIZE < draft.lines.length ? page.linesOffset + PAGE_SIZE : null,
    sourcePage: sourceItems(input, page.source, page.offset),
    warnings: ["No se guarda perfil, selección, exportación ni marca de origen.", "Los campos de documento/concepto que empiezan por fórmula se protegen con apóstrofo en el CSV; revisar antes de la prueba.", "La aceptación de formato/importación corresponde a la prueba externa con A3."],
  });
}

/** GET only returns review configuration metadata; it never exposes IBAN, balances or source financial data. */
export async function GET(req: NextRequest) {
  try {
    const denied = await authorize(req, false); if (denied) return denied;
    await assertFinanceRuntimeReady();
    const actorId = Number((await getServerSession(authOptions))?.user?.id);
    const metadata = await prisma.$transaction(async (tx) => {
      await requireSnapshotActor(actorId, false, tx);
      return readA3ConfigMetadata(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return json({ kind: "A3_BORRADOR_PARALELO_CONFIG", ...metadata, warning: "Valores actuales, requieren revisión: seleccione explícitamente un perfil o configuración manual." });
  } catch (error) {
    if (error instanceof Error && error.message === "STAGING_ISOLATION_REQUIRED") return json({ error: "Preparación A3 disponible sólo en staging financiero aislado" }, 503);
    console.error("No se pudo leer configuración A3 de staging"); return json({ error: "No se pudo leer la configuración A3" }, 500);
  }
}

/** POST has no DML: preview is read-authorized; download requires write permission, confirmation and a fresh input hash. */
export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return json({ error: "Origen de la solicitud no válido" }, 403);
    const parsed = await parseBoundedJson(req); if ("response" in parsed) return parsed.response;
    const payload = payloadFrom(parsed.value);
    const denied = await authorize(req, payload.action === "download"); if (denied) return denied;
    await assertFinanceRuntimeReady();
    const period = parseA3Month(payload.mes);
    const actorId = Number((await getServerSession(authOptions))?.user?.id);
    const { config, input, dataHash } = await readSnapshot(payload, actorId);
    if (payload.action === "preview") return previewResponse(period.mes, payload.scope, config, dataHash, input, payload.page);
    if (!payload.confirmacion) return json({ error: "La descarga requiere confirmacion explícita" }, 400);
    if (!payload.expectedHash || payload.expectedHash !== dataHash) return json({ error: "Los datos o la configuración han cambiado; revise de nuevo antes de descargar", code: "A3_REVIEW_HASH_STALE", currentHash: dataHash }, 409);
    const draft = prepareA3ParallelDraft(input);
    if (draft.readiness !== "listo para prueba externa") return json({ error: "El borrador está incompleto; resuelva incidencias bloqueantes antes de descargar", code: "A3_REVIEW_INCOMPLETE", incidenceSummary: summary(draft.incidences) }, 409);
    const safeScope = payload.scope.toUpperCase(); const filename = `A3_BORRADOR_PARALELO_${period.mes}_${safeScope}.csv`;
    return new NextResponse(draft.csv, { headers: { ...privateHeaders, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "X-A3-Review-Hash": dataHash } });
  } catch (error) {
    if (error instanceof A3ReadLimitError) return json({ error: "Demasiados registros para una lectura completa; reduzca el periodo. No se ha tratado ninguna lectura parcial como completa.", code: "A3_READ_LIMIT_REQUIRES_NARROWER_PERIOD" }, 429);
    if (error instanceof Error && error.message === "STAGING_ISOLATION_REQUIRED") return json({ error: "Preparación A3 disponible sólo en staging financiero aislado" }, 503);
    if (error instanceof Error && ["A3_MONTH_INVALID", "A3_SCOPE_INVALID", "A3_REQUEST_INVALID", "A3_PROFILE_UNKNOWN", "A3_CONFIG_SELECTION_INVALID", "A3_CONFIG_ACCOUNT_INVALID", "A3_BANK_ACCOUNT_ID_INVALID", "A3_BANK_ACCOUNT_ID_UNKNOWN", "A3_BANK_ACCOUNT_METADATA_LIMIT", "A3_INPUT_ACCOUNT_INVALID", "A3_INPUT_ID_INVALID", "A3_INPUT_MAPPING_LIMIT", "A3_INPUT_COUNTERPARTY_INVALID", "A3_INPUT_DATE_INVALID", "A3_INPUT_ACCOUNT_LIMIT", "A3_INPUT_ACCOUNT_FIELD_INVALID", "A3_INPUT_BANK_LIMIT"].includes(error.message)) return json({ error: "Solicitud de revisión A3 no válida", code: error.message }, 400);
    if (error instanceof Error && ["A3_ACTOR_INACTIVE", "A3_FINANCE_EXPORT_FORBIDDEN"].includes(error.message)) return json({ error: "No autorizado" }, 403);
    console.error("No se pudo revisar borrador A3 de staging"); return json({ error: "No se pudo preparar el borrador A3" }, 500);
  }
}
