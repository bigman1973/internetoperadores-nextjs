import { Prisma, PrismaClient } from '@prisma/client'
import prisma from '@/lib/prisma'
import { assertPrototypeStaging, PrototypeStagingError } from '@/lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '@/lib/finanzas/reconciliation-auth'
import {
  COUNTERPARTY_TYPES,
  EASY_COUNTERPARTY_SCHEMA,
  EasyCounterpartyValidationError,
  counterpartyCandidateHash,
  counterpartyRequestHash,
  counterpartySha256,
  counterpartySuggestionId,
  parseCounterpartyWriteInput,
  type CounterpartyCandidateSeed,
  type CounterpartyDirection,
  type CounterpartyOrigin,
  type CounterpartyReadInput,
  type CounterpartySearchInput,
  type CounterpartyType,
  type CounterpartyWriteInput,
} from '@/lib/finanzas/easy-counterparty-core'

type Db = PrismaClient & Record<string, any>
type Tx = Prisma.TransactionClient & Record<string, any>
type QueryDb = (PrismaClient | Prisma.TransactionClient) & Record<string, any>
const db = () => prisma as Db
const asTx = (tx: Prisma.TransactionClient) => tx as Tx

export class EasyCounterpartyServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}
function fail(status: number, code: string, message: string): never {
  throw new EasyCounterpartyServiceError(status, code, message)
}
function clean(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function exactInteger(value: unknown, field: string): number {
  if (typeof value === 'bigint') {
    if (value < BigInt(-2_147_483_648) || value > BigInt(2_147_483_647)) fail(422, 'CENTIMOS_FUERA_RANGO', `${field} excede el rango admitido.`)
    return Number(value)
  }
  if (!Number.isSafeInteger(value)) fail(422, 'CENTIMOS_INVALIDOS', `${field} no contiene céntimos exactos.`)
  return value as number
}
function exactCents(value: unknown, field: string, allowZero = true): number {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no contiene un importe SQL exacto.`)
  const negative = value.startsWith('-')
  const unsigned = negative ? value.slice(1) : value
  const [whole, fraction = ''] = unsigned.split('.')
  const cents = BigInt(whole) * BigInt(100) + BigInt((fraction + '00').slice(0, 2))
  const signed = negative ? -cents : cents
  if (signed < BigInt(-2147483648) || signed > BigInt(2147483647) || (!allowZero && signed === BigInt(0))) fail(422, 'IMPORTE_FUENTE_NO_EXACTO', `${field} no contiene céntimos admitidos.`)
  return Number(signed)
}
function privateError(error: unknown): never {
  if (error instanceof EasyCounterpartyServiceError || error instanceof EasyCounterpartyValidationError || error instanceof PrototypeStagingError) throw error
  throw error
}
function minimizedNif(value: string | null): string {
  const source = value?.replace(/\s+/g, '').toUpperCase() ?? ''
  if (!source) return 'sin NIF/CIF visible'
  if (source.length <= 4) return `${source[0] ?? '•'}•••`
  return `${source.slice(0, 2)}••••${source.slice(-2)}`
}
function evidenceLabel(name: string | null, kind: string, nif: string | null): string {
  return `${name?.trim() || 'Tercero registrado'} · ${kind} · NIF/CIF ${minimizedNif(nif)}`
}
/** Public/read-model name only.  Evidence detail remains in the immutable receipt
 * and in the dedicated P1 screen, never in a cross-workspace enrichment. */
function humanCounterpartyName(label: string | null): string | null {
  const name = label?.split(' · ', 1)[0]?.trim() ?? ''
  return name || null
}

export type CounterpartyCandidateDto = Readonly<{
  id: string
  tipoTercero: CounterpartyType
  etiqueta: string
  origenPaso1: Exclude<CounterpartyOrigin, 'MANUAL' | 'AUTO_RECIBO'>
}>
type Candidate = Readonly<{
  seed: CounterpartyCandidateSeed
  etiqueta: string
  /** Only current linked fiscal evidence may identify a movement before a human click. */
  autoIdentify: boolean
}>
export type EasyCounterpartyBulkMovementMaterial = Readonly<{
  id: string
  fecha: string
  importeCentimos: number
  version: number
  estado: 'IDENTIFICADO' | 'PROPUESTO' | 'SIN_IDENTIFICAR'
  propuestaTexto: string | null
}>
export type EasyCounterpartyBulkCandidate = Readonly<{
  movimientoId: string
  tipoTercero: CounterpartyType
  origen: Exclude<CounterpartyOrigin, 'MANUAL' | 'AUTO_RECIBO'>
  sourceIdentity: string
  etiqueta: string
  sugerenciaId: string
}>
type Decision = Readonly<{
  id: string
  tipo: CounterpartyType
  origen: CounterpartyOrigin
  candidateHash: string
  version: number
  etiqueta: string | null
}>
type MovementRow = Readonly<{
  id: string
  fecha: string
  concepto: string
  tercero: string | null
  importeCentimos: number
  banco: string
  alias: string | null
  entidadFiscalId: string | null
  entidadFiscalTipo: string | null
  entidadFiscalNif: string | null
  entidadFiscalNombre: string | null
  entityEmployeeId: string | null
  entityEmployeeName: string | null
  entityEmployeeNif: string | null
  entregaEmpleadoId: string | null
  entregaEmpleadoName: string | null
  entregaEmpleadoNif: string | null
  nominaEmpleadoId: string | null
  nominaEmpleadoName: string | null
  nominaEmpleadoNif: string | null
  facturaId: string | null
  facturaEmitidaId: string | null
  facturaRecibidaCif: string | null
  facturaEmitidaCif: string | null
  facturaRecibidaEntidadId: string | null
  facturaRecibidaEntidadNombre: string | null
  facturaEmitidaEntidadId: string | null
  facturaEmitidaEntidadNombre: string | null
  traspasoRelacionadoId: string | null
  cuentaContrapartidaId: string | null
  cuentaContrapartidaBanco: string | null
  cuentaContrapartidaAlias: string | null
  cuentaContrapartidaProofId: string | null
  estadoPaso2: 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE'
  decisionVersion: number
  decision: Decision | null
}>

function addCandidate(target: Candidate[], movimientoId: string, tipoTercero: CounterpartyType, origen: Exclude<CounterpartyOrigin, 'MANUAL' | 'AUTO_RECIBO'>, sourceIdentity: string | null, etiqueta: string, autoIdentify = false) {
  if (!sourceIdentity) return
  const seed: CounterpartyCandidateSeed = { movimientoId, tipoTercero, origen, sourceIdentity }
  const hash = counterpartyCandidateHash(seed)
  const existing = target.find(item => counterpartyCandidateHash(item.seed) === hash)
  if (existing) return
  target.push({ seed, etiqueta, autoIdentify })
}
function candidatesForMovement(row: MovementRow): Candidate[] {
  const candidates: Candidate[] = []
  const directFiscal = row.entidadFiscalId && row.entidadFiscalNif && row.entidadFiscalTipo
  if (directFiscal && row.entidadFiscalTipo === 'PROVEEDOR') {
    addCandidate(candidates, row.id, 'PROVEEDOR', 'ENTIDAD_FISCAL', `EF:${row.entidadFiscalId}`, evidenceLabel(row.entidadFiscalNombre, 'Proveedor fiscal registrado', row.entidadFiscalNif), true)
  }
  if (directFiscal && row.entidadFiscalTipo === 'CLIENTE') {
    addCandidate(candidates, row.id, 'CLIENTE', 'ENTIDAD_FISCAL', `EF:${row.entidadFiscalId}`, evidenceLabel(row.entidadFiscalNombre, 'Cliente fiscal registrado', row.entidadFiscalNif), true)
  }
  if (directFiscal && row.entidadFiscalTipo === 'AAPP') {
    addCandidate(candidates, row.id, 'BANCO', 'ENTIDAD_FISCAL', `EF:${row.entidadFiscalId}`, evidenceLabel(row.entidadFiscalNombre, 'Administración registrada', row.entidadFiscalNif), true)
  }
  if (directFiscal && row.entidadFiscalTipo === 'PERSONAL' && row.entityEmployeeId) {
    addCandidate(candidates, row.id, 'EMPLEADO', 'ENTIDAD_FISCAL', `EF_EMPLEADO:${row.entidadFiscalId}:${row.entityEmployeeId}`, evidenceLabel(row.entityEmployeeName, 'Empleado acreditado', row.entityEmployeeNif), true)
  }
  if (row.entregaEmpleadoId) {
    addCandidate(candidates, row.id, 'EMPLEADO', 'EMPLEADO', `ENTREGA_EMPLEADO:${row.entregaEmpleadoId}`, evidenceLabel(row.entregaEmpleadoName, 'Empleado registrado por entrega', row.entregaEmpleadoNif))
  }
  if (row.nominaEmpleadoId) {
    addCandidate(candidates, row.id, 'EMPLEADO', 'NOMINA_EMPLEADO', `NOMINA_EMPLEADO:${row.nominaEmpleadoId}`, evidenceLabel(row.nominaEmpleadoName, 'Empleado registrado por nómina', row.nominaEmpleadoNif))
  }
  if (row.facturaId && row.facturaRecibidaCif && row.facturaRecibidaEntidadId) {
    addCandidate(candidates, row.id, 'PROVEEDOR', 'FACTURA_RECIBIDA', `FR_EF:${row.facturaId}:${row.facturaRecibidaEntidadId}`, evidenceLabel(row.facturaRecibidaEntidadNombre, 'Proveedor fiscal de factura', row.facturaRecibidaCif))
  }
  // A native, exact fiscal-client relation is stable on its own. An active contract
  // is not a condition for this P1 candidate and no invoice source auto-identifies.
  if (row.facturaEmitidaId && row.facturaEmitidaCif && row.facturaEmitidaEntidadId) {
    addCandidate(candidates, row.id, 'CLIENTE', 'FACTURA_EMITIDA', `FE_EF:${row.facturaEmitidaId}:${row.facturaEmitidaEntidadId}`, evidenceLabel(row.facturaEmitidaEntidadNombre, 'Cliente fiscal de factura', row.facturaEmitidaCif))
  }
  if (row.traspasoRelacionadoId && row.cuentaContrapartidaId && row.cuentaContrapartidaProofId) {
    const account = row.cuentaContrapartidaAlias || row.cuentaContrapartidaBanco || 'Cuenta registrada'
    addCandidate(candidates, row.id, 'CUENTA_PROPIA', 'CUENTA_PROPIA_ACTUAL', `CUENTA_ATESTADA:${row.cuentaContrapartidaId}:${row.cuentaContrapartidaProofId}`, `${account} · cuenta registrada`)
  }
  return candidates
}
function candidateDto(candidate: Candidate): CounterpartyCandidateDto {
  return { id: counterpartySuggestionId(candidate.seed), tipoTercero: candidate.seed.tipoTercero, etiqueta: candidate.etiqueta, origenPaso1: candidate.seed.origen as CounterpartyCandidateDto['origenPaso1'] }
}
function decisionView(row: any): Decision | null {
  if (!row || typeof row.decision_id !== 'string' || !COUNTERPARTY_TYPES.includes(String(row.decision_tipo) as CounterpartyType) || !['ENTIDAD_FISCAL', 'EMPLEADO', 'NOMINA_EMPLEADO', 'FACTURA_RECIBIDA', 'FACTURA_EMITIDA', 'CLIENTE_CONTRATO_ACTUAL', 'CUENTA_PROPIA_ACTUAL', 'MANUAL', 'AUTO_RECIBO'].includes(String(row.decision_origen)) || typeof row.decision_hash !== 'string') return null
  return {
    id: row.decision_id, tipo: row.decision_tipo as CounterpartyType, origen: row.decision_origen as CounterpartyOrigin,
    candidateHash: row.decision_hash, version: exactInteger(row.decision_version ?? 0, 'versión P1'), etiqueta: clean(row.decision_etiqueta),
  }
}
function rowView(row: any): MovementRow {
  const cents = exactCents(row.importe_text, 'movimiento.importe')
  const state = String(row.estado_paso2 ?? 'SIN_DOCUMENTO')
  if (!['SIN_DOCUMENTO', 'JUSTIFICADO', 'NO_REQUIERE'].includes(state)) fail(422, 'ESTADO_B4_INVALIDO', 'El estado B4 no es válido.')
  return {
    id: String(row.id), fecha: String(row.fecha), concepto: String(row.concepto ?? ''), tercero: clean(row.tercero), importeCentimos: cents,
    banco: String(row.banco), alias: clean(row.alias), entidadFiscalId: clean(row.entidad_fiscal_id), entidadFiscalTipo: clean(row.entidad_fiscal_tipo), entidadFiscalNif: clean(row.entidad_fiscal_nif), entidadFiscalNombre: clean(row.entidad_fiscal_nombre),
    entityEmployeeId: clean(row.entidad_empleado_id), entityEmployeeName: clean(row.entidad_empleado_nombre), entityEmployeeNif: clean(row.entidad_empleado_nif),
    entregaEmpleadoId: clean(row.entrega_empleado_id), entregaEmpleadoName: clean(row.entrega_empleado_nombre), entregaEmpleadoNif: clean(row.entrega_empleado_nif),
    nominaEmpleadoId: clean(row.nomina_empleado_id), nominaEmpleadoName: clean(row.nomina_empleado_nombre), nominaEmpleadoNif: clean(row.nomina_empleado_nif),
    facturaId: clean(row.factura_id), facturaEmitidaId: clean(row.factura_emitida_id), facturaRecibidaCif: clean(row.factura_recibida_cif), facturaEmitidaCif: clean(row.factura_emitida_cif),
    facturaRecibidaEntidadId: clean(row.factura_recibida_entidad_id), facturaRecibidaEntidadNombre: clean(row.factura_recibida_entidad_nombre), facturaEmitidaEntidadId: clean(row.factura_emitida_entidad_id), facturaEmitidaEntidadNombre: clean(row.factura_emitida_entidad_nombre),
    traspasoRelacionadoId: clean(row.traspaso_relacionado_id), cuentaContrapartidaId: clean(row.cuenta_contrapartida_id), cuentaContrapartidaBanco: clean(row.cuenta_contrapartida_banco), cuentaContrapartidaAlias: clean(row.cuenta_contrapartida_alias), cuentaContrapartidaProofId: clean(row.cuenta_contrapartida_proof_id),
    estadoPaso2: state as MovementRow['estadoPaso2'], decisionVersion: exactInteger(row.decision_version ?? 0, 'versión P1'), decision: decisionView(row),
  }
}

async function tableReady(tx: QueryDb, table: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ ready: boolean }>>(Prisma.sql`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ready`)
  return rows[0]?.ready === true
}
async function decisionTableReady(tx: QueryDb = db()): Promise<boolean> { return tableReady(tx, 'decisiones_tercero_modo_facil') }
async function accountProofTableReady(tx: QueryDb = db()): Promise<boolean> {
  const [attestations, policies] = await Promise.all([tableReady(tx, 'atestaciones_cuenta_auto_modo_facil'), tableReady(tx, 'politicas_auto_modo_facil')])
  return attestations && policies
}
function directionClause(direction: CounterpartyDirection): Prisma.Sql {
  return direction === 'CARGOS' ? Prisma.sql`AND b4_importe_bancario_centimos(m.importe) < 0`
    : direction === 'COBROS' ? Prisma.sql`AND b4_importe_bancario_centimos(m.importe) > 0` : Prisma.sql``
}
function cardClause(card: CounterpartyReadInput['tarjeta']): Prisma.Sql {
  if (!card) return Prisma.sql``
  const pattern = `(?:[*]{1,12}[[:space:]]*|[xX]{2,12}[[:space:]]*|[Tt][Aa][Rr][Jj][Ee][Tt][Aa][[:space:]]+)${card}([^0-9]|$)`
  return Prisma.sql`AND concat_ws(' ',m.concepto,m.referencia,m.info_adicional) ~ ${pattern}`
}
function baseMovementWhere(input: CounterpartyReadInput): Prisma.Sql {
  const query = input.q ? `%${input.q}%` : null
  return Prisma.sql`
    m.fecha_operacion >= CAST(${input.desde} AS date)
    AND m.fecha_operacion < CAST(${input.hasta} AS date) + interval '1 day'
    ${directionClause(input.sentido)}
    ${cardClause(input.tarjeta)}
    ${query === null ? Prisma.sql`` : Prisma.sql`AND (m.concepto ILIKE ${query} OR COALESCE(m.tercero,'') ILIKE ${query} OR COALESCE(m.referencia,'') ILIKE ${query} OR COALESCE(m.info_adicional,'') ILIKE ${query})`}
  `
}

function sourceRelations(withAccountProof: boolean): Prisma.Sql {
  const accountProof = withAccountProof ? Prisma.sql`
    LEFT JOIN movimientos_bancarios tm ON tm.id=m.traspaso_relacionado_id
    LEFT JOIN cuentas_bancarias tc ON tc.id=tm.cuenta_id AND tc.activa=true
    LEFT JOIN LATERAL (
      SELECT a.id::text AS id
      FROM atestaciones_cuenta_auto_modo_facil a
      JOIN politicas_auto_modo_facil p ON p.id=a.politica_id AND p.estado='ACTIVA' AND p.entorno='STAGING'
      WHERE tc.id IS NOT NULL AND a.cuenta_id=tc.id
      ORDER BY a.created_at DESC,a.id DESC LIMIT 1
    ) account_proof ON true
  ` : Prisma.sql`
    LEFT JOIN movimientos_bancarios tm ON false
    LEFT JOIN cuentas_bancarias tc ON false
    LEFT JOIN LATERAL (SELECT NULL::text AS id) account_proof ON true
  `
  return Prisma.sql`
    JOIN cuentas_bancarias c ON c.id=m.cuenta_id
    LEFT JOIN estado_justificacion_movimientos b4 ON b4.movimiento_id=m.id
    LEFT JOIN entidades_fiscales ef ON ef.id=m.entidad_fiscal_id
    LEFT JOIN empleados ee ON ef.tipo='PERSONAL'::"TipoEntidadFiscal" AND NULLIF(btrim(ef.nif_cif),'') IS NOT NULL
      AND upper(btrim(ee.nif))=upper(btrim(ef.nif_cif))
    LEFT JOIN empleados me ON me.id=m.entrega_a_cuenta_empleado_id
    LEFT JOIN nominas n ON n.id=m.nomina_id
    LEFT JOIN empleados ne ON ne.id=n.empleado_id
    LEFT JOIN facturas_recibidas fr ON fr.id=m.factura_id
    LEFT JOIN facturas_emitidas fe ON fe.id=m.factura_emitida_id
    LEFT JOIN LATERAL (
      SELECT id,razon_social,nif_cif FROM (
        SELECT candidate.id,candidate.razon_social,candidate.nif_cif,COUNT(*) OVER () AS matches
        FROM entidades_fiscales candidate
        WHERE candidate.tipo='PROVEEDOR'::"TipoEntidadFiscal" AND NULLIF(btrim(candidate.nif_cif),'') IS NOT NULL
          AND NULLIF(btrim(fr.cif),'') IS NOT NULL AND upper(btrim(candidate.nif_cif))=upper(btrim(fr.cif))
      ) unique_candidate WHERE matches=1 LIMIT 1
    ) fr_ef ON true
    LEFT JOIN LATERAL (
      SELECT id,razon_social,nif_cif FROM (
        SELECT candidate.id,candidate.razon_social,candidate.nif_cif,COUNT(*) OVER () AS matches
        FROM entidades_fiscales candidate
        WHERE candidate.tipo='CLIENTE'::"TipoEntidadFiscal" AND NULLIF(btrim(candidate.nif_cif),'') IS NOT NULL
          AND NULLIF(btrim(fe.cif),'') IS NOT NULL AND upper(btrim(candidate.nif_cif))=upper(btrim(fe.cif))
      ) unique_candidate WHERE matches=1 LIMIT 1
    ) fe_ef ON true
    ${accountProof}
  `
}
function decisionRelations(withDecisions: boolean): Prisma.Sql {
  if (!withDecisions) return Prisma.sql``
  return Prisma.sql`
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS decision_version FROM decisiones_tercero_modo_facil all_d WHERE all_d.movimiento_id=m.id
    ) p1v ON true
    LEFT JOIN LATERAL (
      SELECT d.id::text AS decision_id,d.tipo_tercero::text AS decision_tipo,d.origen::text AS decision_origen,d.candidato_hash AS decision_hash,
        COALESCE(d.snapshot->>'label',NULL) AS decision_etiqueta
      FROM decisiones_tercero_modo_facil d
      WHERE d.movimiento_id=m.id AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
        AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
      ORDER BY d.created_at DESC,d.id DESC LIMIT 1
    ) p1 ON true
  `
}
function decisionFields(withDecisions: boolean): Prisma.Sql {
  return withDecisions
    ? Prisma.sql`p1.decision_id,p1.decision_tipo,p1.decision_origen,p1.decision_hash,p1.decision_etiqueta,COALESCE(p1v.decision_version,0) AS decision_version`
    : Prisma.sql`NULL::text AS decision_id,NULL::text AS decision_tipo,NULL::text AS decision_origen,NULL::text AS decision_hash,NULL::text AS decision_etiqueta,0::int AS decision_version`
}
function sourceFields(withDecisions: boolean): Prisma.Sql {
  return Prisma.sql`
    m.id,m.fecha_operacion::date::text AS fecha,m.concepto,m.tercero,m.importe::text AS importe_text,c.banco,c.alias,
    m.entidad_fiscal_id,ef.tipo::text AS entidad_fiscal_tipo,ef.nif_cif AS entidad_fiscal_nif,ef.razon_social AS entidad_fiscal_nombre,
    ee.id AS entidad_empleado_id,ee.nombre_completo AS entidad_empleado_nombre,ee.nif AS entidad_empleado_nif,
    me.id AS entrega_empleado_id,me.nombre_completo AS entrega_empleado_nombre,me.nif AS entrega_empleado_nif,
    ne.id AS nomina_empleado_id,ne.nombre_completo AS nomina_empleado_nombre,ne.nif AS nomina_empleado_nif,
    m.factura_id,m.factura_emitida_id,fr.cif AS factura_recibida_cif,fe.cif AS factura_emitida_cif,
    fr_ef.id::text AS factura_recibida_entidad_id,fr_ef.razon_social AS factura_recibida_entidad_nombre,
    fe_ef.id::text AS factura_emitida_entidad_id,fe_ef.razon_social AS factura_emitida_entidad_nombre,
    m.traspaso_relacionado_id,tc.id AS cuenta_contrapartida_id,tc.banco AS cuenta_contrapartida_banco,tc.alias AS cuenta_contrapartida_alias,account_proof.id AS cuenta_contrapartida_proof_id,
    COALESCE(b4.estado::text,'SIN_DOCUMENTO') AS estado_paso2,
    ${decisionFields(withDecisions)}
  `
}

/** Query only current stable source fields. Bank free text remains `propuestaTexto`, never a candidate. */
function movementProjection(input: CounterpartyReadInput, limit: number, offset: number, withDecisions: boolean, withAccountProof: boolean, lock = false): Prisma.Sql {
  return Prisma.sql`
    SELECT ${sourceFields(withDecisions)}
    FROM movimientos_bancarios m
    ${sourceRelations(withAccountProof)}
    ${decisionRelations(withDecisions)}
    WHERE ${baseMovementWhere(input)}
    ORDER BY abs(b4_importe_bancario_centimos(m.importe)::bigint) DESC,m.fecha_operacion DESC,m.id ASC
    LIMIT ${limit} OFFSET ${offset}
    ${lock ? Prisma.sql`FOR UPDATE OF m` : Prisma.sql``}
  `
}

function materialFromRow(row: MovementRow): EasyCounterpartyBulkMovementMaterial {
  const step = resolveStep(row, candidatesForMovement(row))
  return {
    id: row.id,
    fecha: row.fecha,
    importeCentimos: row.importeCentimos,
    version: row.decisionVersion,
    estado: step.estadoPaso1,
    propuestaTexto: step.estadoPaso1 === 'PROPUESTO' ? row.tercero : null,
  }
}

/** Bounded read primitive for the explicit human bulk reviewer.  It evaluates all
 * direct sources in one projection and never uses bank free text as a source. */
export async function readEasyCounterpartyBulkMaterialTx(
  tx: QueryDb,
  input: CounterpartyReadInput,
  limit: number,
): Promise<readonly EasyCounterpartyBulkMovementMaterial[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PENDING_QUEUE_SCAN) fail(400, 'LIMITE_LOTE_INVALIDO', 'El límite de revisión de terceros no es válido.')
  const [withDecisions, withAccountProof] = await Promise.all([decisionTableReady(tx), accountProofTableReady(tx)])
  const rows = await tx.$queryRaw<Array<any>>(movementProjection(input, limit, 0, withDecisions, withAccountProof))
  return rows.map(rowView).map(materialFromRow)
}

/** Re-reads exactly the selected movements after deterministic row locks. */
export async function readEasyCounterpartyBulkMaterialByIdsTx(
  tx: Prisma.TransactionClient,
  ids: readonly string[],
): Promise<readonly EasyCounterpartyBulkMovementMaterial[]> {
  const requested = [...new Set(ids)]
  if (!requested.length || requested.length > 25 || requested.some(id => typeof id !== 'string' || !id || id.length > 160)) fail(400, 'SELECCION_LOTE_INVALIDA', 'La selección de terceros no es válida.')
  const work = asTx(tx)
  const [withDecisions, withAccountProof] = await Promise.all([decisionTableReady(work), accountProofTableReady(work)])
  for (const id of [...requested].sort()) await work.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${id} AS text),0))::text AS locked`
  const rows = await work.$queryRaw<Array<any>>(Prisma.sql`
    SELECT ${sourceFields(withDecisions)}
    FROM movimientos_bancarios m
    ${sourceRelations(withAccountProof)}
    ${decisionRelations(withDecisions)}
    WHERE m.id IN (${Prisma.join(requested.map(id => Prisma.sql`${id}`))})
    ORDER BY m.id ASC
    FOR UPDATE OF m
  `)
  if (rows.length !== requested.length) fail(409, 'SELECCION_LOTE_CAMBIADA', 'Uno de los movimientos ya no está disponible; relea la lista.')
  return rows.map(rowView).map(materialFromRow)
}

/** The normal P1 population is materially bounded by the reviewed operating
 * window. A pending queue may not silently truncate before it has calculated its
 * eligible total: require a narrower period instead. */
const MAX_PENDING_QUEUE_SCAN = 5_000

function resolveStep(row: MovementRow, candidates: readonly Candidate[]) {
  const active = row.decision
  if (active?.origen === 'AUTO_RECIBO') {
    return { estadoPaso1: 'IDENTIFICADO' as const, tipoTercero: active.tipo, etiqueta: active.etiqueta ?? 'Tercero acreditado por recibo automático vigente', origenPaso1: active.origen, decisionId: active.id, version: row.decisionVersion, propuestaTexto: null }
  }
  if (active) {
    // A human receipt preserves its public evidence label in its immutable snapshot.
    // Candidate source IDs never leave the server, and confirmation already revalidated
    // the current source hash under the movement lock.
    return { estadoPaso1: 'IDENTIFICADO' as const, tipoTercero: active.tipo, etiqueta: active.etiqueta ?? 'Tercero confirmado manualmente', origenPaso1: active.origen, decisionId: active.id, version: row.decisionVersion, propuestaTexto: null }
  }
  const automatic = candidates.filter(candidate => candidate.autoIdentify)
  // Never choose the first source: a second stable source is a contradiction
  // until a human selects it, even when both happen to have the same broad type.
  if (automatic.length === 1 && candidates.length === 1) {
    const current = automatic[0]
    return { estadoPaso1: 'IDENTIFICADO' as const, tipoTercero: current.seed.tipoTercero, etiqueta: current.etiqueta, origenPaso1: current.seed.origen, decisionId: null, version: row.decisionVersion, propuestaTexto: null }
  }
  if (row.tercero) return { estadoPaso1: 'PROPUESTO' as const, tipoTercero: null, etiqueta: null, origenPaso1: null, decisionId: null, version: row.decisionVersion, propuestaTexto: row.tercero }
  return { estadoPaso1: 'SIN_IDENTIFICAR' as const, tipoTercero: null, etiqueta: null, origenPaso1: null, decisionId: null, version: row.decisionVersion, propuestaTexto: null }
}

function asCounter(rows: readonly MovementRow[], predicate: (row: MovementRow) => boolean) {
  const selected = rows.filter(predicate)
  let signed = BigInt(0)
  for (const row of selected) signed += BigInt(row.importeCentimos)
  return { movimientos: selected.length, importeCentimos: signed.toString() }
}

/** Pure P1 counter projection. Production callers pass withDecisions:false so it never touches P1 tables. */
export async function readCountersTx(tx: QueryDb, input: CounterpartyReadInput, options: Readonly<{ withDecisions: boolean; withAccountProof: boolean }>) {
  const rows = (await tx.$queryRaw<Array<any>>(movementProjection(input, 100_000, 0, options.withDecisions, options.withAccountProof))).map(rowView)
  const states = rows.map(row => ({ row, step: resolveStep(row, candidatesForMovement(row)) }))
  const identified = states.filter(item => item.step.estadoPaso1 === 'IDENTIFICADO')
  const proposals = states.filter(item => item.step.estadoPaso1 !== 'IDENTIFICADO' && item.row.tercero !== null)
  const unrecognized = states.filter(item => item.step.estadoPaso1 !== 'IDENTIFICADO' && item.row.tercero === null)
  const chargeRows = rows.filter(row => row.importeCentimos < 0)
  const receiptRows = rows.filter(row => row.importeCentimos > 0)
  return {
    cohorte: 'TODOS_MOVIMIENTOS_VENTANA' as const,
    totalMovimientos: rows.length,
    identificados: identified.length,
    propuestosTexto: proposals.length,
    sinIdentificar: unrecognized.length,
    cargos: { ...asCounter(chargeRows, () => true), identificados: identified.filter(item => item.row.importeCentimos < 0).length },
    cobros: { ...asCounter(receiptRows, () => true), identificados: identified.filter(item => item.row.importeCentimos > 0).length },
  }
}

function p2Direction(row: any, state: string, direction: 'cargos' | 'cobros') {
  const cents = BigInt(String(row[`${state}_${direction}_centimos`] ?? '0'))
  return { movimientos: Number(row[`${state}_${direction}`] ?? 0), importeCentimos: cents.toString() }
}
/** P2 is a standalone B4 aggregation. It shares no P1 candidate, decision or amount. */
export async function readP2CountersTx(tx: QueryDb, input: CounterpartyReadInput) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    WITH x AS (
      SELECT date_trunc('month',m.fecha_operacion)::date::text AS mes,b4_importe_bancario_centimos(m.importe) AS cents,
        COALESCE(e.estado::text,'SIN_DOCUMENTO') AS estado
      FROM movimientos_bancarios m LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=m.id
      WHERE ${baseMovementWhere(input)} AND b4_importe_bancario_centimos(m.importe) IS NOT NULL
    ), totals AS (
      SELECT
        COUNT(*)::int AS ventana_total,
        COUNT(*) FILTER (WHERE estado='SIN_DOCUMENTO')::int AS sin_documento_total,
        COUNT(*) FILTER (WHERE estado='JUSTIFICADO')::int AS justificado_total,
        COUNT(*) FILTER (WHERE estado='NO_REQUIERE')::int AS no_requiere_total,
        COUNT(*) FILTER (WHERE estado='SIN_DOCUMENTO' AND cents<0)::int AS sin_documento_cargos,
        COUNT(*) FILTER (WHERE estado='SIN_DOCUMENTO' AND cents>0)::int AS sin_documento_cobros,
        COUNT(*) FILTER (WHERE estado='JUSTIFICADO' AND cents<0)::int AS justificado_cargos,
        COUNT(*) FILTER (WHERE estado='JUSTIFICADO' AND cents>0)::int AS justificado_cobros,
        COUNT(*) FILTER (WHERE estado='NO_REQUIERE' AND cents<0)::int AS no_requiere_cargos,
        COUNT(*) FILTER (WHERE estado='NO_REQUIERE' AND cents>0)::int AS no_requiere_cobros,
        COALESCE(SUM(cents) FILTER (WHERE estado='SIN_DOCUMENTO' AND cents<0),0)::bigint::text AS sin_documento_cargos_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='SIN_DOCUMENTO' AND cents>0),0)::bigint::text AS sin_documento_cobros_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='JUSTIFICADO' AND cents<0),0)::bigint::text AS justificado_cargos_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='JUSTIFICADO' AND cents>0),0)::bigint::text AS justificado_cobros_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='NO_REQUIERE' AND cents<0),0)::bigint::text AS no_requiere_cargos_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='NO_REQUIERE' AND cents>0),0)::bigint::text AS no_requiere_cobros_centimos
      FROM x
    ), monthly AS (
      SELECT mes,
        COUNT(*)::int AS total_movimientos,
        COUNT(*) FILTER (WHERE estado='SIN_DOCUMENTO')::int AS sin_documento,
        COUNT(*) FILTER (WHERE estado='JUSTIFICADO')::int AS justificado,
        COUNT(*) FILTER (WHERE estado='NO_REQUIERE')::int AS no_requiere,
        COALESCE(SUM(cents) FILTER (WHERE estado='SIN_DOCUMENTO'),0)::bigint::text AS sin_documento_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='JUSTIFICADO'),0)::bigint::text AS justificado_centimos,
        COALESCE(SUM(cents) FILTER (WHERE estado='NO_REQUIERE'),0)::bigint::text AS no_requiere_centimos
      FROM x GROUP BY mes
    )
    SELECT row_to_json(totals) AS totals,
      COALESCE((SELECT json_agg(monthly ORDER BY mes ASC) FROM monthly),'[]'::json) AS months
    FROM totals
  `)
  const row = rows[0] ?? {}
  const totals = typeof row.totals === 'string' ? JSON.parse(row.totals) : (row.totals ?? {})
  const months = typeof row.months === 'string' ? JSON.parse(row.months) : (Array.isArray(row.months) ? row.months : [])
  const pendingCargos = p2Direction(totals, 'sin_documento', 'cargos')
  const pendingCobros = p2Direction(totals, 'sin_documento', 'cobros')
  return {
    cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO' as const,
    totalMovimientos: Number(totals.sin_documento_total ?? 0),
    criterio: 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1' as const,
    cargos: pendingCargos,
    cobros: pendingCobros,
    // Optional extension consumed only by newer clients; old parsers keep the
    // original P2 denominator above unchanged.
    totalVentanaMovimientos: Number(totals.ventana_total ?? 0),
    justificados: {
      movimientos: Number(totals.justificado_total ?? 0),
      cargos: p2Direction(totals, 'justificado', 'cargos'),
      cobros: p2Direction(totals, 'justificado', 'cobros'),
    },
    noRequiere: {
      movimientos: Number(totals.no_requiere_total ?? 0),
      cargos: p2Direction(totals, 'no_requiere', 'cargos'),
      cobros: p2Direction(totals, 'no_requiere', 'cobros'),
    },
    meses: months.map((month: any) => ({
      mes: String(month.mes), totalMovimientos: Number(month.total_movimientos ?? 0),
      sinDocumento: { movimientos: Number(month.sin_documento ?? 0), importeCentimos: String(month.sin_documento_centimos ?? '0') },
      justificados: { movimientos: Number(month.justificado ?? 0), importeCentimos: String(month.justificado_centimos ?? '0') },
      noRequiere: { movimientos: Number(month.no_requiere ?? 0), importeCentimos: String(month.no_requiere_centimos ?? '0') },
    })),
  }
}

/** The normal route is staging-only. This wrapper preserves that guard. */
export async function readEasyStepCounters(input: CounterpartyReadInput) {
  await assertPrototypeStaging()
  try {
    const [withDecisions, withAccountProof] = await Promise.all([decisionTableReady(), accountProofTableReady()])
    const [paso1, paso2] = await Promise.all([
      readCountersTx(db(), input, { withDecisions, withAccountProof }),
      readP2CountersTx(db(), input),
    ])
    return { version: 'EASY_PASOS_V1' as const, paso1, paso2 }
  } catch (error) { privateError(error) }
}

/** GET P1 projects all movements, including B4 JUSTIFICADO/NO_REQUIERE; it has no DML. */
export async function readEasyCounterparties(input: CounterpartyReadInput) {
  await assertPrototypeStaging()
  try {
    const [withDecisions, withAccountProof] = await Promise.all([decisionTableReady(), accountProofTableReady()])
    const [rawRows, contador] = await Promise.all([
      db().$queryRaw<Array<any>>(movementProjection(input, input.pendientes ? MAX_PENDING_QUEUE_SCAN : input.limit, input.pendientes ? 0 : input.offset, withDecisions, withAccountProof)),
      readCountersTx(db(), input, { withDecisions, withAccountProof }),
    ])
    if (input.pendientes && rawRows.length === MAX_PENDING_QUEUE_SCAN) {
      fail(422, 'COLA_P1_DEMASIADO_AMPLIA', 'La cola P1 pendiente supera el límite seguro; acote el periodo o los filtros antes de paginar.')
    }
    const projected = rawRows.map(rowView).map(row => {
      const candidates = candidatesForMovement(row)
      return {
        id: row.id, fecha: row.fecha, concepto: row.concepto, importeCentimos: row.importeCentimos,
        cuenta: { banco: row.banco, alias: row.alias }, paso1: { ...resolveStep(row, candidates), candidatos: candidates.map(candidateDto) },
        paso2: { estadoPaso2: row.estadoPaso2 },
      }
    })
    const eligible = input.pendientes ? projected.filter(movement => movement.paso1.estadoPaso1 !== 'IDENTIFICADO') : projected
    const totalFiltrado = input.pendientes ? eligible.length : contador.totalMovimientos
    const movimientos = input.pendientes ? eligible.slice(input.offset, input.offset + input.limit) : eligible
    return {
      stagingOnly: true as const, automaticas: false as const, periodo: { desde: input.desde, hasta: input.hasta }, contador,
      total: totalFiltrado, totalFiltrado, limit: input.limit, offset: input.offset,
      ...(input.pendientes ? { filtro: 'P1_PENDIENTE' as const } : {}),
      movimientos,
    }
  } catch (error) { privateError(error) }
}

/**
 * Read-only P1 projection for another bounded financial read.  This intentionally
 * exposes neither a candidate ID nor a receipt/source identifier: consumers only
 * receive the current human-facing name/state.  It is one movement query for the
 * complete bounded set, never one query per movement.
 *
 * A deployment that has not yet applied an optional P1 table must not turn a
 * movement into a false “identified” result.  Direct, current fiscal evidence is
 * still evaluated when the decision ledger is absent; account evidence is omitted
 * unless its attestation tables are present.
 */
export type EasyMovementWho = Readonly<{
  estado: 'IDENTIFICADO' | 'PROPUESTO' | 'SIN_IDENTIFICAR'
  nombre: string | null
}>

export async function readEasyMovementWhoByIds(ids: readonly string[]): Promise<Map<string, EasyMovementWho>> {
  const requested = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 160))]
  if (requested.length > 100) fail(400, 'MOVIMIENTOS_DEMASIADOS', 'La consulta de terceros admite hasta 100 movimientos.')
  const fallback = new Map<string, EasyMovementWho>(requested.map(id => [id, { estado: 'SIN_IDENTIFICAR', nombre: null }]))
  if (!requested.length) return fallback

  try {
    const [withDecisions, withAccountProof] = await Promise.all([decisionTableReady(), accountProofTableReady()])
    const rows = await db().$queryRaw<Array<any>>(Prisma.sql`
      SELECT ${sourceFields(withDecisions)}
      FROM movimientos_bancarios m
      ${sourceRelations(withAccountProof)}
      ${decisionRelations(withDecisions)}
      WHERE m.id IN (${Prisma.join(requested.map(id => Prisma.sql`${id}`))})
      ORDER BY m.id ASC
      LIMIT 100
    `)
    for (const raw of rows) {
      const row = rowView(raw)
      const step = resolveStep(row, candidatesForMovement(row))
      fallback.set(row.id, step.estadoPaso1 === 'IDENTIFICADO'
        ? { estado: 'IDENTIFICADO', nombre: humanCounterpartyName(step.etiqueta) }
        : step.estadoPaso1 === 'PROPUESTO'
          ? { estado: 'PROPUESTO', nombre: row.tercero }
          : { estado: 'SIN_IDENTIFICAR', nombre: null })
    }
    return fallback
  } catch (error) {
    // This helper is an optional read enrichment.  A missing/rolling-out P1
    // schema may only degrade to “not identified”, never claim a completed step.
    if ((error as { code?: unknown })?.code === '42P01') return fallback
    throw error
  }
}

function dedupeCandidates(candidates: Candidate[]) {
  const seen = new Set<string>()
  return candidates.filter(candidate => {
    const id = counterpartySuggestionId(candidate.seed)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}
/** Search is an explicit human selector. It never uses bank free text as evidence and
 * never changes `estadoPaso1` until a separate POST confirmacion:true. */
async function stableSearchCandidatesTx(tx: QueryDb, movimientoId: string, buscar: string | null, limit: number, withAccountProof: boolean): Promise<Candidate[]> {
  const term = buscar ? `%${buscar}%` : null
  const entityRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id,tipo::text AS tipo,razon_social,nif_cif FROM entidades_fiscales
    WHERE activo=true AND tipo IN ('CLIENTE'::"TipoEntidadFiscal",'PROVEEDOR'::"TipoEntidadFiscal",'AAPP'::"TipoEntidadFiscal")
      ${term === null ? Prisma.sql`` : Prisma.sql`AND (razon_social ILIKE ${term} OR COALESCE(nif_cif,'') ILIKE ${term})`}
    ORDER BY razon_social ASC,id ASC LIMIT ${limit}
  `)
  const employeeRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id,nombre_completo,nif FROM empleados
    WHERE ${term === null ? Prisma.sql`true` : Prisma.sql`(nombre_completo ILIKE ${term} OR nif ILIKE ${term})`}
    ORDER BY nombre_completo ASC,id ASC LIMIT ${limit}
  `)
  const clientRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT cw.id AS cliente_web_id,cw.nombre,cw.nombre_comercial,cw.nif,cw.cif,
      cw.cliente_id_isp,cw.isp_gestion_id,cs.id AS contrato_id,cs.cliente_id AS contrato_cliente_id
    FROM clientes_web cw
    JOIN contratos_servicio cs ON cs.activo=true
      AND NULLIF(btrim(cw.cliente_id_isp),'') IS NOT NULL
      AND cs.cliente_id=cw.cliente_id_isp
    WHERE COALESCE(cw.activo,true)=true
      ${term === null ? Prisma.sql`` : Prisma.sql`AND (cw.nombre ILIKE ${term} OR COALESCE(cw.nombre_comercial,'') ILIKE ${term} OR COALESCE(cw.nif,'') ILIKE ${term} OR COALESCE(cw.cif,'') ILIKE ${term})`}
    ORDER BY cw.nombre ASC,cw.id ASC,cs.id ASC LIMIT ${limit}
  `)
  const candidates: Candidate[] = []
  for (const row of entityRows) {
    const type = String(row.tipo)
    const mapped: CounterpartyType = type === 'CLIENTE' ? 'CLIENTE' : type === 'PROVEEDOR' ? 'PROVEEDOR' : 'BANCO'
    const kind = type === 'CLIENTE' ? 'Cliente fiscal registrado' : type === 'PROVEEDOR' ? 'Proveedor fiscal registrado' : 'Administración registrada'
    addCandidate(candidates, movimientoId, mapped, 'ENTIDAD_FISCAL', `EF:${String(row.id)}`, evidenceLabel(clean(row.razon_social), kind, clean(row.nif_cif)))
  }
  for (const row of employeeRows) {
    addCandidate(candidates, movimientoId, 'EMPLEADO', 'EMPLEADO', `EMPLEADO:${String(row.id)}`, evidenceLabel(clean(row.nombre_completo), 'Empleado registrado', clean(row.nif)))
  }
  for (const row of clientRows) {
    const external = clean(row.cliente_id_isp) ?? clean(row.isp_gestion_id)
    if (!external) continue
    const name = clean(row.nombre_comercial) ?? clean(row.nombre)
    const nif = clean(row.cif) ?? clean(row.nif)
    addCandidate(candidates, movimientoId, 'CLIENTE', 'CLIENTE_CONTRATO_ACTUAL', `CLIENTE_WEB_CONTRATO:${String(row.cliente_web_id)}:${String(row.contrato_id)}:${String(row.contrato_cliente_id)}:${external}`, evidenceLabel(name, 'Cliente registrado', nif))
  }
  if (withAccountProof) {
    const accountRows = await tx.$queryRaw<Array<any>>(Prisma.sql`
      SELECT c.id,c.banco,c.alias,a.id::text AS atestacion_id
      FROM cuentas_bancarias c
      JOIN atestaciones_cuenta_auto_modo_facil a ON a.cuenta_id=c.id
      JOIN politicas_auto_modo_facil p ON p.id=a.politica_id AND p.estado='ACTIVA' AND p.entorno='STAGING'
      WHERE c.activa=true
        ${term === null ? Prisma.sql`` : Prisma.sql`AND (c.banco ILIKE ${term} OR COALESCE(c.alias,'') ILIKE ${term})`}
      ORDER BY COALESCE(c.alias,c.banco) ASC,c.id ASC LIMIT ${limit}
    `)
    for (const row of accountRows) {
      const account = clean(row.alias) ?? clean(row.banco) ?? 'Cuenta registrada'
      addCandidate(candidates, movimientoId, 'CUENTA_PROPIA', 'CUENTA_PROPIA_ACTUAL', `CUENTA_ATESTADA:${String(row.id)}:${String(row.atestacion_id)}`, `${account} · cuenta registrada`)
    }
  }
  return dedupeCandidates(candidates).sort((left, right) => left.etiqueta.localeCompare(right.etiqueta, 'es')).slice(0, limit)
}

export async function searchEasyCounterparties(input: CounterpartySearchInput) {
  await assertPrototypeStaging()
  try {
    const withAccountProof = await accountProofTableReady()
    const movement = await db().$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM movimientos_bancarios WHERE id=${input.movimientoId} LIMIT 1`)
    if (movement.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
    const candidates = await stableSearchCandidatesTx(db(), input.movimientoId, input.buscar, input.limit, withAccountProof)
    return { stagingOnly: true as const, automaticas: false as const, movimientoId: input.movimientoId, candidatos: candidates.map(candidateDto) }
  } catch (error) { privateError(error) }
}

async function receiptReplay(tx: Tx, actorId: number, input: CounterpartyWriteInput) {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,movimiento_id,accion::text,request_hash,revierte_id::text
    FROM decisiones_tercero_modo_facil WHERE actor_id=${actorId} AND idempotency_key=CAST(${input.idempotencyKey} AS uuid) LIMIT 1 FOR UPDATE
  `)
  const row = rows[0]
  if (!row) return null
  if (row.request_hash !== counterpartyRequestHash(actorId, input)) fail(409, 'IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave de idempotencia pertenece a otra decisión de tercero.')
  return { ok: true as const, idempotente: true as const, decisionId: String(row.id), movimientoId: String(row.movimiento_id), accion: String(row.accion), reversible: row.accion === 'CONFIRMADA' }
}

async function lockedMovement(tx: Tx, movimientoId: string, withDecisions: boolean, withAccountProof: boolean): Promise<MovementRow> {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text),0))::text AS locked`
  const source = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT ${sourceFields(withDecisions)}
    FROM movimientos_bancarios m
    ${sourceRelations(withAccountProof)}
    ${decisionRelations(withDecisions)}
    WHERE m.id=${movimientoId} FOR UPDATE OF m
  `)
  if (source.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.')
  return rowView(source[0])
}
async function currentVersionTx(tx: Tx, movimientoId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ version: number | bigint }>>(Prisma.sql`SELECT COUNT(*)::int AS version FROM decisiones_tercero_modo_facil WHERE movimiento_id=${movimientoId}`)
  return exactInteger(rows[0]?.version ?? 0, 'versión P1')
}

/** A restricted Easy-only profile can undo its own human receipt, but cannot undo
 * another operator's receipt. Delegated undo is an explicit live-manager power;
 * it is checked from database rows, never from a browser role claim. */
async function canReverseAnotherActorTx(tx: Tx, actorId: number): Promise<boolean> {
  if (!await tableReady(tx, 'perfiles_acceso_modo_facil')) return false
  const rows = await tx.$queryRaw<Array<{ allowed: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM usuarios_admin u
      WHERE u.id=${actorId} AND u.activo=true AND u.rol::text IN ('SUPER_ADMIN','GERENTE')
        AND COALESCE((
          SELECT p.perfil FROM perfiles_acceso_modo_facil p
          WHERE p.usuario_id=u.id ORDER BY p.version DESC LIMIT 1
        ),'RESTABLECIDO') <> 'MODO_FACIL_ONLY'
    ) AS allowed
  `)
  return rows[0]?.allowed === true
}

/** Resolves every admissible stable source afresh in the serializable transaction.
 * The selected browser hash has no source ID to trust; it must match the newly
 * constructed seed before any receipt can be appended. */
async function currentCandidatesForConfirmTx(tx: Tx, movement: MovementRow, withAccountProof: boolean) {
  return dedupeCandidates([
    ...candidatesForMovement(movement),
    ...(await stableSearchCandidatesTx(tx, movement.id, null, 10_000, withAccountProof)),
  ])
}

async function confirmParsedTx(tx: Tx, actorId: number, input: CounterpartyWriteInput, withAccountProof: boolean) {
  const replay = await receiptReplay(tx, actorId, input)
  if (replay) return replay
  if (input.action === 'confirmar') {
    const movement = await lockedMovement(tx, input.movimientoId, true, withAccountProof)
    const version = await currentVersionTx(tx, movement.id)
    if (version !== input.version) fail(409, 'VERSION_CONFLICT', 'La decisión P1 cambió; relea el movimiento.')
    if (movement.decision) fail(409, 'REVERSION_REQUERIDA', 'Ya hay una decisión P1 vigente; revíertala antes de sustituirla.')
    const candidate = (await currentCandidatesForConfirmTx(tx, movement, withAccountProof)).find(item => counterpartySuggestionId(item.seed) === input.sugerenciaId)
    if (!candidate) fail(409, 'SUGERENCIA_OBSOLETA', 'La evidencia actual ya no acredita esta identificación; relea el movimiento.')
    const live = await requireB4ActorAccess(actorId, 'escritura')
    if ('response' in live) fail(live.response.status, 'ACCESS_REVOKED', 'El permiso B4 cambió; no se aplicó la decisión P1.')
    const candidateHash = counterpartyCandidateHash(candidate.seed)
    const sourceHash = counterpartySha256({ schema: 'EASY_COUNTERPARTY_SOURCE_V1', sourceIdentity: candidate.seed.sourceIdentity })
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
      VALUES (gen_random_uuid(),${movement.id},${actorId},'CONFIRMADA'::"EstadoDecisionTerceroModoFacil",${candidate.seed.tipoTercero}::"TipoTerceroModoFacil",${candidate.seed.origen}::"OrigenTerceroModoFacil",${candidateHash},CAST(${input.idempotencyKey} AS uuid),${counterpartyRequestHash(actorId,input)},NULL,
        jsonb_build_object('schema','EASY_COUNTERPARTY_RECEIPT_V1','candidateHash',${candidateHash},'sourceHash',${sourceHash},'origin',${candidate.seed.origen},'label',${candidate.etiqueta}),CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    const id = rows[0]?.id
    if (!id) fail(500, 'DECISION_NO_CREADA', 'No se pudo conservar la decisión P1.')
    return { ok: true as const, idempotente: false as const, decisionId: id, movimientoId: movement.id, accion: 'CONFIRMADA', reversible: true }
  }
  const prior = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,movimiento_id,actor_id,tipo_tercero::text AS tipo_tercero,origen::text AS origen,candidato_hash
    FROM decisiones_tercero_modo_facil WHERE id=CAST(${input.decisionId} AS uuid) AND accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" LIMIT 1 FOR UPDATE
  `)
  const receipt = prior[0]
  if (!receipt) fail(404, 'DECISION_NO_ENCONTRADA', 'La decisión P1 no existe.')
  const originalActorId = exactInteger(receipt.actor_id, 'actor original P1')
  if (originalActorId !== actorId && !await canReverseAnotherActorTx(tx, actorId)) {
    fail(403, 'REVERSION_AJENA_NO_AUTORIZADA', 'Sólo un gestor vivo no restringido puede revertir una decisión P1 de otro actor.')
  }
  const movement = await lockedMovement(tx, String(receipt.movimiento_id), true, withAccountProof)
  const version = await currentVersionTx(tx, movement.id)
  if (version !== input.version) fail(409, 'VERSION_CONFLICT', 'La decisión P1 cambió; relea antes de revertir.')
  if (!movement.decision || movement.decision.id !== input.decisionId) fail(409, 'DECISION_NO_VIGENTE', 'La decisión ya no está vigente o ya fue revertida.')
  const live = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in live) fail(live.response.status, 'ACCESS_REVOKED', 'El permiso B4 cambió; no se aplicó la reversión P1.')
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
    VALUES (gen_random_uuid(),${movement.id},${actorId},'REVERTIDA'::"EstadoDecisionTerceroModoFacil",${String(receipt.tipo_tercero)}::"TipoTerceroModoFacil",${String(receipt.origen)}::"OrigenTerceroModoFacil",${String(receipt.candidato_hash)},CAST(${input.idempotencyKey} AS uuid),${counterpartyRequestHash(actorId,input)},CAST(${input.decisionId} AS uuid),jsonb_build_object('schema','EASY_COUNTERPARTY_RECEIPT_V1','candidateHash',${String(receipt.candidato_hash)},'origin',${String(receipt.origen)},'revertedOriginalActorId',${originalActorId},'revertedByActorId',${actorId}),CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
  const id = rows[0]?.id
  if (!id) fail(500, 'REVERSION_NO_CREADA', 'No se pudo conservar la reversión P1.')
  return { ok: true as const, idempotente: false as const, decisionId: id, movimientoId: movement.id, accion: 'REVERTIDA', reversible: false }
}

/** POST is staging-only, serializable, idempotent and append-only. It never touches B4 state or legacy identity columns. */
export async function mutateEasyCounterparty(actorId: number, raw: unknown) {
  const input = parseCounterpartyWriteInput(raw)
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
  if (!await decisionTableReady()) fail(503, 'P1_MIGRATION_PENDIENTE', 'La migración P1 de terceros aún no está aplicada en staging.')
  try {
    const withAccountProof = await accountProofTableReady()
    return await db().$transaction(base => confirmParsedTx(asTx(base), actorId, input, withAccountProof), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 45_000 })
  } catch (error) { privateError(error) }
}

/** Caller-owned test/integration transaction variant. It deliberately keeps all
 * production checks: staging, live B4 permission, migration readiness and the
 * serializable caller's locks are never bypassed. */
export async function mutateEasyCounterpartyTx(tx: Prisma.TransactionClient, actorId: number, raw: unknown) {
  const input = parseCounterpartyWriteInput(raw)
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if ('response' in access) fail(access.response.status, 'ACCESS_REVOKED', 'No dispone de permiso B4 de escritura activo.')
  const work = asTx(tx)
  if (!await decisionTableReady(work)) fail(503, 'P1_MIGRATION_PENDIENTE', 'La migración P1 de terceros aún no está aplicada en staging.')
  const withAccountProof = await accountProofTableReady(work)
  return confirmParsedTx(work, actorId, input, withAccountProof)
}

function uuidFromHash(hash: string): string {
  const bytes = Buffer.from(hash.slice(0, 32), 'hex')
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type ActiveAutoLeg = Readonly<{ movimientoId: string; actorId: number; clase: 'TRASPASO_PROPIO' | 'COMISION_BANCARIA'; bancoDerivado: string | null }>
async function verifiedActiveAutoLegTx(tx: Tx, autoReceiptId: string, movimientoId?: string): Promise<ActiveAutoLeg[]> {
  const rows = await tx.$queryRaw<Array<any>>(Prisma.sql`
    SELECT p.movimiento_id,r.actor_id,r.clase,t.nombre_normalizado AS banco_derivado,o.estado::text AS estado,o.revertida_at
    FROM recibos_auto_modo_facil r
    JOIN patas_recibo_auto_modo_facil p ON p.recibo_id=r.id
    JOIN operaciones_justificacion_b4 o ON o.id=p.operacion_b4_id
    LEFT JOIN terceros_banco_auto_modo_facil t ON t.id=r.tercero_banco_id AND t.politica_id=r.politica_id AND t.activo=true
    WHERE r.id=CAST(${autoReceiptId} AS uuid)
      ${movimientoId === undefined ? Prisma.sql`` : Prisma.sql`AND p.movimiento_id=${movimientoId}`}
      AND NOT EXISTS (SELECT 1 FROM reversiones_auto_modo_facil rv WHERE rv.recibo_id=r.id)
      AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    ORDER BY p.ordinal ASC
    FOR KEY SHARE OF r,p,o
  `)
  if (!rows.length) fail(409, 'AUTO_RECIBO_NO_VIGENTE', 'El recibo automático no está vigente o no acredita esta pata bancaria.')
  return rows.map(row => {
    const clase = String(row.clase)
    if (clase !== 'TRASPASO_PROPIO' && clase !== 'COMISION_BANCARIA') fail(409, 'AUTO_RECIBO_INVALIDO', 'La clase del recibo automático no es admisible para P1.')
    const bancoDerivado = row.banco_derivado === null || row.banco_derivado === undefined ? null : String(row.banco_derivado).trim()
    if (clase === 'COMISION_BANCARIA' && !bancoDerivado) fail(409, 'AUTO_RECIBO_BANCO_DERIVADO_AUSENTE', 'La comisión automática no conserva el banco derivado e inmutable del recibo.')
    return { movimientoId: String(row.movimiento_id), actorId: exactInteger(row.actor_id, 'actor automático'), clase, bancoDerivado }
  })
}

/** Private hook for the automatic child. It cannot forge AUTO_RECIBO: the source
 * identity and type are derived from a current, unreversed automatic receipt leg. */
export async function appendAutoCounterpartyReceiptTx(
  tx: Prisma.TransactionClient,
  actorId: number,
  input: Readonly<{
    movimientoId: string
    autoReceiptId: string
    /** Campos de compatibilidad internos: no se usan como evidencia; la fuente
     * y el tipo efectivos se reconstruyen desde el recibo automático vigente. */
    tipoTercero?: CounterpartyType
    sourceIdentity?: string
  }>,
) {
  await assertPrototypeStaging()
  const work = asTx(tx)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.autoReceiptId)) fail(400, 'AUTO_RECIBO_INVALIDO', 'El recibo automático no es un UUID canónico.')
  const leg = (await verifiedActiveAutoLegTx(work, input.autoReceiptId.toLowerCase(), input.movimientoId))[0]
  if (leg.actorId !== actorId) fail(403, 'AUTO_RECIBO_ACTOR_INVALIDO', 'El actor no coincide con el recibo automático vigente.')
  const tipoTercero: CounterpartyType = leg.clase === 'TRASPASO_PROPIO' ? 'CUENTA_PROPIA' : 'BANCO'
  const sourceIdentity = `AUTO_RECEIPT:${input.autoReceiptId.toLowerCase()}:${leg.movimientoId}:${leg.clase}`
  if (input.tipoTercero !== undefined && input.tipoTercero !== tipoTercero) {
    fail(409, 'AUTO_RECIBO_FUENTE_INVALIDA', 'El tipo declarado no coincide con la clase del recibo automático vigente.')
  }
  const existing = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT d.id::text FROM decisiones_tercero_modo_facil d
    WHERE d.movimiento_id=${leg.movimientoId} AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    LIMIT 1 FOR KEY SHARE
  `)
  if (existing.length) return { ok: true as const, idempotente: true as const, decisionId: existing[0].id }
  const candidateHash = counterpartyCandidateHash({ movimientoId: leg.movimientoId, tipoTercero, origen: 'AUTO_RECIBO', sourceIdentity })
  const idempotencyKey = uuidFromHash(counterpartySha256({ schema: 'EASY_COUNTERPARTY_AUTO_IDEMPOTENCY_V2', autoReceiptId: input.autoReceiptId.toLowerCase(), movimientoId: leg.movimientoId }))
  const requestHash = counterpartySha256({ schema: 'EASY_COUNTERPARTY_AUTO_REQUEST_V2', actorId, movimientoId: leg.movimientoId, tipoTercero, candidateHash, autoReceiptId: input.autoReceiptId.toLowerCase() })
  const replay = await work.$queryRaw<Array<{ id: string; request_hash: string }>>(Prisma.sql`
    SELECT id::text,request_hash FROM decisiones_tercero_modo_facil
    WHERE actor_id=${actorId} AND idempotency_key=CAST(${idempotencyKey} AS uuid) LIMIT 1 FOR KEY SHARE
  `)
  if (replay.length) {
    if (replay[0].request_hash !== requestHash) fail(409, 'AUTO_RECIBO_IDEMPOTENCY_CONFLICT', 'La clave automática ya pertenece a otro recibo P1.')
    return { ok: true as const, idempotente: true as const, decisionId: replay[0].id }
  }
  const autoReceiptId = input.autoReceiptId.toLowerCase()
  const label = leg.clase === 'TRASPASO_PROPIO' ? 'Cuenta registrada por recibo automático vigente' : leg.bancoDerivado!
  const rows = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
    VALUES (gen_random_uuid(),${leg.movimientoId},${actorId},'CONFIRMADA'::"EstadoDecisionTerceroModoFacil",${tipoTercero}::"TipoTerceroModoFacil",'AUTO_RECIBO'::"OrigenTerceroModoFacil",${candidateHash},CAST(${idempotencyKey} AS uuid),${requestHash},NULL,jsonb_build_object('schema','EASY_COUNTERPARTY_RECEIPT_V1','candidateHash',${candidateHash},'origin','AUTO_RECIBO','autoReceiptId',${autoReceiptId},'label',${label}),CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
  const decisionId = rows[0]?.id
  if (!decisionId) fail(500, 'AUTO_RECIBO_NO_CREADO', 'No se pudo conservar el recibo automático de tercero.')
  return { ok: true as const, idempotente: false as const, decisionId }
}

/** Automatic child undo helper. It only reverses P1 receipts whose parent automatic
 * receipt and every B4 leg are still current; it cannot adopt an arbitrary receipt. */
export async function undoAutoCounterpartyReceiptTx(tx: Prisma.TransactionClient, actorId: number, input: Readonly<{ autoReceiptId: string }>) {
  await assertPrototypeStaging()
  const work = asTx(tx)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.autoReceiptId)) fail(400, 'AUTO_RECIBO_INVALIDO', 'El recibo automático no es un UUID canónico.')
  const receiptId = input.autoReceiptId.toLowerCase()
  const legs = await verifiedActiveAutoLegTx(work, receiptId)
  const originalActors = [...new Set(legs.map(leg => leg.actorId))]
  if (originalActors.length !== 1) fail(409, 'AUTO_RECIBO_ACTOR_AMBIGUO', 'El recibo automático no conserva un actor original único.')
  const originalActorId = originalActors[0]
  if (originalActorId !== actorId && !await canReverseAnotherActorTx(work, actorId)) {
    fail(403, 'AUTO_RECIBO_ACTOR_INVALIDO', 'Sólo un gestor vivo no restringido puede deshacer un recibo automático de otro actor.')
  }
  const movements = legs.map(leg => leg.movimientoId)
  const prior = await work.$queryRaw<Array<any>>(Prisma.sql`
    SELECT d.id::text,d.movimiento_id,d.actor_id,d.tipo_tercero::text AS tipo_tercero,d.candidato_hash
    FROM decisiones_tercero_modo_facil d
    WHERE d.movimiento_id IN (${Prisma.join(movements.map(id => Prisma.sql`${id}`))})
      AND d.actor_id=${originalActorId} AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" AND d.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
      AND d.snapshot->>'autoReceiptId'=${receiptId}
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    ORDER BY d.movimiento_id ASC,d.id ASC FOR UPDATE
  `)
  const reversed: string[] = []
  let idempotent = true
  for (const row of prior) {
    const decisionId = String(row.id)
    const movementId = String(row.movimiento_id)
    const receiptActorId = exactInteger(row.actor_id, 'actor original recibo automático P1')
    if (receiptActorId !== originalActorId) fail(409, 'AUTO_RECIBO_ACTOR_AMBIGUO', 'La decisión P1 no coincide con el actor original del recibo automático.')
    await work.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movementId} AS text),0))::text AS locked`
    const key = uuidFromHash(counterpartySha256({ schema: 'EASY_COUNTERPARTY_AUTO_UNDO_V1', autoReceiptId: receiptId, decisionId }))
    const requestHash = counterpartySha256({ schema: 'EASY_COUNTERPARTY_AUTO_UNDO_REQUEST_V1', actorId, autoReceiptId: receiptId, decisionId })
    const replay = await work.$queryRaw<Array<any>>(Prisma.sql`SELECT id::text,request_hash FROM decisiones_tercero_modo_facil WHERE actor_id=${actorId} AND idempotency_key=CAST(${key} AS uuid) LIMIT 1 FOR KEY SHARE`)
    if (replay.length) {
      if (replay[0].request_hash !== requestHash) fail(409, 'AUTO_RECIBO_IDEMPOTENCY_CONFLICT', 'La reversión automática P1 no coincide con su recibo.')
      reversed.push(String(replay[0].id))
      continue
    }
    const rows = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
      VALUES (gen_random_uuid(),${movementId},${actorId},'REVERTIDA'::"EstadoDecisionTerceroModoFacil",${String(row.tipo_tercero)}::"TipoTerceroModoFacil",'AUTO_RECIBO'::"OrigenTerceroModoFacil",${String(row.candidato_hash)},CAST(${key} AS uuid),${requestHash},CAST(${decisionId} AS uuid),jsonb_build_object('schema','EASY_COUNTERPARTY_RECEIPT_V1','candidateHash',${String(row.candidato_hash)},'origin','AUTO_RECIBO','autoReceiptId',${receiptId},'revertedOriginalActorId',${originalActorId},'revertedByActorId',${actorId}),CURRENT_TIMESTAMP)
      RETURNING id::text
    `)
    if (!rows[0]?.id) fail(500, 'AUTO_RECIBO_REVERSION_NO_CREADA', 'No se pudo revertir el recibo P1 automático.')
    idempotent = false
    reversed.push(rows[0].id)
  }
  return { ok: true as const, idempotente: idempotent, autoReceiptId: receiptId, decisionesReversion: reversed }
}

/** One-leg compatibility helper for the automatic child. Call it before the
 * corresponding B4 leg is undone; it refuses a reverted/non-current automatic
 * parent receipt and records both the original and reversing actors. */
export async function reverseAutoCounterpartyReceiptTx(
  tx: Prisma.TransactionClient,
  actorId: number,
  input: Readonly<{ movimientoId: string; autoReceiptId: string }>,
) {
  await assertPrototypeStaging()
  const work = asTx(tx)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.autoReceiptId)) fail(400, 'AUTO_RECIBO_INVALIDO', 'El recibo automático no es un UUID canónico.')
  const receiptId = input.autoReceiptId.toLowerCase()
  const leg = (await verifiedActiveAutoLegTx(work, receiptId, input.movimientoId))[0]
  if (leg.actorId !== actorId && !await canReverseAnotherActorTx(work, actorId)) {
    fail(403, 'AUTO_RECIBO_ACTOR_INVALIDO', 'Sólo un gestor vivo no restringido puede revertir una decisión automática de otro actor.')
  }
  const prior = await work.$queryRaw<Array<any>>(Prisma.sql`
    SELECT d.id::text,d.actor_id,d.tipo_tercero::text AS tipo_tercero,d.candidato_hash
    FROM decisiones_tercero_modo_facil d
    WHERE d.movimiento_id=${leg.movimientoId} AND d.actor_id=${leg.actorId}
      AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" AND d.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
      AND d.snapshot->>'autoReceiptId'=${receiptId}
      AND NOT EXISTS (SELECT 1 FROM decisiones_tercero_modo_facil r WHERE r.revierte_id=d.id AND r.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil")
    ORDER BY d.created_at DESC,d.id DESC LIMIT 1 FOR UPDATE
  `)
  const receipt = prior[0]
  if (!receipt) fail(409, 'AUTO_RECIBO_P1_NO_VIGENTE', 'No existe una decisión P1 automática vigente para esta pata.')
  const originalActorId = exactInteger(receipt.actor_id, 'actor recibo automático P1')
  const decisionId = String(receipt.id)
  await work.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${leg.movimientoId} AS text),0))::text AS locked`
  const key = uuidFromHash(counterpartySha256({ schema: 'EASY_COUNTERPARTY_AUTO_UNDO_LEG_V1', autoReceiptId: receiptId, decisionId }))
  const requestHash = counterpartySha256({ schema: 'EASY_COUNTERPARTY_AUTO_UNDO_LEG_REQUEST_V1', actorId, autoReceiptId: receiptId, decisionId })
  const replay = await work.$queryRaw<Array<any>>(Prisma.sql`
    SELECT id::text,request_hash FROM decisiones_tercero_modo_facil
    WHERE actor_id=${actorId} AND idempotency_key=CAST(${key} AS uuid) LIMIT 1 FOR KEY SHARE
  `)
  if (replay.length) {
    if (replay[0].request_hash !== requestHash) fail(409, 'AUTO_RECIBO_IDEMPOTENCY_CONFLICT', 'La reversión automática P1 no coincide con el recibo.')
    return { ok: true as const, idempotente: true as const, decisionId: String(replay[0].id), movimientoId: leg.movimientoId }
  }
  const rows = await work.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO decisiones_tercero_modo_facil (id,movimiento_id,actor_id,accion,tipo_tercero,origen,candidato_hash,idempotency_key,request_hash,revierte_id,snapshot,created_at)
    VALUES (gen_random_uuid(),${leg.movimientoId},${actorId},'REVERTIDA'::"EstadoDecisionTerceroModoFacil",${String(receipt.tipo_tercero)}::"TipoTerceroModoFacil",'AUTO_RECIBO'::"OrigenTerceroModoFacil",${String(receipt.candidato_hash)},CAST(${key} AS uuid),${requestHash},CAST(${decisionId} AS uuid),jsonb_build_object('schema','EASY_COUNTERPARTY_RECEIPT_V1','candidateHash',${String(receipt.candidato_hash)},'origin','AUTO_RECIBO','autoReceiptId',${receiptId},'revertedOriginalActorId',${originalActorId},'revertedByActorId',${actorId}),CURRENT_TIMESTAMP)
    RETURNING id::text
  `)
  if (!rows[0]?.id) fail(500, 'AUTO_RECIBO_REVERSION_NO_CREADA', 'No se pudo revertir el recibo P1 automático.')
  return { ok: true as const, idempotente: false as const, decisionId: rows[0].id, movimientoId: leg.movimientoId }
}

export function easyCounterpartyErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof PrototypeStagingError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  if (error instanceof EasyCounterpartyServiceError || error instanceof EasyCounterpartyValidationError) return { status: error.status, body: { error: error.message, codigo: error.code } }
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034' || code === '40001') return { status: 409, body: { error: 'Conflicto concurrente; relea y reintente con la misma clave.', codigo: 'CONCURRENT_CONFLICT' } }
  return { status: 500, body: { error: 'No se pudo procesar la identificación de tercero.' } }
}
