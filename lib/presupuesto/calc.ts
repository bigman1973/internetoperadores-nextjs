// Presupuesto (Área 3): parte del real del año anterior (ene–oct anualizado) por centro de coste y cuenta.
// Motor puro, sin base de datos. «Centro de coste» = imputación de la factura; «cuenta» = proveedor (o «Ventas» en ingresos).
import { clasificarRecibida, type RecibidaIn } from '@/lib/impuestos/calc';
export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n0 = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);

export type Tipo = 'INGRESO' | 'GASTO';
export type Naturaleza = 'CORRIENTE' | 'INVERSION';
export type Fuente = 'FACTURAS' | 'NOMINAS' | 'SUBIDA_PRECIOS' | 'MANUAL';
export interface EmitidaP { fecha: string; base: number; imputacion: string | null }
export interface RecibidaP extends RecibidaIn { imputacion: string | null; base: number }
export interface NominaP { anio: number; mes: number; costeEmpresa: number }
export interface EscenarioSubida { id: string; nombre: string; extraAnual: number; fechaEfecto: string | null }
export interface EscenarioSalarial { id: string; nombre: string; costeActualAnual: number; costePropuestoAnual: number; estado: string; fechaEfectiva: string | null }
export interface Linea {
  tipo: Tipo; naturaleza: Naturaleza; centro: string; cuenta: string; fuente: Fuente;
  realAnual: number; subidaPct: number | null; importeAuto: number; importe: number; origen: 'AUTO' | 'MANUAL'; nota: string | null; orden: number;
}
export interface Aviso { codigo: string; gravedad: 'ALTA' | 'MEDIA' | 'INFO'; texto: string }
export interface EntradaPresupuesto {
  ejercicio: number; mesesReal: number; subidaProveedoresPct: number;
  emitidas: EmitidaP[]; recibidas: RecibidaP[]; nominas: NominaP[]; recibidasRevisar: number;
  escenarioSubida: EscenarioSubida | null; escenarioSalarial: EscenarioSalarial | null;
}
export const SIN_IMPUTAR = 'Sin imputar';
const RX_INVERSION = /ordenador|port[aá]til|servidor|switch|router|firewall|rack|mobiliario|equipamiento|maquinaria|\bobras?\b|veh[ií]culo|antena/i;
const MIN_CUENTA = 1000;

/** Meses de 2027 en los que se aplica una subida cuya fecha de efecto es `fecha` (0 a 12). */
export function mesesAplicables(ejercicio: number, fechaEfecto: string | null): number {
  if (!fechaEfecto) return 12;
  const y = Number(fechaEfecto.slice(0, 4)); const m = Number(fechaEfecto.slice(5, 7));
  if (y < ejercicio) return 12; if (y > ejercicio) return 0; return Math.max(0, 13 - m);
}

export interface ResultadoGeneracion { lineas: Linea[]; avisos: Aviso[]; excluido: { confirming: number; nConfirming: number; sinImputarGasto: number }; mesesNominas: number }

export function generarLineas(e: EntradaPresupuesto): ResultadoGeneracion {
  const base = e.ejercicio - 1; const factor = 12 / Math.max(1, e.mesesReal);
  const dentro = (f: string) => f.startsWith(String(base)) && Number(f.slice(5, 7)) <= e.mesesReal;
  const lineas: Linea[] = []; const avisos: Aviso[] = [];

  // Ingresos por centro.
  const ing = new Map<string, number>();
  for (const x of e.emitidas.filter(x => dentro(x.fecha))) { const c = x.imputacion?.trim() || SIN_IMPUTAR; ing.set(c, (ing.get(c) ?? 0) + n0(x.base)); }
  for (const [centro, v] of [...ing].sort((a, b) => b[1] - a[1])) {
    const real = r2(v * factor);
    lineas.push({ tipo: 'INGRESO', naturaleza: 'CORRIENTE', centro, cuenta: 'Ventas facturadas', fuente: 'FACTURAS', realAnual: real, subidaPct: null, importeAuto: real, importe: real, origen: 'AUTO', nota: `Real ${base} ene–${String(e.mesesReal).padStart(2, '0')} anualizado ×12/${e.mesesReal}`, orden: 10 });
  }
  // Subida de precios aprobada.
  if (e.escenarioSubida) {
    const meses = mesesAplicables(e.ejercicio, e.escenarioSubida.fechaEfecto); const extra = r2(e.escenarioSubida.extraAnual * meses / 12);
    lineas.push({ tipo: 'INGRESO', naturaleza: 'CORRIENTE', centro: 'Operadora', cuenta: 'Subida de precios aprobada', fuente: 'SUBIDA_PRECIOS', realAnual: 0, subidaPct: null, importeAuto: extra, importe: extra, origen: 'AUTO',
      nota: `Escenario «${e.escenarioSubida.nombre}» aprobado: ${r2(e.escenarioSubida.extraAnual)} €/año × ${meses}/12 meses desde ${e.escenarioSubida.fechaEfecto ?? 'enero'}`, orden: 20 });
  } else avisos.push({ codigo: 'SIN_SUBIDA_APROBADA', gravedad: 'MEDIA', texto: 'No hay ningún escenario aprobado en Subida de precios: el presupuesto de ingresos no incluye subida. Cuando el superadmin apruebe uno, regenera el borrador.' });

  // Gastos: facturas recibidas válidas, sin confirming ni cesiones.
  const gas = new Map<string, Map<string, { v: number; inv: boolean }>>();
  let confirming = 0; let nConfirming = 0; let sinImputar = 0;
  for (const x of e.recibidas.filter(x => dentro(x.fecha))) {
    const cl = clasificarRecibida(x);
    if (cl === 'REVISAR') continue;
    if (cl === 'CONFIRMING') { confirming += n0(x.base); nConfirming++; continue; }
    const c = x.imputacion?.trim() || SIN_IMPUTAR;
    const inv = Math.abs(n0(x.base)) >= 1500 && RX_INVERSION.test(x.concepto ?? '');
    const m = gas.get(c) ?? new Map(); const k = `${(x.proveedor || 'Sin proveedor').trim()}|${inv ? 'I' : 'C'}`;
    const cur = m.get(k) ?? { v: 0, inv }; cur.v += n0(x.base); m.set(k, cur); gas.set(c, m);
    if (c === SIN_IMPUTAR) sinImputar += n0(x.base);
  }
  for (const [centro, m] of [...gas].sort((a, b) => a[0].localeCompare(b[0]))) {
    const otros = { C: 0, I: 0 };
    const items = [...m].map(([k, v]) => ({ prov: k.split('|')[0], inv: v.inv, v: v.v }));
    for (const it of items.sort((a, b) => b.v - a.v)) {
      const real = r2(it.v * factor);
      if (Math.abs(real) < MIN_CUENTA) { otros[it.inv ? 'I' : 'C'] += it.v; continue; }
      push(it.inv, it.prov, it.v);
    }
    for (const nat of ['C', 'I'] as const) if (Math.abs(otros[nat]) > 0.005) push(nat === 'I', `Otros proveedores (menos de ${MIN_CUENTA.toLocaleString('es-ES')} € al año)`, otros[nat]);
    function push(inv: boolean, cuenta: string, v: number) {
      const real = r2(v * factor); const pct = inv ? 0 : e.subidaProveedoresPct;
      const auto = r2(real * (1 + pct / 100));
      lineas.push({ tipo: 'GASTO', naturaleza: inv ? 'INVERSION' : 'CORRIENTE', centro, cuenta, fuente: 'FACTURAS', realAnual: real, subidaPct: inv ? 0 : null, importeAuto: auto, importe: auto, origen: 'AUTO',
        nota: inv ? 'Inversión detectada por el concepto de la factura: sin subida' : `Subida de proveedores ${pct} %`, orden: 50 });
    }
  }
  // Personal: nóminas reales anualizadas y escenario salarial para 2027.
  const nomBase = e.nominas.filter(x => x.anio === base); const mesesNom = new Set(nomBase.map(x => x.mes)).size;
  if (mesesNom > 0 || e.escenarioSalarial) {
    const realAnual = mesesNom > 0 ? r2(nomBase.reduce((s, x) => s + n0(x.costeEmpresa), 0) * 12 / mesesNom) : 0;
    const sal = e.escenarioSalarial; const auto = sal ? r2(sal.costePropuestoAnual) : realAnual;
    lineas.push({ tipo: 'GASTO', naturaleza: 'CORRIENTE', centro: 'Personal', cuenta: 'Nóminas y Seguridad Social (coste empresa)', fuente: 'NOMINAS', realAnual, subidaPct: null, importeAuto: auto, importe: auto, origen: 'AUTO',
      nota: sal ? `Plantilla actual con el escenario salarial «${sal.nombre}» (${sal.estado}): ${r2(sal.costeActualAnual)} € → ${r2(sal.costePropuestoAnual)} €. El real ${base} incluye bajas.` : `Sin escenario salarial: se mantiene el real anualizado (${mesesNom} meses de nóminas).`, orden: 40 });
    if (sal && sal.estado !== 'aprobado') avisos.push({ codigo: 'SALARIAL_NO_APROBADO', gravedad: 'MEDIA', texto: `El escenario salarial «${sal.nombre}» está en estado «${sal.estado}»: el coste de personal 2027 es provisional.` });
    if (mesesNom > 0 && mesesNom < e.mesesReal) avisos.push({ codigo: 'NOMINAS_INCOMPLETAS', gravedad: 'MEDIA', texto: `Solo hay nóminas de ${mesesNom} de los ${e.mesesReal} meses del real: el coste de personal se ha anualizado con ${mesesNom} meses.` });
  } else avisos.push({ codigo: 'SIN_PERSONAL', gravedad: 'ALTA', texto: 'No hay nóminas ni escenario salarial: falta el gasto de personal.' });

  if (confirming > 0) avisos.push({ codigo: 'CONFIRMING_EXCLUIDO', gravedad: 'INFO', texto: `${nConfirming} documentos de confirming y cesión de créditos (${Math.round(confirming).toLocaleString('es-ES')} € de base) no se cuentan como gasto.` });
  if (sinImputar > 0) avisos.push({ codigo: 'GASTO_SIN_IMPUTAR', gravedad: 'MEDIA', texto: `${Math.round(sinImputar * factor).toLocaleString('es-ES')} € anuales de gasto no tienen centro de coste (se agrupan en «${SIN_IMPUTAR}»). Imputarlos mejora el presupuesto.` });
  if (e.recibidasRevisar > 0) avisos.push({ codigo: 'REVISAR_LECTURA', gravedad: 'ALTA', texto: `${e.recibidasRevisar} facturas recibidas con lectura por revisar no entran en el real.` });
  avisos.push({ codigo: 'SIN_CUENTA_CONTABLE', gravedad: 'INFO', texto: 'La cuenta contable de gasto no está en el panel: la «cuenta» es el proveedor. No hay centros de coste definidos: se usa la imputación de la factura.' });
  avisos.push({ codigo: 'ANUALIZADO', gravedad: 'INFO', texto: `El real ${base} es enero–${String(e.mesesReal).padStart(2, '0')} anualizado (×12/${e.mesesReal}); no recoge estacionalidad ni lo que falte por facturar.` });
  return { lineas, avisos, excluido: { confirming: r2(confirming), nConfirming, sinImputarGasto: r2(sinImputar * factor) }, mesesNominas: mesesNom };
}

export interface Totales { ingresos: { real: number; presupuesto: number }; gastoCorriente: { real: number; presupuesto: number }; inversion: { real: number; presupuesto: number }; resultado: { real: number; presupuesto: number }; margenPct: { real: number | null; presupuesto: number | null } }
export function totales(lineas: Pick<Linea, 'tipo' | 'naturaleza' | 'realAnual' | 'importe'>[]): Totales {
  const s = (f: (l: any) => boolean, k: 'realAnual' | 'importe') => r2(lineas.filter(f).reduce((a, l) => a + n0(l[k]), 0));
  const ing = (l: any) => l.tipo === 'INGRESO'; const gc = (l: any) => l.tipo === 'GASTO' && l.naturaleza === 'CORRIENTE'; const inv = (l: any) => l.tipo === 'GASTO' && l.naturaleza === 'INVERSION';
  const t = {
    ingresos: { real: s(ing, 'realAnual'), presupuesto: s(ing, 'importe') }, gastoCorriente: { real: s(gc, 'realAnual'), presupuesto: s(gc, 'importe') }, inversion: { real: s(inv, 'realAnual'), presupuesto: s(inv, 'importe') },
  } as Totales;
  t.resultado = { real: r2(t.ingresos.real - t.gastoCorriente.real - t.inversion.real), presupuesto: r2(t.ingresos.presupuesto - t.gastoCorriente.presupuesto - t.inversion.presupuesto) };
  t.margenPct = { real: t.ingresos.real ? r2(t.resultado.real / t.ingresos.real * 100) : null, presupuesto: t.ingresos.presupuesto ? r2(t.resultado.presupuesto / t.ingresos.presupuesto * 100) : null };
  return t;
}

export interface FilaSeguimiento { tipo: Tipo; centro: string; presupuestoAnual: number; presupuestoAcum: number; realAcum: number; diferencia: number; porMes: { mes: string; presupuesto: number; real: number }[] }
/** Seguimiento mensual del ejercicio de la versión: real frente a presupuesto lineal (importe/12) por centro. Los meses sin datos no cuentan. */
export function seguimiento(ejercicio: number, lineas: Pick<Linea, 'tipo' | 'centro' | 'importe'>[], emitidas: EmitidaP[], recibidas: RecibidaP[], nominas: NominaP[], hoy: string): { mesesCerrados: number; filas: FilaSeguimiento[] } {
  const mesHoy = hoy.slice(0, 7); const yr = String(ejercicio);
  const meses = Array.from({ length: 12 }, (_, i) => `${yr}-${String(i + 1).padStart(2, '0')}`);
  const cerrados = meses.filter(m => m < mesHoy);
  const real = new Map<string, number>(); const add = (t: Tipo, c: string, m: string, v: number) => { const k = `${t}|${c}|${m}`; real.set(k, (real.get(k) ?? 0) + v); };
  for (const x of emitidas) if (x.fecha.startsWith(yr)) add('INGRESO', x.imputacion?.trim() || SIN_IMPUTAR, x.fecha.slice(0, 7), n0(x.base));
  for (const x of recibidas) if (x.fecha.startsWith(yr)) { const cl = clasificarRecibida(x); if (cl === 'REVISAR' || cl === 'CONFIRMING') continue; add('GASTO', x.imputacion?.trim() || SIN_IMPUTAR, x.fecha.slice(0, 7), n0(x.base)); }
  for (const x of nominas) if (x.anio === ejercicio) add('GASTO', 'Personal', `${yr}-${String(x.mes).padStart(2, '0')}`, n0(x.costeEmpresa));
  const claves = new Map<string, number>();
  for (const l of lineas) { const k = `${l.tipo}|${l.centro}`; claves.set(k, (claves.get(k) ?? 0) + n0(l.importe)); }
  for (const k of real.keys()) { const [t, c] = k.split('|'); const kk = `${t}|${c}`; if (!claves.has(kk)) claves.set(kk, 0); }
  const filas: FilaSeguimiento[] = [...claves].map(([k, pres]) => {
    const [tipo, centro] = k.split('|') as [Tipo, string];
    const porMes = meses.map(m => ({ mes: m, presupuesto: r2(pres / 12), real: r2(real.get(`${tipo}|${centro}|${m}`) ?? 0) }));
    const acum = porMes.filter(p => cerrados.includes(p.mes));
    const pa = r2(acum.reduce((s, p) => s + p.presupuesto, 0)); const ra = r2(acum.reduce((s, p) => s + p.real, 0));
    return { tipo, centro, presupuestoAnual: r2(pres), presupuestoAcum: pa, realAcum: ra, diferencia: r2(ra - pa), porMes };
  }).sort((a, b) => (a.tipo === b.tipo ? b.presupuestoAnual - a.presupuestoAnual : a.tipo === 'INGRESO' ? -1 : 1));
  return { mesesCerrados: cerrados.length, filas };
}
