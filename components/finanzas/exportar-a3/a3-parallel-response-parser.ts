export type AccountField =
  | "clientes" | "proveedores" | "ventasServicios" | "comprasServicios"
  | "ivaRepercutido21" | "ivaRepercutido10" | "ivaRepercutido4"
  | "ivaSoportado21" | "ivaSoportado10" | "ivaSoportado4"
  | "irpfRetenido" | "retencionProveedor" | "sueldosSalarios" | "ssEmpresa"
  | "irpfNominas" | "ssTrabajador" | "ssEmpresaPagar" | "remuneracionesPendientes";

export type A3Scope = "fi" | "fr" | "gastos" | "nominas" | "bank" | "todo";
export type ReviewSource = Exclude<A3Scope, "todo">;
export type A3Status = "idle" | "loading" | "ready" | "error";

export type A3ConfigResponse = {
  profiles: Array<{
    id: string;
    label: string;
    requiresExplicitSelection: true;
    accounts: Partial<Record<AccountField, string | null>>;
  }>;
  bankAccounts: Array<{ id: string; label: string; active: boolean }>;
  warning: string;
};

export type A3Incidence = {
  severity: "BLOQUEANTE" | "REVISION";
  code: string;
  sourceType: string;
  sourceId: string;
  message: string;
  detail?: Record<string, string | null>;
};

export type A3Preview = {
  dataHash: string;
  configVersionSHA: string;
  readiness: "incomplete" | "listo para prueba externa";
  assertion: string;
  counts: {
    lines: number;
    seats: number;
    debeCentimos: string;
    haberCentimos: string;
    excludedBySource: Record<string, number>;
    incidences: number;
    missingMappings: number;
  };
  incidenceSummary: Record<string, { bloqueantes: number; revision: number }>;
  incidences: A3Incidence[];
  incidenceNextOffset: number | null;
  lines: Array<{
    asiento: number;
    apunte: number;
    fecha: string;
    cuenta: string;
    concepto: string;
    debeCentimos: string;
    haberCentimos: string;
    documento: string;
    diario: string;
  }>;
  linesOffset: number;
  linesNextOffset: number | null;
  sourcePage: {
    items: Array<{ source: ReviewSource; id: string; fecha: string; label: string }>;
    offset: number;
    nextOffset: number | null;
    total: number;
  };
  warnings: string[];
};

export type A3PreviewExpectation = {
  mes: string;
  scope: A3Scope;
  page: { source: ReviewSource | null; offset: number; linesOffset: number };
};

const accountFields = new Set<AccountField>([
  "clientes", "proveedores", "ventasServicios", "comprasServicios",
  "ivaRepercutido21", "ivaRepercutido10", "ivaRepercutido4",
  "ivaSoportado21", "ivaSoportado10", "ivaSoportado4",
  "irpfRetenido", "retencionProveedor", "sueldosSalarios", "ssEmpresa",
  "irpfNominas", "ssTrabajador", "ssEmpresaPagar", "remuneracionesPendientes",
]);
const reviewSources = new Set<ReviewSource>(["fi", "fr", "gastos", "nominas", "bank"]);
const hashPattern = /^[a-f0-9]{64}$/;
const centsPattern = /^-?\d+$/;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

/** A server response that is structurally wrong is unsafe to render or to download from. */
export class A3ClientContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "A3ClientContractError";
  }
}

function invalid(path: string): never {
  throw new A3ClientContractError(`Contrato A3 inválido en ${path}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path);
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path);
  return value;
}
function string(value: unknown, path: string, allowEmpty = true): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) invalid(path);
  return value;
}
function nullableOffset(value: unknown, path: string): number | null {
  return value === null ? null : nonNegativeInteger(value, path);
}
function nonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) invalid(path);
  return value;
}
function positiveInteger(value: unknown, path: string): number {
  const parsed = nonNegativeInteger(value, path);
  if (parsed < 1) invalid(path);
  return parsed;
}
function nullableAccount(value: unknown, path: string): string | null {
  if (value === null) return null;
  const parsed = string(value, path, false);
  if (!/^\d+$/.test(parsed)) invalid(path);
  return parsed;
}
function strictHash(value: unknown, path: string): string {
  const parsed = string(value, path, false);
  if (!hashPattern.test(parsed)) invalid(path);
  return parsed;
}
function strictCents(value: unknown, path: string): string {
  const parsed = string(value, path, false);
  if (!centsPattern.test(parsed)) invalid(path);
  return parsed;
}
function reviewSource(value: unknown, path: string): ReviewSource {
  if (typeof value !== "string" || !reviewSources.has(value as ReviewSource)) invalid(path);
  return value as ReviewSource;
}

/** Parses GET metadata without filling missing accounts, profiles, bank accounts or warning text. */
export function parseA3ConfigResponse(value: unknown): A3ConfigResponse {
  const root = record(value, "respuesta");
  if (root.kind !== "A3_BORRADOR_PARALELO_CONFIG") invalid("kind");

  const profiles = array(root.profiles, "profiles").map((entry, index) => {
    const profile = record(entry, `profiles[${index}]`);
    if (profile.requiresExplicitSelection !== true) invalid(`profiles[${index}].requiresExplicitSelection`);
    const rawAccounts = record(profile.accounts, `profiles[${index}].accounts`);
    const accounts: Partial<Record<AccountField, string | null>> = {};
    for (const [field, account] of Object.entries(rawAccounts)) {
      if (!accountFields.has(field as AccountField)) invalid(`profiles[${index}].accounts.${field}`);
      accounts[field as AccountField] = nullableAccount(account, `profiles[${index}].accounts.${field}`);
    }
    return {
      id: string(profile.id, `profiles[${index}].id`, false),
      label: string(profile.label, `profiles[${index}].label`, false),
      requiresExplicitSelection: true as const,
      accounts,
    };
  });

  const bankAccounts = array(root.bankAccounts, "bankAccounts").map((entry, index) => {
    const account = record(entry, `bankAccounts[${index}]`);
    if (typeof account.active !== "boolean") invalid(`bankAccounts[${index}].active`);
    return {
      id: string(account.id, `bankAccounts[${index}].id`, false),
      label: string(account.label, `bankAccounts[${index}].label`, false),
      active: account.active,
    };
  });

  return { profiles, bankAccounts, warning: string(root.warning, "warning", false) };
}

/** Parses POST preview JSON and ties period, scope and page offsets to the request that produced it. */
export function parseA3PreviewResponse(value: unknown, expected: A3PreviewExpectation): A3Preview {
  if (!monthPattern.test(expected.mes)) invalid("solicitud.mes");
  const root = record(value, "respuesta");
  if (root.kind !== "A3_BORRADOR_PARALELO") invalid("kind");
  if (string(root.period, "period", false) !== expected.mes) invalid("period");
  if (root.scope !== expected.scope) invalid("scope");
  if (root.reviewRequired !== true) invalid("reviewRequired");

  const readiness = root.readiness;
  if (readiness !== "incomplete" && readiness !== "listo para prueba externa") invalid("readiness");
  const rawCounts = record(root.counts, "counts");
  const rawExcluded = record(rawCounts.excludedBySource, "counts.excludedBySource");
  const excludedBySource: Record<string, number> = {};
  for (const source of ["FACTURA_EMITIDA", "FACTURA_RECIBIDA", "GASTO", "NOMINA", "MOVIMIENTO_BANCARIO"]) {
    excludedBySource[source] = nonNegativeInteger(rawExcluded[source], `counts.excludedBySource.${source}`);
  }

  const rawSummary = record(root.incidenceSummary, "incidenceSummary");
  const incidenceSummary: Record<string, { bloqueantes: number; revision: number }> = {};
  for (const [source, entry] of Object.entries(rawSummary)) {
    const item = record(entry, `incidenceSummary.${source}`);
    incidenceSummary[source] = {
      bloqueantes: nonNegativeInteger(item.bloqueantes, `incidenceSummary.${source}.bloqueantes`),
      revision: nonNegativeInteger(item.revision, `incidenceSummary.${source}.revision`),
    };
  }

  const incidences = array(root.incidences, "incidences").map((entry, index) => {
    const item = record(entry, `incidences[${index}]`);
    if (item.severity !== "BLOQUEANTE" && item.severity !== "REVISION") invalid(`incidences[${index}].severity`);
    const severity: A3Incidence["severity"] = item.severity;
    let detail: Record<string, string | null> | undefined;
    if (item.detail !== undefined) {
      const rawDetail = record(item.detail, `incidences[${index}].detail`);
      detail = {};
      for (const [key, detailValue] of Object.entries(rawDetail)) {
        if (detailValue !== null && typeof detailValue !== "string") invalid(`incidences[${index}].detail.${key}`);
        detail[key] = detailValue as string | null;
      }
    }
    return {
      severity,
      code: string(item.code, `incidences[${index}].code`, false),
      sourceType: string(item.sourceType, `incidences[${index}].sourceType`, false),
      sourceId: string(item.sourceId, `incidences[${index}].sourceId`, false),
      message: string(item.message, `incidences[${index}].message`, false),
      ...(detail ? { detail } : {}),
    };
  });

  const lines = array(root.lines, "lines").map((entry, index) => {
    const line = record(entry, `lines[${index}]`);
    const diario = string(line.diario, `lines[${index}].diario`, false);
    if (!["VENTAS", "COMPRAS", "GASTOS", "NOMINAS", "BANCO"].includes(diario)) invalid(`lines[${index}].diario`);
    return {
      asiento: positiveInteger(line.asiento, `lines[${index}].asiento`),
      apunte: positiveInteger(line.apunte, `lines[${index}].apunte`),
      fecha: string(line.fecha, `lines[${index}].fecha`, false),
      cuenta: string(line.cuenta, `lines[${index}].cuenta`, false),
      concepto: string(line.concepto, `lines[${index}].concepto`),
      debeCentimos: strictCents(line.debeCentimos, `lines[${index}].debeCentimos`),
      haberCentimos: strictCents(line.haberCentimos, `lines[${index}].haberCentimos`),
      documento: string(line.documento, `lines[${index}].documento`),
      diario,
    };
  });

  const rawSourcePage = record(root.sourcePage, "sourcePage");
  const sourceOffset = nonNegativeInteger(rawSourcePage.offset, "sourcePage.offset");
  if (sourceOffset !== expected.page.offset) invalid("sourcePage.offset");
  const sourcePage = {
    items: array(rawSourcePage.items, "sourcePage.items").map((entry, index) => {
      const item = record(entry, `sourcePage.items[${index}]`);
      const source = reviewSource(item.source, `sourcePage.items[${index}].source`);
      if (expected.page.source !== null && source !== expected.page.source) invalid(`sourcePage.items[${index}].source`);
      return {
        source,
        id: string(item.id, `sourcePage.items[${index}].id`, false),
        fecha: string(item.fecha, `sourcePage.items[${index}].fecha`, false),
        label: string(item.label, `sourcePage.items[${index}].label`, false),
      };
    }),
    offset: sourceOffset,
    nextOffset: nullableOffset(rawSourcePage.nextOffset, "sourcePage.nextOffset"),
    total: nonNegativeInteger(rawSourcePage.total, "sourcePage.total"),
  };

  const linesOffset = nonNegativeInteger(root.linesOffset, "linesOffset");
  if (linesOffset !== expected.page.linesOffset) invalid("linesOffset");
  return {
    dataHash: strictHash(root.dataHash, "dataHash"),
    configVersionSHA: strictHash(root.configVersionSHA, "configVersionSHA"),
    readiness,
    assertion: string(root.assertion, "assertion", false),
    counts: {
      lines: nonNegativeInteger(rawCounts.lines, "counts.lines"),
      seats: nonNegativeInteger(rawCounts.seats, "counts.seats"),
      debeCentimos: strictCents(rawCounts.debeCentimos, "counts.debeCentimos"),
      haberCentimos: strictCents(rawCounts.haberCentimos, "counts.haberCentimos"),
      excludedBySource,
      incidences: nonNegativeInteger(rawCounts.incidences, "counts.incidences"),
      missingMappings: nonNegativeInteger(rawCounts.missingMappings, "counts.missingMappings"),
    },
    incidenceSummary,
    incidences,
    incidenceNextOffset: nullableOffset(root.incidenceNextOffset, "incidenceNextOffset"),
    lines,
    linesOffset,
    linesNextOffset: nullableOffset(root.linesNextOffset, "linesNextOffset"),
    sourcePage,
    warnings: array(root.warnings, "warnings").map((warning, index) => string(warning, `warnings[${index}]`, false)),
  };
}

/** Stable client-side snapshot key for the exact mutable review request, including config and mappings. */
export function stableA3Json(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableA3Json).join(",")}]`;
  if (!value || typeof value !== "object") throw new A3ClientContractError("No se puede serializar el payload A3");
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stableA3Json(item[key])}`).join(",")}}`;
}

/** Extracts only a declared server error; callers keep their safe local fallback otherwise. */
export function a3ApiErrorMessage(value: unknown, fallback: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const error = (value as Record<string, unknown>).error;
  return typeof error === "string" && error.trim() ? error : fallback;
}
