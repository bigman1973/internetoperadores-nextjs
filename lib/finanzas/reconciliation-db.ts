import { assertArchivosFinancierosParaNuevoCargoJustificadoTx, ArchivoFinancieroAssertError } from '@/lib/finanzas/archivo-financiero-assert'
import { facturaEconomicaWhere } from '@/lib/finanzas/invoice-economic-filter'
import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import {
  catalogoB4,
  convertirImporteBancarioACentimos,
  convertirImporteUiACentimos,
  metadataB8JsonAcotado,
  prepararCancelacionTotal,
  solicitudB4SinCentroCosteFinanzas,
  validarBorradorMovimiento,
  type TipoDocumentoConciliable,
} from '@/lib/finanzas/reconciliation-core'
import {
  B8_NOT_SELECTED,
  eleccionesDesdeLineasB4,
  metadataHashEleccionesCentro,
  type ChoiceCanonical,
  type ChoiceInput,
} from '@/lib/finanzas/centros-coste-core'
import {
  applyChoicesB8,
  assertB8ChoiceReceiptReplayTx,
  B8CentroCosteServiceError,
  type CurrentSourceValidatorB8,
} from '@/lib/finanzas/centros-coste-db'

/** B4 schema is applied independently. Keeping this tiny adapter avoids lying to a
 * pre-generation client while retaining concrete, reviewed operations below. */
type Tx = Prisma.TransactionClient & Record<string, any>
const b4 = (tx: Tx) => tx as any
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LIMIT = 100

type JsonRecord = Record<string, unknown>
export type B4Line =
  | { tipo: 'DOCUMENTO'; documentoConciliableId: string; importeCentimos: number; centroCosteFinanzasId?: string | null }
  | { tipo: 'DIFERENCIA'; motivoDiferencia: 'COMISION' | 'INTERESES' | 'REDONDEO'; importeCentimos: number }

export class B4ServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message)
  }
}

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new B4ServiceError(status, code, message, details)
}

/** B4 no expone detalles internos B8; conserva únicamente su error de contrato. */
function b8FailAsB4(error: unknown): never {
  if (error instanceof B8CentroCosteServiceError) {
    fail(error.status, error.code, error.message)
  }
  throw error
}

function eleccionesB8DesdeBorrador(rawLines: unknown): readonly ChoiceCanonical[] {
  const parsed = eleccionesDesdeLineasB4(rawLines)
  if (!parsed.ok) {
    const errors = (parsed as { ok: false; errors: readonly { codigo: string; mensaje: string }[] }).errors
    fail(400, errors[0]?.codigo ?? 'VALIDATION_ERROR', errors[0]?.mensaje ?? 'Las elecciones B8 no son válidas.', errors)
  }
  return parsed.value
}

function eleccionesB8ParaRecibo(choices: readonly ChoiceCanonical[]): readonly ChoiceInput[] {
  return choices.map((choice) => ({
    indiceLinea: choice.indiceLinea,
    documentoConciliableId: choice.documentoConciliableId,
    ...(choice.centroCosteFinanzasId === B8_NOT_SELECTED ? {} : { centroCosteFinanzasId: choice.centroCosteFinanzasId }),
  }))
}

function exactKeys(value: unknown, keys: readonly string[], label = '$'): asserts value is JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'VALIDATION_ERROR', `${label} debe ser un objeto JSON.`)
  const got = Object.keys(value as JsonRecord)
  if (got.length !== keys.length || got.some((key) => !keys.includes(key)) || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    fail(400, 'VALIDATION_ERROR', `${label} contiene claves fuera del contrato.`)
  }
}

function stringId(value: unknown, field: string, uuid = false): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160 || (uuid && !UUID.test(value))) {
    fail(400, 'VALIDATION_ERROR', `${field} no es un identificador válido.`)
  }
  return value
}

function sourceDecimal(value: unknown, field: string): string | number {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value instanceof Prisma.Decimal) return value.toString()
  fail(422, 'IMPORTE_FUENTE_DESCONOCIDO', `${field} no contiene un importe decimal verificable.`)
}

/** Financial Float serialization must not shorten a PostgreSQL residue. */
async function exactSourceDecimal(tx: Tx, table: string, column: string, id: string | number): Promise<string | null> {
  const allowed: Record<string, readonly string[]> = {
    movimientos_bancarios: ['importe'], facturas_recibidas: ['total'], facturas_emitidas: ['total'],
    facturas: ['total'], remesas: ['total_importe'], nominas: ['neto_percibir'],
    pagos_fraccionados: ['importe'], documentos_aapp: ['importe'], gastos: ['importe'],
  }
  if (!allowed[table]?.includes(column)) throw new Error('B4_INTERNAL_COLUMN')
  const rows = await tx.$queryRaw<Array<{ decimal: string | null }>>(Prisma.sql`
    SELECT ${Prisma.raw('"'+column+'"')}::text AS decimal FROM ${Prisma.raw('"'+table+'"')} WHERE id = ${id} LIMIT 1
  `)
  return rows[0]?.decimal ?? null
}

function sourceZero(value: string | number): boolean {
  return typeof value === 'number'
    ? value === 0
    : /^[+-]?0(?:[.,]0{1,2})?$/.test(value.trim())
}

function centsFromSource(value: unknown, field: string, allowNull = false, allowZero = false): number | null {
  if (value === null || value === undefined) {
    if (allowNull) return null
    fail(422, 'IMPORTE_FUENTE_DESCONOCIDO', `${field} no contiene un importe exacto.`)
  }
  const decimal = sourceDecimal(value, field)
  // MovimientoBancario and the legacy source models persist decimal units
  // (Float/Decimal), not B4 cents. The core parser is the sole conversion and
  // rejects binary residues and values with more than two decimals.
  if (allowZero && sourceZero(decimal)) {
    const zero = convertirImporteBancarioACentimos(0, field)
    if (zero.ok) return zero.value
  }
  const converted = convertirImporteUiACentimos(decimal)
  if (!converted.ok) fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no es un importe B4 exacto y distinto de cero.`, 'errors' in converted ? converted.errors : undefined)
  return converted.value
}

function centsFromStoredCentimos(value: unknown, field: string, allowNull = false, allowZero = false): number | null {
  if (value === null || value === undefined) {
    if (allowNull) return null
    fail(422, 'IMPORTE_FUENTE_DESCONOCIDO', `${field} no contiene céntimos exactos.`)
  }
  const converted = convertirImporteBancarioACentimos(value, field)
  if (!converted.ok || (!allowZero && converted.value === 0)) {
    fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no contiene céntimos B4 exactos y distintos de cero.`, !converted.ok && 'errors' in converted ? converted.errors : undefined)
  }
  return converted.value
}

function requireSigned(cents: number | null, sign: 1 | -1, field: string): number | null {
  if (cents === null) return null
  if (Math.sign(cents) !== sign) fail(422, 'IMPORTE_FUENTE_SIGNO_INVALIDO', `${field} tiene un signo incompatible; no se aplica abs().`)
  return cents
}

function numericSourceId(value: string, field: string): number {
  if (!/^\d+$/.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe ser un ID numérico existente.`)
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id < 1) fail(400, 'VALIDATION_ERROR', `${field} debe ser un ID numérico existente.`)
  return id
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as JsonRecord
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
function payloadHash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex') }
function operationView(operation: any) {
  return {
    id: operation.id, estado: operation.estado, versionResultante: operation.versionResultante,
    movimientoId: operation.movimientoId, snapshotResultado: operation.snapshotResultado,
  }
}
function docView(doc: any) {
  return { id: doc.id, tipo: doc.tipo, importeObjetivoCentimos: doc.importeObjetivoCentimos, version: doc.version }
}
function stateView(state: any) {
  return { estado: state.estado, motivoNoRequiere: state.motivoNoRequiere ?? null, version: state.version }
}

async function advisoryAndMovementLock(tx: Tx, movimientoId: string) {
  // movimientos_bancarios.id is TEXT: it is deliberately opaque and is not a UUID.
  stringId(movimientoId, 'movimientoId')
  // Cast the void result to text: Prisma must never deserialize PostgreSQL void.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text), 0))::text AS locked`
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM movimientos_bancarios WHERE id = CAST(${movimientoId} AS text) FOR UPDATE
  `
  if (rows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
}

async function lockDocuments(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)].sort()) {
    stringId(id, 'documentoConciliableId', true)
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM documentos_conciliables WHERE id = CAST(${id} AS uuid) FOR UPDATE
    `
    if (rows.length !== 1) fail(404, 'DOCUMENTO_NO_ENCONTRADO', 'Un envoltorio documental no existe.')
  }
}

async function sourceEvidence(tx: Tx, tipo: TipoDocumentoConciliable, sourceId: string): Promise<{ target: number | null; pointer: JsonRecord; source: JsonRecord }> {
  const db = b4(tx)
  switch (tipo) {
    case 'FACTURA_RECIBIDA': {
      const source = await tx.facturaRecibida.findFirst({
        // Same economic eligibility as B2: a valid canonical row which is neither
        // a copy nor an unresolved identity/duplicate conflict is evidence.
        where: {
          id: sourceId, calidad: 'VALIDA', copiaDeId: null,
          AND: [facturaEconomicaWhere],
          conflictoIdentidad: false, duplicadoExterno: false,
          NOT: [{ proveedor: { equals: 'ERROR_OCR', mode: 'insensitive' } }, { proveedor: { equals: 'DESCONOCIDO', mode: 'insensitive' } }],
        },
        select: { id: true, total: true, proveedor: true, numFactura: true, fecha: true },
      })
      if (!source) fail(422, 'FACTURA_NO_ECONOMICA', 'La factura recibida no es una fuente económica canónica válida.')
      const amount = centsFromSource(await exactSourceDecimal(tx,'facturas_recibidas','total',source.id), 'factura recibida.total')
      // Preserve the actual invoice sign. A received invoice is payable, hence
      // its B4 target is the inverse signed source amount; never abs().
      return { target: amount === null ? null : -amount, pointer: { facturaRecibidaId: source.id }, source: { id: source.id, proveedor: source.proveedor, numFactura: source.numFactura, fecha: source.fecha } }
    }
    case 'FACTURA_EMITIDA': {
      let source: any = await (tx.facturaEmitida as any).findUnique({ where: { id: sourceId } })
      // The ISP invoice is an alias only through the explicit unique FK.  Do not
      // infer an identity from idExterno, invoice text, amount, or a legacy ID.
      if (!source && /^\d+$/.test(sourceId)) {
        const isp: any = await (tx.factura as any).findUnique({ where: { id: Number(sourceId) } })
        if (isp) source = await (tx.facturaEmitida as any).findUnique({ where: { facturaISPId: isp.id } })
      }
      if (!source) fail(404, 'FACTURA_EMITIDA_NO_ENCONTRADA', 'La factura emitida no existe.')
      const amount = centsFromSource(await exactSourceDecimal(tx,'facturas_emitidas','total',source.id), 'factura emitida.total')!
      // If the explicit ISP mirror map exists, prove both actual rows agree.  We
      // neither infer it from idExterno nor overwrite either source.
      if (source.facturaISPId !== null && source.facturaISPId !== undefined) {
        const isp = await (tx.factura as any).findUnique({ where: { id: source.facturaISPId } })
        if (!isp || centsFromSource(await exactSourceDecimal(tx,'facturas','total',isp.id), 'factura ISP.total') !== amount) {
          fail(422, 'IDENTIDAD_FACTURA_ISP_AMBIGUA', 'La relación explícita FacturaEmitida–Factura ISP no es unívoca y exacta.')
        }
      }
      return { target: amount, pointer: { facturaEmitidaId: source.id }, source: { id: source.id, facturaISPId: source.facturaISPId ?? null, cliente: source.cliente, numFactura: source.numFactura, fecha: source.fecha } }
    }
    case 'REMESA': {
      const source: any = await (tx.remesa as any).findUnique({ where: { id: numericSourceId(sourceId, 'sourceId de REMESA') } })
      if (!source) fail(404, 'REMESA_NO_ENCONTRADA', 'La remesa no existe.')
      return { target: requireSigned(centsFromSource(await exactSourceDecimal(tx,'remesas','total_importe',source.id), 'remesa.totalImporte'), 1, 'remesa.totalImporte'), pointer: { remesaId: source.id }, source: { id: source.id, ispGestionId: source.ispGestionId, nombre: source.nombre, fecha: source.fecha } }
    }
    case 'NOMINA': {
      const source: any = await (tx.nomina as any).findUnique({ where: { id: sourceId }, select: { id: true, netoPercibir: true, mes: true, anio: true } })
      if (!source) fail(404, 'NOMINA_NO_ENCONTRADA', 'La nómina no existe.')
      // Only the actual liquid-to-pay field is eligible; never employer cost,
      // gross pay or diets/reimbursements.
      return { target: requireSigned(centsFromSource(await exactSourceDecimal(tx,'nominas','neto_percibir',source.id), 'nomina.netoPercibir'), 1, 'nomina.netoPercibir')! * -1, pointer: { nominaId: source.id }, source: { id: source.id, mes: source.mes, anio: source.anio } }
    }
    case 'IMPUESTO_TGSS': {
      const evidenceForCuota = async (id: number) => {
        const instalment: any = await (db.pagoFraccionado as any).findUnique({ where: { id }, include: { documento: true } })
        if (!instalment) fail(404, 'PAGO_FRACCIONADO_NO_ENCONTRADO', 'La cuota fiscal/TGSS no existe.')
        const organismo = String(instalment.documento?.organismo ?? '').toLowerCase()
        if (!['hacienda', 'seguridad_social', 'tgss'].includes(organismo)) fail(422, 'DOCUMENTO_AAPP_NO_FISCAL', 'La cuota no corresponde a Hacienda/TGSS.')
        return { target: requireSigned(centsFromSource(await exactSourceDecimal(tx,'pagos_fraccionados','importe',instalment.id), 'pago fraccionado.importe'), 1, 'pago fraccionado.importe')! * -1, pointer: { pagoFraccionadoId: instalment.id }, source: { id: instalment.id, documentoId: instalment.documentoId, numeroCuota: instalment.numeroCuota, totalCuotas: instalment.totalCuotas, referencia: instalment.referencia, fecha: instalment.fechaVencimiento, documento: instalment.documento ? { organismo: instalment.documento.organismo, categoria: instalment.documento.categoria, ejercicio: instalment.documento.ejercicio, expediente: instalment.documento.expediente } : null } }
      }
      const evidenceForAapp = async (id: number) => {
        const source: any = await (db.documentoAAPP as any).findUnique({ where: { id } })
        if (!source) fail(404, 'DOCUMENTO_AAPP_NO_ENCONTRADO', 'El documento fiscal/TGSS no existe.')
        if (!['hacienda', 'seguridad_social', 'tgss'].includes(String(source.organismo).toLowerCase())) fail(422, 'DOCUMENTO_AAPP_NO_FISCAL', 'El documento no corresponde a Hacienda/TGSS.')
        return { target: requireSigned(centsFromSource(await exactSourceDecimal(tx,'documentos_aapp','importe',source.id), 'documento AAPP.importe'), 1, 'documento AAPP.importe')! * -1, pointer: { documentoAappId: source.id }, source: { id: source.id, organismo: source.organismo, categoria: source.categoria, ejercicio: source.ejercicio, expediente: source.expediente, fecha: source.fechaDocumento } }
      }
      if (sourceId.startsWith('aapp:')) return evidenceForAapp(numericSourceId(sourceId.slice(5), 'sourceId aapp'))
      if (sourceId.startsWith('cuota:')) return evidenceForCuota(numericSourceId(sourceId.slice(6), 'sourceId cuota'))

      // Legacy numeric IDs are accepted only if they select exactly one concrete
      // source. A DocumentoAAPP and a PagoFraccionado may both have id=1.
      const numericId = numericSourceId(sourceId, 'sourceId de IMPUESTO_TGSS')
      const [aapp, cuota] = await Promise.all([
        (db.documentoAAPP as any).findUnique({ where: { id: numericId } }),
        (db.pagoFraccionado as any).findUnique({ where: { id: numericId } }),
      ])
      if (aapp && cuota) fail(409, 'SOURCE_ID_AMBIGUO', 'sourceId numérico de IMPUESTO_TGSS coincide con documento AAPP y cuota; use aapp:<id> o cuota:<id>.')
      if (aapp) return evidenceForAapp(numericId)
      if (cuota) return evidenceForCuota(numericId)
      fail(404, 'DOCUMENTO_AAPP_NO_ENCONTRADO', 'El documento fiscal/TGSS no existe.')
    }
    case 'PRESTAMO': {
      const source: any = await db.documentoPrestamo.findUnique({ where: { id: sourceId } })
      if (!source) fail(404, 'EVIDENCIA_PRESTAMO_NO_ENCONTRADA', 'No existe evidencia de cuota/préstamo.')
      // This B4 record is an installment evidence, not the whole-loan principal.
      const target = source.importeObjetivoCentimos === null || source.importeObjetivoCentimos === undefined
        ? null : centsFromStoredCentimos(source.importeObjetivoCentimos, 'documento préstamo.importeObjetivoCentimos')
      return { target, pointer: { documentoPrestamoId: source.id }, source: { id: source.id, referencia: source.referencia } }
    }
    case 'TICKET': {
      const source: any = await (tx.gasto as any).findUnique({ where: { id: sourceId }, select: { id: true, estado: true, metodoPago: true, importe: true, concepto: true, comercio: true, fecha: true } })
      if (!source) fail(404, 'TICKET_NO_ENCONTRADO', 'El ticket/gasto no existe.')
      if (!['APROBADO', 'CONTABILIZADO'].includes(String(source.estado)) || source.metodoPago !== 'TARJETA_EMPRESA') {
        fail(422, 'TICKET_FUERA_DE_AMBITO_AUTORIZADO', 'El ticket debe estar aprobado y en el ámbito de tarjeta de empresa.')
      }
      return { target: requireSigned(centsFromSource(await exactSourceDecimal(tx,'gastos','importe',source.id), 'ticket.importe'), 1, 'ticket.importe')! * -1, pointer: { gastoId: source.id }, source: { id: source.id, concepto: source.concepto, comercio: source.comercio, fecha: source.fecha } }
    }
    case 'TRASPASO': {
      // MovimientoBancario has no currency field. infoAdicional is not an exact
      // monetary-currency evidence, therefore this version fails closed rather
      // than fabricating an EUR transfer from two heuristic movements.
      fail(422, 'EVIDENCIA_TRANSFERENCIA_INSUFICIENTE', 'No existe un campo de moneda EUR verificable para confirmar el traspaso.')
    }
  }
}

function pointerKeys(): readonly string[] {
  return ['facturaRecibidaId', 'facturaEmitidaId', 'remesaId', 'nominaId', 'documentoAappId', 'pagoFraccionadoId', 'documentoPrestamoId', 'gastoId', 'traspasoInternoId']
}
async function evidenceForWrapper(tx: Tx, doc: any) {
  if (!doc?.activo) fail(422, 'DOCUMENTO_INACTIVO', 'El envoltorio documental no está activo.')
  const nonNull = pointerKeys().filter((key) => doc[key] !== null && doc[key] !== undefined)
  if (nonNull.length !== 1) fail(422, 'REFERENCIA_DOCUMENTAL_ILEGAL', 'Un envoltorio debe conservar una única fuente legal.')
  const pointer = nonNull[0]
  const sourceId = doc.tipo === 'IMPUESTO_TGSS'
    ? pointer === 'documentoAappId' ? `aapp:${doc[pointer]}` : `cuota:${doc[pointer]}`
    : String(doc[pointer])
  const evidence = await sourceEvidence(tx, doc.tipo, sourceId)
  const key = Object.keys(evidence.pointer)[0]
  if (key !== nonNull[0] || String((evidence.pointer as any)[key]) !== String(doc[nonNull[0]])) {
    fail(422, 'REFERENCIA_DOCUMENTAL_ILEGAL', 'El tipo documental no coincide con su fuente.')
  }
  if (evidence.target !== doc.importeObjetivoCentimos) fail(409, 'EVIDENCIA_DOCUMENTAL_CAMBIADA', 'La fuente ya no coincide con el objetivo del envoltorio.')
  return evidence
}

/**
 * Fuente viva que B8 recibe desde B4, nunca desde cliente ni desde un importe
 * copiado. Usa el mismo `evidenceForWrapper` que valida capacidad B4: wrapper
 * activo, único origen legal y objetivo firmado exactamente vigente.
 */
export function createB8CurrentSourceValidator(): CurrentSourceValidatorB8 {
  return {
    // Only B8 GET calls this method. Mutations retain locking + evidenceForWrapper.
    // All wrapper/source reads use the caller's same repeatable/serializable snapshot.
    async inspectCurrentB4DocumentSourcesTx(tx, inputs) {
      const ids = [...new Set(inputs.map(input => input.documentoConciliableId))]
      const docs = await b4(tx).documentoConciliable.findMany({where:{id:{in:ids}}})
      const inspections = await inspectDocumentsBatch(docs, tx)
      const byId = new Map<string, any>(docs.map((doc:any)=>[doc.id,doc]))
      const results = new Map<string, {referencia:string} | null>()
      for (const input of inputs) {
        const doc = byId.get(input.documentoConciliableId)
        const inspected = inspections.get(input.documentoConciliableId)
        if (!doc || !inspected || inspected.stale) { results.set(input.documentoConciliableId,null);continue }
        const metadata = documentMetadata(doc,inspected.evidence)
        results.set(input.documentoConciliableId, typeof metadata?.referencia==='string' && metadata.referencia.trim() ? {referencia:metadata.referencia} : null)
      }
      return results
    },
    async assertCurrentB4DocumentSourceTx(tx, { movimientoId, documentoConciliableId }) {
      const docs = await b4(tx).documentoConciliable.findMany({
        where: {
          id: documentoConciliableId,
          vinculos: { some: { movimientoId, activo: true, tipoLinea: 'DOCUMENTO' } },
        },
      })
      const doc = docs[0]
      if (!doc) fail(409, 'B8_DOCUMENT_SOURCE_STALE', 'No existe DOCUMENTO B4 activo actual.')
      await lockDocuments(tx, [doc.id])
      const evidence = await evidenceForWrapper(tx, doc)
      const metadata = documentMetadata(doc, evidence)
      if (!metadata || typeof metadata.referencia !== 'string' || metadata.referencia.trim().length === 0) {
        fail(409, 'B8_DOCUMENT_SOURCE_STALE', 'La fuente DOCUMENTO B4 actual no expone referencia válida.')
      }
      return { referencia: metadata.referencia }
    },
  }
}

async function currentState(tx: Tx, movimientoId: string) {
  return await b4(tx).estadoJustificacionMovimientoB4.findUnique({ where: { movimientoId } })
}
async function activeNet(tx: Tx, documentIds: string[]) {
  const rows: Array<{ documentoConciliableId: string; total: number | bigint | null }> = await tx.$queryRaw`
    SELECT documento_conciliable_id AS "documentoConciliableId", COALESCE(SUM(importe_centimos), 0) AS total
    FROM vinculos_movimiento_documento
    WHERE activo = true AND documento_conciliable_id IN (${Prisma.join(documentIds.map((id) => Prisma.sql`CAST(${id} AS uuid)`))})
    GROUP BY documento_conciliable_id
  `
  return new Map(rows.map((row) => [row.documentoConciliableId, Number(row.total ?? 0)]))
}

async function checkIdempotency(tx: Tx, actorId: number, key: string, hash: string) {
  const existing = await b4(tx).operacionJustificacionB4.findUnique({ where: { solicitadaPorId_idempotencyKey: { solicitadaPorId: actorId, idempotencyKey: key } } })
  if (!existing) return null
  if (existing.payloadHash !== hash) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia ya se usó con otro payload.')
  return existing
}

export async function createDocumentoB4(actorId: number, input: unknown) {
  exactKeys(input, ['action', 'tipoDocumento', 'sourceId'])
  const raw = input as JsonRecord
  if (raw.action !== 'documento') fail(400, 'VALIDATION_ERROR', 'Acción documento inválida.')
  const tipos = catalogoB4().tiposDocumento as readonly string[]
  if (typeof raw.tipoDocumento !== 'string' || !tipos.includes(raw.tipoDocumento)) fail(400, 'VALIDATION_ERROR', 'tipoDocumento B4 inválido.')
  const sourceId = stringId(raw.sourceId, 'sourceId')
  await assertFinanceRuntimeReady()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    const tipo = raw.tipoDocumento as TipoDocumentoConciliable
    const evidence = await sourceEvidence(tx, tipo, sourceId)
    const pointer = evidence.pointer
    const existing = await b4(tx).documentoConciliable.findFirst({ where: pointer })
    if (existing) {
      if (existing.tipo !== tipo || existing.importeObjetivoCentimos !== evidence.target) fail(409, 'DOCUMENTO_EXISTENTE_INCOHERENTE', 'Ya existe un envoltorio incoherente para la fuente.')
      return { documento: docView(existing), created: false }
    }
    const doc = await b4(tx).documentoConciliable.create({ data: { tipo, importeObjetivoCentimos: evidence.target, ...pointer } })
    return { documento: docView(doc), created: true }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function confirmarB4(actorId: number, input: unknown) {
  exactKeys(input, ['action', 'confirmacion', 'idempotencyKey', 'version', 'borrador'])
  const raw = input as JsonRecord
  if (raw.action !== 'confirmar' || raw.confirmacion !== true) fail(400, 'VALIDATION_ERROR', 'confirmar exige confirmacion: true.')
  const idempotencyKey = stringId(raw.idempotencyKey, 'idempotencyKey')
  if (idempotencyKey.length > 128 || !Number.isInteger(raw.version) || (raw.version as number) < 0) fail(400, 'VALIDATION_ERROR', 'version o idempotencyKey inválidos.')
  const eleccionesB8 = eleccionesB8DesdeBorrador((raw.borrador as JsonRecord | undefined)?.lineas)
  if (!metadataB8JsonAcotado({ elecciones: eleccionesB8 })) {
    fail(400, 'B8_METADATA_TOO_LARGE', 'El metadato de elecciones de centro excede el límite permitido.')
  }
  const metadataHashB8 = metadataHashEleccionesCentro(eleccionesB8)
  // Sólo la solicitud económica B4 se hashea/persiste. El DTO original conserva
  // centros exclusivamente para construir el recibo B8 separado dentro del tx.
  const solicitudB4 = solicitudB4SinCentroCosteFinanzas(raw) as JsonRecord
  const hash = payloadHash(solicitudB4)
  const draftProbe = raw.borrador as any
  const movimientoId = stringId(draftProbe?.movimientoId, 'borrador.movimientoId')
  await assertFinanceRuntimeReady()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    await advisoryAndMovementLock(tx, movimientoId)
    const replay = await checkIdempotency(tx, actorId, idempotencyKey, hash)
    if (replay) {
      try {
        await assertB8ChoiceReceiptReplayTx(tx, {
          operacionB4Id: replay.id,
          actorId,
          idempotencyKey,
          metadataHash: metadataHashB8,
          elecciones: eleccionesB8,
        })
      } catch (error) {
        b8FailAsB4(error)
      }
      return { idempotente: true, operacion: operationView(replay), estado: replay.snapshotResultado }
    }

    const movement: any = await (tx.movimientoBancario as any).findUnique({ where: { id: movimientoId }, select: { id: true, importe: true } })
    if (!movement) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
    const movementCents = centsFromSource(await exactSourceDecimal(tx,'movimientos_bancarios','importe',movement.id), 'movimiento.importe', false, true)!
    if (!solicitudB4.borrador || typeof solicitudB4.borrador !== 'object' || Array.isArray(solicitudB4.borrador)) fail(400, 'VALIDATION_ERROR', 'borrador inválido.')
    const normalizedDraft = { ...(solicitudB4.borrador as JsonRecord), importeMovimientoCentimos: movementCents }
    // Client cannot substitute the bank amount: equality is asserted against source.
    if ((raw.borrador as any).importeMovimientoCentimos !== movementCents) fail(409, 'IMPORTE_MOVIMIENTO_CAMBIADO', 'El importe del borrador no coincide con el banco.')
    const docIds: string[] = Array.isArray((raw.borrador as any).lineas)
      ? (raw.borrador as any).lineas.filter((line: any) => line?.tipo === 'DOCUMENTO').map((line: any) => String(line.documentoConciliableId)) : []
    await lockDocuments(tx, docIds)
    const docs = docIds.length ? await b4(tx).documentoConciliable.findMany({ where: { id: { in: docIds } } }) : []
    if (docs.length !== new Set(docIds).size) fail(404, 'DOCUMENTO_NO_ENCONTRADO', 'Un documento no existe.')
    for (const doc of docs) await evidenceForWrapper(tx, doc)
    const nets = docIds.length ? await activeNet(tx, [...new Set(docIds)]) : new Map<string, number>()
    const validation = validarBorradorMovimiento(normalizedDraft, docs.map((doc: any) => ({ documentoConciliableId: doc.id, tipoDocumento: doc.tipo, importeObjetivoCentimos: doc.importeObjetivoCentimos, netoActivoPrevioCentimos: nets.get(doc.id) ?? 0 })))
    if (!validation.ok) fail(400, 'VALIDATION_ERROR', 'El borrador B4 no es válido.', (validation as any).errors)

    const previous = await currentState(tx, movimientoId)
    // An absent row is the schema's virtual initial state at version 1. It is
    // intentionally not materialized until a confirmed operation applies it.
    const previousVersion = previous?.version ?? 1
    if (previousVersion !== raw.version) fail(409, 'VERSION_CONFLICT', 'La versión B4 ha cambiado; relea el movimiento.')
    if (previous?.estado === 'JUSTIFICADO' || previous?.estado === 'NO_REQUIERE') {
      fail(409, 'DESHACER_REQUERIDO', 'Un JUSTIFICADO o NO_REQUIERE existente debe deshacerse totalmente antes de reemplazarse.')
    }
    const plan = validation.value
    try { await assertArchivosFinancierosParaNuevoCargoJustificadoTx(tx, { movimientoId, estado: plan.borrador.estado, documentoConciliableIds: docIds }) } catch (error) { if (error instanceof ArchivoFinancieroAssertError) fail(error.status,error.code,error.message); throw error }
    const resultState = { estado: plan.borrador.estado, motivoNoRequiere: plan.borrador.motivoNoRequiere ?? null, version: previousVersion + 1 }
    const operation = await b4(tx).operacionJustificacionB4.create({
      data: {
        movimientoId, estado: 'APLICADA', idempotencyKey, payloadHash: hash, versionEsperada: previousVersion,
        versionResultante: resultState.version, solicitadaPorId: actorId, aprobadaPorId: actorId,
        snapshotSolicitud: solicitudB4, snapshotEstadoPrevio: previous ? stateView(previous) : { estado: 'SIN_DOCUMENTO', motivoNoRequiere: null, version: 1 },
        snapshotResultado: resultState, aprobadaAt: new Date(), aplicadaAt: new Date(),
      },
    })
    if (plan.borrador.lineas.length) await b4(tx).vinculoMovimientoDocumento.createMany({ data: plan.borrador.lineas.map((line: B4Line) => ({
      movimientoId, operacionCreacionId: operation.id, activo: true, importeCentimos: line.importeCentimos,
      tipoLinea: line.tipo, documentoConciliableId: line.tipo === 'DOCUMENTO' ? line.documentoConciliableId : null,
      motivoDiferencia: line.tipo === 'DIFERENCIA' ? line.motivoDiferencia : null,
    })) })
    if (previous) await b4(tx).estadoJustificacionMovimientoB4.update({ where: { movimientoId }, data: { ...resultState, actualizadoPorId: actorId } })
    else await b4(tx).estadoJustificacionMovimientoB4.create({ data: { movimientoId, ...resultState, actualizadoPorId: actorId } })
    try {
      const lineasDocumentoCreadas = plan.borrador.estado === 'NO_REQUIERE'
        ? []
        : await b4(tx).vinculoMovimientoDocumento.findMany({
          where: { operacionCreacionId: operation.id, activo: true, tipoLinea: 'DOCUMENTO' },
          select: { id: true, documentoConciliableId: true },
        }).then((rows: any[]) => {
          const indicesPorDocumento = new Map<string, number>()
          plan.borrador.lineas.forEach((line, indiceLinea) => {
            if (line.tipo === 'DOCUMENTO') indicesPorDocumento.set(line.documentoConciliableId, indiceLinea)
          })
          const mapped = rows.map((row) => ({
            indiceLinea: indicesPorDocumento.get(row.documentoConciliableId),
            vinculoMovimientoDocumentoId: row.id,
            documentoConciliableId: row.documentoConciliableId,
          }))
          if (mapped.some((row) => !Number.isSafeInteger(row.indiceLinea))) {
            fail(409, 'B8_DOCUMENT_MAPPING_INVALID', 'Las líneas DOCUMENTO creadas no corresponden al borrador B4.')
          }
          return mapped as Array<{ indiceLinea: number; vinculoMovimientoDocumentoId: string; documentoConciliableId: string }>
        })
      await applyChoicesB8(tx, {
        actorId,
        operacionB4Id: operation.id,
        idempotencyKey,
        elecciones: eleccionesB8ParaRecibo(eleccionesB8),
        lineasDocumentoCreadas,
        requiredCurrentSourceValidator: createB8CurrentSourceValidator(),
      })
    } catch (error) {
      b8FailAsB4(error)
    }
    await b4(tx).eventoJustificacionB4.createMany({ data: ['SOLICITUD', 'APROBACION', 'APLICACION'].map((accion) => ({
      operacionId: operation.id, movimientoId, accion, actorId, detalle: { version: resultState.version },
    })) })
    return { idempotente: false, operacion: operationView(operation), estado: resultState }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export async function deshacerB4(actorId: number, input: unknown) {
  exactKeys(input, ['action', 'confirmacion', 'idempotencyKey', 'version', 'operacionId', 'lineas'])
  const raw = input as JsonRecord
  if (raw.action !== 'deshacer' || raw.confirmacion !== true) fail(400, 'VALIDATION_ERROR', 'deshacer exige confirmacion: true.')
  const idempotencyKey = stringId(raw.idempotencyKey, 'idempotencyKey')
  const operationId = stringId(raw.operacionId, 'operacionId', true)
  if (!Number.isInteger(raw.version) || (raw.version as number) < 0 || !Array.isArray(raw.lineas)) fail(400, 'VALIDATION_ERROR', 'version o lineas inválidas.')
  const hash = payloadHash(raw)
  await assertFinanceRuntimeReady()
  return (prisma as PrismaClient).$transaction(async (base) => {
    const tx = base as Tx
    const original = await b4(tx).operacionJustificacionB4.findUnique({ where: { id: operationId } })
    if (!original) fail(404, 'OPERACION_NO_ENCONTRADA', 'La operación original no existe.')
    await advisoryAndMovementLock(tx, original.movimientoId)
    const replay = await checkIdempotency(tx, actorId, idempotencyKey, hash)
    if (replay) return { idempotente: true, operacion: operationView(replay), estado: replay.snapshotResultado }
    if (original.estado !== 'APLICADA' || original.revertidaAt || original.revierteOperacionId !== null) {
      fail(409, 'OPERACION_NO_REVERSIBLE', 'Sólo una operación original aplicada y no revertida puede deshacerse; una reversión no admite reversión.')
    }
    const state = await currentState(tx, original.movimientoId)
    if (!state || state.version !== raw.version || state.version !== original.versionResultante) fail(409, 'VERSION_CONFLICT', 'El estado ya cambió; no se puede deshacer selectivamente.')
    const active = await b4(tx).vinculoMovimientoDocumento.findMany({ where: { operacionCreacionId: original.id, activo: true }, select: { id: true, importeCentimos: true, documentoConciliableId: true } })
    await lockDocuments(tx, active.map((line: any) => line.documentoConciliableId).filter(Boolean))
    if (active.length) {
      const cancel = prepararCancelacionTotal(original.id, original.movimientoId, active.map((line: any) => ({ id: line.id, importeCentimos: line.importeCentimos })), raw.lineas)
      if (!cancel.ok) fail(400, 'VALIDATION_ERROR', 'Deshacer total inválido.', (cancel as any).errors)
    } else if ((raw.lineas as unknown[]).length !== 0) fail(400, 'VALIDATION_ERROR', 'Una operación NO_REQUIERE no tiene líneas para deshacer.')
    const prior: any = original.snapshotEstadoPrevio
    if (!prior || !['SIN_DOCUMENTO', 'JUSTIFICADO', 'NO_REQUIERE'].includes(prior.estado)) fail(409, 'SNAPSHOT_PREVIO_INVALIDO', 'No existe un estado previo reversible.')
    const result = { estado: prior.estado, motivoNoRequiere: prior.motivoNoRequiere ?? null, version: state.version + 1 }
    const operation = await b4(tx).operacionJustificacionB4.create({ data: {
      movimientoId: original.movimientoId, estado: 'APLICADA', idempotencyKey, payloadHash: hash, versionEsperada: state.version,
      versionResultante: result.version, solicitadaPorId: actorId, aprobadaPorId: actorId, revierteOperacionId: original.id,
      snapshotSolicitud: raw, snapshotEstadoPrevio: stateView(state), snapshotResultado: result, aprobadaAt: new Date(), aplicadaAt: new Date(),
    } })
    if (active.length) await b4(tx).vinculoMovimientoDocumento.updateMany({ where: { id: { in: active.map((line: any) => line.id) }, activo: true }, data: { activo: false, operacionAnulacionId: operation.id } })
    await b4(tx).estadoJustificacionMovimientoB4.update({ where: { movimientoId: original.movimientoId }, data: { ...result, actualizadoPorId: actorId } })
    await b4(tx).operacionJustificacionB4.update({ where: { id: original.id }, data: { estado: 'REVERTIDA', revertidaAt: new Date() } })
    await b4(tx).eventoJustificacionB4.createMany({ data: ['SOLICITUD', 'APROBACION', 'REVERSION'].map((accion) => ({ operacionId: operation.id, movimientoId: original.movimientoId, accion, actorId, detalle: { revierteOperacionId: original.id, version: result.version } })) })
    return { idempotente: false, operacion: operationView(operation), estado: result }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
}

export type ReadConciliacionB4Options = Readonly<{
  movimientosOffset?: number
  documentosOffset?: number
  q?: string
  cuentaId?: string
  movimientoId?: string
}>

function boundedLimit(value: number): number {
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(value)))
}

function boundedOffset(value: number | undefined): number {
  return Math.min(100000, Math.max(0, Math.floor(value ?? 0)))
}

function pointerForDocument(doc: any): { key: string; sourceId: string } | null {
  const keys = pointerKeys().filter((key) => doc[key] !== null && doc[key] !== undefined)
  if (keys.length !== 1) return null
  const key = keys[0]
  const raw = String(doc[key])
  return {
    key,
    sourceId: doc.tipo === 'IMPUESTO_TGSS'
      ? key === 'documentoAappId' ? `aapp:${raw}` : key === 'pagoFraccionadoId' ? `cuota:${raw}` : raw
      : raw,
  }
}

function isoDate(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null
}

function fallbackReference(doc: any): string {
  const source = pointerForDocument(doc)?.sourceId ?? doc.id
  switch (doc.tipo) {
    case 'FACTURA_RECIBIDA': return `Factura recibida ${source}`
    case 'FACTURA_EMITIDA': return `Factura emitida ${source}`
    case 'REMESA': return `Remesa ${source}`
    case 'NOMINA': return 'Nómina'
    case 'IMPUESTO_TGSS': return `Fiscal ${source}`
    case 'PRESTAMO': return `Préstamo ${source}`
    case 'TICKET': return `Ticket ${source}`
    case 'TRASPASO': return 'Traspaso interno'
    default: return `Documento ${source}`
  }
}

function documentMetadata(doc: any, evidence: any | null) {
  const source = evidence?.source as any
  const fallback = { referencia: fallbackReference(doc), tercero: null as string | null, fecha: null as string | null }
  if (!source) return fallback
  switch (doc.tipo) {
    case 'FACTURA_RECIBIDA':
      return { referencia: `Factura recibida ${source.numFactura || source.id}`, tercero: source.proveedor ?? null, fecha: isoDate(source.fecha) }
    case 'FACTURA_EMITIDA':
      return { referencia: `Factura emitida ${source.numFactura || source.id}`, tercero: source.cliente ?? null, fecha: isoDate(source.fecha) }
    case 'REMESA':
      return { referencia: `Remesa ${source.nombre || source.ispGestionId || source.id}`, tercero: null, fecha: isoDate(source.fecha) }
    case 'NOMINA':
      return { referencia: `Nómina ${String(source.mes).padStart(2, '0')}/${source.anio}`, tercero: null, fecha: null }
    case 'IMPUESTO_TGSS': {
      const fiscal = source.document ?? source
      const modelo = fiscal.categoria || fiscal.organismo || 'fiscal'
      return { referencia: `Fiscal ${modelo}${fiscal.ejercicio ? ` ${fiscal.ejercicio}` : ''}`, tercero: null, fecha: isoDate(source.fecha) }
    }
    case 'PRESTAMO':
      return { referencia: `Préstamo ${source.referencia || source.id}`, tercero: null, fecha: isoDate(source.fecha) }
    case 'TICKET':
      return { referencia: `Ticket ${source.concepto || source.id}`, tercero: null, fecha: isoDate(source.fecha) }
    case 'TRASPASO':
      return fallback
  }
}

async function inspectDocumentForRead(doc: any, client: Tx = prisma as unknown as Tx) {
  try {
    const evidence = await evidenceForWrapper(client, doc)
    return { stale: false, evidence }
  } catch (error) {
    // Evidence errors mean exactly that the historical wrapper is no longer
    // usable. Infrastructure/query errors are deliberately propagated as 500.
    if (error instanceof B4ServiceError) return { stale: true, evidence: null }
    throw error
  }
}

async function inspectDocumentsBatch(docs: any[], client: Tx = prisma as unknown as Tx) {
  const configs: Record<string, { pointer: string; model: string; table: string; column: string; select: any; negative?: boolean }> = {
    FACTURA_RECIBIDA: {pointer:'facturaRecibidaId',model:'facturaRecibida',table:'facturas_recibidas',column:'total',negative:true,select:{id:true,numFactura:true,proveedor:true,fecha:true,calidad:true,copiaDeId:true,conflictoIdentidad:true,duplicadoExterno:true}},
    FACTURA_EMITIDA: {pointer:'facturaEmitidaId',model:'facturaEmitida',table:'facturas_emitidas',column:'total',select:{id:true,numFactura:true,cliente:true,fecha:true,facturaISPId:true}},
    REMESA: {pointer:'remesaId',model:'remesa',table:'remesas',column:'total_importe',select:{id:true,nombre:true,ispGestionId:true,fecha:true}},
    NOMINA: {pointer:'nominaId',model:'nomina',table:'nominas',column:'neto_percibir',negative:true,select:{id:true,mes:true,anio:true}},
    TICKET: {pointer:'gastoId',model:'gasto',table:'gastos',column:'importe',negative:true,select:{id:true,estado:true,metodoPago:true,concepto:true,comercio:true,fecha:true}},
  }
  const results = new Map<string, {stale:boolean;evidence:any}>()
  await Promise.all(Object.entries(configs).map(async ([tipo,config]) => {
    const group = docs.filter(doc=>doc.tipo===tipo && doc[config.pointer]!==null && doc[config.pointer]!==undefined)
    if (!group.length) return
    const ids = [...new Set(group.map(doc=>doc[config.pointer]))]
    const [sources, decimals] = await Promise.all([
      (client as any)[config.model].findMany({where:{id:{in:ids},...(tipo==='FACTURA_RECIBIDA'?{AND:[facturaEconomicaWhere]}:{})},select:config.select}),
      client.$queryRaw<Array<{id:string;decimal:string}>>(Prisma.sql`
        SELECT id::text AS id, ${Prisma.raw('"'+config.column+'"')}::text AS decimal
        FROM ${Prisma.raw('"'+config.table+'"')} WHERE id::text IN (${Prisma.join(ids.map(String))}) LIMIT ${ids.length}
      `),
    ])
    const sourceMap = new Map<string,any>(sources.map((source:any)=>[String(source.id),source]))
    const decimalMap = new Map(decimals.map(row=>[row.id,row.decimal]))
    const ispMapped = sources.filter((source:any)=>source.facturaISPId!==null && source.facturaISPId!==undefined)
    const ispRows = ispMapped.length ? await client.$queryRaw<Array<{id:number;decimal:string}>>(Prisma.sql`
      SELECT id,total::text AS decimal FROM facturas WHERE id IN (${Prisma.join(ispMapped.map((source:any)=>source.facturaISPId))}) LIMIT ${ispMapped.length}
    `) : []
    const ispDecimals = new Map(ispRows.map(row=>[row.id,row.decimal]))
    for (const doc of group) {
      try {
        const source = sourceMap.get(String(doc[config.pointer]))
        if (!source || !doc.activo || pointerKeys().filter(key=>doc[key]!==null&&doc[key]!==undefined).length!==1) fail(422,'EVIDENCIA_NO_VALIDA','Evidencia no válida.')
        if (tipo==='FACTURA_RECIBIDA' && (source.calidad!=='VALIDA'||source.copiaDeId!==null||source.conflictoIdentidad||source.duplicadoExterno||['ERROR_OCR','DESCONOCIDO'].includes(String(source.proveedor).trim().toUpperCase()))) fail(422,'FACTURA_NO_ECONOMICA','Factura no económica.')
        if (tipo==='TICKET' && (!['APROBADO','CONTABILIZADO'].includes(source.estado)||source.metodoPago!=='TARJETA_EMPRESA')) fail(422,'TICKET_FUERA_DE_AMBITO','Ticket fuera de ámbito.')
        let amount = centsFromSource(decimalMap.get(String(source.id)),'source.amount')!
        if (['NOMINA','REMESA','TICKET'].includes(tipo)) requireSigned(amount,1,'source.amount')
        if (source.facturaISPId!==null && source.facturaISPId!==undefined && centsFromSource(ispDecimals.get(source.facturaISPId),'factura ISP.total')!==amount) fail(422,'IDENTIDAD_ISP_AMBIGUA','Identidad ambigua.')
        if (config.negative) amount=-amount
        if (amount!==doc.importeObjetivoCentimos) fail(409,'EVIDENCIA_DOCUMENTAL_CAMBIADA','Evidencia cambiada.')
        results.set(doc.id,{stale:false,evidence:{target:amount,pointer:{[config.pointer]:source.id},source}})
      } catch(error) {
        if (!(error instanceof B4ServiceError)) throw error
        results.set(doc.id,{stale:true,evidence:null})
      }
    }
  }))
  await Promise.all(docs.filter(doc=>!results.has(doc.id)).map(async doc=>results.set(doc.id,await inspectDocumentForRead(doc, client))))
  return results
}

function documentSearchPredicate(q: string | undefined) {
  if (!q) return Prisma.sql`TRUE`
  const pattern = `%${q}%`
  return Prisma.sql`(
    COALESCE(fr.num_factura, '') ILIKE ${pattern} OR COALESCE(fr.proveedor, '') ILIKE ${pattern}
    OR COALESCE(fe.num_factura, '') ILIKE ${pattern} OR COALESCE(fe.cliente, '') ILIKE ${pattern}
    OR COALESCE(r.nombre, '') ILIKE ${pattern} OR CAST(r.isp_gestion_id AS text) ILIKE ${pattern}
    OR COALESCE(a.expediente, '') ILIKE ${pattern} OR COALESCE(a.titulo, '') ILIKE ${pattern}
    OR COALESCE(pf.referencia, '') ILIKE ${pattern} OR COALESCE(pa.expediente, '') ILIKE ${pattern}
    OR COALESCE(dp.referencia, '') ILIKE ${pattern}
    OR COALESCE(g.concepto, '') ILIKE ${pattern} OR COALESCE(g.comercio, '') ILIKE ${pattern}
  )`
}

async function readDocumentPage(take: number, skip: number, q: string | undefined) {
  const predicate = documentSearchPredicate(q)
  const from = Prisma.sql`
    FROM documentos_conciliables d
    LEFT JOIN facturas_recibidas fr ON fr.id = d.factura_recibida_id
    LEFT JOIN facturas_emitidas fe ON fe.id = d.factura_emitida_id
    LEFT JOIN remesas r ON r.id = d.remesa_id
    LEFT JOIN documentos_aapp a ON a.id = d.documento_aapp_id
    LEFT JOIN pagos_fraccionados pf ON pf.id = d.pago_fraccionado_id
    LEFT JOIN documentos_aapp pa ON pa.id = pf.documento_id
    LEFT JOIN documentos_prestamo dp ON dp.id = d.documento_prestamo_id
    LEFT JOIN gastos g ON g.id = d.gasto_id
  `
  const [docs, totalRows] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT d.id, d.tipo, d.importe_objetivo_centimos AS "importeObjetivoCentimos", d.version, d.activo,
        d.factura_recibida_id AS "facturaRecibidaId", d.factura_emitida_id AS "facturaEmitidaId",
        d.remesa_id AS "remesaId", d.nomina_id AS "nominaId", d.documento_aapp_id AS "documentoAappId",
        d.pago_fraccionado_id AS "pagoFraccionadoId", d.documento_prestamo_id AS "documentoPrestamoId",
        d.gasto_id AS "gastoId", d.traspaso_interno_id AS "traspasoInternoId"
      ${from} WHERE ${predicate}
      ORDER BY d.updated_at DESC, d.id ASC LIMIT ${take} OFFSET ${skip}
    `),
    prisma.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`SELECT COUNT(*) AS total ${from} WHERE ${predicate}`),
  ])
  return { docs, total: Number(totalRows[0]?.total ?? 0) }
}

/** Read-only B4 projection. Pagination and all user filters are executed in the DB. */
export async function readConciliacionB4(movimientosLimit = 50, documentosLimit = 50, options: ReadConciliacionB4Options = {}) {
  const movementTake = boundedLimit(movimientosLimit)
  const documentTake = boundedLimit(documentosLimit)
  const movimientosOffset = boundedOffset(options.movimientosOffset)
  const documentosOffset = boundedOffset(options.documentosOffset)
  const q = options.q?.trim() || undefined
  const movementWhere: any = {
    ...(options.cuentaId ? { cuentaId: options.cuentaId } : {}),
    ...(options.movimientoId ? { id: options.movimientoId } : {}),
    ...(q ? { concepto: { contains: q, mode: 'insensitive' } } : {}),
  }
  const [movements, movementsTotal, documentPage, cuentas] = await Promise.all([
    (prisma.movimientoBancario as any).findMany({
      where: movementWhere, orderBy: [{ fechaOperacion: 'desc' }, { id: 'asc' }], skip: movimientosOffset, take: movementTake,
      select: { id: true, fechaOperacion: true, importe: true, concepto: true, cuenta: { select: { id: true, banco: true, alias: true } } },
    }),
    (prisma.movimientoBancario as any).count({ where: movementWhere }),
    readDocumentPage(documentTake, documentosOffset, q),
    (prisma.cuentaBancaria as any).findMany({ orderBy: [{ banco: 'asc' }, { alias: 'asc' }, { id: 'asc' }], select: { id: true, banco: true, alias: true } }),
  ])
  const movementIds = movements.map((movement: any) => movement.id)
  const bankRows = movementIds.length ? await prisma.$queryRaw<Array<{id:string;decimal:string}>>(Prisma.sql`
    SELECT id,importe::text AS decimal FROM movimientos_bancarios WHERE id IN (${Prisma.join(movementIds)}) LIMIT ${movementTake}
  `) : []
  const bankDecimals = new Map(bankRows.map(row => [row.id,row.decimal]))
  const [states, operations] = await Promise.all([
    movementIds.length ? b4(prisma as Tx).estadoJustificacionMovimientoB4.findMany({ where: { movimientoId: { in: movementIds } } }) : [],
    movementIds.length ? b4(prisma as Tx).operacionJustificacionB4.findMany({
      where: { movimientoId: { in: movementIds }, estado: 'APLICADA', revierteOperacionId: null, revertidaAt: null },
      select: { id: true, movimientoId: true, versionResultante: true },
    }) : [],
  ])
  const byMovement = new Map<string, any>(states.map((state: any) => [state.movimientoId, state]))
  const appliedByMovement = new Map<string, any>()
  for (const operation of operations) {
    const state = byMovement.get(operation.movimientoId)
    if (state && ['JUSTIFICADO', 'NO_REQUIERE'].includes(state.estado) && operation.versionResultante === state.version) {
      appliedByMovement.set(operation.movimientoId, operation)
    }
  }
  const appliedIds = Array.from(appliedByMovement.values()).map((operation: any) => operation.id)
  const links = appliedIds.length ? await b4(prisma as Tx).vinculoMovimientoDocumento.findMany({
    where: { operacionCreacionId: { in: appliedIds }, activo: true },
    select: { id: true, movimientoId: true, operacionCreacionId: true, tipoLinea: true, documentoConciliableId: true, motivoDiferencia: true, importeCentimos: true, centroCosteFinanzasId: true, versionCentroCoste: true, centroCosteFinanzas: {select: {codigo:true,nombre:true,activo:true}} },
  }) : []
  const linkedDocIds = links.map((link: any) => link.documentoConciliableId).filter(Boolean)
  const missingLinkedIds = [...new Set(linkedDocIds.filter((id: string) => !documentPage.docs.some((doc: any) => doc.id === id)))]
  const linkedOnlyDocs = missingLinkedIds.length ? await b4(prisma as Tx).documentoConciliable.findMany({
    where: { id: { in: missingLinkedIds } },
    select: {
      id: true, tipo: true, importeObjetivoCentimos: true, version: true, activo: true,
      facturaRecibidaId: true, facturaEmitidaId: true, remesaId: true, nominaId: true,
      documentoAappId: true, pagoFraccionadoId: true, documentoPrestamoId: true, gastoId: true, traspasoInternoId: true,
    },
  }) : []
  const allDocs = [...documentPage.docs, ...linkedOnlyDocs]
  const [assigned, inspections] = await Promise.all([
    allDocs.length ? activeNet(prisma as unknown as Tx, allDocs.map((doc: any) => doc.id)) : Promise.resolve(new Map<string, number>()),
    inspectDocumentsBatch(allDocs),
  ])
  const inspectedById = new Map(inspections)
  const documentView = (doc: any) => {
    const inspection = inspectedById.get(doc.id)!
    const assignedCents = assigned.get(doc.id) ?? 0
    return {
      ...docView(doc), stale: inspection.stale,
      ...documentMetadata(doc, inspection.evidence), sourceId: pointerForDocument(doc)?.sourceId ?? '',
      asignadoCentimos: assignedCents,
      disponibleCentimos: doc.importeObjetivoCentimos === null ? null : doc.importeObjetivoCentimos - assignedCents,
    }
  }
  const docViewById = new Map(allDocs.map((doc: any) => [doc.id, documentView(doc)]))
  const linksByOperation = new Map<string, any[]>()
  for (const link of links) linksByOperation.set(link.operacionCreacionId, [...(linksByOperation.get(link.operacionCreacionId) ?? []), link])
  const movimientoViews = movements.map((movement: any) => {
    const state = byMovement.get(movement.id)
    const operation = appliedByMovement.get(movement.id)
    let importeCentimos: number | null
    try { importeCentimos = centsFromSource(bankDecimals.get(movement.id), 'movimiento.importe', false, true) } catch (error) {
      if (!(error instanceof B4ServiceError)) throw error
      importeCentimos = null
    }
    const operationLinks = operation ? linksByOperation.get(operation.id) ?? [] : []
    const viewLink = (link: any) => {
      const doc = link.documentoConciliableId ? docViewById.get(link.documentoConciliableId) : null
      return {
        id: link.id, tipo: link.tipoLinea, documentoConciliableId: link.documentoConciliableId ?? null,
        motivoDiferencia: link.motivoDiferencia ?? null, importeCentimos: link.importeCentimos,
        referencia: doc?.referencia ?? `Diferencia ${link.motivoDiferencia ?? ''}`.trim(),
        centroCosteFinanzasId: link.centroCosteFinanzasId ?? null, versionCentroCoste: link.versionCentroCoste,
        centroCosteCodigo: link.centroCosteFinanzas?.codigo ?? null, centroCosteNombre: link.centroCosteFinanzas?.nombre ?? null,
      }
    }
    return {
      id: movement.id, fechaOperacion: movement.fechaOperacion.toISOString(), importeCentimos, concepto: movement.concepto,
      estado: state?.estado ?? 'SIN_DOCUMENTO', motivoNoRequiere: state?.motivoNoRequiere ?? null, version: state?.version ?? 1,
      cuenta: { id: movement.cuenta.id, banco: movement.cuenta.banco, alias: movement.cuenta.alias ?? null },
      operacionAplicada: operation ? { id: operation.id, lineas: operationLinks.map((link: any) => ({ id: link.id, importeCentimos: link.importeCentimos })) } : null,
      vinculos: operationLinks.map(viewLink),
    }
  })
  return {
    catalogo: catalogoB4(), movimientos: movimientoViews, documentos: documentPage.docs.map(documentView), sugerencias: [] as [],
    paginacion: { movimientosTotal: movementsTotal, documentosTotal: documentPage.total, movimientosOffset, documentosOffset },
    cuentas: cuentas.map((cuenta: any) => ({ id: cuenta.id, banco: cuenta.banco, alias: cuenta.alias ?? null })),
  }
}
