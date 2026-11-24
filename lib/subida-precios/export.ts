import * as XLSX from 'xlsx';
import {
  type Dataset, type Estado, type Resultado, type TipoCliente, MESES_PERIODO, TIPO_LABEL,
  calcular, fechaLimiteAviso, porcentajeContrato, r2,
} from './calc';

export interface FilaPrecio {
  cliente: string; cif: string; tipo: string; contrato: string; tarifa: string; producto: string; periodicidad: string;
  precioHoyMes: number; subidaPct: number; precioNuevoMes: number; subidaMes: number;
  precioHoyPeriodo: number; precioNuevoPeriodo: number; origenPct: string; costeMes: number; margenHoyPct: number | null; margenNuevoPct: number | null;
}
export interface FilaAviso {
  cliente: string; cif: string; tipo: string; email: string; contratos: number; subidaMes: number; subidaAnio: number; pctMedio: number; fechaLimiteAviso: string; antelacionMeses: number; fechaEfecto: string;
}
export interface Resultado2 { precios: FilaPrecio[]; avisos: FilaAviso[]; fechaEfecto: string; generadoAt: string }

const PER_LABEL = { M: 'Mensual', T: 'Trimestral', S: 'Semestral', A: 'Anual' } as const;
const ORIGEN = { CONTRATO: 'Propio del contrato', CLIENTE: 'Propio del cliente', PRODUCTO: 'Producto' } as const;

/** Congela el resultado de un escenario: una fila por contrato con subida y una por cliente a avisar. */
export function generarResultado(ds: Dataset, st: Estado, r: Resultado = calcular(ds, st)): Resultado2 {
  const precios: FilaPrecio[] = [];
  ds.contratos.forEach((k, i) => {
    const res = r.con[i]; if (!res || res.dI <= 0.005 || k.sinContrato) return;
    const c = ds.clientes[k.cliente]; const g = ds.grupos[k.grupo]; const m = MESES_PERIODO[k.periodicidad];
    const { origen } = porcentajeContrato(st, g, c, k);
    precios.push({
      cliente: c.nombre, cif: c.cif ?? '', tipo: TIPO_LABEL[c.tipo], contrato: k.codigo, tarifa: k.tarifa, producto: g.nombre, periodicidad: PER_LABEL[k.periodicidad],
      precioHoyMes: r2(k.ingreso), subidaPct: r2((res.i1 / k.ingreso - 1) * 100), precioNuevoMes: r2(res.i1), subidaMes: r2(res.dI),
      precioHoyPeriodo: r2(k.ingreso * m), precioNuevoPeriodo: r2(res.i1 * m), origenPct: ORIGEN[origen], costeMes: r2(res.c1),
      margenHoyPct: k.ingreso ? (k.ingreso - k.coste) / k.ingreso : null, margenNuevoPct: res.i1 ? (res.i1 - res.c1) / res.i1 : null,
    });
  });
  const avisos: FilaAviso[] = [];
  r.cli.forEach((c, i) => {
    if (c.dI <= 0.005) return; const cli = ds.clientes[i];
    const meses = st.aviso[cli.tipo as TipoCliente] ?? 1;
    avisos.push({
      cliente: cli.nombre, cif: cli.cif ?? '', tipo: TIPO_LABEL[cli.tipo], email: cli.email ?? '',
      contratos: precios.filter(p => p.cliente === cli.nombre && p.cif === (cli.cif ?? '')).length, subidaMes: r2(c.dI), subidaAnio: r2(c.dI * 12),
      pctMedio: c.i0 ? r2((c.dI / c.i0) * 100) : 0, fechaLimiteAviso: fechaLimiteAviso(st.fechaEfecto, meses), antelacionMeses: meses, fechaEfecto: st.fechaEfecto,
    });
  });
  avisos.sort((a, b) => a.fechaLimiteAviso.localeCompare(b.fechaLimiteAviso) || b.subidaMes - a.subidaMes);
  return { precios, avisos, fechaEfecto: st.fechaEfecto, generadoAt: new Date().toISOString() };
}

const COLS_PRECIOS: [keyof FilaPrecio, string][] = [
  ['cliente', 'Cliente'], ['cif', 'CIF/NIF'], ['tipo', 'Tipo'], ['contrato', 'Nº contrato'], ['tarifa', 'Tarifa'], ['producto', 'Producto'], ['periodicidad', 'Periodicidad'],
  ['precioHoyPeriodo', 'Importe actual del periodo (neto)'], ['precioNuevoPeriodo', 'Importe nuevo del periodo (neto)'],
  ['precioHoyMes', 'Precio hoy €/mes'], ['subidaPct', 'Subida %'], ['precioNuevoMes', 'Precio nuevo €/mes'], ['subidaMes', 'Subida €/mes'],
  ['origenPct', 'Origen del %'], ['costeMes', 'Coste €/mes'], ['margenHoyPct', 'Margen hoy %'], ['margenNuevoPct', 'Margen nuevo %'],
];
const COLS_AVISOS: [keyof FilaAviso, string][] = [
  ['cliente', 'Cliente'], ['cif', 'CIF/NIF'], ['tipo', 'Tipo'], ['email', 'Correo'], ['contratos', 'Contratos con subida'], ['pctMedio', 'Subida media %'],
  ['subidaMes', 'Subida €/mes'], ['subidaAnio', 'Subida €/año'], ['antelacionMeses', 'Aviso (meses)'], ['fechaLimiteAviso', 'Avisar antes del'], ['fechaEfecto', 'Efecto desde'],
];

const toAoa = <T extends Record<string, any>>(rows: T[], cols: [keyof T, string][]) => [
  cols.map(c => c[1]), ...rows.map(r => cols.map(([k]) => {
    const v = r[k]; return typeof v === 'number' && String(k).toLowerCase().includes('hoypct') ? v : v ?? '';
  })),
];

/** Neutraliza fórmulas en CSV/Excel (inyección): los textos que empiezan por = + - @ se prefijan. */
const safe = (v: any) => (typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export function csvDe<T extends Record<string, any>>(rows: T[], cols: [keyof T, string][]): string {
  const esc = (v: any) => { const s = String(safe(v) ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const num = (v: any) => (typeof v === 'number' ? String(v).replace('.', ',') : v);
  return '\ufeff' + [cols.map(c => esc(c[1])).join(';'), ...rows.map(r => cols.map(([k]) => esc(num(r[k]))).join(';'))].join('\r\n') + '\r\n';
}
export const csvPrecios = (r: Resultado2) => csvDe(r.precios, COLS_PRECIOS);
export const csvAvisos = (r: Resultado2) => csvDe(r.avisos, COLS_AVISOS);

export function cartaBorrador(tipo: TipoCliente, fechaEfecto: string): string {
  const [y, m, d] = fechaEfecto.split('-').map(Number);
  const f = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const cuerpo = tipo === 'P'
    ? 'Le comunicamos que, de acuerdo con la cláusula de revisión de precios de su contrato, los importes de los servicios indicados se actualizarán en la forma y fecha que se detallan a continuación.'
    : 'Le comunicamos que, tras la evolución de los costes de la red y de los operadores, actualizaremos el precio de los servicios que tiene contratados con Internet Operadores en la forma y fecha que se detallan a continuación.';
  const baja = tipo === 'R'
    ? 'Si no está de acuerdo con la modificación, tiene derecho a resolver el contrato sin penalización dentro del plazo legal indicado en sus condiciones, comunicándolo por escrito.'
    : 'Si desea comentar la actualización o revisar su servicio, estamos a su disposición.';
  return [
    'BORRADOR DE CARTA (no enviado) — revisar con Dirección y asesoría legal antes de usar',
    '',
    'Asunto: Actualización de precios de sus servicios a partir del ' + f,
    '',
    'Estimado/a {{CLIENTE}}:',
    '',
    cuerpo,
    '',
    'Servicios afectados (contrato · servicio · importe actual → importe nuevo, IVA no incluido):',
    '{{LISTA_CONTRATOS}}',
    '',
    'El nuevo importe se aplicará a partir de la factura que comience el ' + f + '.',
    baja,
    '',
    'Para cualquier consulta puede escribirnos a info@internetoperadores.com o llamarnos al teléfono habitual de atención al cliente.',
    '',
    'Atentamente,',
    'Internet Operadores',
  ].join('\n');
}

export function libroExcel(res: Resultado2, nombre: string, fechaEfecto: string): Buffer {
  const wb = XLSX.utils.book_new();
  const wsP = XLSX.utils.aoa_to_sheet(toAoa(res.precios.map(p => mapSafe(p)), COLS_PRECIOS));
  wsP['!cols'] = COLS_PRECIOS.map(([, h]) => ({ wch: Math.max(12, Math.min(40, h.length + 2)) })); wsP['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, res.precios.length), c: COLS_PRECIOS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, wsP, 'Nuevos precios (ISP)');
  const wsA = XLSX.utils.aoa_to_sheet(toAoa(res.avisos.map(p => mapSafe(p)), COLS_AVISOS));
  wsA['!cols'] = COLS_AVISOS.map(([, h]) => ({ wch: Math.max(12, Math.min(40, h.length + 2)) })); wsA['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, res.avisos.length), c: COLS_AVISOS.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, wsA, 'Clientes a avisar');
  const wsC = XLSX.utils.aoa_to_sheet([[`Escenario: ${nombre}`], [`Efecto desde: ${fechaEfecto}`], [''], ...(['E', 'R', 'P'] as TipoCliente[]).flatMap(t => [[`— ${TIPO_LABEL[t]} —`], ...cartaBorrador(t, fechaEfecto).split('\n').map(l => [l]), ['']])]);
  wsC['!cols'] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(wb, wsC, 'Borrador de carta');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
function mapSafe<T extends Record<string, any>>(o: T): T {
  const out: any = {}; for (const k of Object.keys(o)) out[k] = safe(o[k]); return out;
}
