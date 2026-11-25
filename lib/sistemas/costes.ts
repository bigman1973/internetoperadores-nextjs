/**
 * Costes de Sistemas y servicios. Lógica pura (sin base de datos) para poder probarla.
 * Regla de oro: la factura es la referencia (base imponible, sin IVA). Un cargo del banco sin factura
 * no se mezcla con ella: va aparte, como «sin factura», y suma al coste del mes marcado en amarillo.
 */
export interface FacturaIn { id: string; proveedor: string; numFactura: string | null; fecha: string; base: number; total: number; concepto: string | null }
export interface MovIn { id: string; fecha: string; importe: number; concepto: string; tercero: string | null; facturaId: string | null; conDocumento: boolean }
export interface ReglaIn { servicioId: string; prioridad: number; proveedorRegex: string | null; conceptoRegex: string | null; bancoRegex: string | null; activa: boolean }
export interface ManualIn { id: string; servicioId: string; fecha: string | null; concepto: string; importe: number; moneda: 'EUR' | 'USD'; ivaPct: number; tipo: 'RECURRENTE' | 'UNICO'; estado: 'REAL' | 'PREVISTO'; anulado: boolean }
export interface ServicioIn { id: string; slug: string; nombre: string; periodicidad: 'MENSUAL' | 'ANUAL' | 'VARIABLE'; estado: string; prevision2027Manual: number | null; tipoPago?: 'FACTURA' | 'TARJETA_SIN_FACTURA' | 'INCLUIDO'; costeEstimadoMensual?: number | null }

export interface CosteMes { facturado: number; sinFactura: number; manual: number; estimado: number; total: number; nFacturas: number; nSinFactura: number }
export interface CosteServicio {
  servicioId: string; slug: string; nombre: string; estado: string; periodicidad: string;
  meses: Record<string, CosteMes>; totalAnio: number; totalFacturado: number; totalSinFactura: number; totalManual: number; totalEstimado: number; tipoPago: string; estimadoMensual: number | null;
  runRateMensual: number; anualizado: number; prevision2027: number; previsionOrigen: 'MANUAL' | 'RITMO_3_MESES' | 'TOTAL_ANUAL' | 'EN_BAJA';
  nFacturas: number; nSinFactura: number; ultimaFactura: string | null; ultimoCargo: string | null;
}
export interface PagoUnico { id: string; servicioId: string; slug: string; nombre: string; fecha: string | null; concepto: string; base: number; iva: number; total: number; estado: 'REAL' | 'PREVISTO'; moneda: 'EUR' | 'USD'; importeOriginal: number }
export interface CargoSinFactura { movId: string; fecha: string; importe: number; concepto: string; servicioId: string; slug: string; nombre: string; tarjeta: boolean }
export interface ResultadoCostes {
  desde: string; hasta: string; mesActual: string; mesesCerrados: string[]; meses: string[];
  servicios: CosteServicio[];
  totalesMes: Record<string, number>; totalAnio: number; totalAnualizado: number; previsionTotal2027: number; subidaPct: number;
  pagosUnicos: PagoUnico[]; totalPagosUnicosReales: number; totalPagosUnicosPrevistos: number;
  cargosSinFactura: CargoSinFactura[]; totalSinFactura: number;
  avisos: string[];
}

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export const normaliza = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const mesDe = (f: string) => f.slice(0, 7);

export function listaMeses(desde: string, hasta: string): string[] {
  const out: string[] = []; let [y, m] = desde.split('-').map(Number); const [yh, mh] = hasta.split('-').map(Number);
  while (y < yh || (y === yh && m <= mh)) { out.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

const cache = new Map<string, RegExp | null>();
function re(p: string | null): RegExp | null {
  if (!p) return null; if (p.length > 200) return null;
  if (cache.has(p)) return cache.get(p)!;
  let r: RegExp | null = null; try { r = new RegExp(normaliza(p), 'i'); } catch { r = null; }
  cache.set(p, r); return r;
}

/** Primera regla (por prioridad) que encaje con el proveedor y, si lo pide, con el concepto de la factura. */
export function servicioDeFactura(f: Pick<FacturaIn, 'proveedor' | 'concepto'>, reglas: ReglaIn[]): string | null {
  const prov = normaliza(f.proveedor), con = normaliza(f.concepto);
  for (const r of [...reglas].filter(x => x.activa && x.proveedorRegex).sort((a, b) => a.prioridad - b.prioridad)) {
    const rp = re(r.proveedorRegex); if (!rp || !rp.test(prov)) continue;
    if (r.conceptoRegex) { const rc = re(r.conceptoRegex); if (!rc || !rc.test(con)) continue; }
    return r.servicioId;
  }
  return null;
}
export function servicioDeMovimiento(m: Pick<MovIn, 'concepto' | 'tercero'>, reglas: ReglaIn[]): string | null {
  const txt = normaliza(`${m.concepto} ${m.tercero ?? ''}`);
  for (const r of [...reglas].filter(x => x.activa && x.bancoRegex).sort((a, b) => a.prioridad - b.prioridad)) {
    const rb = re(r.bancoRegex); if (rb && rb.test(txt)) return r.servicioId;
  }
  return null;
}

/** Tasa USD→EUR del mes; si falta, la más cercana anterior y, si no hay, la más cercana posterior. */
export function tasaDeMes(mes: string, tasas: Record<string, number>): { tasa: number; exacta: boolean } | null {
  if (tasas[mes]) return { tasa: tasas[mes], exacta: true };
  const ks = Object.keys(tasas).sort(); if (!ks.length) return null;
  const ant = ks.filter(k => k < mes).pop(); const pos = ks.find(k => k > mes);
  const k = ant ?? pos!; return { tasa: tasas[k], exacta: false };
}

export interface EntradaCostes {
  desde: string; hasta: string; mesActual: string; subidaPct?: number;
  servicios: ServicioIn[]; reglas: ReglaIn[]; facturas: FacturaIn[]; movimientos: MovIn[]; manuales: ManualIn[]; tasas: Record<string, number>;
}

export function calcularCostes(e: EntradaCostes): ResultadoCostes {
  const avisos: string[] = [];
  const hasta = e.hasta > e.mesActual ? e.mesActual : e.hasta;
  const meses = listaMeses(e.desde, hasta);
  const mesesCerrados = meses.filter(m => m < e.mesActual);
  const vacio = (): CosteMes => ({ facturado: 0, sinFactura: 0, manual: 0, estimado: 0, total: 0, nFacturas: 0, nSinFactura: 0 });
  const porId = new Map<string, CosteServicio>();
  for (const s of e.servicios) porId.set(s.id, {
    servicioId: s.id, slug: s.slug, nombre: s.nombre, estado: s.estado, periodicidad: s.periodicidad, meses: Object.fromEntries(meses.map(m => [m, vacio()])),
    totalAnio: 0, totalFacturado: 0, totalSinFactura: 0, totalManual: 0, totalEstimado: 0, tipoPago: s.tipoPago ?? 'FACTURA', estimadoMensual: s.costeEstimadoMensual ?? null, runRateMensual: 0, anualizado: 0, prevision2027: 0, previsionOrigen: 'RITMO_3_MESES',
    nFacturas: 0, nSinFactura: 0, ultimaFactura: null, ultimoCargo: null,
  });
  const facturasPorId = new Set<string>();
  for (const f of e.facturas) {
    const sid = servicioDeFactura(f, e.reglas); if (!sid) continue; const s = porId.get(sid); if (!s) continue;
    facturasPorId.add(f.id);
    const mes = mesDe(f.fecha); const c = s.meses[mes]; if (!c) continue;
    c.facturado = r2(c.facturado + f.base); c.nFacturas++; s.nFacturas++;
    if (!s.ultimaFactura || f.fecha > s.ultimaFactura) s.ultimaFactura = f.fecha;
  }
  const cargos: CargoSinFactura[] = [];
  for (const m of e.movimientos) {
    if (m.importe >= 0 || m.facturaId || m.conDocumento) continue;
    const sid = servicioDeMovimiento(m, e.reglas); if (!sid) continue; const s = porId.get(sid); if (!s) continue;
    const mes = mesDe(m.fecha); const c = s.meses[mes]; if (!c) continue;
    const imp = r2(-m.importe); c.sinFactura = r2(c.sinFactura + imp); c.nSinFactura++; s.nSinFactura++;
    if (!s.ultimoCargo || m.fecha > s.ultimoCargo) s.ultimoCargo = m.fecha;
    cargos.push({ movId: m.id, fecha: m.fecha.slice(0, 10), importe: imp, concepto: m.concepto.slice(0, 120), servicioId: sid, slug: s.slug, nombre: s.nombre, tarjeta: /compra|tarjeta/i.test(m.concepto) });
  }
  const pagos: PagoUnico[] = []; const sinTasa = new Set<string>(); const tasaAprox = new Set<string>();
  for (const x of e.manuales) {
    if (x.anulado) continue; const s = porId.get(x.servicioId); if (!s) continue;
    let eur = x.importe;
    if (x.moneda === 'USD') {
      const mes = x.fecha ? mesDe(x.fecha) : e.mesActual; const t = tasaDeMes(mes, e.tasas);
      if (!t) { sinTasa.add(mes); eur = 0; } else { eur = r2(x.importe * t.tasa); if (!t.exacta) tasaAprox.add(mes); }
    }
    if (x.tipo === 'UNICO') {
      const iva = r2(eur * x.ivaPct / 100);
      pagos.push({ id: x.id, servicioId: s.servicioId, slug: s.slug, nombre: s.nombre, fecha: x.fecha, concepto: x.concepto, base: r2(eur), iva, total: r2(eur + iva), estado: x.estado, moneda: x.moneda, importeOriginal: x.importe });
      continue;
    }
    if (x.estado !== 'REAL' || !x.fecha) continue;
    const c = s.meses[mesDe(x.fecha)]; if (!c) continue; c.manual = r2(c.manual + eur);
  }
  if (sinTasa.size) avisos.push(`Falta la tasa USD/EUR de ${[...sinTasa].sort().join(', ')}: esos importes en dólares no se han convertido. Pulsa «Actualizar tasas».`);
  if (tasaAprox.size) avisos.push(`Sin tasa exacta en ${[...tasaAprox].sort().join(', ')}: se ha usado la del mes más cercano.`);

  const subida = e.subidaPct ?? 0; const totalesMes: Record<string, number> = Object.fromEntries(meses.map(m => [m, 0]));
  for (const s of porId.values()) {
    // Servicio que se paga con tarjeta y no tiene factura en el panel: cada mes cerrado sin factura, cargo ni coste manual lleva el importe estimado (en amarillo).
    if (s.tipoPago === 'TARJETA_SIN_FACTURA' && s.estimadoMensual && s.estimadoMensual > 0 && s.estado !== 'en_baja') {
      for (const m of mesesCerrados) { const c = s.meses[m]; if (c.facturado + c.sinFactura + c.manual === 0) { c.estimado = r2(s.estimadoMensual); s.totalEstimado = r2(s.totalEstimado + c.estimado); } }
    }
    for (const m of meses) { const c = s.meses[m]; c.total = r2(c.facturado + c.sinFactura + c.manual + c.estimado); s.totalFacturado = r2(s.totalFacturado + c.facturado); s.totalSinFactura = r2(s.totalSinFactura + c.sinFactura); s.totalManual = r2(s.totalManual + c.manual); totalesMes[m] = r2(totalesMes[m] + c.total); }
    s.totalAnio = r2(s.totalFacturado + s.totalSinFactura + s.totalManual + s.totalEstimado);
    const ult3 = mesesCerrados.slice(-3);
    s.runRateMensual = ult3.length ? r2(ult3.reduce((a, m) => a + s.meses[m].total, 0) / ult3.length) : 0;
    const srv = e.servicios.find(x => x.id === s.servicioId)!;
    if (s.periodicidad === 'ANUAL') { s.anualizado = s.totalAnio; s.previsionOrigen = 'TOTAL_ANUAL'; } else { s.anualizado = r2(s.runRateMensual * 12); s.previsionOrigen = 'RITMO_3_MESES'; }
    let base = s.anualizado;
    if (srv.prevision2027Manual != null) { base = srv.prevision2027Manual; s.previsionOrigen = 'MANUAL'; }
    else if (s.estado === 'en_baja') { base = 0; s.previsionOrigen = 'EN_BAJA'; }
    s.prevision2027 = r2(base * (1 + subida / 100));
  }
  const servicios = [...porId.values()];
  const totalAnio = r2(servicios.reduce((a, s) => a + s.totalAnio, 0));
  const total27 = r2(servicios.reduce((a, s) => a + s.prevision2027, 0));
  const totalSin = r2(cargos.reduce((a, c) => a + c.importe, 0));
  if (cargos.length) avisos.push(`${cargos.length} cargos del banco (${totalSin.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €, IVA incluido) corresponden a estos servicios y no tienen factura ni justificante. Se suman al coste en amarillo hasta que llegue la factura.`);
  const conEst = servicios.filter(s => s.totalEstimado > 0);
  if (conEst.length) avisos.push(`${conEst.map(s => s.nombre).join(', ')}: cargo de tarjeta sin factura en el panel. Se suma un importe estimado por mes (${r2(conEst.reduce((a, s) => a + s.totalEstimado, 0)).toLocaleString('es-ES', { minimumFractionDigits: 2 })} € en el periodo, en amarillo). Confirma plan e importe con el recibo de la tarjeta.`);
  for (const s of servicios) if (s.estado === 'en_baja' && mesesCerrados.slice(-2).some(m => s.meses[m].total > 0)) avisos.push(`${s.nombre} figura en baja pero ha tenido coste en los últimos 2 meses cerrados: comprueba que no se renueva.`);
  const unR = r2(pagos.filter(p => p.estado === 'REAL').reduce((a, p) => a + p.total, 0));
  const unP = r2(pagos.filter(p => p.estado === 'PREVISTO').reduce((a, p) => a + p.total, 0));
  return {
    desde: e.desde, hasta, mesActual: e.mesActual, mesesCerrados, meses, servicios, totalesMes, totalAnio,
    totalAnualizado: r2(servicios.reduce((a, s) => a + s.anualizado, 0)), previsionTotal2027: total27, subidaPct: subida,
    pagosUnicos: pagos, totalPagosUnicosReales: unR, totalPagosUnicosPrevistos: unP,
    cargosSinFactura: cargos.sort((a, b) => b.fecha.localeCompare(a.fecha)), totalSinFactura: totalSin, avisos,
  };
}
