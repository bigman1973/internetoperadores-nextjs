/**
 * Orden intradía a partir del saldo que declara el banco en cada fila.
 *
 * Función pura: no lee ni escribe BD. Cada fila es una arista (saldo − importe) → saldo. Dado el
 * conjunto de movimientos de UN día y, si se conoce, el saldo de cierre del día anterior, busca un
 * orden que use todas las filas y en el que cada saldo sea exactamente el anterior más el importe,
 * en céntimos enteros y sin tolerancias. No inventa nada:
 *
 *  - UNICO       hay un único orden (las filas idénticas en importe y saldo no cuentan como alternativa).
 *  - AMBIGUO     hay más de un orden válido: la continuidad está probada, la secuencia exacta no.
 *  - IMPOSIBLE   ningún orden encadena (con ese saldo anterior, o con ninguna apertura si se desconoce).
 *  - INCONCLUSO  se agotó el presupuesto de búsqueda: no se afirma ni unicidad ni imposibilidad.
 *  - DATO_INVALIDO  importe o saldo ausente, no finito, fuera de rango o con fracciones de céntimo.
 *
 * Sin saldo anterior se prueban todas las aperturas posibles (saldo − importe de cada fila), de modo
 * que los ciclos y los retornos al saldo inicial (A→B→A) no se rechazan por error.
 */
export interface FilaDiaSaldo {
  importe: number
  saldo: number | null
  /** Posición original; solo elige cuál de los órdenes válidos se devuelve, nunca certifica cronología. */
  pref?: number
}
export type EstadoOrdenDia = 'UNICO' | 'AMBIGUO' | 'IMPOSIBLE' | 'INCONCLUSO' | 'DATO_INVALIDO'
export type ResultadoOrdenDia =
  | { ok: true; estado: 'UNICO' | 'AMBIGUO'; orden: number[]; saldoInicial: number; saldoFinal: number; alternativas: boolean }
  | { ok: false; estado: 'IMPOSIBLE' | 'INCONCLUSO' | 'DATO_INVALIDO'; motivo: 'NINGUN_ORDEN_ENCADENA' | 'BUSQUEDA_EXCEDIDA' | 'SALDO_AUSENTE' | 'DATO_INVALIDO' }

const MAX_ABS = 1_000_000_000
export const MAX_NODOS_ORDEN_DIA = 200_000

/** Céntimos exactos o null si el valor no es un importe monetario válido. */
export function aCentimosExactos(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || Math.abs(valor) > MAX_ABS) return null
  const c = Math.round(valor * 100)
  if (Math.abs(valor * 100 - c) > 1e-6 || !Number.isSafeInteger(c)) return null
  return c === 0 ? 0 : c // normaliza -0
}

/** @param saldoAnteriorCentimos saldo de cierre del día anterior, en céntimos enteros, o null si se desconoce. */
export function ordenarDiaPorSaldo(
  filas: readonly FilaDiaSaldo[],
  saldoAnteriorCentimos: number | null,
  maxNodos: number = MAX_NODOS_ORDEN_DIA,
): ResultadoOrdenDia {
  const n = filas.length
  if (saldoAnteriorCentimos !== null && !Number.isSafeInteger(saldoAnteriorCentimos)) return { ok: false, estado: 'DATO_INVALIDO', motivo: 'DATO_INVALIDO' }
  if (n === 0) {
    if (saldoAnteriorCentimos === null) return { ok: false, estado: 'IMPOSIBLE', motivo: 'NINGUN_ORDEN_ENCADENA' }
    return { ok: true, estado: 'UNICO', orden: [], saldoInicial: saldoAnteriorCentimos, saldoFinal: saldoAnteriorCentimos, alternativas: false }
  }
  if (filas.some(f => f.saldo === null || f.saldo === undefined)) return { ok: false, estado: 'DATO_INVALIDO', motivo: 'SALDO_AUSENTE' }
  const imp: number[] = [], sal: number[] = []
  for (const f of filas) {
    const i = aCentimosExactos(f.importe), s = aCentimosExactos(f.saldo)
    if (i === null || s === null) return { ok: false, estado: 'DATO_INVALIDO', motivo: 'DATO_INVALIDO' }
    imp.push(i); sal.push(s)
  }
  const pref = filas.map((f, i) => (typeof f.pref === 'number' && Number.isFinite(f.pref) ? f.pref : i))
  // Se exploran primero las posiciones más altas: los extractos suelen venir del más nuevo al más antiguo.
  const porPref = [...Array(n).keys()].sort((a, b) => pref[b] - pref[a] || b - a)
  const firma = (i: number) => `${imp[i]}|${sal[i]}`

  let nodos = 0
  let excedido = false
  let primero: { orden: number[]; inicio: number } | null = null
  let segunda = false
  const usado = new Array<boolean>(n).fill(false)
  const camino: number[] = []

  function dfs(saldoPrev: number, k: number, inicio: number): void {
    if (excedido || segunda) return
    if (++nodos > maxNodos) { excedido = true; return }
    if (k === n) {
      if (!primero) primero = { orden: [...camino], inicio }
      else segunda = true
      return
    }
    const probadas = new Set<string>()
    for (const i of porPref) {
      if (usado[i] || saldoPrev + imp[i] !== sal[i]) continue
      const f = firma(i)
      if (probadas.has(f)) continue // filas idénticas: intercambiarlas no es otro orden
      probadas.add(f)
      usado[i] = true; camino.push(i)
      dfs(sal[i], k + 1, inicio)
      camino.pop(); usado[i] = false
      if (excedido || segunda) return
    }
  }

  if (saldoAnteriorCentimos !== null) {
    dfs(saldoAnteriorCentimos, 0, saldoAnteriorCentimos)
  } else {
    const aperturas: number[] = []
    const vistas = new Set<number>()
    for (const i of porPref) { const a = sal[i] - imp[i]; if (!vistas.has(a)) { vistas.add(a); aperturas.push(a) } }
    for (const a of aperturas) { dfs(a, 0, a); if (excedido || segunda) break }
  }

  if (excedido) return { ok: false, estado: 'INCONCLUSO', motivo: 'BUSQUEDA_EXCEDIDA' }
  if (!primero) return { ok: false, estado: 'IMPOSIBLE', motivo: 'NINGUN_ORDEN_ENCADENA' }
  const p = primero as { orden: number[]; inicio: number }
  return {
    ok: true,
    estado: segunda ? 'AMBIGUO' : 'UNICO',
    orden: p.orden,
    saldoInicial: p.inicio,
    saldoFinal: sal[p.orden[p.orden.length - 1]],
    alternativas: segunda,
  }
}

/** Posición 1..n de cada fila en el orden encontrado, solo si es ÚNICO; si no, null (no se certifica). */
export function asignarOrdenDia(
  filas: readonly FilaDiaSaldo[],
  saldoAnteriorCentimos: number | null,
): { orden: number[]; saldoFinal: number } | null {
  const r = ordenarDiaPorSaldo(filas, saldoAnteriorCentimos)
  if (!r.ok || r.estado !== 'UNICO') return null
  const out = new Array<number>(filas.length).fill(0)
  r.orden.forEach((idx, pos) => { out[idx] = pos + 1 })
  return { orden: out, saldoFinal: r.saldoFinal }
}

export type DiaCadena = { dia: string; estado: EstadoOrdenDia | 'SALTO_ENTRE_DIAS'; movs: number; saldoAnterior: number | null; saldoInicialDia?: number; diferencia?: number }

/**
 * Recorre una cuenta día a día. Un día que no encadena con el cierre anterior pero sí por sí solo es
 * SALTO_ENTRE_DIAS (falta algo entre ambos días o el saldo anterior no corresponde). Tras un día
 * IMPOSIBLE/INCONCLUSO/INVALIDO el puente pasa a desconocido: nunca se arrastra un saldo elegido al azar.
 */
export function recorrerCadenaPorDias(
  filas: readonly (FilaDiaSaldo & { dia: string })[],
  saldoAnteriorCentimos: number | null,
): { dias: DiaCadena[]; saldoFinal: number | null } {
  const porDia = new Map<string, (FilaDiaSaldo & { dia: string })[]>()
  for (const f of filas) { const g = porDia.get(f.dia) ?? []; g.push(f); porDia.set(f.dia, g) }
  let prev = saldoAnteriorCentimos
  const dias: DiaCadena[] = []
  for (const d of [...porDia.keys()].sort()) {
    const g = porDia.get(d)!
    const conPuente = prev === null ? null : ordenarDiaPorSaldo(g, prev)
    if (conPuente && conPuente.ok) {
      dias.push({ dia: d, estado: conPuente.estado, movs: g.length, saldoAnterior: prev })
      prev = conPuente.saldoFinal
      continue
    }
    const solo = ordenarDiaPorSaldo(g, null)
    if (solo.ok) {
      if (prev === null) dias.push({ dia: d, estado: solo.estado, movs: g.length, saldoAnterior: null, saldoInicialDia: solo.saldoInicial })
      else dias.push({ dia: d, estado: 'SALTO_ENTRE_DIAS', movs: g.length, saldoAnterior: prev, saldoInicialDia: solo.saldoInicial, diferencia: solo.saldoInicial - prev })
      // Con apertura desconocida y alternativas, el cierre del día puede no ser único.
      prev = solo.estado === 'UNICO' ? solo.saldoFinal : null
    } else {
      dias.push({ dia: d, estado: (conPuente && !conPuente.ok && conPuente.estado === 'INCONCLUSO') ? 'INCONCLUSO' : solo.estado, movs: g.length, saldoAnterior: prev })
      prev = null
    }
  }
  return { dias, saldoFinal: prev }
}

export interface MovimientoConSaldo {
  fechaOperacion: Date
  importe: number
  saldo?: number | null
}

function diaUtcOrden(fecha: Date): string | null {
  return fecha instanceof Date && Number.isFinite(fecha.getTime()) ? fecha.toISOString().slice(0, 10) : null
}

/**
 * Devuelve, alineado con `movimientos`, el orden intradía (1..n) deducido del saldo de cada fila.
 * Solo se asigna en los días con varios movimientos cuyo orden es ÚNICO: primero con el cierre
 * del día anterior y, si no encadena, por sí solo (así un salto real aparece como hueco y no como
 * ambigüedad). Los días AMBIGUO, IMPOSIBLE, INCONCLUSO o con datos inválidos quedan en null y el
 * núcleo B3 los sigue avisando. No lee ni escribe BD.
 */
export function derivarOrdenBancarioPorSaldo(
  movimientos: readonly MovimientoConSaldo[],
  saldoAnterior: number | null = null,
): (number | null)[] {
  const out: (number | null)[] = movimientos.map(() => null)
  const porDia = new Map<string, number[]>()
  movimientos.forEach((m, i) => {
    const d = diaUtcOrden(m.fechaOperacion)
    if (!d) return
    const g = porDia.get(d) ?? []
    g.push(i)
    porDia.set(d, g)
  })
  let prev = saldoAnterior === null ? null : aCentimosExactos(saldoAnterior)
  for (const d of [...porDia.keys()].sort()) {
    const idx = porDia.get(d)!
    const filas = idx.map((i, k) => ({ importe: movimientos[i].importe, saldo: movimientos[i].saldo ?? null, pref: k }))
    if (idx.length === 1) {
      prev = filas[0].saldo === null ? null : aCentimosExactos(filas[0].saldo)
      continue
    }
    let r = prev === null ? null : ordenarDiaPorSaldo(filas, prev)
    if (!r || !r.ok) r = ordenarDiaPorSaldo(filas, null)
    if (r.ok && r.estado === 'UNICO') {
      r.orden.forEach((k, pos) => { out[idx[k]] = pos + 1 })
      prev = r.saldoFinal
    } else {
      prev = null
    }
  }
  return out
}

/** Cierre exacto de un día (en euros) si su orden por saldo es único; si no, null. */
export function cierreDiaPorSaldo(movimientos: readonly MovimientoConSaldo[]): number | null {
  if (movimientos.length === 0) return null
  const r = ordenarDiaPorSaldo(movimientos.map((m, k) => ({ importe: m.importe, saldo: m.saldo ?? null, pref: k })), null)
  return r.ok && r.estado === 'UNICO' ? r.saldoFinal / 100 : null
}
