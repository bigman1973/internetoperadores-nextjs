import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { analizarCuadreDia } from '@/lib/finanzas/conciliar-cuadre-dia'

/**
 * Encargo J · Conciliar unificado. Lectura de solo lectura del encadenado de saldos por cuenta.
 * Cuadre a NIVEL DE DÍA (lib/finanzas/conciliar-cuadre-dia.ts): dentro de un día basta con que exista un orden
 * que encadene saldo anterior + importe = saldo (el orden exacto no se exige); entre días, el saldo de apertura
 * tiene que ser el cierre del día anterior. No relaja /api/admin/finanzas/estado-cuentas ni calcula cobros.
 *
 * "Cuadra" = ningún día tiene hueco. Un hueco se explica con el día y el importe que falta.
 */

export type EstadoCadena = 'OK' | 'HUECO' | 'SIN_SALDO' | 'ORDEN_AMBIGUO'

export type CuentaCuadre = Readonly<{
  id: string
  banco: string
  alias: string | null
  etiqueta: string
  ultimos4: string | null
  activa: boolean
  estado: EstadoCadena
  cuadra: boolean
  totalMovimientos: number
  ultimoMovimiento: string | null
  fechaCorteExtracto: string | null
  avisos: ReadonlyArray<Readonly<{ codigo: string; mensaje: string; fecha: string | null }>>
  /** Detalle del cuadre por día (Encargo J): lo que se ignora o se acepta y desde cuándo la cadena es correcta. */
  diasAmbiguosAceptados: number
  duplicadosIgnorados: number
  saldosDeducidos: number
  huecosTotal: number
  cadenaCorrectaDesde: string | null
}>

function iso(value: Date | null | undefined): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
}

/** Euros (texto numérico de Postgres) -> céntimos enteros. El redondeo se hace aquí para no ampliar el SQL revisado. */
export function aCentimos(v: string | number | null | undefined): number {
  const n = typeof v === 'number' ? v : Number.parseFloat(v ?? '0')
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
type Db = typeof prisma & Record<string, any>

export async function readCuentasCuadre(onlyIds?: readonly string[]): Promise<readonly CuentaCuadre[]> {
  const db = prisma as Db
  const cuentas: any[] = await db.cuentaBancaria.findMany({
    where: onlyIds ? { id: { in: [...onlyIds] } } : undefined,
    select: { id: true, banco: true, alias: true, iban: true, activa: true, fechaCorteExtracto: true },
    orderBy: { banco: 'asc' },
  })
  if (!cuentas.length) return []
  const movimientos = await db.movimientoBancario.findMany({
    where: { cuentaId: { in: cuentas.map(c => c.id) } },
    select: { cuentaId: true, fechaOperacion: true, importe: true, saldo: true },
    orderBy: [{ cuentaId: 'asc' }, { fechaOperacion: 'asc' }, { createdAt: 'asc' }],
  })
  const porCuenta = new Map<string, any[]>()
  for (const movimiento of movimientos) {
    const lista = porCuenta.get(movimiento.cuentaId)
    if (lista) lista.push(movimiento)
    else porCuenta.set(movimiento.cuentaId, [movimiento])
  }
  const resultado = cuentas.map((cuenta): CuentaCuadre => {
    const lista = porCuenta.get(cuenta.id) ?? []
    const cadena = analizarCuadreDia(lista.map((m: any) => ({
      dia: m.fechaOperacion instanceof Date ? m.fechaOperacion.toISOString().slice(0, 10) : '',
      importe: Number(m.importe),
      saldo: m.saldo === null || m.saldo === undefined ? null : Number(m.saldo),
    })).filter((f: { dia: string }) => f.dia !== ''))
    const iban = typeof cuenta.iban === 'string' ? cuenta.iban.replace(/\s+/g, '') : ''
    return {
      id: cuenta.id,
      banco: cuenta.banco,
      alias: cuenta.alias ?? null,
      etiqueta: cuenta.alias || cuenta.banco,
      ultimos4: iban.length >= 4 ? iban.slice(-4) : null,
      activa: cuenta.activa === true,
      estado: lista.length === 0 ? 'SIN_SALDO' : cadena.estado,
      cuadra: cadena.cuadra && lista.length > 0,
      totalMovimientos: lista.length,
      ultimoMovimiento: lista.length ? iso(lista[lista.length - 1].fechaOperacion) : null,
      fechaCorteExtracto: iso(cuenta.fechaCorteExtracto),
      avisos: lista.length === 0
        ? [{ codigo: 'SIN_MOVIMIENTOS', mensaje: 'La cuenta no tiene movimientos cargados: falta el saldo inicial o final.', fecha: null }]
        : cadena.huecos.map(h => ({ codigo: h.tipo, mensaje: h.mensaje, fecha: h.dia })),
      diasAmbiguosAceptados: cadena.diasAmbiguosAceptados,
      duplicadosIgnorados: cadena.duplicadosIgnorados,
      saldosDeducidos: cadena.saldosDeducidos,
      huecosTotal: cadena.huecos.length,
      cadenaCorrectaDesde: cadena.cadenaCorrectaDesde,
    }
  })
  return resultado
}

export type ResumenConciliar = Readonly<{
  movimientos: number
  entranCentimos: number
  salenCentimos: number
  conciliados: number
  sinTercero: number
  desde: string
}>

/** Totales reales de movimientos bancarios del ejercicio (lectura). */
export async function readResumenMovimientos(desde = '2026-01-01'): Promise<ResumenConciliar> {
  const rows = await prisma.$queryRaw<Array<{ n: bigint; entran: string | null; salen: string | null; conciliados: bigint; sin_tercero: bigint }>>(Prisma.sql`
    SELECT COUNT(*)::bigint AS n,
      COALESCE(SUM(CASE WHEN importe>0 THEN importe::numeric ELSE 0 END),0)::text AS entran,
      COALESCE(SUM(CASE WHEN importe<0 THEN -importe::numeric ELSE 0 END),0)::text AS salen,
      COUNT(*) FILTER (WHERE conciliado)::bigint AS conciliados,
      COUNT(*) FILTER (WHERE tercero IS NULL OR btrim(tercero)='')::bigint AS sin_tercero
    FROM movimientos_bancarios WHERE fecha_operacion >= CAST(${desde} AS date)`)
  const r = rows[0]
  return {
    movimientos: Number(r?.n ?? 0), entranCentimos: aCentimos(r?.entran), salenCentimos: aCentimos(r?.salen),
    conciliados: Number(r?.conciliados ?? 0), sinTercero: Number(r?.sin_tercero ?? 0), desde,
  }
}

/** Filas de la bandeja agrupadas por motivo (traspasos propios y comisiones para el paso 3; rojas para el paso 5). */
export async function readConteosBandeja() {
  const rows = await prisma.$queryRaw<Array<{ reglas: bigint; rojas: bigint; verdes: bigint; cobros: bigint; pagos: bigint }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE lower(COALESCE(grupo,'')) ~ '(traspas|banco|comisi)')::bigint AS reglas,
      COUNT(*) FILTER (WHERE color='ROJO')::bigint AS rojas,
      COUNT(*) FILTER (WHERE color='VERDE')::bigint AS verdes,
      COUNT(*) FILTER (WHERE tab='COBROS')::bigint AS cobros,
      COUNT(*) FILTER (WHERE tab='PAGOS')::bigint AS pagos
    FROM conciliar_proyecciones WHERE tab IN ('COBROS','PAGOS')`)
  const r = rows[0]
  return { reglas: Number(r?.reglas ?? 0), rojas: Number(r?.rojas ?? 0), verdes: Number(r?.verdes ?? 0), cobros: Number(r?.cobros ?? 0), pagos: Number(r?.pagos ?? 0) }
}

export type BloqueoCuadre = Readonly<{ cuentaId: string | null; etiqueta: string; estado: EstadoCadena | 'SIN_CUENTA' }>

/** Resuelve la cuenta de cada fila de la proyección de Conciliar (ids de fila, no de movimiento). */
export async function cuentasDeFilasConciliar(rowIds: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
  if (!rowIds.length) return new Map()
  const rows = await prisma.$queryRaw<Array<{ id: string; cuenta_id: string | null }>>(Prisma.sql`
    SELECT id::text AS id, cuenta_id::text AS cuenta_id FROM conciliar_proyecciones WHERE id::text = ANY(${[...rowIds]}::text[])`)
  const mapa = new Map<string, string | null>(rowIds.map(id => [id, null]))
  for (const row of rows) mapa.set(row.id, row.cuenta_id)
  return mapa
}

export async function cuentasDeMovimientos(movimientoIds: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
  if (!movimientoIds.length) return new Map()
  const rows: Array<{ id: string; cuentaId: string }> = await (prisma as Db).movimientoBancario.findMany({
    where: { id: { in: [...movimientoIds] } }, select: { id: true, cuentaId: true },
  })
  const mapa = new Map<string, string | null>(movimientoIds.map(id => [id, null]))
  for (const row of rows) mapa.set(row.id, row.cuentaId)
  return mapa
}

/**
 * Regla del encargo J: no se confirma nada hasta que la cuenta cuadre. Devuelve las cuentas que
 * bloquean (vacío = se puede confirmar). Falla cerrado: una fila sin cuenta identificable bloquea.
 */
export async function bloqueosDeCuadre(cuentaPorElemento: ReadonlyMap<string, string | null>): Promise<readonly BloqueoCuadre[]> {
  const ids = [...new Set([...cuentaPorElemento.values()].filter((v): v is string => !!v))]
  return calcularBloqueos(cuentaPorElemento, new Map((await readCuentasCuadre(ids)).map(c => [c.id, c])))
}
/** Parte pura de la regla (se prueba en memoria): sin cuenta o cuenta que no cuadra => bloquea. */
export function calcularBloqueos(cuentaPorElemento: ReadonlyMap<string, string | null>, estado: ReadonlyMap<string, Pick<CuentaCuadre, 'cuadra' | 'etiqueta' | 'estado'>>): readonly BloqueoCuadre[] {
  const bloqueos = new Map<string, BloqueoCuadre>()
  for (const cuentaId of cuentaPorElemento.values()) {
    if (!cuentaId) { bloqueos.set('sin-cuenta', { cuentaId: null, etiqueta: 'Movimiento sin cuenta identificable', estado: 'SIN_CUENTA' }); continue }
    const cuenta = estado.get(cuentaId)
    if (!cuenta) bloqueos.set(cuentaId, { cuentaId, etiqueta: 'Cuenta desconocida', estado: 'SIN_CUENTA' })
    else if (!cuenta.cuadra) bloqueos.set(cuentaId, { cuentaId, etiqueta: cuenta.etiqueta, estado: cuenta.estado })
  }
  return [...bloqueos.values()]
}

export function mensajeBloqueoCuadre(bloqueos: readonly BloqueoCuadre[]): string {
  const nombres = bloqueos.map(b => b.etiqueta).join(', ')
  return `No se puede confirmar: la cuenta no cuadra todavía (${nombres}). Carga el extracto que falta o revisa los huecos en «Cuentas y extractos».`
}

/**
 * Guarda de servidor para POST de Conciliar: sólo mira confirmaciones (verdes, parejas propias y
 * revisión ámbar confirmada). Deshacer, pedir y la vista previa quedan fuera. Devuelve null si
 * se puede seguir o el cuerpo 409 que debe devolver la ruta.
 */
export function filasConfirmablesConciliar(command: unknown): string[] {
  const c = command as { action?: string; items?: ReadonlyArray<{ id: string }>; review?: { kind?: string; id?: string } } | null
  if (!c || typeof c !== 'object') return []
  if ((c.action === 'confirmar' || c.action === 'confirmar_traspasos_propios_manual') && Array.isArray(c.items)) return c.items.map(i => i.id).filter(id => typeof id === 'string')
  if (c.action === 'confirmar' && c.review && c.review.kind === 'REVIEW_CONFIRM' && typeof c.review.id === 'string') return [c.review.id]
  return []
}
export async function guardaCuadreConciliar(command: unknown): Promise<null | { error: string; codigo: 'CUENTA_NO_CUADRA'; cuentas: readonly BloqueoCuadre[] }> {
  const rowIds = filasConfirmablesConciliar(command)
  if (!rowIds.length) return null
  const bloqueos = await bloqueosDeCuadre(await cuentasDeFilasConciliar(rowIds))
  return bloqueos.length ? { error: mensajeBloqueoCuadre(bloqueos), codigo: 'CUENTA_NO_CUADRA', cuentas: bloqueos } : null
}
export function movimientoConfirmableFacil(body: unknown): string | null {
  const b = body as { action?: string; movimientoId?: string } | null
  return b && (b.action === 'confirmar_factura' || b.action === 'no_requiere') && typeof b.movimientoId === 'string' ? b.movimientoId : null
}
/** Misma regla para Modo fácil: sólo confirmar_factura y no_requiere (los dos escriben una conciliación). */
export async function guardaCuadreModoFacil(body: unknown): Promise<null | { error: string; codigo: 'CUENTA_NO_CUADRA'; cuentas: readonly BloqueoCuadre[] }> {
  const movimientoId = movimientoConfirmableFacil(body)
  if (!movimientoId) return null
  const bloqueos = await bloqueosDeCuadre(await cuentasDeMovimientos([movimientoId]))
  return bloqueos.length ? { error: mensajeBloqueoCuadre(bloqueos), codigo: 'CUENTA_NO_CUADRA', cuentas: bloqueos } : null
}

export type RemesaResumen = Readonly<{
  id: number
  nombre: string
  fecha: string | null
  facturas: number
  importeCentimos: number
  estado: 'CONCILIADA' | 'DIFERENCIA' | 'PENDIENTE' | 'SIN_CASAR'
  rechazos: number
  pendienteAbonarCentimos: number
}>
/** Remesas del ejercicio con el estado que ya tiene su conciliación (sólo lectura; nada se infiere por importe). */
export async function readRemesasResumen(ejercicio = 2026): Promise<readonly RemesaResumen[]> {
  const rows = await prisma.$queryRaw<Array<{ id: number; nombre: string; fecha: Date | null; n: number; total: string; estado: string | null; rechazos: number | null; pendiente: string | null }>>(Prisma.sql`
    SELECT r.id, r.nombre, r.fecha, r.numero_registros AS n, r.total_importe::numeric::text AS total,
      c.estado::text AS estado, c.rechazos, COALESCE(c.pendiente_abonar,0)::numeric::text AS pendiente
    FROM remesas r LEFT JOIN conciliaciones_remesas c ON c.remesa_id = r.id
    WHERE r.ejercicio = ${ejercicio}
    ORDER BY r.fecha DESC, r.id DESC LIMIT 60`)
  return rows.map(r => ({
    id: r.id, nombre: r.nombre, fecha: iso(r.fecha), facturas: r.n, importeCentimos: aCentimos(r.total),
    estado: r.estado === 'CONCILIADA' || r.estado === 'DIFERENCIA' || r.estado === 'PENDIENTE' ? r.estado : 'SIN_CASAR',
    rechazos: r.rechazos ?? 0, pendienteAbonarCentimos: aCentimos(r.pendiente),
  }))
}
