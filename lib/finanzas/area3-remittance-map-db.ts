/*
 * Área 3 — preflight documental FI→ISP→remesa.
 *
 * Este módulo sólo lee fuentes ya importadas. No crea aliases, no usa importes ni
 * nombres como identidad y no escribe FI, Factura, Remesa, B4, B6 o B7. La misma
 * consulta de evidencia alimenta el veredicto puro sin bloqueo para pintar y,
 * después de bloquear FI/Factura, antes de confirmar.
 */
import { Prisma } from '@prisma/client'
import {
  area3RemittanceMapProposalFromRaw,
  evaluateArea3RemittanceMapPreflights,
  type Area3RemittanceMapEvidence,
  type Area3RemittanceMapPreflight,
  type Area3RemittanceMapProposal,
} from './area3-remittance-map-core'

type Tx = Prisma.TransactionClient & Record<string, any>
type RawProposal = Readonly<{ propuestaId: unknown; generacionId: unknown; metodo: unknown; lineas: unknown; composicion: unknown }>
type SourceRow = Readonly<{
  facturaEmitidaId: string
  facturaISPId: number | bigint | string | null
  facturaISPGestionId: number | bigint | string | null
  remesaId: number | bigint | string | null
  identityAuditPresent: boolean | null
  facturaEmitidaOrigenSistema: string | null
  facturaEmitidaRemoteId: string | null
  facturaEmitidaNumero: string | null
  facturaISPNumero: string | null
  facturaEmitidaSerie: string | null
  facturaISPSerie: string | null
  facturaEmitidaCliente: string | null
  facturaISPCliente: string | null
  facturaEmitidaCif: string | null
  facturaISPCif: string | null
}>

const MAX_REMITTANCE_PROPOSALS = 2_000
/** The projection rebuild is bounded to 25k rows. Keep every evidence query
 * below the established 2k-parameter working set while allowing that complete
 * bounded snapshot to be evaluated rather than failing before it can paint
 * its safe amber rows. */
const MAX_REMITTANCE_RECEIPTS = 25_000
const REMITTANCE_EVIDENCE_BATCH_SIZE = 2_000

function asPositiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'bigint' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? BigInt(value) : typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : null
  return parsed !== null && parsed > BigInt(0) && parsed <= BigInt(2_147_483_647) ? Number(parsed) : null
}

function proposalRows(raw: readonly RawProposal[]): Area3RemittanceMapProposal[] {
  if (raw.length > MAX_REMITTANCE_PROPOSALS) throw new Error('AREA3_REMITTANCE_MAP_PROPOSAL_LIMIT')
  const result: Area3RemittanceMapProposal[] = []
  for (const row of raw) {
    const proposal = area3RemittanceMapProposalFromRaw(row)
    if (proposal) result.push(proposal)
  }
  return result
}

async function currentProposalRows(tx: Tx): Promise<RawProposal[]> {
  const rows = await tx.$queryRaw<RawProposal[]>(Prisma.sql`
    WITH current_generation AS (
      SELECT id FROM modo_facil_generaciones_cobro ORDER BY creada_at DESC,id DESC LIMIT 1
    )
    SELECT p.id::text AS "propuestaId",p.generacion_id::text AS "generacionId",p.metodo,p.lineas,p.composicion
    FROM modo_facil_propuestas_cobro p
    JOIN current_generation g ON g.id=p.generacion_id
    WHERE p.estado_propuesto IN ('JUSTIFICADO','NO_REQUIERE')
    ORDER BY p.id ASC LIMIT ${MAX_REMITTANCE_PROPOSALS + 1}
  `)
  if (rows.length > MAX_REMITTANCE_PROPOSALS) throw new Error('AREA3_REMITTANCE_MAP_PROPOSAL_LIMIT')
  return rows
}

function sourceEvidence(rows: readonly SourceRow[]): Area3RemittanceMapEvidence[] {
  return rows.map(row => ({
    facturaEmitidaId: row.facturaEmitidaId,
    facturaISPId: asPositiveInteger(row.facturaISPId),
    facturaISPGestionId: asPositiveInteger(row.facturaISPGestionId),
    remesaId: asPositiveInteger(row.remesaId),
    identityAuditPresent: row.identityAuditPresent === true,
    facturaEmitidaOrigenSistema: row.facturaEmitidaOrigenSistema,
    facturaEmitidaRemoteId: row.facturaEmitidaRemoteId,
    facturaEmitidaNumero: row.facturaEmitidaNumero,
    facturaISPNumero: row.facturaISPNumero,
    facturaEmitidaSerie: row.facturaEmitidaSerie,
    facturaISPSerie: row.facturaISPSerie,
    facturaEmitidaCliente: row.facturaEmitidaCliente,
    facturaISPCliente: row.facturaISPCliente,
    facturaEmitidaCif: row.facturaEmitidaCif,
    facturaISPCif: row.facturaISPCif,
  }))
}

const sourceEvidenceSelect = (ids: readonly string[]) => Prisma.sql`
  SELECT
    fi.id AS "facturaEmitidaId",
    fi.factura_isp_id AS "facturaISPId",
    f.isp_gestion_id AS "facturaISPGestionId",
    f.remesa_id AS "remesaId",
    (identity_event.id IS NOT NULL) AS "identityAuditPresent",
    fi.origen_sistema AS "facturaEmitidaOrigenSistema",
    fi.id_externo AS "facturaEmitidaRemoteId",
    fi.num_factura AS "facturaEmitidaNumero",
    f.numero_documento AS "facturaISPNumero",
    fi.serie AS "facturaEmitidaSerie",
    f.serie_factura AS "facturaISPSerie",
    fi.cliente AS "facturaEmitidaCliente",
    f.nombre_completo AS "facturaISPCliente",
    fi.cif AS "facturaEmitidaCif",
    f.nif_cif AS "facturaISPCif"
  FROM facturas_emitidas fi
  LEFT JOIN facturas f ON f.id=fi.factura_isp_id
  LEFT JOIN identidad_factura_isp_eventos_b7 identity_event
    ON identity_event.factura_emitida_id=fi.id
      AND identity_event.factura_isp_id=fi.factura_isp_id
  WHERE fi.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})
  ORDER BY fi.id ASC
  LIMIT ${ids.length + 1}
`

async function rowsForInvoices(tx: Tx, ids: readonly string[], lock: boolean): Promise<SourceRow[]> {
  if (!ids.length) return []
  if (ids.length > MAX_REMITTANCE_RECEIPTS) throw new Error('AREA3_REMITTANCE_MAP_RECEIPT_LIMIT')
  const rows: SourceRow[] = []
  // `ids` is an ordered unique set produced by every caller. Process its
  // contiguous chunks sequentially so competing confirmations still acquire
  // FI then ISP locks in one global order; no partial evidence is accepted.
  for (let offset = 0; offset < ids.length; offset += REMITTANCE_EVIDENCE_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + REMITTANCE_EVIDENCE_BATCH_SIZE)
    if (!lock) {
      rows.push(...await tx.$queryRaw<SourceRow[]>(sourceEvidenceSelect(batch)))
      continue
    }
    // Lock FI first (the FK cannot change afterwards), then every present
    // Factura, and finally reread the exact evidence. This is B7's FI/ISP
    // source order; the immutable identity event is evidence only, never a
    // relationship we may create.
    const fiRows = await tx.$queryRaw<Array<{ facturaISPId: number | bigint | string | null }>>(Prisma.sql`
      SELECT fi.factura_isp_id AS "facturaISPId"
      FROM facturas_emitidas fi
      WHERE fi.id IN (${Prisma.join(batch.map(id => Prisma.sql`${id}`))})
      ORDER BY fi.id ASC
      LIMIT ${batch.length + 1} FOR UPDATE OF fi
    `)
    if (fiRows.length !== batch.length) return []
    const ispIds = [...new Set(fiRows.flatMap(row => {
      const id = asPositiveInteger(row.facturaISPId)
      return id === null ? [] : [id]
    }))].sort((left, right) => left - right)
    if (ispIds.length) await tx.$queryRaw(Prisma.sql`
      SELECT f.id FROM facturas f WHERE f.id IN (${Prisma.join(ispIds.map(id => Prisma.sql`${id}`))})
      ORDER BY f.id ASC LIMIT ${ispIds.length + 1} FOR UPDATE OF f
    `)
    rows.push(...await tx.$queryRaw<SourceRow[]>(sourceEvidenceSelect(batch)))
  }
  return rows
}

/** Current nonlocking projection read. It never uses a stored UI row as proof. */
export async function readArea3RemittanceMapPreflightsTx(base: Prisma.TransactionClient, raw: readonly RawProposal[]): Promise<ReadonlyMap<string, Area3RemittanceMapPreflight>> {
  const tx = base as Tx
  const proposals = proposalRows(raw)
  const ids = [...new Set(proposals.flatMap(proposal => proposal.facturaEmitidaIds))].sort()
  const rows = await rowsForInvoices(tx, ids, false)
  return evaluateArea3RemittanceMapPreflights(proposals, sourceEvidence(rows))
}

/** Complete current-generation G7 photo for read-only release evidence. The
 * projection and the confirmation path keep their existing entry points; this
 * reader merely prevents a release runner from inventing a narrower sibling set. */
export async function readCurrentArea3RemittanceMapPreflightsTx(base: Prisma.TransactionClient): Promise<Readonly<{
  proposals: readonly Area3RemittanceMapProposal[]
  preflights: ReadonlyMap<string, Area3RemittanceMapPreflight>
}>> {
  const tx = base as Tx
  const proposals = proposalRows(await currentProposalRows(tx))
  const ids = [...new Set(proposals.flatMap(proposal => proposal.facturaEmitidaIds))].sort()
  const rows = await rowsForInvoices(tx, ids, false)
  return { proposals, preflights: evaluateArea3RemittanceMapPreflights(proposals, sourceEvidence(rows)) }
}

/** Locked confirmation preflight. Its pure predicate is exactly the UI predicate. */
export async function lockArea3RemittanceMapPreflightsTx(base: Prisma.TransactionClient, raw: readonly RawProposal[]): Promise<ReadonlyMap<string, Area3RemittanceMapPreflight>> {
  const tx = base as Tx
  const proposals = proposalRows(raw)
  const ids = [...new Set(proposals.flatMap(proposal => proposal.facturaEmitidaIds))].sort()
  const rows = await rowsForInvoices(tx, ids, true)
  return evaluateArea3RemittanceMapPreflights(proposals, sourceEvidence(rows))
}
