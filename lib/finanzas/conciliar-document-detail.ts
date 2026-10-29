import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { projectionRow, type ProjectionSqlRow } from '@/lib/finanzas/conciliar-projection-read'
import { ConciliarDbError } from '@/lib/finanzas/conciliar-errors'
import type { ConciliarDocumentDetail, ConciliarDocumentDetailLine } from './conciliar-document-detail-contract'
import { assertConciliarDocumentDetailActor, ConciliarDocumentDetailError } from './conciliar-document-detail-access'

export { assertConciliarDocumentDetailActor, ConciliarDocumentDetailError } from './conciliar-document-detail-access'

/** El navegador sólo puede transportar este identificador opaco de proyección. */
export const CONCILIAR_DOCUMENT_DETAIL_ROW_ID = /^[A-Za-z0-9_-]{1,240}$/
const SHA256 = /^[a-f0-9]{64}$/
const MAX_DETAIL_LINES = 2_000

type DetailDatabase = Pick<PrismaClient, '$queryRaw'>
type Raw = Record<string, unknown>
const database = () => prisma as unknown as DetailDatabase

function fail(status: number, code: string, message: string): never {
  throw new ConciliarDocumentDetailError(status, code, message)
}

function text(value: unknown, max = 1_600): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}

function day(value: unknown): string | null {
  const parsed = value instanceof Date && Number.isFinite(value.getTime())
    ? value.toISOString().slice(0, 10)
    : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
  if (!parsed) return null
  const checked = new Date(`${parsed}T00:00:00.000Z`)
  return Number.isFinite(checked.getTime()) && checked.toISOString().slice(0, 10) === parsed ? parsed : null
}

function cents(value: unknown): number | null {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'string' && /^-?\d+$/.test(value)
        ? Number(value)
        : NaN
  return Number.isSafeInteger(parsed) && parsed >= -2_147_483_648 && parsed <= 2_147_483_647 ? parsed : null
}

function moneyCents(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  try {
    const exact = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2))
    const signed = negative ? -exact : exact
    return signed >= BigInt(-2_147_483_648) && signed <= BigInt(2_147_483_647) ? Number(signed) : null
  } catch { return null }
}

function object(value: unknown): Raw | null {
  if (typeof value === 'string') {
    try { return object(JSON.parse(value)) } catch { return null }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : null
}
function objects(value: unknown): Raw[] | null {
  if (typeof value === 'string') {
    try { return objects(JSON.parse(value)) } catch { return null }
  }
  if (!Array.isArray(value)) return null
  const rows: Raw[] = []
  for (const item of value) {
    const row = object(item)
    if (!row) return null
    rows.push(row)
  }
  return rows
}
function addWarning(warnings: string[], value: string | null | undefined): void {
  const warning = text(value)
  if (warning && warnings.length < 100 && !warnings.includes(warning)) warnings.push(warning)
}

function sumCents(values: readonly number[]): number | null {
  let total = 0
  for (const value of values) {
    total += value
    if (!Number.isSafeInteger(total) || total < -2_147_483_648 || total > 2_147_483_647) return null
  }
  return total
}

function privatePdfHref(row: { id: string; documento: { href: string | null } | null }): string | null {
  const expected = `/api/admin/finanzas/conciliar/archivo/${encodeURIComponent(row.id)}`
  return row.documento?.href === expected ? expected : null
}

function documentaryFilename(value: unknown): string | null {
  const source = text(value, 320)
  if (!source) return null
  const basename = source.split(/[\\/]/).pop()
  return text(basename, 320)
}

function bankLabel(value: unknown): string | null {
  if (value === 'CAIXABANK') return 'CaixaBank'
  if (value === 'BBVA') return 'BBVA'
  return text(value, 160)
}

function completeLines(rows: readonly Readonly<{
  numero: unknown
  cliente: unknown
  fechaEmision: unknown
  fechaVencimiento: unknown
  nominalCentimos: unknown
}>[]): readonly ConciliarDocumentDetailLine[] | null {
  const lines: ConciliarDocumentDetailLine[] = []
  for (const row of rows) {
    const numero = text(row.numero, 320), nominalCentimos = cents(row.nominalCentimos)
    if (!numero || nominalCentimos === null) return null
    lines.push({
      numero,
      cliente: text(row.cliente, 320),
      fechaEmision: day(row.fechaEmision),
      fechaVencimiento: row.fechaVencimiento === null || row.fechaVencimiento === undefined ? null : day(row.fechaVencimiento),
      nominalCentimos,
    })
  }
  return lines
}

export type ConfirmingDocumentDetailInput = Readonly<{
  rowId: string
  importeBancoCentimos: number
  pdfHref: string | null
  banco: unknown
  cuentaAbono: unknown
  proveedor: unknown
  fechaLiquidacion: unknown
  nominalCentimos: unknown
  interesesCentimos: unknown
  comisionCentimos: unknown
  ivaComisionCentimos: unknown
  netoDocumentoCentimos: unknown
  estadoDocumental: unknown
  snapshotExplicito: boolean
  /** Sólo puede proceder de un campo explícito del snapshot, nunca de un nombre de archivo o clave. */
  numeroLiquidacionExplicito: unknown
  referenciaDocumento: unknown
  lineas: readonly Readonly<{
    numero: unknown
    cliente: unknown
    fechaEmision: unknown
    fechaVencimiento: unknown
    nominalCentimos: unknown
  }>[]
  avisos?: readonly string[]
}>

/** Convierte evidencia C11 ya leída a un DTO sin exponer claves, hashes ni localizadores. */
export function buildConfirmingDocumentDetail(input: ConfirmingDocumentDetailInput): ConciliarDocumentDetail {
  const warnings = [...(input.avisos ?? [])]
  const nominalCentimos = cents(input.nominalCentimos)
  const interesesCentimos = cents(input.interesesCentimos)
  const comisionCentimos = cents(input.comisionCentimos)
  const ivaComisionCentimos = cents(input.ivaComisionCentimos)
  const netoDocumentoCentimos = cents(input.netoDocumentoCentimos)
  const fechaLiquidacion = day(input.fechaLiquidacion)
  const bancoEmisor = bankLabel(input.banco)
  const cuentaAbono = text(input.cuentaAbono, 320)
  const proveedor = text(input.proveedor, 320)
  const numeroLiquidacion = text(input.numeroLiquidacionExplicito, 320)
  const referenciaDocumento = documentaryFilename(input.referenciaDocumento)
  const lineas = completeLines(input.lineas)
  const totalLineas = lineas ? sumCents(lineas.map(line => line.nominalCentimos)) : null
  const componentesExplicitos = nominalCentimos !== null
    && interesesCentimos !== null
    && comisionCentimos !== null
    && ivaComisionCentimos !== null
    && netoDocumentoCentimos !== null
  const totalComponentes = componentesExplicitos
    ? sumCents([interesesCentimos!, comisionCentimos!, ivaComisionCentimos!, netoDocumentoCentimos!])
    : null
  const desgloseDeduccionesExacto = totalComponentes !== null && nominalCentimos !== null && totalComponentes === nominalCentimos
  const lineasNominalesExactas = lineas !== null && totalLineas !== null && nominalCentimos !== null && totalLineas === nominalCentimos
  const cuadreExacto = input.estadoDocumental === 'CUADRA'
    && input.snapshotExplicito
    && componentesExplicitos
    && desgloseDeduccionesExacto
    && lineasNominalesExactas
    && netoDocumentoCentimos === input.importeBancoCentimos

  if (input.estadoDocumental !== 'CUADRA') addWarning(warnings, 'La liquidación está marcada para revisión documental.')
  if (!input.snapshotExplicito) addWarning(warnings, 'La evidencia documental no conserva un snapshot explícito verificable.')
  if (!numeroLiquidacion) addWarning(warnings, 'No se ha declarado un número de liquidación.')
  if (!fechaLiquidacion) addWarning(warnings, 'Falta la fecha documental de liquidación.')
  if (!bancoEmisor) addWarning(warnings, 'Falta el banco emisor declarado en la liquidación.')
  if (!cuentaAbono) addWarning(warnings, 'Falta la cuenta de abono depositaria declarada.')
  if (nominalCentimos === null) addWarning(warnings, 'Falta el nominal documental de la liquidación.')
  if (interesesCentimos === null) addWarning(warnings, 'Falta el interés explícito de la liquidación.')
  if (comisionCentimos === null) addWarning(warnings, 'Falta la comisión explícita de la liquidación.')
  if (ivaComisionCentimos === null) addWarning(warnings, 'Falta el IVA explícito de la comisión.')
  if (netoDocumentoCentimos === null) addWarning(warnings, 'Falta el neto documental de la liquidación.')
  if (!lineas) addWarning(warnings, 'La composición de facturas no es íntegra; no se publica un subconjunto.')
  else if (!lineas.length) addWarning(warnings, 'La liquidación no conserva facturas documentales.')
  else if (lineas.some(line => line.fechaEmision === null)) addWarning(warnings, 'Falta la fecha de emisión en una o más facturas documentales.')
  if (lineas !== null && !lineasNominalesExactas) {
    addWarning(warnings, 'La suma de las facturas documentales no coincide con el nominal declarado.')
  }
  if (componentesExplicitos && !desgloseDeduccionesExacto) {
    addWarning(warnings, 'El nominal documental no coincide con la suma explícita de deducciones y neto.')
  }
  if (netoDocumentoCentimos === null || netoDocumentoCentimos !== input.importeBancoCentimos) {
    addWarning(warnings, 'El neto documental no coincide exactamente en céntimos con el abono bancario.')
  }

  return {
    rowId: input.rowId,
    kind: 'CONFIRMING',
    titulo: bancoEmisor ? `Liquidación confirming ${bancoEmisor}` : 'Liquidación confirming',
    bancoEmisor,
    numeroLiquidacion,
    referenciaDocumento,
    fechaLiquidacion,
    cuentaAbono,
    proveedor,
    numeroFactura: null,
    fechaFactura: null,
    importeFacturaCentimos: null,
    lineas: lineas ?? [],
    nominalCentimos,
    interesesCentimos,
    comisionCentimos,
    ivaComisionCentimos,
    netoDocumentoCentimos,
    importeBancoCentimos: input.importeBancoCentimos,
    // No se infiere ningún componente: el verde exige evidencia documental
    // explícita, íntegra y consistente además del mismo neto en el banco.
    cuadreExacto,
    avisos: warnings,
    pdfHref: input.pdfHref,
  }
}

export type RemittanceDocumentDetailInput = Readonly<{
  rowId: string
  fechaAbono: string | null
  banco: string | null
  cuenta: string | null
  importeBancoCentimos: number
  lineas: readonly ConciliarDocumentDetailLine[] | null
  avisos: readonly string[]
}>

/** La remesa sólo se considera cerrada si su composición completa suma el abono concreto. */
export function buildRemittanceDocumentDetail(input: RemittanceDocumentDetailInput): ConciliarDocumentDetail {
  const warnings = [...input.avisos]
  const lineas = input.lineas
  const nominalCentimos = lineas ? sumCents(lineas.map(line => line.nominalCentimos)) : null
  if (!lineas) addWarning(warnings, 'No hay una composición íntegra persistida de la remesa para este abono.')
  else if (!lineas.length) addWarning(warnings, 'La remesa no conserva recibos documentales.')
  if (nominalCentimos === null || nominalCentimos !== input.importeBancoCentimos) {
    addWarning(warnings, 'La suma de recibos de la remesa no coincide exactamente con el abono bancario.')
  }
  return {
    rowId: input.rowId,
    kind: 'REMESA',
    titulo: 'Remesa documentada',
    bancoEmisor: input.banco,
    numeroLiquidacion: null,
    referenciaDocumento: null,
    fechaLiquidacion: input.fechaAbono,
    cuentaAbono: input.cuenta,
    proveedor: null,
    numeroFactura: null,
    fechaFactura: null,
    importeFacturaCentimos: null,
    lineas: lineas ?? [],
    nominalCentimos,
    interesesCentimos: null,
    comisionCentimos: null,
    ivaComisionCentimos: null,
    netoDocumentoCentimos: nominalCentimos,
    importeBancoCentimos: input.importeBancoCentimos,
    cuadreExacto: nominalCentimos !== null && nominalCentimos === input.importeBancoCentimos,
    avisos: warnings,
    pdfHref: null,
  }
}

type RawConfirmingLiquidation = Readonly<{
  liquidacionId: unknown
  confirmingId: unknown
  liquidacionKey: unknown
  banco: unknown
  estadoDocumental: unknown
  fechaLiquidacion: unknown
  cuentaDepositariaId: unknown
  cuentaIban: unknown
  nominalCentimos: unknown
  interesesCentimos: unknown
  comisionCentimos: unknown
  ivaComisionCentimos: unknown
  deduccionTotalCentimos: unknown
  netoBancarioCentimos: unknown
  sourceHash: unknown
  sourceSnapshot: unknown
  proveedor: unknown
}>
type RawConfirmingDetailBundle = RawConfirmingLiquidation & Readonly<{
  documents: unknown
  lines: unknown
}>

type RawConfirmingDocument = Readonly<{
  rol: unknown
  nombreOriginal: unknown
  facturaRecibidaId: unknown
  hashBinario: unknown
  procedencia: unknown
  archivoControladoId: unknown
  oneDriveDriveId: unknown
  oneDriveItemId: unknown
}>
type RawConfirmingLine = Readonly<{
  confirmingLineaId: unknown
  facturaEmitidaId: unknown
  numeroFactura: unknown
  cliente: unknown
  fechaEmision: unknown
  fechaVencimiento: unknown
  nominalCentimos: unknown
  interesesExplicitosCentimos: unknown
  comisionExplicitaCentimos: unknown
}>

function hasOwn(record: Raw, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function sameRequiredText(snapshotValue: unknown, storedValue: unknown, max = 320): boolean {
  const snapshotText = text(snapshotValue, max)
  const storedText = text(storedValue, max)
  return snapshotText !== null && storedText !== null && snapshotText === storedText
}

function sameNullableText(snapshotValue: unknown, storedValue: unknown, max = 320): boolean {
  if (snapshotValue === null) return storedValue === null || storedValue === undefined
  return sameRequiredText(snapshotValue, storedValue, max)
}

function sameRequiredDay(snapshotValue: unknown, storedValue: unknown): boolean {
  const snapshotDay = day(snapshotValue)
  const storedDay = day(storedValue)
  return snapshotDay !== null && storedDay !== null && snapshotDay === storedDay
}

function sameNullableDay(snapshotValue: unknown, storedValue: unknown): boolean {
  if (snapshotValue === null) return storedValue === null || storedValue === undefined
  return sameRequiredDay(snapshotValue, storedValue)
}

function sameRequiredCents(snapshotValue: unknown, storedValue: unknown): boolean {
  const snapshotCents = cents(snapshotValue)
  const storedCents = cents(storedValue)
  return snapshotCents !== null && storedCents !== null && snapshotCents === storedCents
}

function sameNullableCents(snapshotValue: unknown, storedValue: unknown): boolean {
  if (snapshotValue === null) return storedValue === null || storedValue === undefined
  return sameRequiredCents(snapshotValue, storedValue)
}

function snapshotDocumentMatches(document: Raw, stored: RawConfirmingDocument): boolean {
  return sameRequiredText(document.rol, stored.rol, 80)
    && sameRequiredText(document.facturaRecibidaId, stored.facturaRecibidaId, 220)
    && sameRequiredText(document.hashBinario, stored.hashBinario, 80)
    && sameRequiredText(document.procedencia, stored.procedencia, 80)
    && sameRequiredText(document.archivoControladoId, stored.archivoControladoId, 220)
    && sameNullableText(document.oneDriveDriveId, stored.oneDriveDriveId, 220)
    && sameNullableText(document.oneDriveItemId, stored.oneDriveItemId, 220)
    && sameNullableText(document.nombreOriginal, stored.nombreOriginal, 320)
}

function snapshotLineMatches(line: Raw, stored: RawConfirmingLine): boolean {
  return sameNullableText(line.confirmingLineaId, stored.confirmingLineaId, 220)
    && sameRequiredText(line.facturaEmitidaId, stored.facturaEmitidaId, 220)
    && sameRequiredText(line.numeroFactura, stored.numeroFactura, 320)
    && sameRequiredCents(line.nominalCentimos, stored.nominalCentimos)
    && sameRequiredDay(line.fechaEmision, stored.fechaEmision)
    && sameNullableDay(line.fechaVencimiento, stored.fechaVencimiento)
    && sameNullableCents(line.interesesExplicitosCentimos, stored.interesesExplicitosCentimos)
    && sameNullableCents(line.comisionExplicitaCentimos, stored.comisionExplicitaCentimos)
}

/** Comprueba el snapshot que realmente crea confirming-liquidation-persist.ts. */
function snapshotHasExplicitEvidence(
  snapshot: Raw | null,
  liquidation: RawConfirmingLiquidation,
  documents: readonly RawConfirmingDocument[],
  lines: readonly RawConfirmingLine[],
): boolean {
  if (!snapshot) return false
  const rootKeys = ['schema', 'liquidacionKey', 'confirmingId', 'banco', 'fechaLiquidacion', 'cuentaDepositariaId', 'sourceHash', 'documentos', 'resumen', 'lineas']
  if (!rootKeys.every(key => hasOwn(snapshot, key))
    || snapshot.schema !== 'CONFIRMING_LIQUIDATION_DOCUMENTAL_V1'
    || !sameRequiredText(snapshot.liquidacionKey, liquidation.liquidacionKey, 160)
    || !sameRequiredText(snapshot.confirmingId, liquidation.confirmingId, 220)
    || !sameRequiredText(snapshot.banco, liquidation.banco, 80)
    || !sameRequiredDay(snapshot.fechaLiquidacion, liquidation.fechaLiquidacion)
    || !sameRequiredText(snapshot.cuentaDepositariaId, liquidation.cuentaDepositariaId, 220)
    || !sameRequiredText(snapshot.sourceHash, liquidation.sourceHash, 80)) return false

  const summary = object(snapshot.resumen)
  if (!summary || !['nominalCentimos', 'interesesCentimos', 'comisionCentimos', 'ivaComisionCentimos', 'deduccionTotalCentimos', 'netoBancarioCentimos'].every(key => hasOwn(summary, key))
    || !sameRequiredCents(summary.nominalCentimos, liquidation.nominalCentimos)
    || !sameRequiredCents(summary.interesesCentimos, liquidation.interesesCentimos)
    || !sameRequiredCents(summary.comisionCentimos, liquidation.comisionCentimos)
    || !sameRequiredCents(summary.ivaComisionCentimos, liquidation.ivaComisionCentimos)
    || !sameNullableCents(summary.deduccionTotalCentimos, liquidation.deduccionTotalCentimos)
    || !sameRequiredCents(summary.netoBancarioCentimos, liquidation.netoBancarioCentimos)) return false

  const snapshotDocuments = snapshot.documentos
  const snapshotLines = snapshot.lineas
  if (!Array.isArray(snapshotDocuments) || !Array.isArray(snapshotLines) || snapshotDocuments.length !== documents.length || snapshotLines.length !== lines.length) return false
  if (!snapshotDocuments.every(item => {
    const document = object(item)
    if (!document || !['id', 'rol', 'facturaRecibidaId', 'hashBinario', 'procedencia', 'archivoControladoId', 'oneDriveDriveId', 'oneDriveItemId', 'nombreOriginal'].every(key => hasOwn(document, key))
      || !text(document.id, 220)) return false
    return documents.filter(stored => snapshotDocumentMatches(document, stored)).length === 1
  }) || !documents.every(stored => snapshotDocuments.filter(item => {
    const document = object(item)
    return document !== null && snapshotDocumentMatches(document, stored)
  }).length === 1)) return false
  const principal = snapshotDocuments.filter(item => {
    const document = object(item)
    return document?.rol === 'LIQUIDACION_PDF'
  })
  return principal.length === 1 && snapshotLines.every(item => {
    const line = object(item)
    if (!line || !['id', 'confirmingLineaId', 'facturaEmitidaId', 'numeroFactura', 'nominalCentimos', 'fechaEmision', 'fechaEmisionProcedencia', 'fechaLineaDocumental', 'fechaVencimiento', 'interesesExplicitosCentimos', 'comisionExplicitaCentimos'].every(key => hasOwn(line, key))
      || !text(line.id, 220)
      || !text(line.fechaEmisionProcedencia, 80)
      || !sameNullableDay(line.fechaLineaDocumental, line.fechaLineaDocumental)) return false
    return lines.filter(stored => snapshotLineMatches(line, stored)).length === 1
  }) && lines.every(stored => snapshotLines.filter(item => {
    const line = object(item)
    return line !== null && snapshotLineMatches(line, stored)
  }).length === 1)
}

async function readConfirmingDocumentDetail(
  row: ReturnType<typeof projectionRow>,
  client: DetailDatabase,
): Promise<ConciliarDocumentDetail> {
  const source = row.source
  if (source.kind !== 'COBRO_CONFIRMING' || !source.confirmingId || !source.confirmingSourceHash || !SHA256.test(source.confirmingSourceHash)) {
    fail(409, 'DETALLE_CONFIRMING_SIN_HUELLA', 'La fila confirming no conserva una huella documental vigente.')
  }
  const sourceHash = source.confirmingSourceHash
  /**
   * Una única ampliación C11 tras la proyección: cada subconsulta correlacionada
   * conserva su límite propio antes de agregarse, por lo que no multiplica
   * documentos por líneas ni publica una composición truncada.
   */
  const liquidations = await client.$queryRaw<RawConfirmingDetailBundle[]>(Prisma.sql`
    SELECT l.id::text AS "liquidacionId",l.confirming_id AS "confirmingId",l.liquidacion_key AS "liquidacionKey",
      l.banco::text AS banco,l.estado_documental::text AS "estadoDocumental",
      l.fecha_liquidacion::date::text AS "fechaLiquidacion",l.cuenta_depositaria_id AS "cuentaDepositariaId",ca.iban AS "cuentaIban",
      l.nominal_centimos AS "nominalCentimos",l.intereses_centimos AS "interesesCentimos",l.comision_centimos AS "comisionCentimos",
      l.iva_comision_centimos AS "ivaComisionCentimos",l.deduccion_total_centimos AS "deduccionTotalCentimos",l.neto_bancario_centimos AS "netoBancarioCentimos",
      l.fuente_hash AS "sourceHash",l.fuente_snapshot AS "sourceSnapshot",fr.proveedor,
      (
        SELECT COALESCE(json_agg(row_to_json(document) ORDER BY document.rol),'[]'::json)
        FROM (
          SELECT d.rol::text AS rol,d.nombre_original AS "nombreOriginal",d.factura_recibida_id AS "facturaRecibidaId",
            d.hash_binario AS "hashBinario",d.procedencia::text AS procedencia,d.archivo_controlado_id AS "archivoControladoId",
            d.onedrive_drive_id AS "oneDriveDriveId",d.onedrive_item_id AS "oneDriveItemId"
          FROM documentos_liquidacion_confirming d
          WHERE d.liquidacion_id=l.id
          ORDER BY d.rol ASC
          LIMIT 4
        ) document
      ) AS documents,
      (
        SELECT COALESCE(json_agg(row_to_json(line) ORDER BY line."orderId"),'[]'::json)
        FROM (
          SELECT lc.id::text AS "orderId",lc.confirming_linea_id AS "confirmingLineaId",lc.factura_emitida_id AS "facturaEmitidaId",
            lc.numero_factura AS "numeroFactura",fi.cliente,lc.fecha_emision::date::text AS "fechaEmision",
            lc.fecha_vencimiento::date::text AS "fechaVencimiento",lc.nominal_centimos AS "nominalCentimos",
            lc.intereses_explicitos_centimos AS "interesesExplicitosCentimos",lc.comision_explicita_centimos AS "comisionExplicitaCentimos"
          FROM lineas_liquidacion_confirming lc
          LEFT JOIN facturas_emitidas fi ON fi.id=lc.factura_emitida_id
          WHERE lc.liquidacion_id=l.id
          ORDER BY lc.id ASC
          LIMIT ${MAX_DETAIL_LINES + 1}
        ) line
      ) AS lines
    FROM liquidaciones_confirming_documentales l
    LEFT JOIN cuentas_bancarias ca ON ca.id=l.cuenta_depositaria_id
    LEFT JOIN facturas_recibidas fr ON fr.id=l.confirming_id
    WHERE l.confirming_id=${source.confirmingId}
      AND l.fuente_hash=${sourceHash}
      AND NOT EXISTS (
        SELECT 1
        FROM liquidaciones_confirming_documentales l2
        WHERE l2.confirming_id=l.confirming_id
          AND l2.liquidacion_key=l.liquidacion_key
          AND l2.version>l.version
      )
    ORDER BY l.liquidacion_key ASC,l.id ASC
    LIMIT 2
  `)
  if (liquidations.length !== 1) {
    fail(409, 'DETALLE_FUENTE_CAMBIADA', 'La evidencia confirming cambió; actualiza la lista antes de abrir el detalle.')
  }
  const liquidation = liquidations[0]!
  const liquidationId = text(liquidation.liquidacionId, 64)
  if (!liquidationId) fail(409, 'DETALLE_C11_CORRUPTO', 'La liquidación documental no conserva una identidad verificable.')

  const documentRows = objects(liquidation.documents)
  const lineRows = objects(liquidation.lines)
  if (!documentRows || !lineRows) {
    fail(409, 'DETALLE_C11_INCOMPLETO', 'El detalle C11 no conserva una composición íntegra verificable.')
  }
  const documents: RawConfirmingDocument[] = documentRows.map(item => ({
    rol: item.rol,
    nombreOriginal: item.nombreOriginal,
    facturaRecibidaId: item.facturaRecibidaId,
    hashBinario: item.hashBinario,
    procedencia: item.procedencia,
    archivoControladoId: item.archivoControladoId,
    oneDriveDriveId: item.oneDriveDriveId,
    oneDriveItemId: item.oneDriveItemId,
  }))
  const lines: RawConfirmingLine[] = lineRows.map(item => ({
    confirmingLineaId: item.confirmingLineaId,
    facturaEmitidaId: item.facturaEmitidaId,
    numeroFactura: item.numeroFactura,
    cliente: item.cliente,
    fechaEmision: item.fechaEmision,
    fechaVencimiento: item.fechaVencimiento,
    nominalCentimos: item.nominalCentimos,
    interesesExplicitosCentimos: item.interesesExplicitosCentimos,
    comisionExplicitaCentimos: item.comisionExplicitaCentimos,
  }))
  if (documents.length > 3 || lines.length > MAX_DETAIL_LINES) {
    fail(409, 'DETALLE_C11_INCOMPLETO', 'El detalle C11 supera el límite íntegro de lectura y no se muestra parcialmente.')
  }
  const warnings: string[] = []
  const document = documents.find(item => item.rol === 'LIQUIDACION_PDF')
  if (!document) addWarning(warnings, 'Falta el documento principal de liquidación en la evidencia C11.')
  const sourceSnapshot = object(liquidation.sourceSnapshot)
  const snapshotExplicito = snapshotHasExplicitEvidence(sourceSnapshot, liquidation, documents, lines)
  if (sourceSnapshot && sourceSnapshot.sourceHash !== sourceHash) {
    fail(409, 'DETALLE_FUENTE_CAMBIADA', 'El snapshot de la liquidación ya no coincide con la huella documental vigente.')
  }
  // C11 conserva una cuenta depositaria explícita. Se muestra su IBAN, no un
  // alias ni el banco emisor de la liquidación (pueden ser bancos distintos).
  const cuentaAbono = text(liquidation.cuentaIban, 320)
  return buildConfirmingDocumentDetail({
    rowId: row.id,
    importeBancoCentimos: row.importeCentimos,
    pdfHref: privatePdfHref(row),
    banco: liquidation.banco,
    cuentaAbono,
    proveedor: liquidation.proveedor,
    fechaLiquidacion: liquidation.fechaLiquidacion,
    nominalCentimos: liquidation.nominalCentimos,
    interesesCentimos: liquidation.interesesCentimos,
    comisionCentimos: liquidation.comisionCentimos,
    ivaComisionCentimos: liquidation.ivaComisionCentimos,
    netoDocumentoCentimos: liquidation.netoBancarioCentimos,
    estadoDocumental: liquidation.estadoDocumental,
    snapshotExplicito,
    // El formato de snapshot C11 no contiene número de liquidación. No se
    // reutilizan liquidacion_key, UUID ni el nombre del archivo como número.
    numeroLiquidacionExplicito: null,
    referenciaDocumento: document?.nombreOriginal ?? null,
    lineas: lines.map(line => ({
      numero: line.numeroFactura,
      cliente: line.cliente,
      fechaEmision: line.fechaEmision,
      fechaVencimiento: line.fechaVencimiento,
      nominalCentimos: line.nominalCentimos,
    })),
    avisos: warnings,
  })
}

type RawSupplierInvoice = Readonly<{
  numeroFactura: unknown
  proveedor: unknown
  fechaFactura: unknown
  fechaVencimiento: unknown
  totalTexto: unknown
}>

async function readSupplierInvoiceDocumentDetail(
  row: ReturnType<typeof projectionRow>,
  client: DetailDatabase,
): Promise<ConciliarDocumentDetail> {
  const source = row.source
  if (source.kind !== 'PAGO_FACTURA_RECIBIDA' || !source.facturaRecibidaId) {
    fail(409, 'DETALLE_FACTURA_SIN_FUENTE', 'La fila no conserva una factura recibida verificable.')
  }
  const invoices = await client.$queryRaw<RawSupplierInvoice[]>(Prisma.sql`
    SELECT fr.num_factura AS "numeroFactura",fr.proveedor,fr.fecha::date::text AS "fechaFactura",
      fr.fecha_vencimiento::date::text AS "fechaVencimiento",fr.total::text AS "totalTexto"
    FROM facturas_recibidas fr
    WHERE fr.id=${source.facturaRecibidaId}
    LIMIT 2
  `)
  if (invoices.length !== 1) fail(409, 'DETALLE_FUENTE_CAMBIADA', 'La factura recibida ya no está disponible en esta fila; actualiza la lista.')
  const invoice = invoices[0]!
  const warnings: string[] = []
  const importeFacturaCentimos = moneyCents(invoice.totalTexto)
  const netoDocumentoCentimos = importeFacturaCentimos === null ? null : -importeFacturaCentimos
  if (importeFacturaCentimos === null) addWarning(warnings, 'La factura no conserva un nominal exacto en céntimos.')
  if (!text(invoice.numeroFactura, 320)) addWarning(warnings, 'La factura no conserva un número documental visible.')
  if (!text(invoice.proveedor, 320)) addWarning(warnings, 'La factura no conserva un proveedor documental visible.')
  if (!day(invoice.fechaFactura)) addWarning(warnings, 'La factura no conserva una fecha de emisión verificable.')
  if (netoDocumentoCentimos === null || netoDocumentoCentimos !== row.importeCentimos) {
    addWarning(warnings, 'El nominal firmado de la factura no coincide exactamente con el movimiento bancario.')
  }
  return {
    rowId: row.id,
    kind: 'FACTURA',
    titulo: 'Factura de proveedor',
    bancoEmisor: row.banco,
    numeroLiquidacion: null,
    referenciaDocumento: null,
    fechaLiquidacion: row.fecha,
    cuentaAbono: row.cuenta,
    proveedor: text(invoice.proveedor, 320),
    numeroFactura: text(invoice.numeroFactura, 320),
    fechaFactura: day(invoice.fechaFactura),
    importeFacturaCentimos,
    lineas: [],
    nominalCentimos: importeFacturaCentimos,
    interesesCentimos: null,
    comisionCentimos: null,
    ivaComisionCentimos: null,
    netoDocumentoCentimos,
    importeBancoCentimos: row.importeCentimos,
    cuadreExacto: netoDocumentoCentimos !== null && netoDocumentoCentimos === row.importeCentimos,
    avisos: warnings,
    pdfHref: privatePdfHref(row),
  }
}

type RawPersistedRemittanceLine = Readonly<{
  receiptCount: unknown
  receiptId: unknown
  numeroFactura: unknown
  cliente: unknown
  fechaFactura: unknown
  importeCentimos: unknown
}>

type PersistedRemittanceRead = Readonly<{ lineas: readonly ConciliarDocumentDetailLine[] | null; aviso: string | null }>

async function readPersistedRemittanceLines(
  client: DetailDatabase,
  movementId: string,
  remesaId: number | undefined,
): Promise<PersistedRemittanceRead> {
  try {
    /**
     * B7 es la única evidencia que se amplía en este detalle. La CTE evita la
     * comprobación de disponibilidad, la búsqueda de recibo y la lectura de
     * líneas en viajes seriales; no consulta propuestas, Graph ni OCR.
     * Sólo se proyectan los campos textuales que exige el DTO público.
     */
    const rows = await client.$queryRaw<RawPersistedRemittanceLine[]>(Prisma.sql`
      WITH candidatos AS (
        SELECT r.id,r.created_at
        FROM recibos_cobro_remesa_b7 r
        WHERE r.movimiento_id=${movementId}
          ${remesaId === undefined ? Prisma.empty : Prisma.sql`AND r.remesa_id=${remesaId}`}
        ORDER BY r.created_at DESC,r.id DESC
        LIMIT 2
      ), conteo AS (
        SELECT COUNT(*)::integer AS total FROM candidatos
      ), elegido AS (
        SELECT id FROM candidatos ORDER BY created_at DESC,id DESC LIMIT 1
      )
      SELECT conteo.total AS "receiptCount",elegido.id::text AS "receiptId",
        fi.num_factura AS "numeroFactura",fi.cliente,fi.fecha::date::text AS "fechaFactura",l.importe_centimos AS "importeCentimos"
      FROM conteo
      LEFT JOIN elegido ON TRUE
      LEFT JOIN lineas_recibo_cobro_remesa_b7 l ON l.recibo_id=elegido.id
      LEFT JOIN facturas_emitidas fi ON fi.id=l.factura_emitida_id
      ORDER BY l.ordinal ASC NULLS LAST
      LIMIT ${MAX_DETAIL_LINES + 1}
    `)
    const receiptCount = Number(rows[0]?.receiptCount)
    if (!Number.isSafeInteger(receiptCount) || receiptCount < 0) return { lineas: null, aviso: 'El recibo persistido no conserva un conteo verificable.' }
    if (receiptCount === 0) return { lineas: null, aviso: 'No existe un recibo de remesa persistido para este abono.' }
    if (receiptCount !== 1) return { lineas: null, aviso: 'Hay más de un recibo persistido para este abono; requiere revisión humana.' }
    const receiptId = text(rows[0]?.receiptId, 64)
    if (!receiptId || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(receiptId)) return { lineas: null, aviso: 'El recibo persistido no conserva una identidad verificable.' }
    if (rows.length > MAX_DETAIL_LINES) return { lineas: null, aviso: 'El recibo de remesa supera el límite íntegro de 2.000 líneas y no se muestra parcialmente.' }
    const lineas = completeLines(rows.map(item => ({
      numero: item.numeroFactura,
      cliente: item.cliente,
      fechaEmision: item.fechaFactura,
      fechaVencimiento: null,
      nominalCentimos: item.importeCentimos,
    })))
    return lineas ? { lineas, aviso: null } : { lineas: null, aviso: 'El recibo persistido no conserva una composición íntegra verificable.' }
  } catch {
    return { lineas: null, aviso: 'No se pudo leer el recibo de remesa persistido; no se muestra una composición parcial.' }
  }
}

function isRemittanceProjection(row: ReturnType<typeof projectionRow>): boolean {
  return row.source.kind === 'COBRO_PROPUESTA'
    && (row.source.remesaId !== undefined || ['REMESA_VENCIMIENTO', 'REMESA_UNION', 'REMESA_RESIDUO'].includes(row.grupo ?? ''))
}

async function readRemittanceDocumentDetail(
  row: ReturnType<typeof projectionRow>,
  client: DetailDatabase,
): Promise<ConciliarDocumentDetail> {
  const source = row.source
  const warnings: string[] = []
  addWarning(warnings, row.color === 'AMBAR' ? row.motivo : null)
  let lineas: readonly ConciliarDocumentDetailLine[] | null = null
  if (source.kind === 'COBRO_PROPUESTA' && source.movimientoId) {
    const persisted = await readPersistedRemittanceLines(client, source.movimientoId, source.remesaId)
    if (persisted.lineas) lineas = persisted.lineas
    else addWarning(warnings, persisted.aviso)
  }
  return buildRemittanceDocumentDetail({
    rowId: row.id,
    fechaAbono: row.fecha,
    banco: row.banco,
    cuenta: row.cuenta,
    importeBancoCentimos: row.importeCentimos,
    lineas,
    avisos: warnings,
  })
}

function genericDocumentDetail(row: ReturnType<typeof projectionRow>): ConciliarDocumentDetail {
  const documentAmount = row.documento?.importeCentimos ?? null
  const warnings: string[] = []
  addWarning(warnings, row.motivo)
  addWarning(warnings, 'La fila no conserva un detalle documental específico.')
  if (documentAmount === null || documentAmount !== row.importeCentimos) {
    addWarning(warnings, 'El documento disponible no coincide exactamente con el importe bancario.')
  }
  return {
    rowId: row.id,
    kind: 'OTRO',
    titulo: row.documento?.referencia ?? 'Documento de conciliación',
    bancoEmisor: row.banco,
    numeroLiquidacion: null,
    referenciaDocumento: null,
    fechaLiquidacion: row.fecha,
    cuentaAbono: row.cuenta,
    proveedor: row.documento?.tercero ?? null,
    numeroFactura: null,
    fechaFactura: row.documento?.fecha ?? null,
    importeFacturaCentimos: null,
    lineas: [],
    nominalCentimos: documentAmount,
    interesesCentimos: null,
    comisionCentimos: null,
    ivaComisionCentimos: null,
    netoDocumentoCentimos: documentAmount,
    importeBancoCentimos: row.importeCentimos,
    cuadreExacto: documentAmount !== null && documentAmount === row.importeCentimos,
    avisos: warnings,
    pdfHref: privatePdfHref(row),
  }
}

/**
 * Lector individual de detalle. La selección parte sólo de la proyección ya
 * persistida; nunca acepta source IDs, importes, URLs o localizadores del cliente.
 */
export async function readConciliarDocumentDetail(
  rowId: string,
  actorId: number,
  client: DetailDatabase = database(),
): Promise<ConciliarDocumentDetail> {
  if (!CONCILIAR_DOCUMENT_DETAIL_ROW_ID.test(rowId)) fail(400, 'FILA_INVALIDA', 'La fila solicitada no es válida.')
  assertConciliarDocumentDetailActor(actorId)
  /**
   * Proyección mínima del detalle: identidad opaca, importes/etiquetas visibles,
   * documento privado, source sellada y su versión. No se seleccionan ni se
   * reciben del navegador URLs externas, hashes o IDs documentales. Esta lectura
   * inicial es la única que decide qué ampliación de BD corresponde a la fila.
   */
  const rows = await client.$queryRaw<ProjectionSqlRow[]>(Prisma.sql`
    SELECT id,movimiento_id,fecha,concepto,banco,cuenta,importe_centimos,pendiente_centimos,color,grupo,motivo,
      documento,propuesta,seleccionable,diferencia_centimos,links_movimiento,detail,tab,source,source_fingerprint,updated_at
    FROM conciliar_proyecciones
    WHERE id=${rowId}
    LIMIT 1
  `)
  if (rows.length !== 1) fail(404, 'FILA_NO_ENCONTRADA', 'La fila ya no está disponible; actualiza la lista.')
  const row = projectionRow(rows[0]!)
  if (row.source.kind === 'COBRO_CONFIRMING') return readConfirmingDocumentDetail(row, client)
  if (row.source.kind === 'PAGO_FACTURA_RECIBIDA') return readSupplierInvoiceDocumentDetail(row, client)
  if (isRemittanceProjection(row)) return readRemittanceDocumentDetail(row, client)
  return genericDocumentDetail(row)
}

export function isConciliarDocumentDetailReadError(error: unknown): error is ConciliarDocumentDetailError | ConciliarDbError {
  return error instanceof ConciliarDocumentDetailError || error instanceof ConciliarDbError
}
