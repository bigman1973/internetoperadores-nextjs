import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  type Cliente, type Contrato, type Dataset, type Grupo, type Periodicidad, type TipoCliente,
  COSTE_FIJO, SIN_PRECIO, propuestaPorDefecto, r2, tipoPorDocumento, tipoPorNombre,
} from './calc';

export const PERIODO_DEFECTO = { desde: '2026-01', hasta: '2026-10' };
const MES = /^20\d{2}-(0[1-9]|1[0-2])$/;
/** Productos que no son tarifas recurrentes de cliente: órdenes de horas de IT. Se excluyen y se avisa. */
const EXCLUIDOS = new Set(['Servicios IT']);
/** Partidas que el panel factura sin contrato (se leen del mes a mes de Rentabilidad). */
const PARTIDAS_SIN_CONTRATO = ['Zoom', 'Hotspot', 'Comisiones Aire', 'Comisiones Xfera'];
/** Licencias anuales facturadas a trompicones (Zoom/West Telco): el coste del periodo es lo facturado dividido entre los meses;
 *  el estimado de «hueco» de los meses sin factura duplicaría licencias ya pagadas, por eso no se suma si hay facturas reales. */
const ANUALES_IRREGULARES = new Set(['Zoom']);
/** Productos con contrato vigente por sede (Draxton): el coste es el del último mes del periodo, no la media del año. */
const COSTE_VIGENTE = new Set(['Draxton telecomunicaciones']);

export interface DatasetMeta {
  desde: string; hasta: string; mesReferencia: string; snapshotVersion: number | null; generadoAt: string;
  fuenteCoste: 'REPARTO_RENTABILIDAD' | 'ISP_LINEA';
  excluidos: { producto: string; contratos: number; ingreso: number; motivo: string }[];
  calidadCoste: Record<string, { real: number; estimado: number }>;
  avisos: string[];
  sinImporte: { contratos: number; productos: Record<string, number> };
  reglasCoste: { producto: string; regla: string }[];
}
export interface DatasetResp extends Dataset { meta: DatasetMeta }

const normDoc = (v: unknown) => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const perCode = (v: unknown): Periodicidad => {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('anual')) return 'A';
  if (s.startsWith('trim')) return 'T';
  if (s.startsWith('sem')) return 'S';
  return 'M';
};
function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = []; let [y, m] = desde.split('-').map(Number); const [yh, mh] = hasta.split('-').map(Number);
  while (y < yh || (y === yh && m <= mh)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}
export function validarPeriodo(desde?: string | null, hasta?: string | null) {
  const d = desde && MES.test(desde) ? desde : PERIODO_DEFECTO.desde;
  const h = hasta && MES.test(hasta) ? hasta : PERIODO_DEFECTO.hasta;
  return d <= h ? { desde: d, hasta: h } : { desde: h, hasta: d };
}

interface FilaContrato { code: string; client: string; cif: string | null; ccode: string | null; tariff: string | null; product: string; active: boolean; inc: number | null; speed: number | null; cost: number | null; est: number | null }
interface FilaMes { month: string; product: string; inc: number; cost: number; est: number }

/** Lee el estado de Rentabilidad (solo lectura) y construye el conjunto de datos que alimenta el simulador. */
export async function construirDataset(desdeIn?: string | null, hastaIn?: string | null): Promise<DatasetResp> {
  const { desde, hasta } = validarPeriodo(desdeIn, hastaIn);
  const snap = await prisma.$queryRaw<{ id: string; month: string; version: number }[]>(Prisma.sql`
    SELECT id, month, version FROM rentabilidad_snapshots WHERE kind = 'PROYECCION' AND month <= ${hasta}
    ORDER BY month DESC, version DESC LIMIT 1`);
  if (!snap.length) throw new Error('SIN_FOTO_RENTABILIDAD');
  const s = snap[0];
  const contratosRaw = await prisma.$queryRaw<{ c: FilaContrato[] | null }[]>(Prisma.sql`
    SELECT jsonb_agg(jsonb_build_object('code', c->>'contractCode', 'client', c->>'clientName', 'cif', c->>'clientCif', 'ccode', c->>'clientCode',
      'tariff', c->>'tariff', 'product', c->>'product', 'active', COALESCE((c->>'active')::boolean, false),
      'inc', NULLIF(c->>'contractedIncome','')::numeric, 'speed', NULLIF(c->>'speedMbps','')::numeric,
      'cost', NULLIF(c->>'cost','')::numeric, 'est', NULLIF(c->>'estimatedCost','')::numeric)) AS c
    FROM rentabilidad_snapshots s, jsonb_array_elements(s.payload->'contracts') c WHERE s.id = ${s.id}`);
  const contratos = contratosRaw[0]?.c ?? [];
  const mesesRaw = await prisma.$queryRaw<{ m: FilaMes[] | null }[]>(Prisma.sql`
    SELECT jsonb_agg(jsonb_build_object('month', m->>'month', 'product', p->>'product',
      'inc', COALESCE(NULLIF(p->>'incomeRecurring','')::numeric, 0), 'cost', COALESCE(NULLIF(p->>'costRecurring','')::numeric, 0),
      'est', COALESCE(NULLIF(p->>'estimatedCost','')::numeric, 0))) AS m
    FROM rentabilidad_snapshots s, jsonb_array_elements(s.payload->'monthly') m, jsonb_array_elements(m->'products') p WHERE s.id = ${s.id}`);
  const meses = (mesesRaw[0]?.m ?? []).map(x => ({ ...x, inc: num(x.inc), cost: num(x.cost), est: num(x.est) }));
  const periodos = await prisma.$queryRaw<{ code: string | null; per: string | null }[]>(Prisma.sql`
    SELECT DISTINCT ON (stable_key) payload->>'contractCode' AS code, payload->>'periodicity' AS per
    FROM rentabilidad_versiones WHERE kind = 'contract' ORDER BY stable_key, version DESC`);
  const perMap = new Map(periodos.filter(p => p.code).map(p => [String(p.code), perCode(p.per)]));

  const rango = new Set(mesesEntre(desde, hasta));
  const avisos: string[] = [];
  const n = rango.size;
  // Coste mensual medio del periodo por producto: coste real recurrente + estimado (lo puntual no se reparte).
  const costeProd = new Map<string, { real: number; est: number }>();
  const costeMes = new Map<string, Map<string, { real: number; est: number }>>();
  const ingMedio = new Map<string, number>();
  for (const m of meses) {
    if (!rango.has(m.month)) continue;
    const mm = costeMes.get(m.product) ?? new Map(); const cur = mm.get(m.month) ?? { real: 0, est: 0 };
    mm.set(m.month, { real: cur.real + m.cost, est: cur.est + m.est }); costeMes.set(m.product, mm);
    const c = costeProd.get(m.product) ?? { real: 0, est: 0 };
    c.real += m.cost; c.est += m.est; costeProd.set(m.product, c);
    ingMedio.set(m.product, (ingMedio.get(m.product) ?? 0) + m.inc);
  }
  const mesesConDatos = new Set(meses.filter(m => rango.has(m.month)).map(m => m.month)).size;
  if (mesesConDatos < n) avisos.push(`El periodo pedido tiene ${n} meses y solo ${mesesConDatos} con datos en Rentabilidad.`);
  const div = Math.max(1, mesesConDatos);
  const reglasCoste: DatasetMeta['reglasCoste'] = [];
  /** Coste mensual del producto según su regla: media del periodo (por defecto), media de lo facturado (anuales irregulares) o último mes (contrato vigente). */
  const costeBase = (prod: string): { real: number; est: number } => {
    const cp = costeProd.get(prod) ?? { real: 0, est: 0 };
    if (COSTE_VIGENTE.has(prod)) {
      const mm = costeMes.get(prod); const ult = mm ? Array.from(mm.keys()).sort().pop() : undefined;
      if (mm && ult) { const v = mm.get(ult)!; return { real: v.real, est: v.est }; }
    }
    if (ANUALES_IRREGULARES.has(prod) && cp.real > 0) return { real: cp.real / div, est: 0 };
    return { real: cp.real / div, est: cp.est / div };
  };
  for (const prod of COSTE_VIGENTE) if (costeMes.has(prod)) reglasCoste.push({ producto: prod, regla: `Coste vigente del último mes del periodo (${Array.from(costeMes.get(prod)!.keys()).sort().pop()}), según el contrato por sede; no la media del año.` });
  for (const prod of ANUALES_IRREGULARES) if (costeProd.has(prod)) reglasCoste.push({ producto: prod, regla: 'Licencias anuales: coste = facturas recibidas del periodo entre los meses; no se añade estimado en los meses sin factura (duplicaría licencias ya pagadas).' });

  const activos = contratos.filter(c => c.active && c.product);
  const excluidos: DatasetMeta['excluidos'] = [];
  for (const prod of EXCLUIDOS) {
    const ex = activos.filter(c => c.product === prod);
    if (ex.length) excluidos.push({ producto: prod, contratos: ex.length, ingreso: r2(ex.reduce((a, c) => a + num(c.inc), 0)), motivo: 'Órdenes de horas de IT: no son tarifas recurrentes de cliente y no se suben con este simulador.' });
  }
  const utiles = activos.filter(c => !EXCLUIDOS.has(c.product));

  const nombresGrupo = Array.from(new Set([...utiles.map(c => c.product), ...PARTIDAS_SIN_CONTRATO.filter(p => (ingMedio.get(p) ?? 0) > 0)])).sort((a, b) => a.localeCompare(b, 'es'));
  const grupos: Grupo[] = nombresGrupo.map(nombre => ({ nombre, fijoCoste: COSTE_FIJO(nombre), sinPrecio: SIN_PRECIO(nombre), propuesta: propuestaPorDefecto(nombre) }));
  const gIdx = new Map(grupos.map((g, i) => [g.nombre, i]));

  // Pesos de reparto del coste dentro de cada producto: Mb (red propia), coste del mes de referencia (Draxton, por sede) o ingreso.
  const porProducto = new Map<string, FilaContrato[]>();
  for (const c of utiles) { const a = porProducto.get(c.product) ?? []; a.push(c); porProducto.set(c.product, a); }
  const peso = (c: FilaContrato, prod: string, todos: FilaContrato[]) => {
    if (prod === 'Red propia') return Math.max(0, num(c.speed));
    if (prod.startsWith('Draxton')) { const t = num(c.cost) + num(c.est); if (todos.some(x => num(x.cost) + num(x.est) > 0)) return Math.max(0, t); }
    return Math.max(0, num(c.inc));
  };

  // Tipo de cliente
  const [web, manual] = await Promise.all([
    prisma.$queryRaw<{ nif: string | null; cif: string | null; persona_fisica: boolean | null; organo_gestor: string | null; email: string | null; nombre: string | null }[]>(Prisma.sql`
      SELECT nif, cif, persona_fisica, organo_gestor, email, nombre FROM clientes_web LIMIT 5000`),
    prisma.$queryRaw<{ clave: string; tipo: string }[]>(Prisma.sql`SELECT clave, tipo FROM area2_subida_tipo_cliente LIMIT 5000`),
  ]);
  const webPorDoc = new Map<string, (typeof web)[number]>();
  for (const w of web) for (const d of [normDoc(w.cif), normDoc(w.nif)]) if (d && !webPorDoc.has(d)) webPorDoc.set(d, w);
  const manualMap = new Map(manual.map(m => [m.clave, m.tipo as TipoCliente]));

  const clientes: Cliente[] = []; const cIdx = new Map<string, number>();
  const clienteDe = (code: string | null, nombre: string, cif: string | null): number => {
    const id = code ? `isp:${code}` : `doc:${normDoc(cif) || nombre}`;
    const hit = cIdx.get(id); if (hit != null) return hit;
    const w = webPorDoc.get(normDoc(cif));
    let tipo: TipoCliente = 'E'; let origen: Cliente['tipoOrigen'] = 'NIF';
    const man = manualMap.get(id);
    if (man) { tipo = man; origen = 'MANUAL'; }
    else if (w?.organo_gestor || tipoPorNombre(nombre)) { tipo = 'P'; origen = w?.organo_gestor ? 'CRM' : 'NOMBRE'; }
    else if (w?.persona_fisica === true) { tipo = 'R'; origen = 'CRM'; }
    else if (w?.persona_fisica === false) { tipo = 'E'; origen = 'CRM'; }
    else { const d = tipoPorDocumento(cif); if (d === 'R') { tipo = 'R'; origen = 'NIF'; } }
    clientes.push({ id, nombre, cif: cif || null, tipo, tipoOrigen: origen, email: w?.email ?? null });
    cIdx.set(id, clientes.length - 1); return clientes.length - 1;
  };

  const contratosOut: Contrato[] = [];
  const calidad: DatasetMeta['calidadCoste'] = {};
  for (const [prod, lista] of porProducto) {
    const cb = costeBase(prod);
    const realM = cb.real; const estM = cb.est; const costeTotal = realM + estM;
    calidad[prod] = { real: r2(realM), estimado: r2(estM) };
    const pesos = lista.map(c => peso(c, prod, lista)); const suma = pesos.reduce((a, b) => a + b, 0);
    lista.forEach((c, i) => {
      const w = suma > 0 ? pesos[i] / suma : 1 / lista.length;
      const ingreso = num(c.inc ?? 0);
      contratosOut.push({
        clave: c.code, cliente: clienteDe(c.ccode, c.client, c.cif), grupo: gIdx.get(prod)!, codigo: c.code, tarifa: c.tariff ?? '',
        periodicidad: perMap.get(c.code) ?? 'M', ingreso: r2(ingreso), coste: r2(costeTotal * w), costeEstimado: costeTotal ? r2(costeTotal * w * (estM / (realM + estM || 1))) : 0,
      });
    });
  }
  // Partidas sin contrato: una línea por producto, con el coste del producto entero.
  for (const prod of PARTIDAS_SIN_CONTRATO) {
    const gi = gIdx.get(prod); if (gi == null) continue;
    const cb = costeBase(prod);
    calidad[prod] = { real: r2(cb.real), estimado: r2(cb.est) };
    const ci = clienteDe(`sc:${prod}`, `Partida sin contrato · ${prod}`, null);
    contratosOut.push({ clave: `sc:${prod}`, cliente: ci, grupo: gi, codigo: '—', tarifa: 'Facturación sin contrato en ISP', periodicidad: 'M',
      ingreso: r2((ingMedio.get(prod) ?? 0) / div), coste: r2(cb.real + cb.est), costeEstimado: r2(cb.est), sinContrato: true });
  }
  // Contratos de ISP sin importe (listado 299 sin precio en la hoja de contratos): no se pueden subir y no llevan coste; se apartan y se cuentan.
  const sinImporte = { contratos: 0, productos: {} as Record<string, number> };
  const conImporte = contratosOut.filter(k => {
    const quitar = !k.sinContrato && k.ingreso <= 0 && k.coste <= 0.005;
    if (quitar) { sinImporte.contratos++; const g = grupos[k.grupo].nombre; sinImporte.productos[g] = (sinImporte.productos[g] ?? 0) + 1; }
    return !quitar;
  });
  contratosOut.length = 0; contratosOut.push(...conImporte);
  if (sinImporte.contratos) avisos.push(`${sinImporte.contratos} contratos activos de ISP sin importe en el panel (no se pueden subir) quedan fuera del simulador.`);
  contratosOut.sort((a, b) => a.cliente - b.cliente || a.grupo - b.grupo);
  if (!contratosOut.length) avisos.push('No hay contratos activos en la foto de Rentabilidad.');
  return {
    grupos, clientes, contratos: contratosOut,
    meta: { desde, hasta, mesReferencia: s.month, snapshotVersion: s.version, generadoAt: new Date().toISOString(), fuenteCoste: 'REPARTO_RENTABILIDAD', excluidos, calidadCoste: calidad, avisos, sinImporte, reglasCoste },
  };
}

export async function datasetDisponible(): Promise<boolean> {
  try {
    const r = await prisma.$queryRaw<{ t: string | null; e: string | null }[]>(Prisma.sql`SELECT to_regclass('public.rentabilidad_snapshots')::text AS t, to_regclass('public.area2_subida_escenarios')::text AS e`);
    return Boolean(r[0]?.t && r[0]?.e);
  } catch { return false; }
}
