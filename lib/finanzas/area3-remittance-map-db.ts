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
  evaluateArea3RemittanceMapPreflight,
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
const MAX_REMITTANCE_RECEIPTS = 2_000

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

function groupedPreflight(proposals: readonly Area3RemittanceMapProposal[], evidence: readonly Area3RemittanceMapEvidence[]): ReadonlyMap<string, Area3RemittanceMapPreflight> {
  const byRemesa = new Map<string, Area3RemittanceMapProposal[]>()
  for (const proposal of proposals) {
    const key = `${proposal.generacionId}:${proposal.remesaId}`
    byRemesa.set(key, [...(byRemesa.get(key) ?? []), proposal])
  }
  const result = new Map<string, Area3RemittanceMapPreflight>()
  for (const members of byRemesa.values()) {
    const preflight = evaluateArea3RemittanceMapPreflight(members, evidence)
    for (const proposal of members) result.set(proposal.propuestaId, preflight)
  }
  return result
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
  if (!lock) return tx.$queryRaw<SourceRow[]>(sourceEvidenceSelect(ids))

  // Lock FI first (the FK cannot change afterwards), then every present Factura,
  // and finally reread the exact evidence. This is B7's FI/ISP source order; the
  // immutable identity event is evidence only, never a relationship we may create.
  const fiRows = await tx.$queryRaw<Array<{ facturaISPId: number | bigint | string | null }>>(Prisma.sql`
    SELECT fi.factura_isp_id AS "facturaISPId"
    FROM facturas_emitidas fi
    WHERE fi.id IN (${Prisma.join(ids.map(id => Prisma.sql`${id}`))})
    ORDER BY fi.id ASC
    LIMIT ${ids.length + 1} FOR UPDATE OF fi
  `)
  if (fiRows.length !== ids.length) return []
  const ispIds = [...new Set(fiRows.flatMap(row => {
    const id = asPositiveInteger(row.facturaISPId)
    return id === null ? [] : [id]
  }))].sort((left, right) => left - right)
  if (ispIds.length) await tx.$queryRaw(Prisma.sql`
    SELECT f.id FROM facturas f WHERE f.id IN (${Prisma.join(ispIds.map(id => Prisma.sql`${id}`))})
    ORDER BY f.id ASC LIMIT ${ispIds.length + 1} FOR UPDATE OF f
  `)
  return tx.$queryRaw<SourceRow[]>(sourceEvidenceSelect(ids))
}

/** Current nonlocking projection read. It never uses a stored UI row as proof. */
export async function readArea3RemittanceMapPreflightsTx(base: Prisma.TransactionClient, raw: readonly RawProposal[]): Promise<ReadonlyMap<string, Area3RemittanceMapPreflight>> {
  const tx = base as Tx
  const proposals = proposalRows(raw)
  const ids = [...new Set(proposals.flatMap(proposal => proposal.facturaEmitidaIds))].sort()
  const rows = await rowsForInvoices(tx, ids, false)
  return groupedPreflight(proposals, sourceEvidence(rows))
}

/** Locked confirmation preflight. Its pure predicate is exactly the UI predicate. */
export async function lockArea3RemittanceMapPreflightsTx(base: Prisma.TransactionClient, raw: readonly RawProposal[]): Promise<ReadonlyMap<string, Area3RemittanceMapPreflight>> {
  const tx = base as Tx
  const proposals = proposalRows(raw)
  const ids = [...new Set(proposals.flatMap(proposal => proposal.facturaEmitidaIds))].sort()
  const rows = await rowsForInvoices(tx, ids, true)
  return groupedPreflight(proposals, sourceEvidence(rows))
}
