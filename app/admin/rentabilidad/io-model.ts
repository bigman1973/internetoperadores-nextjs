import { amount, array, costQuality, estimatedOf, hasEstimate, isPending, numeric, type Mode, type Report, type Row } from './view-model';
import { tipoPorDocumento, tipoPorNombre, type TipoCliente } from '@/lib/subida-precios/calc';

const r2 = (n: number) => Math.round(n * 100) / 100;

/* ───────── Totales de un conjunto de productos ───────── */
export type Totals = { income: number | null; cost: number | null; costReal: number; costEst: number; margin: number | null; marginPct: number | null; quality: number | null; estimated: boolean; hasData: boolean };
export function totalsOf(products: Row[], mode: Mode): Totals {
  const rows = array(products);
  const income = rows.reduce((t, p) => t + (amount(p, 'income', mode) ?? 0), 0);
  const hasData = rows.some(p => (numeric(p.income) ?? 0) !== 0 || (numeric(p.rawCost ?? p.cost) ?? 0) !== 0 || estimatedOf(p) !== 0);
  if (mode === 'contratado') {
    const known = rows.map(p => amount(p, 'cost', mode)); const complete = known.every(v => v !== null);
    const cost = known.reduce<number>((t, v) => t + (v ?? 0), 0);
    return { income: r2(income), cost: complete ? r2(cost) : null, costReal: r2(cost), costEst: 0, margin: complete ? r2(income - cost) : null, marginPct: complete && income ? r2(100 * (income - cost) / income) : null, quality: null, estimated: false, hasData };
  }
  const costReal = rows.reduce((t, p) => t + (numeric(p.rawCost ?? p.cost) ?? 0), 0), costEst = rows.reduce((t, p) => t + estimatedOf(p), 0);
  const cost = costReal + costEst; const rawIncome = rows.reduce((t, p) => t + (numeric(p.rawIncome) ?? numeric(p.income) ?? 0), 0);
  return { income: r2(income), cost: r2(cost), costReal: r2(costReal), costEst: r2(costEst), margin: r2(rawIncome - cost), marginPct: rawIncome ? r2(100 * (rawIncome - cost) / rawIncome) : null, quality: cost > 0 ? Math.round(1000 * costReal / cost) / 10 : null, estimated: costEst > 0, hasData };
}
export const monthsOf = (period: string) => Array.from({ length: 12 }, (_, i) => `${period.slice(0, 4)}-${String(i + 1).padStart(2, '0')}`);
export const monthProducts = (report: Report, month: string) => array(array(report.monthly).find(m => m.month === month)?.products);
/** Margen % de un producto en un mes (nulo para meses posteriores al seleccionado, que son previsión). */
export function productMonthMargin(report: Report, product: string, month: string, mode: Mode): { value: number | null; estimated: boolean } {
  if (month > report.period) return { value: null, estimated: false };
  const item = monthProducts(report, month).find(p => p.product === product); if (!item) return { value: null, estimated: false };
  return { value: amount(item, 'marginPct', mode), estimated: mode === 'real' && hasEstimate(item) };
}

/* ───────── Alertas en lenguaje llano ───────── */
export type AlertInfo = { title: string; todo: string; level: 'bad' | 'warn' | 'info'; order: number };
export const ALERT_INFO: Record<string, AlertInfo> = {
  FACTURA_PROVEEDOR_PENDIENTE: { title: 'Faltan facturas de proveedor', todo: 'Mientras no lleguen, el coste se estima. Revisa la sincronización de facturas recibidas o añádelas a mano.', level: 'warn', order: 1 },
  MARGEN_NEGATIVO: { title: 'Clientes con margen negativo', todo: 'Revisa el precio o el coste. Son candidatos para la subida de precios.', level: 'bad', order: 2 },
  COSTE_EXTERNO_POR_CONFIRMAR: { title: 'Costes de Vola por confirmar', todo: 'Confirma el importe propuesto con un clic; queda guardado como regla.', level: 'warn', order: 3 },
  CONTRATO_SIN_PROVEEDOR: { title: 'Contratos sin proveedor asignado', todo: 'Asigna el proveedor (una vez) y se calculará su coste cada mes.', level: 'warn', order: 4 },
  DIFERENCIA_PRECIO: { title: 'Precio facturado distinto del contratado', todo: 'Comprueba si hay un cambio de tarifa o un error de facturación.', level: 'warn', order: 5 },
  CONTRATO_SIN_FACTURA: { title: 'Contratos activos sin factura este mes', todo: 'Puede ser una baja, un contrato anual o una factura sin emitir.', level: 'info', order: 6 },
  ESTADO_CONTRADICTORIO: { title: 'Contratos con estado dudoso', todo: 'Figuran como activos pero tienen una fecha de baja ya pasada.', level: 'info', order: 7 },
  NOMINA_PENDIENTE: { title: 'Faltan nóminas del personal asignado', todo: 'Sin la nómina, el coste de personal queda pendiente.', level: 'warn', order: 8 },
  FACTURA_SIN_REGLA: { title: 'Facturas sin regla de coste', todo: 'Indica a qué producto pertenece el proveedor y se aplicará siempre.', level: 'warn', order: 9 },
  PERIODO_ANUAL_PENDIENTE: { title: 'Facturas anuales sin periodo confirmado', todo: 'Confirma desde qué mes cubre la factura para repartirla en 12 meses.', level: 'warn', order: 10 },
  PERIODO_PENDIENTE: { title: 'Facturas sin periodo de servicio', todo: 'Indica el mes de servicio de la factura.', level: 'warn', order: 11 },
  PERIODICIDAD_PENDIENTE: { title: 'Contratos sin periodicidad', todo: 'Indica si se factura al mes, al trimestre o al año.', level: 'info', order: 12 },
  SEDE_CONTRATO_PENDIENTE: { title: 'Contratos de Draxton sin sede', todo: 'Asigna la sede para repartir el coste correctamente.', level: 'info', order: 13 },
  BAJA_FACTURADA: { title: 'Contratos de baja que siguen facturándose', todo: 'Comprueba si la baja es correcta o si hay que reactivar el contrato.', level: 'info', order: 14 },
  VIGENCIA_CONTRATO_VS_BAJA: { title: 'Vigencia del contrato distinta de la baja', todo: 'Revisa las fechas del contrato frente a la baja registrada.', level: 'info', order: 15 },
  SERIE_REVISAR_SOLAPAMIENTO: { title: 'Series de facturas que se solapan', todo: 'Revisa que no se cuente dos veces la misma factura.', level: 'info', order: 16 },
  CLIENTE_PENDIENTE: { title: 'Clientes pendientes de identificar', todo: 'Vincula la línea facturada con su cliente.', level: 'info', order: 17 },
  DETALLE_NO_CUADRA: { title: 'El detalle no cuadra con el total', todo: 'Revisa las líneas de la factura.', level: 'warn', order: 18 },
  FALTA_DETALLE: { title: 'Facturas sin detalle', todo: 'Faltan las líneas de la factura para repartir el coste.', level: 'info', order: 19 },
  AUTOfACTURA_SEGUNDA_FUENTE_EXCLUIDA: { title: 'Autofacturas duplicadas excluidas', todo: 'Solo informativo: se ha usado una única fuente.', level: 'info', order: 20 },
};
export const alertInfo = (type: string): AlertInfo => ALERT_INFO[type] ?? { title: type.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()), todo: 'Revisa el detalle y resuélvelo desde la lista.', level: 'info', order: 99 };
export type AlertGroup = AlertInfo & { type: string; items: Row[]; count: number; summary: string };
export function groupAlerts(alerts: unknown): AlertGroup[] {
  const by = new Map<string, Row[]>(); for (const a of array(alerts)) { const k = String(a.type ?? 'OTRO'); (by.get(k) ?? by.set(k, []).get(k)!).push(a); }
  const names = (items: Row[], field: string, n = 3) => { const s = Array.from(new Set(items.map(i => String(i[field] ?? '').replace(/\s*\(.*\)$/, '')).filter(Boolean))); return s.length ? `${s.slice(0, n).join(', ')}${s.length > n ? ` y ${s.length - n} más` : ''}` : ''; };
  return Array.from(by, ([type, items]) => {
    const info = alertInfo(type); let summary = '';
    if (type === 'FACTURA_PROVEEDOR_PENDIENTE') summary = names(items, 'provider');
    else if (type === 'COSTE_EXTERNO_POR_CONFIRMAR') summary = names(items, 'product');
    else if (type === 'MARGEN_NEGATIVO') { const t = items.reduce((s, i) => s + (numeric(i.amount) ?? 0), 0); summary = `suman ${Math.round(t).toLocaleString('es-ES')} € al mes`; }
    else if (type === 'DIFERENCIA_PRECIO') { const t = items.reduce((s, i) => s + (numeric(i.amount) ?? 0), 0); summary = `${t >= 0 ? 'se factura' : 'se factura'} ${Math.abs(Math.round(t)).toLocaleString('es-ES')} € ${t >= 0 ? 'más' : 'menos'} de lo contratado`; }
    return { ...info, type, items, count: items.length, summary };
  }).sort((a, b) => a.order - b.order || b.count - a.count);
}
/** Los 5 grupos de alertas más importantes (por prioridad; los informativos van al final). */
export const topAlertGroups = (groups: AlertGroup[], n = 5) => groups.filter(g => g.level !== 'info').concat(groups.filter(g => g.level === 'info')).slice(0, n);

/* ───────── Comparación con el Excel v4 ───────── */
const EXCEL_NAMES: Record<string, string> = {
  'IO red propia': 'Red propia', 'Acens (Microsoft 365, Panda)': 'Acens', 'Cablemóvil / Xfera': 'Cablemóvil/Xfera', 'Wildix – Borges Blanques': 'Wildix Borges', 'Wildix – resto': 'Wildix',
  'Google': 'Google Workspace', 'Cloud y backup (Cloud 101)': 'Cloud 101', 'Dominios (Nominalia)': 'Dominios', 'Servicios IO (sin coste de proveedor)': 'Servicios IO sin coste de proveedor',
  'Zoom (West Telco)': 'Zoom', 'Comisiones Aire (autofactura)': 'Comisiones Aire', 'Comisiones Xfera (autofactura)': 'Comisiones Xfera', 'Hotspot (Xfera)': 'Hotspot', 'Otros (Vodafone, Microsoft…)': 'Otros',
};
export type CompareRow = { key: string; product: string; excelName: string; xIncome: number | null; pIncome: number | null; xCost: number | null; pCost: number | null; xPct: number | null; pPct: number | null; estimated: boolean; missing: boolean };
export function compareRows(report: Report, mode: Mode): CompareRow[] {
  const products = array(report.products);
  return array(report.references).filter(r => r.kind === 'recurrent_product').map(ref => {
    const name = String(ref.product ?? ''); const panelName = EXCEL_NAMES[name] ?? name; const p = products.find(x => x.product === panelName);
    const xi = numeric(ref.income), xc = numeric(ref.cost); const t = p ? totalsOf([p], mode) : null;
    return { key: name, product: panelName, excelName: name, xIncome: xi, pIncome: t ? t.income : null, xCost: xc, pCost: t ? t.cost : null, xPct: xi ? r2(100 * (xi - (xc ?? 0)) / xi) : null, pPct: t ? t.marginPct : null, estimated: !!t?.estimated, missing: !p };
  });
}
/** Color de la diferencia: verde hasta el 5 %, ámbar hasta el 15 %, rojo a partir de ahí (relativo al Excel). */
export function diffTone(excel: number | null, panel: number | null): 'good' | 'low' | 'bad' | 'na' {
  if (excel == null || panel == null) return 'na'; const d = Math.abs(panel - excel); const base = Math.max(Math.abs(excel), 50);
  return d / base <= 0.05 ? 'good' : d / base <= 0.15 ? 'low' : 'bad';
}

/* ───────── Clientes ───────── */
export function clientTipo(client: Row): TipoCliente {
  if (tipoPorNombre(String(client.clientName ?? ''))) return 'P';
  for (const c of array(client.contracts)) { const t = tipoPorDocumento(c.clientCif); if (t) return t; }
  return 'E';
}
export const TIPO_NOMBRE: Record<TipoCliente, string> = { E: 'Empresa', R: 'Particular', P: 'Sector público' };
export { costQuality, isPending };

/** Cifras de una fila (producto, cliente o contrato) según el modo; usa las mismas reglas que el resto del panel. */
export type RowTotals = { income: number | null; cost: number | null; costReal: number | null; costEst: number; margin: number | null; marginPct: number | null; quality: number | null; estimated: boolean };
export function rowTotals(row: Row, mode: Mode): RowTotals {
  return { income: amount(row, 'income', mode), cost: amount(row, 'costTotal', mode), costReal: amount(row, 'cost', mode), costEst: mode === 'real' ? estimatedOf(row) : 0, margin: amount(row, 'margin', mode), marginPct: amount(row, 'marginPct', mode), quality: mode === 'real' ? costQuality(row) : null, estimated: mode === 'real' && hasEstimate(row) };
}
