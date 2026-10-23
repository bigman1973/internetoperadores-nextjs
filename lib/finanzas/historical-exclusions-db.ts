import { Prisma } from '@prisma/client'
import prisma from '../prisma'
import { decimalTextToCentimos } from './historical-b4-core'
import { MAX_HISTORICAL_POPULATION } from './historical-bulk-core'
import { readHistoricalBulkMaterialTx } from './historical-bulk-db'
import {
  buildHistoricalExclusionsReport,
  type HistoricalExclusionDocumentInput,
  type HistoricalExclusionsReport,
} from './historical-exclusions-core'

type Raw = Record<string, unknown>
type LegacyRow = { historicoId: string; documentosText: string; snapshotText: string }
type CurrentSource = { tipo: string; sourceId: string; referencia: string; importeDocumentoCentimos: number | null }

const DOCUMENT_TYPES = new Set(['FACTURA_RECIBIDA', 'FACTURA_EMITIDA', 'NOMINA', 'TICKET'])

function asRecord(value: unknown): Raw | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Raw : null
}

function jsonRecord(value: string): Raw {
  try { return asRecord(JSON.parse(value)) ?? {} } catch { return {} }
}

function jsonArray(value: string): Raw[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(asRecord).filter((item): item is Raw => item !== null) : []
  } catch { return [] }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 240) : fallback
}

function sourceKey(tipo: string, sourceId: string): string { return `${tipo}:${sourceId}` }

function signedCentimos(value: string | null, tipo: string): number | null {
  const cents = decimalTextToCentimos(value)
  if (cents === null) return null
  return ['FACTURA_RECIBIDA', 'NOMINA', 'TICKET'].includes(tipo) ? -cents : cents
}

function snapshotReference(snapshot: Raw, tipo: string, fallback: string): string {
  const source = asRecord(snapshot[tipo === 'FACTURA_RECIBIDA' ? 'facturaRecibida' : tipo === 'FACTURA_EMITIDA' ? 'facturaEmitida' : tipo === 'NOMINA' ? 'nomina' : 'gasto'])
  if (tipo === 'FACTURA_RECIBIDA') return `Factura recibida ${text(source?.num_factura, fallback)}`.slice(0, 240)
  if (tipo === 'FACTURA_EMITIDA') return `Factura emitida ${text(source?.num_factura, fallback)}`.slice(0, 240)
  if (tipo === 'NOMINA') {
    const month = source?.mes === undefined || source?.mes === null ? '' : String(source.mes).padStart(2, '0')
    const year = source?.anio === undefined || source?.anio === null ? '' : String(source.anio)
    return month && year ? `Nómina ${month}/${year}` : fallback
  }
  if (tipo === 'TICKET') return `Ticket ${text(source?.concepto, fallback)}`.slice(0, 240)
  return fallback
}

function snapshotAmount(snapshot: Raw, tipo: string): number | null {
  const all = asRecord(snapshot.importesFuenteExactosTexto)
  const key = tipo === 'FACTURA_RECIBIDA' ? 'recibida' : tipo === 'FACTURA_EMITIDA' ? 'emitida' : tipo === 'NOMINA' ? 'nomina' : tipo === 'TICKET' ? 'gasto' : ''
  return typeof all?.[key] === 'string' ? signedCentimos(all[key] as string, tipo) : null
}

async function currentSources(tx: Prisma.TransactionClient, rawDocuments: readonly Raw[]): Promise<Map<string, CurrentSource>> {
  const idsByType = new Map<string, string[]>()
  for (const document of rawDocuments) {
    const tipo = text(document.tipo)
    const sourceId = text(document.sourceId)
    if (!DOCUMENT_TYPES.has(tipo) || !sourceId) continue
    const ids = idsByType.get(tipo) ?? []
    if (!ids.includes(sourceId)) ids.push(sourceId)
    idsByType.set(tipo, ids)
  }
  const all = new Map<string, CurrentSource>()
  const query = async (tipo: string, statement: Prisma.Sql, toSource: (row: Raw) => CurrentSource) => {
    const rows = await tx.$queryRaw<Raw[]>(statement)
    for (const row of rows) {
      const source = toSource(row)
      all.set(sourceKey(source.tipo, source.sourceId), source)
    }
  }
  const ids = (tipo: string) => idsByType.get(tipo) ?? []
  if (ids('FACTURA_RECIBIDA').length) await query('FACTURA_RECIBIDA', Prisma.sql`SELECT id::text AS id,num_factura,total::text AS importe FROM facturas_recibidas WHERE id::text IN (${Prisma.join(ids('FACTURA_RECIBIDA'))}) LIMIT ${ids('FACTURA_RECIBIDA').length}`,
    row => ({ tipo: 'FACTURA_RECIBIDA', sourceId: String(row.id), referencia: `Factura recibida ${text(row.num_factura, String(row.id))}`, importeDocumentoCentimos: signedCentimos(typeof row.importe === 'string' ? row.importe : null, 'FACTURA_RECIBIDA') }))
  if (ids('FACTURA_EMITIDA').length) await query('FACTURA_EMITIDA', Prisma.sql`SELECT id::text AS id,num_factura,total::text AS importe FROM facturas_emitidas WHERE id::text IN (${Prisma.join(ids('FACTURA_EMITIDA'))}) LIMIT ${ids('FACTURA_EMITIDA').length}`,
    row => ({ tipo: 'FACTURA_EMITIDA', sourceId: String(row.id), referencia: `Factura emitida ${text(row.num_factura, String(row.id))}`, importeDocumentoCentimos: signedCentimos(typeof row.importe === 'string' ? row.importe : null, 'FACTURA_EMITIDA') }))
  if (ids('NOMINA').length) await query('NOMINA', Prisma.sql`SELECT id::text AS id,mes,anio,neto_percibir::text AS importe FROM nominas WHERE id::text IN (${Prisma.join(ids('NOMINA'))}) LIMIT ${ids('NOMINA').length}`,
    row => ({ tipo: 'NOMINA', sourceId: String(row.id), referencia: `Nómina ${String(row.mes ?? '').padStart(2, '0')}/${String(row.anio ?? '')}`, importeDocumentoCentimos: signedCentimos(typeof row.importe === 'string' ? row.importe : null, 'NOMINA') }))
  if (ids('TICKET').length) await query('TICKET', Prisma.sql`SELECT id::text AS id,concepto,importe::text AS importe FROM gastos WHERE id::text IN (${Prisma.join(ids('TICKET'))}) LIMIT ${ids('TICKET').length}`,
    row => ({ tipo: 'TICKET', sourceId: String(row.id), referencia: `Ticket ${text(row.concepto, String(row.id))}`, importeDocumentoCentimos: signedCentimos(typeof row.importe === 'string' ? row.importe : null, 'TICKET') }))
  return all
}

function evidenceForRows(rows: readonly LegacyRow[], sources: ReadonlyMap<string, CurrentSource>): Map<string, readonly HistoricalExclusionDocumentInput[]> {
  const evidence = new Map<string, readonly HistoricalExclusionDocumentInput[]>()
  for (const row of rows) {
    const snapshot = jsonRecord(row.snapshotText)
    const documents: HistoricalExclusionDocumentInput[] = []
    for (const document of jsonArray(row.documentosText)) {
      const tipo = text(document.tipo, 'REFERENCIA_HISTORICA')
      const sourceId = text(document.sourceId)
      const historicalReference = snapshotReference(snapshot, tipo, text(document.referencia, 'Documento histórico sin referencia'))
      const current = sourceId ? sources.get(sourceKey(tipo, sourceId)) : undefined
      const plannedHistoricalAmount = typeof document.importeObjetivoCentimos === 'number' && Number.isSafeInteger(document.importeObjetivoCentimos)
        ? document.importeObjetivoCentimos : null
      documents.push(Object.freeze({
        tipo,
        sourceId,
        referenciaHistorica: historicalReference,
        importeHistoricoCentimos: plannedHistoricalAmount ?? snapshotAmount(snapshot, tipo),
        referenciaActual: current?.referencia ?? null,
        importeDocumentoCentimos: current?.importeDocumentoCentimos ?? null,
        // Existence alone is not an amount: malformed/null source values are no
        // more verifiable than a deleted document and therefore remain null.
        actualVerificable: current?.importeDocumentoCentimos !== null && current?.importeDocumentoCentimos !== undefined,
      }))
    }
    evidence.set(row.historicoId, Object.freeze(documents))
  }
  return evidence
}

/**
 * Reads the same active historical population used by the confirmation preview.
 * No data is written and snapshots never leave this server-side adapter.
 */
export async function readHistoricalExclusionsReport(): Promise<HistoricalExclusionsReport> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const material = await readHistoricalBulkMaterialTx(tx)
    if (!material.length) return buildHistoricalExclusionsReport([], new Map())
    const historicalIds = material.map(row => row.historicoId)
    const rows = await tx.$queryRaw<LegacyRow[]>(Prisma.sql`
      SELECT l.id::text AS "historicoId",l.documentos::text AS "documentosText",l.snapshot_legacy::text AS "snapshotText"
      FROM legado_conciliacion_b4 l
      WHERE l.id IN (${Prisma.join(historicalIds.map(id => Prisma.sql`CAST(${id} AS uuid)`) )})
        AND NOT EXISTS(SELECT 1 FROM reversiones_legado_b4 r WHERE r.lote=l.lote)
      ORDER BY l.id ASC
      LIMIT ${Math.min(MAX_HISTORICAL_POPULATION, historicalIds.length)}`)
    if (rows.length !== historicalIds.length) throw new Error('HISTORICAL_EXCLUSIONS_LEGACY_CHANGED')
    const allDocuments = rows.flatMap(row => jsonArray(row.documentosText))
    const evidence = evidenceForRows(rows, await currentSources(tx, allDocuments))
    return buildHistoricalExclusionsReport(material, evidence)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000, maxWait: 10000 })
}
