export type Row = Record<string, any>;
export type Mode = 'real' | 'contratado';
export type Report = Row & { period: string; mode: Mode; products: Row[]; monthly: Row[]; clients: Row[]; comparison: Row[]; alerts: Row[]; rules: Row[]; externalCosts: Row[]; runs: Row[]; notices: string[]; snapshots: Row[] };
export type Column = { key: string; label: string; kind?: 'money' | 'percent' | 'number' | 'status'; value?: (row: Row) => unknown; estimated?: (row: Row) => boolean };
export const array = (value: unknown): Row[] => Array.isArray(value) ? value : [];
export function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const number = Number(value); return Number.isFinite(number) ? number : null;
}
export const isPending = (row: Row) => row.pending === true || row.pendingCost === true || row.status === 'PENDIENTE' || row.estado === 'PENDIENTE';
export const isEstimated = (row: Row) => row.status === 'ESTIMADO' || row.estado === 'ESTIMADO';
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Coste estimado del periodo (nunca real). */
export const estimatedOf = (row: Row): number => numeric(row.rawEstimatedCost ?? row.estimatedCost) ?? 0;
export const hasEstimate = (row: Row) => isEstimated(row) || estimatedOf(row) > 0;
/** Sin ningún coste conocido (ni real ni estimado) y pendiente: el margen sería ingreso puro, no se muestra como margen. */
export const noKnownCost = (row: Row) => (numeric(row.rawCost ?? row.cost) ?? 0) === 0 && estimatedOf(row) === 0 && isPending(row);
/** Calidad del coste: porcentaje del coste conocido que es real (factura, nómina o regla firmada). */
export function costQuality(row: Row): number | null {
  const real = numeric(row.rawCost ?? row.cost) ?? 0, total = real + estimatedOf(row);
  return total > 0 ? Math.round(1000 * real / total) / 10 : null;
}
export function amount(row: Row, field: 'income' | 'cost' | 'costTotal' | 'margin' | 'marginPct', mode: Mode): number | null {
  const income = numeric(row.income);
  if (field === 'income') return income;
  if (mode === 'contratado') {
    if (isPending(row) || isEstimated(row)) return null;
    if (field === 'cost' || field === 'costTotal') return numeric(row.cost);
    if (income === null || numeric(row.cost) === null) return null;
    return numeric(row[field]);
  }
  // Modo real: el coste real y el estimado se ven siempre; el estado es un indicador de calidad, no un motivo para ocultar cifras.
  const cost = numeric(row.rawCost ?? row.cost);
  if (cost === null) return null;
  if (field === 'cost') return numeric(row.cost);
  const total = cost + estimatedOf(row);
  if (field === 'costTotal') return r2(total);
  const rawIncome = numeric(row.rawIncome) ?? income;
  if (rawIncome === null || noKnownCost(row)) return null;
  const margin = rawIncome - total;
  if (field === 'margin') return r2(margin);
  return rawIncome ? r2(100 * margin / rawIncome) : null;
}
export function rowStatus(row: Row, mode: Mode): string {
  if (mode === 'contratado') return isPending(row) ? 'PENDIENTE' : 'CONTRATADO';
  if (noKnownCost(row)) return 'SIN COSTE';
  if (hasEstimate(row)) return 'ESTIMADO';
  return isPending(row) ? 'PENDIENTE' : 'REAL';
}
export function financialColumns(mode: Mode): Column[] {
  const real = mode === 'real';
  return [
    { key: 'income', label: real ? 'Ingreso facturado' : 'Ingreso contratado', kind: 'money', value: row => amount(row, 'income', mode) },
    { key: 'otherIncome', label: real ? 'Ingreso contratado' : 'Ingreso real (contraste)', kind: 'money', value: row => numeric(real ? row.rawContractedIncome ?? row.contractedIncome : row.actualIncome) },
    { key: 'cost', label: real ? 'Coste real (facturas)' : 'Coste proveedor firmado', kind: 'money', value: row => amount(row, 'cost', mode) },
    { key: 'otherCost', label: real ? 'Coste proveedor firmado' : 'Coste real (contraste)', kind: 'money', value: row => real ? row.contractedCostPending ? null : numeric(row.contractedCost) : row.actualPending ? null : numeric(row.actualCost) },
    { key: 'estimatedCost', label: 'Coste estimado (no real)', kind: 'money', estimated: () => true },
    ...(real ? [{ key: 'oneOffCost', label: 'De ello, coste puntual (no recurrente)', kind: 'money' as const, value: (row: Row) => numeric(row.oneOffCost) }] : []),
    ...(real ? [{ key: 'costTotal', label: 'Coste total (real + estimado)', kind: 'money' as const, value: (row: Row) => amount(row, 'costTotal', mode), estimated: (row: Row) => hasEstimate(row) }] : []),
    { key: 'margin', label: real ? 'Margen (con estimado)' : 'Margen verificable', kind: 'money', value: row => amount(row, 'margin', mode), estimated: (row: Row) => real && hasEstimate(row) },
    { key: 'marginPct', label: 'Margen %', kind: 'percent', value: row => amount(row, 'marginPct', mode), estimated: (row: Row) => real && hasEstimate(row) },
    ...(real ? [{ key: 'quality', label: 'Calidad (% coste real)', kind: 'percent' as const, value: (row: Row) => costQuality(row) }] : []),
    { key: 'status', label: 'Estado', kind: 'status', value: row => rowStatus(row, mode) },
  ];
}
export const euro = (value: unknown) => { const n = numeric(value); return n === null ? '—' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n); };
export function display(value: unknown, kind?: Column['kind']): string {
  if (value === null || value === undefined || value === '') return '—';
  if (kind === 'money') return euro(value);
  if (kind === 'number' || kind === 'percent') { const n = numeric(value); return n === null ? '—' : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: kind === 'percent' ? 2 : 0 }).format(n)}${kind === 'percent' ? ' %' : ''}`; }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object') return 'Detalle disponible';
  return String(value);
}
export function sumKnown(rows: Row[], field: string): number | null {
  if (!rows.length || rows.some(row => numeric(row[field]) === null)) return null;
  return rows.reduce((total, row) => total + numeric(row[field])!, 0);
}
export function cleanExcelText(value: string): string { return /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value; }

/** Historical pairs remain reference-only, without a monthly operational cost. */
export function historicalDraxtonRows(references: unknown): Row[] {
  const locator = (value: Row | undefined) => value?.file && value?.sheet && value?.cell
    ? `${value.file} → ${value.sheet}!${value.cell}` : 'Localizador pendiente';
  return array(references).filter(row => row.kind === 'draxton_contract_reference'
    && row.referenceOnly === true && row.operationalImportAllowed === false).map(row => ({
      key: row.key,
      title: row.title,
      referenceContractedCost: numeric(row.referenceContractedCost),
      referenceBilledCost: numeric(row.referenceBilledCost),
      referenceDifference: numeric(row.referenceDifference),
      periodLabel: row.periodLabel ?? 'Cobertura mensual no acreditada',
      contractedLocator: locator(row.contractedSourceLocator),
      billedLocator: locator(row.billedSourceLocator),
      note: row.note,
      nature: 'REFERENCIA HISTÓRICA · NO REAL',
    }));
}

/** Ingreso facturado por naturaleza (recurrente, Servicios IT, instalaciones y puntuales). Solo lectura sobre el informe. */
export function incomeNatureRows(products: Row[]): Row[] {
  const rows = array(products).filter(row => numeric(row.income) !== null && (numeric(row.income) !== 0 || numeric(row.incomeIT) || numeric(row.incomeOneOff))).map(row => {
    const income = numeric(row.income) ?? 0, it = numeric(row.incomeIT) ?? 0, oneOff = numeric(row.incomeOneOff) ?? 0;
    const recurring = numeric(row.incomeRecurring) ?? Math.round((income - it - oneOff) * 100) / 100;
    return { key: row.product, product: row.product, incomeRecurring: recurring, incomeIT: it, incomeOneOff: oneOff, income, oneOffPct: income ? Math.round(10000 * oneOff / income) / 100 : null };
  });
  const total = rows.reduce((t, r) => ({ incomeRecurring: t.incomeRecurring + r.incomeRecurring, incomeIT: t.incomeIT + r.incomeIT, incomeOneOff: t.incomeOneOff + r.incomeOneOff, income: t.income + r.income }), { incomeRecurring: 0, incomeIT: 0, incomeOneOff: 0, income: 0 });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return [...rows, { key: 'TOTAL', product: 'TOTAL', incomeRecurring: r2(total.incomeRecurring), incomeIT: r2(total.incomeIT), incomeOneOff: r2(total.incomeOneOff), income: r2(total.income), oneOffPct: total.income ? Math.round(10000 * total.incomeOneOff / total.income) / 100 : null }];
}
/** Coste por producto: real (con factura/nómina/regla firmada) frente a estimado, con cada fuente estimada marcada. */
export function costRealVsEstimatedRows(products: Row[]): Row[] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const rows = array(products).filter(row => (numeric(row.cost) ?? 0) !== 0 || (numeric(row.estimatedCost) ?? 0) !== 0).map(row => {
    const real = numeric(row.cost) ?? 0, estimated = numeric(row.estimatedCost) ?? 0, sources = array(row.sources);
    const estimatedSources = sources.filter(source => source.status && source.status !== 'REAL' && (numeric(source.amount) ?? 0) !== 0);
    const total = r2(real + estimated);
    return { key: row.product, product: row.product, costReal: r2(real), costEstimated: r2(estimated), costTotal: total, estimatedPct: total ? r2(100 * estimated / total) : null, estimatedSources, status: estimated !== 0 ? (real !== 0 ? 'REAL + ESTIMADO' : 'ESTIMADO') : 'REAL', sources };
  });
  const total = rows.reduce((t, r) => ({ real: t.real + r.costReal, estimated: t.estimated + r.costEstimated }), { real: 0, estimated: 0 });
  const all = r2(total.real + total.estimated);
  return [...rows, { key: 'TOTAL', product: 'TOTAL', costReal: r2(total.real), costEstimated: r2(total.estimated), costTotal: all, estimatedPct: all ? r2(100 * total.estimated / all) : null, estimatedSources: [], status: total.estimated ? 'REAL + ESTIMADO' : 'REAL', sources: [] }];
}
