// Impuestos (Área 3): provisión de IVA (303) e IRPF (111 y 115) por trimestre desde las facturas del panel.
// Motor puro (sin base de datos) para poder probarlo. Importes en euros; las fechas son YYYY-MM-DD.
export interface EmitidaIn { id: string; num: string | null; cliente: string; fecha: string; base: number; tipoIva: number | null; importeIva: number | null }
export interface RecibidaIn {
  id: string; proveedor: string; num: string | null; fecha: string; base: number; tipoIva: number | null; importeIva: number | null;
  tipoIrpf: number | null; importeIrpf: number | null; concepto: string | null; calidad: string; deducible: boolean; internacional: boolean;
}
export interface NominaIn { anio: number; mes: number; irpf: number }
export interface PresentadoIn { modelo: '303' | '111' | '115'; ejercicio: number; trimestre: number; importe: number; estado: string; fuente: 'MANUAL' | 'AAPP'; referencia?: string | null }

export const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const n0 = (v: number | null | undefined) => (typeof v === 'number' && isFinite(v) ? v : 0);

export type ClaseRecibida = 'GASTO' | 'CONFIRMING' | 'EXTRANJERA' | 'SIN_IVA_SIN_CLASIFICAR' | 'REVISAR';
const RX_CONFIRMING = /confirming|cesi[oó]n de cr[eé]d|liquidaci[oó]n de bestretes|documento de cesi[oó]n/i;
const RX_EXTRANJERA = /\b(ou|ltd|limited|inc|gmbh|llc|b\.?v\.?|ireland|ab|oy|a\/s|sarl)\b/i;
const RX_ALQUILER = /alquiler|arrendamiento|arriendo|inmueble/i;

export function clasificarRecibida(r: RecibidaIn): ClaseRecibida {
  if (r.calidad !== 'VALIDA') return 'REVISAR';
  if (RX_CONFIRMING.test(r.concepto ?? '') || (/draxton/i.test(r.proveedor) && n0(r.tipoIva) === 0)) return 'CONFIRMING';
  if (n0(r.tipoIva) > 0 || n0(r.importeIva) !== 0) return 'GASTO';
  if (r.internacional || RX_EXTRANJERA.test(r.proveedor)) return 'EXTRANJERA';
  return 'SIN_IVA_SIN_CLASIFICAR';
}
export const esAlquiler = (r: Pick<RecibidaIn, 'concepto' | 'proveedor'>) => RX_ALQUILER.test(r.concepto ?? '');

export const trimestreDe = (fecha: string) => Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1;
export const mesesDeTrimestre = (anio: number, q: number) => [0, 1, 2].map(i => `${anio}-${String((q - 1) * 3 + i + 1).padStart(2, '0')}`);

const FESTIVOS_FIJOS = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];
const dow = (f: string) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)))).getUTCDay();
const sumaDias = (f: string, d: number) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)) + d)).toISOString().slice(0, 10);
export const esInhabil = (f: string) => dow(f) === 0 || dow(f) === 6 || FESTIVOS_FIJOS.includes(f.slice(5));
/** Fecha límite de presentación y pago de los modelos trimestrales: 20/04, 20/07, 20/10 y 30/01 del año siguiente, pasada al siguiente día hábil.
 *  No incluye festivos móviles ni autonómicos (p. ej. Viernes Santo): confirmar con la gestoría. */
export function fechaLimite(anio: number, q: number): string {
  let f = q === 4 ? `${anio + 1}-01-30` : `${anio}-${['04', '07', '10'][q - 1]}-20`;
  while (esInhabil(f)) f = sumaDias(f, 1);
  return f;
}

export type Gravedad = 'ALTA' | 'MEDIA' | 'INFO';
export interface Aviso { codigo: string; gravedad: Gravedad; texto: string; n?: number; importe?: number }
export interface MesImp { mes: string; repercutido: number; soportado: number; irpf111: number; irpf115: number; estimado: boolean; nota?: string }
export interface Cuadre { modelo: '303' | '111' | '115'; calculado: number; presentado: number | null; estado: string | null; fuente: string | null; diferencia: number | null; semaforo: 'OK' | 'REVISAR' | 'SIN_DATO'; explicacion: string }
export interface Trimestre {
  ejercicio: number; trimestre: number; desde: string; hasta: string; fechaLimite: string; diasParaLimite: number; vencido: boolean; enCurso: boolean; cerrado: boolean;
  repercutido: { base: number; cuota: number; n: number }; soportado: { base: number; cuota: number; n: number };
  resultado303: number; irpf111: { nominas: number; profesionales: number; total: number }; irpf115: { base: number; retenido: number; n: number };
  meses: MesImp[]; previsto: { resultado303: number; irpf111: number; irpf115: number; total: number } | null;
  cuadre: Cuadre[]; avisos: Aviso[]; calidad: 'ALTA' | 'MEDIA' | 'BAJA';
}
export interface Tesoreria { mes: string; concepto: string; importe: number; estimado: boolean }
export interface ResultadoImpuestos {
  ejercicio: number; hoy: string; trimestreActual: number; trimestres: Trimestre[];
  tesoreria: { apartarCadaMes: number; referenciaPresentado: { media303: number; n: number; apartarCadaMes: number } | null; porMes: Tesoreria[]; fechaPago: string; deudaPendiente: { modelo: string; ejercicio: number; trimestre: number; importe: number; estado: string }[]; totalDeuda: number } | null;
  ultimaEmitida: string | null; ultimaRecibida: string | null; avisosGlobales: Aviso[];
}

const mediaUltimos = (vals: number[], n = 3) => { const v = vals.slice(-n); return v.length ? r2(v.reduce((a, b) => a + b, 0) / v.length) : 0; };
const diasEntre = (a: string, b: string) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
const eurTxt = (v: number) => v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export interface EntradaImpuestos { ejercicio: number; hoy: string; emitidas: EmitidaIn[]; recibidas: RecibidaIn[]; nominas: NominaIn[]; presentados: PresentadoIn[] }

export function calcularImpuestos(e: EntradaImpuestos): ResultadoImpuestos {
  const { ejercicio, hoy } = e;
  const mesHoy = hoy.slice(0, 7); const qHoy = ejercicio === Number(hoy.slice(0, 4)) ? trimestreDe(hoy) : 4;
  const emit = e.emitidas.filter(x => x.fecha.startsWith(String(ejercicio)));
  const rec = e.recibidas.filter(x => x.fecha.startsWith(String(ejercicio)));
  const porMes = (mes: string) => {
    const em = emit.filter(x => x.fecha.startsWith(mes)); const rc = rec.filter(x => x.fecha.startsWith(mes));
    const gasto = rc.filter(x => clasificarRecibida(x) === 'GASTO' && x.deducible);
    const prof = rc.filter(x => clasificarRecibida(x) !== 'REVISAR' && n0(x.importeIrpf) !== 0);
    const nom = e.nominas.filter(x => x.anio === ejercicio && `${x.anio}-${String(x.mes).padStart(2, '0')}` === mes);
    return {
      emit: em, gasto, rec: rc,
      repBase: r2(em.reduce((s, x) => s + n0(x.base), 0)), repCuota: r2(em.reduce((s, x) => s + n0(x.importeIva), 0)),
      sopBase: r2(gasto.reduce((s, x) => s + n0(x.base), 0)), sopCuota: r2(gasto.reduce((s, x) => s + n0(x.importeIva), 0)),
      nominas: r2(nom.reduce((s, x) => s + n0(x.irpf), 0)), nNom: nom.length,
      profes: r2(prof.filter(x => !esAlquiler(x)).reduce((s, x) => s + n0(x.importeIrpf), 0)),
      alqBase: r2(prof.filter(esAlquiler).reduce((s, x) => s + n0(x.base), 0)), alqRet: r2(prof.filter(esAlquiler).reduce((s, x) => s + n0(x.importeIrpf), 0)), nAlq: prof.filter(esAlquiler).length,
    };
  };
  const ultimaEmitida = emit.reduce<string | null>((m, x) => (!m || x.fecha > m ? x.fecha : m), null);
  const ultimaRecibida = rec.reduce<string | null>((m, x) => (!m || x.fecha > m ? x.fecha : m), null);

  // Ritmo de los últimos 3 meses cerrados (para estimar los meses que faltan del trimestre en curso).
  const mesesCerrados: string[] = []; for (let m = 1; m <= 12; m++) { const k = `${ejercicio}-${String(m).padStart(2, '0')}`; if (k < mesHoy) mesesCerrados.push(k); }
  const datosCerrados = mesesCerrados.map(porMes);
  const ritmo = {
    rep: mediaUltimos(datosCerrados.map(d => d.repCuota)), sop: mediaUltimos(datosCerrados.map(d => d.sopCuota)),
    nom: mediaUltimos(datosCerrados.filter(d => d.nNom > 0).map(d => d.nominas)),
    prof: mediaUltimos(datosCerrados.map(d => d.profes)), alq: mediaUltimos(datosCerrados.map(d => d.alqRet)),
  };

  const trimestres: Trimestre[] = [];
  for (let q = 1; q <= 4; q++) {
    const meses = mesesDeTrimestre(ejercicio, q); const ds = meses.map(porMes);
    const desde = `${meses[0]}-01`; const hasta = sumaDias(`${meses[2]}-01`, 31).slice(0, 7) === meses[2] ? `${meses[2]}-31` : sumaDias(`${sumaDias(`${meses[2]}-01`, 31).slice(0, 7)}-01`, -1);
    const lim = fechaLimite(ejercicio, q);
    const enCurso = q === qHoy && ejercicio === Number(hoy.slice(0, 4)); const futuro = hoy < desde;
    const cerrado = hoy > hasta;
    const avisos: Aviso[] = [];
    const rcAll = ds.flatMap(d => d.rec);
    const revisar = rcAll.filter(x => clasificarRecibida(x) === 'REVISAR');
    if (revisar.length) avisos.push({ codigo: 'REVISAR_LECTURA', gravedad: 'ALTA', n: revisar.length, importe: r2(revisar.reduce((s, x) => s + n0(x.base), 0)), texto: `${revisar.length} facturas recibidas con lectura por revisar no entran en el cálculo (su IVA puede faltar).` });
    const sinClas = rcAll.filter(x => clasificarRecibida(x) === 'SIN_IVA_SIN_CLASIFICAR' && Math.abs(n0(x.base)) > 0.005);
    if (sinClas.length) avisos.push({ codigo: 'SIN_IVA_SIN_CLASIFICAR', gravedad: 'MEDIA', n: sinClas.length, importe: r2(sinClas.reduce((s, x) => s + n0(x.base), 0)), texto: `${sinClas.length} facturas recibidas sin IVA y sin clasificar (¿exentas, extranjeras, suplidos?). No aportan IVA soportado.` });
    const extr = rcAll.filter(x => clasificarRecibida(x) === 'EXTRANJERA' && Math.abs(n0(x.base)) > 0.005);
    if (extr.length) avisos.push({ codigo: 'EXTRANJERAS', gravedad: 'INFO', n: extr.length, importe: r2(extr.reduce((s, x) => s + n0(x.base), 0)), texto: `${extr.length} facturas de proveedores extranjeros sin IVA: el panel no calcula la inversión del sujeto pasivo (neutra en el 303 si el IVA es deducible al 100 %).` });
    const conf = rcAll.filter(x => clasificarRecibida(x) === 'CONFIRMING');
    if (conf.length) avisos.push({ codigo: 'CONFIRMING', gravedad: 'INFO', n: conf.length, importe: r2(conf.reduce((s, x) => s + n0(x.base), 0)), texto: `${conf.length} documentos de confirming o cesión de créditos (Draxton/BBVA/CaixaBank) no se cuentan como gasto ni como IVA.` });
    const incoh = [...ds.flatMap(d => d.emit).filter(x => Math.abs(n0(x.importeIva) - n0(x.base) * n0(x.tipoIva) / 100) > 0.1).map(x => x.id), ...ds.flatMap(d => d.gasto).filter(x => Math.abs(n0(x.importeIva) - n0(x.base) * n0(x.tipoIva) / 100) > 0.1).map(x => x.id)];
    if (incoh.length) avisos.push({ codigo: 'IVA_INCOHERENTE', gravedad: 'MEDIA', n: incoh.length, texto: `${incoh.length} facturas con cuota de IVA distinta de base × tipo (más de 0,10 €). Se usa la cuota que figura en la factura.` });
    const raros = ds.flatMap(d => d.emit).filter(x => Math.abs(n0(x.base)) >= 5 && ![0, 4, 10, 21].some(t => Math.abs(n0(x.tipoIva) - t) <= 0.6));
    if (raros.length) avisos.push({ codigo: 'TIPO_IVA_RARO', gravedad: 'MEDIA', n: raros.length, importe: r2(raros.reduce((s, x) => s + n0(x.base), 0)), texto: `${raros.length} facturas emitidas con un tipo de IVA no habitual (no es 0, 4, 10 ni 21 %).` });
    const negIrpf = ds.flatMap(d => d.rec).filter(x => n0(x.importeIrpf) < 0 && n0(x.base) > 0);
    if (negIrpf.length) avisos.push({ codigo: 'IRPF_NEGATIVO', gravedad: 'MEDIA', n: negIrpf.length, importe: r2(negIrpf.reduce((s, x) => s + n0(x.importeIrpf), 0)), texto: `${negIrpf.length} facturas con base positiva y retención negativa (¿error de signo?). Restan retención en el 111/115.` });
    const sinNom = ds.map((d, i) => ({ d, m: meses[i] })).filter(({ d, m }) => d.nNom === 0 && m < mesHoy && ds.some(x => x.nNom > 0 || true) && e.nominas.some(n => n.anio === ejercicio && n.mes < Number(m.slice(5))));
    for (const { m } of sinNom) avisos.push({ codigo: 'NOMINAS_FALTAN', gravedad: 'ALTA', texto: `Faltan las nóminas de ${m}: la retención del 111 de ese mes está sin calcular.` });
    if (!futuro && ultimaEmitida && ultimaEmitida < hasta && (enCurso || !cerrado) && diasEntre(ultimaEmitida, hoy) > 5) avisos.push({ codigo: 'EMITIDAS_DESACTUALIZADAS', gravedad: 'ALTA', texto: `La última factura emitida importada es del ${ultimaEmitida.split('-').reverse().join('/')}: el IVA repercutido del trimestre está incompleto.` });
    if (!futuro && enCurso && ultimaRecibida && diasEntre(ultimaRecibida, hoy) > 10) avisos.push({ codigo: 'RECIBIDAS_DESACTUALIZADAS', gravedad: 'MEDIA', texto: `La última factura recibida es del ${ultimaRecibida.split('-').reverse().join('/')}: pueden faltar facturas del final del trimestre.` });

    const repC = r2(ds.reduce((s, d) => s + d.repCuota, 0)); const sopC = r2(ds.reduce((s, d) => s + d.sopCuota, 0));
    const nomT = r2(ds.reduce((s, d) => s + d.nominas, 0)); const profT = r2(ds.reduce((s, d) => s + d.profes, 0));
    const alqB = r2(ds.reduce((s, d) => s + d.alqBase, 0)); const alqR = r2(ds.reduce((s, d) => s + d.alqRet, 0));
    const mesesImp: MesImp[] = meses.map((m, i) => {
      const d = ds[i]; const cerradoMes = m < mesHoy; const est = !cerradoMes || (cerradoMes && d.nNom === 0 && !!ritmo.nom);
      if (cerradoMes && !futuro) { const sinNom = d.nNom === 0; const nomMes = sinNom && enCurso ? ritmo.nom : d.nominas; return { mes: m, repercutido: d.repCuota, soportado: d.sopCuota, irpf111: r2(nomMes + d.profes), irpf115: d.alqRet, estimado: sinNom, nota: sinNom ? (enCurso ? 'sin nóminas cargadas: 111 estimado con el ritmo reciente' : 'sin nóminas cargadas') : undefined }; }
      return { mes: m, repercutido: ritmo.rep, soportado: ritmo.sop, irpf111: r2(ritmo.nom + ritmo.prof), irpf115: ritmo.alq, estimado: true, nota: est ? 'estimado con el ritmo de los 3 últimos meses cerrados' : undefined };
    });
    const previsto = (enCurso || futuro) ? (() => {
      const rep = r2(mesesImp.reduce((s, m) => s + m.repercutido, 0)); const sop = r2(mesesImp.reduce((s, m) => s + m.soportado, 0));
      const i111 = r2(mesesImp.reduce((s, m) => s + m.irpf111, 0)); const i115 = r2(mesesImp.reduce((s, m) => s + m.irpf115, 0));
      return { resultado303: r2(rep - sop), irpf111: i111, irpf115: i115, total: r2(rep - sop + i111 + i115) };
    })() : null;
    if (previsto) avisos.push({ codigo: 'PREVISION', gravedad: 'INFO', texto: 'Trimestre no cerrado: el resultado previsto usa lo real de los meses cerrados y el ritmo de los 3 últimos meses cerrados para el resto (en amarillo).' });

    // Cuadre con lo presentado.
    const pres = (m: '303' | '111' | '115') => { const c = e.presentados.filter(p => p.modelo === m && p.ejercicio === ejercicio && p.trimestre === q); return c.find(p => p.fuente === 'MANUAL') ?? c[0] ?? null; };
    const resultado = r2(repC - sopC); const t111 = r2(nomT + profT);
    const cuadrar = (modelo: '303' | '111' | '115', calc: number): Cuadre => {
      const p = pres(modelo);
      if (!p) return { modelo, calculado: calc, presentado: null, estado: null, fuente: null, diferencia: null, semaforo: 'SIN_DATO', explicacion: cerrado && hoy > lim ? `No consta el modelo ${modelo} presentado de este trimestre (plazo vencido el ${lim.split('-').reverse().join('/')}). Súbelo a mano o compruébalo con la gestoría.` : 'Aún no se ha presentado.' };
      const dif = r2(calc - p.importe); const ok = Math.abs(dif) <= Math.max(1, Math.abs(p.importe) * 0.01);
      let expl = ok ? 'Cuadra con lo presentado.' : `El panel calcula ${eurTxt(calc)} y se presentó ${eurTxt(p.importe)} (diferencia ${eurTxt(dif)}).`;
      if (!ok && modelo === '303') expl += ' Causas habituales: facturas recibidas que no están en el panel (soportado incompleto), criterio de devengo distinto, rectificativas o inversión del sujeto pasivo.';
      if (!ok && modelo === '111' && Math.abs(nomT - p.importe) <= 1 && Math.abs(profT) > 1) expl += ` Lo presentado coincide con las nóminas (${eurTxt(nomT)}): las retenciones a profesionales (${eurTxt(profT)}) no figuran en el 111.`;
      return { modelo, calculado: calc, presentado: p.importe, estado: p.estado, fuente: p.fuente, diferencia: dif, semaforo: ok ? 'OK' : 'REVISAR', explicacion: expl };
    };
    const cuadre = futuro || enCurso ? [] : [cuadrar('303', resultado), cuadrar('111', t111), ...(alqR !== 0 || pres('115') ? [cuadrar('115', alqR)] : [])];
    for (const c of cuadre) if (c.semaforo === 'SIN_DATO' && hoy > lim) avisos.push({ codigo: `NO_PRESENTADO_${c.modelo}`, gravedad: 'ALTA', texto: `Modelo ${c.modelo} ${q}T ${ejercicio}: no consta presentado y el plazo venció el ${lim.split('-').reverse().join('/')}.` });
    for (const c of cuadre) if (c.semaforo === 'REVISAR') avisos.push({ codigo: `NO_CUADRA_${c.modelo}`, gravedad: 'ALTA', texto: `Modelo ${c.modelo} ${q}T: no cuadra con lo presentado (diferencia ${eurTxt(c.diferencia ?? 0)}).` });

    const altas = avisos.filter(a => a.gravedad === 'ALTA').length; const medias = avisos.filter(a => a.gravedad === 'MEDIA').length;
    trimestres.push({
      ejercicio, trimestre: q, desde, hasta, fechaLimite: lim, diasParaLimite: diasEntre(hoy, lim), vencido: hoy > lim, enCurso, cerrado,
      repercutido: { base: r2(ds.reduce((s, d) => s + d.repBase, 0)), cuota: repC, n: ds.reduce((s, d) => s + d.emit.length, 0) },
      soportado: { base: r2(ds.reduce((s, d) => s + d.sopBase, 0)), cuota: sopC, n: ds.reduce((s, d) => s + d.gasto.length, 0) },
      resultado303: resultado, irpf111: { nominas: nomT, profesionales: profT, total: t111 }, irpf115: { base: alqB, retenido: alqR, n: ds.reduce((s, d) => s + d.nAlq, 0) },
      meses: mesesImp, previsto, cuadre, avisos, calidad: altas > 0 ? 'BAJA' : medias > 0 ? 'MEDIA' : 'ALTA',
    });
  }

  // Tesorería: cuánto apartar cada mes para el trimestre en curso + deuda ya reconocida (aplazada o denegada).
  const tAct = trimestres[qHoy - 1];
  let tesoreria: ResultadoImpuestos['tesoreria'] = null;
  if (tAct?.previsto) {
    const total = Math.max(0, tAct.previsto.resultado303) + Math.max(0, tAct.previsto.irpf111) + Math.max(0, tAct.previsto.irpf115);
    const deuda = e.presentados.filter(p => ['APLAZADO', 'DENEGADO'].includes(p.estado) && p.fuente !== undefined).map(p => ({ modelo: p.modelo, ejercicio: p.ejercicio, trimestre: p.trimestre, importe: p.importe, estado: p.estado }));
    const pres303 = trimestres.filter(t => t.trimestre < qHoy).map(t => e.presentados.find(p => p.modelo === '303' && p.ejercicio === ejercicio && p.trimestre === t.trimestre)).filter((p): p is PresentadoIn => !!p && p.importe > 0);
    const media303 = pres303.length ? r2(pres303.reduce((s, p) => s + p.importe, 0) / pres303.length) : 0;
    const otros = Math.max(0, tAct.previsto.irpf111) + Math.max(0, tAct.previsto.irpf115);
    tesoreria = {
      apartarCadaMes: r2(total / 3), fechaPago: tAct.fechaLimite,
      referenciaPresentado: pres303.length ? { media303, n: pres303.length, apartarCadaMes: r2((media303 + otros) / 3) } : null,
      porMes: tAct.meses.map(m => ({ mes: m.mes, concepto: `IVA 303 + IRPF 111/115 del ${qHoy}T`, importe: r2(total / 3), estimado: true })),
      deudaPendiente: deuda, totalDeuda: r2(deuda.reduce((s, d) => s + d.importe, 0)),
    };
  }
  const avisosGlobales: Aviso[] = [];
  if (!e.presentados.some(p => p.fuente === 'AAPP' || p.fuente === 'MANUAL')) avisosGlobales.push({ codigo: 'SIN_PRESENTADOS', gravedad: 'MEDIA', texto: 'No hay modelos presentados cargados: sin ellos no se puede cuadrar el cálculo. Súbelos a mano o cárgalos en AAPP.' });
  return { ejercicio, hoy, trimestreActual: qHoy, trimestres, tesoreria, ultimaEmitida, ultimaRecibida, avisosGlobales };
}
