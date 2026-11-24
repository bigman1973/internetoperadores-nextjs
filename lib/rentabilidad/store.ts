import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  actorSchema, canonicalDecimal, contractCode, exactCents, moneyToCents, initialSchema, isoDate, keySchema, monthSchema, safePayload, sourceHash,
  RentabilidadError, INITIAL_PRODUCTS, INITIAL_TARIFF_RULES,
  type BilledLine, type ImportReport, type JsonRecord, type RentabilidadInputs, type RentabilidadKind, type VersionCandidate,
} from './types'

type Tx = Prisma.TransactionClient
export type SavedVersion = { kind: RentabilidadKind; key: string; version: number; sourceHash: string; payload: JsonRecord }
export type VersionMutation = VersionCandidate & { replacePayload?: boolean }
const VERSION_KINDS = new Set(['contract', 'product', 'tariffRule', 'costRule', 'externalCost', 'cost', 'reference', 'exception', 'decision'])

/** Configuration proof precedes loading Prisma; no connection or provider is created at import time. */
export function assertRentabilidadConfiguration(env:Record<string,string|undefined> = process.env): void {
  let valid = false
  try {
    const url = new URL(env.DATABASE_URL ?? '')
    valid = ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname === '/io_staging_finanzas' && decodeURIComponent(url.username) === 'io_staging_finanzas'
  } catch { /* never include URL/credential in errors */ }
  if (!valid || env.FINANCE_STAGING_SANDBOX !== '1' || env.VERCEL_ENV === 'production' || env.IO_PRODUCTION_READ_ONLY === '1') throw new RentabilidadError('RENTABILIDAD_STAGING_REQUIRED', 404)
}
async function database() { assertRentabilidadConfiguration(); return (await import('../prisma')).prisma }
async function assertIsolated(tx: Pick<Tx, '$queryRaw'>) {
  assertRentabilidadConfiguration()
  const rows = await tx.$queryRaw<{ db: string; usuario: string }[]>(Prisma.sql`SELECT current_database() AS db, current_user AS usuario LIMIT 1`)
  if (rows.length !== 1 || rows[0].db !== 'io_staging_finanzas' || rows[0].usuario !== 'io_staging_finanzas') throw new RentabilidadError('RENTABILIDAD_STAGING_REQUIRED', 404)
}
async function assertActor(tx: Tx, actorId: number) {
  actorSchema.parse(actorId)
  const rows = await tx.$queryRaw<{ id: number }[]>(Prisma.sql`SELECT id FROM usuarios_admin WHERE id = ${actorId} AND activo = true AND rol::text = 'SUPER_ADMIN' LIMIT 1 FOR SHARE`)
  if (rows.length !== 1) throw new RentabilidadError('RENTABILIDAD_SUPERADMIN_REQUIRED', 403)
}
async function transaction<T>(actorId: number, operation: (tx: Tx) => Promise<T>): Promise<T> {
  const db = await database()
  return db.$transaction(async tx => {
    await assertIsolated(tx); await assertActor(tx, actorId)
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'rentabilidad:writer:v1'}, 0))::text AS locked`)
    return operation(tx)
  }, { timeout: 60_000, maxWait: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
const TABLES = { versions: 'rentabilidad_versiones', lines: 'rentabilidad_lineas', runs: 'rentabilidad_ejecuciones', snapshots: 'rentabilidad_snapshots' } as const
async function pageRead(tx: Pick<Tx, '$queryRaw'>, table: keyof typeof TABLES): Promise<JsonRecord[]> {
  const result: JsonRecord[] = []
  for (let offset = 0; ; offset += 500) {
    const rows = await tx.$queryRaw<JsonRecord[]>(Prisma.sql`SELECT id, payload FROM ${Prisma.raw(TABLES[table])} ORDER BY created_at ASC, id ASC LIMIT 500 OFFSET ${offset}`)
    result.push(...rows.map(row => ({ ...row.payload, _id: row.id })))
    if (rows.length < 500) break
  }
  return result
}
/** Alias migrations may produce legacy content keys for the same source cell.
 * Keep all historical rows, but expose only the latest observation per locator.
 * This applies to reference-only data, never to billed lines or operational costs. */
export function canonicalReferences(rows: JsonRecord[]): JsonRecord[] {
  const chosen = new Map<string, JsonRecord>()
  for (const row of rows) {
    const locator = row.sourceLocator ?? (typeof row.source === 'object' ? row.source : null)
    const identity = locator?.file && locator?.sheet && locator?.cell
      ? sourceHash({ kind: row.kind ?? 'reference', file: locator.file, sheet: locator.sheet, cell: locator.cell })
      : String(row.key ?? sourceHash(row))
    const old = chosen.get(identity)
    const observed = (r: JsonRecord) => new Date(r.__referenceSeenAt ?? 0).getTime()
    if (!old || observed(row) > observed(old) || observed(row) === observed(old) && String(row.key).localeCompare(String(old.key)) > 0) chosen.set(identity, row)
  }
  return [...chosen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => {
    const { __referenceSeenAt: ignored, ...payload } = row
    return payload
  })
}
export async function readInputs(): Promise<RentabilidadInputs> {
  const db = await database()
  return db.$transaction(async tx => {
    await assertIsolated(tx)
    const versions: SavedVersion[] = []
    for (let offset = 0; ; offset += 500) {
      const rows = await tx.$queryRaw<SavedVersion[]>(Prisma.sql`
        SELECT kind, stable_key AS key, version, source_hash AS "sourceHash", payload, created_at AS "observedAt"
        FROM (SELECT DISTINCT ON (kind, stable_key) kind, stable_key, version, source_hash, payload, created_at
          FROM rentabilidad_versiones ORDER BY kind, stable_key, version DESC) latest
        ORDER BY kind, stable_key LIMIT 500 OFFSET ${offset}`)
      versions.push(...rows); if (rows.length < 500) break
    }
    const byKind = (...kinds: string[]) => versions.filter(row => kinds.includes(row.kind)).map(row => ({ ...row.payload, key: row.key, version: row.version, sourceHash: row.sourceHash }))
    const references = canonicalReferences(versions.filter(row => row.kind === 'reference').map(row => ({ ...row.payload, key: row.key, version: row.version, sourceHash: row.sourceHash, __referenceSeenAt: (row as SavedVersion & { observedAt: Date }).observedAt })))
    return { contracts: byKind('contract'), lines: await pageRead(tx, 'lines'), costs: byKind('cost', 'externalCost'), rules: byKind('tariffRule', 'costRule'), products: byKind('product'), runs: await pageRead(tx, 'runs'), decisions: byKind('decision', 'exception'), references }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 })
}

const COMMON_ALIASES = [
  ['provider', 'proveedor'], ['product', 'productoId', 'producto'], ['tariff', 'tarifa'],
  ['clientCode', 'codigoCliente'], ['clientName', 'nombreCliente'], ['speedMbps', 'velocidadBajadaMb'],
  ['status', 'state', 'estado'], ['month', 'mes'],
]
const CONTRACT_ALIASES = [
  ['startDate', 'fechaAlta', 'fechaInicio'], ['endDate', 'fechaBaja', 'fechaFin'],
  ['periodicityMonths', 'periodMonths', 'periodicidadMeses'], ['price', 'precioPeriodo'],
  ['discount', 'descuento'], ['active', 'activo'],
]
const MONEY_ALIASES = ['baseAmount', 'amount', 'importe', 'importeBase', 'importeBaseDecimal', 'importeBaseExacto']
const MONTHLY_CACHES = ['contractedMonthlyAmount', 'importeMensualContratado', 'netoMensual', 'netMonthlyAmount']
const owns = (row: JsonRecord, field: string) => Object.prototype.hasOwnProperty.call(row, field)
function synchronizeGroups(payload: JsonRecord, groups: string[][]) {
  for (const group of groups) {
    const supplied = group.filter(field => owns(payload, field))
    if (!supplied.length) continue
    const value = payload[supplied[0]]
    // Contradictory aliases in ONE incoming row are not resolved by silently picking an old value.
    for (const field of supplied) {
      const other = payload[field]
      const decimalGroup = ['price', 'discount', 'baseAmount', 'periodicityMonths'].includes(group[0])
      const equal = decimalGroup && value != null && other != null
        ? canonicalDecimal(value) === canonicalDecimal(other) : value === other
      if (!equal) throw new RentabilidadError('ALIAS_CONFLICT')
    }
    for (const field of group) payload[field] = value
  }
}
function activeFromState(state: unknown): boolean | undefined {
  const text = String(state ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase()
  if (['ACTIVO', 'ACTIVA', 'ACTIVE', 'ALTA'].includes(text)) return true
  if (['BAJA', 'INACTIVO', 'INACTIVA', 'INACTIVE'].includes(text)) return false
  return undefined
}
/** Normalize ONLY the incoming row before merge, including explicit nulls which clear old aliases. */
export function normalizeVersionAliases(kind: RentabilidadKind, raw: JsonRecord): JsonRecord {
  const payload = safePayload(raw)
  synchronizeGroups(payload, COMMON_ALIASES)
  if (kind === 'contract') {
    synchronizeGroups(payload, CONTRACT_ALIASES)
    if (!owns(payload, 'active')) {
      // Source state remains untouched even when it contradicts a real supplied termination date.
      const active = activeFromState(payload.estadoOriginal) ?? activeFromState(payload.estado)
      if (active !== undefined) { payload.active = active; payload.activo = active }
    }
    if (payload.active != null && typeof payload.active !== 'boolean') throw new RentabilidadError('INVALID_ACTIVE')
  }
  if (kind === 'cost' || kind === 'externalCost') synchronizeGroups(payload, [MONEY_ALIASES])
  return payload
}
/** Shared by actual append-only writes and tests; no DB, clock or hidden source prioritization. */
export function mergeVersionPayload(row: VersionMutation, old?: SavedVersion): JsonRecord {
  if (row.replacePayload || row.kind !== 'contract') return safePayload(row.payload)
  const incoming = normalizeVersionAliases('contract', row.payload)
  const previous = old?.payload ?? {}
  const provenance = { ...(previous.origenPorCampo ?? {}) }
  const isp = String(incoming.source).startsWith('ISP')
  // ISP cannot repopulate an invalidated analyst cache on the second identical import.
  if (isp && old) for (const field of MONTHLY_CACHES) delete incoming[field]
  const lorenaProvider = provenance.proveedor === 'LORENA' || provenance.provider === 'LORENA'
    || (previous.source === 'LORENA' && (previous.provider || previous.proveedor))
  if (isp && lorenaProvider) {
    // Supplier and product are one classification unit: ISP cannot replace either half of Lorena's pair.
    for (const field of ['provider', 'proveedor', 'proveedorEntidadFiscalId', 'product', 'productoId', 'producto']) delete incoming[field]
  }
  const previousProvider = previous.provider ?? previous.proveedor
  if (owns(incoming, 'provider') && incoming.provider !== previousProvider && !owns(incoming, 'product')) {
    // A new supplier must never inherit the previous supplier's product. The engine classifies it afresh.
    for (const field of ['product', 'productoId', 'producto']) incoming[field] = null
  }
  const payload = { ...previous, ...incoming }
  if (isp && lorenaProvider) {
    for (const field of ['provider', 'proveedor']) payload[field] = previous.provider ?? previous.proveedor ?? null
    for (const field of ['product', 'productoId', 'producto']) payload[field] = previous.product ?? previous.productoId ?? previous.producto ?? null
  }
  const economicChange = old && ['price', 'discount', 'periodicityMonths'].some(field => {
    if (!owns(incoming, field)) return false
    const oldValue = field === 'price' ? previous.price ?? previous.precioPeriodo
      : field === 'discount' ? previous.discount ?? previous.descuento
      : previous.periodicityMonths ?? previous.periodMonths ?? previous.periodicidadMeses
    return oldValue == null || incoming[field] == null ? oldValue !== incoming[field]
      : canonicalDecimal(oldValue) !== canonicalDecimal(incoming[field])
  })
  if (economicChange) for (const field of MONTHLY_CACHES) {
    if (isp || !owns(incoming, field)) { delete payload[field]; delete provenance[field] }
  }
  // Price-cents are derived, too; a new high-precision price must clear the previous cents.
  if (owns(incoming, 'price') && !owns(incoming, 'cuotaPeriodoCentimos')) delete payload.cuotaPeriodoCentimos
  for (const field of Object.keys(incoming)) if (!['source', 'origenPorCampo'].includes(field)) provenance[field] = incoming.source
  payload.origenPorCampo = provenance
  return payload
}
export function planVersion(row: VersionMutation, old?: SavedVersion): SavedVersion | null {
  const payload = mergeVersionPayload(row, old); const hash = sourceHash(payload)
  if (old?.sourceHash === hash) return null
  return { kind: row.kind, key: row.key, payload, sourceHash: hash, version: (old?.version ?? 0) + 1 }
}
export function contractReviewAlerts(row: JsonRecord, asOf: string): JsonRecord[] {
  isoDate(asOf)
  const active = row.active ?? row.activo ?? activeFromState(row.estadoOriginal ?? row.estado)
  const end = row.endDate ?? row.fechaBaja ?? row.fechaFin
  return active === true && end && end < asOf ? [{ key: `estado:${contractCode(row)}`, type: 'ESTADO_CONTRADICTORIO', codigoContratoIsp: contractCode(row) }] : []
}

export function prepareVersion(kind: RentabilidadKind, raw: JsonRecord, source = 'MANUAL'): VersionCandidate {
  if (!VERSION_KINDS.has(kind)) throw new RentabilidadError('INVALID_KIND')
  const payload = normalizeVersionAliases(kind, raw)
  if (payload.source && typeof payload.source === 'object') { payload.sourceLocator = payload.source; payload.source = source }
  if (kind === 'contract') {
    payload.codigoContratoIsp = contractCode(payload)
    for (const date of ['startDate', 'endDate', 'fechaAlta', 'fechaBaja', 'fechaInicio', 'fechaFin']) if (payload[date]) payload[date] = isoDate(payload[date])
    if (payload.periodicidadMeses != null && ![1, 3, 6, 12].includes(Number(payload.periodicidadMeses))) throw new RentabilidadError('PERIODICITY_UNVERIFIED')
    if (payload.periodicidadMeses != null) for (const field of ['periodicityMonths', 'periodMonths', 'periodicidadMeses']) payload[field] = Number(payload.periodicidadMeses)
    if (payload.precioPeriodo != null) {
      payload.price = payload.precioPeriodo = canonicalDecimal(payload.precioPeriodo)
      if (/^-?\d+(?:\.\d{1,2})?$/.test(payload.precioPeriodo)) payload.cuotaPeriodoCentimos = exactCents(payload.precioPeriodo)
      else delete payload.cuotaPeriodoCentimos
    }
    if (payload.cuotaPeriodoCentimos != null) payload.cuotaPeriodoCentimos = exactCents(payload.cuotaPeriodoCentimos, true)
    if (payload.velocidadBajadaMb != null && (!Number.isFinite(Number(payload.velocidadBajadaMb)) || Number(payload.velocidadBajadaMb) < 0)) throw new RentabilidadError('INVALID_MB')
  }
  if (['cost', 'externalCost'].includes(kind)) {
    if (payload.mes != null) monthSchema.parse(payload.mes)
    if (payload.month != null) monthSchema.parse(payload.month)
    if (payload.importe != null) payload.importeBaseCentimos = moneyToCents(payload.importe)
    else if (payload.importeBaseCentimos != null) payload.importeBaseCentimos = exactCents(payload.importeBaseCentimos, true)
    if (payload.estado != null && !['REAL', 'ESTIMADO', 'PENDIENTE', 'REFERENCIA'].includes(payload.estado)) throw new RentabilidadError('INVALID_COST_STATE')
    payload.estado ??= kind === 'externalCost' ? 'PENDIENTE' : 'REFERENCIA'
    payload.status ??= payload.estado; payload.state ??= payload.estado
    if (kind === 'externalCost' && !['Vola', 'Sotic', 'VOLA', 'SOTIC'].includes(payload.sociedadPagadora)) throw new RentabilidadError('INVALID_EXTERNAL_SOCIETY')
    if (payload.fechaBaja) payload.fechaBaja = isoDate(payload.fechaBaja)
  }
  payload.source ??= source
  const semanticCostKey = ['cost', 'externalCost'].includes(kind) && (payload.month ?? payload.mes) && (payload.provider ?? payload.proveedor)
    ? `${kind}:${sourceHash({ provider: payload.provider ?? payload.proveedor, product: payload.product ?? payload.productoId ?? null, payer: payload.payer ?? payload.sociedadPagadora ?? null, month: payload.month ?? payload.mes, directClient: payload.directClient ?? null, directContract: payload.directContract ?? null })}` : null
  const key = kind === 'contract' ? payload.codigoContratoIsp : keySchema.parse(payload.key ?? payload.id ?? semanticCostKey ?? `${kind}:${sourceHash(payload)}`)
  const candidate: VersionCandidate = { kind, key, payload, sourceHash: sourceHash(payload) }
  for (const field of ['contratoServicioId', 'clienteWebId'] as const) if (payload[field] != null) candidate[field] = actorSchema.parse(payload[field])
  for (const field of ['contratoDraxtonId', 'contratoProveedorDraxtonId', 'personalContratoDraxtonId'] as const) if (payload[field] != null) candidate[field] = keySchema.parse(payload[field])
  return candidate
}
export function prepareLine(raw: JsonRecord, source = 'LISTADO299_EXPORT'): BilledLine {
  const payload = safePayload(raw); const codigoContratoIsp = contractCode(payload)
  if (payload.source && typeof payload.source === 'object') { payload.sourceLocator = payload.source; payload.source = source }
  const fechaFuente = isoDate(payload.fechaFuente ?? payload.fecha ?? payload.date)
  const concepto = z.string().trim().min(1).max(4000).parse(payload.concepto ?? payload.concept)
  const rawMoney = payload.importeBaseDecimal ?? payload.importeBaseExacto ?? payload.importeBase ?? payload.precio ?? payload.baseAmount
  const cents = payload.importeBaseCentimos != null ? BigInt(exactCents(payload.importeBaseCentimos, true)) : null
  const absolute = cents != null && cents < BigInt(0) ? -cents : cents
  const exactAmount = rawMoney != null ? canonicalDecimal(rawMoney) : canonicalDecimal(`${cents! < BigInt(0) ? '-' : ''}${absolute! / BigInt(100)}.${(absolute! % BigInt(100)).toString().padStart(2, '0')}`)
  const importeBaseCentimos = payload.importeBaseCentimos != null ? exactCents(payload.importeBaseCentimos, true) : moneyToCents(exactAmount)
  const mesServicio = monthSchema.parse(payload.mesServicio ?? payload.month ?? fechaFuente.slice(0, 7))
  const key = sourceHash({ codigoContratoIsp, fechaFuente, concepto, importeBaseExacto: exactAmount })
  const normalized = { ...payload, codigoContratoIsp, fechaFuente, mesServicio, concepto, importeBaseCentimos, importeBaseExacto: exactAmount, importeBaseDecimal: exactAmount, source: payload.source ?? source }
  return { key, codigoContratoIsp, fechaFuente, mesServicio, concepto, importeBaseCentimos, sourceHash: sourceHash(normalized), payload: normalized, ...(payload.facturaISPId != null ? { facturaISPId: actorSchema.parse(payload.facturaISPId) } : {}) }
}
async function applyVersions(tx: Tx, candidates: VersionMutation[], actorId: number, report: ImportReport) {
  if (!candidates.length) return
  const keys = candidates.map(row => row.key)
  const existing = await tx.$queryRaw<SavedVersion[]>(Prisma.sql`SELECT DISTINCT ON (kind, stable_key) kind, stable_key AS key, version, source_hash AS "sourceHash", payload FROM rentabilidad_versiones WHERE stable_key IN (${Prisma.join(keys)}) ORDER BY kind, stable_key, version DESC LIMIT ${keys.length * 9}`)
  const map = new Map(existing.map(row => [`${row.kind}:${row.key}`, row]))
  const inserts: Prisma.Sql[] = []
  for (const row of candidates) {
    const old = map.get(`${row.kind}:${row.key}`)
    const planned = planVersion(row, old)
    if (!planned) { report.sinCambios++; continue }
    const { payload, sourceHash: hash, version } = planned
    inserts.push(Prisma.sql`(${randomUUID()},${row.kind},${row.key},${version},${hash},${JSON.stringify(payload)}::jsonb,${actorId},${row.contratoServicioId ?? null},${row.clienteWebId ?? null},${row.contratoDraxtonId ?? null},${row.contratoProveedorDraxtonId ?? null},${row.personalContratoDraxtonId ?? null})`)
    map.set(`${row.kind}:${row.key}`, planned)
    if (old) report.actualizadas++; else report.insertadas++
  }
  if (inserts.length) await tx.$executeRaw(Prisma.sql`INSERT INTO rentabilidad_versiones (id,kind,stable_key,version,source_hash,payload,actor_id,contrato_servicio_id,cliente_web_id,contrato_draxton_id,contrato_proveedor_draxton_id,personal_contrato_draxton_id) VALUES ${Prisma.join(inserts)}`)
}
async function applyLines(tx: Tx, candidates: BilledLine[], actorId: number, report: ImportReport) {
  if (!candidates.length) return
  const existing = await tx.$queryRaw<{ key: string; sourceHash: string; payload: JsonRecord }[]>(Prisma.sql`SELECT dedupe_key AS key, source_hash AS "sourceHash", payload FROM rentabilidad_lineas WHERE dedupe_key IN (${Prisma.join(candidates.map(row => row.key))}) LIMIT ${candidates.length}`)
  const seen = new Map(existing.map(row => [row.key, row]))
  const inserts: Prisma.Sql[] = []
  for (const row of candidates) {
    const old = seen.get(row.key)
    if (old) {
      // Same mandated tuple is idempotent across imports. Contradictory service periods go to review, never overwrite.
      if (old.payload.mesServicio !== row.mesServicio || (old.payload.serie && row.payload.serie && old.payload.serie !== row.payload.serie) || (old.payload.numeroFactura && row.payload.numeroFactura && old.payload.numeroFactura !== row.payload.numeroFactura)) {
        report.rechazadas++; report.errores.push({ collection: 'lines', row: report.leidas, code: 'LINE_IDENTITY_COLLISION' })
      } else report.sinCambios++
      continue
    }
    inserts.push(Prisma.sql`(${randomUUID()},${row.key},${row.codigoContratoIsp},${row.fechaFuente}::date,${row.mesServicio},${row.importeBaseCentimos}::bigint,${row.payload.importeBaseDecimal},${row.sourceHash},${JSON.stringify(row.payload)}::jsonb,${actorId},${row.facturaISPId ?? null})`)
    seen.set(row.key, { ...row }); report.insertadas++
  }
  if (inserts.length) await tx.$executeRaw(Prisma.sql`INSERT INTO rentabilidad_lineas (id,dedupe_key,codigo_contrato_isp,fecha_fuente,mes_servicio,importe_base_centimos,importe_base_decimal,source_hash,payload,actor_id,factura_isp_id) VALUES ${Prisma.join(inserts)}`)
}
function emptyReport(hash: string): ImportReport { return { leidas: 0, insertadas: 0, actualizadas: 0, sinCambios: 0, rechazadas: 0, errores: [], sourceHash: hash, byCollection: {} } }

/** Accept the analyst envelope without persisting private filesystem paths or invoking any provider. */
export function normalizeInitialPayload(raw: any): import('./types').ImportPayload {
  if (raw?.schemaVersion !== 'io-normalized-initial-1.0') {
    const result = initialSchema.safeParse(raw)
    if (!result.success) throw new RentabilidadError('INVALID_IMPORT_PAYLOAD')
    return result.data as import('./types').ImportPayload
  }
  const productForProvider: Record<string, string> = { 'Aire Networks': 'AIRE', 'Cablemóvil/Xfera': 'XFERA', 'Adamo': 'ADAMO', 'Telefónica': 'TELEFONICA', 'Red propia': 'RED_PROPIA', 'IO': 'RED_PROPIA' }
  const rules = (Array.isArray(raw.rules) ? raw.rules : []).flatMap((rule: JsonRecord) => {
    if (rule.kind !== 'tariff_provider' || !Array.isArray(rule.patterns)) return [rule]
    return rule.patterns.map((item: unknown) => {
      if (typeof item !== 'string' || !/^(contains|starts):.+$/.test(item)) throw new RentabilidadError('INVALID_PATTERN')
      const [prefix, ...parts] = item.split(':'); const pattern = parts.join(':')
      return { key: `initial:${pattern === 'CM-' ? 'CM' : pattern === 'T-' ? 'T' : pattern}`, type: 'tariffRule', matchType: prefix === 'starts' ? 'PREFIX' : 'CONTAINS', pattern, proveedor: rule.provider, productoId: productForProvider[rule.provider], active: true, onlyWhenProviderMissing: true, source: 'ENCARGO_20261124', sourceLocator: rule.source }
    })
  })
  const references = [...(raw.references ?? []), ...(raw.externalAnalyticalCosts ?? []).map((row: JsonRecord) => ({ ...row, kind: 'EXTERNAL_INITIAL_REFERENCE', referenceOnly: true, operationalImportAllowed: false }))]
  const payload = { source: 'NORMALIZED_INITIAL', contracts: raw.contracts ?? [], lines: raw.lines ?? [], costs: raw.costs ?? [], references, products: INITIAL_PRODUCTS, rules: rules.length ? rules : INITIAL_TARIFF_RULES }
  const parsed = initialSchema.safeParse(payload)
  if (!parsed.success) throw new RentabilidadError('INVALID_IMPORT_PAYLOAD')
  return parsed.data as import('./types').ImportPayload
}

/** Partial row validation is reported. Each bounded batch is atomic, guarded and replayable. */
export async function importInitial(raw: any, actorId: number): Promise<ImportReport> {
  actorSchema.parse(actorId); assertRentabilidadConfiguration()
  const payload = normalizeInitialPayload(raw)
  const hash = sourceHash(payload); const report = emptyReport(hash)
  const collections: { name: string; rows: JsonRecord[]; kind?: RentabilidadKind }[] = [
    { name: 'products', rows: payload.products ?? INITIAL_PRODUCTS, kind: 'product' },
    { name: 'rules', rows: payload.rules ?? INITIAL_TARIFF_RULES },
    { name: 'contracts', rows: payload.contracts ?? [], kind: 'contract' }, { name: 'lines', rows: payload.lines ?? [] },
    { name: 'costs', rows: payload.costs ?? [], kind: 'cost' }, { name: 'references', rows: payload.references ?? [], kind: 'reference' },
  ]
  for (const entry of collections) {
    const summary = emptyReport(hash)
    for (let start = 0; start < entry.rows.length; start += 250) {
      const versions: VersionCandidate[] = []; const lines: BilledLine[] = []
      for (let index = start; index < Math.min(start + 250, entry.rows.length); index++) {
        summary.leidas++
        try {
          if (entry.name === 'lines') lines.push(prepareLine(entry.rows[index], payload.source === 'NORMALIZED_INITIAL' ? 'ISP_LISTADO299' : payload.source))
          else if (entry.name === 'rules') versions.push(prepareRule(entry.rows[index]))
          else versions.push(prepareVersion(entry.kind!, entry.rows[index], payload.source === 'NORMALIZED_INITIAL' ? (entry.name === 'contracts' ? 'LORENA' : 'COSTES_XLSX_INITIAL') : payload.source))
        } catch (error) {
          summary.rechazadas++; summary.errores.push({ collection: entry.name, row: index + 1, code: error instanceof RentabilidadError ? error.code : 'INVALID_ROW' })
        }
      }
      const delta = emptyReport(hash)
      await transaction(actorId, async tx => { await applyVersions(tx, versions, actorId, delta); await applyLines(tx, lines, actorId, delta) })
      for (const field of ['insertadas', 'actualizadas', 'sinCambios', 'rechazadas'] as const) summary[field] += delta[field]
      summary.errores.push(...delta.errores)
    }
    for (const field of ['leidas', 'insertadas', 'actualizadas', 'sinCambios', 'rechazadas'] as const) report[field] += summary[field]
    report.errores.push(...summary.errores)
    const { sourceHash: ignored, byCollection: ignoredCollections, ...counts } = summary
    report.byCollection[entry.name] = counts
  }
  // Produce a durable unresolved-contract queue without creating a fake supplier.
  const imported = await readInputs()
  const tariffRules = imported.rules.filter(row => row.type === 'tariffRule' && row.active !== false)
  const pending = imported.contracts.filter(row => {
    if (row.proveedor || row.proveedorEntidadFiscalId || row.provider) return false
    const tariff = String(row.tarifa ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    return !tariffRules.some(rule => {
      const pattern = String(rule.pattern).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
      return rule.matchType === 'EXACT' ? tariff === pattern : rule.matchType === 'PREFIX' ? tariff.startsWith(pattern) : tariff.includes(pattern)
    })
  })
  await ensureExceptions([
    ...pending.map(row => ({ key: `proveedor:${row.codigoContratoIsp}`, type: 'CONTRATO_SIN_PROVEEDOR', codigoContratoIsp: row.codigoContratoIsp })),
    ...imported.contracts.flatMap(row => contractReviewAlerts(row, new Date().toISOString().slice(0, 10))),
  ], actorId)
  await appendRun({ actorId, process: 'IMPORT_INITIAL', estado: report.rechazadas ? 'REVISION' : 'COMPLETADO', sourceHash: hash, report })
  return report
}
export function prepareRule(raw: JsonRecord): VersionCandidate {
  const row = safePayload(raw)
  const kind = row.type ?? row.kind ?? row.tipo
  if (!['tariffRule', 'costRule', 'externalCost'].includes(kind)) throw new RentabilidadError('INVALID_RULE_TYPE')
  if (kind === 'tariffRule') {
    if (!['CONTAINS', 'PREFIX', 'EXACT'].includes(row.matchType) || typeof row.pattern !== 'string' || !row.pattern.trim() || row.pattern.length > 240) throw new RentabilidadError('INVALID_PATTERN')
    row.onlyWhenProviderMissing = true
    if (!row.productoId || !row.proveedor) throw new RentabilidadError('RULE_TARGET_REQUIRED')
  }
  if (kind === 'costRule') {
    if (!['DIRECTA', 'INGRESO', 'MB', 'EXCLUIR'].includes(row.method) || !['MES', 'BIMESTRAL_VENCIDO', 'ANUAL'].includes(row.period)) throw new RentabilidadError('INVALID_COST_RULE')
    if (owns(row, 'periodAnchor') && (row.periodAnchor !== 'INVOICE_MONTH' || row.period !== 'ANUAL')) throw new RentabilidadError('INVALID_PERIOD_ANCHOR')
    if (!row.proveedorCif && !row.proveedorNombre) throw new RentabilidadError('PROVIDER_REQUIRED')
    for (const field of ['invoicePattern', 'conceptPattern']) if (row[field] != null && (typeof row[field] !== 'string' || row[field].length > 240)) throw new RentabilidadError('INVALID_PATTERN')
  }
  if (row.active != null && typeof row.active !== 'boolean') throw new RentabilidadError('INVALID_ACTIVE')
  if (row.priority != null && (!Number.isSafeInteger(row.priority) || row.priority < 0)) throw new RentabilidadError('INVALID_PRIORITY')
  return prepareVersion(kind as RentabilidadKind, row)
}
export async function saveRule(rule: any, actorId: number) {
  const candidate = prepareRule(rule); const report = emptyReport(candidate.sourceHash)
  await transaction(actorId, tx => applyVersions(tx, [candidate], actorId, report))
  return { key: candidate.key, ...report }
}
/** Rebuild-owned materialisation of review cases. A resolved case is not silently reopened. */
export async function ensureExceptions(alerts: any[], actorId: number) {
  if (!Array.isArray(alerts) || alerts.length > 100_000) throw new RentabilidadError('INVALID_EXCEPTION_BATCH')
  const report = emptyReport(sourceHash(alerts))
  for (let start = 0; start < alerts.length; start += 250) {
    const prepared = alerts.slice(start, start + 250).map(raw => {
      const row = safePayload(raw)
      const key = keySchema.parse(row.key ?? row.exceptionKey ?? row.id)
      const code = row.codigoContratoIsp ?? row.contractCode
      const type = row.type ?? row.tipo ?? row.code ?? 'REVISION'
      return prepareVersion('exception', { ...row, key, exceptionKey: key, type, ...(code != null ? { codigoContratoIsp: String(code) } : {}), estado: 'PENDIENTE', source: 'REPORT_REBUILD' })
    })
    await transaction(actorId, async tx => {
      const existing = await tx.$queryRaw<SavedVersion[]>(Prisma.sql`SELECT DISTINCT ON (stable_key) kind,stable_key AS key,version,source_hash AS "sourceHash",payload FROM rentabilidad_versiones WHERE kind='exception' AND stable_key IN (${Prisma.join(prepared.map(row => row.key))}) ORDER BY stable_key,version DESC LIMIT ${prepared.length}`)
      const resolved = new Set(existing.filter(row => row.payload.estado === 'RESUELTA').map(row => row.key))
      const candidates = prepared.filter(row => !resolved.has(row.key))
      report.leidas += prepared.length; report.sinCambios += prepared.length - candidates.length
      await applyVersions(tx, candidates, actorId, report)
    })
  }
  return report
}
type DecisionEffect = { kind: RentabilidadKind; key: string; before: SavedVersion | null; expectedAppliedVersion: number; expectedAppliedHash: string }
function statePayload(payload: JsonRecord, state: string): JsonRecord { return { ...payload, status: state, state, estado: state } }
/** Never let a report's English-first money alias retain the amount from the previous version. */
export function confirmedCostPayload(target: SavedVersion, input: JsonRecord, actorId: number): JsonRecord {
  const confirmed: JsonRecord = { ...statePayload(target.payload, 'REAL'), key: target.key, decisionHash: sourceHash(input), confirmedBy: actorId }
  if (input.amount != null) {
    const decimal = canonicalDecimal(input.amount)
    for (const field of MONEY_ALIASES) confirmed[field] = decimal
    confirmed.importeBaseCentimos = moneyToCents(decimal)
    // Maintain optional aliases supplied by an earlier cost source, not only the display cents.
    for (const field of ['cents', 'amountCents', 'baseAmountCents', 'importeCentimos']) if (owns(confirmed, field)) confirmed[field] = confirmed.importeBaseCentimos
    for (const field of ['decimal', 'amountDecimal', 'baseAmountDecimal']) if (owns(confirmed, field)) confirmed[field] = decimal
  }
  return confirmed
}
export function decisionEffect(candidate: VersionMutation, before?: SavedVersion): DecisionEffect | null {
  const planned = planVersion(candidate, before)
  return planned ? { kind: candidate.kind, key: candidate.key, before: before ?? null, expectedAppliedVersion: planned.version, expectedAppliedHash: planned.sourceHash } : null
}
/** Pure compensation plan; writer calls it inside the same advisory-locked transaction. */
export function compensationCandidates(decision: JsonRecord, latest: SavedVersion[]): VersionMutation[] {
  if (!Array.isArray(decision.effects)) {
    if (['ASIGNAR_PROVEEDOR', 'CONFIRMAR_COSTE'].includes(decision.action) || decision.rule) throw new RentabilidadError('REOPEN_REVIEW_REQUIRED', 409)
    return []
  }
  const candidates: VersionMutation[] = []; const seen = new Set<string>()
  for (const effect of decision.effects as DecisionEffect[]) {
    const identity = `${effect.kind}:${effect.key}`
    if (seen.has(identity) || !VERSION_KINDS.has(effect.kind) || ['decision', 'exception'].includes(effect.kind)) throw new RentabilidadError('REOPEN_REVIEW_REQUIRED', 409)
    if (!Number.isSafeInteger(effect.expectedAppliedVersion) || effect.expectedAppliedVersion < 1 || typeof effect.expectedAppliedHash !== 'string') throw new RentabilidadError('REOPEN_REVIEW_REQUIRED', 409)
    seen.add(identity)
    const current = latest.find(row => row.kind === effect.kind && row.key === effect.key)
    if (!current || current.version !== effect.expectedAppliedVersion || current.sourceHash !== effect.expectedAppliedHash || sourceHash(current.payload) !== current.sourceHash) throw new RentabilidadError('REOPEN_REVISION_CONFLICT', 409)
    if (effect.before) {
      if (effect.before.kind !== effect.kind || effect.before.key !== effect.key || sourceHash(effect.before.payload) !== effect.before.sourceHash) throw new RentabilidadError('REOPEN_REVIEW_REQUIRED', 409)
      // Restore the complete old payload, including aliases/provenance; do NOT use a contract partial merge.
      candidates.push({ kind: effect.kind, key: effect.key, payload: safePayload(effect.before.payload), sourceHash: effect.before.sourceHash, replacePayload: true })
    } else {
      if (!['tariffRule', 'costRule', 'externalCost'].includes(effect.kind)) throw new RentabilidadError('REOPEN_REVIEW_REQUIRED', 409)
      const payload: JsonRecord = { ...current.payload, active: false }
      if (owns(payload, 'activo')) payload.activo = false
      candidates.push({ kind: effect.kind, key: effect.key, payload, sourceHash: sourceHash(payload), replacePayload: true })
    }
  }
  return candidates
}
export function isRepeatedDecision(existing: SavedVersion, decision: SavedVersion | undefined, input: JsonRecord): boolean {
  return decision?.payload.requestHash === sourceHash(input)
    && existing.payload.estado === (input.action === 'REABRIR' ? 'PENDIENTE' : 'RESUELTA')
}
async function latestVersion(tx: Tx, kind: RentabilidadKind, key: string): Promise<SavedVersion | undefined> {
  const rows = await tx.$queryRaw<SavedVersion[]>(Prisma.sql`SELECT kind,stable_key AS key,version,source_hash AS "sourceHash",payload FROM rentabilidad_versiones WHERE kind=${kind} AND stable_key=${key} ORDER BY version DESC LIMIT 1`)
  return rows[0]
}
export async function resolveException(input: any, actorId: number) {
  const row = safePayload(input); const key = keySchema.parse(row.exceptionKey ?? row.key)
  if (!['ASIGNAR_PROVEEDOR', 'CONFIRMAR_COSTE', 'DESCARTAR', 'REABRIR'].includes(row.action)) throw new RentabilidadError('INVALID_EXCEPTION_ACTION')
  if (row.action === 'REABRIR' && row.rule) throw new RentabilidadError('INVALID_REOPEN_RULE')
  return transaction(actorId, async tx => {
    const existing = await latestVersion(tx, 'exception', key)
    if (!existing) throw new RentabilidadError('EXCEPTION_NOT_FOUND', 404)
    const previousDecision = await latestVersion(tx, 'decision', `decision:${key}`)
    const report = emptyReport(sourceHash(row))
    if (isRepeatedDecision(existing, previousDecision, row)) return { key, ...report, sinCambios: 1, idempotente: true }
    if (row.action !== 'REABRIR' && existing.payload.estado === 'RESUELTA') throw new RentabilidadError('EXCEPTION_ALREADY_RESOLVED', 409)
    const candidates: VersionMutation[] = []; const effects: DecisionEffect[] = []
    const addEffect = async (candidate: VersionMutation, before?: SavedVersion) => {
      if (candidates.some(item => item.kind === candidate.kind && item.key === candidate.key)) throw new RentabilidadError('DUPLICATE_DECISION_TARGET')
      const current = before ?? await latestVersion(tx, candidate.kind, candidate.key)
      const effect = decisionEffect(candidate, current)
      if (effect) { candidates.push(candidate); effects.push(effect) }
    }
    if (row.action === 'REABRIR') {
      if (existing.payload.estado === 'PENDIENTE') return { key, ...report, sinCambios: 1, idempotente: true }
      if (!previousDecision || previousDecision.payload.action === 'REABRIR') throw new RentabilidadError('REOPEN_REVIEW_REQUIRED', 409)
      const latest: SavedVersion[] = []
      for (const effect of (previousDecision.payload.effects ?? []) as DecisionEffect[]) {
        const current = await latestVersion(tx, effect.kind, effect.key)
        if (current) latest.push(current)
      }
      candidates.push(...compensationCandidates(previousDecision.payload, latest))
    }
    if (row.action === 'ASIGNAR_PROVEEDOR') {
      if (!row.proveedor || !row.productoId) throw new RentabilidadError('PROVIDER_AND_PRODUCT_REQUIRED')
      const code = contractCode(existing.payload)
      const contract = await latestVersion(tx, 'contract', code)
      if (!contract) throw new RentabilidadError('CONTRACT_NOT_FOUND', 404)
      // A genuine partial source row: do not mark all pre-existing contract fields as MANUAL_EXCEPTION.
      await addEffect(prepareVersion('contract', { codigoContratoIsp: code, proveedor: row.proveedor, productoId: row.productoId, source: 'MANUAL_EXCEPTION' }), contract)
    }
    if (row.action === 'CONFIRMAR_COSTE') {
      const targetKey = keySchema.parse(row.costKey ?? existing.payload.costKey)
      const costs = await tx.$queryRaw<SavedVersion[]>(Prisma.sql`SELECT DISTINCT ON (kind) kind,stable_key AS key,version,source_hash AS "sourceHash",payload FROM rentabilidad_versiones WHERE kind IN ('cost','externalCost') AND stable_key=${targetKey} ORDER BY kind,version DESC LIMIT 2`)
      if (!costs.length) throw new RentabilidadError('COST_NOT_FOUND', 404)
      if (costs.length > 1 && costs[0].kind !== costs[1].kind) throw new RentabilidadError('AMBIGUOUS_COST_TARGET', 409)
      const target = costs[0]
      await addEffect(prepareVersion(target.kind, confirmedCostPayload(target, row, actorId)), target)
    }
    if (row.rule) await addEffect(prepareRule(row.rule))
    const state = row.action === 'REABRIR' ? 'PENDIENTE' : 'RESUELTA'
    const decisionPayload = {
      ...row, key: `decision:${key}`, exceptionKey: key, requestHash: sourceHash(row), effects,
      ...(row.action === 'REABRIR' ? { compensatesDecisionVersion: previousDecision!.version } : {}),
    }
    candidates.push(prepareVersion('decision', statePayload(decisionPayload, state)))
    candidates.push(prepareVersion('exception', statePayload({ ...existing.payload, decisionHash: sourceHash(row) }, state)))
    await applyVersions(tx, candidates, actorId, report)
    return { key, ...report, idempotente: false }
  })
}
export async function appendRun(input: any) {
  const payload = safePayload(input); const actorId = actorSchema.parse(payload.actorId ?? Number(process.env.RENTABILIDAD_SYSTEM_ACTOR_ID))
  const hash = sourceHash(payload)
  return transaction(actorId, async tx => {
    const id = randomUUID()
    await tx.$executeRaw(Prisma.sql`INSERT INTO rentabilidad_ejecuciones (id,process,source_hash,payload,actor_id) VALUES (${id},${keySchema.parse(payload.process)},${hash},${JSON.stringify(payload)}::jsonb,${actorId})`)
    return { id, sourceHash: hash }
  })
}
export async function saveSnapshot(month: string, raw: any, actorId: number, kind = 'CIERRE') {
  monthSchema.parse(month); keySchema.parse(kind); const payload = safePayload(raw, 8 * 1024 * 1024)
  const { generatedAt: ignoredDate, runs: ignoredRuns, snapshots: ignoredSnapshots, ...semantic } = payload
  const hash = sourceHash({ month, kind, semantic })
  return transaction(actorId, async tx => {
    const rows = await tx.$queryRaw<{ version: number; sourceHash: string; id: string }[]>(Prisma.sql`SELECT id,version,source_hash AS "sourceHash" FROM rentabilidad_snapshots WHERE month=${month} AND kind=${kind} ORDER BY version DESC LIMIT 1`)
    if (rows[0]?.sourceHash === hash) return { ...rows[0], idempotente: true }
    const id = randomUUID(); const version = (rows[0]?.version ?? 0) + 1
    await tx.$executeRaw(Prisma.sql`INSERT INTO rentabilidad_snapshots (id,month,kind,version,source_hash,payload,actor_id) VALUES (${id},${month},${kind},${version},${hash},${JSON.stringify(payload)}::jsonb,${actorId})`)
    return { id, version, sourceHash: hash, idempotente: false }
  })
}
export async function listSnapshots(month?: string):Promise<JsonRecord[]> {
  if (month) monthSchema.parse(month)
  const db = await database(); await assertIsolated(db)
  const rows = await db.$queryRaw<JsonRecord[]>(Prisma.sql`
    SELECT id,month,kind,version,source_hash AS "sourceHash",payload,created_at AS "createdAt"
    FROM (SELECT DISTINCT ON (month,kind) id,month,kind,version,source_hash,payload,created_at
      FROM rentabilidad_snapshots WHERE true ${month ? Prisma.sql`AND month=${month}` : Prisma.empty}
      ORDER BY month,kind,version DESC) latest ORDER BY month DESC,kind ASC LIMIT 50`)
  return rows.map(row => ({ ...row, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt }))
}

export function boundedHistoryPage(limit = 100, offset = 0): { limit: number; offset: number } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new RentabilidadError('INVALID_HISTORY_PAGE')
  return { limit, offset }
}
function withIsoCreatedAt(row: JsonRecord): JsonRecord {
  return { ...row, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt }
}
/** Screen reads never call readInputs or scan billed lines. At most 100 rows per page. */
export async function listRecentRuns(limit = 50, offset = 0): Promise<JsonRecord[]> {
  const page = boundedHistoryPage(limit, offset)
  const db = await database(); await assertIsolated(db)
  const rows = await db.$queryRaw<JsonRecord[]>(Prisma.sql`SELECT id,process,source_hash AS "sourceHash",payload,created_at AS "createdAt" FROM rentabilidad_ejecuciones ORDER BY created_at DESC,id DESC LIMIT ${page.limit} OFFSET ${page.offset}`)
  return rows.map(withIsoCreatedAt)
}
async function versionHistory(kinds: RentabilidadKind[], key?: string, limit = 100, offset = 0): Promise<JsonRecord[]> {
  if (key != null) keySchema.parse(key)
  const page = boundedHistoryPage(limit, offset)
  const db = await database(); await assertIsolated(db)
  const rows = await db.$queryRaw<JsonRecord[]>(Prisma.sql`
    SELECT id,kind,stable_key AS key,version,source_hash AS "sourceHash",payload,actor_id AS "actorId",created_at AS "createdAt"
    FROM rentabilidad_versiones WHERE kind IN (${Prisma.join(kinds)}) ${key != null ? Prisma.sql`AND stable_key=${key}` : Prisma.empty}
    ORDER BY created_at DESC,id DESC LIMIT ${page.limit} OFFSET ${page.offset}`)
  return rows.map(withIsoCreatedAt)
}
export async function getRuleHistory(key?: string, limit = 100, offset = 0): Promise<JsonRecord[]> {
  return versionHistory(['tariffRule', 'costRule'], key, limit, offset)
}
export async function getExternalCostHistory(key?: string, limit = 100, offset = 0): Promise<JsonRecord[]> {
  return versionHistory(['externalCost'], key, limit, offset)
}
export async function listResolvedExceptions(limit = 100, offset = 0): Promise<JsonRecord[]> {
  const page = boundedHistoryPage(limit, offset)
  const db = await database(); await assertIsolated(db)
  // Filter AFTER selecting latest: a previously resolved but now reopened case must not appear here.
  const rows = await db.$queryRaw<JsonRecord[]>(Prisma.sql`
    SELECT id,kind,key,version,"sourceHash",payload,"actorId","createdAt" FROM (
      SELECT DISTINCT ON (stable_key) id,kind,stable_key AS key,version,source_hash AS "sourceHash",payload,actor_id AS "actorId",created_at AS "createdAt"
      FROM rentabilidad_versiones WHERE kind='exception' ORDER BY stable_key,version DESC
    ) latest WHERE payload->>'estado'='RESUELTA'
    ORDER BY "createdAt" DESC,id DESC LIMIT ${page.limit} OFFSET ${page.offset}`)
  return rows.map(withIsoCreatedAt)
}
