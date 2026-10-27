import { createHash, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import {
  assessConfirmingLiquidationEvidence,
  type ConfirmingLiquidationEvidence,
} from './confirming-liquidation-core'

/**
 * Persistencia C11 para un inventario ya archivado y validado por el loader.
 *
 * El caller proporciona una transacción SERIALIZABLE abierta y las identidades
 * de actor real/efectivo ya autorizadas. Este módulo no abre conexiones, no
 * descarga/parsea archivos, no modifica tablas legacy, no crea movimientos ni
 * aplica B4. Sólo inserta tablas C11 aditivas y una auditoría append-only.
 */

export const CONFIRMING_LIQUIDATION_PERSIST_SCHEMA = 'CONFIRMING_LIQUIDATION_DOCUMENTAL_V1' as const

export type ConfirmingLiquidationPersistTx = Readonly<{
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}>

export class ConfirmingLiquidationPersistError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export type PersistConfirmingLiquidationEvidenceInput = Readonly<{
  actorRealId: number
  actorEfectivoId: number
  idempotencyKey: string
  evidence: ConfirmingLiquidationEvidence
}>

export type PersistConfirmingLiquidationEvidenceResult = Readonly<{
  liquidacionId: string
  liquidacionKey: string
  confirmingId: string
  version: number
  sourceHash: string
  idempotente: boolean
  existente: boolean
}>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH = /^[a-f0-9]{64}$/
const KEY = /^[A-Za-z0-9_.:-]{1,160}$/

function fail(status: number, code: string, message: string): never {
  throw new ConfirmingLiquidationPersistError(status, code, message)
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  throw new Error('CONFIRMING_LIQUIDATION_PERSIST_CANONICAL_INVALID')
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !KEY.test(value)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value
}

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe ser UUID canónico.`)
  return value.toLowerCase()
}

function actor(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`)
  return value as number
}

function snapshot(evidence: ConfirmingLiquidationEvidence): Record<string, unknown> {
  return {
    schema: CONFIRMING_LIQUIDATION_PERSIST_SCHEMA,
    liquidacionKey: evidence.id,
    confirmingId: evidence.confirmingId,
    banco: evidence.banco,
    fechaLiquidacion: evidence.fechaLiquidacion,
    cuentaDepositariaId: evidence.cuentaDepositariaId,
    sourceHash: evidence.sourceHash,
    documentos: evidence.documentos.map((document) => ({
      id: document.id,
      rol: document.rol,
      facturaRecibidaId: document.facturaRecibidaId,
      hashBinario: document.hashBinario,
      procedencia: document.procedencia,
      archivoControladoId: document.archivoControladoId,
      oneDriveDriveId: document.oneDriveDriveId,
      oneDriveItemId: document.oneDriveItemId,
      nombreOriginal: document.nombreOriginal,
    })),
    resumen: {
      nominalCentimos: evidence.nominalCentimos,
      interesesCentimos: evidence.interesesCentimos,
      comisionCentimos: evidence.comisionCentimos,
      ivaComisionCentimos: evidence.ivaComisionCentimos,
      deduccionTotalCentimos: evidence.deduccionTotalCentimos,
      netoBancarioCentimos: evidence.netoBancarioCentimos,
    },
    lineas: evidence.lineas.map((line) => ({
      id: line.id,
      confirmingLineaId: line.confirmingLineaId,
      facturaEmitidaId: line.facturaEmitidaId,
      numeroFactura: line.numeroFactura,
      nominalCentimos: line.nominalCentimos,
      fechaEmision: line.fechaEmision,
      fechaEmisionProcedencia: line.fechaEmisionProcedencia ?? 'DOCUMENTO',
      fechaLineaDocumental: line.fechaLineaDocumental ?? null,
      fechaVencimiento: line.fechaVencimiento,
      interesesExplicitosCentimos: line.interesesExplicitosCentimos,
      comisionExplicitaCentimos: line.comisionExplicitaCentimos,
    })),
  }
}

function resultSnapshot(result: PersistConfirmingLiquidationEvidenceResult): Record<string, unknown> {
  return { schema: CONFIRMING_LIQUIDATION_PERSIST_SCHEMA, ...result }
}

function parseReplay(value: unknown): PersistConfirmingLiquidationEvidenceResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const liquidacionId = typeof row.liquidacionId === 'string' && UUID.test(row.liquidacionId) ? row.liquidacionId : null
  const liquidacionKey = typeof row.liquidacionKey === 'string' && KEY.test(row.liquidacionKey) ? row.liquidacionKey : null
  const confirmingId = typeof row.confirmingId === 'string' && KEY.test(row.confirmingId) ? row.confirmingId : null
  const sourceHash = typeof row.sourceHash === 'string' && HASH.test(row.sourceHash) ? row.sourceHash : null
  const version = typeof row.version === 'number' && Number.isSafeInteger(row.version) && row.version >= 1 ? row.version : null
  if (!liquidacionId || !liquidacionKey || !confirmingId || !sourceHash || version === null || typeof row.idempotente !== 'boolean' || typeof row.existente !== 'boolean') return null
  return { liquidacionId, liquidacionKey, confirmingId, version, sourceHash, idempotente: row.idempotente, existente: row.existente }
}

async function assertControlledSources(tx: ConfirmingLiquidationPersistTx, evidence: ConfirmingLiquidationEvidence): Promise<void> {
  const documentIds = [...new Set(evidence.documentos.map((document) => identifier(document.facturaRecibidaId, 'facturaRecibidaId')))].sort()
  if (!documentIds.includes(identifier(evidence.confirmingId, 'confirmingId'))) fail(409, 'CONFIRMING_PRINCIPAL_AUSENTE', 'La evidencia no contiene el documento principal confirming.')
  const rows = await tx.$queryRaw<Array<{ id: string; hasRegisteredFile: boolean }>>(Prisma.sql`
    SELECT fr.id,(COALESCE(fr.onedrive_item_id,'')<>'' OR COALESCE(fr.archivo_onedrive,'')<>'' OR COALESCE(fr.archivo_url,'')<>'') AS "hasRegisteredFile"
    FROM facturas_recibidas fr
    WHERE fr.id IN (${Prisma.join(documentIds.map((value) => Prisma.sql`${value}`))})
    ORDER BY fr.id ASC
    LIMIT ${documentIds.length + 1}
    FOR KEY SHARE
  `)
  if (rows.length !== documentIds.length || rows.some((row) => !documentIds.includes(row.id) || row.hasRegisteredFile !== true)) {
    fail(409, 'FUENTE_CONFIRMING_NO_REGISTRADA', 'Una fuente archivada ya no conserva un documento registrado con archivo controlable.')
  }
}

async function assertCurrentTargets(tx: ConfirmingLiquidationPersistTx, evidence: ConfirmingLiquidationEvidence): Promise<void> {
  const invoiceIds = evidence.lineas.map((line) => identifier(line.facturaEmitidaId, 'facturaEmitidaId'))
  const rows = await tx.$queryRaw<Array<{ id: string; numFactura: string; fecha: string; totalCentimos: unknown }>>(Prisma.sql`
    SELECT fe.id,fe.num_factura AS "numFactura",fe.fecha::date::text AS fecha,(fe.total::text::numeric*100)::bigint AS "totalCentimos"
    FROM facturas_emitidas fe
    WHERE fe.id IN (${Prisma.join(invoiceIds.map((value) => Prisma.sql`${value}`))})
    ORDER BY fe.id ASC
    LIMIT ${invoiceIds.length + 1}
    FOR KEY SHARE
  `)
  if (rows.length !== invoiceIds.length) fail(409, 'FACTURA_EMITIDA_CAMBIADA', 'Falta una factura emitida de la evidencia archivada.')
  const targets = new Map(rows.map((row) => [row.id, row]))
  for (const line of evidence.lineas) {
    const target = targets.get(line.facturaEmitidaId)
    if (!target || target.numFactura !== line.numeroFactura || target.fecha !== line.fechaEmision || Number(target.totalCentimos) !== line.nominalCentimos) {
      fail(409, 'FACTURA_EMITIDA_CAMBIADA', 'La identidad, fecha o nominal de una factura emitida ya no coincide con la evidencia.')
    }
  }
  const account = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM cuentas_bancarias WHERE id=${identifier(evidence.cuentaDepositariaId, 'cuentaDepositariaId')} AND activa=true LIMIT 2 FOR KEY SHARE
  `)
  if (account.length !== 1) fail(409, 'CUENTA_DEPOSITARIA_NO_VIGENTE', 'La cuenta depositaria explícita no existe o ya no está activa.')
}

/**
 * Inserta una versión C11 en la transacción del caller. Repetir con el mismo
 * actor/clave/payload devuelve el mismo resultado; repetir el mismo hash con
 * otra clave no duplica la evidencia. Un hash nuevo añade versión n+1 sin UPDATE.
 */
export async function persistConfirmingLiquidationEvidenceTx(
  tx: ConfirmingLiquidationPersistTx,
  raw: PersistConfirmingLiquidationEvidenceInput,
): Promise<PersistConfirmingLiquidationEvidenceResult> {
  const actorRealId = actor(raw.actorRealId, 'actorRealId')
  const actorEfectivoId = actor(raw.actorEfectivoId, 'actorEfectivoId')
  const idempotencyKey = uuid(raw.idempotencyKey, 'idempotencyKey')
  const evidence = raw.evidence
  identifier(evidence.id, 'liquidacionKey')
  identifier(evidence.confirmingId, 'confirmingId')
  const assessment = assessConfirmingLiquidationEvidence(evidence)
  if (!assessment.cuadroExacto) fail(409, 'EVIDENCIA_LIQUIDACION_INVALIDA', `La evidencia confirming no cumple el contrato: ${assessment.bloqueos.join(',')}.`)
  const payloadHash = sha256({ schema: CONFIRMING_LIQUIDATION_PERSIST_SCHEMA, actorRealId, actorEfectivoId, idempotencyKey, evidence })

  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`confirming-liquidation:${evidence.confirmingId}:${evidence.id}`}, 0))::text AS locked`)
  const replayRows = await tx.$queryRaw<Array<{ payloadHash: string; snapshot: unknown }>>(Prisma.sql`
    SELECT payload_hash AS "payloadHash",snapshot FROM auditorias_liquidacion_confirming
    WHERE actor_real_id=${actorRealId} AND idempotency_key=${idempotencyKey}
    LIMIT 2 FOR KEY SHARE
  `)
  if (replayRows.length) {
    const replay = parseReplay(replayRows[0]?.snapshot)
    if (replayRows.length !== 1 || replayRows[0]?.payloadHash !== payloadHash || !replay) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave idempotente C11 ya se usó con otra decisión.')
    return { ...replay, idempotente: true }
  }

  await assertControlledSources(tx, evidence)
  await assertCurrentTargets(tx, evidence)
  const same = await tx.$queryRaw<Array<{ id: string; version: unknown; sourceHash: string }>>(Prisma.sql`
    SELECT id::text AS id,version,fuente_hash AS "sourceHash"
    FROM liquidaciones_confirming_documentales
    WHERE confirming_id=${evidence.confirmingId} AND liquidacion_key=${evidence.id}
    ORDER BY version DESC LIMIT 2 FOR UPDATE
  `)
  const exact = same.find((row) => row.sourceHash === evidence.sourceHash)
  if (exact) {
    const version = Number(exact.version)
    if (!UUID.test(exact.id) || !Number.isSafeInteger(version) || version < 1) fail(409, 'EVIDENCIA_C11_CORRUPTA', 'La evidencia C11 existente no tiene identidad/version válida.')
    return { liquidacionId: exact.id, liquidacionKey: evidence.id, confirmingId: evidence.confirmingId, version, sourceHash: evidence.sourceHash, idempotente: true, existente: true }
  }
  const latest = same[0]
  const version = latest ? Number(latest.version) + 1 : 1
  if (!Number.isSafeInteger(version) || version < 1) fail(409, 'EVIDENCIA_C11_CORRUPTA', 'No se puede calcular la siguiente versión C11.')
  const liquidacionId = randomUUID()
  const evidenceSnapshot = snapshot(evidence)
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO liquidaciones_confirming_documentales
      (id,confirming_id,liquidacion_key,version,banco,tipo_documento,estado_documental,fecha_liquidacion,cuenta_depositaria_id,
       nominal_centimos,intereses_centimos,comision_centimos,iva_comision_centimos,deduccion_total_centimos,neto_bancario_centimos,
       fuente_hash,fuente_snapshot,actor_real_id,actor_efectivo_id)
    VALUES
      (CAST(${liquidacionId} AS uuid),${evidence.confirmingId},${evidence.id},${version},${evidence.banco}::"BancoLiquidacionConfirming",
       'LIQUIDACION'::"TipoDocumentoLiquidacionConfirming",'CUADRA'::"EstadoEvidenciaLiquidacionConfirming",CAST(${evidence.fechaLiquidacion!} AS date),${evidence.cuentaDepositariaId},
       ${evidence.nominalCentimos!},${evidence.interesesCentimos!},${evidence.comisionCentimos!},${evidence.ivaComisionCentimos!},${evidence.deduccionTotalCentimos},${evidence.netoBancarioCentimos!},
       ${evidence.sourceHash},CAST(${JSON.stringify(evidenceSnapshot)} AS jsonb),${actorRealId},${actorEfectivoId})
  `)
  for (const document of evidence.documentos) {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO documentos_liquidacion_confirming
        (id,liquidacion_id,factura_recibida_id,rol,hash_binario,procedencia,archivo_controlado_id,onedrive_drive_id,onedrive_item_id,nombre_original)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${liquidacionId} AS uuid),${document.facturaRecibidaId},${document.rol}::"RolDocumentoLiquidacionConfirming",${document.hashBinario},
         'ARCHIVO_DESCARGADO_CONTROLADO'::"ProcedenciaDocumentoLiquidacionConfirming",${document.archivoControladoId},${document.oneDriveDriveId},${document.oneDriveItemId},${document.nombreOriginal})
    `)
  }
  for (const line of evidence.lineas) {
    await tx.$queryRaw(Prisma.sql`
      INSERT INTO lineas_liquidacion_confirming
        (id,liquidacion_id,confirming_linea_id,factura_emitida_id,numero_factura,nominal_centimos,fecha_emision,fecha_vencimiento,
         intereses_explicitos_centimos,comision_explicita_centimos,fuente_snapshot)
      VALUES
        (CAST(${randomUUID()} AS uuid),CAST(${liquidacionId} AS uuid),${line.confirmingLineaId},${line.facturaEmitidaId},${line.numeroFactura},${line.nominalCentimos!},
         CAST(${line.fechaEmision!} AS date),CAST(${line.fechaVencimiento} AS date),${line.interesesExplicitosCentimos},${line.comisionExplicitaCentimos},CAST(${JSON.stringify(line)} AS jsonb))
    `)
  }
  const result: PersistConfirmingLiquidationEvidenceResult = {
    liquidacionId,
    liquidacionKey: evidence.id,
    confirmingId: evidence.confirmingId,
    version,
    sourceHash: evidence.sourceHash,
    idempotente: false,
    existente: false,
  }
  await tx.$queryRaw(Prisma.sql`
    INSERT INTO auditorias_liquidacion_confirming
      (id,liquidacion_id,actor_real_id,actor_efectivo_id,accion,idempotency_key,payload_hash,snapshot)
    VALUES
      (CAST(${randomUUID()} AS uuid),CAST(${liquidacionId} AS uuid),${actorRealId},${actorEfectivoId},'CARGA_EVIDENCIA'::"AccionAuditoriaLiquidacionConfirming",${idempotencyKey},${payloadHash},CAST(${JSON.stringify(resultSnapshot(result))} AS jsonb))
  `)
  return result
}
