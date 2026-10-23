/*
 * ISP issued-invoice sync provider (P2)
 *
 * This module is deliberately dependency-injected.  It does not import the legacy
 * ISP service, read environment variables, use credentials, or make a request by
 * itself.  The caller supplies the already-authorised `request` function and runs
 * `apply` inside its Prisma transaction.
 *
 * Scope: issued invoice identity and invoice metadata only.  It never reads or
 * writes ISP collection status, `total_pendiente`, remittances, bank movements,
 * B4 links, email, or payment data from ISP.
 */
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import type { SyncOutcome, SyncProvider, SyncSourceItem } from '../../types'

export const ISP_FACTURACION_ENDPOINT = 'facturacion' as const
export const ISP_FACTURACION_LIMIT = 5_000 as const
export const ISP_SYNC_VERSION = 'ISP_FACTURA_P2_V1' as const

/** Exactly the invocation already proved by lib/ispgestion/sync-facturas.ts. */
export type IspFacturacionRequest = (
  endpoint: typeof ISP_FACTURACION_ENDPOINT,
  method: 'GET',
  data: null,
  params: Readonly<{ mostrar: typeof ISP_FACTURACION_LIMIT }>,
) => Promise<unknown>

type JsonRecord = Record<string, unknown>
type SourceSnapshot = Readonly<{
  id?: unknown
  serie_factura?: unknown
  numero_documento?: unknown
  fecha?: unknown
  id_cliente?: unknown
  codigo_cliente?: unknown
  nombrecompleto?: unknown
  nif_cif?: unknown
  documento?: unknown
  base?: unknown
  total_impuesto?: unknown
  total?: unknown
}>

export type IspIssuedInvoiceProviderOptions = Readonly<{
  request: IspFacturacionRequest
  /**
   * Off by default.  Enabling this is an explicit parent decision to B7-audit and
   * link an older exact FI (`idExterno === ISP id`) that currently lacks its FK.
   */
  allowExistingIdentityLink?: boolean
  /** Off by default.  Creates only the B4 catalogue wrapper for a newly-created, exact FI. */
  createB4WrapperForNewInvoices?: boolean
}>

export class IspInvoiceSyncError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'IspInvoiceSyncError'
  }
}

export type PreparedIspFactura =
  | Readonly<{ kind: 'VALID'; source: NormalizedIspFactura }>
  /** A terminal source-data error; no invoice is invented from incomplete financial data. */
  | Readonly<{ kind: 'ERROR'; source: SourceSnapshot; sourceHash: string; reason: string }>

export type NormalizedIspFactura = Readonly<{
  ispGestionId: number
  serieFactura: string
  numeroDocumento: string
  fecha: Date
  fechaISO: string
  idCliente: number
  codigoCliente: string
  nombreCompleto: string
  nifCif: string | null
  documento: string | null
  baseCents: number
  ivaCents: number
  totalCents: number
  /** Derived only from supplied exact base/IVA cents; no default tax rate exists. */
  tipoIva: number
  source: SourceSnapshot
  sourceHash: string
}>

/** Only fields which are invoice identity/metadata are ever retained from ISP. */
const SOURCE_FIELDS = [
  'id',
  'serie_factura',
  'numero_documento',
  'fecha',
  'id_cliente',
  'codigo_cliente',
  'nombrecompleto',
  'nif_cif',
  'documento',
  'base',
  'total_impuesto',
  'total',
] as const

const MAX_POSTGRES_INT = 2_147_483_647
/** B4's target amount is Int cents: at most 21,474,836.47 EUR in either direction. */
const MAX_B4_CENTS = MAX_POSTGRES_INT
const DECIMAL_CENTS = /^-?(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/
const POSITIVE_INTEGER = /^[1-9]\d*$/
const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/u

function own(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Projection is intentionally allow-listed.  `situacion`, `total_pendiente`,
 * payment references, IBANs, bank fields and arbitrary future API fields cannot
 * enter source items, checkpoints or review jobs.
 */
export function snapshotInvoiceSource(value: unknown): SourceSnapshot {
  if (!isRecord(value)) return {}
  const projected: Record<string, unknown> = {}
  for (const key of SOURCE_FIELDS) if (own(value, key)) projected[key] = value[key]
  return projected as SourceSnapshot
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new IspInvoiceSyncError('NON_FINITE_JSON', 'La fuente contiene un número no finito.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  throw new IspInvoiceSyncError('UNSUPPORTED_JSON', 'La fuente contiene un valor no JSON.')
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')
}

function sourceHash(source: SourceSnapshot): string {
  return sha256({ version: ISP_SYNC_VERSION, source })
}

function strictPositiveInt(value: unknown, label: string): number {
  const text = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string' ? value.trim() : ''
  if (!POSITIVE_INTEGER.test(text)) {
    throw new IspInvoiceSyncError('ID_INVALIDO', `${label} debe ser un entero positivo explícito.`)
  }
  const parsed = Number(text)
  if (!Number.isSafeInteger(parsed) || parsed > MAX_POSTGRES_INT) {
    throw new IspInvoiceSyncError('ID_FUERA_DE_RANGO', `${label} está fuera del rango Int de Prisma.`)
  }
  return parsed
}

/** Parses money as an exact decimal string.  Exponent notation and >2 decimals fail closed. */
export function parseExactCents(value: unknown, label: string): number {
  const text = typeof value === 'number'
    ? (Number.isFinite(value) ? String(value) : '')
    : typeof value === 'string' ? value.trim() : ''
  const match = DECIMAL_CENTS.exec(text)
  if (!match) {
    throw new IspInvoiceSyncError('CENTIMOS_NO_EXACTOS', `${label} debe ser decimal finito con como máximo dos céntimos.`)
  }
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [whole, fraction = ''] = unsigned.split('.')
  const centsBig = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2))
  const signed = negative ? -centsBig : centsBig
  if (signed > BigInt(MAX_B4_CENTS) || signed < -BigInt(MAX_B4_CENTS)) {
    throw new IspInvoiceSyncError('CENTIMOS_FUERA_DE_RANGO', `${label} excede el rango Int de céntimos B4.`)
  }
  return Number(signed)
}

function parseValidDate(value: unknown): Date {
  if (typeof value !== 'string') throw new IspInvoiceSyncError('FECHA_INVALIDA', 'fecha debe ser una fecha ISO explícita.')
  const match = ISO_DATE_PREFIX.exec(value.trim())
  if (!match) throw new IspInvoiceSyncError('FECHA_INVALIDA', 'fecha debe comenzar por YYYY-MM-DD.')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new IspInvoiceSyncError('FECHA_INVALIDA', 'fecha no existe en el calendario.')
  }
  return parsed
}

function requiredText(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new IspInvoiceSyncError('TEXTO_FUENTE_INVALIDO', `${label} debe estar explícitamente informado.`)
  }
  return value
}

function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new IspInvoiceSyncError('TEXTO_FUENTE_INVALIDO', `${label} debe ser texto o null.`)
  return value
}

function centsToEuros(cents: number): number {
  return cents / 100
}

/** Converts Prisma Decimal/number/string output back to source-exact cents. */
function dbCents(value: unknown, label: string): number {
  const text = value && typeof value === 'object' && 'toString' in value
    ? String(value)
    : value
  return parseExactCents(text, label)
}

function sameDate(value: unknown, source: Date): boolean {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return false
  return value.getUTCFullYear() === source.getUTCFullYear()
    && value.getUTCMonth() === source.getUTCMonth()
    && value.getUTCDate() === source.getUTCDate()
}

function normalizedKey(ispGestionId: number): string {
  return `isp-factura:${ispGestionId}`
}

/** Pure validation and normalization.  It does not use the clock, DB or network. */
export function normalizeIspInvoice(item: SyncSourceItem): NormalizedIspFactura {
  if (item.tipo !== 'ISP_FACTURA') throw new IspInvoiceSyncError('TIPO_INVALIDO', 'El item no es ISP_FACTURA.')
  const source = snapshotInvoiceSource(item.data)
  const ispGestionId = strictPositiveInt(source.id, 'id')
  if (item.key !== normalizedKey(ispGestionId)) {
    throw new IspInvoiceSyncError('KEY_INVALIDA', 'La clave del item no corresponde exactamente al id ISP.')
  }
  const fecha = parseValidDate(source.fecha)
  const baseCents = parseExactCents(source.base, 'base')
  const ivaCents = parseExactCents(source.total_impuesto, 'total_impuesto')
  const totalCents = parseExactCents(source.total, 'total')
  if (totalCents !== baseCents + ivaCents) {
    throw new IspInvoiceSyncError('TOTAL_NO_CIERRA', 'total debe cerrar exactamente base + total_impuesto; no se admite residuo.')
  }
  if (baseCents === 0 && ivaCents !== 0) {
    throw new IspInvoiceSyncError('IVA_SIN_BASE', 'No se puede clasificar IVA con base cero e impuesto distinto de cero.')
  }
  const tipoIva = baseCents === 0 ? 0 : Number(((ivaCents / baseCents) * 100).toFixed(8))
  if (!Number.isFinite(tipoIva)) throw new IspInvoiceSyncError('IVA_NO_REAL', 'El tipo de IVA calculado no es un número real.')

  const normalized: NormalizedIspFactura = {
    ispGestionId,
    serieFactura: requiredText(source.serie_factura, 'serie_factura', true),
    numeroDocumento: requiredText(source.numero_documento, 'numero_documento'),
    fecha,
    fechaISO: fecha.toISOString().slice(0, 10),
    idCliente: strictPositiveInt(source.id_cliente, 'id_cliente'),
    codigoCliente: requiredText(source.codigo_cliente, 'codigo_cliente', true),
    nombreCompleto: requiredText(source.nombrecompleto, 'nombrecompleto'),
    nifCif: nullableText(source.nif_cif, 'nif_cif'),
    documento: nullableText(source.documento, 'documento'),
    baseCents,
    ivaCents,
    totalCents,
    tipoIva,
    source,
    sourceHash: sourceHash(source),
  }
  return normalized
}

function asPrepared(value: unknown): PreparedIspFactura {
  if (!isRecord(value) || (value.kind !== 'VALID' && value.kind !== 'ERROR')) {
    throw new IspInvoiceSyncError('PREPARED_INVALIDO', 'prepare debe ejecutarse antes de apply.')
  }
  return value as PreparedIspFactura
}

function safeItemSnapshot(item: SyncSourceItem): SourceSnapshot {
  return snapshotInvoiceSource(item.data)
}

/** Shape used internally so P2 can be tested without a live Prisma client. */
type DbTx = {
  factura: any
  facturaEmitida: any
  identidadFacturaISPEventoB7: any
  documentoConciliable?: any
  usuarioAdmin: any
}

function facturaCreateData(source: NormalizedIspFactura): Record<string, unknown> {
  const total = centsToEuros(source.totalCents)
  return {
    ispGestionId: source.ispGestionId,
    serieFactura: source.serieFactura,
    numeroDocumento: source.numeroDocumento,
    documento: source.documento,
    fecha: source.fecha,
    idCliente: source.idCliente,
    codigoCliente: source.codigoCliente,
    nombreCompleto: source.nombreCompleto,
    nifCif: source.nifCif,
    base: centsToEuros(source.baseCents),
    totalImpuesto: centsToEuros(source.ivaCents),
    total,
    // These are local neutral defaults required by non-null legacy columns.  They
    // are not copied from ISP payment/status fields and are never later derived.
    situacion: 'PENDIENTE',
    totalPendiente: total,
    ejercicio: source.fecha.getUTCFullYear(),
  }
}

function facturaVerifiedMetadataData(source: NormalizedIspFactura): Record<string, unknown> {
  return {
    serieFactura: source.serieFactura,
    numeroDocumento: source.numeroDocumento,
    documento: source.documento,
    fecha: source.fecha,
    idCliente: source.idCliente,
    codigoCliente: source.codigoCliente,
    nombreCompleto: source.nombreCompleto,
    nifCif: source.nifCif,
    ejercicio: source.fecha.getUTCFullYear(),
  }
}

function facturaEmitidaCreateData(source: NormalizedIspFactura, facturaISPId: number): Record<string, unknown> {
  return {
    cliente: source.nombreCompleto,
    cif: source.nifCif,
    numFactura: source.numeroDocumento,
    serie: source.serieFactura,
    fecha: source.fecha,
    base: centsToEuros(source.baseCents),
    tipoIva: source.tipoIva,
    importeIva: centsToEuros(source.ivaCents),
    tipoIrpf: 0,
    importeIrpf: 0,
    total: centsToEuros(source.totalCents),
    concepto: source.documento,
    estado: 'EMITIDA',
    importeCobrado: 0,
    fechaCobro: null,
    origenSistema: 'ISPGestion',
    idExterno: String(source.ispGestionId),
    facturaISPId,
    // There is deliberately no inferred imputacion or formaCobro.
  }
}

function identitySnapshot(source: NormalizedIspFactura): Record<string, unknown> {
  return {
    version: ISP_SYNC_VERSION,
    idExterno: String(source.ispGestionId),
    fecha: source.fechaISO,
    totalCents: source.totalCents,
    sourceHash: source.sourceHash,
    noAcreditaCobro: true,
  }
}

function facturaFinancialsMatch(factura: any, source: NormalizedIspFactura): boolean {
  return dbCents(factura.base, 'Factura.base') === source.baseCents
    && dbCents(factura.totalImpuesto, 'Factura.totalImpuesto') === source.ivaCents
    && dbCents(factura.total, 'Factura.total') === source.totalCents
}

function facturaIdentityMatches(factura: any, source: NormalizedIspFactura): boolean {
  return factura?.ispGestionId === source.ispGestionId
    && factura.serieFactura === source.serieFactura
    && factura.numeroDocumento === source.numeroDocumento
    && factura.nombreCompleto === source.nombreCompleto
    && factura.nifCif === source.nifCif
    && sameDate(factura.fecha, source.fecha)
}

/** The B7 trigger has the same identity constraints; this is an early fail-closed check. */
function fiExactSourceIdentity(fi: any, source: NormalizedIspFactura): boolean {
  try {
    return fi?.origenSistema === 'ISPGestion'
      && fi.idExterno === String(source.ispGestionId)
      && fi.numFactura === source.numeroDocumento
      && fi.serie === source.serieFactura
      && fi.cliente === source.nombreCompleto
      && fi.cif === source.nifCif
      && sameDate(fi.fecha, source.fecha)
      && dbCents(fi.base, 'FacturaEmitida.base') === source.baseCents
      && dbCents(fi.importeIva, 'FacturaEmitida.importeIva') === source.ivaCents
      && dbCents(fi.total, 'FacturaEmitida.total') === source.totalCents
  } catch {
    return false
  }
}

function onlySafeFacturaMetadataDiffers(factura: any, source: NormalizedIspFactura): boolean {
  return factura.serieFactura !== source.serieFactura
    || factura.numeroDocumento !== source.numeroDocumento
    || factura.documento !== source.documento
    || !sameDate(factura.fecha, source.fecha)
    || factura.idCliente !== source.idCliente
    || factura.codigoCliente !== source.codigoCliente
    || factura.nombreCompleto !== source.nombreCompleto
    || factura.nifCif !== source.nifCif
    || factura.ejercicio !== source.fecha.getUTCFullYear()
}

async function authorizedB7Actor(tx: DbTx, actorId: number | null): Promise<boolean> {
  if (actorId === null) return false
  const actor = await tx.usuarioAdmin.findUnique({
    where: { id: actorId },
    select: { id: true, activo: true, rol: true },
  })
  return actor?.activo === true && actor.rol === 'SUPER_ADMIN'
}

async function addB7IdentityAudit(
  tx: DbTx,
  source: NormalizedIspFactura,
  facturaEmitidaId: string,
  facturaISPId: number,
  actorId: number,
): Promise<void> {
  await tx.identidadFacturaISPEventoB7.create({
    data: {
      facturaEmitidaId,
      facturaISPId,
      actorId,
      fuenteHash: source.sourceHash,
      snapshot: identitySnapshot(source),
    },
  })
}

async function maybeCreateNewFiWrapper(tx: DbTx, fi: any, source: NormalizedIspFactura, enabled: boolean): Promise<void> {
  if (!enabled) return
  if (!tx.documentoConciliable) throw new IspInvoiceSyncError('B4_CATALOGO_NO_DISPONIBLE', 'El catálogo B4 no está disponible.')
  // This is a catalogue record only.  No MovimientoBancario, Vinculo B4 or remittance is read/written.
  if (dbCents(fi.total, 'FacturaEmitida.total') !== source.totalCents) {
    throw new IspInvoiceSyncError('B4_TOTAL_NO_EXACTO', 'No se crea wrapper B4: el total FI no es exactamente la fuente.')
  }
  const existing = await tx.documentoConciliable.findFirst({ where: { facturaEmitidaId: fi.id } })
  if (!existing) {
    await tx.documentoConciliable.create({
      data: {
        tipo: 'FACTURA_EMITIDA',
        facturaEmitidaId: fi.id,
        importeObjetivoCentimos: source.totalCents,
        activo: true,
      },
    })
  }
}

function checkpointForComplete(items: readonly SyncSourceItem[]): Readonly<{ version: typeof ISP_SYNC_VERSION; mode: 'ONE_REQUEST_NO_PAGINATION'; sourceHash: string }> {
  return {
    version: ISP_SYNC_VERSION,
    mode: 'ONE_REQUEST_NO_PAGINATION',
    sourceHash: sha256(items.map((item) => ({ key: item.key, data: item.data })).sort((a, b) => a.key.localeCompare(b.key))),
  }
}

function safeTruncatedCheckpoint(previous: unknown): Readonly<{ version: typeof ISP_SYNC_VERSION; mode: 'TRUNCATED_FAIL_CLOSED'; previous: unknown }> {
  // Preserve, rather than advance, the caller checkpoint.  It may be null on first run.
  return { version: ISP_SYNC_VERSION, mode: 'TRUNCATED_FAIL_CLOSED', previous }
}

/**
 * Constructs the provider.  It intentionally performs zero network work at
 * construction time; inventory makes the only permitted request.
 */
export function createIspIssuedInvoiceProvider(options: IspIssuedInvoiceProviderOptions): SyncProvider {
  return {
    async inventory(checkpoint: unknown) {
      const response = await options.request(ISP_FACTURACION_ENDPOINT, 'GET', null, { mostrar: ISP_FACTURACION_LIMIT })
      if (!Array.isArray(response)) {
        throw new IspInvoiceSyncError('RESPUESTA_FACTURACION_INVALIDA', 'facturacion debe responder un array; no se inventa paginación.')
      }
      // There is no verified pagination contract for `facturacion`.  A full page
      // could be truncated, so do not emit any work or advance a checkpoint.
      if (response.length === ISP_FACTURACION_LIMIT) {
        return { items: [], checkpoint: safeTruncatedCheckpoint(checkpoint), complete: false }
      }
      const items: SyncSourceItem[] = []
      const keys = new Set<string>()
      for (const raw of response) {
        const source = snapshotInvoiceSource(raw)
        let ispGestionId: number
        try {
          ispGestionId = strictPositiveInt(source.id, 'id')
        } catch {
          // Preserve a non-guessable item key so prepare/apply emits a durable review.
          const invalidKey = `isp-factura:invalid:${sha256(source)}`
          if (!keys.has(invalidKey)) {
            keys.add(invalidKey)
            items.push({ key: invalidKey, tipo: 'ISP_FACTURA', data: source as Prisma.InputJsonValue })
          }
          continue
        }
        const key = normalizedKey(ispGestionId)
        if (keys.has(key)) {
          throw new IspInvoiceSyncError('ID_ISP_DUPLICADO', `La respuesta contiene id ISP duplicado: ${ispGestionId}.`)
        }
        keys.add(key)
        items.push({ key, tipo: 'ISP_FACTURA', data: source as Prisma.InputJsonValue })
      }
      return { items, checkpoint: checkpointForComplete(items), complete: true }
    },

    async prepare(item: SyncSourceItem): Promise<PreparedIspFactura> {
      const source = safeItemSnapshot(item)
      const hash = sourceHash(source)
      try {
        return { kind: 'VALID', source: normalizeIspInvoice(item) }
      } catch (error) {
        return {
          kind: 'ERROR',
          source,
          sourceHash: hash,
          reason: error instanceof IspInvoiceSyncError ? error.code : 'NORMALIZACION_INVALIDA',
        }
      }
    },

    async apply(rawTx, item, preparedValue, actorId): Promise<SyncOutcome> {
      const tx = rawTx as unknown as DbTx
      const prepared = asPrepared(preparedValue)
      // The service persists the original SyncSourceItem (its safe source snapshot)
      // and this terminal outcome in its same transaction.  Invalid financial source
      // data is ERROR rather than a guessed zero/date/default invoice.
      if (prepared.kind === 'ERROR') return 'ERROR'
      const source = prepared.source
      try {
        const existingFactura = await tx.factura.findUnique({
          where: { ispGestionId: source.ispGestionId },
          include: { facturaEmitidaB4: true },
        })

        if (!existingFactura) {
          if (!await authorizedB7Actor(tx, actorId)) {
            return 'REVISAR'
          }
          // A normal create cannot race an already-known source ID: ispGestionId is unique.
          // The FI is created in the same transaction and starts strictly EMITIDA/0/null.
          const factura = await tx.factura.create({ data: facturaCreateData(source) })
          const fi = await tx.facturaEmitida.create({ data: facturaEmitidaCreateData(source, factura.id) })
          // B7 event comes before the FI FK update trigger would ever apply to an update;
          // here the initial FK is allowed and the event still supplies immutable evidence.
          await addB7IdentityAudit(tx, source, fi.id, factura.id, actorId!)
          await maybeCreateNewFiWrapper(tx, fi, source, options.createB4WrapperForNewInvoices === true)
          return 'NUEVA'
        }

        const existingFI = existingFactura.facturaEmitidaB4
        if (!facturaFinancialsMatch(existingFactura, source)) {
          // Do not overwrite any financial figure or legacy payment state.  Review
          // retains the original source item in the service-owned durable job item.
          return 'REVISAR'
        }

        const metadataChanged = onlySafeFacturaMetadataDiffers(existingFactura, source)
        const updateVerifiedMetadata = async (): Promise<void> => {
          if (!metadataChanged) return
          await tx.factura.update({
            where: { id: existingFactura.id },
            data: facturaVerifiedMetadataData(source),
          })
        }

        if (existingFI) {
          // Existing FI's financial state, payment state, imputacion and formaCobro
          // are all immutable to P2.  A source mismatch is a review, not an update.
          if (!fiExactSourceIdentity(existingFI, source)) {
            return 'REVISAR'
          }
          await updateVerifiedMetadata()
          return metadataChanged ? 'ACTUALIZADA' : 'SIN_CAMBIOS'
        }

        // There is no FI linked by the explicit B4 FK.  Only one potential legacy FI
        // is considered: exact external id.  Never match by number/date/customer.
        const exactExternalFI = await tx.facturaEmitida.findUnique({
          where: { idExterno: String(source.ispGestionId) },
        })
        if (exactExternalFI) {
          if (!fiExactSourceIdentity(exactExternalFI, source)) {
            return 'REVISAR'
          }
          if (exactExternalFI.facturaISPId === existingFactura.id) {
            await updateVerifiedMetadata()
            return metadataChanged ? 'ACTUALIZADA' : 'SIN_CAMBIOS'
          }
          if (exactExternalFI.facturaISPId !== null) {
            return 'REVISAR'
          }
          if (options.allowExistingIdentityLink !== true) {
            // The source identity has been proven exact, but linking an old FI is
            // separately opt-in B7 work.  Its safe Factura metadata may still be
            // refreshed; neither the FI nor its collection/bank state is touched.
            await updateVerifiedMetadata()
            return metadataChanged ? 'ACTUALIZADA' : 'SIN_CAMBIOS'
          }
          if (!await authorizedB7Actor(tx, actorId)) {
            return 'REVISAR'
          }
          // The schema's B7 trigger demands an event before changing facturaISPId.
          await addB7IdentityAudit(tx, source, exactExternalFI.id, existingFactura.id, actorId!)
          await tx.facturaEmitida.update({
            where: { id: exactExternalFI.id },
            data: { facturaISPId: existingFactura.id },
          })
          await updateVerifiedMetadata()
          return 'ACTUALIZADA'
        }

        // A missing mirror may be created only from this verified source and only
        // because no exact idExterno source FI exists.  No heuristic matching occurs.
        if (!await authorizedB7Actor(tx, actorId)) {
          return 'REVISAR'
        }
        const fi = await tx.facturaEmitida.create({ data: facturaEmitidaCreateData(source, existingFactura.id) })
        await addB7IdentityAudit(tx, source, fi.id, existingFactura.id, actorId!)
        await maybeCreateNewFiWrapper(tx, fi, source, options.createB4WrapperForNewInvoices === true)
        await updateVerifiedMetadata()
        // New mirror starts at EMITIDA/0/null and does not alter Factura.situacion/totalPendiente.
        return 'NUEVA'
      } catch (error) {
        if (error instanceof IspInvoiceSyncError) throw error
        // The transaction orchestrator should roll back and record an ERROR.  P2
        // cannot safely enqueue after an unknown DB failure outside that transaction.
        throw new IspInvoiceSyncError('APPLY_ERROR', 'No se pudo aplicar ISP_FACTURA.')
      }
    },
    describeOutcome(input: { item: SyncSourceItem; prepared: unknown; outcome: SyncOutcome }) {
      const prepared = asPrepared(input.prepared)
      // Normalization codes are closed, source-data-free identifiers. A review is
      // intentionally generic: it must not disclose FI/Factura identity or amounts.
      if (input.outcome === 'ERROR' && prepared.kind === 'ERROR') return { safeError: prepared.reason }
      if (input.outcome === 'REVISAR') return { safeError: 'ISP_SOURCE_REQUIRES_REVIEW' }
      return null
    },
  }
}

/** Runtime wiring helper: it makes a stage stub explicit and rejects production network use. */
export function createIspIssuedInvoiceProviderForStage(
  fixture: readonly unknown[],
  options: Omit<IspIssuedInvoiceProviderOptions, 'request'> = {},
): SyncProvider {
  return createIspIssuedInvoiceProvider({
    ...options,
    request: async (endpoint, method, data, params) => {
      if (endpoint !== 'facturacion' || method !== 'GET' || data !== null || params.mostrar !== ISP_FACTURACION_LIMIT) {
        throw new IspInvoiceSyncError('STUB_CONTRACT_INVALIDO', 'El stub sólo admite GET facturacion mostrar=5000.')
      }
      return fixture
    },
  })
}
