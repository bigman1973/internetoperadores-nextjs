/*
 * B6 remesas — adapter de BD preparado para integrar, no activado por esta entrega.
 *
 * Deliberately raw SQL: the schema fragment has not generated a Prisma client yet,
 * and the only allowed Factura write must not touch its legacy @updatedAt column.
 * Copy only after the reviewed B6 migration/guards exist in isolated staging.
 */
import { randomUUID } from 'crypto'
import {verificarPermisoServer} from '@/lib/permisos'
import {B4_CONCILIACION_AREA} from '@/lib/finanzas/reconciliation-auth'
import { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { convertirImporteUiACentimos } from '@/lib/finanzas/reconciliation-core'
import {
  B6_AUDIT_SCHEMA_VERSION,
  B6_INT_MAX,
  B6RemesaServiceError,
  b6Fail,
  canonicalSha256,
  facturasSourceHash,
  opaqueId,
  parseAsociarDevolucionInput,
  parseAsociarFacturasInput,
  remesaSourceFingerprint,
  requestHash,
  simulateAssociationValidation,
  simulateRefundValidation,
  type AsociarDevolucionInput,
  type AsociarFacturasInput,
  type FacturaFuenteActual,
} from './b6-remesas-pure'

export { B6RemesaServiceError } from './b6-remesas-pure'

type Tx = Prisma.TransactionClient & { [key: string]: unknown }
const MAX_PAGE_SIZE = 100
const MAX_PAGE_OFFSET = 100_000

type RemesaLockedRow = {
  id: number
  ispGestionId: number
  nombre: string | null
  fecha: string | null
  totalTexto: string | null
  numeroRegistros: number | null
}
type FacturaLockedRow = {
  id: number
  ispGestionId: number
  fecha: string | null
  totalTexto: string | null
  remesaId: number | null
}
type FiLockedRow = { id: string; facturaISPId: number; totalTexto: string | null }
type PriorAuditRow = { id: string; accion: string; payloadHash: string; snapshotResultado: unknown }
type LinkLockedRow = {
  id: string
  movimientoId: string
  activo: boolean
  tipoLinea: string
  importeCentimos: number
  documentoId: string | null
  documentoActivo: boolean | null
  documentoTipo: string | null
  documentoRemesaId: number | null
  operacionEstado: string | null
  operacionRevertida: boolean
  movimientoEstado: string | null
}

type MoneyView = Readonly<{
  texto: string | null
  centimos: number | null
  exacto: boolean
  codigoFuente: string | null
}>

async function requireTransactionActor(tx:Tx,actorId:number){
 if(!Number.isSafeInteger(actorId)||actorId<1)b6Fail(403,'ACTOR_NO_AUTORIZADO','Actor financiero no autorizado.')
 await tx.$queryRaw`SELECT id FROM usuarios_admin WHERE id=${actorId} FOR SHARE`
 const admin=await tx.usuarioAdmin.findUnique({where:{id:actorId},select:{id:true,activo:true,rol:true,roles:true}})
 if(!admin?.activo)b6Fail(403,'ACTOR_NO_AUTORIZADO','Actor financiero no autorizado.')
 await tx.$queryRaw`SELECT id FROM permiso_usuarios WHERE usuario_id=${actorId} FOR SHARE`
 const access=await verificarPermisoServer(actorId,B4_CONCILIACION_AREA,admin.rol,tx)
 if(access.escritura)return
 const granular=await tx.permisoUsuario.count({where:{usuarioId:actorId,OR:[{lectura:true},{escritura:true}]}})
 if(granular===0&&[admin.rol,...(admin.roles??[])].includes('CONTABILIDAD'))return
 b6Fail(403,'ACTOR_SIN_ESCRITURA','Sin permiso financiero activo de escritura.')
}

function sourceDate(value: string | null, label: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    b6Fail(422, 'FECHA_FUENTE_DESCONOCIDA', `${label} no contiene una fecha ISO de fuente verificable.`)
  }
  return value
}

/** Exact parser only. No Number(), Float serialization, Math.round(), abs(), or zero target. */
function sourceCents(value: string | null, label: string): number {
  if (typeof value !== 'string') b6Fail(422, 'IMPORTE_FUENTE_DESCONOCIDO', `${label} no contiene un importe exacto.`)
  const parsed = convertirImporteUiACentimos(value)
  if (!parsed.ok || parsed.value === 0) {
    b6Fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${label} no es un importe firmado exacto y distinto de cero.`, 'errors' in parsed?parsed.errors:undefined)
  }
  return parsed.value as number
}

function moneyView(value: string | null): MoneyView {
  if (typeof value !== 'string') return { texto: null, centimos: null, exacto: false, codigoFuente: 'IMPORTE_FUENTE_DESCONOCIDO' }
  const parsed = convertirImporteUiACentimos(value)
  if (!parsed.ok) return { texto: value, centimos: null, exacto: false, codigoFuente: 'IMPORTE_FUENTE_NO_EXACTO' }
  if (parsed.value === 0) return { texto: value, centimos: null, exacto: false, codigoFuente: 'IMPORTE_CERO_NO_ELEGIBLE' }
  return { texto: value, centimos: parsed.value as number, exacto: true, codigoFuente: null }
}

function dateView(value: string | null): Readonly<{ iso: string | null; exacta: boolean; codigoFuente: string | null }> {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { iso: null, exacta: false, codigoFuente: 'FECHA_FUENTE_DESCONOCIDA' }
  }
  return { iso: value, exacta: true, codigoFuente: null }
}

function requirePage(limit: number, offset: number): Readonly<{ limit: number; offset: number }> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE || !Number.isInteger(offset) || offset < 0 || offset > MAX_PAGE_OFFSET) {
    b6Fail(400, 'PAGINACION_INVALIDA', `limit debe ser 1..${MAX_PAGE_SIZE} y offset 0..${MAX_PAGE_OFFSET}.`)
  }
  return { limit, offset }
}

function readQuery(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (normalized.length > 120) b6Fail(400, 'QUERY_INVALIDA', 'q no puede superar 120 caracteres.')
  return normalized || undefined
}

function json(value: unknown): string { return JSON.stringify(value) }

function toSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'bigint' ? value : typeof value === 'number' ? BigInt(value) : typeof value === 'string' && /^-?\d+$/.test(value) ? BigInt(value) : null
  if (parsed === null || parsed < BigInt(-B6_INT_MAX - 1) || parsed > BigInt(B6_INT_MAX)) {
    b6Fail(422, 'SUMA_CENTIMOS_FUERA_DE_RANGO', `${label} no cabe exactamente en Int.`)
  }
  return Number(parsed)
}

function associationSnapshot(
  remesa: Readonly<{ id: number; ispGestionId: number; fecha: string; totalCentimos: number }>,
  facturas: readonly FacturaFuenteActual[],
): Readonly<Record<string, unknown>> {
  const sourceHash = canonicalSha256({
    version: B6_AUDIT_SCHEMA_VERSION,
    remesa,
    facturas: facturas.map(({ id, ispGestionId, fecha, totalCentimos }) => ({ id, ispGestionId, fecha, totalCentimos })),
  })
  return {
    version: B6_AUDIT_SCHEMA_VERSION,
    sourceHash,
    // Membership is audit evidence only. It is intentionally absent from sourceHash.
    remesaBefore: remesa,
    facturas: facturas.map((factura) => ({
      id: factura.id,
      ispGestionId: factura.ispGestionId,
      fecha: factura.fecha,
      totalCentimos: factura.totalCentimos,
      remesaIdAntes: factura.remesaIdAntes,
      facturaEmitidaActual: factura.facturaEmitidaActual,
    })),
  }
}

async function lockRemesa(tx: Tx, remesaId: number): Promise<RemesaLockedRow> {
  const rows = await tx.$queryRaw<RemesaLockedRow[]>(Prisma.sql`
    SELECT r.id, r.isp_gestion_id AS "ispGestionId", r.nombre,
      r.fecha::date::text AS fecha, r.total_importe::text AS "totalTexto",
      r.numero_registros AS "numeroRegistros"
    FROM remesas r WHERE r.id = ${remesaId} FOR UPDATE
  `)
  if (rows.length !== 1) b6Fail(404, 'REMESA_NO_ENCONTRADA', 'La remesa no existe.')
  return rows[0]
}

/** Separate namespace from B4's opaque movement-ID advisory key. */
async function advisoryRemesaLock(tx: Tx, remesaId: number): Promise<void> {
  const key = `B6:remesa:${remesaId}`
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${key} AS text), 0))::text AS locked`)
}

/** B4 lock order is advisory movement key, physical bank row, then documents. */
async function advisoryAndMovementLock(tx: Tx, movimientoId: string): Promise<string> {
  await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text), 0))::text AS locked`)
  const rows = await tx.$queryRaw<Array<{ id: string; importeTexto: string | null }>>(Prisma.sql`
    SELECT id, importe::text AS "importeTexto"
    FROM movimientos_bancarios WHERE id = CAST(${movimientoId} AS text) FOR UPDATE
  `)
  if (rows.length !== 1) b6Fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
  return rows[0].importeTexto ?? ''
}

/** Called only after the minimal lock. This unique key is intentionally global per actor across B6 POST actions. */
async function priorAudit(tx: Tx, actorId: number, idempotencyKey: string): Promise<PriorAuditRow | null> {
  const rows = await tx.$queryRaw<PriorAuditRow[]>(Prisma.sql`
    SELECT id::text AS id, accion::text AS accion, payload_hash AS "payloadHash",
      snapshot_resultado AS "snapshotResultado"
    FROM auditoria_remesa_b6
    WHERE actor_id = ${actorId} AND idempotency_key = ${idempotencyKey}
    FOR KEY SHARE
  `)
  return rows[0] ?? null
}

function idempotentReplay(prior: PriorAuditRow | null, action: string, stableRequestHash: string) {
  if (!prior) return null
  if (prior.accion !== action || prior.payloadHash !== stableRequestHash) {
    b6Fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia ya se usó para otra acción o solicitud B6.')
  }
  // Do not reread/compare current source here: completed replay returns its immutable
  // committed snapshot even if a later legacy source edit becomes B7-stale.
  return { idempotente: true, advertencia: 'idempotente' as const, auditoriaId: prior.id, resultado: prior.snapshotResultado }
}

async function lockAssociationInvoices(tx: Tx, input: AsociarFacturasInput): Promise<FacturaLockedRow[]> {
  const rows = await tx.$queryRaw<FacturaLockedRow[]>(Prisma.sql`
    SELECT f.id, f.isp_gestion_id AS "ispGestionId", f.fecha::date::text AS fecha,
      f.total::text AS "totalTexto", f.remesa_id AS "remesaId"
    FROM facturas f
    WHERE f.id IN (${Prisma.join(input.facturaIdsISP)}) OR f.remesa_id = ${input.remesaId}
    ORDER BY f.id ASC FOR UPDATE
  `)
  const selected = new Set(input.facturaIdsISP)
  if (rows.filter((row) => selected.has(row.id)).length !== input.facturaIdsISP.length) {
    b6Fail(404, 'FACTURA_ISP_NO_ENCONTRADA', 'Una factura ISP no existe.')
  }
  for (const row of rows) {
    if (row.remesaId === input.remesaId && !selected.has(row.id)) {
      b6Fail(409, 'MEMBRESIA_EXISTENTE_INCOMPLETA', 'La confirmación debe incluir toda la membresía B6 ya existente de la remesa.')
    }
    if (row.remesaId !== null && row.remesaId !== input.remesaId) {
      b6Fail(409, 'FACTURA_YA_EN_OTRA_REMESA', 'B6 no reasigna una factura ISP.')
    }
  }
  return rows.filter((row) => selected.has(row.id))
}

async function lockFiMirrors(tx: Tx, facturaIds: readonly number[]): Promise<FiLockedRow[]> {
  return await tx.$queryRaw<FiLockedRow[]>(Prisma.sql`
    SELECT fi.id, fi.factura_isp_id AS "facturaISPId", fi.total::text AS "totalTexto"
    FROM facturas_emitidas fi
    WHERE fi.factura_isp_id IN (${Prisma.join([...facturaIds].sort((a, b) => a - b))})
    ORDER BY fi.factura_isp_id ASC, fi.id ASC FOR UPDATE
  `)
}

async function insertAudit(
  tx: Tx,
  record: Readonly<{
    actorId: number
    remesaId: number
    movimientoId?: string
    asignacionId?: string
    accion: 'ASOCIACION_FACTURAS_CONFIRMADA' | 'DEVOLUCION_ASOCIADA'
    idempotencyKey: string
    payloadHash: string
    sourceHash: string
    snapshotSolicitud: unknown
    snapshotResultado: unknown
  }>,
): Promise<string> {
  const id = randomUUID()
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO auditoria_remesa_b6 (
      id, actor_id, remesa_id, movimiento_id, asignacion_id, accion,
      idempotency_key, payload_hash, source_hash, snapshot_solicitud, snapshot_resultado
    ) VALUES (
      CAST(${id} AS uuid), ${record.actorId}, ${record.remesaId}, ${record.movimientoId ?? null},
      CAST(${record.asignacionId ?? null} AS uuid), CAST(${record.accion} AS "AccionAuditoriaRemesaB6"),
      ${record.idempotencyKey}, ${record.payloadHash}, ${record.sourceHash}, CAST(${json(record.snapshotSolicitud)} AS jsonb),
      CAST(${json(record.snapshotResultado)} AS jsonb)
    )
  `)
  return id
}

/**
 * POST asociar_facturas. Reads current source only after a first remesa row lock
 * and an idempotency replay probe; direct SQL UPDATE preserves facturas.updated_at.
 */
export async function confirmarAsociacionFacturasRemesaB6(actorId: number, raw: unknown) {
  const input = parseAsociarFacturasInput(raw)
  const stableRequestHash = requestHash(input)
  await assertFinanceRuntimeReady()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    await requireTransactionActor(tx,actorId)
    await advisoryRemesaLock(tx, input.remesaId)
    const remesaRow = await lockRemesa(tx, input.remesaId) // minimal row lock before replay lookup
    const replay = idempotentReplay(await priorAudit(tx, actorId, input.idempotencyKey), 'ASOCIACION_FACTURAS_CONFIRMADA', stableRequestHash)
    if (replay) return replay

    const remesa = {
      id: remesaRow.id,
      ispGestionId: remesaRow.ispGestionId,
      fecha: sourceDate(remesaRow.fecha, 'remesa.fecha'),
      totalCentimos: sourceCents(remesaRow.totalTexto, 'remesa.total_importe'),
    }
    const invoices = await lockAssociationInvoices(tx, input)
    const mirrors = await lockFiMirrors(tx, input.facturaIdsISP)
    const mixed=await tx.$queryRaw<Array<{conflicto:boolean}>>(Prisma.sql`
      SELECT EXISTS(SELECT 1 FROM documentos_conciliables d JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo
        WHERE d.tipo='REMESA'::"TipoDocumentoConciliable" AND d.remesa_id=${input.remesaId})
      AND EXISTS(SELECT 1 FROM facturas_emitidas fe JOIN documentos_conciliables d ON d.factura_emitida_id=fe.id JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo
        WHERE fe.factura_isp_id IN (${Prisma.join(input.facturaIdsISP)})) AS conflicto
    `)
    if(mixed[0]?.conflicto)b6Fail(409,'FINANCIACION_DIRECTA_Y_REMESA_REQUIERE_REVISION','Existen vínculos directos y de remesa; no se duplica ni se atribuye financiación desconocida.')

    const mirrorByFactura = new Map<number, FiLockedRow>()
    for (const mirror of mirrors) {
      if (mirrorByFactura.has(mirror.facturaISPId)) b6Fail(422, 'ESPEJO_FI_ISP_AMBIGUO', 'Hay más de un espejo FI para una factura ISP.')
      mirrorByFactura.set(mirror.facturaISPId, mirror)
    }
    const sourceFacturas: FacturaFuenteActual[] = invoices.map((invoice) => {
      const totalCentimos = sourceCents(invoice.totalTexto, `factura ISP ${invoice.id}.total`)
      const mirror = mirrorByFactura.get(invoice.id)
      return {
        id: invoice.id,
        ispGestionId: invoice.ispGestionId,
        fecha: sourceDate(invoice.fecha, `factura ISP ${invoice.id}.fecha`),
        totalCentimos,
        remesaIdAntes: invoice.remesaId,
        // FI is optional. If mapped by its actual explicit FK, it must be exact.
        facturaEmitidaActual: mirror ? { id: mirror.id, totalCentimos: sourceCents(mirror.totalTexto, `factura emitida ${mirror.id}.total`) } : null,
      }
    })
    const closure = simulateAssociationValidation(input, { remesa, facturas: sourceFacturas })
    const snapshot = associationSnapshot(remesa, sourceFacturas)
    const immutableSourceHash = String(snapshot.sourceHash)

    // The new nullable membership FK is the only source DML. updateMany would
    // mutate Factura.updatedAt; raw SQL explicitly touches only remesa_id.
    const changed = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      UPDATE facturas SET remesa_id = ${input.remesaId}
      WHERE remesa_id IS NULL AND id IN (${Prisma.join(input.facturaIdsISP)})
      RETURNING id
    `)
    const expectedNew = sourceFacturas.filter((invoice) => invoice.remesaIdAntes === null).length
    if (changed.length !== expectedNew) b6Fail(409, 'MEMBRESIA_CAMBIADA', 'La membresía cambió concurrentemente; relea antes de confirmar.')

    const result = {
      version: B6_AUDIT_SCHEMA_VERSION,
      accion: input.action,
      remesaId: input.remesaId,
      facturaIdsISP: input.facturaIdsISP,
      totalRemesaCentimos: remesa.totalCentimos,
      sumaFacturasCentimos: closure.sumaFacturasCentimos,
      facturasSourceHashSHA256: closure.facturasHashSHA256,
      sourceSnapshot: snapshot,
    }
    const auditId = await insertAudit(tx, {
      actorId, remesaId: input.remesaId, accion: 'ASOCIACION_FACTURAS_CONFIRMADA',
      idempotencyKey: input.idempotencyKey, payloadHash: stableRequestHash, sourceHash: immutableSourceHash,
      snapshotSolicitud: input, snapshotResultado: result,
    })
    return { idempotente: false, auditoriaId: auditId, resultado: result }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

async function lockRefundLinkAfterBank(tx: Tx, vinculoId: string): Promise<LinkLockedRow> {
  const rows = await tx.$queryRaw<LinkLockedRow[]>(Prisma.sql`
    SELECT v.id::text AS id, v.movimiento_id AS "movimientoId", v.activo,
      v.tipo_linea::text AS "tipoLinea", v.importe_centimos AS "importeCentimos",
      d.id::text AS "documentoId", d.activo AS "documentoActivo", d.tipo::text AS "documentoTipo",
      d.remesa_id AS "documentoRemesaId", o.estado::text AS "operacionEstado",
      (o.revertida_at IS NOT NULL) AS "operacionRevertida", e.estado::text AS "movimientoEstado"
    FROM vinculos_movimiento_documento v
    JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
    JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
    JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
    WHERE v.id = CAST(${vinculoId} AS uuid)
    FOR UPDATE OF v, d, o, e
  `)
  if (rows.length !== 1) b6Fail(422, 'EVIDENCIA_B4_DEVOLUCION_INVALIDA', 'El vínculo B4 no contiene toda la evidencia documental actual requerida.')
  return rows[0]
}

async function lockRefundFactura(tx: Tx, facturaISPId: number): Promise<FacturaLockedRow> {
  const rows = await tx.$queryRaw<FacturaLockedRow[]>(Prisma.sql`
    SELECT f.id, f.isp_gestion_id AS "ispGestionId", f.fecha::date::text AS fecha,
      f.total::text AS "totalTexto", f.remesa_id AS "remesaId"
    FROM facturas f WHERE f.id = ${facturaISPId} FOR UPDATE
  `)
  if (rows.length !== 1) b6Fail(404, 'FACTURA_ISP_NO_ENCONTRADA', 'La factura ISP no existe.')
  return rows[0]
}

async function refundLineCount(tx: Tx, movimientoId: string, remesaId: number): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
    SELECT COUNT(*) AS total
    FROM vinculos_movimiento_documento v
    JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
    WHERE v.movimiento_id = ${movimientoId} AND v.activo = true
      AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
      AND d.activo = true AND d.tipo = 'REMESA'::"TipoDocumentoConciliable" AND d.remesa_id = ${remesaId}
  `)
  return toSafeInteger(rows[0]?.total ?? 0, 'El número de líneas de devolución')
}

async function existingRefundState(tx: Tx, facturaISPId: number, vinculoId: string): Promise<Readonly<{ vinculoYaUsado: boolean; yaDevueltoVigenteCentimos: number }>> {
  // Lock durable B6 rows before capacity arithmetic. Only B4-current evidence is
  // counted, therefore a later B4 deshacer makes its immutable audit pointer ignored.
  const used = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id::text AS id FROM asignaciones_devolucion_remesa_b6
    WHERE vinculo_id = CAST(${vinculoId} AS uuid) FOR UPDATE
  `)
  const sumRows = await tx.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
    SELECT COALESCE(SUM(-a.importe_centimos), 0) AS total
    FROM asignaciones_devolucion_remesa_b6 a
    JOIN vinculos_movimiento_documento v ON v.id = a.vinculo_id AND v.activo = true
    JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
      AND d.activo = true AND d.tipo = 'REMESA'::"TipoDocumentoConciliable"
    JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
      AND o.estado = 'APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id = a.movimiento_id
      AND e.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE a.factura_isp_id = ${facturaISPId}
      AND a.estado = 'CONFIRMADA'::"EstadoAsignacionDevolucionRemesaB6"
  `)
  return { vinculoYaUsado: used.length > 0, yaDevueltoVigenteCentimos: toSafeInteger(sumRows[0]?.total ?? 0, 'Las devoluciones vigentes') }
}

/**
 * POST asociar_devolucion. It links one whole B4 negative REMESA line to one
 * invoice; a group/refund split has no B6 proration path and is rejected.
 */
export async function confirmarAsociacionDevolucionRemesaB6(actorId: number, raw: unknown) {
  const input = parseAsociarDevolucionInput(raw)
  const stableRequestHash = requestHash(input)
  await assertFinanceRuntimeReady()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    await requireTransactionActor(tx,actorId)
    // Required B4 order: bank advisory lock -> physical bank row -> B4 wrapper.
    const importeBancoTexto = await advisoryAndMovementLock(tx, input.movimientoId)
    const replay = idempotentReplay(await priorAudit(tx, actorId, input.idempotencyKey), 'DEVOLUCION_ASOCIADA', stableRequestHash)
    if (replay) return replay

    const link = await lockRefundLinkAfterBank(tx, input.vinculoId)
    const remesa = await lockRemesa(tx, input.remesaId)
    const factura = await lockRefundFactura(tx, input.facturaISPId)
    const existing = await existingRefundState(tx, input.facturaISPId, input.vinculoId)
    const linesForSameRemesa = await refundLineCount(tx, input.movimientoId, input.remesaId)
    if (linesForSameRemesa !== 1) {
      b6Fail(422, 'GRUPO_DEVOLUCION_REQUIERE_REVISION_MANUAL', 'Una devolución con varias líneas REMESA no puede prorratearse ni asignarse automáticamente en B6.')
    }

    const bankCentimos = sourceCents(importeBancoTexto || null, 'movimiento.importe')
    const cierre=(await tx.$queryRaw<Array<{suma:bigint;documentos:bigint}>>(Prisma.sql`SELECT COALESCE(SUM(importe_centimos),0) AS suma,COUNT(*) FILTER(WHERE tipo_linea='DOCUMENTO'::"TipoLineaVinculo") AS documentos FROM vinculos_movimiento_documento WHERE movimiento_id=${input.movimientoId} AND activo`))[0]

    const invoiceCentimos = sourceCents(factura.totalTexto, `factura ISP ${factura.id}.total`)
    const refundProof = simulateRefundValidation(input, {
      remesaId: remesa.id,
      facturaISPId: factura.id,
      facturaRemesaId: factura.remesaId,
      facturaObjetivoCentimos: invoiceCentimos,
      bancoCentimos: bankCentimos,
      cierreB4Centimos:toSafeInteger(cierre.suma,'El cierre B4'),
      numeroLineasDocumentoB4:toSafeInteger(cierre.documentos,'El número de documentos B4'),
      vinculo: {
        id: link.id, movimientoId: link.movimientoId, activo: link.activo,
        tipoLinea: link.tipoLinea === 'DOCUMENTO' ? 'DOCUMENTO' : 'DIFERENCIA',
        importeCentimos: link.importeCentimos, documentoActivo: link.documentoActivo === true,
        documentoTipo: link.documentoTipo ?? '', documentoRemesaId: link.documentoRemesaId,
        operacionEstado: link.operacionEstado ?? '', operacionRevertida: link.operacionRevertida,
        movimientoEstado: link.movimientoEstado ?? '',
      },
      yaDevueltoVigenteCentimos: existing.yaDevueltoVigenteCentimos,
      vinculoYaUsado: existing.vinculoYaUsado,
    })

    const asignacionId = randomUUID()
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO asignaciones_devolucion_remesa_b6 (
        id, remesa_id, factura_isp_id, movimiento_id, vinculo_id, importe_centimos,
        estado, confirmada_por_id, confirmada_at
      ) VALUES (
        CAST(${asignacionId} AS uuid), ${input.remesaId}, ${input.facturaISPId}, ${input.movimientoId},
        CAST(${input.vinculoId} AS uuid), ${refundProof.importeCentimos},
        'CONFIRMADA'::"EstadoAsignacionDevolucionRemesaB6", ${actorId}, CURRENT_TIMESTAMP
      )
    `)
    const sourceSnapshot = {
      version: B6_AUDIT_SCHEMA_VERSION,
      remesa: {
        id: remesa.id, ispGestionId: remesa.ispGestionId,
        fecha: sourceDate(remesa.fecha, 'remesa.fecha'), totalCentimos: sourceCents(remesa.totalTexto, 'remesa.total_importe'),
      },
      facturaISP: {
        id: factura.id, ispGestionId: factura.ispGestionId, remesaId: factura.remesaId,
        fecha: sourceDate(factura.fecha, `factura ISP ${factura.id}.fecha`), totalCentimos: invoiceCentimos,
      },
      banco: { movimientoId: input.movimientoId, importeCentimos: bankCentimos, estadoActual: link.movimientoEstado },
      vinculoB4: {
        id: link.id, documentoId: link.documentoId, documentoTipo: link.documentoTipo,
        documentoRemesaId: link.documentoRemesaId, activo: link.activo,
        importeCentimos: link.importeCentimos, operacionCreacionEstado: link.operacionEstado,
        operacionCreacionRevertida: link.operacionRevertida,
      },
      // Current B4 proof state; never legacy paid/cobrado fields.
      devolucionesVigentesAntesCentimos: existing.yaDevueltoVigenteCentimos,
      capacidadRestanteCentimos: refundProof.capacidadRestanteCentimos,
    }
    const result = {
      version: B6_AUDIT_SCHEMA_VERSION, accion: input.action, asignacionId,
      remesaId: input.remesaId, facturaISPId: input.facturaISPId, movimientoId: input.movimientoId,
      vinculoId: input.vinculoId, importeCentimos: refundProof.importeCentimos, sourceSnapshot,
    }
    const auditId = await insertAudit(tx, {
      actorId, remesaId: input.remesaId, movimientoId: input.movimientoId, asignacionId,
      accion: 'DEVOLUCION_ASOCIADA', idempotencyKey: input.idempotencyKey,
      payloadHash: stableRequestHash,
      sourceHash: canonicalSha256({
        version: B6_AUDIT_SCHEMA_VERSION,
        remesa: { id: remesa.id, ispGestionId: remesa.ispGestionId, fecha: sourceDate(remesa.fecha, 'remesa.fecha'), totalCentimos: sourceCents(remesa.totalTexto, 'remesa.total_importe') },
        facturaISP: { id: factura.id, ispGestionId: factura.ispGestionId, fecha: sourceDate(factura.fecha, `factura ISP ${factura.id}.fecha`), totalCentimos: invoiceCentimos },
        banco: { movimientoId: input.movimientoId, importeCentimos: bankCentimos },
        vinculoB4: { id: link.id, importeCentimos: link.importeCentimos },
      }),
      snapshotSolicitud: input, snapshotResultado: result,
    })
    return { idempotente: false, auditoriaId: auditId, resultado: result }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

/** Read-only, paginated remittance picker. Monetary sources are read only as ::text. */
export async function readRemesasListaB6(raw: Readonly<{ limit?: number; offset?: number; q?: string }>) {
  await assertFinanceRuntimeReady()
  const { limit, offset } = requirePage(raw.limit ?? 50, raw.offset ?? 0)
  const q = readQuery(raw.q)
  const pattern = q ? `%${q}%` : null
  const where = q ? Prisma.sql`(
    r.nombre ILIKE ${pattern} OR CAST(r.isp_gestion_id AS text) ILIKE ${pattern}
  )` : Prisma.sql`TRUE`
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Array<RemesaLockedRow>>(Prisma.sql`
      SELECT r.id, r.isp_gestion_id AS "ispGestionId", r.nombre,
        r.fecha::date::text AS fecha, r.total_importe::text AS "totalTexto",
        r.numero_registros AS "numeroRegistros"
      FROM remesas r WHERE ${where}
      ORDER BY r.fecha DESC, r.id ASC LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`SELECT COUNT(*) AS total FROM remesas r WHERE ${where}`),
  ])
  return {
    recurso: 'remesasLista' as const,
    paginacion: { limit, offset, total: toSafeInteger(count[0]?.total ?? 0, 'El total de remesas') },
    items: rows.map((row) => {
      const importe = moneyView(row.totalTexto)
      const fecha = dateView(row.fecha)
      const target = importe.exacto && fecha.exacta && importe.centimos !== null && fecha.iso !== null
        ? { totalCentimos: importe.centimos, sourceFingerprintSHA256: remesaSourceFingerprint({ id: row.id, ispGestionId: row.ispGestionId, fecha: fecha.iso, totalCentimos: importe.centimos }) }
        : null
      return {
        id: row.id, ispGestionId: row.ispGestionId, nombre: row.nombre ?? null,
        fecha, importe, numeroRegistros: row.numeroRegistros ?? null,
        targetSource: target,
      }
    }),
  }
}

/** Read-only invoice picker; it exposes the real Factura.nombreCompleto, never guessed customer relation names. */
export async function readFacturasISPChoicesB6(raw: Readonly<{ remesaId?: number; onlyMembers?:boolean; limit?: number; offset?: number; q?: string }>) {
  await assertFinanceRuntimeReady()
  const { limit, offset } = requirePage(raw.limit ?? 50, raw.offset ?? 0)
  const q = readQuery(raw.q)
  const remesaId = raw.remesaId === undefined ? undefined : (() => {
    if (!Number.isSafeInteger(raw.remesaId) || raw.remesaId < 1) b6Fail(400, 'VALIDATION_ERROR', 'remesaId debe ser entero positivo.')
    return raw.remesaId
  })()
  const pattern = q ? `%${q}%` : null
  if(raw.onlyMembers&&remesaId===undefined)b6Fail(400,'VALIDATION_ERROR','Los miembros requieren remesaId.')
  const membership = raw.onlyMembers ? Prisma.sql`f.remesa_id=${remesaId}` : remesaId === undefined ? Prisma.sql`f.remesa_id IS NULL` : Prisma.sql`(f.remesa_id IS NULL OR f.remesa_id = ${remesaId})`
  const search = q ? Prisma.sql`(
    f.serie_factura ILIKE ${pattern} OR f.numero_documento ILIKE ${pattern}
    OR f.nombre_completo ILIKE ${pattern} OR f.codigo_cliente ILIKE ${pattern}
    OR CAST(f.isp_gestion_id AS text) ILIKE ${pattern}
  )` : Prisma.sql`TRUE`
  const from = Prisma.sql`
    FROM facturas f
    LEFT JOIN facturas_emitidas fi ON fi.factura_isp_id = f.id
  `
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<Array<{
      id: number; ispGestionId: number; serieFactura: string | null; numeroDocumento: string | null;
      nombreCompleto: string | null; codigoCliente: string | null; fecha: string | null; totalTexto: string | null;
      remesaId: number | null; facturaEmitidaId: string | null; facturaEmitidaTotalTexto: string | null; tieneEvidenciaDirectaB4:boolean
    }>>(Prisma.sql`
      SELECT f.id, f.isp_gestion_id AS "ispGestionId", f.serie_factura AS "serieFactura",
        f.numero_documento AS "numeroDocumento", f.nombre_completo AS "nombreCompleto",
        f.codigo_cliente AS "codigoCliente", f.fecha::date::text AS fecha, f.total::text AS "totalTexto",
        f.remesa_id AS "remesaId", fi.id AS "facturaEmitidaId", fi.total::text AS "facturaEmitidaTotalTexto",
        EXISTS(SELECT 1 FROM documentos_conciliables dc JOIN vinculos_movimiento_documento vv ON vv.documento_conciliable_id=dc.id AND vv.activo WHERE dc.factura_emitida_id=fi.id) AS "tieneEvidenciaDirectaB4"
      ${from} WHERE ${membership} AND ${search}
      ORDER BY f.fecha DESC, f.id ASC LIMIT ${limit} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`
      SELECT COUNT(*) AS total ${from} WHERE ${membership} AND ${search}
    `),
  ])
  return {
    recurso: raw.onlyMembers ? 'miembrosRemesa' as const : 'facturasISPchoices' as const,
    remesaId: remesaId ?? null,
    paginacion: { limit, offset, total: toSafeInteger(count[0]?.total ?? 0, 'El total de facturas ISP') },
    items: rows.map((row) => {
      const importe = moneyView(row.totalTexto)
      const fecha = dateView(row.fecha)
      const fiImporte = row.facturaEmitidaId === null ? null : moneyView(row.facturaEmitidaTotalTexto)
      const fi = row.facturaEmitidaId === null ? null : {
        id: row.facturaEmitidaId, importe: fiImporte,
        coincideConISP: importe.exacto && fiImporte?.exacto === true && importe.centimos === fiImporte.centimos,
      }
      const source = importe.exacto && fecha.exacta && importe.centimos !== null && fecha.iso !== null
        ? {
            id: row.id, ispGestionId: row.ispGestionId, fecha: fecha.iso, totalCentimos: importe.centimos,
            sourceFingerprintSHA256: canonicalSha256({ id: row.id, ispGestionId: row.ispGestionId, fecha: fecha.iso, totalCentimos: importe.centimos }),
          }
        : null
      return {
        id: row.id, ispGestionId: row.ispGestionId, serieFactura: row.serieFactura,
        numeroDocumento: row.numeroDocumento, nombreCompleto: row.nombreCompleto,
        codigoCliente: row.codigoCliente, fecha, importe, remesaId: row.remesaId,
        facturaEmitidaActual: fi, source, tieneEvidenciaDirectaB4:row.tieneEvidenciaDirectaB4,
      }
    }),
  }
}

/** Sólo evidencia negativa B4 actual, sin asignar; las diferencias explícitas se conservan separadas. */
export async function readDevolucionesB4B6(raw:Readonly<{remesaId?:number;limit?:number;offset?:number;q?:string}>){
 await assertFinanceRuntimeReady()
 const {limit,offset}=requirePage(raw.limit??50,raw.offset??0)
 const q=readQuery(raw.q)
 if(raw.remesaId!==undefined&&(!Number.isSafeInteger(raw.remesaId)||raw.remesaId<1))b6Fail(400,'VALIDATION_ERROR','remesaId no válido.')
 const where=Prisma.sql`
   v.activo AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" AND v.importe_centimos<0
   AND d.activo AND d.tipo='REMESA'::"TipoDocumentoConciliable"
   AND d.importe_objetivo_centimos=r.total_importe*100
   AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
   AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
   AND b4_importe_bancario_centimos(m.importe)<0
   AND (SELECT COALESCE(SUM(z.importe_centimos),0) FROM vinculos_movimiento_documento z WHERE z.activo AND z.movimiento_id=m.id)=b4_importe_bancario_centimos(m.importe)
   AND (SELECT COUNT(*) FROM vinculos_movimiento_documento z WHERE z.activo AND z.movimiento_id=m.id AND z.tipo_linea='DOCUMENTO'::"TipoLineaVinculo")=1
   AND NOT EXISTS(SELECT 1 FROM asignaciones_devolucion_remesa_b6 a WHERE a.vinculo_id=v.id)
   ${raw.remesaId===undefined?Prisma.empty:Prisma.sql`AND r.id=${raw.remesaId}`}
   ${q?Prisma.sql`AND (m.concepto ILIKE ${'%'+q+'%'} OR r.nombre ILIKE ${'%'+q+'%'})`:Prisma.empty}`
 const from=Prisma.sql`FROM vinculos_movimiento_documento v
   JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
   JOIN remesas r ON r.id=d.remesa_id
   JOIN movimientos_bancarios m ON m.id=v.movimiento_id
   JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
   JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id`
 const [rows,count]=await Promise.all([
   prisma.$queryRaw<Array<{vinculoId:string;movimientoId:string;remesaId:number;fecha:string;concepto:string;importeDocumentoCentimos:number;importeBancoCentimos:number}>>(Prisma.sql`
     SELECT v.id::text AS "vinculoId",m.id AS "movimientoId",r.id AS "remesaId",m.fecha_operacion::date::text AS fecha,m.concepto,
       v.importe_centimos AS "importeDocumentoCentimos",b4_importe_bancario_centimos(m.importe) AS "importeBancoCentimos"
     ${from} WHERE ${where} ORDER BY m.fecha_operacion DESC,m.id,v.id LIMIT ${limit} OFFSET ${offset}`),
   prisma.$queryRaw<Array<{total:bigint}>>(Prisma.sql`SELECT COUNT(*) AS total ${from} WHERE ${where}`)
 ])
 return {recurso:'devolucionesB4' as const,paginacion:{limit,offset,total:toSafeInteger(count[0]?.total??0,'El total de devoluciones B4')},items:rows.map(row=>({...row,importeBancoCentimos:toSafeInteger(row.importeBancoCentimos,'El banco'),facturaAsignadaId:null}))}
}
