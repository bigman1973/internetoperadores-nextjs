/**
 * Desglose pulsable de Rentabilidad (solo lectura).
 * Explica de dónde sale cada cifra de «Por cliente» y «Por producto»:
 *  - facturado: líneas de factura de venta que suman el ingreso del mes;
 *  - coste: facturas de proveedor (o estimaciones) que suman el coste asignado;
 *  - contratos: contratos incluidos, con cuota, alta, baja y estado importado de ISP.
 * Lo que no existe en los datos se devuelve como null y la pantalla lo muestra como «sin dato».
 * Nada de esto escribe en la base de datos ni recalcula: parte de la última foto guardada del mes.
 */
import { periodicity, shiftMonth } from './engine'

export type DesgloseTipo = 'cliente' | 'producto'
export type DesgloseVista = 'facturado' | 'coste' | 'contratos'
export type Fila = Record<string, any>
export type DesgloseResultado = {
  month: string; tipo: DesgloseTipo; clave: string; nombre: string; vista: DesgloseVista
  /** Cifra que muestra la tabla de la pantalla para este mismo concepto. */
  cifraTabla: number | null
  /** Suma de las filas del detalle (más el ajuste de redondeo si existe). */
  sumaDetalle: number | null
  diferencia: number | null
  cuadra: boolean
  filas: Fila[]
  notas: string[]
  cobertura: Record<string, number>
}
export type LineaFacturada = { contrato: string; fecha: string; mes: string; base: number; concepto: string; tarifa: string; cif: string | null; periodMonths: unknown }
export type FacturaEmitida = { cif: string | null; fecha: string; numero: string; base: number }
export type FacturaRecibida = { id: string; proveedor: string | null; numero: string | null; fecha: string | null; base: number | null; concepto: string | null }
export type FacturaSerie = { serie: string; numero: string | null; fecha: string; cliente: string | null; base: number }
export type VersionContrato = { codigo: string; payload: Record<string, any> }
export type DatosDesglose = { lineas: LineaFacturada[]; emitidas: FacturaEmitida[]; recibidas: FacturaRecibida[]; series: FacturaSerie[]; versiones: VersionContrato[] }

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown): number | null => { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const txt = (v: unknown): string | null => { const s = v === null || v === undefined ? '' : String(v).trim(); return s ? s : null }
const dia = (v: unknown): string | null => { const s = txt(v); return s ? s.slice(0, 10) : null }

/** Contratos y datos de la fila que la pantalla enseña (misma foto, mismos contratos). */
export function ambito(payload: any, tipo: DesgloseTipo, clave: string) {
  const clientes: any[] = Array.isArray(payload?.clients) ? payload.clients : []
  const productos: any[] = Array.isArray(payload?.products) ? payload.products : []
  if (tipo === 'cliente') {
    const c = clientes.find(x => String(x.clientCode) === clave)
    return { nombre: c ? String(c.clientName ?? clave) : clave, fila: c ?? null, contratos: (c?.contracts ?? []) as any[] }
  }
  const p = productos.find(x => String(x.product) === clave)
  const contratos = clientes.flatMap(c => (c.contracts ?? []) as any[]).filter(k => String(k.product) === clave)
  return { nombre: clave, fila: p ?? null, contratos }
}
export const codigosContratos = (payload: any, tipo: DesgloseTipo, clave: string): string[] => ambito(payload, tipo, clave).contratos.map(k => String(k.contractCode)).filter(Boolean)
export const seriesDelProducto = (payload: any, clave: string): string[] => {
  const p = (payload?.products ?? []).find((x: any) => String(x.product) === clave)
  return Array.from(new Set(((p?.sources ?? []) as any[]).filter(s => s.source === 'ISP_FACTURAS_SERIE' && s.serie).map(s => String(s.serie))))
}
export const idsFacturasRecibidas = (payload: any, tipo: DesgloseTipo, clave: string): string[] => {
  const { fila, contratos } = ambito(payload, tipo, clave)
  const fuentes: any[] = tipo === 'producto' ? (fila?.sources ?? []) : contratos.flatMap(k => k.costSources ?? [])
  return Array.from(new Set(fuentes.map(s => txt(s.sourceId)).filter((x): x is string => !!x)))
}

/** Reparto por periodicidad: igual que el motor (cuotas trimestrales/semestrales/anuales se reparten por meses cubiertos). */
export function parteDelMes(l: Pick<LineaFacturada, 'mes' | 'base' | 'periodMonths'>, mes: string): { parte: number; meses: number } {
  const p = periodicity(l.periodMonths); const k = p && p > 1 ? p : 1
  if (k === 1) return { parte: l.mes === mes ? l.base : 0, meses: 1 }
  return { parte: l.mes <= mes && mes < shiftMonth(l.mes, k) ? l.base / k : 0, meses: k }
}

const PERIODO: Record<number, string> = { 1: 'Mensual', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual' }

export function construirFacturado(payload: any, tipo: DesgloseTipo, clave: string, mes: string, datos: DatosDesglose): DesgloseResultado {
  const { nombre, fila, contratos } = ambito(payload, tipo, clave)
  const porContrato = new Map<string, any>(contratos.map(k => [String(k.contractCode), k]))
  const emitidasPorDia = new Map<string, FacturaEmitida[]>()
  for (const f of datos.emitidas) { const k = `${f.cif ?? ''}|${dia(f.fecha)}`; const a = emitidasPorDia.get(k) ?? []; a.push(f); emitidasPorDia.set(k, a) }
  const filas: Fila[] = []; const notas: string[] = []
  let exactas = 0, variasEseDia = 0, sinFactura = 0
  for (const l of datos.lineas) {
    const c = porContrato.get(String(l.contrato)); if (!c) continue
    const { parte, meses } = parteDelMes(l, mes); if (parte === 0) continue
    const cands = emitidasPorDia.get(`${l.cif ?? ''}|${dia(l.fecha)}`) ?? []
    let factura: string | null = null; let exacta = false; let nota: string | null = null
    if (cands.length === 1) { factura = cands[0].numero; exacta = true; exactas++ }
    else if (cands.length > 1) { variasEseDia++; nota = `Una de ${cands.length} facturas de ese día: ${cands.map(x => x.numero).join(', ')}` }
    else sinFactura++
    filas.push({ fecha: dia(l.fecha), factura, facturaExacta: exacta, facturaNota: nota, concepto: l.concepto || null, contrato: String(l.contrato), cliente: String(c.clientName ?? ''), tarifa: l.tarifa || c.tariff || null, producto: c.product ?? null, periodicidad: PERIODO[meses] ?? `${meses} meses`, importeFactura: r2(l.base), importe: r2(parte) })
  }
  // Ingreso por serie de factura (Zoom, Hotspot, comisiones): no pasa por contratos.
  if (tipo === 'producto') {
    for (const s of datos.series) filas.push({ fecha: dia(s.fecha), factura: s.numero, facturaExacta: !!s.numero, facturaNota: null, concepto: `Factura de la serie ${s.serie}${s.cliente ? ` · ${s.cliente}` : ''}`, contrato: null, cliente: s.cliente, tarifa: null, producto: clave, periodicidad: 'Mensual', importeFactura: r2(s.base), importe: r2(s.base) })
    if (datos.series.length) notas.push('Parte del ingreso de este producto viene de series de factura propias, sin contrato asociado.')
  }
  filas.sort((a, b) => String(a.cliente ?? '').localeCompare(String(b.cliente ?? ''), 'es') || String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')) || String(a.contrato ?? '').localeCompare(String(b.contrato ?? '')))
  const cifraTabla = num(fila?.income)
  const suma = r2(filas.reduce((s, f) => s + (f.importe as number), 0))
  const ajuste = cifraTabla === null ? 0 : r2(cifraTabla - suma)
  if (cifraTabla !== null && Math.abs(ajuste) >= 0.005) {
    if (Math.abs(ajuste) <= Math.max(0.1, 0.005 * filas.length)) filas.push({ fecha: null, factura: null, facturaExacta: false, facturaNota: null, concepto: 'Ajuste de redondeo (cada línea y cada contrato se redondea a céntimos)', contrato: null, cliente: null, tarifa: null, producto: null, periodicidad: null, importeFactura: null, importe: ajuste, ajuste: true })
    else notas.push(`La suma de las líneas (${suma.toLocaleString('es-ES')} €) no coincide con la cifra de la tabla. Recalcula el mes o revisa el aviso del motor.`)
  }
  const total = r2(filas.reduce((s, f) => s + (f.importe as number), 0))
  if (variasEseDia) notas.push('Cuando ISP emitió varias facturas el mismo día al mismo cliente, el listado de líneas no dice a cuál pertenece cada línea: se muestran las candidatas.')
  if (sinFactura) notas.push('Las líneas «sin dato» en el nº de factura no tienen una factura emitida del mismo cliente y día en el panel.')
  if (datos.lineas.some(l => periodicity(l.periodMonths)! > 1)) notas.push('Las cuotas trimestrales, semestrales y anuales se reparten entre los meses que cubren, igual que en la tabla.')
  return { month: mes, tipo, clave, nombre, vista: 'facturado', cifraTabla, sumaDetalle: total, diferencia: cifraTabla === null ? null : r2(cifraTabla - total), cuadra: cifraTabla !== null && Math.abs(cifraTabla - total) < 0.01, filas, notas, cobertura: { lineas: filas.length, conFacturaExacta: exactas, variasFacturasEseDia: variasEseDia, sinFactura } }
}

const METODOS: Record<string, string> = { 'peso en ingreso del producto': 'Proporcional a lo que factura cada contrato', 'Mb contratados': 'Proporcional a los Mb contratados' }
const nombreMetodo = (m: unknown): string | null => { const s = txt(m); if (!s) return null; return METODOS[s] ?? (/personal asignado/i.test(s) ? 'Personal asignado al contrato' : s) }
const FUENTE_XLSX = 'Hoja de costes de proveedores (carga inicial)'

export function construirCoste(payload: any, tipo: DesgloseTipo, clave: string, mes: string, datos: DatosDesglose): DesgloseResultado {
  const { nombre, fila, contratos } = ambito(payload, tipo, clave)
  const recibidas = new Map(datos.recibidas.map(f => [String(f.id), f]))
  const productos: any[] = payload?.products ?? []
  // Importe de cada línea de factura tal como la tiene el producto, y regla de reparto observada en los contratos.
  const lineaProducto = new Map<string, any>(); const reglas = new Map<string, Set<string>>()
  for (const p of productos) for (const s of p.sources ?? []) { if (s.source === 'ISP_FACTURAS_SERIE') continue; const k = clave2(s); if (!lineaProducto.has(k)) lineaProducto.set(k, s) }
  for (const k of contratos) for (const s of k.costSources ?? []) { const m = nombreMetodo(s.method); if (m) { const a = reglas.get(clave2(s)) ?? new Set<string>(); a.add(m); reglas.set(clave2(s), a) } }
  const filas: Fila[] = []; let reales = 0, estimadas = 0, pendientes = 0, conFactura = 0
  const describe = (s: any): Fila => {
    const id = txt(s.sourceId); const f = id ? recibidas.get(id) : undefined
    const esFactura = String(s.source ?? '').startsWith('factura:')
    const estado = s.status === 'REAL' ? 'REAL' : s.status === 'PENDIENTE' ? 'PENDIENTE' : 'ESTIMADO'
    const origen = esFactura ? 'Factura de proveedor' : String(s.source ?? '').startsWith('estimacion:') ? 'Estimación (falta la factura del mes)' : String(s.source ?? '').startsWith('GGCC:') ? 'Personal asignado (nómina)' : s.source === 'COSTES_XLSX_INITIAL' ? FUENTE_XLSX : 'Otro origen'
    const lp = lineaProducto.get(clave2(s))
    if (estado === 'REAL') reales++; else if (estado === 'ESTIMADO') estimadas++; else pendientes++
    if (f?.numero) conFactura++
    return {
      proveedor: txt(f?.proveedor) ?? txt(s.provider) ?? (s.payer === 'Vola' ? 'Costes de Vola' : null),
      factura: esFactura ? txt(f?.numero) : null, fechaFactura: esFactura ? dia(f?.fecha ?? s.sourceDate) : dia(s.sourceDate),
      concepto: txt(s.description) ?? txt(f?.concepto) ?? (origen === FUENTE_XLSX ? txt(s.provider) : null),
      totalLinea: esFactura ? num(lp?.amount ?? s.amount) : null, totalFactura: esFactura ? num(f?.base) : null,
      regla: nombreMetodo(s.method) ?? (tipo === 'producto' ? Array.from(reglas.get(clave2(s)) ?? []).join(' / ') || null : null),
      importe: r2(num(s.amount) ?? 0), estado, origen,
    }
  }
  if (tipo === 'cliente') {
    for (const k of contratos) for (const s of k.costSources ?? []) { const d = describe(s); filas.push({ ...d, contrato: String(k.contractCode), tarifa: txt(k.tariff), producto: txt(k.product), cliente: txt(k.clientName) }) }
  } else {
    const delProducto = ((fila?.sources ?? []) as any[]).filter(s => s.source !== 'ISP_FACTURAS_SERIE')
    for (const s of delProducto) filas.push({ ...describe(s), contrato: null, tarifa: null, producto: clave, cliente: null })
    // Costes que el producto no trae como fuente propia (p. ej. personal asignado): se agrupan desde sus contratos.
    const conocidas = new Set(delProducto.map(clave2)); const extra = new Map<string, any>()
    for (const k of contratos) for (const s of (k.costSources ?? []) as any[]) {
      const id = clave2(s); if (conocidas.has(id)) continue
      const x = extra.get(id); if (x) { x.amount = r2((num(x.amount) ?? 0) + (num(s.amount) ?? 0)); x.contratos++ } else extra.set(id, { ...s, amount: num(s.amount) ?? 0, contratos: 1 })
    }
    for (const s of extra.values()) filas.push({ ...describe(s), contrato: null, tarifa: null, producto: clave, cliente: null, concepto: txt(s.description) ?? (s.contratos > 1 ? `Repartido entre ${s.contratos} contratos` : null) })
  }
  filas.sort((a, b) => String(a.proveedor ?? '').localeCompare(String(b.proveedor ?? ''), 'es') || String(a.contrato ?? '').localeCompare(String(b.contrato ?? ''), undefined, { numeric: true }))
  const cifraTabla = fila ? r2((num(fila.rawCost ?? fila.cost) ?? 0) + (num(fila.rawEstimatedCost ?? fila.estimatedCost) ?? 0)) : null
  let suma = r2(filas.reduce((s, f) => s + (f.importe as number), 0))
  const ajusteCoste = cifraTabla === null ? 0 : r2(cifraTabla - suma)
  if (ajusteCoste !== 0 && Math.abs(ajusteCoste) <= Math.max(0.05, 0.005 * filas.length)) {
    filas.push({ proveedor: null, factura: null, fechaFactura: null, concepto: 'Ajuste de redondeo (cada reparto se redondea a céntimos)', totalLinea: null, totalFactura: null, regla: null, importe: ajusteCoste, estado: 'REAL', origen: 'Redondeo', contrato: null, tarifa: null, producto: tipo === 'producto' ? clave : null, cliente: null, ajuste: true })
    suma = r2(filas.reduce((s, f) => s + (f.importe as number), 0))
  }
  const notas: string[] = []
  if (estimadas) notas.push('Los importes con punto ámbar son estimados: todavía no hay factura de proveedor del mes (o el reparto sale de la hoja de costes).')
  if (pendientes) notas.push('Hay costes de personal pendientes de la nómina: se muestran a 0 € hasta que existan.')
  if (tipo === 'producto') notas.push('La parte asignada es lo que carga el producto; después se reparte entre sus contratos con la regla indicada.')
  const sinRepartir = tipo === 'producto' ? num(fila?.unallocatedCost) : null
  if (sinRepartir && sinRepartir > 0) notas.push(`${sinRepartir.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € de este producto no se reparten a contratos concretos (coste común).`)
  return { month: mes, tipo, clave, nombre, vista: 'coste', cifraTabla, sumaDetalle: suma, diferencia: cifraTabla === null ? null : r2(cifraTabla - suma), cuadra: cifraTabla !== null && Math.abs(cifraTabla - suma) < 0.01, filas, notas, cobertura: { lineasDeCoste: filas.length, reales, estimadas, pendientes, conNumeroDeFactura: conFactura } }
}
const clave2 = (s: any) => String(s.source ?? '') === 'COSTES_XLSX_INITIAL' ? `${s.source}|${s.provider ?? ''}|${s.payer ?? ''}` : String(s.source ?? '')

export function construirContratos(payload: any, tipo: DesgloseTipo, clave: string, mes: string, datos: DatosDesglose): DesgloseResultado {
  const { nombre, fila, contratos } = ambito(payload, tipo, clave)
  const v = new Map(datos.versiones.map(x => [String(x.codigo), x.payload]))
  let conCuota = 0, conAlta = 0, conBaja = 0, conEstado = 0
  const filas: Fila[] = contratos.map(k => {
    const p = v.get(String(k.contractCode)) ?? {}
    const periodo = num(p.periodicityMonths ?? p.periodMonths ?? p.periodicidadMeses) ?? periodicity(p.periodicity)
    const precio = num(p.price ?? p.precioPeriodo)
    const cuota = num(p.contractedMonthlyAmount) ?? (precio !== null && periodo ? r2(precio / periodo) : null)
    const alta = dia(p.fechaAlta ?? p.startDate ?? p.fechaInicio), baja = dia(p.fechaBaja ?? p.endDate ?? p.fechaFin), estado = txt(p.estado ?? p.state ?? p.status)
    if (cuota !== null) conCuota++; if (alta) conAlta++; if (baja) conBaja++; if (estado) conEstado++
    return { contrato: String(k.contractCode), cliente: txt(k.clientName), tarifa: txt(k.tariff), producto: txt(k.product), descripcion: txt(k.description), cuota: cuota === null ? null : r2(cuota), periodicidad: periodo ? (PERIODO[periodo] ?? `${periodo} meses`) : null, alta, baja, estadoIsp: estado, facturadoMes: r2(num(k.income) ?? 0) }
  }).sort((a, b) => String(a.cliente ?? '').localeCompare(String(b.cliente ?? ''), 'es') || a.contrato.localeCompare(b.contrato, undefined, { numeric: true }))
  const cifraTabla = tipo === 'producto' ? num(fila?.contracts) : contratos.length
  const notas = ['El estado, el alta y la baja son los que se importaron de la hoja de contratos de ISP: no se consultan en vivo.']
  if (filas.length && (conAlta < filas.length || conBaja < filas.length)) notas.push('«Sin dato» significa que la hoja de contratos no trae esa información para ese contrato; no se ha supuesto nada.')
  return { month: mes, tipo, clave, nombre, vista: 'contratos', cifraTabla, sumaDetalle: filas.length, diferencia: cifraTabla === null ? null : cifraTabla - filas.length, cuadra: cifraTabla !== null && cifraTabla === filas.length, filas, notas, cobertura: { contratos: filas.length, conCuota, conAlta, conBaja, conEstadoIsp: conEstado } }
}

export function construirDesglose(payload: any, tipo: DesgloseTipo, clave: string, vista: DesgloseVista, mes: string, datos: DatosDesglose): DesgloseResultado {
  return vista === 'facturado' ? construirFacturado(payload, tipo, clave, mes, datos) : vista === 'coste' ? construirCoste(payload, tipo, clave, mes, datos) : construirContratos(payload, tipo, clave, mes, datos)
}
