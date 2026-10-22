/**
 * Núcleo B3 sin efectos: no lee BD, no muta movimientos y no aplica tolerancias.
 * Los importes se comparan siempre como céntimos enteros exactos.
 */

export interface MovimientoCadenaSaldo {
  fechaOperacion: Date
  importe: number
  saldo?: number | null
  /** Secuencia cronológica que entrega el banco dentro del mismo día. */
  ordenBancario?: number | null
  [campo: string]: unknown
}

export interface SaldoAnteriorCadena {
  fecha: Date
  saldo: number
}

export type CodigoAvisoCadenaSaldo =
  | 'COBERTURA_NO_VERIFICADA'
  | 'SALDO_AUSENTE'
  | 'SALDO_INVALIDO'
  | 'SALDO_NO_ENTERO_CENTIMOS'
  | 'IMPORTE_INVALIDO'
  | 'IMPORTE_NO_ENTERO_CENTIMOS'
  | 'FECHA_INVALIDA'
  | 'ORDEN_MISMO_DIA_AMBIGUO'
  | 'PUENTE_MISMO_DIA_AMBIGUO'
  | 'HUECO_SALDO'

export interface AvisoCadenaSaldo {
  codigo: CodigoAvisoCadenaSaldo
  mensaje: string
  fecha?: Date
  esperado?: number
  observado?: number
  diferencia?: number
}

export interface AnalisisCadenaSaldo {
  estado: 'OK' | 'HUECO' | 'SIN_SALDO' | 'ORDEN_AMBIGUO'
  avisos: AvisoCadenaSaldo[]
  puedeActualizarSaldo: boolean
  ultimoSaldoConocido: number | null
  fechaUltimoMovimiento: Date | null
}

export interface MovimientoSolapeExtracto {
  fechaOperacion: Date
  importe: number
  saldo?: number | null
  concepto?: string | null
  referencia?: string | null
  hashUnico?: string | null
  [campo: string]: unknown
}

export interface SolapeExtracto {
  indiceActual: number
  indiceHistorico: number
  clave: string
}

interface MovimientoPreparado {
  movimiento: MovimientoCadenaSaldo
  indice: number
  fecha: Date | null
  dia: string | null
  importeCentimos: number | null
  saldoCentimos: number | null
  saldoAusente: boolean
}

const MAX_ABSOLUTO = 1_000_000_000

function fechaValida(valor: unknown): valor is Date {
  return valor instanceof Date && Number.isFinite(valor.getTime())
}

function diaUtc(fecha: Date): string {
  const yyyy = fecha.getUTCFullYear()
  const mm = String(fecha.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(fecha.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function esImporteCentimos(valor: unknown): valor is number {
  return typeof valor === 'number'
    && Number.isFinite(valor)
    && Math.abs(valor) <= MAX_ABSOLUTO
    && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7
}

function aCentimos(valor: number): number {
  return Math.round(valor * 100)
}

function aImporte(centimos: number): number {
  return centimos / 100
}

function ordenFiable(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor)
}

function preparar(movimiento: MovimientoCadenaSaldo, indice: number): MovimientoPreparado {
  const fecha = fechaValida(movimiento.fechaOperacion) ? movimiento.fechaOperacion : null
  const importeCentimos = esImporteCentimos(movimiento.importe) ? aCentimos(movimiento.importe) : null
  const saldoAusente = movimiento.saldo === null || movimiento.saldo === undefined
  const saldoCentimos = esImporteCentimos(movimiento.saldo) ? aCentimos(movimiento.saldo) : null

  return {
    movimiento,
    indice,
    fecha,
    dia: fecha ? diaUtc(fecha) : null,
    importeCentimos,
    saldoCentimos,
    saldoAusente,
  }
}

function aviso(codigo: CodigoAvisoCadenaSaldo, mensaje: string, fecha?: Date, extra: Omit<AvisoCadenaSaldo, 'codigo' | 'mensaje' | 'fecha'> = {}): AvisoCadenaSaldo {
  return { codigo, mensaje, ...(fecha ? { fecha } : {}), ...extra }
}

function compararPreparados(a: MovimientoPreparado, b: MovimientoPreparado): number {
  if (!a.fecha && !b.fecha) return a.indice - b.indice
  if (!a.fecha) return 1
  if (!b.fecha) return -1
  const porDia = diaUtc(a.fecha).localeCompare(diaUtc(b.fecha))
  if (porDia !== 0) return porDia

  const ordenA = a.movimiento.ordenBancario
  const ordenB = b.movimiento.ordenBancario
  if (ordenFiable(ordenA) && ordenFiable(ordenB) && ordenA !== ordenB) return ordenA - ordenB
  return a.indice - b.indice
}

/**
 * Comprueba una cadena de saldo bancario con igualdad exacta de céntimos.
 *
 * La ausencia de un saldo puente no convierte el primer saldo en cero: permite
 * comprobar la continuidad interna, pero impide actualizar el saldo de cuenta.
 * Un día con varios movimientos sin orden bancario fiable se deja sin inferir;
 * así no se transforma una permutación en un hueco ficticio.
 */
export function analizarCadenaSaldo(
  movimientos: readonly MovimientoCadenaSaldo[],
  anterior: SaldoAnteriorCadena | null | undefined = null,
): AnalisisCadenaSaldo {
  const avisos: AvisoCadenaSaldo[] = []
  const preparados = movimientos.map(preparar).sort(compararPreparados)
  let hayHueco = false
  let haySinSaldo = false
  let hayOrdenAmbiguo = false
  let puenteVerificado = false
  let saldoAnteriorCentimos: number | null = null

  for (const item of preparados) {
    if (!item.fecha) {
      haySinSaldo = true
      avisos.push(aviso('FECHA_INVALIDA', 'El movimiento no tiene una fecha de operación válida.'))
    }
    if (item.importeCentimos === null) {
      haySinSaldo = true
      avisos.push(aviso(
        typeof item.movimiento.importe === 'number' && Number.isFinite(item.movimiento.importe)
          ? 'IMPORTE_NO_ENTERO_CENTIMOS'
          : 'IMPORTE_INVALIDO',
        'El importe debe ser un número finito expresable en céntimos exactos.',
        item.fecha ?? undefined,
      ))
    }
    if (item.saldoAusente) {
      haySinSaldo = true
      avisos.push(aviso('SALDO_AUSENTE', 'El extracto no aporta saldo para este movimiento; no equivale a 0.', item.fecha ?? undefined))
    } else if (item.saldoCentimos === null) {
      haySinSaldo = true
      avisos.push(aviso(
        typeof item.movimiento.saldo === 'number' && Number.isFinite(item.movimiento.saldo)
          ? 'SALDO_NO_ENTERO_CENTIMOS'
          : 'SALDO_INVALIDO',
        'El saldo debe ser un número finito expresable en céntimos exactos.',
        item.fecha ?? undefined,
      ))
    }
  }

  const conFecha = preparados.filter((item): item is MovimientoPreparado & { fecha: Date; dia: string } => Boolean(item.fecha && item.dia))
  if (conFecha.length === 0) {
    avisos.push(aviso('COBERTURA_NO_VERIFICADA', 'No hay movimientos fechados para verificar la cobertura del extracto.'))
    return {
      estado: 'SIN_SALDO',
      avisos,
      puedeActualizarSaldo: false,
      ultimoSaldoConocido: null,
      fechaUltimoMovimiento: null,
    }
  }

  const primerMovimiento = conFecha[0]
  if (!anterior) {
    avisos.push(aviso('COBERTURA_NO_VERIFICADA', 'El extracto no aporta un saldo puente anterior; no se inventa un saldo inicial.', primerMovimiento.fecha))
  } else if (!fechaValida(anterior.fecha) || !esImporteCentimos(anterior.saldo)) {
    haySinSaldo = true
    avisos.push(aviso('COBERTURA_NO_VERIFICADA', 'El saldo puente anterior no es verificable.', primerMovimiento.fecha))
  } else {
    const diaAnterior = diaUtc(anterior.fecha)
    if (diaAnterior === primerMovimiento.dia) {
      hayOrdenAmbiguo = true
      avisos.push(aviso('PUENTE_MISMO_DIA_AMBIGUO', 'El saldo puente y el primer movimiento son del mismo día sin orden bancario común.', primerMovimiento.fecha))
    } else if (diaAnterior > primerMovimiento.dia) {
      haySinSaldo = true
      avisos.push(aviso('COBERTURA_NO_VERIFICADA', 'El saldo puente es posterior al extracto; su cobertura no se puede comprobar.', primerMovimiento.fecha))
    } else {
      puenteVerificado = true
      saldoAnteriorCentimos = aCentimos(anterior.saldo)
    }
  }

  let cursor = 0
  let ultimoSaldoConocido: number | null = null
  let fechaUltimoMovimiento: Date | null = null

  while (cursor < conFecha.length) {
    const inicio = cursor
    const dia = conFecha[cursor].dia
    while (cursor < conFecha.length && conFecha[cursor].dia === dia) cursor++
    const grupo = conFecha.slice(inicio, cursor)
    const ordenes = grupo.map(item => item.movimiento.ordenBancario)
    const ordenesFiables = ordenes.every(ordenFiable)
    const ordenesUnicos = ordenesFiables && new Set(ordenes as number[]).size === ordenes.length
    const ambiguo = grupo.length > 1 && !ordenesUnicos

    if (ambiguo) {
      hayOrdenAmbiguo = true
      avisos.push(aviso(
        'ORDEN_MISMO_DIA_AMBIGUO',
        'Hay varios movimientos el mismo día sin un orden bancario único y fiable; no se infiere la cadena.',
        grupo[0].fecha,
      ))
      saldoAnteriorCentimos = null
      const ultimo = grupo[grupo.length - 1]
      fechaUltimoMovimiento = ultimo.fecha
      ultimoSaldoConocido = null
      continue
    }

    for (const item of grupo) {
      fechaUltimoMovimiento = item.fecha
      if (item.importeCentimos === null || item.saldoCentimos === null) {
        saldoAnteriorCentimos = null
        ultimoSaldoConocido = null
        continue
      }

      if (saldoAnteriorCentimos !== null) {
        const esperadoCentimos = saldoAnteriorCentimos + item.importeCentimos
        if (esperadoCentimos !== item.saldoCentimos) {
          hayHueco = true
          avisos.push(aviso(
            'HUECO_SALDO',
            'El saldo observado no encadena exactamente con el saldo anterior y el importe del movimiento.',
            item.fecha,
            {
              esperado: aImporte(esperadoCentimos),
              observado: aImporte(item.saldoCentimos),
              diferencia: aImporte(item.saldoCentimos - esperadoCentimos),
            },
          ))
        }
      }

      saldoAnteriorCentimos = item.saldoCentimos
      ultimoSaldoConocido = aImporte(item.saldoCentimos)
    }
  }

  const estado: AnalisisCadenaSaldo['estado'] = hayOrdenAmbiguo
    ? 'ORDEN_AMBIGUO'
    : haySinSaldo
      ? 'SIN_SALDO'
      : hayHueco
        ? 'HUECO'
        : 'OK'

  return {
    estado,
    avisos,
    puedeActualizarSaldo: estado === 'OK' && puenteVerificado,
    ultimoSaldoConocido,
    fechaUltimoMovimiento,
  }
}

/** La fecha B3 de corte es la máxima fecha de operación cubierta por el extracto. */
export function fechaCorteExtracto(movimientos: readonly Pick<MovimientoCadenaSaldo, 'fechaOperacion'>[]): Date | null {
  let maxima: Date | null = null
  for (const movimiento of movimientos) {
    if (fechaValida(movimiento.fechaOperacion) && (!maxima || movimiento.fechaOperacion.getTime() > maxima.getTime())) {
      maxima = movimiento.fechaOperacion
    }
  }
  return maxima ? new Date(maxima.getTime()) : null
}

function textoHuella(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-ES')
  return limpio || null
}

function claveSolape(movimiento: MovimientoSolapeExtracto): string | null {
  const hash = textoHuella(movimiento.hashUnico)
  if (hash) return `HASH:${hash}`
  if (!fechaValida(movimiento.fechaOperacion) || !esImporteCentimos(movimiento.importe)) return null
  const saldo = movimiento.saldo === null || movimiento.saldo === undefined
    ? 'SIN_SALDO'
    : esImporteCentimos(movimiento.saldo)
      ? String(aCentimos(movimiento.saldo))
      : null
  if (saldo === null) return null
  return [
    `FECHA:${diaUtc(movimiento.fechaOperacion)}`,
    `IMPORTE:${aCentimos(movimiento.importe)}`,
    `SALDO:${saldo}`,
    `CONCEPTO:${textoHuella(movimiento.concepto) ?? ''}`,
    `REFERENCIA:${textoHuella(movimiento.referencia) ?? ''}`,
  ].join('|')
}

/**
 * Informa solapes exactos sin deduplicar ni mutar los movimientos históricos.
 * Si el histórico contiene copias, se devuelven todas: ocultarlas sería destructivo.
 */
export function detectarSolapesExtracto(
  actuales: readonly MovimientoSolapeExtracto[],
  historicos: readonly MovimientoSolapeExtracto[],
): SolapeExtracto[] {
  const porClave = new Map<string, number[]>()
  historicos.forEach((movimiento, indiceHistorico) => {
    const clave = claveSolape(movimiento)
    if (!clave) return
    const indices = porClave.get(clave) ?? []
    indices.push(indiceHistorico)
    porClave.set(clave, indices)
  })

  const solapes: SolapeExtracto[] = []
  actuales.forEach((movimiento, indiceActual) => {
    const clave = claveSolape(movimiento)
    if (!clave) return
    for (const indiceHistorico of porClave.get(clave) ?? []) {
      solapes.push({ indiceActual, indiceHistorico, clave })
    }
  })
  return solapes
}
