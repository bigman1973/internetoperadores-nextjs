import { Prisma } from '@prisma/client'
import { archivoRecibidaControlado } from '@/lib/finanzas/archivo-fuente-controlada'
import { confirmarB4Tx, createDocumentoB4Tx } from '@/lib/finanzas/reconciliation-db'
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter'
import { derivedUuidV4 } from '@/lib/finanzas/easy-auto-core'
import { conciliarAliasesMatch } from './conciliar-core'
import { movementPartyAliases } from './conciliar-db'
import { type ConciliarProjectionSource } from './conciliar-contract'
import { safeInteger } from './conciliar-core'
import {
  lockConciliarDocumentLifecycleForConfirmationTx,
  readConciliarDocumentLifecycleEligibilityTx,
} from './conciliar-document-lifecycle-guard'
import {
  evaluateArea3ReviewConfirm,
  type Area3ReviewAcknowledgement,
  type Area3ReviewConfirmMaterial,
  type Area3ReviewDecision,
} from './area3-review-confirm-core'

type Tx = Prisma.TransactionClient & Record<string, any>

type SealedReviewRow = Readonly<{
  id: string
  decisionHash: string
  sourceFingerprint: string
  color: 'VERDE' | 'AMBAR' | 'ROJO'
  seleccionable: boolean
  importeCentimos: number
  source: ConciliarProjectionSource
}>

type SourceRow = Readonly<{
  movementId: string
  fechaBanco: string | null
  textoBanco: string | null
  referenciaBanco: string | null
  infoAdicional: string | null
  tercero: string | null
  entidadRazonSocial: string | null
  entidadNombreComercial: string | null
  terceroConfirmado: string | null
  importeBancoCentimos: number | bigint | string | null
  versionB4: number | bigint | string | null
  facturaId: string
  proveedor: string | null
  referenciaDocumento: string | null
  fechaDocumento: string | null
  importeObjetivoDocumentoCentimos: number | bigint | string | null
  driveId: string | null
  itemId: string | null
  archivo: string | null
}>

type ExistingWrapper = Readonly<{
  id: string
  activo: boolean
  objetivo: number | bigint | string | null
}>
type DocumentVersionRow = Readonly<{ contentSha256: string | null }>

export class Area3ReviewConfirmDbError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

function fail(status: number, code: string, message: string): never {
  throw new Area3ReviewConfirmDbError(status, code, message)
}

function cents(value: unknown): number | null {
  const parsed = safeInteger(value)
  return parsed !== null && parsed >= -2_147_483_648 && parsed <= 2_147_483_647 ? parsed : null
}

function day(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function requireReviewSource(row: SealedReviewRow): Readonly<{ movementId: string; invoiceId: string; reason: 'SIN_REFERENCIA_DOCUMENTAL' | 'REFERENCIA_NUMERO_INCOMPLETO'; versionB4: number }> {
  const source = row.source
  const reason = source.providerReviewReason
  const version = cents(source.versionB4)
  if (source.kind !== 'PAGO_FACTURA_RECIBIDA' || !source.movimientoId || !source.facturaRecibidaId
    || (reason !== 'SIN_REFERENCIA_DOCUMENTAL' && reason !== 'REFERENCIA_NUMERO_INCOMPLETO')
    || version === null || version < 1) {
    fail(409, 'REVISION_AREA3_OBSOLETA', 'La propuesta ya no conserva una revisión de proveedor válida. Actualiza la lista.')
  }
  return { movementId: source.movimientoId, invoiceId: source.facturaRecibidaId, reason, versionB4: version }
}

/**
 * Relee exclusivamente la versión actual del archivo que el invoice persistido
 * identifica. La huella no procede de la UI ni sustituye la guarda lifecycle:
 * ambas se evalúan en preflight y de nuevo bajo los locks de confirmación.
 */
async function currentDocumentVersionTx(tx: Tx, source: SourceRow, projectionSource: ConciliarProjectionSource, lock: boolean) {
  const lifecycle = lock
    ? await lockConciliarDocumentLifecycleForConfirmationTx(tx, { source: projectionSource, expectedVersionState: projectionSource.documentLifecycleVersionState })
    : await readConciliarDocumentLifecycleEligibilityTx(tx, projectionSource)
  if (!lifecycle.elegible) return { eligible: false, hash: null as string | null }
  const rows = await tx.$queryRaw<DocumentVersionRow[]>(Prisma.sql`
    SELECT s.content_sha256 AS "contentSha256"
    FROM document_version_lifecycle l
    JOIN document_version_snapshots s ON s.lifecycle_id=l.id AND s.version_number=l.current_version
    WHERE l.source='ONEDRIVE'
      AND l.state='ACTIVE'::"DocumentVersionLifecycleState"
      AND l.source_item_key=(${source.driveId} || ':' || ${source.itemId})
      AND s.artifact_state='CAPTURED'::"DocumentVersionArtifactState"
    LIMIT 2${lock ? Prisma.sql` FOR KEY SHARE OF s` : Prisma.empty}
  `)
  const hash = rows.length === 1 && typeof rows[0]?.contentSha256 === 'string' && /^[a-f0-9]{64}$/.test(rows[0].contentSha256)
    ? rows[0].contentSha256
    : null
  return { eligible: hash !== null, hash }
}

/**
 * Reads only the real bank/invoice rows that generated the sealed projection.
 * Confirm runs this under SERIALIZABLE and blocks movement, source invoice and
 * any existing wrapper; B4 then locks the same wrapper/capacity again before
 * its own insert. The preview calls this same reader without a browser DTO.
 */
async function currentMaterialTx(tx: Tx, row: SealedReviewRow, lock: boolean): Promise<Area3ReviewConfirmMaterial> {
  const sealed = requireReviewSource(row)
  const suffix = lock ? Prisma.sql`FOR UPDATE OF m,fr` : Prisma.empty
  const rows = await tx.$queryRaw<SourceRow[]>(Prisma.sql`
    SELECT m.id AS "movementId",m.fecha_operacion::date::text AS "fechaBanco",m.concepto AS "textoBanco",
      m.referencia AS "referenciaBanco",m.info_adicional AS "infoAdicional",m.tercero,
      ef.razon_social AS "entidadRazonSocial",ef.nombre_comercial AS "entidadNombreComercial",p1.label AS "terceroConfirmado",
      b4_importe_bancario_centimos(m.importe) AS "importeBancoCentimos",COALESCE(e.version,1) AS "versionB4",
      fr.id AS "facturaId",fr.proveedor,fr.num_factura AS "referenciaDocumento",fr.fecha::date::text AS "fechaDocumento",
      -b4_importe_bancario_centimos(fr.total) AS "importeObjetivoDocumentoCentimos",
      fr.onedrive_drive_id AS "driveId",fr.onedrive_item_id AS "itemId",fr.archivo_onedrive AS archivo
    FROM movimientos_bancarios m
    JOIN facturas_recibidas fr ON fr.id=${sealed.invoiceId}
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    LEFT JOIN LATERAL (
      SELECT NULLIF(btrim(d.snapshot->>'label'),'') AS label
      FROM decisiones_tercero_modo_facil d
      WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
        AND NOT EXISTS (
          SELECT 1 FROM decisiones_tercero_modo_facil r
          WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil"
        )
      ORDER BY d.created_at DESC,d.id DESC LIMIT 1
    ) p1 ON TRUE
    WHERE m.id=${sealed.movementId}
      AND COALESCE(e.estado::text,'SIN_DOCUMENTO')='SIN_DOCUMENTO'
      AND ${facturaEconomicaSQL('fr')}
      AND fr.conflicto_identidad=false AND fr.duplicado_externo=false
    LIMIT 2 ${suffix}
  `)
  const source = rows.length === 1 ? rows[0] : null
  if (!source || source.movementId !== sealed.movementId || source.facturaId !== sealed.invoiceId) {
    fail(409, 'REVISION_AREA3_OBSOLETA', 'El movimiento o la factura ya no están disponibles para esta revisión.')
  }
  const documentVersion = await currentDocumentVersionTx(tx, source, row.source, lock)
  const wrappers = await tx.$queryRaw<ExistingWrapper[]>(Prisma.sql`
    SELECT d.id::text AS id,d.activo,d.importe_objetivo_centimos AS objetivo
    FROM documentos_conciliables d
    WHERE d.factura_recibida_id=${sealed.invoiceId}
      AND d.tipo='FACTURA_RECIBIDA'::"TipoDocumentoConciliable"
    ORDER BY d.id ASC LIMIT 2 ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `)
  const wrapper = wrappers.length === 1 ? wrappers[0] : null
  const netRows = wrapper ? await tx.$queryRaw<Array<{ neto: number | bigint | string | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(v.importe_centimos),0)::bigint AS neto
    FROM vinculos_movimiento_documento v
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
      AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
      AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
      AND v.documento_conciliable_id=CAST(${wrapper.id} AS uuid)
  `) : [{ neto: 0 }]
  const target = cents(source.importeObjetivoDocumentoCentimos)
  const movementAmount = cents(source.importeBancoCentimos)
  const version = cents(source.versionB4)
  const net = cents(netRows[0]?.neto)
  const aliases = movementPartyAliases({
    concepto: source.textoBanco, referencia: source.referenciaBanco, info_adicional: source.infoAdicional, tercero: source.tercero,
    entidadRazonSocial: source.entidadRazonSocial, entidadNombreComercial: source.entidadNombreComercial, terceroConfirmado: source.terceroConfirmado,
    importeCentimos: movementAmount,
  })
  const exactProvider = conciliarAliasesMatch(aliases, [source.proveedor])
  const controlled = archivoRecibidaControlado({ oneDriveDriveId: source.driveId, oneDriveItemId: source.itemId, archivoOneDrive: source.archivo }) !== null
  const wrapperSound = wrappers.length <= 1 && (!wrapper || (wrapper.activo === true && cents(wrapper.objetivo) === target))
  return {
    rowId: row.id,
    rowColor: row.color,
    rowSelectable: row.seleccionable,
    decisionHash: row.decisionHash,
    projectionSourceHash: row.sourceFingerprint,
    motivoProyeccion: sealed.reason,
    movimientoId: sealed.movementId,
    versionB4: version ?? sealed.versionB4,
    importeBancoCentimos: movementAmount ?? 0,
    fechaBanco: day(source.fechaBanco),
    textoBanco: typeof source.textoBanco === 'string' ? source.textoBanco : '',
    referenciaBanco: typeof source.referenciaBanco === 'string' ? source.referenciaBanco : null,
    proveedorExacto: exactProvider,
    tipoProveedor: exactProvider ? 'EXACT' : 'INCOHERENT',
    facturaRecibidaId: sealed.invoiceId,
    referenciaDocumento: typeof source.referenciaDocumento === 'string' ? source.referenciaDocumento : null,
    fechaDocumento: day(source.fechaDocumento),
    importeObjetivoDocumentoCentimos: target,
    netoActivoPrevioCentimos: net,
    archivoControladoDisponible: controlled,
    documentoAccesible: true,
    documentoCanonico: wrapperSound,
    documentLifecycleEligible: documentVersion.eligible,
    documentVersionHash: documentVersion.hash,
  }
}

function materialMustMatchSealedRow(material: Area3ReviewConfirmMaterial, row: SealedReviewRow): void {
  if (material.movimientoId !== row.source.movimientoId
    || material.importeBancoCentimos !== row.importeCentimos
    || material.versionB4 !== row.source.versionB4) {
    fail(409, 'DECISION_CAMBIADA', 'La propuesta cambió desde que abriste la página. Actualiza y vuelve a revisar.')
  }
}

function decisionOrFail(decision: Area3ReviewDecision): asserts decision is Extract<Area3ReviewDecision, { ok: true }> {
  if (decision.ok) return
  throw new Area3ReviewConfirmDbError(
    decision.codigo === 'ACK_REQUERIDO' ? 422 : 409,
    decision.codigo,
    decision.mensaje,
  )
}

/** Same G7 core as apply, without mutation. The acknowledgement is deliberately
 * absent: callers can render one plain warning only when ACK_REQUERIDO is the
 * sole remaining condition. */
export async function preflightArea3ReviewConfirmTx(tx: Tx, row: SealedReviewRow) {
  const material = await currentMaterialTx(tx, row, false)
  materialMustMatchSealedRow(material, row)
  const decision = evaluateArea3ReviewConfirm(material)
  return {
    material,
    decision,
    puedeAbrirRevisionHumana: decision.ok || (!decision.ok && decision.codigo === 'ACK_REQUERIDO'),
  }
}

/**
 * Applies exactly one DOCUMENTO B4 line after the Area 3 core has accepted the
 * signed acknowledgement. No input supplies an amount, provider, source ID,
 * lifecycle version or difference reason. `confirmarB4Tx` rechecks live source,
 * document capacity, current permission/audit transaction and undo semantics.
 */
export async function confirmArea3ReviewTx(
  tx: Tx,
  actorId: number,
  operationId: string,
  row: SealedReviewRow,
  acknowledgement: Area3ReviewAcknowledgement,
) {
  const material = await currentMaterialTx(tx, row, true)
  materialMustMatchSealedRow(material, row)
  const decision = evaluateArea3ReviewConfirm(material, acknowledgement)
  decisionOrFail(decision)
  const wrapper: any = await createDocumentoB4Tx(tx, actorId, {
    action: 'documento', tipoDocumento: 'FACTURA_RECIBIDA', sourceId: material.facturaRecibidaId,
  })
  const confirmed: any = await confirmarB4Tx(tx, actorId, {
    action: 'confirmar', confirmacion: true,
    idempotencyKey: derivedUuidV4('AREA3_REVIEW_CONFIRM', `${operationId}:${row.id}`),
    version: material.versionB4,
    borrador: {
      movimientoId: material.movimientoId,
      importeMovimientoCentimos: decision.importeLineaCentimos,
      estado: 'JUSTIFICADO',
      lineas: [{ tipo: 'DOCUMENTO', documentoConciliableId: wrapper.documento.id, importeCentimos: decision.importeLineaCentimos }],
    },
  })
  if (confirmed.idempotente) fail(409, 'B4_IDEMPOTENCY_EXTERNA', 'La decisión ya existe fuera del recibo de Conciliar; actualiza la lista.')
  return {
    operationB4Id: String(confirmed.operacion.id),
    result: {
      state: 'confirmada', movimientoId: material.movimientoId, operationB4Id: String(confirmed.operacion.id),
      sourceKind: 'PAGO_FACTURA_RECIBIDA',
      review: {
        schema: 'AREA3_REVIEW_APPROVED_V1',
        acknowledgementSchema: acknowledgement.schema,
        acknowledgementVersion: acknowledgement.version,
        motivo: decision.motivo,
        sourceHash: decision.sourceHash,
        decisionHash: row.decisionHash,
        advertencia: decision.advertencia,
      },
    },
  }
}
