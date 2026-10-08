export type InvoiceLine = {
  descripcion: string;
  cantidad: number | null;
  precioUnitario: number | null;
  base: number | null;
};
export type ContractReference = {
  id: number;
  titulo: string;
  tarifa: string;
  precio: number;
  concepto: string | null;
  fechaInicio: string | null;
  fechaBaja: string | null;
  activo: boolean;
  vigencia: 'en_periodo' | 'fuera_periodo' | 'sin_confirmar';
};
export type SaleInvoiceContext = {
  facturaId: string;
  numFactura: string;
  cliente: string;
  clienteWebId: number | null;
  fecha: string;
  base: number;
  importeIva: number;
  total: number;
  lineas: InvoiceLine[];
  lineasConciliadas: boolean | null;
  avisoLineas: string | null;
  contratos: ContractReference[];
  totalContratos: number;
  page: number;
  totalPages: number;
  filtroContratos: 'periodo' | 'actuales' | 'todos';
};

function amount(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^-?\d+(\.\d+)?$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Only recorded, explicit amounts are shown. Contract prices never create invoice lines. */
export function parseRecordedLines(raw: string | null, base: number) {
  const empty = { lineas: [] as InvoiceLine[], lineasConciliadas: null as boolean | null, avisoLineas: null as string | null };
  if (!raw || !raw.trim()) return empty;
  if (raw.length > 256_000) return { ...empty, avisoLineas: 'El detalle registrado supera el límite de consulta.' };
  let rows: unknown;
  try { rows = JSON.parse(raw); } catch { return { ...empty, avisoLineas: 'El detalle de líneas registrado necesita revisión.' }; }
  if (!Array.isArray(rows) || rows.length > 200) return { ...empty, avisoLineas: 'El formato de las líneas registradas necesita revisión.' };
  const lineas: InvoiceLine[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const r = row as Record<string, unknown>;
    const description = r.descripcion ?? r.concepto ?? r.description;
    if (typeof description !== 'string' || !description.trim()) continue;
    lineas.push({ descripcion: description.trim().slice(0, 4000), cantidad: amount(r.cantidad ?? r.quantity),
      precioUnitario: amount(r.precioUnitario ?? r.precio_unitario ?? r.precio),
      base: amount(r.base ?? r.base_imponible) });
  }
  const comparable = lineas.length === rows.length && lineas.length > 0 && lineas.every(row => row.base !== null);
  const lineasConciliadas = comparable ? lineas.reduce((sum, row) => sum + Math.round(row.base! * 100), 0) === Math.round(base * 100) : null;
  return { lineas, lineasConciliadas, avisoLineas: lineas.length !== rows.length
    ? 'Algunas líneas registradas no tienen una descripción válida.'
    : lineasConciliadas === false ? 'Las bases registradas en las líneas no cuadran con la base de la factura; no se han recalculado.' : null };
}

export function contractValidity(start: string | null, end: string | null, active: boolean, invoiceDate: string): ContractReference['vigencia'] {
  const monthStart = `${invoiceDate.slice(0, 7)}-01`;
  const parsed = new Date(`${monthStart}T00:00:00.000Z`);
  parsed.setUTCMonth(parsed.getUTCMonth() + 1);
  const monthEnd = parsed.toISOString().slice(0, 10);
  if ((start && start >= monthEnd) || (end && end < monthStart)) return 'fuera_periodo';
  if (!start || (!active && !end)) return 'sin_confirmar';
  return 'en_periodo';
}
