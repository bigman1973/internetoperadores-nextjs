import { aCentimosExactos, ordenarDiaPorSaldo, recorrerCadenaPorDias, type FilaDiaSaldo } from '@/lib/finanzas/bank-order-by-balance'

/**
 * Encargo J · cuadre de una cuenta a nivel de DÍA. Función pura (sin BD).
 *
 * Reglas, todas en céntimos enteros y sin tolerancias:
 *  1. Un apunte repetido con la misma fecha, el mismo importe (distinto de 0) y el mismo saldo no puede ser
 *     real dos veces (el saldo habría cambiado): es el mismo apunte cargado dos veces. Se ignora SOLO para
 *     comprobar la cadena; no se borra nada. Un apunte sin saldo con otro idéntico (fecha e importe) que sí
 *     lo trae se trata igual. Si se ignorara uno legítimo, la cadena mostraría el hueco: no hay falso verde.
 *  2. Un día cuenta como cuadrado si existe al menos un orden que encadena saldo anterior + importe = saldo
 *     (UNICO o AMBIGUO). El orden exacto dentro del día no importa si el saldo de cierre es el correcto.
 *  3. IMPOSIBLE (ningún orden encadena), INCONCLUSO, DATO_INVALIDO (falta saldo) y SALTO_ENTRE_DIAS (el saldo de
 *     apertura no es el cierre del día anterior) son huecos: la cuenta NO cuadra y se explica cuál y de cuánto.
 */
export type FilaCuadre = Readonly<{ dia: string; importe: number; saldo: number | null }>

export type HuecoCuadre = Readonly<{
  dia: string
  tipo: 'APUNTE_FALTANTE' | 'SALTO_ENTRE_DIAS' | 'SIN_SALDO' | 'INCONCLUSO'
  mensaje: string
  /** Importe neto que falta (céntimos), si se puede deducir de saldos conocidos. */
  faltanteCentimos: number | null
}>

export type ResultadoCuadre = Readonly<{
  cuadra: boolean
  estado: 'OK' | 'HUECO' | 'SIN_SALDO'
  dias: number
  diasAmbiguosAceptados: number
  duplicadosIgnorados: number
  /** Apuntes sin saldo en el extracto cuyo saldo se deduce por continuidad probada por ambos lados. */
  saldosDeducidos: number
  huecos: readonly HuecoCuadre[]
  /** Primer día a partir del cual la cadena es correcta hasta el último apunte (null si no hay huecos o no hay tramo limpio). */
  cadenaCorrectaDesde: string | null
  saldoFinalCentimos: number | null
}>

const eur = (c: number) => `${c < 0 ? '−' : ''}${(Math.abs(c) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Descarta apuntes repetidos (ver regla 1). Devuelve las filas conservadas y cuántas se ignoraron. */
export function ignorarDuplicadosImportacion(filas: readonly FilaCuadre[]): { filas: FilaCuadre[]; ignorados: number } {
  const vistos = new Set<string>()
  const conSaldo = new Map<string, number>()
  const resto: FilaCuadre[] = []
  let ignorados = 0
  for (const f of filas) {
    const imp = aCentimosExactos(f.importe)
    const sal = f.saldo === null || f.saldo === undefined ? null : aCentimosExactos(f.saldo)
    if (imp !== null && imp !== 0 && sal !== null) {
      const k = `${f.dia}|${imp}|${sal}`
      if (vistos.has(k)) { ignorados++; continue }
      vistos.add(k)
      const kk = `${f.dia}|${imp}`
      conSaldo.set(kk, (conSaldo.get(kk) ?? 0) + 1)
    }
    resto.push(f)
  }
  const salida: FilaCuadre[] = []
  for (const f of resto) {
    const imp = aCentimosExactos(f.importe)
    if ((f.saldo === null || f.saldo === undefined) && imp !== null && imp !== 0) {
      const kk = `${f.dia}|${imp}`
      const n = conSaldo.get(kk) ?? 0
      if (n > 0) { conSaldo.set(kk, n - 1); ignorados++; continue }
    }
    salida.push(f)
  }
  return { filas: salida, ignorados }
}

/** Saldo de apertura de un día si su orden por saldo es posible sin saber el anterior. */
function aperturaDia(filas: readonly FilaDiaSaldo[]): number | null {
  const r = ordenarDiaPorSaldo(filas, null)
  return r.ok ? r.saldoInicial : null
}

/** Con un saldo de entrada y otro de salida conocidos, el neto que falta en el día es (salida − entrada − suma de importes). */
function faltanteNeto(g: readonly FilaDiaSaldo[], entrada: number | null, salida: number | null): number | null {
  if (entrada === null || salida === null) return null
  let suma = 0
  for (const f of g) { const i = aCentimosExactos(f.importe); if (i === null) return null; suma += i }
  return salida - entrada - suma
}

/** Si falta exactamente un apunte, devuelve entre qué saldos (el apunte lleva de `desde` a `hasta`). */
function unApunteFaltante(g: readonly FilaDiaSaldo[], entrada: number | null, salida: number | null): { desde: number; hasta: number } | null {
  const sal = g.map(f => aCentimosExactos(f.saldo)), imp = g.map(f => aCentimosExactos(f.importe))
  if (sal.some(s => s === null) || imp.some(i => i === null)) return null
  const salidas = new Map<number, number>(), entradas = new Map<number, number>()
  g.forEach((_, k) => {
    const t = sal[k] as number, f = t - (imp[k] as number)
    salidas.set(f, (salidas.get(f) ?? 0) + 1)
    entradas.set(t, (entradas.get(t) ?? 0) + 1)
  })
  const inicios: number[] = [], finales: number[] = []
  for (const [k, v] of salidas) for (let i = 0; i < v - (entradas.get(k) ?? 0); i++) inicios.push(k)
  for (const [k, v] of entradas) for (let i = 0; i < v - (salidas.get(k) ?? 0); i++) finales.push(k)
  if (entrada !== null) { const i = inicios.indexOf(entrada); if (i >= 0) inicios.splice(i, 1) }
  if (salida !== null) { const i = finales.indexOf(salida); if (i >= 0) finales.splice(i, 1) }
  return inicios.length === 1 && finales.length === 1 ? { desde: finales[0], hasta: inicios[0] } : null
}

/**
 * Un día con UN solo apunte sin saldo (el banco lo deja en blanco cuando el saldo es 0) se completa SOLO si la
 * continuidad lo prueba por los dos lados: o bien es el último del día y su saldo calculado es exactamente la
 * apertura del día siguiente, o bien es el primero y encaja entre el cierre del día anterior y el resto del día.
 * Si no se prueba, el apunte sigue sin saldo y el día se reporta como hueco.
 */
function completarSaldoUnico(filas: readonly FilaCuadre[]): { filas: FilaCuadre[]; deducidos: number } {
  let actual: FilaCuadre[] = [...filas]
  let deducidos = 0
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const conv = actual.map(f => ({ dia: f.dia, importe: f.importe, saldo: f.saldo ?? null }))
    const r = recorrerCadenaPorDias(conv, null)
    const porDia = new Map<string, FilaCuadre[]>()
    for (const f of actual) { const g = porDia.get(f.dia) ?? []; g.push(f); porDia.set(f.dia, g) }
    const orden = [...porDia.keys()].sort()
    let cambio = false
    for (const d of r.dias) {
      if (d.estado !== 'DATO_INVALIDO') continue
      const g = porDia.get(d.dia)!
      const sin = g.filter(f => f.saldo === null || f.saldo === undefined)
      if (sin.length !== 1) continue
      const nulo = sin[0]
      const imp = aCentimosExactos(nulo.importe)
      if (imp === null) continue
      const resto = g.filter(f => f !== nulo).map(f => ({ importe: f.importe, saldo: f.saldo ?? null }))
      let saldoDeducido: number | null = null
      // Caso A: es el último del día; su saldo debe ser la apertura del día siguiente.
      const rr = resto.length
        ? ordenarDiaPorSaldo(resto, d.saldoAnterior)
        : d.saldoAnterior !== null ? { ok: true as const, saldoFinal: d.saldoAnterior } : null
      const sig = orden[orden.indexOf(d.dia) + 1]
      const aperturaSig = sig ? aperturaDia(porDia.get(sig)!.map(f => ({ importe: f.importe, saldo: f.saldo ?? null }))) : null
      if (rr && rr.ok && aperturaSig !== null && rr.saldoFinal + imp === aperturaSig) saldoDeducido = aperturaSig
      // Caso B: es el primero del día; encaja entre el cierre anterior y el resto.
      if (saldoDeducido === null && d.saldoAnterior !== null) {
        const ini = d.saldoAnterior + imp
        const rb = resto.length ? ordenarDiaPorSaldo(resto, ini) : null
        if (rb && rb.ok) saldoDeducido = ini
      }
      if (saldoDeducido === null) continue
      actual = actual.map(f => (f === nulo ? { ...f, saldo: saldoDeducido! / 100 } : f))
      deducidos++
      cambio = true
    }
    if (!cambio) break
  }
  return { filas: actual, deducidos }
}

export function analizarCuadreDia(entrada: readonly FilaCuadre[]): ResultadoCuadre {
  const dedup = ignorarDuplicadosImportacion(entrada)
  const { filas, deducidos } = completarSaldoUnico(dedup.filas)
  const ignorados = dedup.ignorados
  if (filas.length === 0) {
    return { cuadra: false, estado: 'SIN_SALDO', dias: 0, diasAmbiguosAceptados: 0, duplicadosIgnorados: ignorados, saldosDeducidos: 0, huecos: [], cadenaCorrectaDesde: null, saldoFinalCentimos: null }
  }
  const conv = filas.map(f => ({ dia: f.dia, importe: f.importe, saldo: f.saldo ?? null }))
  const porDia = new Map<string, typeof conv>()
  for (const f of conv) { const g = porDia.get(f.dia) ?? []; g.push(f); porDia.set(f.dia, g) }
  const orden = [...porDia.keys()].sort()
  const r = recorrerCadenaPorDias(conv, null)
  const huecos: HuecoCuadre[] = []
  let ambiguos = 0
  r.dias.forEach((d, ix) => {
    if (d.estado === 'UNICO') return
    if (d.estado === 'AMBIGUO') { ambiguos++; return }
    const g = porDia.get(d.dia)!
    if (d.estado === 'DATO_INVALIDO') {
      const n = g.filter(f => f.saldo === null || f.saldo === undefined).length
      huecos.push({ dia: d.dia, tipo: 'SIN_SALDO', faltanteCentimos: null, mensaje: `${ddmm(d.dia)} · ${n || 'algún'} apunte${n === 1 ? '' : 's'} sin saldo en el extracto: no se puede comprobar la cadena ese día.` })
      return
    }
    if (d.estado === 'INCONCLUSO') {
      huecos.push({ dia: d.dia, tipo: 'INCONCLUSO', faltanteCentimos: null, mensaje: `${ddmm(d.dia)} · demasiados apuntes para comprobar el orden (${g.length}); no se afirma que cuadre.` })
      return
    }
    const diaSig = orden[orden.indexOf(d.dia) + 1]
    const apertSig = diaSig ? aperturaDia(porDia.get(diaSig)!) : null
    if (d.estado === 'SALTO_ENTRE_DIAS') {
      const ant = orden[orden.indexOf(d.dia) - 1]
      const dif = d.diferencia ?? 0
      huecos.push({ dia: d.dia, tipo: 'SALTO_ENTRE_DIAS', faltanteCentimos: dif, mensaje: `${ddmm(d.dia)} · el saldo de apertura no es el cierre del ${ant ? ddmm(ant) : 'día anterior'}: faltan apuntes por ${eur(dif)} netos entre ambos días.` })
      return
    }
    // IMPOSIBLE: ningún orden de los apuntes cargados encadena => falta al menos un apunte.
    const entradaDia = d.saldoAnterior
    const uno = unApunteFaltante(g, entradaDia, apertSig)
    const neto = faltanteNeto(g, entradaDia, apertSig)
    const gemelo = uno ? g.some(f => aCentimosExactos(f.importe) === uno.hasta - uno.desde) : false
    const detalle = uno
      ? `falta un apunte de ${eur(uno.hasta - uno.desde)} (entre un saldo de ${eur(uno.desde)} y otro de ${eur(uno.hasta)})${gemelo ? '; hay otro del mismo importe ese día: probablemente se perdió al cargar uno de dos iguales' : ''}.`
      : neto !== null
        ? `faltan uno o varios apuntes por ${eur(neto)} netos.`
        : 'faltan apuntes y no hay saldo vecino para cuantificarlos.'
    huecos.push({ dia: d.dia, tipo: 'APUNTE_FALTANTE', faltanteCentimos: uno ? uno.hasta - uno.desde : neto, mensaje: `${ddmm(d.dia)} · ${detalle}` })
    void ix
  })
  const ultimo = huecos.length ? huecos[huecos.length - 1].dia : null
  const desde = ultimo ? (orden.find(d => d > ultimo) ?? null) : null
  const soloSinSaldo = huecos.length > 0 && huecos.every(h => h.tipo === 'SIN_SALDO')
  return {
    cuadra: huecos.length === 0,
    estado: huecos.length === 0 ? 'OK' : soloSinSaldo ? 'SIN_SALDO' : 'HUECO',
    dias: orden.length,
    diasAmbiguosAceptados: ambiguos,
    duplicadosIgnorados: ignorados,
    saldosDeducidos: deducidos,
    huecos,
    cadenaCorrectaDesde: desde,
    saldoFinalCentimos: r.saldoFinal,
  }
}
