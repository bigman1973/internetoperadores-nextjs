/**
 * Rentabilidad en la ficha: solo fotos preparadas, sin recalcular ni leer fuentes vivas.
 * La selección replica getRentabilidadReport/leerFoto: PROYECCION, version DESC.
 * Las cifras usan las funciones puras de la UI nativa; no se usa el margin guardado
 * (que no descuenta estimados), ni las fuentes/ajustes del desglose.
 */
import { rowTotals, totalsOf } from '../app/admin/rentabilidad/io-model'
import { noKnownCost, numeric, type Row } from '../app/admin/rentabilidad/view-model'

const MONTH = /^20\d{2}-(0[1-9]|1[0-2])$/
const PAGE = 500
export type FotoFichaRentabilidad = { id: string; month: string; kind: string; version: number; createdAt: string | null }
export type EstadoMesFicha = 'SIN_VINCULO' | 'SIN_FOTO' | 'SIN_CLIENTE' | 'SIN_COSTE' | 'DATOS_INCOMPLETOS' | 'DISPONIBLE'
export type RentabilidadFicha = {
  mes: string | null; meses: string[]; ingreso: Array<number | null>; coste: Array<number | null>; hay: boolean
  /** Todos alineados con meses. coste = real + estimado; null no significa cero. */
  costeReal: Array<number | null>; costeEstimado: Array<number | null>; calidad: Array<number | null>; hayEstimados: boolean[]
  /** Foto del último mes cerrado por calendario, no un CIERRE certificado ni un mes anterior. */
  snapshot: FotoFichaRentabilidad | null
  fotos: Array<FotoFichaRentabilidad | null>; estados: EstadoMesFicha[]
}
export type FilaFotoFicha = {
  snapshotId: string; month: string; tipo: 'cliente' | 'contrato'; clientIndex: number; contractIndex: number
  clientCode: string; datos: Row
}
export type ProyeccionFichaRentabilidad = {
  rentabilidad: RentabilidadFicha
  margenUltimo: { mes: string; pct: number | null; margen: number | null; costeReal: number | null; costeEstimado: number | null; calidad: number | null; hayEstimados: boolean } | null
  margenContrato: Map<string, number | null>
}

/** Solo el prefijo ISP de una identidad numérica es un alias; no se altera un nombre. */
export const normalizarCodigoFicha = (value: unknown): string => value == null ? '' : String(value).trim().replace(/^ISP(?=\d+$)/i, '').replace(/^0+(?=\d)/, '')
/** Doce meses completos: el corte se obtiene en Madrid, no en UTC ni por días de duración fija. */
export function mesesCompletosFicha(hoy: Date): string[] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit' }).formatToParts(hoy)
  const year = Number(parts.find(p => p.type === 'year')!.value), month = Number(parts.find(p => p.type === 'month')!.value)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 13 + index, 1))
    return date.toISOString().slice(0, 7)
  })
}

/** Defensa pura adicional para fixtures/callers: nunca meses abiertos/futuros ni fotos futuras. */
export function seleccionarFotosFicha(fotos: readonly FotoFichaRentabilidad[], meses: readonly string[], hoy: Date): FotoFichaRentabilidad[] {
  const through = mesesCompletosFicha(hoy).at(-1)!
  const allowed = new Set(meses.filter(m => MONTH.test(m) && m <= through))
  const ordered = fotos.filter(f => allowed.has(f.month) && f.month <= through &&
    (!f.createdAt || (Number.isFinite(Date.parse(f.createdAt)) && Date.parse(f.createdAt) <= hoy.getTime())))
    .slice().sort((a, b) => b.month.localeCompare(a.month) || Number(b.kind === 'PROYECCION') - Number(a.kind === 'PROYECCION') || b.version - a.version || a.id.localeCompare(b.id))
  const seen = new Set<string>()
  return ordered.filter(f => !seen.has(f.month) && !!seen.add(f.month))
}

/** Un cliente conserva rowTotals; varios códigos enlazados se agregan con totalsOf, como el dashboard. */
function cifrasClientes(rows: Row[]) {
  if (!rows.length) return null
  if (rows.length === 1) {
    const totals = rowTotals(rows[0], 'real'), unknown = noKnownCost(rows[0])
    return { ingreso: totals.income, coste: unknown ? null : totals.cost, margen: totals.margin, pct: totals.marginPct,
      costeReal: unknown ? null : totals.costReal, costeEstimado: unknown ? null : totals.costEst, calidad: totals.quality, hayEstimados: totals.estimated,
      estado: (unknown ? 'SIN_COSTE' : totals.income === null || totals.cost === null ? 'DATOS_INCOMPLETOS' : 'DISPONIBLE') as EstadoMesFicha }
  }
  const totals = totalsOf(rows, 'real')
  // totalsOf suma lo conocido; una entrada monetaria ausente no debe convertirse en cero.
  const ingresoCompleto = rows.every(r => numeric(r.income) !== null && (numeric(r.rawIncome) ?? numeric(r.income)) !== null)
  const costeCompleto = rows.every(r => numeric(r.rawCost ?? r.cost) !== null)
  const unknown = totals.costReal === 0 && totals.costEst === 0 && rows.some(noKnownCost)
  return { ingreso: ingresoCompleto ? totals.income : null, coste: costeCompleto && !unknown ? totals.cost : null,
    margen: ingresoCompleto && costeCompleto && !unknown ? totals.margin : null, pct: ingresoCompleto && costeCompleto && !unknown ? totals.marginPct : null,
    costeReal: costeCompleto && !unknown ? totals.costReal : null, costeEstimado: unknown ? null : totals.costEst, calidad: costeCompleto ? totals.quality : null, hayEstimados: totals.estimated,
    estado: (unknown ? 'SIN_COSTE' : !ingresoCompleto || !costeCompleto ? 'DATOS_INCOMPLETOS' : 'DISPONIBLE') as EstadoMesFicha }
}

/** No muta fotos, filas ni importes: selecciona, acota y delega exclusivamente las cifras nativas. */
export function proyectarFichaRentabilidad(fotos: readonly FotoFichaRentabilidad[], filas: readonly FilaFotoFicha[], codigos: readonly string[], hoy: Date): ProyeccionFichaRentabilidad {
  const meses = mesesCompletosFicha(hoy), scope = new Set(codigos.map(normalizarCodigoFicha).filter(Boolean))
  const selected = seleccionarFotosFicha(fotos, meses, hoy), porMes = new Map(selected.map(f => [f.month, f]))
  const own = filas.filter(f => scope.has(normalizarCodigoFicha(f.clientCode)) && porMes.get(f.month)?.id === f.snapshotId)
  const points = meses.map(month => {
    const foto = porMes.get(month) ?? null
    const rows = own.filter(f => f.month === month && f.tipo === 'cliente').map(f => f.datos)
    const totals = foto ? cifrasClientes(rows) : null
    return { foto, totals, estado: !scope.size ? 'SIN_VINCULO' as const : !foto ? 'SIN_FOTO' as const : totals?.estado ?? 'SIN_CLIENTE' as const }
  })
  // Un mes anterior con foto no sustituye al último mes cerrado temporalmente.
  const mesMargen = meses.at(-1)!, ultimo = porMes.get(mesMargen) ?? null, ultimoTotal = points.at(-1)?.totals
  const margenContrato = new Map<string, number | null>()
  if (ultimo && ultimoTotal) for (const row of own.filter(f => f.month === mesMargen && f.snapshotId === ultimo.id && f.tipo === 'contrato')) {
    const code = normalizarCodigoFicha(row.datos.contractCode)
    if (!code) continue
    // Identidad ambigua: no escoger un margen por el orden de llegada.
    margenContrato.set(code, margenContrato.has(code) ? null : rowTotals(row.datos, 'real').marginPct)
  }
  return {
    rentabilidad: { mes: mesMargen, meses, ingreso: points.map(p => p.totals?.ingreso ?? null), coste: points.map(p => p.totals?.coste ?? null),
      costeReal: points.map(p => p.totals?.costeReal ?? null), costeEstimado: points.map(p => p.totals?.costeEstimado ?? null),
      calidad: points.map(p => p.totals?.calidad ?? null), hayEstimados: points.map(p => p.totals?.hayEstimados ?? false),
      hay: points.some(p => p.totals !== null), snapshot: ultimo, fotos: points.map(p => p.foto), estados: points.map(p => p.estado) },
    margenUltimo: { mes: mesMargen, pct: ultimoTotal?.pct ?? null, margen: ultimoTotal?.margen ?? null,
      costeReal: ultimoTotal?.costeReal ?? null, costeEstimado: ultimoTotal?.costeEstimado ?? null, calidad: ultimoTotal?.calidad ?? null, hayEstimados: ultimoTotal?.hayEstimados ?? false },
    margenContrato,
  }
}

type LectorSqlFicha = { $queryRaw: <T>(strings: TemplateStringsArray, ...values: any[]) => Promise<T> }
type FotoSql = Omit<FotoFichaRentabilidad, 'createdAt'> & { createdAt: Date | string | null }
/** Solo SELECT. Metadatos acotados a 12 meses; filas del cliente paginadas por IDs inmutables. */
export async function leerRentabilidadFicha(db: LectorSqlFicha, codigos: readonly string[], hoy: Date): Promise<ProyeccionFichaRentabilidad> {
  const scope = [...new Set(codigos.map(normalizarCodigoFicha).filter(Boolean))]
  if (!scope.length) return proyectarFichaRentabilidad([], [], scope, hoy)
  const meses = mesesCompletosFicha(hoy)
  const headers = await db.$queryRaw<FotoSql[]>`
    SELECT DISTINCT ON (month) id, month, kind, version, created_at AS "createdAt"
    FROM rentabilidad_snapshots
    WHERE month = ANY(${meses}::text[]) AND created_at <= ${hoy}
    ORDER BY month, (kind = 'PROYECCION') DESC, version DESC, id ASC LIMIT 12`
  const fotos = seleccionarFotosFicha(headers.map(f => ({ ...f, createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt })), meses, hoy)
  if (!fotos.length) return proyectarFichaRentabilidad([], [], scope, hoy)
  const ids = fotos.map(f => f.id), filas: FilaFotoFicha[] = []
  const mesMargen = meses.at(-1)!
  // El guard SQL rechaza literales con barra inversa: la antigua retroreferencia
  // hacía fallar el GET de fichas vinculadas. Quitar sólo ISP ante dígitos hasta
  // el final conserva los mismos alias, sin ampliar ni saltarse el guard.
  for (let offset = 0; ; offset += PAGE) {
    const page = await db.$queryRaw<FilaFotoFicha[]>`
      WITH selected AS (
        SELECT id, month, payload FROM rentabilidad_snapshots WHERE id = ANY(${ids}::text[]) LIMIT 12
      ), clients AS (
        SELECT s.id AS "snapshotId", s.month, c.ord AS "clientIndex", c.row->>'clientCode' AS "clientCode", c.row
        FROM selected s CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(s.payload->'clients') = 'array' THEN s.payload->'clients' ELSE '[]'::jsonb END
        ) WITH ORDINALITY c(row, ord)
        WHERE regexp_replace(regexp_replace(btrim(c.row->>'clientCode'), '^ISP(?=[0-9]+$)', '', 'i'), '^0+(?=[0-9])', '') = ANY(${scope}::text[])
      ), scoped AS (
        SELECT "snapshotId", month, "clientIndex", "clientCode", 0::bigint AS "contractIndex", 'cliente' AS tipo, row FROM clients
        UNION ALL
        SELECT c."snapshotId", c.month, c."clientIndex", c."clientCode", k.ord, 'contrato', k.row
        FROM clients c CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(c.row->'contracts') = 'array' THEN c.row->'contracts' ELSE '[]'::jsonb END
        ) WITH ORDINALITY k(row, ord)
        WHERE c.month = ${mesMargen}
      )
      SELECT "snapshotId", month, tipo, "clientIndex", "contractIndex", "clientCode",
        jsonb_build_object('contractCode', row->'contractCode', 'income', row->'income', 'rawIncome', row->'rawIncome',
          'cost', row->'cost', 'rawCost', row->'rawCost', 'estimatedCost', row->'estimatedCost', 'rawEstimatedCost', row->'rawEstimatedCost',
          'pending', row->'pending', 'pendingCost', row->'pendingCost', 'status', row->'status', 'estado', row->'estado') AS datos
      FROM scoped ORDER BY month, "snapshotId", "clientIndex", "contractIndex" LIMIT 500 OFFSET ${offset}`
    filas.push(...page)
    if (page.length < PAGE) break
  }
  return proyectarFichaRentabilidad(fotos, filas, scope, hoy)
}
