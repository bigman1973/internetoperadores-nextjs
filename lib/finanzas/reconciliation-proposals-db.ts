/*
 * B6 proposal adapter — integration draft only (not copied into the repository).
 *
 * GET path only: no DML, no wrapper creation, no B4 confirmation, no legacy
 * conciliado/cobrado/pagado mutation, no sync. `proponerConciliacionB6` remains
 * pure. B4 is re-read at confirmation and is the only financial authority.
 */
import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { convertirImporteUiACentimos } from '@/lib/finanzas/reconciliation-core'
import { B4ServiceError, readConciliacionB4 } from '@/lib/finanzas/reconciliation-db'
import {
  extraerReferenciasFacturaLiterales,
  normalizarTerceroExacto,
  proponerConciliacionB6,
  type DiferenciaConocidaB6,
  type DocumentoConciliableB6,
  type EntradaPropuestaB6,
  type ParejaTraspasoPropioB6,
} from '@/lib/finanzas/reconciliation-proposals'

const CANDIDATE_LIMIT = 201 // 200 displayable candidates + one truncation sentinel
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type KnownOwnAccounts = ReadonlySet<string>
type CandidateRow = {
  id: string; tipo: 'FACTURA_EMITIDA' | 'FACTURA_RECIBIDA'; objetivoCentimos: number | null
  asignadoCentimos: bigint | number | string | null; activo: boolean; version: number
  facturaEmitidaId: string | null; facturaRecibidaId: string | null
  numero: string | null; tercero: string | null; fecha: string | null
  totalDecimal: string | null; ispFacturaId: number | null; ispTotalDecimal: string | null; calidad: string | null; copiaDeId: string | null
  conflictoIdentidad: boolean | null; duplicadoExterno: boolean | null
}
type BankRow = {
  id: string; fecha: string; concepto: string; referencia: string | null
  infoAdicional: string | null; tercero: string | null; cuentaId: string; importeDecimal: string
}
type PairRow = { movimientoParejaId: string; cuentaOrigenId: string; cuentaDestinoId: string; fecha: string; importeParejaDecimal: string }

export class B6ProposalServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
  }
}
function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new B6ProposalServiceError(status, code, message, details)
}
function centsFromDecimalText(value: string, field: string): number {
  const result = convertirImporteUiACentimos(value)
  if (!result.ok) fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no es convertible exactamente a céntimos B4.`, 'errors' in result?result.errors:undefined)
  return result.value
}
function nonZeroCentsFromDecimalText(value: string, field: string): number | null {
  if (/^[+-]?0(?:[.,]0+)?$/.test(value.trim())) return null
  return centsFromDecimalText(value, field)
}
function asSafeInt(value: bigint | number | string | null, field: string): number {
  const text = value === null ? '0' : String(value)
  if (!/^-?\d+$/.test(text)) fail(500, 'LECTURA_B4_CORRUPTA', `${field} no es entero B4.`)
  const result = Number(text)
  if (!Number.isSafeInteger(result) || result < -2147483648 || result > 2147483647) fail(500, 'LECTURA_B4_CORRUPTA', `${field} sale del rango B4.`)
  return result
}
function bankText(row: BankRow): string { return [row.concepto, row.referencia ?? '', row.infoAdicional ?? ''].join('\n') }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
function fingerprint(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex') }

/** No fuzzy rule: an abbreviated bank party is deliberately not enough. */
function explicitConfirmingDraxton(row: BankRow): boolean {
  const labelled = /\b(?:CESI[ÓO]N\s+DE\s+CR[EÉ]DITOS|ANTICIPS?\s+CONFIRMING|CONFIRMING)\b/iu.test(bankText(row))
  const exactLegalParty = row.tercero !== null
    && normalizarTerceroExacto(row.tercero) === normalizarTerceroExacto('Draxton Europe Asia SL')
  return labelled && exactLegalParty
}

function requiredRemittanceEvidence(row: BankRow): 'ABONO_SEPA' | 'DEVOLUCION_REMESA' | undefined {
  const text = bankText(row)
  if (/\bDEVOLUCI[ÓO]N\s+(?:DE\s+)?RECIBO\b/iu.test(text)) return 'DEVOLUCION_REMESA'
  if (/\b(?:EMISI[ÓO]N\s+REMESA\s+SEPA|ABONO\s+SEPA)\b/iu.test(text)) return 'ABONO_SEPA'
  return undefined
}

/** Requires the word INTERESES and its own explicit signed decimal; no residual is parsed. */
function explicitInterest(row: BankRow): DiferenciaConocidaB6[] {
  const matches = [...bankText(row).matchAll(/\bINTERESES?\b\s*[:=]?\s*([+-]\s*(?:\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2}?)))/giu)]
  if (matches.length !== 1) return []
  const raw = matches[0][1].replace(/\s+/g, '')
  const cents = nonZeroCentsFromDecimalText(raw, 'intereses explícitos del extracto')
  if (cents === null) return []
  const quote = matches[0][0].trim().slice(0, 160)
  return [{ movimientoId: row.id, motivo: 'INTERESES', importeCentimos: cents, evidenciaId: `BANCO:${row.id}:INTERESES:${quote}` }]
}

async function readBankRow(movimientoId: string): Promise<BankRow> {
  const rows = await prisma.$queryRaw<BankRow[]>(Prisma.sql`
    SELECT m.id, m.fecha_operacion::date::text AS fecha, m.concepto,
      m.referencia, m.info_adicional AS "infoAdicional", m.tercero,
      m.cuenta_id AS "cuentaId", m.importe::text AS "importeDecimal"
    FROM movimientos_bancarios m
    WHERE m.id = ${movimientoId}
    LIMIT 2
  `)
  if (rows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
  return rows[0]
}

/*
 * Both FI/FR joins use source amount::text and compare against the B4 target
 * stored today. This does not trust a legacy Float serialised by Prisma. FR is
 * additionally filtered/staled by B2 canonical-source requirements.
 */
const candidateProjection = Prisma.sql`
  SELECT d.id, d.tipo::text AS tipo, d.importe_objetivo_centimos AS "objetivoCentimos",
    COALESCE(SUM(v.importe_centimos) FILTER (WHERE v.activo), 0) AS "asignadoCentimos",
    d.activo, d.version, d.factura_emitida_id AS "facturaEmitidaId", d.factura_recibida_id AS "facturaRecibidaId",
    CASE WHEN d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" THEN fe.num_factura ELSE fr.num_factura END AS numero,
    CASE WHEN d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" THEN fe.cliente ELSE fr.proveedor END AS tercero,
    CASE WHEN d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" THEN fe.fecha::date::text ELSE fr.fecha::date::text END AS fecha,
    CASE WHEN d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" THEN fe.total::text ELSE fr.total::text END AS "totalDecimal",
    fe.factura_isp_id AS "ispFacturaId", fi.total::text AS "ispTotalDecimal",
    fr.calidad::text AS calidad, fr.copia_de_id AS "copiaDeId", fr.conflicto_identidad AS "conflictoIdentidad", fr.duplicado_externo AS "duplicadoExterno"
  FROM documentos_conciliables d
  LEFT JOIN facturas_emitidas fe ON fe.id = d.factura_emitida_id
  LEFT JOIN facturas_recibidas fr ON fr.id = d.factura_recibida_id
  LEFT JOIN facturas fi ON fi.id = fe.factura_isp_id
  LEFT JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id = d.id
  WHERE d.activo = true
    AND d.tipo IN ('FACTURA_EMITIDA'::"TipoDocumentoConciliable", 'FACTURA_RECIBIDA'::"TipoDocumentoConciliable")
`

async function literalCandidates(texto: string): Promise<CandidateRow[]> {
  return prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    ${candidateProjection}
    AND (
      (d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" AND fe.num_factura IS NOT NULL AND btrim(fe.num_factura)<>'' AND (btrim(fe.num_factura)!~'^[0-9]+$' OR length(btrim(fe.num_factura))>=6)
        AND strpos(upper(${texto}), upper(btrim(fe.num_factura))) > 0)
      OR
      (d.tipo = 'FACTURA_RECIBIDA'::"TipoDocumentoConciliable" AND fr.num_factura IS NOT NULL AND btrim(fr.num_factura)<>'' AND (btrim(fr.num_factura)!~'^[0-9]+$' OR length(btrim(fr.num_factura))>=6)
        AND strpos(upper(${texto}), upper(btrim(fr.num_factura))) > 0)
    )
    GROUP BY d.id, fe.id, fr.id, fi.id
    ORDER BY d.id ASC
    LIMIT ${CANDIDATE_LIMIT}
  `)
}

/* Conservative SQL prefilter for the same normalization that engine.ts repeats.
 * A Unicode form SQL cannot preserve is a false negative, never a fuzzy match. */
const partyNorm = (column: Prisma.Sql) => Prisma.sql`upper(regexp_replace(translate(btrim(${column}),
  'ÁÀÄÂÉÈËÊÍÌÏÎÓÒÖÔÚÙÜÛÑÇáàäâéèëêíìïîóòöôúùüûñç',
  'AAAAEEEEIIIIOOOOUUUUNCaaaaeeeeiiiioooouuuunc'), '[[:space:]]+', ' ', 'g'))`

async function sameDayCandidates(row: BankRow, importeCentimos: number, terceroNormalizado: string): Promise<CandidateRow[]> {
  return prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    ${candidateProjection}
    AND (
      (d.tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" AND fe.fecha::date = ${row.fecha}::date AND ${partyNorm(Prisma.raw('fe.cliente'))} = ${terceroNormalizado})
      OR (d.tipo = 'FACTURA_RECIBIDA'::"TipoDocumentoConciliable" AND fr.fecha::date = ${row.fecha}::date AND ${partyNorm(Prisma.raw('fr.proveedor'))} = ${terceroNormalizado})
    )
    GROUP BY d.id, fe.id, fr.id, fi.id
    HAVING d.importe_objetivo_centimos::bigint - COALESCE(SUM(v.importe_centimos) FILTER (WHERE v.activo), 0) = ${importeCentimos}::bigint
    ORDER BY d.id ASC
    LIMIT ${CANDIDATE_LIMIT}
  `)
}

/** Converts exact source metadata to engine DTO; a stale/invalid source is never usable. */
function candidateToDocument(row: CandidateRow): DocumentoConciliableB6 {
  let stale = !row.activo || row.objetivoCentimos === null || row.totalDecimal === null
  let sourceGoal: number | null = null
  if (!stale) {
    try {
      const sourceCents = centsFromDecimalText(row.totalDecimal!, `fuente ${row.id}.total`)
      sourceGoal = row.tipo === 'FACTURA_RECIBIDA' ? -sourceCents : sourceCents
      // B4's explicit nullable map is never guessed from idExterno. When it is
      // present it must still reference an exact equal ISP source amount.
      if (row.tipo === 'FACTURA_EMITIDA' && row.ispFacturaId !== null && (
        row.ispTotalDecimal === null || centsFromDecimalText(row.ispTotalDecimal, `factura ISP ${row.ispFacturaId}.total`) !== sourceCents
      )) stale = true
    } catch { stale = true }
  }
  if (sourceGoal === null || sourceGoal !== row.objetivoCentimos) stale = true
  if (row.tipo === 'FACTURA_RECIBIDA' && (row.calidad !== 'VALIDA' || row.copiaDeId !== null || row.conflictoIdentidad === true || row.duplicadoExterno === true || ['ERROR_OCR', 'DESCONOCIDO'].includes(String(row.tercero ?? '').trim().toUpperCase()))) stale = true
  return {
    documentoConciliableId: row.id,
    tipoDocumento: row.tipo,
    stale,
    objetivoCentimos: row.objetivoCentimos,
    asignadoCentimos: asSafeInt(row.asignadoCentimos, `documento ${row.id}.asignadoCentimos`),
    factura: { source: row.tipo === 'FACTURA_EMITIDA' ? 'FI' : 'FR', numero: row.numero, tercero: row.tercero, fecha: row.fecha },
  }
}

async function confirmedTransferPairs(row: BankRow, knownOwnAccounts: KnownOwnAccounts): Promise<ParejaTraspasoPropioB6[]> {
  if (knownOwnAccounts.size === 0) return [] // account ownership is not inferred from CuentaBancaria.
  const pairs = await prisma.$queryRaw<PairRow[]>(Prisma.sql`
    SELECT CASE WHEN t.movimiento_origen_id = ${row.id} THEN t.movimiento_destino_id ELSE t.movimiento_origen_id END AS "movimientoParejaId",
      o.cuenta_id AS "cuentaOrigenId", d.cuenta_id AS "cuentaDestinoId",
      CASE WHEN t.movimiento_origen_id = ${row.id} THEN d.fecha_operacion::date::text ELSE o.fecha_operacion::date::text END AS fecha,
      CASE WHEN t.movimiento_origen_id = ${row.id} THEN d.importe::text ELSE o.importe::text END AS "importeParejaDecimal"
    FROM traspasos_internos t
    JOIN movimientos_bancarios o ON o.id=t.movimiento_origen_id
    JOIN movimientos_bancarios d ON d.id=t.movimiento_destino_id
    WHERE t.movimiento_origen_id=${row.id} OR t.movimiento_destino_id=${row.id}
    LIMIT 2
  `)
  return pairs.flatMap(pair => {
    if (pair.fecha !== row.fecha || !knownOwnAccounts.has(pair.cuentaOrigenId) || !knownOwnAccounts.has(pair.cuentaDestinoId)) return []
    try {
      const amount = centsFromDecimalText(pair.importeParejaDecimal, 'importe de pareja TraspasoInterno')
      return [{ movimientoId: row.id, movimientoParejaId: pair.movimientoParejaId, cuentaOrigenPropiaId: pair.cuentaOrigenId, cuentaDestinoPropiaId: pair.cuentaDestinoId, fecha: pair.fecha, importeParejaCentimos: amount, evidenciaId: `TRASPASO_INTERNO:${row.id}:${pair.movimientoParejaId}` }]
    } catch { return [] }
  })
}

export type ReadProposalB6 = Readonly<{
  movimientoId: string
  fingerprintB4: string
  b4: { estado: string; version: number }
  resultado: unknown
  documentos: readonly { id: string; tipo: string; referencia: string | null; tercero: string | null; fecha: string | null; objetivoCentimos: number | null; asignadoCentimos: number; stale: boolean }[]
  advertencias: readonly string[]
}>

export async function readPropuestaConciliacionB6(movimientoId: string, knownOwnAccounts: KnownOwnAccounts = new Set()): Promise<ReadProposalB6> {
  if (typeof movimientoId !== 'string' || movimientoId.length === 0 || movimientoId.length > 160) fail(400, 'VALIDATION_ERROR', 'movimientoId no es válido.')
  // Reuses B4's current state/version projection. Its 100-document page is not
  // used as a candidate universe; all B6 candidates below are targeted and bounded.
  const b4 = await readConciliacionB4(1, 1, { movimientoId })
  const b4Movement = b4.movimientos[0]
  if (!b4Movement) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
  if(b4Movement.estado!=='SIN_DOCUMENTO')fail(409,'MOVIMIENTO_B4_CERRADO','El movimiento ya está justificado o no requiere documento; no se ofrece una nueva propuesta.')
  const bank = await readBankRow(movimientoId)
  const importeCentimos = centsFromDecimalText(bank.importeDecimal, 'movimiento.importe')
  if (importeCentimos === 0) fail(422, 'IMPORTE_FUENTE_NO_EXACTO', 'Un movimiento de 0 céntimos no admite propuesta B6.')

  const text = bankText(bank)
  const literal = await literalCandidates(text)
  const literalTruncated = literal.length === CANDIDATE_LIMIT
  // If a literal candidate exists (including a custom invoice number), do not add
  // same-day candidates that could mask ambiguity. If none exists, same-day is a
  // separately bounded exact query over date + signed remaining capacity.
  const sameDay = literal.length === 0 && bank.tercero !== null && bank.tercero.trim() !== ''
    ? await sameDayCandidates(bank, importeCentimos, normalizarTerceroExacto(bank.tercero)) : []
  const sameDayTruncated = sameDay.length === CANDIDATE_LIMIT
  const candidateRows = (literal.length ? literal : sameDay).slice(0, 200)
  const documentos = candidateRows.map(candidateToDocument)
  const truncadas = [
    ...(literalTruncated ? ['CONSULTA_REFERENCIA_LITERAL_LIMIT_201'] : []),
    ...(sameDayTruncated ? ['CONSULTA_MISMO_DIA_TERCERO_RESTANTE_LIMIT_201'] : []),
  ]

  const confirmingDraxton = explicitConfirmingDraxton(bank)
  const evidenciaRemesaObligatoria = requiredRemittanceEvidence(bank)
  const entrada: EntradaPropuestaB6 = {
    movimiento: { id: bank.id, fecha: bank.fecha, concepto: bank.concepto, referenciaBanco: bank.referencia, infoAdicional: bank.infoAdicional, tercero: bank.tercero, cuentaId: bank.cuentaId, importeCentimos, confirmingDraxton },
    documentos,
    lecturasCandidatasTruncadas: truncadas,
    evidenciaRemesaObligatoria,
    diferenciasConocidas: confirmingDraxton ? explicitInterest(bank) : [],
    // Current Remesa has no immutable foreign-ID field. Deliberately empty until
    // a reviewed source can prove a literal foreignId + bank reference + date.
    abonosSepa: [], devoluciones: [],
    parejasTraspaso: await confirmedTransferPairs(bank, knownOwnAccounts),
  }
  const proposed = proponerConciliacionB6(entrada)
  if (!proposed.ok) fail(422, 'ENTRADA_B6_INVALIDA', 'La fuente no satisface el contrato puro B6.', 'errores' in proposed?proposed.errores:undefined)
  const documentMeta = documentos.map(doc => ({
    id: doc.documentoConciliableId, tipo: doc.tipoDocumento, referencia: doc.factura?.numero ?? null,
    tercero: doc.factura?.tercero ?? null, fecha: doc.factura?.fecha ?? null,
    objetivoCentimos: doc.objetivoCentimos, asignadoCentimos: doc.asignadoCentimos, stale: doc.stale,
  }))
  const current = { movimientoId, b4Estado: b4Movement.estado, b4Version: b4Movement.version, importeCentimos, documentos: documentMeta.map(({ id, objetivoCentimos, asignadoCentimos, stale }) => ({ id, objetivoCentimos, asignadoCentimos, stale })) }
  return {
    movimientoId, fingerprintB4: fingerprint(current), b4: { estado: b4Movement.estado, version: b4Movement.version },
    resultado: proposed.value, documentos: documentMeta,
    advertencias: [
      ...(extraerReferenciasFacturaLiterales(text).length === 0 ? ['SIN_REFERENCIA_FACTURA_PATRON_ESTABLE'] : []),
      ...(!confirmingDraxton && /\b(?:CONFIRMING|CESI[ÓO]N\s+DE\s+CR[EÉ]DITOS)\b/iu.test(text) ? ['CONFIRMING_SIN_TERCERO_LEGAL_DRAXTON_EXACTO'] : []),
      ...(evidenciaRemesaObligatoria ? ['SIN_EVIDENCIA_FOREIGN_ID_REMESA_EN_MODELO_ACTUAL_NO_SE_PROPONE_ABONO_SEPA'] : []),
    ],
  }
}
