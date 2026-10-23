import { exactHistoricalPlan, exactHistoricalPopulation, type BulkItem, type MaterialHistorical } from './historical-bulk-core'

export type HistoricalExclusionDocumentInput = Readonly<{
  tipo: string
  sourceId: string
  referenciaHistorica: string
  importeHistoricoCentimos: number | null
  referenciaActual: string | null
  importeDocumentoCentimos: number | null
  actualVerificable: boolean
}>

export type HistoricalExclusionEvidenceByRow = ReadonlyMap<string, readonly HistoricalExclusionDocumentInput[]>

export type HistoricalExclusionDocument = Readonly<{
  referencia: string
  tipo: string
  importeDocumentoCentimos: string | null
  importeHistoricoCentimos: string | null
  estado: 'ACTUAL' | 'NO_VERIFICABLE'
}>

export type HistoricalExclusionMovement = Readonly<{
  movimientoId: string
  fecha: string | null
  cuenta: string
  concepto: string
  importeMovimientoCentimos: string | null
  documentos: readonly HistoricalExclusionDocument[]
  importeDocumentosCentimos: string | null
  diferenciaCentimos: string | null
}>

export type HistoricalExclusionGroup = Readonly<{
  motivo: string
  codigo: string
  totalMovimientos: number
  totalCargosCentimos: string
  totalCobrosCentimos: string
  movimientos: readonly HistoricalExclusionMovement[]
}>

export type HistoricalExclusionsReport = Readonly<{
  generatedAt: string
  totalMovimientos: number
  totalCargosCentimos: string
  totalCobrosCentimos: string
  grupos: readonly HistoricalExclusionGroup[]
}>

type ReasonedRow = Readonly<{ row: MaterialHistorical; reason: string }>
type MutableTotals = { cargos: bigint; cobros: bigint; magnitude: bigint }
type MutableGroup = MutableTotals & { reason: string; rows: ReasonedRow[] }

export const HISTORICAL_EXCLUSION_REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  INTEGRIDAD_HISTORICA_NO_VERIFICABLE: 'La integridad del registro histórico no se puede verificar',
  FECHA_BANCARIA_HISTORICA_CAMBIADA: 'La fecha bancaria actual no coincide con la conservada',
  YA_RESUELTA_B4: 'Ya resuelta en la conciliación actual',
  IMPORTE_BANCARIO_CAMBIADO_O_NO_EXACTO: 'El importe bancario cambió o no es exacto en céntimos',
  REFERENCIA_NO_DOCUMENTAL_O_AMBIGUA: 'La referencia heredada no identifica un documento único',
  SIN_DOCUMENTO_VERIFICABLE: 'No hay documento verificable',
  DOCUMENTO_DUPLICADO: 'El mismo documento se repite dentro de la propuesta',
  DOCUMENTO_NO_ECONOMICO_O_CAMBIADO: 'El documento no es económico o ha cambiado',
  IMPORTE_DOCUMENTAL_CAMBIADO_O_NO_EXACTO: 'El importe documental cambió o no es exacto en céntimos',
  SIGNO_DOCUMENTAL_INCOMPATIBLE: 'El signo del documento no coincide con el movimiento bancario',
  DOCUMENTO_YA_ASIGNADO: 'El documento ya tiene importe asignado',
  SIN_ARCHIVO_CONTROLADO: 'No hay archivo documental controlado',
  FECHA_DOCUMENTAL_NO_VERIFICABLE: 'La fecha documental no se puede verificar',
  FECHA_DOCUMENTAL_CAMBIADA: 'La fecha documental actual no coincide con la conservada',
  FACTURA_POSTERIOR_AL_MOVIMIENTO: 'La factura es posterior al movimiento bancario',
  IMPORTES_NO_COINCIDEN_AL_CENTIMO: 'Los importes no coinciden exactamente al céntimo',
  DOCUMENTO_COMPARTIDO_ENTRE_PROPUESTAS: 'El documento está compartido entre propuestas',
})

function reasonLabel(code: string): string {
  return HISTORICAL_EXCLUSION_REASON_LABELS[code] ?? 'Motivo del selector exacto que requiere revisión manual'
}

function abs(value: number | null): bigint {
  if (value === null || !Number.isSafeInteger(value)) return BigInt(0)
  const amount = BigInt(value)
  return amount < BigInt(0) ? -amount : amount
}

function compareBigIntDescending(left: bigint, right: bigint): number {
  return left === right ? 0 : left > right ? -1 : 1
}

function movementDateMadrid(value: string): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (kind: string) => parts.find(item => item.type === kind)?.value
  const year = part('year'), month = part('month'), day = part('day')
  return year && month && day ? `${year}-${month}-${day}` : null
}

function accountLabel(row: MaterialHistorical): string {
  const bank = typeof row.banco === 'string' ? row.banco.trim() : ''
  const alias = typeof row.cuentaAlias === 'string' ? row.cuentaAlias.trim() : ''
  if (bank && alias) return `${bank} · ${alias}`
  return bank || alias || 'Cuenta sin identificar'
}

function exactDocumentTotal(documents: readonly HistoricalExclusionDocument[]): string | null {
  if (documents.length === 0 || documents.some(document => document.importeDocumentoCentimos === null)) return null
  return documents.reduce((sum, document) => sum + BigInt(document.importeDocumentoCentimos!), BigInt(0)).toString()
}

function toPublicDocuments(input: readonly HistoricalExclusionDocumentInput[]): readonly HistoricalExclusionDocument[] {
  return input.map(document => {
    const current = document.actualVerificable && Number.isSafeInteger(document.importeDocumentoCentimos)
      ? document.importeDocumentoCentimos!.toString() : null
    const historical = Number.isSafeInteger(document.importeHistoricoCentimos)
      ? document.importeHistoricoCentimos!.toString() : null
    return Object.freeze({
      // La referencia actual sólo se usa cuando el material actual existe; si no,
      // la etiqueta procede del snapshot histórico y se marca no verificable.
      referencia: (current !== null && document.referenciaActual) || document.referenciaHistorica || 'Documento histórico sin referencia',
      tipo: document.tipo || 'REFERENCIA_HISTORICA',
      importeDocumentoCentimos: current,
      importeHistoricoCentimos: historical,
      estado: current === null ? 'NO_VERIFICABLE' : 'ACTUAL',
    })
  })
}

function sharedCandidates(rows: readonly MaterialHistorical[]): Set<string> {
  const candidates: BulkItem[] = []
  for (const row of rows) {
    const planned = exactHistoricalPlan(row)
    if ('item' in planned) candidates.push(planned.item)
  }
  const uses = new Map<string, number>()
  for (const item of candidates) {
    for (const document of item.documentos) {
      const key = `${document.tipo}:${document.sourceId}`
      uses.set(key, (uses.get(key) ?? 0) + 1)
    }
  }
  const shared = new Set<string>()
  for (const item of candidates) {
    if (item.documentos.some(document => (uses.get(`${document.tipo}:${document.sourceId}`) ?? 0) > 1)) {
      shared.add(item.historicoId)
    }
  }
  return shared
}

/**
 * Replays the exact selector in read-only form.  `exactHistoricalPopulation` is
 * deliberately executed first: its candidate/shared-document phase remains the
 * source of truth.  We then retain one first blocking code per movement solely
 * to attach report detail; rows resolved in B4 are not reclassified as rejected.
 */
export function buildHistoricalExclusionsReport(
  material: readonly MaterialHistorical[],
  evidenceByHistoricalId: HistoricalExclusionEvidenceByRow = new Map(),
  generatedAt = new Date().toISOString(),
): HistoricalExclusionsReport {
  const population = exactHistoricalPopulation([...material])
  const shared = sharedCandidates(material)
  const groups = new Map<string, MutableGroup>()

  for (const row of material) {
    const planned = exactHistoricalPlan(row)
    let reason: string | null = null
    if ('reason' in planned) reason = planned.reason
    else if (shared.has(row.historicoId)) reason = 'DOCUMENTO_COMPARTIDO_ENTRE_PROPUESTAS'
    if (!reason || reason === 'YA_RESUELTA_B4') continue

    const group = groups.get(reason) ?? { reason, rows: [], cargos: BigInt(0), cobros: BigInt(0), magnitude: BigInt(0) }
    group.rows.push({ row, reason })
    if (Number.isSafeInteger(row.importeMovimientoCentimos)) {
      const amount = BigInt(row.importeMovimientoCentimos!)
      if (amount < BigInt(0)) group.cargos += amount
      else if (amount > BigInt(0)) group.cobros += amount
      group.magnitude += amount < BigInt(0) ? -amount : amount
    }
    groups.set(reason, group)
  }

  // The population is intentionally read, not reconstructed from legacy motives.
  // This check keeps future selector changes from silently introducing a second
  // counting rule in the report while still allowing YA_RESUELTA_B4 to be omitted.
  const expected = Object.entries(population.excluidasPorMotivo)
    .filter(([reason]) => reason !== 'YA_RESUELTA_B4')
    .reduce((sum, [, count]) => sum + count, 0)
  const actual = [...groups.values()].reduce((sum, group) => sum + group.rows.length, 0)
  if (expected !== actual) throw new Error('HISTORICAL_EXCLUSIONS_SELECTOR_DRIFT')

  let totalCargos = BigInt(0)
  let totalCobros = BigInt(0)
  const publicGroups = [...groups.values()]
    .sort((left, right) => compareBigIntDescending(left.magnitude, right.magnitude) || left.reason.localeCompare(right.reason, 'es-ES'))
    .map(group => {
      totalCargos += group.cargos
      totalCobros += group.cobros
      const movements = group.rows
        .map(({ row }) => {
          const documents = toPublicDocuments(evidenceByHistoricalId.get(row.historicoId) ?? [])
          const documentTotal = exactDocumentTotal(documents)
          const movementAmount = Number.isSafeInteger(row.importeMovimientoCentimos) ? row.importeMovimientoCentimos!.toString() : null
          const difference = movementAmount !== null && documentTotal !== null
            ? (BigInt(movementAmount) - BigInt(documentTotal)).toString() : null
          return Object.freeze({
            movimientoId: row.movimientoId,
            fecha: movementDateMadrid(row.fechaOperacion),
            cuenta: accountLabel(row),
            concepto: typeof row.concepto === 'string' && row.concepto.trim() ? row.concepto.trim() : 'Sin concepto bancario',
            importeMovimientoCentimos: movementAmount,
            documentos: documents,
            importeDocumentosCentimos: documentTotal,
            diferenciaCentimos: difference,
          })
        })
        .sort((left, right) => {
          const leftAmount = left.importeMovimientoCentimos === null ? BigInt(0) : BigInt(left.importeMovimientoCentimos)
          const rightAmount = right.importeMovimientoCentimos === null ? BigInt(0) : BigInt(right.importeMovimientoCentimos)
          const leftMagnitude = leftAmount < BigInt(0) ? -leftAmount : leftAmount
          const rightMagnitude = rightAmount < BigInt(0) ? -rightAmount : rightAmount
          return compareBigIntDescending(leftMagnitude, rightMagnitude)
            || (left.fecha ?? '').localeCompare(right.fecha ?? '')
            || left.movimientoId.localeCompare(right.movimientoId)
        })
      return Object.freeze({
        motivo: reasonLabel(group.reason),
        codigo: group.reason,
        totalMovimientos: movements.length,
        totalCargosCentimos: group.cargos.toString(),
        totalCobrosCentimos: group.cobros.toString(),
        movimientos: Object.freeze(movements),
      })
    })

  return Object.freeze({
    generatedAt,
    totalMovimientos: actual,
    totalCargosCentimos: totalCargos.toString(),
    totalCobrosCentimos: totalCobros.toString(),
    grupos: Object.freeze(publicGroups),
  })
}

function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function decimalFromCentimos(value: string | null): string {
  if (value === null || !/^-?\d+$/.test(value)) return 'No verificable'
  const negative = value.startsWith('-')
  const digits = (negative ? value.slice(1) : value).padStart(3, '0')
  const integer = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${integer},${digits.slice(-2)}`
}

function dateForReading(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'No verificable'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function documentsForHtml(documents: readonly HistoricalExclusionDocument[]): string {
  if (documents.length === 0) return '<span class="muted">Sin documento histórico conservado</span>'
  return documents.map(document => `<div class="document"><strong>${escapeHtml(document.referencia)}</strong><br><span>${escapeHtml(document.tipo)} · Histórico: ${escapeHtml(decimalFromCentimos(document.importeHistoricoCentimos))} € · Actual: ${escapeHtml(decimalFromCentimos(document.importeDocumentoCentimos))} € · ${escapeHtml(document.estado)}</span></div>`).join('')
}

/** HTML is attachment-safe and intended for the browser print dialog in landscape. */
export function renderHistoricalExclusionsHtml(report: HistoricalExclusionsReport): string {
  const groups = report.grupos.map(group => `<section class="group">
    <h2>${escapeHtml(group.motivo)}</h2>
    <p class="code">${escapeHtml(group.codigo)} · ${group.totalMovimientos} movimiento${group.totalMovimientos === 1 ? '' : 's'} · Cargos: <strong>${escapeHtml(decimalFromCentimos(group.totalCargosCentimos))} €</strong> · Cobros: <strong>${escapeHtml(decimalFromCentimos(group.totalCobrosCentimos))} €</strong></p>
    <table><thead><tr><th>Fecha (Madrid)</th><th>Cuenta</th><th>Concepto</th><th>Importe banco</th><th>Documentos</th><th>Importe documentos</th><th>Diferencia banco − docs.</th></tr></thead><tbody>
    ${group.movimientos.map(movement => `<tr><td>${escapeHtml(dateForReading(movement.fecha))}</td><td>${escapeHtml(movement.cuenta)}</td><td>${escapeHtml(movement.concepto)}</td><td class="number">${escapeHtml(decimalFromCentimos(movement.importeMovimientoCentimos))} €</td><td>${documentsForHtml(movement.documentos)}</td><td class="number">${escapeHtml(decimalFromCentimos(movement.importeDocumentosCentimos))} €</td><td class="number">${escapeHtml(decimalFromCentimos(movement.diferenciaCentimos))} €</td></tr>`).join('')}
    </tbody></table></section>`).join('\n')
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Informe de excluidas heredadas</title><style>
@page { size: A4 landscape; margin: 11mm; }
* { box-sizing: border-box; } body { margin: 0; background: #eef2f7; color: #17233b; font: 10px/1.35 Arial, Helvetica, sans-serif; } .actions { position: sticky; top: 0; padding: 9px; background: #17233b; text-align: center; } .actions button { border: 0; border-radius: 5px; background: #ed6b21; color: white; cursor: pointer; font-weight: 700; padding: 8px 14px; } main { margin: 12px auto; max-width: 1400px; padding: 13mm; background: #fff; box-shadow: 0 6px 24px rgba(23,35,59,.14); } header { border-bottom: 3px solid #ed6b21; padding-bottom: 9px; } h1 { margin: 0; color: #17233b; font-size: 22px; } .subtitle, .note, .code { color: #5f6d82; } .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 13px 0; } .metric { border: 1px solid #d7dfeb; padding: 8px; } .metric span { display: block; color: #64748b; font-size: 8px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; } .metric strong { display: block; margin-top: 3px; font-size: 15px; } .note { border-left: 3px solid #8094b8; background: #f5f8fc; padding: 7px 9px; } .group { margin-top: 17px; break-inside: avoid-page; } h2 { margin: 0; border-bottom: 1px solid #d7dfeb; padding-bottom: 4px; color: #263d62; font-size: 13px; } .code { margin: 5px 0 7px; font-size: 9px; } table { width: 100%; border-collapse: collapse; table-layout: fixed; } th { background: #f0f4f9; color: #4e5f78; font-size: 8px; letter-spacing: .04em; text-align: left; text-transform: uppercase; } th:nth-child(1){width:8%} th:nth-child(2){width:13%} th:nth-child(3){width:17%} th:nth-child(4){width:10%} th:nth-child(5){width:30%} th:nth-child(6){width:11%} th:nth-child(7){width:11%} td, th { border-bottom: 1px solid #dfe6ef; padding: 5px; overflow-wrap: anywhere; vertical-align: top; } td.number { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; } .document { margin-bottom: 4px; } .document span, .muted { color: #5f6d82; font-size: 9px; } footer { margin-top: 18px; border-top: 1px solid #d7dfeb; padding-top: 7px; color: #64748b; font-size: 8px; } @media print { body { background: #fff; } .actions { display: none; } main { margin: 0; max-width: none; padding: 0; box-shadow: none; } .group { break-inside: avoid-page; } }
</style></head><body><div class="actions"><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button></div><main>
<header><div class="subtitle">Internet Operadores S.L. · Documento interno confidencial</div><h1>Informe de propuestas heredadas excluidas</h1><p class="subtitle">Generado en UTC: ${escapeHtml(report.generatedAt)} · Fechas de movimientos: Europe/Madrid</p></header>
<section class="summary"><div class="metric"><span>Movimientos excluidos</span><strong>${report.totalMovimientos}</strong></div><div class="metric"><span>Total cargos (sin netear)</span><strong>${escapeHtml(decimalFromCentimos(report.totalCargosCentimos))} €</strong></div><div class="metric"><span>Total cobros (sin netear)</span><strong>${escapeHtml(decimalFromCentimos(report.totalCobrosCentimos))} €</strong></div></section>
<p class="note">Cada movimiento aparece una sola vez, bajo el primer motivo bloqueante del selector exacto. Los registros ya resueltos en B4 no se consideran rechazados y no figuran. La procedencia histórica desconocida es metadato explicativo, no un motivo de exclusión.</p>
${groups || '<p class="note">No hay propuestas heredadas excluidas para informar.</p>'}
<footer>Importes en euros procedentes de céntimos enteros; no se aplican tolerancias ni redondeos. «No verificable» no equivale a cero.</footer>
</main></body></html>`
}

function csvText(value: string | null | undefined): string {
  const text = String(value ?? '')
  // Spreadsheet formula protection applies to text only; monetary cells stay exact decimal values.
  const protectedText = /^\s*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${protectedText.replaceAll('"', '""')}"`
}

function csvDecimal(value: string | null): string {
  return value === null ? '' : decimalFromCentimos(value).replaceAll('.', '')
}

function historicalAmountsForCsv(documents: readonly HistoricalExclusionDocument[]): string {
  return documents.map(document => decimalFromCentimos(document.importeHistoricoCentimos)).join(' | ')
}

/** Semicolon CSV: exactly one data row per excluded movement, never summary rows. */
export function renderHistoricalExclusionsCsv(report: HistoricalExclusionsReport): string {
  const header = [
    'Motivo código', 'Motivo', 'Fecha (Europe/Madrid)', 'Cuenta', 'Concepto', 'Importe banco EUR',
    'Documentos', 'Importes propuestos históricos EUR', 'Importe documentos actual EUR',
    'Diferencia banco - documentos EUR', 'Estado documentos',
  ].map(csvText).join(';')
  const lines: string[] = [header]
  for (const group of report.grupos) {
    for (const movement of group.movimientos) {
      const documents = movement.documentos.map(document => `${document.tipo}: ${document.referencia}`).join(' | ')
      const states = movement.documentos.map(document => document.estado).join(' | ')
      lines.push([
        csvText(group.codigo), csvText(group.motivo), csvText(dateForReading(movement.fecha)), csvText(movement.cuenta), csvText(movement.concepto),
        csvDecimal(movement.importeMovimientoCentimos), csvText(documents), csvText(historicalAmountsForCsv(movement.documentos)),
        csvDecimal(movement.importeDocumentosCentimos), csvDecimal(movement.diferenciaCentimos), csvText(states),
      ].join(';'))
    }
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
