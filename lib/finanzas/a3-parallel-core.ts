/**
 * Preparación paralela A3 B8. Núcleo puro: no Prisma, red, estado ni marcas
 * de exportación. El CSV es un BORRADOR para prueba externa, nunca una entrega A3.
 */
export const A3_HEADERS = ["Asiento", "Apunte", "Fecha", "Cuenta", "Concepto", "Debe", "Haber", "Documento", "Diario"] as const;
export type A3SourceType = "FACTURA_EMITIDA" | "FACTURA_RECIBIDA" | "GASTO" | "NOMINA" | "MOVIMIENTO_BANCARIO";
export type A3Scope = "fi" | "fr" | "gastos" | "nominas" | "bank" | "todo";
export type A3Severity = "BLOQUEANTE" | "REVISION";
export type ExactDecimal = string | null;
/** Canonical key used by every paged SQL source: calendar date, then textual primary key. */
export interface A3DateIdKey { readonly date: string; readonly id: string; }
export type AccountField =
  | "clientes" | "proveedores" | "ventasServicios" | "comprasServicios"
  | "ivaRepercutido21" | "ivaRepercutido10" | "ivaRepercutido4"
  | "ivaSoportado21" | "ivaSoportado10" | "ivaSoportado4"
  | "irpfRetenido" | "retencionProveedor" | "sueldosSalarios" | "ssEmpresa"
  | "irpfNominas" | "ssTrabajador" | "ssEmpresaPagar" | "remuneracionesPendientes";

export interface A3Incidence {
  readonly severity: A3Severity;
  readonly code: string;
  readonly sourceType: A3SourceType;
  readonly sourceId: string;
  readonly message: string;
  readonly detail?: Readonly<Record<string, string | null>>;
}

/** A profile is merely proposed metadata until explicitly selected in the review request. */
export interface A3AccountConfig {
  readonly id: string;
  readonly label: string;
  readonly explicitlySelected: boolean;
  readonly selection: "profile" | "manual";
  /** Server-computed SHA-256 of the selected snapshot; it is not persistent configuration. */
  readonly configVersionSHA?: string;
  readonly accounts: Readonly<Partial<Record<AccountField, string | null>>>;
  /** Explicit CuentaBancaria.id -> selected ledger account. There is no IBAN field. */
  readonly bankAccountByCuentaId: Readonly<Record<string, string | null>>;
}

/** Existing values are review metadata only. They are deliberately not a selected profile. */
export const EXISTING_A3_REVIEW_PROFILE: A3AccountConfig = Object.freeze({
  id: "valores-actuales-a3-v1",
  label: "Valores actuales, requieren revisión",
  explicitlySelected: false,
  selection: "profile",
  accounts: Object.freeze({
    clientes: "4300000", proveedores: "4000000", ventasServicios: "7050000", comprasServicios: "6290000",
    ivaRepercutido21: "4770021", ivaRepercutido10: "4770010", ivaRepercutido4: "4770004",
    ivaSoportado21: "4720021", ivaSoportado10: "4720010", ivaSoportado4: "4720004",
    irpfRetenido: "4730000", sueldosSalarios: "6400000", ssEmpresa: "6420000",
    irpfNominas: "4751000", ssTrabajador: "4760010", ssEmpresaPagar: "4760020", remuneracionesPendientes: "4650000",
    // Kept null: the previous 473 supplier retention mapping is not asserted as verified PGC.
    retencionProveedor: null,
  }),
  bankAccountByCuentaId: Object.freeze({}),
});

export interface FacturaEmitidaA3Source {
  readonly id: string; readonly fecha: string; readonly numFactura: string | null; readonly cliente: string | null;
  readonly base: ExactDecimal; readonly importeIva: ExactDecimal; readonly importeIrpf: ExactDecimal; readonly total: ExactDecimal;
  readonly tipoIva: string | null; readonly facturaIspId: string | null;
}
export interface FacturaRecibidaA3Source {
  readonly id: string; readonly fecha: string; readonly numFactura: string | null; readonly proveedor: string | null;
  readonly calidad: string | null; readonly copiaDeId: string | null; readonly conflictoIdentidad: boolean; readonly duplicadoExterno: boolean;
  readonly base: ExactDecimal; readonly importeIva: ExactDecimal; readonly importeIrpf: ExactDecimal; readonly total: ExactDecimal; readonly tipoIva: string | null;
}
export interface GastoA3Source {
  readonly id: string; readonly fecha: string; readonly concepto: string | null; readonly comercio: string | null;
  readonly importe: ExactDecimal; readonly baseIva: ExactDecimal; readonly importeIva: ExactDecimal; readonly tipoIva: string | null; readonly deducibleIva: boolean;
  readonly cuentaGasto: string | null; readonly cuentaContrapartida: string | null;
}
export interface NominaA3Source {
  readonly id: string; readonly anio: string; readonly mes: string; readonly empleado: string | null;
  readonly devengadoTotal: ExactDecimal; readonly ssEmpresa: ExactDecimal; readonly irpf: ExactDecimal;
  readonly ssTrabajador: ExactDecimal; readonly netoPercibir: ExactDecimal;
  /** Manual review date only. It must belong to the source payroll month. */
  readonly fechaNominaISO?: string | null;
}
export interface MovimientoBancarioA3Source {
  readonly id: string; readonly fechaOperacion: string; readonly cuentaId: string | null; readonly referencia: string | null;
  readonly concepto: string | null; readonly tercero: string | null; readonly importe: ExactDecimal;
  /** Snapshot fact loaded from explicit B4 TRASPASO evidence only; never text/category matching. */
  readonly traspasoB4Confirmado: boolean;
  readonly cuentaContrapartida: string | null;
  /** Human counterparty deliberately chosen in review; not inferred from bank sign or source text. */
  readonly contraparteHumana: string | null;
}
/**
 * Pure representation of the facts the database reader must establish before it
 * sets `traspasoB4Confirmado`. It deliberately has no text/category predicate.
 */
export interface A3ConfirmedTransferPairEvidence {
  readonly originMovementId: string;
  readonly destinationMovementId: string;
  readonly originCuentaId: string | null;
  readonly destinationCuentaId: string | null;
  readonly originImporte: ExactDecimal;
  readonly destinationImporte: ExactDecimal;
  /** Both movements have a current, schema-defined B4 transfer source proof. */
  readonly bothCurrentB4TransferProofs: boolean;
}
export interface A3ExportInput {
  readonly accountConfig: A3AccountConfig;
  readonly facturasEmitidas?: readonly FacturaEmitidaA3Source[]; readonly facturasRecibidas?: readonly FacturaRecibidaA3Source[];
  readonly gastos?: readonly GastoA3Source[]; readonly nominas?: readonly NominaA3Source[]; readonly movimientosBancarios?: readonly MovimientoBancarioA3Source[];
}
export interface A3Line {
  readonly asiento: number; readonly apunte: number; readonly fecha: string; readonly cuenta: string; readonly concepto: string;
  readonly debeCentimos: bigint; readonly haberCentimos: bigint; readonly documento: string;
  readonly diario: "VENTAS" | "COMPRAS" | "GASTOS" | "NOMINAS" | "BANCO";
}
export interface A3ExportResult {
  readonly csv: string; readonly lines: readonly A3Line[]; readonly incidences: readonly A3Incidence[]; readonly reviewRequired: true;
  readonly readiness: "incomplete" | "listo para prueba externa";
  readonly totals: Readonly<{ debeCentimos: string; haberCentimos: string; entries: number; lines: number; excludedBySource: Readonly<Record<A3SourceType, number>> }>;
}

type Source = Readonly<{ type: A3SourceType; id: string }>;
type Candidate = Omit<A3Line, "asiento" | "apunte">;
type DecimalValues = Record<string, bigint>;
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

function source(type: A3SourceType, id: string): Source { return { type, id }; }
function text(value: string | null | undefined): string { return (value ?? "").trim(); }
function accountText(value: string | null | undefined): value is string { return typeof value === "string" && /^\d+$/.test(value); }
function addIncident(list: A3Incidence[], s: Source, code: string, message: string, detail?: Readonly<Record<string, string | null>>, severity: A3Severity = "BLOQUEANTE"): void {
  list.push({ severity, code, sourceType: s.type, sourceId: s.id, message, ...(detail ? { detail } : {}) });
}

/** PostgreSQL float/decimal projected as ::text only: no Number, rounding or exponent coercion. */
export function parseExactDecimalToCents(value: ExactDecimal): bigint | null {
  if (typeof value !== "string") return null;
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = BigInt(match[2]) * HUNDRED + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -cents : cents;
}
export function formatA3Amount(cents: bigint): string {
  if (cents === ZERO) return "";
  const negative = cents < ZERO;
  const magnitude = negative ? -cents : cents;
  return `${negative ? "-" : ""}${(magnitude / HUNDRED).toString()},${(magnitude % HUNDRED).toString().padStart(2, "0")}`;
}
export function formatA3Date(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() + 1 !== Number(match[2]) || date.getUTCDate() !== Number(match[3])) return null;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Normalizes a source timestamp/date to the exact PostgreSQL `::date` key. */
export function a3CalendarDateKey(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/i.exec(value);
  return match && formatA3Date(match[1]) ? match[1] : null;
}
/** Matches SQL `(date::date, id::text) > (cursorDate::date, cursorId::text)`. */
export function isAfterA3DateIdKey(value: A3DateIdKey, cursor: A3DateIdKey | null): boolean {
  if (!cursor) return true;
  return value.date > cursor.date || (value.date === cursor.date && value.id > cursor.id);
}
/**
 * Pure model of one bounded keyset page. It exists for regression tests of the
 * SQL invariant; callers must give it the same date/id projection as SQL.
 */
export function readA3DateIdPage<T>(rows: readonly T[], cursor: A3DateIdKey | null, limit: number, key: (row: T) => A3DateIdKey): readonly T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("A3_PAGE_LIMIT_INVALID");
  return [...rows]
    .sort((left, right) => {
      const a = key(left); const b = key(right);
      return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
    })
    .filter((row) => isAfterA3DateIdKey(key(row), cursor))
    .slice(0, limit);
}

/**
 * Rejects the common false-positive counterpart: a same-account or non-opposite
 * bank movement. The DB reader obtains these facts from the actual B4 tables.
 */
export function isA3ConfirmedTransferPair(evidence: A3ConfirmedTransferPairEvidence): boolean {
  if (!evidence.bothCurrentB4TransferProofs) return false;
  if (!text(evidence.originMovementId) || !text(evidence.destinationMovementId) || evidence.originMovementId === evidence.destinationMovementId) return false;
  if (!text(evidence.originCuentaId) || !text(evidence.destinationCuentaId) || evidence.originCuentaId === evidence.destinationCuentaId) return false;
  const origin = parseExactDecimalToCents(evidence.originImporte);
  const destination = parseExactDecimalToCents(evidence.destinationImporte);
  return origin !== null && destination !== null && origin !== ZERO && destination !== ZERO && origin === -destination;
}

/** Escapes every field when needed, including CR/LF; a leading formula character is apostrophized. */
export function safeCsvText(raw: string): { value: string; formulaProtected: boolean } {
  const formulaProtected = /^[\t\r\n ]*[=+\-@]/.test(raw);
  return { value: formulaProtected ? `'${raw}` : raw, formulaProtected };
}
function csvField(raw: string | number): string {
  const value = String(raw);
  return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
export function renderA3Csv(lines: readonly A3Line[]): string {
  return [A3_HEADERS.join(";"), ...lines.map((line) => [
    line.asiento, line.apunte, line.fecha, line.cuenta, line.concepto.slice(0, 60),
    line.debeCentimos > ZERO ? formatA3Amount(line.debeCentimos) : "", line.haberCentimos > ZERO ? formatA3Amount(line.haberCentimos) : "",
    line.documento, line.diario,
  ].map(csvField).join(";"))].join("\r\n");
}
function candidate(fecha: string, cuenta: string, concepto: string, debeCentimos: bigint, haberCentimos: bigint, documento: string, diario: A3Line["diario"]): Candidate {
  return { fecha, cuenta, concepto, debeCentimos, haberCentimos, documento, diario };
}
/** Preserves canonical signed semantics: negative debit becomes credit and vice versa, explicitly. */
function signedDebit(fecha: string, cuenta: string, concepto: string, signed: bigint, documento: string, diario: A3Line["diario"]): Candidate {
  return signed >= ZERO ? candidate(fecha, cuenta, concepto, signed, ZERO, documento, diario) : candidate(fecha, cuenta, concepto, ZERO, -signed, documento, diario);
}
function signedCredit(fecha: string, cuenta: string, concepto: string, signed: bigint, documento: string, diario: A3Line["diario"]): Candidate {
  return signed >= ZERO ? candidate(fecha, cuenta, concepto, ZERO, signed, documento, diario) : candidate(fecha, cuenta, concepto, -signed, ZERO, documento, diario);
}
function pushEntry(lines: A3Line[], asiento: number, rows: readonly Candidate[]): number {
  let debe = ZERO; let haber = ZERO;
  for (const row of rows) {
    if (!accountText(row.cuenta) || row.debeCentimos < ZERO || row.haberCentimos < ZERO || (row.debeCentimos > ZERO && row.haberCentimos > ZERO)) throw new Error("A3_INTERNAL_INVALID_LINE");
    debe += row.debeCentimos; haber += row.haberCentimos;
  }
  if (debe === ZERO || debe !== haber) throw new Error("A3_INTERNAL_UNBALANCED_ENTRY");
  rows.forEach((row, index) => lines.push({ ...row, asiento, apunte: index + 1 }));
  return asiento + 1;
}
function needAccount(config: A3AccountConfig, key: AccountField, s: Source, incidents: A3Incidence[]): string | null {
  if (!config.explicitlySelected) { addIncident(incidents, s, "PERFIL_NO_SELECCIONADO", "Debe seleccionar explícitamente un perfil o una configuración manual; los valores actuales no se aplican implícitamente.", { configId: config.id }); return null; }
  const value = config.accounts[key];
  if (!accountText(value)) {
    const supplierRetention = key === "retencionProveedor";
    addIncident(incidents, s, supplierRetention ? "CUENTA_RETENCION_PROVEEDOR_PENDIENTE" : "CUENTA_CONFIGURACION_FALTANTE", supplierRetention ? "La retención de proveedor requiere una cuenta separada elegida por Contabilidad; no se afirma verificada ni se reutiliza 473." : "Falta una cuenta válida en el perfil/configuración elegido; no hay fallback contable.", { accountField: key, configId: config.id });
    return null;
  }
  return value;
}
function needDirectAccount(value: string | null, label: string, s: Source, incidents: A3Incidence[]): string | null {
  if (!accountText(value)) { addIncident(incidents, s, "CUENTA_CONTRAPARTIDA_FALTANTE", `Falta la cuenta explícita de ${label}; no se infiere por categoría, signo o texto.`, { label, raw: value }); return null; }
  return value;
}
function needDate(raw: string, s: Source, incidents: A3Incidence[]): string | null {
  const value = formatA3Date(raw);
  if (!value) addIncident(incidents, s, "FECHA_FUENTE_INVALIDA", "La fecha debe ser YYYY-MM-DD real; no se sustituye por fecha de cobro, pago o exportación.", { fecha: raw });
  return value;
}
function safeSourceText(raw: string, field: "concepto" | "documento", s: Source, incidents: A3Incidence[]): string {
  const protectedValue = safeCsvText(raw);
  if (protectedValue.formulaProtected) addIncident(incidents, s, "PROTECCION_FORMULA_CSV", `Se antepuso apóstrofo al ${field} para impedir interpretación de fórmula en hojas de cálculo; confirme el valor antes de la prueba externa.`, { field, raw }, "REVISION");
  return protectedValue.value;
}
function documentValue(raw: string | null, s: Source, incidents: A3Incidence[], required: boolean): string | null {
  const value = text(raw);
  if (required && !value) { addIncident(incidents, s, "DOCUMENTO_A3_FALTANTE", "Número de factura vacío; no se inventa un documento.", { documento: raw }); return null; }
  return safeSourceText(value, "documento", s, incidents);
}
function values(s: Source, incidents: A3Incidence[], input: Readonly<Record<string, ExactDecimal>>, nonZero: readonly string[] = []): DecimalValues | null {
  const output: DecimalValues = {};
  for (const [field, raw] of Object.entries(input)) {
    const amount = parseExactDecimalToCents(raw);
    if (amount === null) { addIncident(incidents, s, "IMPORTE_FUENTE_NO_EXACTO", "El importe debe llegar como decimal PostgreSQL ::text de hasta dos decimales; no se redondea.", { field, raw }); return null; }
    if (nonZero.includes(field) && amount === ZERO) { addIncident(incidents, s, "IMPORTE_CERO_NO_ADMITIDO", "El importe principal no puede ser cero; no se sustituye por cero conocido/desconocido.", { field, raw }); return null; }
    output[field] = amount;
  }
  return output;
}
function taxAccount(config: A3AccountConfig, side: "ivaRepercutido" | "ivaSoportado", rate: string | null, s: Source, incidents: A3Incidence[]): string | null {
  const normalized = text(rate).replace(/[.,]0+$/, "");
  const suffix = normalized === "21" ? "21" : normalized === "10" ? "10" : normalized === "4" ? "4" : null;
  if (!suffix) { addIncident(incidents, s, "TIPO_IVA_SIN_MAPA_EXPLICITO", "IVA no nulo sin tipo 21/10/4 mapeado explícitamente; no se usa 21% por defecto.", { tipoIva: rate }); return null; }
  return needAccount(config, `${side}${suffix}` as AccountField, s, incidents);
}
function receiptEligibility(item: FacturaRecibidaA3Source): string | null {
  if (item.calidad !== "VALIDA") return "calidad_no_valida";
  if (item.copiaDeId !== null) return "copia_de";
  if (item.conflictoIdentidad) return "conflicto_identidad";
  if (item.duplicadoExterno) return "duplicado_externo";
  if (["ERROR_OCR", "DESCONOCIDO"].includes(text(item.proveedor).toUpperCase())) return "proveedor_no_fiable";
  return null;
}
function blankCounts(): Record<A3SourceType, number> { return { FACTURA_EMITIDA: 0, FACTURA_RECIBIDA: 0, GASTO: 0, NOMINA: 0, MOVIMIENTO_BANCARIO: 0 }; }
function incidenceReady(incidents: readonly A3Incidence[]): "incomplete" | "listo para prueba externa" { return incidents.some((item) => item.severity === "BLOQUEANTE") ? "incomplete" : "listo para prueba externa"; }
function concept(raw: string, s: Source, incidents: A3Incidence[]): string { return safeSourceText(raw, "concepto", s, incidents); }

/** Builds an in-memory, review-required draft. It never sends, persists or marks a source as exported. */
export function prepareA3ParallelDraft(input: A3ExportInput): A3ExportResult {
  const incidents: A3Incidence[] = []; const lines: A3Line[] = []; const excluded = blankCounts(); let asiento = 1;
  const skip = (s: Source): void => { excluded[s.type] += 1; };

  // FI is canonical. facturaIspId is evidence only and never creates an additional ISP source read.
  const byIsp = new Map<string, FacturaEmitidaA3Source[]>();
  for (const item of input.facturasEmitidas ?? []) if (item.facturaIspId) byIsp.set(item.facturaIspId, [...(byIsp.get(item.facturaIspId) ?? []), item]);
  const duplicateFi = new Set<string>();
  for (const [ispId, rows] of byIsp) if (rows.length > 1) for (const item of rows) { duplicateFi.add(item.id); addIncident(incidents, source("FACTURA_EMITIDA", item.id), "MAPA_ISP_EXPLICITO_DUPLICADO", "Más de una FI canónica comparte facturaIspId explícito; se bloquean para evitar doble ingreso.", { facturaIspId: ispId }); }

  for (const item of input.facturasEmitidas ?? []) {
    const s = source("FACTURA_EMITIDA", item.id); if (duplicateFi.has(item.id)) { skip(s); continue; }
    const fecha = needDate(item.fecha, s, incidents); const documento = documentValue(item.numFactura, s, incidents, true);
    const a = values(s, incidents, { base: item.base, importeIva: item.importeIva, importeIrpf: item.importeIrpf, total: item.total }, ["base", "total"]);
    const cliente = needAccount(input.accountConfig, "clientes", s, incidents); const ventas = needAccount(input.accountConfig, "ventasServicios", s, incidents);
    if (!fecha || documento === null || !a || !cliente || !ventas) { skip(s); continue; }
    const iva = a.importeIva !== ZERO ? taxAccount(input.accountConfig, "ivaRepercutido", item.tipoIva, s, incidents) : null;
    const retencion = a.importeIrpf !== ZERO ? needAccount(input.accountConfig, "irpfRetenido", s, incidents) : null;
    if ((a.importeIva !== ZERO && !iva) || (a.importeIrpf !== ZERO && !retencion) || a.total + a.importeIrpf !== a.base + a.importeIva) {
      if (a.total + a.importeIrpf !== a.base + a.importeIva) addIncident(incidents, s, "TOTAL_FACTURA_NO_CUADRA", "FI: total + IRPF debe igualar base + IVA exactamente, también para abonos firmados.", { base: item.base, iva: item.importeIva, irpf: item.importeIrpf, total: item.total });
      skip(s); continue;
    }
    const label = concept(`FE ${documento} ${text(item.cliente)}`.trim(), s, incidents);
    // For an emitted invoice, 473 is debit. A signed credit note reverses both sides explicitly.
    asiento = pushEntry(lines, asiento, [signedDebit(fecha, cliente, label, a.total, documento, "VENTAS"), signedCredit(fecha, ventas, label, a.base, documento, "VENTAS"), ...(a.importeIva !== ZERO ? [signedCredit(fecha, iva!, label, a.importeIva, documento, "VENTAS")] : []), ...(a.importeIrpf !== ZERO ? [signedDebit(fecha, retencion!, label, a.importeIrpf, documento, "VENTAS")] : [])]);
  }

  for (const item of input.facturasRecibidas ?? []) {
    const s = source("FACTURA_RECIBIDA", item.id); const excludedReason = receiptEligibility(item);
    if (excludedReason) { addIncident(incidents, s, "FACTURA_RECIBIDA_EXCLUIDA_B2", "FR excluida por la fuente B2; se conserva como incidencia y no se borra.", { reason: excludedReason, calidad: item.calidad, copiaDeId: item.copiaDeId, proveedor: item.proveedor }, "REVISION"); skip(s); continue; }
    const fecha = needDate(item.fecha, s, incidents); const documento = documentValue(item.numFactura, s, incidents, true);
    const a = values(s, incidents, { base: item.base, importeIva: item.importeIva, importeIrpf: item.importeIrpf, total: item.total }, ["base", "total"]);
    const compras = needAccount(input.accountConfig, "comprasServicios", s, incidents); const proveedor = needAccount(input.accountConfig, "proveedores", s, incidents);
    if (!fecha || documento === null || !a || !compras || !proveedor) { skip(s); continue; }
    const iva = a.importeIva !== ZERO ? taxAccount(input.accountConfig, "ivaSoportado", item.tipoIva, s, incidents) : null;
    // Never repurpose the historic 473 value: Contabilidad must choose a separate supplier-retention account.
    const retencionProveedor = a.importeIrpf !== ZERO ? needAccount(input.accountConfig, "retencionProveedor", s, incidents) : null;
    if ((a.importeIva !== ZERO && !iva) || (a.importeIrpf !== ZERO && !retencionProveedor) || a.total + a.importeIrpf !== a.base + a.importeIva) {
      if (a.total + a.importeIrpf !== a.base + a.importeIva) addIncident(incidents, s, "TOTAL_FACTURA_NO_CUADRA", "FR: total + IRPF debe igualar base + IVA exactamente, también para abonos firmados.", { base: item.base, iva: item.importeIva, irpf: item.importeIrpf, total: item.total });
      skip(s); continue;
    }
    const label = concept(`FR ${documento} ${text(item.proveedor)}`.trim(), s, incidents);
    asiento = pushEntry(lines, asiento, [signedDebit(fecha, compras, label, a.base, documento, "COMPRAS"), ...(a.importeIva !== ZERO ? [signedDebit(fecha, iva!, label, a.importeIva, documento, "COMPRAS")] : []), signedCredit(fecha, proveedor, label, a.total, documento, "COMPRAS"), ...(a.importeIrpf !== ZERO ? [signedCredit(fecha, retencionProveedor!, label, a.importeIrpf, documento, "COMPRAS")] : [])]);
  }

  for (const item of input.gastos ?? []) {
    const s = source("GASTO", item.id); const fecha = needDate(item.fecha, s, incidents);
    // baseIva null remains blocked; it is never defaulted from importe.
    const a = values(s, incidents, { importe: item.importe, baseIva: item.baseIva, importeIva: item.importeIva }, ["importe"]);
    const gasto = needDirectAccount(item.cuentaGasto, "gasto", s, incidents); const contrapartida = needDirectAccount(item.cuentaContrapartida, "contrapartida de gasto", s, incidents);
    if (!fecha || !a || !gasto || !contrapartida) { skip(s); continue; }
    const label = concept(`GASTO ${text(item.concepto)} ${text(item.comercio)}`.trim(), s, incidents);
    if (!item.deducibleIva) { asiento = pushEntry(lines, asiento, [signedDebit(fecha, gasto, label, a.importe, "", "GASTOS"), signedCredit(fecha, contrapartida, label, a.importe, "", "GASTOS")]); continue; }
    const iva = a.importeIva !== ZERO ? taxAccount(input.accountConfig, "ivaSoportado", item.tipoIva, s, incidents) : null;
    if ((a.importeIva !== ZERO && !iva) || a.importe !== a.baseIva + a.importeIva) {
      if (a.importe !== a.baseIva + a.importeIva) addIncident(incidents, s, "TOTAL_GASTO_NO_CUADRA", "Gasto deducible: importe debe ser baseIva + importeIva exactamente; no hay base por defecto.", { importe: item.importe, baseIva: item.baseIva, importeIva: item.importeIva });
      skip(s); continue;
    }
    asiento = pushEntry(lines, asiento, [signedDebit(fecha, gasto, label, a.baseIva, "", "GASTOS"), ...(a.importeIva !== ZERO ? [signedDebit(fecha, iva!, label, a.importeIva, "", "GASTOS")] : []), signedCredit(fecha, contrapartida, label, a.importe, "", "GASTOS")]);
  }

  for (const item of input.nominas ?? []) {
    const s = source("NOMINA", item.id); const month = /^0?[1-9]$|^1[0-2]$/.test(item.mes) ? Number(item.mes) : null;
    if (!/^\d{4}$/.test(item.anio) || !month) { addIncident(incidents, s, "PERIODO_NOMINA_INVALIDO", "Nómina sin año/mes válido; no se inventa fecha.", { anio: item.anio, mes: item.mes }); skip(s); continue; }
    const a = values(s, incidents, { devengadoTotal: item.devengadoTotal, ssEmpresa: item.ssEmpresa, irpf: item.irpf, ssTrabajador: item.ssTrabajador, netoPercibir: item.netoPercibir }, ["devengadoTotal", "netoPercibir"]);
    const salarios = needAccount(input.accountConfig, "sueldosSalarios", s, incidents); const ssEmpresa = needAccount(input.accountConfig, "ssEmpresa", s, incidents); const irpf = needAccount(input.accountConfig, "irpfNominas", s, incidents); const ssTrabajador = needAccount(input.accountConfig, "ssTrabajador", s, incidents); const ssEmpresaPagar = needAccount(input.accountConfig, "ssEmpresaPagar", s, incidents); const neto = needAccount(input.accountConfig, "remuneracionesPendientes", s, incidents);
    if (!a || !salarios || !ssEmpresa || !irpf || !ssTrabajador || !ssEmpresaPagar || !neto) { skip(s); continue; }
    if (Object.values(a).some((amount) => amount < ZERO) || a.devengadoTotal + a.ssEmpresa !== a.irpf + a.ssTrabajador + a.ssEmpresa + a.netoPercibir) { addIncident(incidents, s, Object.values(a).some((amount) => amount < ZERO) ? "SIGNO_NOMINA_REQUIERE_REVISION" : "TOTAL_NOMINA_NO_CUADRA", "Nómina no cuadra en céntimos o tiene signo no admisible para este asiento; no se ajusta."); skip(s); continue; }
    const selected = text(item.fechaNominaISO);
    const dateIso = selected || `${item.anio}-${String(month).padStart(2, "0")}-28`;
    if (selected && (!formatA3Date(selected) || !selected.startsWith(`${item.anio}-${String(month).padStart(2, "0")}-`))) { addIncident(incidents, s, "FECHA_NOMINA_REVIEW_INVALIDA", "La fecha de nómina elegida debe ser real y pertenecer al mismo mes/año fuente.", { fechaNominaISO: item.fechaNominaISO ?? null }); skip(s); continue; }
    if (!selected) addIncident(incidents, s, "FECHA_NOMINA_LEGACY_28", "Se usa la convención histórica del día 28; requiere validación de gestoría antes de una prueba externa.", { fecha: dateIso }, "REVISION");
    const fecha = formatA3Date(dateIso)!; const label = concept(`NOMINA ${text(item.empleado) || "Empleado"} ${month}/${item.anio}`, s, incidents);
    asiento = pushEntry(lines, asiento, [signedDebit(fecha, salarios, label, a.devengadoTotal, "", "NOMINAS"), ...(a.ssEmpresa !== ZERO ? [signedDebit(fecha, ssEmpresa, label, a.ssEmpresa, "", "NOMINAS")] : []), ...(a.irpf !== ZERO ? [signedCredit(fecha, irpf, label, a.irpf, "", "NOMINAS")] : []), ...(a.ssTrabajador !== ZERO ? [signedCredit(fecha, ssTrabajador, label, a.ssTrabajador, "", "NOMINAS")] : []), ...(a.ssEmpresa !== ZERO ? [signedCredit(fecha, ssEmpresaPagar, label, a.ssEmpresa, "", "NOMINAS")] : []), signedCredit(fecha, neto, label, a.netoPercibir, "", "NOMINAS")]);
  }

  for (const item of input.movimientosBancarios ?? []) {
    const s = source("MOVIMIENTO_BANCARIO", item.id);
    if (item.traspasoB4Confirmado) { addIncident(incidents, s, "TRASPASO_B4_CONFIRMADO_EXCLUIDO", "Traspaso excluido únicamente por snapshot de evidencia B4 TRASPASO explícita; no se usa texto, categoría ni IBAN.", undefined, "REVISION"); skip(s); continue; }
    const fecha = needDate(item.fechaOperacion, s, incidents); const importe = parseExactDecimalToCents(item.importe);
    const banco = item.cuentaId ? needDirectAccount(input.accountConfig.bankAccountByCuentaId[item.cuentaId] ?? null, "banco de la cuenta", s, incidents) : null;
    const contrapartida = needDirectAccount(item.cuentaContrapartida, "contrapartida bancaria", s, incidents); const contraparteHumana = text(item.contraparteHumana);
    const documento = documentValue(item.referencia, s, incidents, false);
    if (importe === null || importe === ZERO) addIncident(incidents, s, "IMPORTE_BANCO_NO_EXACTO", "Importe bancario ausente, cero o no exacto; no se redondea ni se crea una comisión/caja ficticia.", { importe: item.importe });
    if (!contraparteHumana) addIncident(incidents, s, "CONTRAPARTE_BANCO_FALTANTE", "Falta contraparte humana seleccionada por línea; no se elige 400/430 por signo ni por texto bancario.");
    if (!fecha || importe === null || importe === ZERO || !banco || !contrapartida || !contraparteHumana || documento === null) { skip(s); continue; }
    const label = concept(`BANCO ${contraparteHumana} ${text(item.concepto)}`.trim(), s, incidents);
    // The selected counterparty determines the account; sign only determines debit/haber orientation.
    asiento = pushEntry(lines, asiento, importe > ZERO ? [signedDebit(fecha, banco, label, importe, documento, "BANCO"), signedCredit(fecha, contrapartida, label, importe, documento, "BANCO")] : [signedDebit(fecha, contrapartida, label, -importe, documento, "BANCO"), signedCredit(fecha, banco, label, -importe, documento, "BANCO")]);
  }

  const debe = lines.reduce((sum, line) => sum + line.debeCentimos, ZERO); const haber = lines.reduce((sum, line) => sum + line.haberCentimos, ZERO);
  if (debe !== haber) throw new Error("A3_INTERNAL_GLOBAL_UNBALANCED");
  return { csv: renderA3Csv(lines), lines, incidences: incidents, reviewRequired: true, readiness: incidenceReady(incidents), totals: { debeCentimos: debe.toString(), haberCentimos: haber.toString(), entries: asiento - 1, lines: lines.length, excludedBySource: excluded } };
}
