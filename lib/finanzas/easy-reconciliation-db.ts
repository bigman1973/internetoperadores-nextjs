import { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { archivoRecibidaControlado, bibliotecaFinancieraConfigurada } from '@/lib/finanzas/archivo-fuente-controlada'
import { cardFromBankText } from '@/lib/finanzas/card-holders'
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import { createDocumentoB4Tx, confirmarB4Tx, sourceEvidenceB4Tx, type B4ServiceError } from '@/lib/finanzas/reconciliation-db'
import { readEasyMovementWhoByIds } from '@/lib/finanzas/easy-counterparty-db'
import {
  EASY_MODE,
  EasyReconciliationValidationError,
  centsFromSqlText,
  isExactSuggestion,
  noRequireBankContextError,
  normalizeCounterparty,
  parseEasyRuleInput,
  parseEasyWriteInput,
  requestHash,
  sha256Canonical,
  sourceSuggestionHash,
  stableSuggestionId,
  type EasyDocumentType,
  type EasyReadInput,
  type EasyRuleInput,
  type EasyWriteInput,
  type StableSuggestionSeed,
} from '@/lib/finanzas/easy-reconciliation-core'

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx
const MAX_SUGGESTIONS_PER_MOVEMENT = 25
const MAX_RULES = 100
const MAX_MOVEMENTS_FOR_MONTHS = 10_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class EasyReconciliationServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
  }
}
function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new EasyReconciliationServiceError(status, code, message, details)
}
function isB4Error(error: unknown): error is B4ServiceError {
  return error instanceof Error && typeof (error as any).code === 'string' && typeof (error as any).status === 'number'
}
function iso(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
}
function exactInteger(value: unknown, field: string): number {
  if (typeof value === 'bigint') {
    if (value < BigInt(-2_147_483_648) || value > BigInt(2_147_483_647)) fail(422, 'CENTIMOS_FUERA_RANGO', `${field} excede el rango B4.`)
    return Number(value)
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) fail(422, 'CENTIMOS_INVALIDOS', `${field} no contiene céntimos exactos.`)
  return value
}
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function counterpartyFromMovement(row: { tercero?: unknown; concepto?: unknown }): string | null {
  return normalizeCounterparty(text(row.tercero) ?? text(row.concepto))
}
function sign(cents: number): -1 | 1 | null { return cents < 0 ? -1 : cents > 0 ? 1 : null }
function controlledTicket(driveId: unknown, itemId: unknown): boolean {
  const configuredDrive = bibliotecaFinancieraConfigurada()
  return configuredDrive !== null && driveId === configuredDrive && typeof itemId === 'string' && /^[A-Za-z0-9!_.~-]{4,220}$/.test(itemId)
}
function privateError(error: unknown): never {
  if (error instanceof EasyReconciliationServiceError || error instanceof EasyReconciliationValidationError || error instanceof PrototypeStagingError) throw error
  if (isB4Error(error)) throw new EasyReconciliationServiceError((error as any).status, (error as any).code, error.message, (error as any).details)
  throw error
}

export type EasySuggestionDto = Readonly<{
  id: string
  tipo: string
  sourceId: string
  documentoConciliableId: string | null
  referencia: string
  tercero: string | null
  fecha: string | null
  vencimiento: string | null
  importeCentimos: number
  archivoDisponible: boolean
  exacta: boolean
  archivoPrivadoHref: string | null
  motivos: string[]
}>
type Candidate = Readonly<{
  seed: StableSuggestionSeed
  vencimiento: string | null
  motivos: string[]
  reglaAplicadaId: string | null
  archivoPrivadoHref?: string | null
}>
type ActiveRuleCue = Readonly<{
  id: string
  tipo: EasyDocumentType | null
  motivo: string | null
  accion: string
}>
type Movement = Readonly<{
  id: string
  fecha: string
  concepto: string
  referencia: string | null
  infoAdicional: string | null
  tercero: string | null
  importeCentimos: number
  cuentaId: string
  banco: string
  cuentaAlias: string | null
  version: number
  versionGestion: number
  nominaId: string | null
  entregaEmpleadoId: string | null
  entidadFiscalId: string | null
  entidadFiscalTipo: string | null
  entidadFiscalRazonSocial: string | null
  tarjeta: string | null
  responsableTarjeta: string | null
}>

function candidateDto(candidate: Candidate): EasySuggestionDto {
  const exacta = isExactSuggestion(candidate.seed)
  const reasons = [...candidate.motivos]
  if (!exacta) {
    const remaining = candidate.seed.sourceTargetCentimos - candidate.seed.asignadoActivoCentimos
    if (candidate.seed.fechaDocumento === null) reasons.push('La fuente no conserva fecha documental verificable.')
    else if (candidate.seed.fechaDocumento > candidate.seed.fechaBanco) reasons.push('La fecha del documento es posterior al movimiento bancario.')
    if (remaining !== candidate.seed.importeMovimientoCentimos) reasons.push('La capacidad documental activa no coincide exactamente con el banco.')
    if (candidate.seed.importeMovimientoCentimos < 0 && !candidate.seed.archivoDisponible) reasons.push('Un cargo requiere archivo controlado descargable antes de confirmar.')
    if (candidate.seed.sourceTargetCentimos !== candidate.seed.importeMovimientoCentimos) reasons.push('El importe documental no coincide exactamente al céntimo.')
  }
  return {
    id: stableSuggestionId(candidate.seed), tipo: candidate.seed.tipo, sourceId: candidate.seed.sourceId,
    documentoConciliableId: candidate.seed.documentoConciliableId, referencia: candidate.seed.referencia,
    tercero: candidate.seed.tercero, fecha: candidate.seed.fechaDocumento, vencimiento: candidate.vencimiento,
    importeCentimos: candidate.seed.sourceTargetCentimos, archivoDisponible: candidate.seed.archivoDisponible,
    archivoPrivadoHref: candidate.seed.archivoDisponible ? (candidate.seed.tipo === 'FACTURA_RECIBIDA' ? `/api/admin/finanzas/modo-facil/documentos/${encodeURIComponent(candidate.seed.sourceId)}/archivo` : candidate.archivoPrivadoHref ?? null) : null,
    exacta, motivos: [...new Set(reasons)].slice(0, 8),
  }
}

/** Current active B4 allocation, signed and never abs(). */
async function activeAllocations(tx: Tx, documentIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(documentIds.filter((id) => UUID.test(id)))]
  if (!ids.length) return new Map()
  const rows = await tx.$queryRaw<Array<{ documentoId: string; asignado: bigint | number | null }>>(Prisma.sql`
    SELECT v.documento_conciliable_id::text AS "documentoId", COALESCE(SUM(v.importe_centimos),0)::bigint AS asignado
    FROM vinculos_movimiento_documento v
    WHERE v.activo=true AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
      AND v.documento_conciliable_id IN (${Prisma.join(ids.map((id) => Prisma.sql`CAST(${id} AS uuid)`))})
    GROUP BY v.documento_conciliable_id
  `)
  return new Map(rows.map((row) => [row.documentoId, exactInteger(row.asignado ?? 0, 'asignado activo')]))
}

/** A rule is a scoped cue only: it never contains source/document identity and
 * can only rank an independently verified live B4 candidate. */
async function activeRuleCuesTx(tx: Tx, movement: Movement): Promise<ActiveRuleCue[]> {
  const counterpart = counterpartyFromMovement(movement)
  const movementSign = sign(movement.importeCentimos)
  if (!counterpart || !movementSign) return []
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text,r.tipo_documento::text,r.motivo_no_requiere::text,r.accion
    FROM reglas_modo_facil r
    JOIN operaciones_justificacion_b4 o ON o.id=r.operacion_b4_id
    JOIN recibos_modo_facil receipt ON receipt.operacion_b4_id=o.id
    WHERE r.activa=true AND r.modo='SOLO_PROPONER'::"ModoReglaModoFacil"
      AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
      AND receipt.actor_id=o.solicitada_por_id
      AND r.cuenta_id=${movement.cuentaId} AND r.signo=${movementSign}
      AND r.contraparte_normalizada=${counterpart}
      AND r.vigente_desde<=CAST(${movement.fecha} AS date)
      AND (r.vigente_hasta IS NULL OR r.vigente_hasta>=CAST(${movement.fecha} AS date))
    ORDER BY r.vigente_desde DESC,r.created_at DESC,r.id ASC
    LIMIT ${MAX_RULES}
  `)
  return rows.flatMap((row): ActiveRuleCue[] => {
    const tipo = typeof row.tipo_documento === 'string' && ['FACTURA_RECIBIDA', 'FACTURA_EMITIDA', 'TICKET'].includes(row.tipo_documento)
      ? row.tipo_documento as EasyDocumentType : null
    const motivo = typeof row.motivo_no_requiere === 'string' ? row.motivo_no_requiere : null
    const id = typeof row.id === 'string' ? row.id : null
    const accion = typeof row.accion === 'string' ? row.accion : null
    return id && accion ? [{ id, tipo, motivo, accion }] : []
  })
}
function cueForCandidate(cues: readonly ActiveRuleCue[], tipo: EasyDocumentType): ActiveRuleCue | null {
  return cues.find((cue) => cue.tipo === tipo && cue.motivo === null) ?? null
}

/** Returns sources from tables B4 itself accepts. It only projects, never creates wrappers. */
async function candidatesForMovementTx(tx: Tx, movement: Movement): Promise<Candidate[]> {
  const movementDate = movement.fecha
  const target = movement.importeCentimos
  if (target === 0) return []
  const candidates: Candidate[] = []
  const cues = await activeRuleCuesTx(tx, movement)
  if (target < 0) {
    const received = await tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT fr.id::text AS source_id, fr.proveedor, fr.num_factura, fr.fecha::date::text AS fecha,
        fr.fecha_vencimiento::date::text AS vencimiento, fr.total::text AS total_text,
        fr.onedrive_drive_id AS drive_id, fr.onedrive_item_id AS item_id, fr.archivo_onedrive AS archivo_onedrive,
        d.id::text AS documento_id, d.importe_objetivo_centimos AS objetivo_centimos, d.activo AS documento_activo
      FROM facturas_recibidas fr
      LEFT JOIN documentos_conciliables d ON d.factura_recibida_id=fr.id AND d.tipo='FACTURA_RECIBIDA'::"TipoDocumentoConciliable"
      WHERE ${facturaEconomicaSQL('fr')}
        AND fr.conflicto_identidad=false AND fr.duplicado_externo=false
        AND fr.fecha::date <= CAST(${movementDate} AS date)
        AND (-b4_importe_bancario_centimos(fr.total)) = ${target}
      ORDER BY fr.fecha DESC, fr.id ASC
      LIMIT ${MAX_SUGGESTIONS_PER_MOVEMENT}
    `)
    const ticketRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT g.id::text AS source_id, g.comercio AS tercero, g.concepto, g.fecha::date::text AS fecha,
        g.importe::text AS importe_text, g.onedrive_item_id_gasto AS item_id,
        d.id::text AS documento_id, d.importe_objetivo_centimos AS objetivo_centimos, d.activo AS documento_activo,
        ap.estado::text AS adjunto_estado, ap.drive_id AS drive_id, ap.id::text AS adjunto_id, ap.movimiento_id AS adjunto_movimiento_id
      FROM gastos g
      JOIN documentos_conciliables d ON d.gasto_id=g.id AND d.tipo='TICKET'::"TipoDocumentoConciliable"
      LEFT JOIN adjuntos_pendientes_b5 ap ON ap.documento_conciliable_id=d.id
      WHERE g.estado IN ('APROBADO','CONTABILIZADO') AND g.metodo_pago='TARJETA_EMPRESA'
        AND g.fecha::date <= CAST(${movementDate} AS date)
        AND (-b4_importe_bancario_centimos(g.importe)) = ${target}
        AND d.activo=true
      ORDER BY g.fecha DESC,g.id ASC
      LIMIT ${MAX_SUGGESTIONS_PER_MOVEMENT}
    `)
    const ids = [...received.map((row) => String(row.documento_id ?? '')).filter(Boolean), ...ticketRows.map((row) => String(row.documento_id ?? '')).filter(Boolean)]
    const allocations = await activeAllocations(tx, ids)
    for (const row of received) {
      const sourceTarget = -centsFromSqlText(row.total_text, 'factura recibida.total')
      const hasMatchingWrapper = row.documento_id === null || (row.documento_activo === true && exactInteger(row.objetivo_centimos, 'objetivo B4') === sourceTarget)
      if (!hasMatchingWrapper) continue
      const id = row.documento_id === null ? null : String(row.documento_id)
      const archive = !!archivoRecibidaControlado({ oneDriveDriveId: row.drive_id, oneDriveItemId: row.item_id, archivoOneDrive: row.archivo_onedrive })
      candidates.push({
        seed: {
          movimientoId: movement.id, importeMovimientoCentimos: target, fechaBanco: movementDate, tipo: 'FACTURA_RECIBIDA',
          sourceId: String(row.source_id), documentoConciliableId: id, sourceTargetCentimos: sourceTarget,
          asignadoActivoCentimos: id ? allocations.get(id) ?? 0 : 0, fechaDocumento: typeof row.fecha === 'string' ? row.fecha : null,
          referencia: text(row.num_factura) ?? `Factura recibida ${String(row.source_id).slice(0, 8)}`,
          tercero: text(row.proveedor), archivoDisponible: archive,
        }, vencimiento: typeof row.vencimiento === 'string' ? row.vencimiento : null,
        motivos: ['Factura recibida B4 vigente; se exige coincidencia firmada exacta y fecha documental no posterior al banco.'],
        reglaAplicadaId: (normalizeCounterparty(row.proveedor) === counterpartyFromMovement(movement) ? cueForCandidate(cues, 'FACTURA_RECIBIDA') : null)?.id ?? null,
      })
    }
    for (const row of ticketRows) {
      const sourceTarget = -centsFromSqlText(row.importe_text, 'ticket.importe')
      const id = String(row.documento_id)
      if (exactInteger(row.objetivo_centimos, 'objetivo ticket B4') !== sourceTarget) continue
      candidates.push({
        seed: {
          movimientoId: movement.id, importeMovimientoCentimos: target, fechaBanco: movementDate, tipo: 'TICKET',
          sourceId: String(row.source_id), documentoConciliableId: id, sourceTargetCentimos: sourceTarget,
          asignadoActivoCentimos: allocations.get(id) ?? 0, fechaDocumento: typeof row.fecha === 'string' ? row.fecha : null,
          referencia: text(row.concepto) ?? `Ticket ${String(row.source_id).slice(0, 8)}`,
          tercero: text(row.tercero), archivoDisponible: controlledTicket(row.drive_id, row.item_id) && row.adjunto_estado === 'UPLOAD_COMPLETO',
        }, vencimiento: null,
        archivoPrivadoHref: row.adjunto_id && row.adjunto_movimiento_id ? `/api/admin/finanzas/movimientos/${encodeURIComponent(String(row.adjunto_movimiento_id))}/archivos?archivoId=${encodeURIComponent('ADJUNTO_B5:' + String(row.adjunto_id))}` : null,
        motivos: ['Ticket B5 completo aún no vinculado; subir evidencia no ha conciliado el banco.'],
        reglaAplicadaId: (normalizeCounterparty(row.tercero) === counterpartyFromMovement(movement) ? cueForCandidate(cues, 'TICKET') : null)?.id ?? null,
      })
    }
  } else {
    const emitted = await tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT fe.id::text AS source_id, fe.cliente, fe.num_factura, fe.fecha::date::text AS fecha,
        fe.fecha_vencimiento::date::text AS vencimiento, fe.total::text AS total_text,
        d.id::text AS documento_id, d.importe_objetivo_centimos AS objetivo_centimos, d.activo AS documento_activo
      FROM facturas_emitidas fe
      LEFT JOIN documentos_conciliables d ON d.factura_emitida_id=fe.id AND d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable"
      WHERE fe.fecha::date <= CAST(${movementDate} AS date)
        AND b4_importe_bancario_centimos(fe.total) = ${target}
      ORDER BY fe.fecha DESC,fe.id ASC
      LIMIT ${MAX_SUGGESTIONS_PER_MOVEMENT}
    `)
    const allocations = await activeAllocations(tx, emitted.map((row) => String(row.documento_id ?? '')).filter(Boolean))
    for (const row of emitted) {
      const sourceTarget = centsFromSqlText(row.total_text, 'factura emitida.total')
      const hasMatchingWrapper = row.documento_id === null || (row.documento_activo === true && exactInteger(row.objetivo_centimos, 'objetivo B4') === sourceTarget)
      if (!hasMatchingWrapper) continue
      const id = row.documento_id === null ? null : String(row.documento_id)
      candidates.push({
        seed: {
          movimientoId: movement.id, importeMovimientoCentimos: target, fechaBanco: movementDate, tipo: 'FACTURA_EMITIDA',
          sourceId: String(row.source_id), documentoConciliableId: id, sourceTargetCentimos: sourceTarget,
          asignadoActivoCentimos: id ? allocations.get(id) ?? 0 : 0, fechaDocumento: typeof row.fecha === 'string' ? row.fecha : null,
          referencia: text(row.num_factura) ?? `Factura emitida ${String(row.source_id).slice(0, 8)}`,
          tercero: text(row.cliente), archivoDisponible: false,
        }, vencimiento: typeof row.vencimiento === 'string' ? row.vencimiento : null,
        motivos: ['Factura emitida B4 vigente; el cobro exige coincidencia firmada exacta y fecha documental no posterior al banco.'],
        reglaAplicadaId: (normalizeCounterparty(row.cliente) === counterpartyFromMovement(movement) ? cueForCandidate(cues, 'FACTURA_EMITIDA') : null)?.id ?? null,
      })
    }
  }
  return candidates
    .filter((candidate) => candidate.seed.sourceTargetCentimos === target && candidate.seed.asignadoActivoCentimos === 0)
    .map((candidate) => candidate.reglaAplicadaId === null ? candidate : {
      ...candidate,
      motivos: [...candidate.motivos, 'Regla SOLO_PROPONER coincidente: prioriza esta evidencia para revisión humana; no confirma automáticamente.'],
    })
    .sort((left, right) => Number(right.reglaAplicadaId !== null) - Number(left.reglaAplicadaId !== null)
      || (right.seed.fechaDocumento ?? '').localeCompare(left.seed.fechaDocumento ?? '') || left.seed.sourceId.localeCompare(right.seed.sourceId))
    .slice(0, MAX_SUGGESTIONS_PER_MOVEMENT)
}

/** Test/integration inspection only. It performs no DML and returns the exact
 * current candidate set plus the optional proposal cue; routes use the same
 * `candidatesForMovementTx` implementation through the read projection. */
export async function inspectEasyCandidatesTx(tx: Prisma.TransactionClient, movimientoId: string) {
  await assertPrototypeStaging()
  const movement = await lockMovement(asTx(tx), movimientoId)
  return (await candidatesForMovementTx(asTx(tx), movement)).map((candidate) => ({
    reglaAplicadaId: candidate.reglaAplicadaId,
    suggestion: candidateDto(candidate),
  }))
}

async function queryMovements(input: EasyReadInput, take: number, skip: number): Promise<Movement[]> {
  const direction = input.sentido === 'CARGOS' ? Prisma.sql`AND b4_importe_bancario_centimos(m.importe) < 0`
    : input.sentido === 'COBROS' ? Prisma.sql`AND b4_importe_bancario_centimos(m.importe) > 0` : Prisma.sql``
  const q = input.q ? `%${input.q}%` : null
  const cardPattern = input.tarjeta ? `(?:[*]{1,12}[[:space:]]*|[xX]{2,12}[[:space:]]*|[Tt][Aa][Rr][Jj][Ee][Tt][Aa][[:space:]]+)${input.tarjeta}([^0-9]|$)` : null
  const rows = await db().$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.fecha_operacion::date::text AS fecha,m.concepto,m.referencia,m.info_adicional,m.tercero,m.nomina_id,m.entrega_a_cuenta_empleado_id,m.entidad_fiscal_id,ef.tipo::text AS entidad_fiscal_tipo,ef.razon_social AS entidad_fiscal_razon,m.importe::text AS importe_text,
      c.id AS cuenta_id,c.banco,c.alias AS cuenta_alias,COALESCE(e.version,1) AS version_b4,COALESCE(g.version,1) AS version_gestion
    FROM movimientos_bancarios m
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND m.fecha_operacion >= CAST(${input.desde} AS date)
      AND m.fecha_operacion < CAST(${input.hasta} AS date)+interval '1 day'
      AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
      ${direction}
      ${q === null ? Prisma.sql`` : Prisma.sql`AND (m.concepto ILIKE ${q} OR COALESCE(m.tercero,'') ILIKE ${q} OR COALESCE(m.referencia,'') ILIKE ${q} OR COALESCE(m.info_adicional,'') ILIKE ${q})`}
      ${cardPattern === null ? Prisma.sql`` : Prisma.sql`AND concat_ws(' ',m.concepto,m.referencia,m.info_adicional) ~ ${cardPattern}`}
    ORDER BY abs(b4_importe_bancario_centimos(m.importe)::bigint) DESC,m.fecha_operacion DESC,m.id ASC
    LIMIT ${take} OFFSET ${skip}
  `)
  return rows.map((row) => {
    const cents = centsFromSqlText(row.importe_text, 'movimiento.importe')
    const card = cardFromBankText([row.concepto, row.referencia, row.info_adicional].filter(Boolean).join(' '))
    return {
      id: String(row.id), fecha: String(row.fecha), concepto: String(row.concepto ?? ''), referencia: text(row.referencia), infoAdicional: text(row.info_adicional), tercero: text(row.tercero),
      importeCentimos: cents, cuentaId: String(row.cuenta_id), banco: String(row.banco), cuentaAlias: row.cuenta_alias === null ? null : String(row.cuenta_alias),
      version: exactInteger(row.version_b4, 'version B4'), versionGestion: exactInteger(row.version_gestion, 'version gestión'),
      nominaId: row.nomina_id === null ? null : String(row.nomina_id), entregaEmpleadoId: row.entrega_a_cuenta_empleado_id === null ? null : String(row.entrega_a_cuenta_empleado_id), entidadFiscalId: row.entidad_fiscal_id === null ? null : String(row.entidad_fiscal_id), entidadFiscalTipo: text(row.entidad_fiscal_tipo), entidadFiscalRazonSocial: text(row.entidad_fiscal_razon),
      tarjeta: card?.terminacion ?? null, responsableTarjeta: card?.titular ?? null,
    }
  })
}

async function countQueue(input: EasyReadInput): Promise<{ total: number; cargos: number; cobros: number; cargosCentimos: string; cobrosCentimos: string }> {
  const direction = input.sentido === 'CARGOS' ? Prisma.sql`AND b4_importe_bancario_centimos(m.importe) < 0`
    : input.sentido === 'COBROS' ? Prisma.sql`AND b4_importe_bancario_centimos(m.importe) > 0` : Prisma.sql``
  const q = input.q ? `%${input.q}%` : null
  const cardPattern = input.tarjeta ? `(?:[*]{1,12}[[:space:]]*|[xX]{2,12}[[:space:]]*|[Tt][Aa][Rr][Jj][Ee][Tt][Aa][[:space:]]+)${input.tarjeta}([^0-9]|$)` : null
  const rows = await db().$queryRaw<Array<any>>(Prisma.sql`
    WITH x AS (
      SELECT b4_importe_bancario_centimos(m.importe) AS cents
      FROM movimientos_bancarios m LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
      WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
        AND m.fecha_operacion>=CAST(${input.desde} AS date) AND m.fecha_operacion<CAST(${input.hasta} AS date)+interval '1 day'
        AND b4_importe_bancario_centimos(m.importe) IS NOT NULL ${direction}
        ${q === null ? Prisma.sql`` : Prisma.sql`AND (m.concepto ILIKE ${q} OR COALESCE(m.tercero,'') ILIKE ${q} OR COALESCE(m.referencia,'') ILIKE ${q} OR COALESCE(m.info_adicional,'') ILIKE ${q})`}
        ${cardPattern === null ? Prisma.sql`` : Prisma.sql`AND concat_ws(' ',m.concepto,m.referencia,m.info_adicional) ~ ${cardPattern}`}
    ) SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE cents<0)::int AS cargos,COUNT(*) FILTER(WHERE cents>0)::int AS cobros,
      COALESCE(SUM(cents) FILTER(WHERE cents<0),0)::bigint::text AS cargos_centimos,COALESCE(SUM(cents) FILTER(WHERE cents>0),0)::bigint::text AS cobros_centimos FROM x
  `)
  const row = rows[0] ?? {}
  return { total: Number(row.total ?? 0), cargos: Number(row.cargos ?? 0), cobros: Number(row.cobros ?? 0), cargosCentimos: String(row.cargos_centimos ?? '0'), cobrosCentimos: String(row.cobros_centimos ?? '0') }
}

async function readMonths(input: EasyReadInput) {
  const rows = await db().$queryRaw<Array<any>>(Prisma.sql`
    SELECT date_trunc('month',m.fecha_operacion)::date::text AS mes,
      COUNT(*) FILTER(WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO')::int AS pendientes,
      COUNT(*) FILTER(WHERE e.estado::text='JUSTIFICADO')::int AS justificados,
      COUNT(*) FILTER(WHERE e.estado::text='NO_REQUIERE')::int AS no_requiere,
      COALESCE(SUM(b4_importe_bancario_centimos(m.importe)) FILTER(WHERE e.estado::text='JUSTIFICADO'),0)::bigint::text AS justificado_centimos,
      COALESCE(SUM(b4_importe_bancario_centimos(m.importe)) FILTER(WHERE COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'),0)::bigint::text AS pendiente_centimos,
      bool_and(COALESCE(COALESCE((SELECT cm.fecha_corte FROM cortes_cobertura_manual_b3 cm WHERE cm.cuenta_id=c.id ORDER BY cm.version DESC LIMIT 1),c.fecha_corte_extracto) >= (date_trunc('month',m.fecha_operacion)+interval '1 month - 1 day')::date,false)) AS cubierta
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE m.fecha_operacion>=CAST(${input.desde} AS date) AND m.fecha_operacion<CAST(${input.hasta} AS date)+interval '1 day'
      AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
    GROUP BY date_trunc('month',m.fecha_operacion)::date ORDER BY mes ASC LIMIT 120
  `)
  return rows.map((row) => {
    const pendientes = Number(row.pendientes ?? 0), justificados = Number(row.justificados ?? 0), noRequiere = Number(row.no_requiere ?? 0)
    const coverage = row.cubierta === true
    const semaforo = !coverage ? 'GRIS' as const : pendientes === 0 ? 'VERDE' as const : justificados > 0 || noRequiere > 0 ? 'AMARILLO' as const : 'ROJO' as const
    const message = !coverage ? 'Cobertura de extracto no verificada para todo el mes.' : pendientes === 0 ? 'No quedan movimientos SIN_DOCUMENTO.' : `${pendientes} movimiento(s) pendientes de revisión humana.`
    return { mes: String(row.mes), pendientes, justificados, noRequiere, importeJustificadoCentimos: String(row.justificado_centimos ?? '0'), importePendienteCentimos: String(row.pendiente_centimos ?? '0'), coberturaVerificada: coverage, semaforo, mensaje: message }
  })
}

async function readRules() {
  const rows = await db().$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text,r.contraparte_normalizada,r.accion,r.activa,r.version,r.modo::text,
      COUNT(a.id) FILTER(WHERE a.accion='USO_CONFIRMADO')::int AS usos_confirmados,
      (r.activa AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL) AS efectiva
    FROM reglas_modo_facil r JOIN operaciones_justificacion_b4 o ON o.id=r.operacion_b4_id
    LEFT JOIN auditorias_reglas_modo_facil a ON a.regla_id=r.id
    GROUP BY r.id,o.id ORDER BY r.created_at DESC,r.id ASC LIMIT ${MAX_RULES}
  `)
  return rows.map((row) => ({ id: String(row.id), contraparte: String(row.contraparte_normalizada), accion: String(row.accion), activa: row.efectiva === true, version: exactInteger(row.version, 'version regla'), modo: EASY_MODE, usosConfirmados: Number(row.usos_confirmados ?? 0) }))
}

/** GET is read-only: this service performs no state initialization, wrapper creation or DML. */
export async function readEasyReconciliation(input: EasyReadInput) {
  await assertPrototypeStaging()
  try {
    const [movementRows, summary, months, rules] = await Promise.all([
      queryMovements(input, input.limit, input.offset), countQueue(input), readMonths(input), readRules(),
    ])
    const whoById = await readEasyMovementWhoByIds(movementRows.map(movement => movement.id))
    const movements = await Promise.all(movementRows.map(async (movement) => {
      const candidates = await candidatesForMovementTx(db() as unknown as Tx, movement)
      const noRequireCues = (await activeRuleCuesTx(db() as unknown as Tx, movement)).filter(cue => cue.motivo !== null)
      const noRequireCue = movement.nominaId === null && !['PERSONAL', 'AAPP'].includes(movement.entidadFiscalTipo ?? '')
        ? noRequireCues.find(cue => !noRequireBankContextError(cue.motivo as any, [movement.concepto, movement.referencia, movement.infoAdicional, movement.tercero])) ?? null : null
      const rule = candidates.find((candidate) => candidate.reglaAplicadaId !== null)?.reglaAplicadaId ?? noRequireCue?.id ?? null
      return {
        id: movement.id, version: movement.version, fecha: movement.fecha, concepto: movement.concepto, importeCentimos: movement.importeCentimos,
        contraparte: movement.tercero ?? movement.concepto, cuenta: { id: movement.cuentaId, banco: movement.banco, alias: movement.cuentaAlias },
        quienEs: whoById.get(movement.id) ?? { estado: 'SIN_IDENTIFICAR' as const, nombre: null },
        tarjeta: movement.tarjeta, responsableTarjeta: movement.responsableTarjeta, versionGestion: movement.versionGestion,
        estado: 'SIN_DOCUMENTO' as const, reglaAplicadaId: rule, motivoNoRequierePropuesto: noRequireCue?.motivo ?? null,
        contextoRecogidaManual: {
          tipoEntidadFiscal: movement.entidadFiscalTipo,
          empleadoAcreditadoPor: movement.nominaId !== null ? 'NOMINA' : movement.entregaEmpleadoId !== null ? 'ENTREGA_A_CUENTA' : movement.entidadFiscalTipo === 'PERSONAL' ? 'ENTIDAD_FISCAL_PERSONAL' : null,
          tarjetaTerminacion: movement.tarjeta,
          cuentaBanco: movement.banco,
        },
        sugerencias: candidates.map(candidateDto),
      }
    }))
    return {
      stagingOnly: true as const, automaticas: false as const,
      criterio: 'Cola única SIN_DOCUMENTO ordenada sólo por magnitud; sugerencias B4 exactas, firmadas, vigentes y confirmables sólo por clic.',
      periodo: { desde: input.desde, hasta: input.hasta }, total: summary.total, limit: input.limit, offset: input.offset,
      totales: { cargos: summary.cargos, cobros: summary.cobros, cargosCentimos: summary.cargosCentimos, cobrosCentimos: summary.cobrosCentimos },
      meses: months, reglas: rules, movimientos: movements,
    }
  } catch (error) { privateError(error) }
}

async function lockMovement(tx: Tx, movimientoId: string): Promise<Movement> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text),0))::text AS locked`
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT m.id,m.fecha_operacion::date::text AS fecha,m.concepto,m.referencia,m.info_adicional,m.tercero,m.nomina_id,m.entrega_a_cuenta_empleado_id,m.entidad_fiscal_id,ef.tipo::text AS entidad_fiscal_tipo,ef.razon_social AS entidad_fiscal_razon,m.importe::text AS importe_text,
      c.id AS cuenta_id,c.banco,c.alias AS cuenta_alias,COALESCE(e.estado::text,'SIN_DOCUMENTO') AS estado_b4,COALESCE(e.version,1) AS version_b4,
      COALESCE(g.version,1) AS version_gestion
    FROM movimientos_bancarios m JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    WHERE m.id=${movimientoId} FOR UPDATE OF m
  `)
  if (rows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
  const row = rows[0]
  if (row.estado_b4 !== 'SIN_DOCUMENTO') fail(409, 'DESHACER_REQUERIDO', 'El movimiento ya no está SIN_DOCUMENTO; debe releerse o deshacerse la operación vigente.')
  const cents = centsFromSqlText(row.importe_text, 'movimiento.importe', true)
  const card = cardFromBankText([row.concepto, row.referencia, row.info_adicional].filter(Boolean).join(' '))
  return { id: String(row.id), fecha: String(row.fecha), concepto: String(row.concepto ?? ''), referencia: text(row.referencia), infoAdicional: text(row.info_adicional), tercero: text(row.tercero), importeCentimos: cents, cuentaId: String(row.cuenta_id), banco: String(row.banco), cuentaAlias: row.cuenta_alias === null ? null : String(row.cuenta_alias), version: exactInteger(row.version_b4, 'version B4'), versionGestion: exactInteger(row.version_gestion, 'version gestión'), nominaId: row.nomina_id === null ? null : String(row.nomina_id), entregaEmpleadoId: row.entrega_a_cuenta_empleado_id === null ? null : String(row.entrega_a_cuenta_empleado_id), entidadFiscalId: row.entidad_fiscal_id === null ? null : String(row.entidad_fiscal_id), entidadFiscalTipo: text(row.entidad_fiscal_tipo), entidadFiscalRazonSocial: text(row.entidad_fiscal_razon), tarjeta: card?.terminacion ?? null, responsableTarjeta: card?.titular ?? null }
}

async function replayReceipt(tx: Tx, actorId: number, input: EasyWriteInput) {
  const receipt = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.request_hash,r.operacion_b4_id::text,o.movimiento_id,o.estado::text AS estado,o.revertida_at
    FROM recibos_modo_facil r JOIN operaciones_justificacion_b4 o ON o.id=r.operacion_b4_id
    WHERE r.actor_id=${actorId} AND r.idempotency_key=CAST(${input.idempotencyKey} AS uuid) LIMIT 1 FOR UPDATE OF r,o
  `)
  if (!receipt.length) return null
  if (receipt[0].request_hash !== requestHash(actorId, input)) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia ya pertenece a otra decisión Modo Fácil.')
  if (String(receipt[0].movimiento_id) !== input.movimientoId) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'El recibo no pertenece al movimiento indicado.')
  return { ok: true as const, operacionId: String(receipt[0].operacion_b4_id), movimientoId: input.movimientoId, reversible: receipt[0].estado === 'APLICADA' && receipt[0].revertida_at === null }
}

async function recordReceipt(tx: Tx, actorId: number, input: EasyWriteInput, operacionB4Id: string) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO recibos_modo_facil (id,operacion_b4_id,actor_id,accion,idempotency_key,request_hash,sugerencia_id,created_at)
    VALUES (gen_random_uuid(),CAST(${operacionB4Id} AS uuid),${actorId},${input.action},CAST(${input.idempotencyKey} AS uuid),${requestHash(actorId,input)},${input.action==='confirmar_factura' ? input.sugerenciaId : null},CURRENT_TIMESTAMP)
  `)
}

async function incrementMatchingRules(tx: Tx, actorId: number, movement: Movement, tipo: EasyDocumentType, operacionB4Id: string) {
  const counterpart = counterpartyFromMovement(movement)
  const movementSign = sign(movement.importeCentimos)
  if (!counterpart || !movementSign) return
  const rules = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT r.id::text FROM reglas_modo_facil r
    JOIN operaciones_justificacion_b4 o ON o.id=r.operacion_b4_id
    WHERE r.activa=true AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
      AND r.cuenta_id=${movement.cuentaId} AND r.signo=${movementSign} AND r.contraparte_normalizada=${counterpart}
      AND r.tipo_documento=${tipo}::"TipoDocumentoConciliable" AND r.vigente_desde<=CAST(${movement.fecha} AS date)
      AND (r.vigente_hasta IS NULL OR r.vigente_hasta>=CAST(${movement.fecha} AS date))
    FOR UPDATE OF r
  `)
  for (const rule of rules) {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO auditorias_reglas_modo_facil (id,regla_id,actor_id,accion,operacion_b4_id,snapshot,created_at)
      VALUES (gen_random_uuid(),CAST(${String(rule.id)} AS uuid),${actorId},'USO_CONFIRMADO',CAST(${operacionB4Id} AS uuid),
        jsonb_build_object('schema','MODO_FACIL_REGLA_AUDIT_V1','movimientoId',CAST(${movement.id} AS text)),CURRENT_TIMESTAMP)
    `)
  }
}

async function confirmEasyReconciliationParsedTx(tx: Tx, actorId: number, input: EasyWriteInput) {
  const previous = await replayReceipt(tx, actorId, input)
  if (previous) return previous
  const movement = await lockMovement(tx, input.movimientoId)
  if (movement.version !== input.version) fail(409, 'VERSION_CONFLICT', 'La versión B4 cambió; relea el movimiento.')
  // Revalidate the live role/permission immediately before economic DML. This
  // intentionally remains outside the caller transaction and is read-only.
  const live = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in live) fail(live.response.status, 'ACCESS_REVOKED', 'El permiso B4 cambió; no se aplicó ninguna decisión.')
  let result: any
  if (input.action === 'no_requiere') {
    if (movement.nominaId !== null || ['PERSONAL', 'AAPP'].includes(movement.entidadFiscalTipo ?? '')) {
      fail(422, 'NO_REQUIERE_FUERA_DE_AMBITO', 'Modo Fácil no permite NO_REQUIERE sobre una referencia explícita de nómina, Personal o Administraciones Públicas.')
    }
    const context = noRequireBankContextError(input.motivoNoRequiere, [movement.concepto, movement.referencia, movement.infoAdicional, movement.tercero])
    if (context) fail(422, context, 'NO_REQUIERE sólo admite un motivo cuando el texto bancario aporta una evidencia contextual inequívoca.')
    result = await confirmarB4Tx(tx, actorId, { action: 'confirmar', confirmacion: true, idempotencyKey: input.idempotencyKey, version: movement.version, borrador: { movimientoId: movement.id, importeMovimientoCentimos: movement.importeCentimos, estado: 'NO_REQUIERE', motivoNoRequiere: input.motivoNoRequiere, lineas: [] } })
  } else {
    if (movement.importeCentimos === 0) fail(422, 'MOVIMIENTO_CERO', 'Un movimiento de importe cero no puede confirmarse con documento en Modo Fácil.')
    const candidate = (await candidatesForMovementTx(tx, movement)).find((item) => stableSuggestionId(item.seed) === input.sugerenciaId)
    if (!candidate) fail(409, 'SUGERENCIA_OBSOLETA', 'La sugerencia ya no pertenece al subconjunto vigente del movimiento; relea.')
    if (!isExactSuggestion(candidate.seed)) fail(422, 'SUGERENCIA_NO_EXACTA', 'La sugerencia no puede cerrar el movimiento exactamente al céntimo.')
    // Re-read source evidence with the B4 authority immediately before wrapping/confirming.
    const evidence = await sourceEvidenceB4Tx(tx, candidate.seed.tipo, candidate.seed.sourceId)
    if (evidence.target !== candidate.seed.sourceTargetCentimos) fail(409, 'EVIDENCIA_DOCUMENTAL_CAMBIADA', 'La evidencia fuente cambió; relea.')
    const wrapper = candidate.seed.documentoConciliableId
      ? { documento: { id: candidate.seed.documentoConciliableId } }
      : await createDocumentoB4Tx(tx, actorId, { action: 'documento', tipoDocumento: candidate.seed.tipo, sourceId: candidate.seed.sourceId })
    result = await confirmarB4Tx(tx, actorId, { action: 'confirmar', confirmacion: true, idempotencyKey: input.idempotencyKey, version: movement.version, borrador: { movimientoId: movement.id, importeMovimientoCentimos: movement.importeCentimos, estado: 'JUSTIFICADO', lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: wrapper.documento.id, importeCentimos: movement.importeCentimos }] } })
    if (result.idempotente) fail(409, 'B4_IDEMPOTENCY_SIN_RECIBO_MODO_FACIL', 'La clave ya identifica una operación B4 sin recibo Modo Fácil; no se puede adoptar.')
    if (candidate.reglaAplicadaId !== null) await incrementMatchingRules(tx, actorId, movement, candidate.seed.tipo, result.operacion.id)
  }
  if (input.action === 'no_requiere' && result.idempotente) fail(409, 'B4_IDEMPOTENCY_SIN_RECIBO_MODO_FACIL', 'La clave ya identifica una operación B4 sin recibo Modo Fácil; no se puede adoptar.')
  await recordReceipt(tx, actorId, input, result.operacion.id)
  return { ok: true as const, operacionId: result.operacion.id, movimientoId: movement.id, reversible: true }
}

/** Same exact service contract inside a caller-owned transaction. The staging and
 * actor checks remain mandatory; no external provider is called from this path. */
export async function confirmEasyReconciliationTx(tx: Prisma.TransactionClient, actorId: number, raw: unknown) {
  const input = parseEasyWriteInput(raw)
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
  try { return await confirmEasyReconciliationParsedTx(asTx(tx), actorId, input) } catch (error: unknown) { privateError(error) }
}

/** Every confirmation regenerates its exact B4 source set inside one SERIALIZABLE transaction. */
export async function confirmEasyReconciliation(actorId: number, raw: unknown) {
  const input = parseEasyWriteInput(raw)
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
  try {
    return await db().$transaction((base) => confirmEasyReconciliationParsedTx(asTx(base), actorId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error: unknown) { privateError(error) }
}

async function operationForRule(tx: Tx, actorId: number, operationId: string) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT o.id::text,o.movimiento_id,o.solicitada_por_id,o.estado::text,o.revertida_at,m.importe::text AS importe_text,m.fecha_operacion::date::text AS fecha,
      m.tercero,m.concepto,m.cuenta_id,e.estado::text AS estado_actual,e.motivo_no_requiere::text AS motivo_no_requiere
    FROM operaciones_justificacion_b4 o JOIN recibos_modo_facil r ON r.operacion_b4_id=o.id AND r.actor_id=o.solicitada_por_id
    JOIN movimientos_bancarios m ON m.id=o.movimiento_id LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    WHERE o.id=CAST(${operationId} AS uuid) LIMIT 1 FOR UPDATE OF o,m
  `)
  const row = rows[0]
  if (!row) fail(404, 'OPERACION_NO_ENCONTRADA', 'La operación no corresponde a una confirmación Modo Fácil.')
  if (Number(row.solicitada_por_id) !== actorId) fail(403, 'OPERACION_AJENA', 'Sólo quien confirmó la operación puede crear su regla propuesta.')
  if (row.estado !== 'APLICADA' || row.revertida_at !== null) fail(409, 'OPERACION_NO_VIGENTE', 'La operación debe seguir aplicada y no revertida.')
  const cents = centsFromSqlText(row.importe_text, 'movimiento.importe')
  const counterpart = counterpartyFromMovement(row)
  if (!counterpart || !sign(cents)) fail(422, 'REGLA_SIN_CONTRAPARTE', 'La operación no conserva contraparte y signo utilizables para una regla propuesta.')
  // PostgreSQL does not allow FOR UPDATE on an aggregate query. Lock the
  // underlying active links, then aggregate them in a separate read.
  await tx.$queryRaw(Prisma.sql`
    SELECT v.id FROM vinculos_movimiento_documento v
    WHERE v.operacion_creacion_id=CAST(${operationId} AS uuid) FOR UPDATE
  `)
  const aggregate = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT COUNT(v.id) FILTER(WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo")::int AS documentos,
      MAX(d.tipo::text) FILTER(WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo") AS tipo_documento
    FROM vinculos_movimiento_documento v
    LEFT JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    WHERE v.operacion_creacion_id=CAST(${operationId} AS uuid)
  `)
  const docs = Number(aggregate[0]?.documentos ?? 0)
  const state = String(row.estado_actual ?? '')
  const type = typeof aggregate[0]?.tipo_documento === 'string' ? aggregate[0].tipo_documento as EasyDocumentType : null
  const motive = typeof row.motivo_no_requiere === 'string' ? row.motivo_no_requiere : null
  if (state === 'JUSTIFICADO' && (docs !== 1 || !['FACTURA_RECIBIDA', 'FACTURA_EMITIDA', 'TICKET'].includes(String(type)))) fail(422, 'REGLA_OPERACION_NO_SIMPLE', 'Una regla de documento exige una única línea DOCUMENTO Modo Fácil confirmada.')
  if (state === 'NO_REQUIERE' && !motive) fail(422, 'REGLA_MOTIVO_NO_REQUIERE_INVALIDO', 'La regla NO_REQUIERE exige motivo B4 cerrado.')
  if (state !== 'JUSTIFICADO' && state !== 'NO_REQUIERE') fail(422, 'REGLA_OPERACION_NO_SIMPLE', 'La operación no está en un resultado B4 aprendible.')
  return { operationId: String(row.id), accountId: String(row.cuenta_id), counterpart, cents, date: String(row.fecha), tipo: state === 'JUSTIFICADO' ? type : null, motivo: state === 'NO_REQUIERE' ? motive : null }
}

async function mutateEasyRuleParsedTx(tx: Tx, actorId: number, input: EasyRuleInput) {
  // Like confirmation, a current permission lookup is intentionally performed
  // immediately before DML and remains read-only/outside the caller transaction.
  const live = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in live) fail(live.response.status, 'ACCESS_REVOKED', 'El permiso B4 cambió; no se aplicó ninguna regla.')
  if (input.action === 'crear') {
    const source = await operationForRule(tx, actorId, input.operacionId)
    const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id::text FROM reglas_modo_facil WHERE operacion_b4_id=CAST(${source.operationId} AS uuid) LIMIT 1 FOR UPDATE`)
    if (existing.length) fail(409, 'REGLA_EXISTENTE', 'La operación ya originó una regla propuesta; no se duplica.')
    const accion = source.tipo ? `DOCUMENTO:${source.tipo}` : `NO_REQUIERE:${source.motivo}`
    const hash = sha256Canonical({ schema: 'MODO_FACIL_REGLA_V1', operationId: source.operationId, accountId: source.accountId, counterpart: source.counterpart, sign: sign(source.cents), tipo: source.tipo, motivo: source.motivo, date: source.date })
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO reglas_modo_facil (id,operacion_b4_id,cuenta_id,contraparte_normalizada,signo,tipo_documento,motivo_no_requiere,accion,modo,activa,version,usos_confirmados,vigente_desde,creada_por_id,source_hash,created_at,updated_at)
      VALUES (gen_random_uuid(),CAST(${source.operationId} AS uuid),${source.accountId},${source.counterpart},${sign(source.cents)},${source.tipo === null ? null : Prisma.sql`${source.tipo}::"TipoDocumentoConciliable"`},${source.motivo === null ? null : Prisma.sql`${source.motivo}::"MotivoNoRequiere"`},${accion},'SOLO_PROPONER'::"ModoReglaModoFacil",true,1,0,CAST(${source.date} AS date),${actorId},${hash},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    const ruleId = rows[0]?.id
    if (!ruleId) fail(500, 'REGLA_NO_CREADA', 'No se pudo crear la regla propuesta.')
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO auditorias_reglas_modo_facil (id,regla_id,actor_id,accion,operacion_b4_id,snapshot,created_at)
      VALUES (gen_random_uuid(),CAST(${ruleId} AS uuid),${actorId},'CREADA',CAST(${source.operationId} AS uuid),
        jsonb_build_object('schema','MODO_FACIL_REGLA_AUDIT_V1','sourceHash',CAST(${hash} AS text),'modo','SOLO_PROPONER','nombreOpcional',CAST(${input.nombreOpcional ?? null} AS text)),CURRENT_TIMESTAMP)
    `)
    return { ok: true as const, reglaId: ruleId, activa: true, version: 1, modo: EASY_MODE }
  }
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`SELECT id::text,version,activa FROM reglas_modo_facil WHERE id=CAST(${input.reglaId} AS uuid) FOR UPDATE`)
  const rule = rows[0]
  if (!rule) fail(404, 'REGLA_NO_ENCONTRADA', 'La regla propuesta no existe.')
  if (exactInteger(rule.version, 'version regla') !== input.version) fail(409, 'VERSION_CONFLICT', 'La regla cambió; relea antes de desactivar.')
  if (rule.activa !== true) fail(409, 'REGLA_YA_INACTIVA', 'La regla ya está desactivada.')
  const nextVersion = input.version + 1
  const updated = await tx.$executeRaw(Prisma.sql`UPDATE reglas_modo_facil SET activa=false,version=${nextVersion},desactivada_por_id=${actorId},desactivada_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=CAST(${input.reglaId} AS uuid) AND version=${input.version}`)
  if (updated !== 1) fail(409, 'VERSION_CONFLICT', 'La regla cambió; relea antes de desactivar.')
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO auditorias_reglas_modo_facil (id,regla_id,actor_id,accion,operacion_b4_id,snapshot,created_at)
    SELECT gen_random_uuid(),r.id,${actorId},'DESACTIVADA',r.operacion_b4_id,jsonb_build_object('schema','MODO_FACIL_REGLA_AUDIT_V1','version',CAST(${nextVersion} AS integer)),CURRENT_TIMESTAMP FROM reglas_modo_facil r WHERE r.id=CAST(${input.reglaId} AS uuid)
  `)
  return { ok: true as const, reglaId: input.reglaId, activa: false, version: nextVersion, modo: EASY_MODE }
}

/** Same proposal-only mutation in a caller-owned transaction for rollback tests. */
export async function mutateEasyRuleTx(tx: Prisma.TransactionClient, actorId: number, raw: unknown) {
  const input = parseEasyRuleInput(raw)
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
  try { return await mutateEasyRuleParsedTx(asTx(tx), actorId, input) } catch (error: unknown) { privateError(error) }
}

export async function mutateEasyRule(actorId: number, raw: unknown) {
  const input = parseEasyRuleInput(raw)
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
  try {
    return await db().$transaction((base) => mutateEasyRuleParsedTx(asTx(base), actorId, input), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error: unknown) { privateError(error) }
}

/** Route-facing error conversion keeps staging and B4 errors actionable without exposing internals. */
export function easyErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof PrototypeStagingError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof EasyReconciliationServiceError) return { status: error.status, body: { error: error.message, codigo: error.code, ...(error.details === undefined ? {} : { errors: error.details }) } }
  if (error instanceof EasyReconciliationValidationError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034') return { status: 409, body: { error: 'Conflicto concurrente; relea y reintente con la misma clave.', codigo: 'CONCURRENT_CONFLICT' } }
  return { status: 500, body: { error: 'No se pudo procesar Modo Fácil.' } }
}
