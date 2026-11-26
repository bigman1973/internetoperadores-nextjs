/**
 * Encargo J · pantalla única de Conciliar. Funciones PURAS (sin BD ni React) para poder
 * probarlas en la batería: vistas, chips, estado de propuesta, KPIs y los 5 pasos.
 * Nada de aquí calcula cobros: sólo presenta lo que ya publica la proyección.
 */
import type { CuentaCuadre, EstadoCadena } from './conciliar-cuadre'

export const VISTAS = ['bandeja', 'cobros', 'pagos', 'remesas', 'pedir', 'cuentas'] as const
export type VistaConciliar = (typeof VISTAS)[number]

export function parseVista(value: unknown): VistaConciliar {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && (VISTAS as readonly string[]).includes(v) ? (v as VistaConciliar) : 'bandeja'
}

/** Rutas antiguas -> vista de la pantalla única. */
export const REDIRECTS_ANTIGUOS: Readonly<Record<string, VistaConciliar>> = {
  '/admin/finanzas/conciliacion-v2': 'bandeja',
  '/admin/finanzas/modo-facil': 'bandeja',
  '/admin/finanzas/pendientes': 'bandeja',
  '/admin/finanzas/conciliacion-remesas': 'remesas',
  '/admin/finanzas/para-pedir': 'pedir',
}
export function destinoConciliar(vista: VistaConciliar): string {
  return vista === 'bandeja' ? '/admin/finanzas/conciliar' : `/admin/finanzas/conciliar?vista=${vista}`
}

/* ───────── Chips de la bandeja → lecturas reales de la proyección ───────── */
export type ChipKey = 'all' | 'cli' | 'prov' | 'banco' | 'otro'
export const CHIPS: ReadonlyArray<readonly [ChipKey, string]> = [
  ['all', 'Todos'], ['cli', 'Cobros de clientes'], ['prov', 'Pagos a proveedores'], ['banco', 'Comisiones del banco'], ['otro', 'Sin pista'],
]
export type LecturaBandeja = Readonly<{ tab: 'COBROS' | 'PAGOS'; grupo?: 'PROVEEDORES' | 'BANCO'; estado?: 'ROJO' }>
export function lecturasDeChip(chip: ChipKey): readonly LecturaBandeja[] {
  switch (chip) {
    case 'cli': return [{ tab: 'COBROS' }]
    case 'prov': return [{ tab: 'PAGOS' }]
    case 'banco': return [{ tab: 'PAGOS', grupo: 'BANCO' }]
    case 'otro': return [{ tab: 'COBROS', estado: 'ROJO' }, { tab: 'PAGOS', estado: 'ROJO' }]
    default: return [{ tab: 'COBROS' }, { tab: 'PAGOS' }]
  }
}
export const PAGINA_BANDEJA = 50
/** Con dos lecturas (Todos / Sin pista) cada una aporta la mitad de la página. */
export function tamanoPorLectura(lecturas: number): number { return Math.max(1, Math.floor(PAGINA_BANDEJA / Math.max(1, lecturas))) }

/* ───────── Presentación de una fila ───────── */
type FilaMin = Readonly<{ color: 'VERDE' | 'AMBAR' | 'ROJO'; grupo: string | null; importeCentimos: number; documento: { tercero: string | null } | null }>
export function estadoPropuesta(row: Pick<FilaMin, 'color'>): Readonly<{ cls: 'g' | 'w' | 'b'; label: string }> {
  if (row.color === 'VERDE') return { cls: 'g', label: 'Propuesta segura' }
  if (row.color === 'AMBAR') return { cls: 'w', label: 'Revisar' }
  return { cls: 'b', label: 'Sin pista' }
}
export function tipoDeFila(row: Pick<FilaMin, 'grupo' | 'importeCentimos'>): string {
  const g = (row.grupo ?? '').toLowerCase()
  if (/banco|comisi|devoluci/.test(g)) return 'Banco'
  if (/traspas/.test(g)) return 'Traspaso propio'
  if (/n[oó]mina/.test(g)) return 'Nómina'
  if (/impuesto|aeat|seguridad/.test(g)) return 'Impuestos'
  if (/pr[eé]stamo|leasing/.test(g)) return 'Préstamo'
  if (/confirm|cesi[oó]n/.test(g)) return 'Confirming'
  if (/remesa/.test(g)) return 'Remesa'
  if (/tarjeta/.test(g)) return 'Tarjeta'
  if (/recibida|proveedor/.test(g)) return 'Proveedor'
  if (/cliente|ref_factura|cobro_isp|suma_cliente|emitida/.test(g)) return 'Cliente'
  return row.importeCentimos >= 0 ? 'Cobro por revisar' : 'Pago por revisar'
}
export function quienEs(row: Pick<FilaMin, 'color' | 'documento'>): Readonly<{ cls: 'g' | 'w'; label: string }> {
  const tercero = row.documento?.tercero?.trim()
  return tercero ? { cls: 'g', label: tercero } : { cls: 'w', label: 'Por confirmar' }
}
/** La proyección aún etiqueta «Vivid (cerrada)»; si la cuenta está activa no se enseña «cerrada». */
export function etiquetaCuenta(cuentaFila: string | null, cuentas: readonly Pick<CuentaCuadre, 'etiqueta' | 'activa'>[]): string {
  if (!cuentaFila) return 'Cuenta no disponible'
  const limpia = cuentaFila.replace(/\s*\(cerrada\)\s*$/i, '').trim()
  if (limpia === cuentaFila) return cuentaFila
  return cuentas.some(c => c.activa && c.etiqueta.trim().toLowerCase() === limpia.toLowerCase()) ? limpia : cuentaFila
}
export function fechaCorta(iso: string | null | undefined): string {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}` : '—'
}
export function fechaLarga(iso: string | null | undefined): string {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}
export function textoEstadoCadena(estado: EstadoCadena): string {
  switch (estado) {
    case 'OK': return 'Cuadra'
    case 'ORDEN_AMBIGUO': return 'Orden de apuntes ambiguo'
    case 'HUECO': return 'Faltan apuntes intermedios'
    default: return 'Falta el saldo inicial o final'
  }
}
export function claseEstadoCadena(estado: EstadoCadena): 'g' | 'w' | 'b' { return estado === 'OK' ? 'g' : estado === 'ORDEN_AMBIGUO' ? 'w' : 'b' }

/* ───────── Guarda de confirmación (cliente; el servidor repite la comprobación) ───────── */
export type BloqueoCliente = null | 'CUENTA_NO_CUADRA' | 'CUENTA_DESCONOCIDA'
export function bloqueoPorCuadre(cuentaId: string | null, cuadraPorId: ReadonlyMap<string, boolean>): BloqueoCliente {
  if (!cuentaId) return 'CUENTA_DESCONOCIDA'
  return cuadraPorId.get(cuentaId) === true ? null : 'CUENTA_NO_CUADRA'
}

/* ───────── KPIs y pasos ───────── */
export type ResumenKpi = Readonly<{ movimientos: number; entranCentimos: number; salenCentimos: number; conciliados: number; sinTercero: number }>
export type EntradaPanel = Readonly<{
  resumen: ResumenKpi
  cuentas: readonly CuentaCuadre[]
  sinDocumentoCobros: number
  sinDocumentoPagos: number
  rojas: number
  reglas: number
  hoy: string
}>
const nf = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 })
const eur0 = (cents: number) => `${nf(Math.round(Math.abs(cents) / 100))} €`
export function cuentasActivas(cuentas: readonly CuentaCuadre[]): readonly CuentaCuadre[] { return cuentas.filter(c => c.activa) }
/** Fecha de corte más antigua entre las cuentas activas (la «cabecera» de la maqueta). */
export function coberturaLectura(cuenta: CuentaCuadre): string | null {
  return cuenta.comprobacionSinMovimientosObsoleta ? cuenta.fechaCorteExtracto : cuenta.fechaCoberturaLectura ?? cuenta.fechaCorteExtracto
}
export function corteMinimo(cuentas: readonly CuentaCuadre[]): string | null {
  const activas = cuentasActivas(cuentas)
  const cortes = activas.map(coberturaLectura).filter((v): v is string => !!v).sort()
  if (cortes.length !== activas.length) return null
  return cortes[0] ?? null
}
export function diasEntre(desdeIso: string, hastaIso: string): number {
  return Math.round((Date.parse(`${hastaIso}T00:00:00Z`) - Date.parse(`${desdeIso}T00:00:00Z`)) / 86_400_000)
}
export type KpiVista = Readonly<{ label: string; value: string; sub: string; tone: '' | 'g' | 'w' | 'b' }>
export function buildKpis(e: EntradaPanel): readonly KpiVista[] {
  const activas = cuentasActivas(e.cuentas)
  const cuadran = activas.filter(c => c.cuadra).length
  const corte = corteMinimo(e.cuentas)
  const atraso = corte ? diasEntre(corte, e.hoy) : null
  const conPct = e.resumen.movimientos > 0 ? Math.round((e.resumen.conciliados / e.resumen.movimientos) * 100) : 0
  const atrasada = corte ? activas.filter(c => coberturaLectura(c) === corte).map(c => c.etiqueta).join(', ') : ''
  return [
    { label: 'Movimientos 2026', value: nf(e.resumen.movimientos), sub: `${eur0(e.resumen.entranCentimos)} entran · ${eur0(e.resumen.salenCentimos)} salen`, tone: '' },
    { label: 'Con documento', value: nf(e.resumen.conciliados), sub: `${conPct} % del total`, tone: 'g' },
    { label: 'Sin documento', value: nf(e.sinDocumentoCobros + e.sinDocumentoPagos), sub: `${nf(e.sinDocumentoPagos)} cargos · ${nf(e.sinDocumentoCobros)} cobros`, tone: 'w' },
    { label: 'Quién es, por confirmar', value: nf(e.resumen.sinTercero), sub: 'persona o empresa sin identificar', tone: 'w' },
    { label: 'Cuentas cuadradas', value: `${cuadran} de ${activas.length}`, sub: cuadran === activas.length ? 'todas encadenan' : 'faltan apuntes o orden por aclarar', tone: cuadran === activas.length ? 'g' : 'b' },
    { label: 'Cobertura revisada hasta', value: corte ? fechaCorta(corte) : '—', sub: atraso === null ? 'sin fecha de corte' : atraso <= 2 ? 'extracto o comprobación humana sin actividad' : `más atrasada: ${atrasada}`, tone: atraso !== null && atraso <= 2 ? 'g' : 'b' },
  ]
}
export type PasoVista = Readonly<{ estado: '' | 'ok' | 'bad' | 'cur'; titulo: string; texto: string; ir: VistaConciliar | 'reglas' }>
export function buildPasos(e: EntradaPanel): readonly PasoVista[] {
  const activas = cuentasActivas(e.cuentas)
  const cuadran = activas.filter(c => c.cuadra).length
  const corte = corteMinimo(e.cuentas)
  const atraso = corte ? diasEntre(corte, e.hoy) : null
  const alDia = atraso !== null && atraso <= 2
  const atrasadas = activas.filter(c => coberturaLectura(c) === corte).map(c => `${c.etiqueta} ${fechaCorta(coberturaLectura(c))}`)
  return [
    { estado: alDia ? 'ok' : 'bad', titulo: 'Cargar extractos', ir: 'cuentas',
      texto: alDia ? `Cobertura revisada hasta ${fechaCorta(corte)} en las ${activas.length} cuentas (extracto o comprobación humana sin actividad).` : `Hasta ${fechaCorta(corte)} como mínimo. Falta: ${atrasadas.join(', ') || 'sin fecha de corte'}.` },
    { estado: cuadran === activas.length ? 'ok' : 'bad', titulo: 'Cuadrar saldos', ir: 'cuentas',
      texto: cuadran === activas.length ? 'Todas las cuentas encadenan.' : `${cuadran} de ${activas.length} cuentas encadenan. Sin esto no se puede confirmar.` },
    { estado: e.reglas === 0 ? 'ok' : '', titulo: 'Reglas automáticas', ir: 'reglas',
      texto: e.reglas === 0 ? 'Nada pendiente de traspasos ni comisiones.' : `Traspasos y comisiones: ${nf(e.reglas)} movimientos en la bandeja.` },
    { estado: 'cur', titulo: 'Revisar la bandeja', ir: 'bandeja', texto: `${nf(e.sinDocumentoCobros + e.sinDocumentoPagos)} movimientos sin documento.` },
    { estado: '', titulo: 'Pedir papeles', ir: 'pedir', texto: e.rojas > 0 ? `${nf(e.rojas)} movimientos sin pista, agrupados por a quién pedirlos.` : 'Nada que pedir ahora mismo.' },
  ]
}

/** Une las lecturas de la bandeja: cada una ya viene ordenada por fecha; el resultado se ordena por fecha desc y no repite ids. */
export function unirBandeja<T extends { id: string; fecha: string }>(paginas: ReadonlyArray<readonly T[]>): T[] {
  const visto = new Set<string>(); const out: T[] = []
  for (const p of paginas) for (const r of p) if (!visto.has(r.id)) { visto.add(r.id); out.push(r) }
  return out.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
}
export const MOTIVOS_NO_REQUIERE: ReadonlyArray<readonly [string, string]> = [
  ['COMISION_BANCARIA', 'Comisión bancaria'], ['INTERES_BANCARIO', 'Interés bancario'], ['REDONDEO_BANCARIO', 'Redondeo bancario'],
  ['TRASPASO_INTERNO_SIN_DOCUMENTO', 'Traspaso interno sin justificante'], ['MOVIMIENTO_TECNICO_BANCO', 'Movimiento técnico del banco'], ['CORRECCION_BANCARIA', 'Corrección bancaria'],
]
