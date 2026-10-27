import {
  assessConfirmingLiquidationEvidence,
  isCivilDay,
  type ConfirmingLiquidationBlockCode,
  type ConfirmingLiquidationEvidence,
} from './confirming-liquidation-core'

export type ConfirmingLiquidationCandidateBlockCode = ConfirmingLiquidationBlockCode
  | 'LIQUIDACION_FACTURA_EMITIDA_NO_ENCONTRADA'
  | 'LIQUIDACION_FACTURA_NUMERO_NO_COINCIDE'
  | 'LIQUIDACION_FACTURA_IMPORTE_NO_COINCIDE'
  | 'LIQUIDACION_DOCUMENTO_B4_AUSENTE'
  | 'LIQUIDACION_CAPACIDAD_B4_NO_EXACTA'
  | 'LIQUIDACION_MOVIMIENTO_NO_ES_ABONO'
  | 'LIQUIDACION_MOVIMIENTO_B4_NO_DISPONIBLE'
  | 'LIQUIDACION_CUENTA_DEPOSITARIA_NO_COINCIDE'
  | 'LIQUIDACION_MOVIMIENTO_FUERA_DE_VENTANA'
  | 'LIQUIDACION_MOVIMIENTO_NETO_NO_COINCIDE'
  | 'LIQUIDACION_MOVIMIENTO_AMBIGUO'

export type StoredLiquidationFacturaEmitida = Readonly<{
  id: string
  numFactura: string
  fecha: string | null
  totalCentimos: number | null
}>

export type StoredLiquidationDocumentoB4 = Readonly<{
  id: string
  facturaEmitidaId: string
  activo: boolean
  objetivoCentimos: number | null
  asignadoCentimos: number
}>

export type StoredLiquidationMovimiento = Readonly<{
  id: string
  fecha: string
  cuentaId: string | null
  importeCentimos: number
  estadoB4: 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE' | 'DESCONOCIDO'
}>

export type ConfirmingLiquidationB4Line = Readonly<
  | { tipo: 'DOCUMENTO'; documentoConciliableId: string; facturaEmitidaId: string; importeCentimos: number }
  | { tipo: 'DIFERENCIA'; motivoDiferencia: 'INTERESES' | 'COMISION' | 'IVA_COMISION'; importeCentimos: number }
>

export type ConfirmingLiquidationCandidate = Readonly<{
  id: string
  liquidacionId: string
  confirmingId: string
  movimientoId: string
  estado: 'LISTO_PARA_CONFIRMACION_B4' | 'REQUIERE_REVISION_DOCUMENTAL' | 'REQUIERE_REVISION_AMBIGUEDAD'
  bloqueos: readonly ConfirmingLiquidationCandidateBlockCode[]
  sourceHash: string
  cuentaDepositariaId: string | null
  fechaLiquidacion: string | null
  importeMovimientoCentimos: number
  nominalCentimos: number | null
  interesesCentimos: number | null
  comisionCentimos: number | null
  ivaComisionCentimos: number | null
  netoBancarioCentimos: number | null
  totalLineasB4Centimos: number | null
  lineasB4: readonly ConfirmingLiquidationB4Line[]
  requiereConfirmacionHumana: true
  noEscrituras: true
}>

export type BuildConfirmingLiquidationCandidatesInput = Readonly<{
  liquidaciones: readonly ConfirmingLiquidationEvidence[]
  facturasEmitidas: readonly StoredLiquidationFacturaEmitida[]
  documentosB4: readonly StoredLiquidationDocumentoB4[]
  movimientos: readonly StoredLiquidationMovimiento[]
}>

export type BuildConfirmingLiquidationCandidatesResult = Readonly<{
  candidates: readonly ConfirmingLiquidationCandidate[]
  warningCodes: readonly string[]
}>

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort()
}

function sum(values: readonly number[]): number | null {
  let total = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null
    total += value
    if (!Number.isSafeInteger(total) || Math.abs(total) > 2_147_483_647) return null
  }
  return total
}

function normalizeInvoiceNumber(value: string): string {
  return value.normalize('NFKC').toLocaleUpperCase('es-ES').replace(/[\s\u00a0]+/g, '').replace(/[‐‑‒–—―]/g, '-')
}

function civilNumber(value: string): number | null {
  if (!isCivilDay(value)) return null
  return Math.floor(new Date(`${value}T00:00:00.000Z`).getTime() / 86_400_000)
}

function state(blockers: readonly ConfirmingLiquidationCandidateBlockCode[]): ConfirmingLiquidationCandidate['estado'] {
  if (blockers.includes('LIQUIDACION_MOVIMIENTO_AMBIGUO')) return 'REQUIERE_REVISION_AMBIGUEDAD'
  return blockers.length === 0 ? 'LISTO_PARA_CONFIRMACION_B4' : 'REQUIERE_REVISION_DOCUMENTAL'
}

type Preparation = Readonly<{
  evidence: ConfirmingLiquidationEvidence
  baseBlockers: readonly ConfirmingLiquidationCandidateBlockCode[]
  lines: readonly ConfirmingLiquidationB4Line[]
  totalLines: number | null
}>

/**
 * C11 selection uses a settlement as an indivisible documentary unit. Unlike a
 * legacy partial subset, every invoice in its declared detail is charged at
 * nominal and all explicit summary deductions travel in the same B4 proposal.
 */
export function buildConfirmingLiquidationCandidates(input: BuildConfirmingLiquidationCandidatesInput): BuildConfirmingLiquidationCandidatesResult {
  const invoices = new Map(input.facturasEmitidas.map((item) => [item.id, item]))
  const wrappersByInvoice = new Map<string, StoredLiquidationDocumentoB4[]>()
  for (const wrapper of input.documentosB4) {
    const bucket = wrappersByInvoice.get(wrapper.facturaEmitidaId) ?? []
    bucket.push(wrapper)
    wrappersByInvoice.set(wrapper.facturaEmitidaId, bucket)
  }

  const preparations: Preparation[] = input.liquidaciones.map((evidence) => {
    const assessment = assessConfirmingLiquidationEvidence(evidence)
    const blockers: ConfirmingLiquidationCandidateBlockCode[] = [...assessment.bloqueos]
    const lines: ConfirmingLiquidationB4Line[] = []
    for (const line of evidence.lineas) {
      const invoice = invoices.get(line.facturaEmitidaId)
      if (!invoice) {
        blockers.push('LIQUIDACION_FACTURA_EMITIDA_NO_ENCONTRADA')
        continue
      }
      if (normalizeInvoiceNumber(invoice.numFactura) !== normalizeInvoiceNumber(line.numeroFactura)) blockers.push('LIQUIDACION_FACTURA_NUMERO_NO_COINCIDE')
      if (invoice.totalCentimos === null || invoice.totalCentimos !== line.nominalCentimos) blockers.push('LIQUIDACION_FACTURA_IMPORTE_NO_COINCIDE')
      const wrappers = (wrappersByInvoice.get(line.facturaEmitidaId) ?? []).filter((item) => item.activo)
      const wrapper = wrappers.length === 1 ? wrappers[0] : null
      if (!wrapper) blockers.push('LIQUIDACION_DOCUMENTO_B4_AUSENTE')
      else if (wrapper.objetivoCentimos === null || wrapper.objetivoCentimos - wrapper.asignadoCentimos !== line.nominalCentimos) blockers.push('LIQUIDACION_CAPACIDAD_B4_NO_EXACTA')
      else if (line.nominalCentimos !== null && line.nominalCentimos > 0) lines.push({ tipo: 'DOCUMENTO', documentoConciliableId: wrapper.id, facturaEmitidaId: line.facturaEmitidaId, importeCentimos: line.nominalCentimos })
    }
    const deductions: ReadonlyArray<readonly ['INTERESES' | 'COMISION' | 'IVA_COMISION', number | null]> = [
      ['INTERESES', evidence.interesesCentimos],
      ['COMISION', evidence.comisionCentimos],
      ['IVA_COMISION', evidence.ivaComisionCentimos],
    ]
    for (const [motivoDiferencia, amount] of deductions) {
      if (typeof amount === 'number' && amount > 0) lines.push({ tipo: 'DIFERENCIA', motivoDiferencia, importeCentimos: -amount })
    }
    const totalLines = sum(lines.map((line) => line.importeCentimos))
    if (totalLines !== evidence.netoBancarioCentimos) blockers.push('LIQUIDACION_CIERRE_NO_EXACTO')
    return { evidence, baseBlockers: uniqueSorted(blockers), lines, totalLines }
  })

  // La unicidad es bidireccional: una sola liquidación para el abono y un
  // solo abono pendiente para esa liquidación. La capacidad B4 por sí sola no
  // permite elegir cuál de dos ingresos idénticos es el correcto.
  const exactMovements = new Map(preparations.map(item => [item, new Set(input.movimientos.filter(movement => {
    const settlementDay = civilNumber(item.evidence.fechaLiquidacion ?? '')
    const movementDay = civilNumber(movement.fecha)
    return item.baseBlockers.length === 0 && movement.estadoB4 === 'SIN_DOCUMENTO'
      && movement.importeCentimos > 0 && item.evidence.netoBancarioCentimos === movement.importeCentimos
      && item.evidence.cuentaDepositariaId === movement.cuentaId
      && settlementDay !== null && movementDay !== null && movementDay >= settlementDay && movementDay - settlementDay <= 4
  }).map(movement => movement.id))]))
  const candidates: ConfirmingLiquidationCandidate[] = []
  for (const movement of input.movimientos) {
    const exact = preparations.filter((item) =>
      item.baseBlockers.length === 0
      && movement.importeCentimos > 0
      && item.evidence.netoBancarioCentimos === movement.importeCentimos
      && item.evidence.cuentaDepositariaId === movement.cuentaId
      && civilNumber(item.evidence.fechaLiquidacion ?? '') !== null
      && civilNumber(movement.fecha) !== null
      && civilNumber(movement.fecha)! >= civilNumber(item.evidence.fechaLiquidacion ?? '')!
      && civilNumber(movement.fecha)! - civilNumber(item.evidence.fechaLiquidacion ?? '')! <= 4,
    )
    for (const item of preparations) {
      const blockers: ConfirmingLiquidationCandidateBlockCode[] = [...item.baseBlockers]
      if (movement.importeCentimos <= 0) blockers.push('LIQUIDACION_MOVIMIENTO_NO_ES_ABONO')
      if (movement.estadoB4 !== 'SIN_DOCUMENTO') blockers.push('LIQUIDACION_MOVIMIENTO_B4_NO_DISPONIBLE')
      if (item.evidence.cuentaDepositariaId !== movement.cuentaId) blockers.push('LIQUIDACION_CUENTA_DEPOSITARIA_NO_COINCIDE')
      const settlementDay = civilNumber(item.evidence.fechaLiquidacion ?? '')
      const movementDay = civilNumber(movement.fecha)
      if (settlementDay === null || movementDay === null || movementDay < settlementDay || movementDay - settlementDay > 4) blockers.push('LIQUIDACION_MOVIMIENTO_FUERA_DE_VENTANA')
      if (item.evidence.netoBancarioCentimos !== movement.importeCentimos) blockers.push('LIQUIDACION_MOVIMIENTO_NETO_NO_COINCIDE')
      if (exact.length > 1 && exact.includes(item)) blockers.push('LIQUIDACION_MOVIMIENTO_AMBIGUO')
      if ((exactMovements.get(item)?.size ?? 0) > 1 && exactMovements.get(item)?.has(movement.id)) blockers.push('LIQUIDACION_MOVIMIENTO_AMBIGUO')
      const unique = uniqueSorted(blockers)
      candidates.push({
        id: `confirming-liquidation:${movement.id}:${item.evidence.id}`,
        liquidacionId: item.evidence.id,
        confirmingId: item.evidence.confirmingId,
        movimientoId: movement.id,
        estado: state(unique),
        bloqueos: unique,
        sourceHash: item.evidence.sourceHash,
        cuentaDepositariaId: item.evidence.cuentaDepositariaId,
        fechaLiquidacion: item.evidence.fechaLiquidacion,
        importeMovimientoCentimos: movement.importeCentimos,
        nominalCentimos: item.evidence.nominalCentimos,
        interesesCentimos: item.evidence.interesesCentimos,
        comisionCentimos: item.evidence.comisionCentimos,
        ivaComisionCentimos: item.evidence.ivaComisionCentimos,
        netoBancarioCentimos: item.evidence.netoBancarioCentimos,
        totalLineasB4Centimos: item.totalLines,
        lineasB4: unique.length === 0 ? item.lines : [],
        requiereConfirmacionHumana: true,
        noEscrituras: true,
      })
    }
  }
  return {
    candidates: candidates.sort((left, right) => left.movimientoId.localeCompare(right.movimientoId) || left.liquidacionId.localeCompare(right.liquidacionId)),
    warningCodes: [
      'CUENTA_DEPOSITARIA_EXPLICITA_SIN_COMPARAR_BANCO_EMISOR',
      'FACTURAS_A_NOMINAL_Y_DEDUCCIONES_B4_SEPARADAS',
      'IVA_GLOBAL_DE_COMISION_NO_SE_REPARTE_POR_FACTURA',
      'AVISO_CESION_NO_ES_LIQUIDACION',
    ],
  }
}
