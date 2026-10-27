import {
  assessConfirmingLiquidationEvidence,
  hashConfirmingLiquidationEvidence,
  type ConfirmingLiquidationBank,
  type ConfirmingLiquidationEvidence,
  type ConfirmingLiquidationInvoiceLine,
  type ConfirmingLiquidationSourceDocument,
} from './confirming-liquidation-core'

/**
 * C11 loader de inventario archivado.
 *
 * No abre ficheros, no importa confirming-parser, no ejecuta OCR/PDF/XLS, no
 * llama a Graph/OneDrive y no escribe en DB. El inventario privado ya archivado
 * debe haber sido producido y revisado antes de esta capa. Aquí únicamente se
 * verifica su contrato, hashes binarios/procedencia y pareja PDF/XLS declarada.
 */

export const CONFIRMING_ARCHIVED_LOADER_SCHEMA = 'CONFIRMING_ARCHIVED_LOADER_V1' as const

export class ConfirmingLiquidationLoaderError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
  }
}

export type ArchivedConfirmingLine = Readonly<{
  numFactura: string
  importe: number
  intereses?: number
  comision?: number
  fechaFactura?: string
  fechaPago?: string
  fechaVencimiento?: string
}>

/** Subconjunto estable de `inventario-parseado.json`: no incluye rawText. */
export type ArchivedConfirmingParse = Readonly<{
  banco: 'BBVA' | 'CaixaBank'
  tipoDocumento: 'LIQUIDACION' | 'DETALLE_FACTURAS' | 'AVISO_CESION' | 'NO_CLASIFICADO'
  sourceHash: string
  fechaLiquidacion?: string
  totalRemesa: number
  netoBancario?: number
  totalIntereses?: number
  totalComisiones?: number
  totalIvaComision?: number
  totalDeducir?: number
  cuadre?: Readonly<{ estado: 'CUADRA' | 'DESCUADRE' | 'NO_VERIFICABLE' | 'NO_APLICA'; diferenciaCentimos?: number }>
  lineas: readonly ArchivedConfirmingLine[]
}>

/**
 * Un registro procede de un archivo ya descargado y archivado. `sha256` es el
 * hash binario que se vuelve a contrastar contra sourceHash del parser previo;
 * no se acepta una ruta elegida por el navegador ni texto OCR reinyectado.
 */
export type ArchivedConfirmingInventoryRecord = Readonly<{
  key: string
  nombre: string
  extension: 'pdf' | 'xls' | 'xlsx'
  sha256: string
  status: 'PARSED'
  parsed: ArchivedConfirmingParse
}>

export type ArchivedConfirmingDocumentBinding = Readonly<{
  inventarioKey: string
  facturaRecibidaId: string
  archivoControladoId: string
  oneDriveDriveId: string | null
  oneDriveItemId: string | null
}>

export type ExplicitLiquidationInvoiceBinding = Readonly<{
  /** Identidad FacturaEmitida confirmada fuera del loader; nunca se busca aquí. */
  facturaEmitidaId: string
  /** Debe aparecer una única vez en el detalle archivado. */
  numeroFactura: string
  /** Puede ser null en Caixa XLS si no existe línea confirming histórica. */
  confirmingLineaId: string | null
  /** Fecha de emisión del espejo registrado; no se atribuye al PDF/XLS. */
  fechaEmisionRegistrada?: string
}>

/**
 * Un manifest sólo puede referenciar claves existentes del inventario archivado.
 * La pareja Caixa se entrega explícitamente: no se empareja por fecha, nombre,
 * neto XLS, banco emisor ni un supuesto porcentaje fiscal.
 */
export type ArchivedLiquidationManifest = Readonly<{
  liquidacionKey: string
  confirmingId: string
  banco: ConfirmingLiquidationBank
  cuentaDepositariaId: string
  documentoPrincipal: ArchivedConfirmingDocumentBinding
  detalleFacturasXls: ArchivedConfirmingDocumentBinding | null
  bindings: readonly ExplicitLiquidationInvoiceBinding[]
}>

function fail(code: string, message: string): never {
  throw new ConfirmingLiquidationLoaderError(code, message)
}

function validHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function normalizeInvoiceNumber(value: string): string {
  return value.normalize('NFKC').trim().toLocaleUpperCase('es-ES').replace(/[\s\u00a0]+/g, '').replace(/[‐‑‒–—―]/g, '-')
}

function isoDay(value: string | undefined): string | null {
  if (!value) return null
  const match = value.trim().match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const parsed = new Date(`${iso}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null
}

/** Converts only an exactly representable parser result to signed safe cents. */
export function archivedAmountToCents(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const scaled = value * 100
  const rounded = Math.round(scaled)
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) < 0.000_001 && rounded <= 2_147_483_647 ? rounded : null
}

function requireCents(value: unknown, code: string): number {
  const cents = archivedAmountToCents(value)
  if (cents === null) fail(code, 'El inventario archivado no declara un importe exacto en céntimos.')
  return cents
}

function uniqueRecord(records: readonly ArchivedConfirmingInventoryRecord[], key: string): ArchivedConfirmingInventoryRecord {
  const matches = records.filter((record) => record.key === key)
  if (matches.length !== 1) fail('INVENTARIO_ARCHIVADO_AMBIGUO', 'La clave documental no identifica exactamente un archivo archivado.')
  const record = matches[0]
  if (record.status !== 'PARSED' || !validHash(record.sha256) || !validHash(record.parsed.sourceHash) || record.sha256 !== record.parsed.sourceHash) {
    fail('HASH_ARCHIVADO_NO_COINCIDE', 'El hash binario archivado y el hash del parse previo deben coincidir exactamente.')
  }
  return record
}

function sourceDocument(record: ArchivedConfirmingInventoryRecord, binding: ArchivedConfirmingDocumentBinding, rol: ConfirmingLiquidationSourceDocument['rol']): ConfirmingLiquidationSourceDocument {
  if (!binding.facturaRecibidaId || !binding.archivoControladoId) fail('IDENTIDAD_DOCUMENTO_CONTROLADO_AUSENTE', 'Cada fuente requiere FacturaRecibida y archivo controlado explícitos.')
  return {
    id: binding.inventarioKey,
    rol,
    facturaRecibidaId: binding.facturaRecibidaId,
    hashBinario: record.sha256,
    procedencia: 'ARCHIVO_DESCARGADO_CONTROLADO',
    archivoControladoId: binding.archivoControladoId,
    oneDriveDriveId: binding.oneDriveDriveId,
    oneDriveItemId: binding.oneDriveItemId,
    nombreOriginal: record.nombre,
  }
}

function requireLiquidation(record: ArchivedConfirmingInventoryRecord, banco: ConfirmingLiquidationBank) {
  const parsed = record.parsed
  if (parsed.tipoDocumento === 'AVISO_CESION') fail('AVISO_CESION_NO_LIQUIDACION', 'Un aviso de cesión se conserva fuera de C11 y no acredita liquidación.')
  if (parsed.tipoDocumento !== 'LIQUIDACION') fail('DOCUMENTO_PRINCIPAL_NO_ES_LIQUIDACION', 'El documento principal archivado no declara una liquidación.')
  if ((banco === 'BBVA' && parsed.banco !== 'BBVA') || (banco === 'CAIXABANK' && parsed.banco !== 'CaixaBank')) fail('BANCO_DOCUMENTAL_NO_COINCIDE', 'El banco del manifest no coincide con el documento principal.')
  if (parsed.cuadre?.estado !== 'CUADRA') fail('LIQUIDACION_ARCHIVADA_NO_CUADRA', 'El documento principal archivado no cuadra al céntimo.')
  const fechaLiquidacion = isoDay(parsed.fechaLiquidacion)
  if (!fechaLiquidacion) fail('FECHA_LIQUIDACION_AUSENTE', 'La liquidación archivada exige fecha explícita y civilmente válida.')
  return {
    fechaLiquidacion,
    nominalCentimos: requireCents(parsed.totalRemesa, 'NOMINAL_AUSENTE'),
    interesesCentimos: requireCents(parsed.totalIntereses, 'INTERESES_AUSENTES'),
    comisionCentimos: requireCents(parsed.totalComisiones, 'COMISION_AUSENTE'),
    ivaComisionCentimos: requireCents(parsed.totalIvaComision, 'IVA_COMISION_AUSENTE'),
    deduccionTotalCentimos: parsed.totalDeducir === undefined ? null : requireCents(parsed.totalDeducir, 'DEDUCCION_TOTAL_INVALIDA'),
    netoBancarioCentimos: requireCents(parsed.netoBancario, 'NETO_BANCARIO_AUSENTE'),
  }
}

function linesFromBindings(lines: readonly ArchivedConfirmingLine[], bindings: readonly ExplicitLiquidationInvoiceBinding[]): ConfirmingLiquidationInvoiceLine[] {
  if (!bindings.length) fail('SIN_VINCULOS_FACTURA_EXPLICITOS', 'No se carga una liquidación sin identidad explícita de todas sus facturas.')
  const documentLines = new Map<string, ArchivedConfirmingLine[]>()
  for (const line of lines) {
    const key = normalizeInvoiceNumber(line.numFactura)
    const bucket = documentLines.get(key) ?? []
    bucket.push(line)
    documentLines.set(key, bucket)
  }
  const requested = new Set<string>()
  const result: ConfirmingLiquidationInvoiceLine[] = []
  for (const binding of bindings) {
    const key = normalizeInvoiceNumber(binding.numeroFactura)
    if (!binding.facturaEmitidaId || !key || requested.has(key)) fail('VINCULO_FACTURA_AMBIGUO', 'Cada factura del manifest debe tener una identidad única y explícita.')
    requested.add(key)
    const candidates = documentLines.get(key)
    if (!candidates || candidates.length !== 1) fail('FACTURA_DOCUMENTAL_AUSENTE_O_AMBIGUA', 'Una factura vinculada no aparece exactamente una vez en el detalle archivado.')
    const line = candidates[0]
    const fechaLineaDocumental = isoDay(line.fechaFactura)
    const registrada = binding.fechaEmisionRegistrada
    const fechaEmision = registrada === undefined ? fechaLineaDocumental
      : /^\d{4}-\d{2}-\d{2}$/.test(registrada) && Number.isFinite(new Date(`${registrada}T00:00:00.000Z`).getTime())
        && new Date(`${registrada}T00:00:00.000Z`).toISOString().slice(0,10) === registrada ? registrada : null
    if (!fechaEmision) fail('FECHA_EMISION_FACTURA_AUSENTE', 'Falta la fecha válida de la factura emitida registrada; no se toma la fecha de liquidación como emisión.')
    const nominalCentimos = archivedAmountToCents(line.importe)
    if (nominalCentimos === null || nominalCentimos <= 0) fail('NOMINAL_FACTURA_AUSENTE', 'Cada factura documental exige nominal positivo exacto.')
    const fechaVencimiento = line.fechaVencimiento === undefined && line.fechaPago === undefined ? null : isoDay(line.fechaVencimiento ?? line.fechaPago)
    if ((line.fechaVencimiento ?? line.fechaPago) !== undefined && fechaVencimiento === null) fail('FECHA_VENCIMIENTO_FACTURA_INVALIDA', 'La fecha de vencimiento declarada no es civilmente válida.')
    result.push({
      id: `linea:${key}`,
      confirmingLineaId: binding.confirmingLineaId,
      facturaEmitidaId: binding.facturaEmitidaId,
      numeroFactura: line.numFactura,
      nominalCentimos,
      fechaEmision,
      fechaEmisionProcedencia: registrada === undefined ? 'DOCUMENTO' : 'FACTURA_EMITIDA_REGISTRADA',
      fechaLineaDocumental,
      fechaVencimiento,
      interesesExplicitosCentimos: line.intereses === undefined ? null : archivedAmountToCents(line.intereses),
      comisionExplicitaCentimos: line.comision === undefined ? null : archivedAmountToCents(line.comision),
    })
  }
  if (documentLines.size !== requested.size || [...documentLines.keys()].some((number) => !requested.has(number))) {
    fail('DETALLE_FACTURAS_INCOMPLETO', 'El manifest debe cubrir todas las líneas archivadas; no hay subconjuntos ni inferencias.')
  }
  return result.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Construye una evidencia C11 desde datos ya parseados y archivados. No hay
 * alternativa que lea un archivo en ejecución. El caller revisa y persiste el
 * resultado mediante `persistConfirmingLiquidationEvidenceTx` bajo una única tx.
 */
export function loadArchivedConfirmingLiquidation(input: Readonly<{
  inventory: readonly ArchivedConfirmingInventoryRecord[]
  manifest: ArchivedLiquidationManifest
}>): Readonly<{
  schema: typeof CONFIRMING_ARCHIVED_LOADER_SCHEMA
  evidence: ConfirmingLiquidationEvidence
  assessment: ReturnType<typeof assessConfirmingLiquidationEvidence>
}> {
  const { inventory, manifest } = input
  if (!manifest.liquidacionKey || !manifest.confirmingId || !manifest.cuentaDepositariaId) fail('IDENTIDAD_LIQUIDACION_AUSENTE', 'La carga requiere clave, confirming y cuenta depositaria explícitos.')
  const principal = uniqueRecord(inventory, manifest.documentoPrincipal.inventarioKey)
  if (principal.extension !== 'pdf') fail('DOCUMENTO_PRINCIPAL_NO_PDF', 'El documento principal debe ser el PDF de liquidación archivado.')
  const summary = requireLiquidation(principal, manifest.banco)
  if (manifest.banco === 'CAIXABANK' && !manifest.detalleFacturasXls) fail('PAREJA_CAIXA_XLS_AUSENTE', 'Caixa requiere la pareja PDF/XLS declarada explícitamente.')
  if (manifest.banco === 'BBVA' && manifest.detalleFacturasXls !== null) fail('PAREJA_BBVA_NO_ADMITIDA', 'BBVA se acredita desde su PDF de liquidación, sin sustituirlo por XLS.')
  const detail = manifest.detalleFacturasXls === null ? null : uniqueRecord(inventory, manifest.detalleFacturasXls.inventarioKey)
  if (detail && (detail.extension !== 'xls' && detail.extension !== 'xlsx' || detail.parsed.banco !== 'CaixaBank' || detail.parsed.tipoDocumento !== 'DETALLE_FACTURAS')) {
    fail('DETALLE_CAIXA_XLS_INVALIDO', 'La pareja Caixa debe contener exactamente un XLS de detalle de facturas.')
  }
  const documents = detail
    ? [sourceDocument(principal, manifest.documentoPrincipal, 'LIQUIDACION_PDF'), sourceDocument(detail, manifest.detalleFacturasXls!, 'DETALLE_FACTURAS_XLS')]
    : [sourceDocument(principal, manifest.documentoPrincipal, 'LIQUIDACION_PDF')]
  const lineas = linesFromBindings(detail ? detail.parsed.lineas : principal.parsed.lineas, manifest.bindings)
  const draft = {
    id: manifest.liquidacionKey,
    confirmingId: manifest.confirmingId,
    banco: manifest.banco,
    tipoDocumento: 'LIQUIDACION' as const,
    estadoDocumental: 'CUADRA' as const,
    fechaLiquidacion: summary.fechaLiquidacion,
    cuentaDepositariaId: manifest.cuentaDepositariaId,
    documentos: documents,
    ...summary,
    lineas,
  }
  const evidence: ConfirmingLiquidationEvidence = { ...draft, sourceHash: hashConfirmingLiquidationEvidence(draft) }
  const assessment = assessConfirmingLiquidationEvidence(evidence)
  if (!assessment.cuadroExacto) fail('EVIDENCIA_LIQUIDACION_INVALIDA', `La evidencia archivada incumple el contrato: ${assessment.bloqueos.join(',')}.`)
  return { schema: CONFIRMING_ARCHIVED_LOADER_SCHEMA, evidence, assessment }
}
