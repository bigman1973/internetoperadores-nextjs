import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Prisma } from '@prisma/client'
import prisma from '../lib/prisma'
import { assertPrototypeStaging } from '../lib/finanzas/prototype-staging'
import { requireB4ActorAccess } from '../lib/finanzas/reconciliation-auth'
import { calculatePhoneCostAnalytics, phoneCostEvidenceSourceSnapshotSha256, type PhoneCostReceivedDocumentInput, type PhoneCostSingleServiceEvidenceInput } from '../lib/finanzas/phone-cost-core'
import { facturaEconomicaSQL } from '../lib/finanzas/invoice-economic-filter'
import { archivoRecibidaControlado } from '../lib/finanzas/archivo-fuente-controlada'

const FORMAT = 'TELEFONICA_UNICA_PDF_V1'
const args = process.argv.slice(2)
const index = args.indexOf('--input')
if (index < 0 || !args[index + 1]) throw new Error('EVIDENCE_INPUT_REQUIRED')
const inputPath = resolve(args[index + 1])
const proofIndex = args.indexOf('--source-pointers')
const libraryIndex = args.indexOf('--library-file')
if (proofIndex < 0 || libraryIndex < 0) throw new Error('EVIDENCE_SOURCE_POINTER_PROOF_REQUIRED')
const pointerProof = JSON.parse(readFileSync(resolve(args[proofIndex + 1]), 'utf8'))
if (pointerProof.verifiedReadOnly !== true || !Array.isArray(pointerProof.rows) || pointerProof.rows.length !== 45) throw new Error('EVIDENCE_SOURCE_POINTER_PROOF_INVALID')
const provenPointers = new Map<string, { driveId: string; itemId: string }>(pointerProof.rows.map((row: any) => [row.id, row]))
const financialLibrary = readFileSync(resolve(args[libraryIndex + 1]), 'utf8').trim()
if (!/^[A-Za-z0-9!_.~-]{4,220}$/.test(financialLibrary) || (process.env.SHAREPOINT_DRIVE_ID && process.env.SHAREPOINT_DRIVE_ID !== financialLibrary)) throw new Error('EVIDENCE_LIBRARY_MISMATCH')
process.env.SHAREPOINT_DRIVE_ID = financialLibrary
const apply = args.includes('--apply')
if (apply && process.env.FINANCE_PHONE_EVIDENCE_STAGING_APPLY !== '1') throw new Error('EVIDENCE_APPLY_OPT_IN_REQUIRED')
const actorFile = process.env.FINANCE_PHONE_EVIDENCE_ACTOR_FILE
if (!actorFile) throw new Error('EVIDENCE_ACTOR_FILE_REQUIRED')
const actorId = Number(readFileSync(actorFile, 'utf8').trim())
const payload = JSON.parse(readFileSync(inputPath, 'utf8'))
if (!Array.isArray(payload.records) || payload.records.length > 500) throw new Error('EVIDENCE_INPUT_INVALID')
const proposals = payload.records.filter((row: any) => row.estado === 'PROPUESTA')
if (proposals.length !== 45 || new Set(proposals.map((row: any) => row.facturaId)).size !== proposals.length || new Set(proposals.map((row: any) => row.pdfSha256)).size !== proposals.length) throw new Error('EVIDENCE_EXPECTED_45_UNIQUE_PROPOSALS')
const pdfDir = join(dirname(inputPath), '11_fija_servicio_unico_pdf_raw_private')
for (const row of proposals) {
  if (!/^[a-f0-9]{64}$/.test(row.pdfSha256) || !/^[6789][0-9]{8}$/.test(row.telefonoNormalizado) || !Number.isSafeInteger(row.baseCentimos) || row.baseCentimos <= 0 || row.metodo !== 'SERVICIO_UNICO_PDF' || !Array.isArray(row.motivos) || row.motivos.length !== 0) throw new Error('EVIDENCE_INVALID_PROPOSAL')
  const bytes = readFileSync(join(pdfDir, row.pdfSha256 + '.pdf'))
  if (bytes.subarray(0, 5).toString() !== '%PDF-' || createHash('sha256').update(bytes).digest('hex') !== row.pdfSha256) throw new Error('EVIDENCE_PDF_HASH_MISMATCH')
}

const originals = ['facturas_recibidas', 'facturas_emitidas', 'facturas', 'contratos_servicio', 'clientes_web', 'imputaciones_coste_cliente', 'movimientos_bancarios', 'documentos_conciliables', 'vinculos_movimiento_documento', 'estado_justificacion_movimientos', 'operaciones_justificacion_b4', 'legado_conciliacion_b4']
async function snapshots(tx: Prisma.TransactionClient) {
  const result: Record<string, unknown> = {}
  for (const table of originals) {
    const rows = await tx.$queryRawUnsafe<Array<{ n: string; hash: string }>>(`SELECT COUNT(*)::text AS n, md5(COALESCE(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM public."${table}" t LIMIT 1`)
    result[table] = rows[0]
  }
  return result
}

async function main() {
  await assertPrototypeStaging()
  const access = await requireB4ActorAccess(actorId, 'escritura')
  if (!access.ok) throw new Error('EVIDENCE_ACTOR_WRITE_PERMISSION_REQUIRED')
  let receipt: Record<string, unknown> | undefined
  try {
    await prisma.$transaction(async tx => {
      const target = await tx.$queryRaw<Array<{ db: string; role: string }>>`SELECT current_database() AS db, current_user AS role LIMIT 1`
      assert.equal(target[0]?.db, 'io_staging_finanzas')
      assert.equal(target[0]?.role, 'io_staging_finanzas')
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('phone_stage_evidence_20261024'))`
      const before = await snapshots(tx)
      const live = await tx.usuarioAdmin.findUnique({ where: { id: actorId }, select: { id: true, activo: true } })
      if (!live?.activo) throw new Error('EVIDENCE_ACTOR_INACTIVE')
      const ids = proposals.map((row: any) => row.facturaId)
      const sources = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT fr.id, fr.proveedor, fr.num_factura AS "numFactura", fr.fecha::date::text AS fecha,
          fr.base::text AS "baseText", fr.total::text AS "totalText", fr.archivo_onedrive AS "archivoOneDrive",
          fr.onedrive_drive_id AS "oneDriveDriveId", fr.onedrive_item_id AS "oneDriveItemId", fr.onedrive_ruta_actual AS "oneDriveRutaActual",
          fr.archivo_url AS "archivoUrl", (${facturaEconomicaSQL('fr')}) AS economica
        FROM facturas_recibidas fr WHERE fr.id IN (${Prisma.join(ids)}) ORDER BY fr.id LIMIT 500 FOR SHARE OF fr
      `)
      const sourceById = new Map(sources.map(row => [row.id, row]))
      const contracts = await tx.$queryRaw<any[]>`SELECT id, cliente_id AS "clienteContratoId", telefonos_contrato AS "telefonosContrato", fecha_inicio::date::text AS "fechaInicio", fecha_baja::date::text AS "fechaBaja", activo FROM contratos_servicio WHERE telefonos_contrato IS NOT NULL ORDER BY id LIMIT 10000`
      const clients = await tx.$queryRaw<any[]>`SELECT id, cliente_id_isp AS "clienteContratoId", isp_gestion_id AS "clienteFacturaIspId", nombre FROM clientes_web WHERE cliente_id_isp IS NOT NULL OR isp_gestion_id IS NOT NULL ORDER BY id LIMIT 10000`
      let inserted = 0, existing = 0, skipped = 0, proposedCents = BigInt(0)
      const reasons: Record<string, number> = {}
      function skip(reason: string) { skipped++; reasons[reason] = (reasons[reason] ?? 0) + 1 }
      for (const row of proposals) {
        const source = sourceById.get(row.facturaId)
        if (!source || source.economica !== true) { skip('FUENTE_AUSENTE_O_NO_ECONOMICA'); continue }
        const pointer = archivoRecibidaControlado(source)
        const proven = provenPointers.get(source.id)
        if (source.numFactura !== row.numeroFactura || source.fecha !== row.fechaFactura || !pointer || !proven || pointer.driveId !== proven.driveId || pointer.itemId !== proven.itemId) { skip('IDENTIDAD_O_ARCHIVO_FUENTE_NO_COINCIDE'); continue }
        const snapshot = { facturaId: source.id, proveedor: source.proveedor, numeroFactura: source.numFactura, fechaFactura: source.fecha, baseFuenteText: source.baseText, totalFuenteText: source.totalText, sourcePointer: { archivoOneDrive: source.archivoOneDrive, oneDriveDriveId: source.oneDriveDriveId, oneDriveItemId: source.oneDriveItemId, oneDriveRutaActual: source.oneDriveRutaActual, archivoUrl: source.archivoUrl } }
        const sourceSnapshotSha256 = phoneCostEvidenceSourceSnapshotSha256(snapshot)
        const evidence: PhoneCostSingleServiceEvidenceInput = { telefono: row.telefonoNormalizado, baseCentimos: String(row.baseCentimos), baseFuenteText: row.baseText, totalFuenteText: row.totalText, pdfSha256: row.pdfSha256, servicioDesde: row.desdeServicio, servicioHasta: row.hastaServicio, numeroFactura: row.numeroFactura, fechaFactura: row.fechaFactura, schema: FORMAT, versionExtractor: FORMAT, telefonosServicio: [row.telefonoNormalizado], sourceSnapshotMatches: true }
        const document: PhoneCostReceivedDocumentInput = { id: source.id, numFactura: source.numFactura, proveedor: source.proveedor, fecha: source.fecha, baseText: source.baseText, totalText: source.totalText, economica: true, telefonoServicio: null, datosOcrRaw: null, lineasDetalleRaw: null, evidenciasServicioUnico: [evidence] }
        const checked = calculatePhoneCostAnalytics({ periodo: { desde: '2026-01-01', hasta: '2026-10-08' }, documentosRecibidos: [document], contratos: contracts, clientes: clients, facturasIsp: [], facturasEmitidasEspejo: [], costesConfirmados: [] })
        const client = checked.clientes.find(item => item.coste.lineasPropuestas === 1)
        if (checked.totales.costeAsignablePropuestoCentimos !== String(row.baseCentimos) || !client || client.cliente.id !== row.clienteId) { skip('IMPORTE_O_VIGENCIA_CLIENTE_NO_REVALIDADOS'); continue }
        const stored = await tx.$queryRaw<any[]>`SELECT evidencia->>'sourceSnapshotSha256' AS snapshot, base_centimos FROM evidencias_coste_telefono_stage WHERE factura_id=${source.id} AND pdf_sha256=${row.pdfSha256} AND version_extractor=${FORMAT} LIMIT 1`
        if (stored.length) {
          if (stored[0].snapshot !== sourceSnapshotSha256 || stored[0].base_centimos !== row.baseCentimos) { skip('EVIDENCIA_PREVIA_DISTINTA_REQUIERE_REVISION'); continue }
          existing++; proposedCents += BigInt(row.baseCentimos); continue
        }
        const metadata = JSON.stringify({ schema: FORMAT, telefonosServicio: [row.telefonoNormalizado], sourceSnapshotSha256, sourceSnapshot: snapshot, remoteSourcePointer: pointer, extractionArtifactSha256: createHash('sha256').update(readFileSync(inputPath)).digest('hex'), pdfVerbatim: row.verbatim, status: 'PROPUESTA', auditoria: 'Evidencia cargada por Manus para prototipo de staging por autorización de Víctor el 24/10/2026; no confirma una asignación ni una conciliación.' })
        await tx.$executeRaw`INSERT INTO evidencias_coste_telefono_stage(factura_id,pdf_sha256,telefono,base_centimos,base_fuente_text,total_fuente_text,numero_factura,fecha_factura,servicio_desde,servicio_hasta,version_extractor,evidencia,creada_por_id) VALUES(${source.id},${row.pdfSha256},${row.telefonoNormalizado},${row.baseCentimos},${row.baseText},${row.totalText},${row.numeroFactura},${row.fechaFactura}::date,${row.desdeServicio}::date,${row.hastaServicio}::date,${FORMAT},${metadata}::jsonb,${actorId})`
        inserted++; proposedCents += BigInt(row.baseCentimos)
      }
      assert.deepEqual(await snapshots(tx), before, 'Original tables changed')
      receipt = { stagingOnly: true, applied: apply, rollback: !apply, candidates: proposals.length, inserted, existing, skipped, reasons, proposedBaseCents: String(proposedCents), originalsPreserved: originals.length, confirmedAssignments: 0, b4LinksCreated: 0 }
      if (!apply) throw new Error('EVIDENCE_EXPECTED_ROLLBACK')
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 10000 })
  } catch (error) {
    if (!(!apply && error instanceof Error && error.message === 'EVIDENCE_EXPECTED_ROLLBACK')) throw error
  }
  if (!receipt) throw new Error('EVIDENCE_RECEIPT_MISSING')
  console.log(JSON.stringify(receipt))
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'EVIDENCE_FAILED'); process.exitCode = 1 }).finally(() => prisma.$disconnect())
