import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import {
  CONCILIAR_COLORS,
  CONCILIAR_EMITIDAS_GROUPS,
  CONCILIAR_TABS,
  type ConciliarColor,
  type ConciliarDocument,
  type ConciliarEmitidasGroup,
  type ConciliarGetInput,
  type ConciliarProjectionSource,
  type ConciliarRow,
  type ConciliarTab,
  CONCILIAR_DEFAULT_CUTOFF,
  textoSeguro,
} from './conciliar-contract'
import { conciliarDecisionHash, isoDay, safeInteger } from './conciliar-core'
import { ConciliarDbError } from './conciliar-errors'
import { parseParaPedirRequestMetadataRows } from './para-pedir-request-metadata'
import { safeConciliarDocumentHref } from './conciliar-file-href'

type Tx = Prisma.TransactionClient & Record<string, any>
type Db = PrismaClient & Record<string, any>
export type ProjectionSqlRow = Record<string, unknown>

const db = () => prisma as Db
const fail = (status: number, code: string, message: string): never => { throw new ConciliarDbError(status, code, message) }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}
export function json(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return object(value)
  try { return object(JSON.parse(value)) } catch { return {} }
}
export function cents(value: unknown, field: string): number {
  const parsed = safeInteger(value)
  if (parsed === null || parsed < -2_147_483_648 || parsed > 2_147_483_647) fail(409, 'PROYECCION_IMPORTE_INVALIDO', `${field} no contiene céntimos exactos.`)
  return parsed
}
export function day(value: unknown, field: string): string {
  const parsed = isoDay(value)
  if (!parsed) fail(409, 'PROYECCION_FECHA_INVALIDA', `${field} no contiene una fecha verificable.`)
  return parsed
}
export function nullableText(value: unknown, max = 1_200): string | null {
  if (typeof value !== 'string') return null
  const parsed = textoSeguro(value)
  return parsed && parsed.length <= max ? parsed : null
}
export function exactMoney(value: unknown): number | null {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return null
  const negative = value.startsWith('-')
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.')
  try {
    const integer = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2))
    const signed = negative ? -integer : integer
    if (signed < BigInt(-2_147_483_648) || signed > BigInt(2_147_483_647)) return null
    return Number(signed)
  } catch { return null }
}
export function document(value: unknown): ConciliarDocument | null {
  if (value === null || value === undefined) return null
  const row = json(value)
  const referencia = nullableText(row.referencia, 300)
  const importeCentimos = safeInteger(row.importeCentimos)
  if (!referencia || importeCentimos === null) return null
  return {
    referencia,
    tercero: nullableText(row.tercero, 300),
    importeCentimos,
    fecha: typeof row.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.fecha) ? row.fecha : null,
    href: safeConciliarDocumentHref(row.href),
  }
}
function links(value: unknown): ConciliarRow['linksMovimiento'] {
  if (!Array.isArray(value)) return undefined
  const result = value.flatMap(item => {
    const row = object(item)
    const id = nullableText(row.id, 160), href = nullableText(row.href, 300), etiqueta = nullableText(row.etiqueta, 300)
    return id && href && etiqueta ? [{ id, href, etiqueta }] : []
  })
  return result.length ? result : undefined
}
function storedSource(value: unknown): ConciliarProjectionSource | null {
  const row = json(value)
  const kind = row.kind
  if (!['COBRO_PROPUESTA', 'COBRO_CONFIRMING', 'PAGO_FACTURA_RECIBIDA', 'PAGO_TICKET_B5', 'PAGO_NOMINA', 'COMISION_BANCARIA', 'PENDIENTE_FACTURA_EMITIDA', 'TRANSFERENCIA_PROPIA', 'TRANSFERENCIA_PROPIA_MANUAL'].includes(String(kind))) return null
  const scalar = (key: string) => typeof row[key] === 'string' && row[key].length > 0 && row[key].length <= 200 ? row[key] : undefined
  const integer = (key: string) => Number.isSafeInteger(row[key]) ? Number(row[key]) : undefined
  if (kind === 'PAGO_TICKET_B5' && (!scalar('movimientoId') || !scalar('adjuntoB5Id') || !scalar('gastoId') || !scalar('documentoConciliableId') || !(integer('versionB4')! > 0))) return null
  const remesaIds = Array.isArray(row.remesaIds) && row.remesaIds.every(item => Number.isSafeInteger(item) && Number(item) > 0)
    ? row.remesaIds.map(Number).sort((a, b) => a - b) : undefined
  return {
    kind: kind as ConciliarProjectionSource['kind'],
    ...(scalar('movimientoId') ? { movimientoId: scalar('movimientoId') } : {}),
    ...(scalar('propuestaId') ? { propuestaId: scalar('propuestaId') } : {}),
    ...(scalar('proposalFingerprint') ? { proposalFingerprint: scalar('proposalFingerprint') } : {}),
    ...(typeof row.proposalCompositionHash === 'string' && /^[a-f0-9]{64}$/.test(row.proposalCompositionHash) ? { proposalCompositionHash: row.proposalCompositionHash } : {}),
    ...(integer('remesaId') !== undefined && integer('remesaId')! > 0 ? { remesaId: integer('remesaId') } : {}),
    ...(scalar('confirmingId') ? { confirmingId: scalar('confirmingId') } : {}),
    ...(scalar('confirmingSourceHash') ? { confirmingSourceHash: scalar('confirmingSourceHash') } : {}),
    ...(scalar('facturaEmitidaId') ? { facturaEmitidaId: scalar('facturaEmitidaId') } : {}),
    ...(scalar('facturaRecibidaId') ? { facturaRecibidaId: scalar('facturaRecibidaId') } : {}),
    ...(scalar('adjuntoB5Id') ? { adjuntoB5Id: scalar('adjuntoB5Id') } : {}),
    ...(scalar('gastoId') ? { gastoId: scalar('gastoId') } : {}),
    ...(scalar('documentoConciliableId') ? { documentoConciliableId: scalar('documentoConciliableId') } : {}),
    ...(scalar('nominaId') ? { nominaId: scalar('nominaId') } : {}),
    ...(scalar('movimientoParId') ? { movimientoParId: scalar('movimientoParId') } : {}),
    ...(scalar('transferFingerprint') ? { transferFingerprint: scalar('transferFingerprint') } : {}),
    ...(typeof row.pairId === 'string' && /^[a-f0-9]{64}$/.test(row.pairId) ? { pairId: row.pairId } : {}),
    ...(row.proofSource === 'DECLARACION_MANUAL_AUDITADA_V1' ? { proofSource: 'DECLARACION_MANUAL_AUDITADA_V1' as const } : {}),
    ...(integer('versionB4') !== undefined ? { versionB4: integer('versionB4') } : {}),
    ...(remesaIds ? { remesaIds } : {}),
  } as ConciliarProjectionSource
}

export function projectionRow(row: ProjectionSqlRow): ConciliarRow & { source: ConciliarProjectionSource; sourceFingerprint: string; updatedAt: string } {
  const tab = String(row.tab)
  const color = String(row.color)
  if (!(CONCILIAR_TABS as readonly string[]).includes(tab) || !(CONCILIAR_COLORS as readonly string[]).includes(color)) {
    fail(409, 'PROYECCION_CORRUPTA', 'La proyección contiene una clasificación no válida.')
  }
  const source = storedSource(row.source)
  const sourceFingerprint = typeof row.source_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(row.source_fingerprint) ? row.source_fingerprint : null
  if (!source || !sourceFingerprint) fail(409, 'PROYECCION_CORRUPTA', 'La proyección no conserva su identidad de fuente.')
  const view: Omit<ConciliarRow, 'decisionHash'> = {
    id: String(row.id), movimientoId: row.movimiento_id === null || row.movimiento_id === undefined ? null : String(row.movimiento_id),
    fecha: day(row.fecha, 'La fila'), concepto: textoSeguro(row.concepto), banco: nullableText(row.banco, 300), cuenta: nullableText(row.cuenta, 300),
    importeCentimos: cents(row.importe_centimos, 'La fila'), pendienteCentimos: cents(row.pendiente_centimos, 'La fila'), color: color as ConciliarColor,
    grupo: nullableText(row.grupo, 120), motivo: textoSeguro(row.motivo), documento: document(row.documento), propuesta: nullableText(row.propuesta, 500),
    seleccionable: row.seleccionable === true, diferenciaCentimos: cents(row.diferencia_centimos, 'La fila'),
    ...(links(row.links_movimiento) ? { linksMovimiento: links(row.links_movimiento) } : {}), detail: nullableText(row.detail, 1_600),
  }
  const updated = new Date(String(row.updated_at))
  if (!Number.isFinite(updated.getTime())) fail(409, 'PROYECCION_CORRUPTA', 'La proyección no conserva una fecha de actualización válida.')
  return { ...view, decisionHash: conciliarDecisionHash({ row: view, source, sourceFingerprint }), source, sourceFingerprint, updatedAt: updated.toISOString() }
}

function groupFilter(group: ConciliarGetInput['grupo']): Prisma.Sql | null {
  if (!group) return null
  // Es la misma normalización lingüística que usa la etiqueta de la UI, pero
  // permanece en SQL para que filtro, total, exportación y página sean una foto.
  const value = Prisma.sql`lower(COALESCE(p.grupo,''))`
  if (group === 'BANCO') return Prisma.sql`${value} ~ '(banco|comisi)'`
  if (group === 'PROVEEDORES') return Prisma.sql`${value} ~ '(recibida|proveedor)'`
  if (group === 'TARJETA') return Prisma.sql`${value} ~ 'tarjeta'`
  if (group === 'NOMINAS') return Prisma.sql`${value} ~ 'n[oó]mina'`
  if (group === 'IMPUESTOS') return Prisma.sql`${value} ~ '(impuesto|aeat|seguridad)'`
  if (group === 'TRASPASOS') return Prisma.sql`${value} ~ 'traspas'`
  if (group === 'CONFIRMING') return Prisma.sql`${value} ~ '(confirm|cesi[oó]n)'`
  if (group === 'REMESAS') return Prisma.sql`${value} ~ 'remesa'`
  if (group === 'CLIENTES') return Prisma.sql`${value} ~ 'emitida'`
  if (group === 'PRESTAMOS') return Prisma.sql`${value} ~ '(pr[eé]stamo|leasing)'`
  if (group === 'DEVOLUCIONES') return Prisma.sql`${value} ~ 'devoluci'`
  return null
}

function filters(input: Omit<ConciliarGetInput, 'tab'>): Prisma.Sql {
  const pieces: Prisma.Sql[] = []
  if (input.desde) pieces.push(Prisma.sql`p.fecha >= CAST(${input.desde} AS date)`)
  if (input.hasta) pieces.push(Prisma.sql`p.fecha <= CAST(${input.hasta} AS date)`)
  if (input.cuentaId) pieces.push(Prisma.sql`p.cuenta_id=${input.cuentaId}`)
  if (input.q) {
    // Search text is literal. % and _ must not silently broaden a user query.
    const pattern = `%${input.q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
    pieces.push(Prisma.sql`(
      p.id=${input.q} OR p.movimiento_id=${input.q} OR p.concepto ILIKE ${pattern} OR COALESCE(p.banco,'') ILIKE ${pattern} OR COALESCE(p.cuenta,'') ILIKE ${pattern}
      OR COALESCE(p.grupo,'') ILIKE ${pattern} OR COALESCE(p.documento->>'referencia','') ILIKE ${pattern}
      OR COALESCE(p.documento->>'tercero','') ILIKE ${pattern} OR CAST(p.importe_centimos AS text) ILIKE ${pattern}
    )`)
  }
  if (input.estado) pieces.push(Prisma.sql`p.color=${input.estado}`)
  const selectedGroup = groupFilter(input.grupo)
  if (selectedGroup) pieces.push(selectedGroup)
  return pieces.length ? Prisma.join(pieces, ' AND ') : Prisma.sql`TRUE`
}

function orderBy(input: ConciliarGetInput): Prisma.Sql {
  // Cada alternativa es literal cerrada; nunca se interpolan nombres de columna
  // ni dirección desde el navegador.
  if (input.orden === 'CONCEPTO') return input.direccion === 'ASC'
    ? Prisma.sql`COALESCE(p.documento->>'tercero',p.concepto) ASC,p.id ASC`
    : Prisma.sql`COALESCE(p.documento->>'tercero',p.concepto) DESC,p.id ASC`
  if (input.orden === 'IMPORTE' || !input.orden) return input.direccion === 'ASC'
    ? Prisma.sql`abs(p.importe_centimos::bigint) ASC,p.id ASC`
    : Prisma.sql`abs(p.importe_centimos::bigint) DESC,p.id ASC`
  return input.direccion === 'ASC'
    ? Prisma.sql`p.fecha ASC,p.id ASC`
    : Prisma.sql`p.fecha DESC,p.id ASC`
}
type MutableConciliarTabSummary = {
  tab: ConciliarTab
  count: number
  amountCentimos: number
  colors: Record<ConciliarColor, { count: number; amountCentimos: number }>
}
type ConciliarEmitidasGroupSummary = {
  group: ConciliarEmitidasGroup
  count: number
  amountCentimos: number
}
function summaryZero(tab: ConciliarTab): MutableConciliarTabSummary {
  return { tab, count: 0, amountCentimos: 0, colors: { VERDE: { count: 0, amountCentimos: 0 }, AMBAR: { count: 0, amountCentimos: 0 }, ROJO: { count: 0, amountCentimos: 0 } } }
}
function count(value: unknown): number { const parsed = safeInteger(value); return parsed === null || parsed < 0 ? 0 : parsed }

/**
 * PostgreSQL entrega los agregados JSON como objetos para el adaptador habitual
 * de Prisma, aunque algunos adaptadores de pruebas los representan como texto.
 * Esta frontera es deliberadamente estricta: una respuesta incompleta no se
 * convierte en una cola vacía que pudiera inducir una decisión errónea.
 */
function jsonRecords(value: unknown, field: string): ProjectionSqlRow[] {
  const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value) } catch { return null } })() : value
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    fail(409, 'PROYECCION_CORRUPTA', `${field} no conserva un resultado verificable.`)
  }
  return parsed as ProjectionSqlRow[]
}

type ProjectionReadBundle = Readonly<{
  rows: unknown
  total: unknown
  summaries: unknown
  emitidasGroups: unknown
  invalidEmitidasGroups: unknown
  historicSummary: unknown
  accounts: unknown
  state: unknown
  documentRequests?: unknown
}>

/**
 * La portada necesita página, total, pestañas, cuentas y estado de la misma
 * foto. Hacer cinco viajes independientes aumenta la apertura fría y permite
 * mezclar fotos distintas si un rebuild entra entre ellos. Esta única SELECT
 * mantiene la consulta de proyección sin DML y materializa el filtro una vez.
 */
async function readProjectionBundle(input: ConciliarGetInput, shared: Prisma.Sql, client: Pick<Tx, '$queryRaw'> = db()): Promise<ProjectionReadBundle> {
  const cutoff = input.cutoffDate ?? CONCILIAR_DEFAULT_CUTOFF
  // El corte es sólo de presentación: la foto persistida no se reescribe. Las
  // Emitidas sin fecha verificable no se reclasifican silenciosamente porque la
  // proyección sólo conserva fechas de calendario válidas.
  const activeScope = Prisma.sql`(p.tab<>'EMITIDAS' OR p.fecha>=CAST(${cutoff} AS date))`
  const pageScope = input.historic
    ? Prisma.sql`p.tab='EMITIDAS' AND p.fecha<CAST(${cutoff} AS date)`
    : Prisma.sql`p.tab=${input.tab} AND ${activeScope}`
  const emitidasScope = input.emitidasGrupo ? Prisma.sql`p.emitidas_group=${input.emitidasGrupo}` : Prisma.sql`TRUE`
  const sort = orderBy(input)
  const scopedRows = input.tab === 'EMITIDAS' && !input.historic
    ? Prisma.sql`SELECT p.* FROM active_emitidas p WHERE ${emitidasScope}`
    : Prisma.sql`SELECT p.* FROM filtered p WHERE ${pageScope}`
  const result = await client.$queryRaw<ProjectionReadBundle[]>(Prisma.sql`
    WITH filtered AS (
      SELECT p.* FROM conciliar_proyecciones p WHERE ${shared}
    ), active AS (
      SELECT p.* FROM filtered p WHERE ${activeScope}
    ), active_emitidas AS (
      SELECT p.*,
        CASE
          WHEN p.color='VERDE' AND p.propuesta IS NOT NULL THEN 'CON_PROPUESTA'
          WHEN p.color='AMBAR' THEN 'PARA_REVISAR'
          WHEN p.color='ROJO' THEN 'SIN_PROPUESTA'
          ELSE NULL
        END AS emitidas_group
      FROM active p WHERE p.tab='EMITIDAS'
    ), scoped AS (
      ${scopedRows}
    ), page AS (
      SELECT p.* FROM scoped p
      ORDER BY ${sort}
      LIMIT ${input.limit} OFFSET ${input.offset}
    ), requested_movements AS (
      SELECT DISTINCT movimiento_id FROM page WHERE movimiento_id IS NOT NULL
    ), latest_document_request AS (
      SELECT DISTINCT ON (a.movimiento_id) a.movimiento_id,a.created_at::date::text AS pedido_fecha,u.nombre AS actor_visible
      FROM auditorias_gestiones_pendientes_b5 a
      JOIN requested_movements r ON r.movimiento_id=a.movimiento_id
      LEFT JOIN usuarios_admin u ON u.id=a.actor_id
      WHERE a.snapshot_resultado->>'estado'='PEDIDO'
      ORDER BY a.movimiento_id,a.created_at DESC,a.id DESC
    ), current_request_files AS (
      SELECT a.movimiento_id,
        NOT BOOL_AND(NOT (a.estado::text='UPLOAD_COMPLETO' AND a.tipo_documento='SOPORTE')) AS soporte_b5_completo,
        NOT BOOL_AND(NOT (a.estado::text='UPLOAD_COMPLETO' AND a.tipo_documento='TICKET' AND a.gasto_id IS NOT NULL AND a.documento_conciliable_id IS NOT NULL)) AS ticket_b5_completo,
        MIN(CASE WHEN a.estado::text='UPLOAD_COMPLETO' AND a.tipo_documento IN ('TICKET','SOPORTE') THEN a.id::text ELSE NULL END) AS archivo_b5_id
      FROM adjuntos_pendientes_b5 a JOIN requested_movements r ON r.movimiento_id=a.movimiento_id
      GROUP BY a.movimiento_id
    ), document_requests AS (
      SELECT r.movimiento_id,g.estado::text AS gestion_estado,p.pedido_fecha,p.actor_visible,
        COALESCE(a.soporte_b5_completo,false) AS soporte_b5_completo,COALESCE(a.ticket_b5_completo,false) AS ticket_b5_completo,a.archivo_b5_id
      FROM requested_movements r
      LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=r.movimiento_id
      LEFT JOIN latest_document_request p ON p.movimiento_id=r.movimiento_id
      LEFT JOIN current_request_files a ON a.movimiento_id=r.movimiento_id
    ), summary AS (
      SELECT tab,color,COUNT(*)::text AS total,COALESCE(SUM(pendiente_centimos::bigint),0)::text AS amount
      FROM active GROUP BY tab,color
    ), emitidas_groups AS (
      SELECT emitidas_group AS "group",COUNT(*)::text AS total,COALESCE(SUM(pendiente_centimos::bigint),0)::text AS amount
      FROM active_emitidas WHERE emitidas_group IS NOT NULL GROUP BY emitidas_group
    ), invalid_emitidas_groups AS (
      SELECT COUNT(*)::text AS total FROM active_emitidas WHERE emitidas_group IS NULL
    ), historic_summary AS (
      SELECT COUNT(*)::text AS total,COALESCE(SUM(pendiente_centimos::bigint),0)::text AS amount
      FROM filtered p WHERE p.tab='EMITIDAS' AND p.fecha<CAST(${cutoff} AS date)
    ), account_rows AS (
      SELECT id,banco,alias FROM cuentas_bancarias WHERE activa=true
      ORDER BY banco ASC,alias ASC NULLS LAST,id ASC LIMIT 100
    ), state AS (
      SELECT dirty_at AS "dirtyAt",dirty_reason AS "dirtyReason",rebuilt_at AS "rebuiltAt",projection_version AS "projectionVersion"
      FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1
    )
    SELECT
      COALESCE((SELECT json_agg(row_to_json(p) ORDER BY ${sort}) FROM page p),'[]'::json) AS rows,
      COALESCE((SELECT json_agg(row_to_json(d) ORDER BY movimiento_id) FROM document_requests d),'[]'::json) AS "documentRequests",
      COALESCE((SELECT COUNT(*)::text FROM scoped),'0') AS total,
      COALESCE((SELECT json_agg(row_to_json(summary) ORDER BY tab ASC,color ASC) FROM summary),'[]'::json) AS summaries,
      COALESCE((SELECT json_agg(row_to_json(emitidas_groups) ORDER BY "group" ASC) FROM emitidas_groups),'[]'::json) AS "emitidasGroups",
      (SELECT total FROM invalid_emitidas_groups) AS "invalidEmitidasGroups",
      (SELECT row_to_json(historic_summary) FROM historic_summary) AS "historicSummary",
      COALESCE((SELECT json_agg(row_to_json(account_rows) ORDER BY banco ASC,alias ASC NULLS LAST,id ASC) FROM account_rows),'[]'::json) AS accounts,
      (SELECT row_to_json(state) FROM state) AS state
  `)
  if (result.length !== 1) fail(503, 'PROYECCION_NO_DISPONIBLE', 'No se pudo leer la foto de conciliación.')
  return result[0]
}

async function projectionResponse(input: ConciliarGetInput, client: Pick<Tx, '$queryRaw'>) {
  const cutoff = input.cutoffDate ?? CONCILIAR_DEFAULT_CUTOFF
  const shared = filters(input)
  const bundle = await readProjectionBundle(input, shared, client)
  const rows = jsonRecords(bundle.rows, 'Las filas')
  const summaryRows = jsonRecords(bundle.summaries, 'El resumen') as Array<{ tab: string; color: string; total: bigint | number | string; amount: bigint | number | string }>
  const emitidasGroupRows = jsonRecords(bundle.emitidasGroups, 'Los grupos de Emitidas') as Array<{ group: string; total: bigint | number | string; amount: bigint | number | string }>
  const accounts = jsonRecords(bundle.accounts, 'Las cuentas') as Array<{ id: string; banco: string; alias: string | null }>
  const invalidEmitidasGroups = safeInteger(bundle.invalidEmitidasGroups)
  if (invalidEmitidasGroups === null || invalidEmitidasGroups < 0) fail(409, 'PROYECCION_CORRUPTA', 'La clasificación de Emitidas no conserva un conteo verificable.')
  if (invalidEmitidasGroups > 0) fail(409, 'PROYECCION_CORRUPTA', 'Hay facturas emitidas activas sin una clasificación verificable.')
  const historic = json(bundle.historicSummary)
  const historicCount = safeInteger(historic.total)
  if (historicCount === null || historicCount < 0) fail(409, 'PROYECCION_CORRUPTA', 'El histórico no conserva un conteo verificable.')
  const historicSummary = { count: historicCount, amountCentimos: cents(historic.amount, 'El histórico') }
  const state = bundle.state === null || bundle.state === undefined ? undefined : json(bundle.state) as {
    dirtyAt?: Date | string | null
    dirtyReason?: string | null
    rebuiltAt?: Date | string | null
    projectionVersion?: bigint | number | string
  }
  const summaries = new Map<ConciliarTab, MutableConciliarTabSummary>(CONCILIAR_TABS.map(tab => [tab, summaryZero(tab)]))
  for (const row of summaryRows) {
    if (!(CONCILIAR_TABS as readonly string[]).includes(row.tab) || !(CONCILIAR_COLORS as readonly string[]).includes(row.color)) continue
    const item = summaries.get(row.tab as ConciliarTab)!
    const amountCentimos = cents(row.amount, 'El resumen')
    const color = row.color as ConciliarColor
    item.colors[color] = { count: count(row.total), amountCentimos }
    item.count += count(row.total)
    item.amountCentimos += amountCentimos
  }
  const emitidasGroups = new Map<ConciliarEmitidasGroup, ConciliarEmitidasGroupSummary>(CONCILIAR_EMITIDAS_GROUPS.map(group => [group, { group, count: 0, amountCentimos: 0 }]))
  const seenEmitidasGroups = new Set<ConciliarEmitidasGroup>()
  for (const row of emitidasGroupRows) {
    if (!(CONCILIAR_EMITIDAS_GROUPS as readonly string[]).includes(row.group) || seenEmitidasGroups.has(row.group as ConciliarEmitidasGroup)) {
      fail(409, 'PROYECCION_CORRUPTA', 'Los grupos de Emitidas no conservan una clasificación verificable.')
    }
    const group = row.group as ConciliarEmitidasGroup
    const groupCount = safeInteger(row.total)
    if (groupCount === null || groupCount < 0) fail(409, 'PROYECCION_CORRUPTA', 'Los grupos de Emitidas no conservan un conteo verificable.')
    emitidasGroups.set(group, { group, count: groupCount, amountCentimos: cents(row.amount, 'Los grupos de Emitidas') })
    seenEmitidasGroups.add(group)
  }
  // An initial dirty migration has no trustworthy page timestamp. Returning null
  // would be rejected by the browser contract and could look like an empty queue.
  const rebuiltAt = state?.rebuiltAt instanceof Date ? state.rebuiltAt : state?.rebuiltAt ? new Date(state.rebuiltAt) : null
  if (!rebuiltAt || !Number.isFinite(rebuiltAt.getTime())) fail(503, 'PROYECCION_NO_PREPARADA', 'La conciliación se está preparando por primera vez. Vuelve a intentarlo en unos instantes.')
  const pageRows = rows.map(projectionRow)
  const requests = parseParaPedirRequestMetadataRows(jsonRecords(bundle.documentRequests ?? [], 'La gestión documental'))
  return {
    tabs: CONCILIAR_TABS.map(tab => summaries.get(tab)!), rows: pageRows.map(({ source: _source, sourceFingerprint: _fingerprint, updatedAt: _updatedAt, ...row }) => {
      const metadata = row.movimientoId ? requests.get(row.movimientoId) : undefined
      return { ...row, ...(metadata ? { gestionDocumento: { estado: metadata.estadoPedido, pedido: metadata.pedido ? { fecha: metadata.pedido.fechaISO, por: metadata.pedido.actorVisible } : null, documentoDisponible: metadata.documentoActual.soporteB5Completo || metadata.documentoActual.ticketB5Completo || (!!row.documento && metadata.estadoPedido === 'PEDIDO'), ...(metadata.documentoActual.archivoHref ? { archivoHref: metadata.documentoActual.archivoHref } : {}) } } : {}) }
    }),
    total: count(bundle.total), limit: input.limit, offset: input.offset,
    updatedAt: rebuiltAt.toISOString(),
    projectionVersion: count(state?.projectionVersion),
    stale: !!state?.dirtyAt,
    staleReason: state?.dirtyAt ? 'Hay cambios pendientes de actualizar. Las filas no se confirmarán sin volver a comprobarlas.' : null,
    cuentas: accounts.map(row => ({ id: row.id, banco: row.banco, cuenta: row.alias })),
    cutoffDate: cutoff,
    emitidasGroups: CONCILIAR_EMITIDAS_GROUPS.map(group => emitidasGroups.get(group)!),
    historicSummary,
  }
}

/** Reads page, totals and state from the caller's current SERIALIZABLE snapshot.
 * It performs no authorization, mutation or refresh scheduling. */
export async function readConciliarProjectionTx(tx: Prisma.TransactionClient, input: ConciliarGetInput) {
  return projectionResponse(input, tx as Tx)
}

export async function readConciliarProjection(input: ConciliarGetInput) {
  return projectionResponse(input, db())
}

export async function readConciliarRow(id: string) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9:_-]{1,240}$/.test(id)) fail(400, 'FILA_INVALIDA', 'La fila solicitada no es válida.')
  const rows = await db().$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${id} LIMIT 1`)
  if (!rows.length) fail(404, 'FILA_NO_ENCONTRADA', 'La fila ya no está disponible; actualiza la lista.')
  const result = projectionRow(rows[0])
  const { source: _source, sourceFingerprint: _fingerprint, updatedAt: _updatedAt, ...row } = result
  return row
}

export async function readConciliarRowForAction(tx: Prisma.TransactionClient, id: string) {
  const rows = await (tx as Tx).$queryRaw<ProjectionSqlRow[]>(Prisma.sql`SELECT * FROM conciliar_proyecciones WHERE id=${id} LIMIT 1 FOR UPDATE`)
  if (!rows.length) fail(409, 'FILA_OBSOLETA', 'La fila ya no está disponible. Actualiza la lista.')
  return projectionRow(rows[0])
}

export async function readConciliarHistory(actorId: number, limit: number, offset: number) {
  if (!Number.isSafeInteger(actorId) || actorId < 1) fail(401, 'NO_AUTORIZADO', 'No autorizado.')
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) fail(400, 'PAGINACION_INVALIDA', 'La paginación no es válida.')
  const [rows, totals] = await Promise.all([
    db().$queryRaw<Array<{ id: string; accion: string; estado: string; resultado: unknown; createdAt: Date; revertedAt: Date | null; parentId: string | null }>>(Prisma.sql`
      SELECT id::text,accion::text,estado::text,resultado,created_at AS "createdAt",revertida_at AS "revertedAt",operacion_padre_id::text AS "parentId"
      FROM operaciones_conciliar WHERE actor_id=${actorId} ORDER BY created_at DESC,id DESC LIMIT ${limit} OFFSET ${offset}
    `),
    db().$queryRaw<Array<{ total: bigint | number | string }>>(Prisma.sql`SELECT COUNT(*) AS total FROM operaciones_conciliar WHERE actor_id=${actorId}`),
  ])
  return { total: count(totals[0]?.total), limit, offset, operations: rows.map(row => ({
    id: row.id, action: row.accion, state: row.estado, createdAt: row.createdAt.toISOString(), revertedAt: row.revertedAt?.toISOString() ?? null,
    reversible: row.accion === 'CONFIRMAR' && row.estado !== 'REVERTIDA', parentId: row.parentId, result: json(row.resultado),
  })) }
}
