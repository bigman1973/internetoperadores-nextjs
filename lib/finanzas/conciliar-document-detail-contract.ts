export type ConciliarProposalBalanceStatus = 'COINCIDE' | 'NO_COINCIDE' | 'NO_COMPROBABLE'

export type ConciliarDocumentDetailLine = Readonly<{
  numero: string
  cliente: string | null
  fechaEmision: string | null
  fechaVencimiento: string | null
  nominalCentimos: number
  /** Sólo COBRO_PROPUESTA: composición persistida, nunca input del navegador. */
  importePropuestoCentimos?: number | null
  /** Sólo COBRO_PROPUESTA: saldo B4 vigente; null significa revisión, no cero. */
  saldoPendienteActualCentimos?: number | null
  /** Sólo COBRO_PROPUESTA: comparación servidor de propuesta y saldo vigente. */
  estadoSaldo?: ConciliarProposalBalanceStatus
}>

/** Sólo el servidor selecciona fuentes. El PDF se sirve por la ruta privada del mismo origen. */
export type ConciliarDocumentDetail = Readonly<{
  rowId: string
  kind: 'CONFIRMING' | 'REMESA' | 'FACTURA' | 'COBRO_PROPUESTA' | 'OTRO'
  titulo: string
  bancoEmisor: string | null
  numeroLiquidacion: string | null
  referenciaDocumento?: string | null
  fechaLiquidacion: string | null
  cuentaAbono: string | null
  proveedor: string | null
  numeroFactura: string | null
  fechaFactura: string | null
  importeFacturaCentimos: number | null
  lineas: readonly ConciliarDocumentDetailLine[]
  nominalCentimos: number | null
  interesesCentimos: number | null
  comisionCentimos: number | null
  ivaComisionCentimos: number | null
  netoDocumentoCentimos: number | null
  importeBancoCentimos: number | null
  /** Sólo COBRO_PROPUESTA: suma de importes inmovilizados de su composición. */
  sumaPropuestaCentimos?: number | null
  /** Sólo COBRO_PROPUESTA: null si alguna línea B4 no se puede comprobar. */
  sumaSaldosPendientesActualesCentimos?: number | null
  /** Sólo COBRO_PROPUESTA: saldo pendiente actual menos ingreso del banco. */
  diferenciaSaldosPendientesBancoCentimos?: number | null
  cuadreExacto: boolean
  avisos: readonly string[]
  pdfHref: string | null
}>

export function parseConciliarDocumentDetail(value: unknown): ConciliarDocumentDetail {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('El detalle documental no es válido.')
  const raw = value as Record<string, unknown>
  const text = (key: string, nullable = true): string | null => {
    const v = raw[key]
    if (nullable && v === null) return null
    if (typeof v !== 'string' || !v.trim() || v.length > 1600) throw new Error('Falta información documental válida.')
    return v
  }
  const amount = (key: string): number | null => {
    const v = raw[key]
    if (v === null) return null
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new Error('El importe documental no es válido.')
    return v
  }
  const optionalAmount = (row: Record<string, unknown>, key: string): number | null | undefined => {
    if (!Object.prototype.hasOwnProperty.call(row, key)) return undefined
    const v = row[key]
    if (v === null) return null
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) throw new Error('El importe documental no es válido.')
    return v
  }
  const kind = String(raw.kind)
  if (!['CONFIRMING', 'REMESA', 'FACTURA', 'COBRO_PROPUESTA', 'OTRO'].includes(kind)) throw new Error('El tipo de documento no es válido.')
  if (!Array.isArray(raw.lineas) || raw.lineas.length > 2000 || !Array.isArray(raw.avisos) || raw.avisos.length > 100 || typeof raw.cuadreExacto !== 'boolean') throw new Error('El desglose documental no es válido.')
  const lineas = raw.lineas.map((value): ConciliarDocumentDetailLine => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La línea documental no es válida.')
    const row = value as Record<string, unknown>
    const read = (k: string, nullable: boolean): string | null => {
      const v = row[k]
      if (nullable && v === null) return null
      if (typeof v !== 'string' || !v.trim() || v.length > 320) throw new Error('La línea documental no es válida.')
      return v
    }
    if (typeof row.nominalCentimos !== 'number' || !Number.isSafeInteger(row.nominalCentimos)) throw new Error('El nominal no es válido.')
    const importePropuestoCentimos = optionalAmount(row, 'importePropuestoCentimos')
    const saldoPendienteActualCentimos = optionalAmount(row, 'saldoPendienteActualCentimos')
    const estadoSaldo = row.estadoSaldo
    if (estadoSaldo !== undefined && estadoSaldo !== 'COINCIDE' && estadoSaldo !== 'NO_COINCIDE' && estadoSaldo !== 'NO_COMPROBABLE') throw new Error('El estado del saldo no es válido.')
    if (kind === 'COBRO_PROPUESTA' && (importePropuestoCentimos === undefined || saldoPendienteActualCentimos === undefined || estadoSaldo === undefined)) throw new Error('La línea de cobro propuesto no es íntegra.')
    return {
      numero: read('numero', false)!, cliente: read('cliente', true), fechaEmision: read('fechaEmision', true), fechaVencimiento: read('fechaVencimiento', true), nominalCentimos: row.nominalCentimos,
      ...(importePropuestoCentimos === undefined ? {} : { importePropuestoCentimos }),
      ...(saldoPendienteActualCentimos === undefined ? {} : { saldoPendienteActualCentimos }),
      ...(estadoSaldo === undefined ? {} : { estadoSaldo }),
    }
  })
  const sumaPropuestaCentimos = optionalAmount(raw, 'sumaPropuestaCentimos')
  const sumaSaldosPendientesActualesCentimos = optionalAmount(raw, 'sumaSaldosPendientesActualesCentimos')
  const diferenciaSaldosPendientesBancoCentimos = optionalAmount(raw, 'diferenciaSaldosPendientesBancoCentimos')
  if (kind === 'COBRO_PROPUESTA' && (sumaPropuestaCentimos === undefined || sumaSaldosPendientesActualesCentimos === undefined || diferenciaSaldosPendientesBancoCentimos === undefined)) throw new Error('Falta el resumen de saldo vigente.')
  const pdfHref = text('pdfHref')
  if (pdfHref !== null && !/^\/api\/admin\/finanzas\/conciliar\/archivo\/[A-Za-z0-9_-]{1,240}$/.test(pdfHref)) throw new Error('El enlace PDF no pertenece al panel.')
  return {
    rowId: text('rowId', false)!, kind: kind as ConciliarDocumentDetail['kind'], titulo: text('titulo', false)!,
    bancoEmisor: text('bancoEmisor'), numeroLiquidacion: text('numeroLiquidacion'), fechaLiquidacion: text('fechaLiquidacion'), cuentaAbono: text('cuentaAbono'),
    referenciaDocumento: raw.referenciaDocumento === undefined ? null : text('referenciaDocumento'),
    proveedor: text('proveedor'), numeroFactura: text('numeroFactura'), fechaFactura: text('fechaFactura'), importeFacturaCentimos: amount('importeFacturaCentimos'),
    lineas, nominalCentimos: amount('nominalCentimos'), interesesCentimos: amount('interesesCentimos'), comisionCentimos: amount('comisionCentimos'), ivaComisionCentimos: amount('ivaComisionCentimos'),
    netoDocumentoCentimos: amount('netoDocumentoCentimos'), importeBancoCentimos: amount('importeBancoCentimos'),
    ...(sumaPropuestaCentimos === undefined ? {} : { sumaPropuestaCentimos }),
    ...(sumaSaldosPendientesActualesCentimos === undefined ? {} : { sumaSaldosPendientesActualesCentimos }),
    ...(diferenciaSaldosPendientesBancoCentimos === undefined ? {} : { diferenciaSaldosPendientesBancoCentimos }),
    cuadreExacto: raw.cuadreExacto,
    avisos: raw.avisos.map(v => { if (typeof v !== 'string' || !v.trim() || v.length > 1600) throw new Error('El aviso documental no es válido.'); return v }), pdfHref,
  }
}
