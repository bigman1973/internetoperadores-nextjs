import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  EXISTING_A3_REVIEW_PROFILE,
  type A3AccountConfig,
  type A3ExportInput,
  type A3Scope,
  type AccountField,
  type FacturaEmitidaA3Source,
  type FacturaRecibidaA3Source,
  type GastoA3Source,
  type MovimientoBancarioA3Source,
  type NominaA3Source,
} from "./a3-parallel-core";

/** The reader is intentionally DB-read-only. No update/create/delete/export mark exists here. */
export const A3_READ_BATCH = 500;
export const A3_READ_MAX_ROWS_PER_SOURCE = 50_000;
export const A3_MAX_BANK_ACCOUNT_METADATA = 500;
export const A3_ACCOUNT_FIELDS = [
  "clientes", "proveedores", "ventasServicios", "comprasServicios",
  "ivaRepercutido21", "ivaRepercutido10", "ivaRepercutido4",
  "ivaSoportado21", "ivaSoportado10", "ivaSoportado4",
  "irpfRetenido", "retencionProveedor", "sueldosSalarios", "ssEmpresa",
  "irpfNominas", "ssTrabajador", "ssEmpresaPagar", "remuneracionesPendientes",
] as const satisfies readonly AccountField[];

export class A3ReadLimitError extends Error {
  readonly status = 429;
  constructor() { super("A3_READ_LIMIT_REQUIRES_NARROWER_PERIOD"); }
}
export interface A3MonthRange { readonly mes: string; readonly desde: string; readonly hastaExclusiva: string; }
export interface A3ReviewMappings {
  readonly gastoById: Readonly<Record<string, Readonly<{ cuentaGasto: string | null; cuentaContrapartida: string | null }>>>;
  readonly movimientoById: Readonly<Record<string, Readonly<{ cuentaContrapartida: string | null; contraparteHumana: string | null }>>>;
  readonly nominaById: Readonly<Record<string, Readonly<{ fechaNominaISO: string | null }>>>;
}
export interface A3ConfigRequest {
  readonly selection: "profile" | "manual";
  readonly profileId?: string | null;
  readonly explicitlySelected: boolean;
  readonly accounts: Readonly<Partial<Record<AccountField, string | null>>>;
  readonly bankAccountByCuentaId: Readonly<Record<string, string | null>>;
}
export interface A3ConfigMetadata {
  readonly profiles: readonly Readonly<{ id: string; label: string; requiresExplicitSelection: true; accounts: Readonly<Partial<Record<AccountField, string | null>>>; }> [];
  readonly bankAccounts: readonly Readonly<{ id: string; label: string; active: boolean; }> [];
}

/** PrismaClient and interactive TransactionClient both satisfy this read-only subset. */
export type A3PrismaReadClient = Pick<Prisma.TransactionClient, "$queryRaw" | "cuentaBancaria">;

type SqlRow = Record<string, unknown>;
type Cursor = Readonly<{ date: string; id: string }> | null;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const accountPattern = /^\d+$/;
function nullableText(value: unknown): string | null { return typeof value === "string" ? value : value === null || value === undefined ? null : String(value); }
function asDate(value: unknown): string { return nullableText(value) ?? ""; }
function bool(value: unknown): boolean { return value === true; }
function stringRecord(value: unknown): Readonly<Record<string, unknown>> { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : {}; }
function exactAccount(value: unknown): string | null { return typeof value === "string" && accountPattern.test(value) ? value : null; }

/** Exactly one valid calendar month; no annual/trimestral broad source read. */
export function parseA3Month(mes: unknown): A3MonthRange {
  if (typeof mes !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error("A3_MONTH_INVALID");
  const [year, month] = mes.split("-").map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));
  const iso = (value: Date) => value.toISOString().slice(0, 10);
  if (Number.isNaN(from.valueOf()) || iso(from) !== `${mes}-01`) throw new Error("A3_MONTH_INVALID");
  return { mes, desde: iso(from), hastaExclusiva: iso(next) };
}
export function parseA3Scope(scope: unknown): A3Scope {
  if (scope === "fi" || scope === "fr" || scope === "gastos" || scope === "nominas" || scope === "bank" || scope === "todo") return scope;
  throw new Error("A3_SCOPE_INVALID");
}
function assertRange(range: A3MonthRange): void {
  if (!datePattern.test(range.desde) || !datePattern.test(range.hastaExclusiva) || range.desde >= range.hastaExclusiva) throw new Error("A3_MONTH_INVALID");
}
function mapRows<T>(rows: readonly SqlRow[], map: (row: SqlRow) => T): readonly T[] { return rows.map(map); }

/**
 * Bounded keyset scan. A request either reads all rows for a selected source or
 * throws 429; callers never receive a partial source represented as complete.
 */
async function readAll<T>(fetchPage: (cursor: Cursor) => Promise<readonly SqlRow[]>, map: (row: SqlRow) => T): Promise<readonly T[]> {
  const output: T[] = [];
  let cursor: Cursor = null;
  while (true) {
    const page = await fetchPage(cursor);
    if (page.length === 0) return output;
    if (output.length + page.length > A3_READ_MAX_ROWS_PER_SOURCE) throw new A3ReadLimitError();
    output.push(...mapRows(page, map));
    if (page.length < A3_READ_BATCH) return output;
    const tail = page[page.length - 1];
    const date = nullableText(tail.__cursorDate); const id = nullableText(tail.__cursorId);
    if (!date || !id) throw new Error("A3_READ_CURSOR_INVALID");
    if (cursor && (date < cursor.date || (date === cursor.date && id <= cursor.id))) throw new Error("A3_READ_CURSOR_NON_ADVANCING");
    cursor = { date, id };
  }
}
function keyset(after: Cursor, dateColumn: string, idColumn: string): Prisma.Sql {
  // Column names are local constants, never request data; all values remain Prisma bindings.
  const date = Prisma.raw(dateColumn); const id = Prisma.raw(idColumn);
  return Prisma.sql`AND (${after?.date ?? null}::date IS NULL OR (${date}::date, ${id}::text) > (${after?.date ?? null}::date, ${after?.id ?? null}::text))`;
}
function selected(scope: A3Scope, source: Exclude<A3Scope, "todo">): boolean { return scope === "todo" || scope === source; }

function mapFacturaEmitida(row: SqlRow): FacturaEmitidaA3Source {
  return { id: String(row.id), fecha: asDate(row.fecha), numFactura: nullableText(row.numFactura), cliente: nullableText(row.cliente), base: nullableText(row.base), importeIva: nullableText(row.importeIva), importeIrpf: nullableText(row.importeIrpf), total: nullableText(row.total), tipoIva: nullableText(row.tipoIva), facturaIspId: nullableText(row.facturaIspId) };
}
function mapFacturaRecibida(row: SqlRow): FacturaRecibidaA3Source {
  return { id: String(row.id), fecha: asDate(row.fecha), numFactura: nullableText(row.numFactura), proveedor: nullableText(row.proveedor), calidad: nullableText(row.calidad), copiaDeId: nullableText(row.copiaDeId), conflictoIdentidad: bool(row.conflictoIdentidad), duplicadoExterno: bool(row.duplicadoExterno), base: nullableText(row.base), importeIva: nullableText(row.importeIva), importeIrpf: nullableText(row.importeIrpf), total: nullableText(row.total), tipoIva: nullableText(row.tipoIva) };
}
function mapGasto(row: SqlRow, mappings: A3ReviewMappings): GastoA3Source {
  const id = String(row.id); const mapping = mappings.gastoById[id];
  return { id, fecha: asDate(row.fecha), concepto: nullableText(row.concepto), comercio: nullableText(row.comercio), importe: nullableText(row.importe), baseIva: nullableText(row.baseIva), importeIva: nullableText(row.importeIva), tipoIva: nullableText(row.tipoIva), deducibleIva: bool(row.deducibleIva), cuentaGasto: mapping?.cuentaGasto ?? null, cuentaContrapartida: mapping?.cuentaContrapartida ?? null };
}
function mapNomina(row: SqlRow, mappings: A3ReviewMappings): NominaA3Source {
  const id = String(row.id);
  return { id, anio: String(row.anio ?? ""), mes: String(row.mes ?? ""), empleado: nullableText(row.empleado), devengadoTotal: nullableText(row.devengadoTotal), ssEmpresa: nullableText(row.ssEmpresa), irpf: nullableText(row.irpf), ssTrabajador: nullableText(row.ssTrabajador), netoPercibir: nullableText(row.netoPercibir), fechaNominaISO: mappings.nominaById[id]?.fechaNominaISO ?? null };
}
function mapMovimiento(row: SqlRow, mappings: A3ReviewMappings): MovimientoBancarioA3Source {
  const id = String(row.id); const mapping = mappings.movimientoById[id];
  return { id, fechaOperacion: asDate(row.fechaOperacion), cuentaId: nullableText(row.cuentaId), referencia: nullableText(row.referencia), concepto: nullableText(row.concepto), tercero: nullableText(row.tercero), importe: nullableText(row.importe), traspasoB4Confirmado: bool(row.traspasoB4Confirmado), cuentaContrapartida: mapping?.cuentaContrapartida ?? null, contraparteHumana: mapping?.contraparteHumana ?? null };
}

/**
 * Reads through the supplied client only. Routes pass a REPEATABLE READ client so
 * all parallel source scans and their cursor pages belong to one snapshot.
 * Current source models have no currency column, so this EUR project scope does
 * not invent a conversion or a new business field.
 */
export async function readA3ParallelInput(scope: A3Scope, period: A3MonthRange, accountConfig: A3AccountConfig, mappings: A3ReviewMappings, db: A3PrismaReadClient = prisma): Promise<A3ExportInput> {
  assertRange(period);
  const facturasEmitidas = selected(scope, "fi") ? readAll((after) => db.$queryRaw<SqlRow[]>(Prisma.sql`
    SELECT f.id::text AS id, f.fecha::date::text AS fecha, f.num_factura AS "numFactura", f.cliente,
      f.base::text AS base, f.importe_iva::text AS "importeIva", f.importe_irpf::text AS "importeIrpf", f.total::text AS total,
      f.tipo_iva::text AS "tipoIva", f.factura_isp_id::text AS "facturaIspId", f.fecha::date::text AS "__cursorDate", f.id::text AS "__cursorId"
    FROM facturas_emitidas f WHERE f.fecha >= ${period.desde}::date AND f.fecha < ${period.hastaExclusiva}::date
    ${keyset(after, "f.fecha", "f.id")} ORDER BY f.fecha::date ASC, f.id::text ASC LIMIT ${A3_READ_BATCH}`), mapFacturaEmitida) : Promise.resolve([] as readonly FacturaEmitidaA3Source[]);
  const facturasRecibidas = selected(scope, "fr") ? readAll((after) => db.$queryRaw<SqlRow[]>(Prisma.sql`
    SELECT f.id::text AS id, f.fecha::date::text AS fecha, f.num_factura AS "numFactura", f.proveedor,
      f.calidad::text AS calidad, f.copia_de_id::text AS "copiaDeId", f.conflicto_identidad AS "conflictoIdentidad", f.duplicado_externo AS "duplicadoExterno",
      f.base::text AS base, f.importe_iva::text AS "importeIva", f.importe_irpf::text AS "importeIrpf", f.total::text AS total, f.tipo_iva::text AS "tipoIva",
      f.fecha::date::text AS "__cursorDate", f.id::text AS "__cursorId"
    FROM facturas_recibidas f WHERE f.fecha >= ${period.desde}::date AND f.fecha < ${period.hastaExclusiva}::date
    ${keyset(after, "f.fecha", "f.id")} ORDER BY f.fecha::date ASC, f.id::text ASC LIMIT ${A3_READ_BATCH}`), mapFacturaRecibida) : Promise.resolve([] as readonly FacturaRecibidaA3Source[]);
  const gastos = selected(scope, "gastos") ? readAll((after) => db.$queryRaw<SqlRow[]>(Prisma.sql`
    SELECT g.id::text AS id, g.fecha::date::text AS fecha, g.concepto, g.comercio, g.importe::text AS importe,
      g.base_iva::text AS "baseIva", g.importe_iva::text AS "importeIva", g.tipo_iva::text AS "tipoIva", g.deducible_iva AS "deducibleIva",
      g.fecha::date::text AS "__cursorDate", g.id::text AS "__cursorId"
    FROM gastos g WHERE g.fecha >= ${period.desde}::date AND g.fecha < ${period.hastaExclusiva}::date
    ${keyset(after, "g.fecha", "g.id")} ORDER BY g.fecha::date ASC, g.id::text ASC LIMIT ${A3_READ_BATCH}`), (row) => mapGasto(row, mappings)) : Promise.resolve([] as readonly GastoA3Source[]);
  const nominas = selected(scope, "nominas") ? readAll((after) => db.$queryRaw<SqlRow[]>(Prisma.sql`
    SELECT n.id::text AS id, n.anio::text AS anio, n.mes::text AS mes, e.nombre_completo AS empleado,
      n.devengado_total::text AS "devengadoTotal", n.ss_empresa::text AS "ssEmpresa", n.irpf::text AS irpf,
      n.ss_trabajador::text AS "ssTrabajador", n.neto_percibir::text AS "netoPercibir",
      make_date(n.anio, n.mes, 1)::text AS "__cursorDate", n.id::text AS "__cursorId"
    FROM nominas n LEFT JOIN empleados e ON e.id = n.empleado_id
    WHERE make_date(n.anio, n.mes, 1) >= ${period.desde}::date AND make_date(n.anio, n.mes, 1) < ${period.hastaExclusiva}::date
    ${keyset(after, "make_date(n.anio, n.mes, 1)", "n.id")} ORDER BY make_date(n.anio, n.mes, 1)::date ASC, n.id::text ASC LIMIT ${A3_READ_BATCH}`), (row) => mapNomina(row, mappings)) : Promise.resolve([] as readonly NominaA3Source[]);
  const movimientosBancarios = selected(scope, "bank") ? readAll((after) => db.$queryRaw<SqlRow[]>(Prisma.sql`
    SELECT m.id::text AS id, m.fecha_operacion::date::text AS "fechaOperacion", m.cuenta_id::text AS "cuentaId", m.referencia, m.concepto, m.tercero,
      m.importe::text AS importe,
      EXISTS (
        SELECT 1
        FROM traspasos_internos t
        JOIN movimientos_bancarios mo ON mo.id = t.movimiento_origen_id
        JOIN movimientos_bancarios md ON md.id = t.movimiento_destino_id
        JOIN estado_justificacion_movimientos eo ON eo.movimiento_id = mo.id
        JOIN estado_justificacion_movimientos ed ON ed.movimiento_id = md.id
        JOIN LATERAL (
          SELECT o.id, o.estado, o.revertida_at, o.aprobada_por_id
          FROM operaciones_justificacion_b4 o
          WHERE o.movimiento_id = mo.id
          ORDER BY o.created_at DESC, o.id DESC
          LIMIT 1
        ) oo ON true
        JOIN LATERAL (
          SELECT o.id, o.estado, o.revertida_at, o.aprobada_por_id
          FROM operaciones_justificacion_b4 o
          WHERE o.movimiento_id = md.id
          ORDER BY o.created_at DESC, o.id DESC
          LIMIT 1
        ) od ON true
        WHERE (t.movimiento_origen_id = m.id OR t.movimiento_destino_id = m.id)
          -- Closed enum proof only: neither text/category nor absence of exclusions qualifies.
          AND eo.estado = 'NO_REQUIERE'::"EstadoJustificacionMovimiento"
          AND ed.estado = 'NO_REQUIERE'::"EstadoJustificacionMovimiento"
          AND eo.motivo_no_requiere = 'TRASPASO_INTERNO_SIN_DOCUMENTO'::"MotivoNoRequiere"
          AND ed.motivo_no_requiere = 'TRASPASO_INTERNO_SIN_DOCUMENTO'::"MotivoNoRequiere"
          -- The latest current operation on each bank source must be a human-applied, unreverted B4 operation.
          AND oo.estado = 'APLICADA'::"EstadoOperacionB4" AND oo.revertida_at IS NULL AND oo.aprobada_por_id IS NOT NULL
          AND od.estado = 'APLICADA'::"EstadoOperacionB4" AND od.revertida_at IS NULL AND od.aprobada_por_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM eventos_justificacion_b4 oe WHERE oe.operacion_id = oo.id AND oe.movimiento_id = mo.id AND oe.accion = 'APLICACION'::"AccionEventoJustificacionB4" AND oe.actor_id IS NOT NULL)
          AND EXISTS (SELECT 1 FROM eventos_justificacion_b4 de WHERE de.operacion_id = od.id AND de.movimiento_id = md.id AND de.accion = 'APLICACION'::"AccionEventoJustificacionB4" AND de.actor_id IS NOT NULL)
          -- Initialization evidence is intentionally not upgraded into human confirmation.
          AND NOT EXISTS (SELECT 1 FROM eventos_justificacion_b4 oi WHERE oi.operacion_id = oo.id AND oi.accion = 'INICIALIZACION'::"AccionEventoJustificacionB4")
          AND NOT EXISTS (SELECT 1 FROM eventos_justificacion_b4 di WHERE di.operacion_id = od.id AND di.accion = 'INICIALIZACION'::"AccionEventoJustificacionB4")
          -- Actual pair validation: exact linked identities, different accounts, non-zero known opposite cents.
          AND mo.id <> md.id AND mo.cuenta_id <> md.cuenta_id
          AND b4_importe_bancario_centimos(mo.importe) IS NOT NULL
          AND b4_importe_bancario_centimos(md.importe) IS NOT NULL
          AND b4_importe_bancario_centimos(mo.importe) <> 0
          AND b4_importe_bancario_centimos(mo.importe) = -b4_importe_bancario_centimos(md.importe)
      ) AS "traspasoB4Confirmado",
      m.fecha_operacion::date::text AS "__cursorDate", m.id::text AS "__cursorId"
    FROM movimientos_bancarios m WHERE m.fecha_operacion >= ${period.desde}::date AND m.fecha_operacion < ${period.hastaExclusiva}::date
    ${keyset(after, "m.fecha_operacion", "m.id")} ORDER BY m.fecha_operacion::date ASC, m.id::text ASC LIMIT ${A3_READ_BATCH}`), (row) => mapMovimiento(row, mappings)) : Promise.resolve([] as readonly MovimientoBancarioA3Source[]);
  const [fi, fr, ga, no, ba] = await Promise.all([facturasEmitidas, facturasRecibidas, gastos, nominas, movimientosBancarios]);
  return { accountConfig, facturasEmitidas: fi, facturasRecibidas: fr, gastos: ga, nominas: no, movimientosBancarios: ba };
}

/** Config GET intentionally exposes account ids/labels only, never IBANs or balances. */
export async function readA3ConfigMetadata(db: A3PrismaReadClient = prisma): Promise<A3ConfigMetadata> {
  const accounts = await db.cuentaBancaria.findMany({ take: A3_MAX_BANK_ACCOUNT_METADATA + 1, select: { id: true, banco: true, activa: true }, orderBy: [{ activa: "desc" }, { banco: "asc" }, { id: "asc" }] });
  if (accounts.length > A3_MAX_BANK_ACCOUNT_METADATA) throw new Error("A3_BANK_ACCOUNT_METADATA_LIMIT");
  return { profiles: [{ id: EXISTING_A3_REVIEW_PROFILE.id, label: "Valores actuales, requieren revisión", requiresExplicitSelection: true, accounts: EXISTING_A3_REVIEW_PROFILE.accounts }], bankAccounts: accounts.map((account) => ({ id: account.id, label: account.banco || "Cuenta sin etiqueta", active: account.activa })) };
}
function profileOrThrow(id: string | null | undefined): A3AccountConfig {
  if (id !== EXISTING_A3_REVIEW_PROFILE.id) throw new Error("A3_PROFILE_UNKNOWN");
  return EXISTING_A3_REVIEW_PROFILE;
}
/** Request configuration is transient review data; no plan contable or default bank account is invented. */
export async function buildA3AccountConfig(request: A3ConfigRequest, db: A3PrismaReadClient = prisma): Promise<A3AccountConfig> {
  if (request.selection !== "profile" && request.selection !== "manual") throw new Error("A3_CONFIG_SELECTION_INVALID");
  const base = request.selection === "profile" ? profileOrThrow(request.profileId) : { ...EXISTING_A3_REVIEW_PROFILE, id: "manual-review", label: "Configuración manual de revisión", accounts: {}, bankAccountByCuentaId: {} };
  const accounts: Partial<Record<AccountField, string | null>> = { ...base.accounts };
  for (const field of A3_ACCOUNT_FIELDS) if (Object.prototype.hasOwnProperty.call(request.accounts, field)) {
    const submitted = request.accounts[field];
    if (submitted !== null && !exactAccount(submitted)) throw new Error("A3_CONFIG_ACCOUNT_INVALID");
    accounts[field] = submitted === null ? null : exactAccount(submitted);
  }
  const bankAccountByCuentaId: Record<string, string | null> = {};
  const submittedBanks = Object.entries(stringRecord(request.bankAccountByCuentaId));
  if (submittedBanks.length > A3_MAX_BANK_ACCOUNT_METADATA) throw new Error("A3_BANK_ACCOUNT_METADATA_LIMIT");
  for (const [id, account] of submittedBanks) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new Error("A3_BANK_ACCOUNT_ID_INVALID");
    if (account !== null && !exactAccount(account)) throw new Error("A3_CONFIG_ACCOUNT_INVALID");
    bankAccountByCuentaId[id] = account === null ? null : exactAccount(account);
  }
  if (submittedBanks.length) {
    const actual = await db.cuentaBancaria.findMany({ where: { id: { in: submittedBanks.map(([id]) => id) } }, select: { id: true } });
    if (actual.length !== submittedBanks.length) throw new Error("A3_BANK_ACCOUNT_ID_UNKNOWN");
  }
  const snapshot = { id: base.id, label: base.label, selection: request.selection, explicitlySelected: request.explicitlySelected === true, accounts, bankAccountByCuentaId };
  return { ...snapshot, configVersionSHA: await sha256(stableJson(snapshot)) };
}

/** Stable serialisation prevents property insertion order from changing a review snapshot hash. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
/** Server-side Web Crypto; no Node crypto is imported into a client bundle. */
export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Includes every source fact/mapping/config used by the pure core; used to reject stale downloads after reread. */
export async function computeA3DataHash(period: A3MonthRange, scope: A3Scope, input: A3ExportInput): Promise<string> {
  return sha256(stableJson({ period, scope, accountConfig: input.accountConfig, facturasEmitidas: input.facturasEmitidas, facturasRecibidas: input.facturasRecibidas, gastos: input.gastos, nominas: input.nominas, movimientosBancarios: input.movimientosBancarios }));
}
