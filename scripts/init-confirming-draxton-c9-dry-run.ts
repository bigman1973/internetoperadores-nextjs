import 'dotenv/config'
import crypto from 'node:crypto'
import prisma from '../lib/prisma'
import { assertFinanceStagingIsolated } from '../lib/finanzas/staging-safety'
import {
  CARPETA_CONFIRMING_DRAXTON_2026,
  evidenciaRutaConfirmingDraxton,
  proponerClasificacionConfirmingDraxton,
} from '../lib/finanzas/confirming-draxton-core'

/**
 * C9 candidato — sólo lectura, sin Graph/OneDrive, sin OCR, sin DML.
 *
 * Censa fuentes que pudieron llegar a facturas_recibidas antes de la corrección.
 * Incluye carpeta/ruta actual e historial B1; no cambia las 43 fuentes ni crea
 * soportes. Tras aplicar la migración, la ruta UI/backend deberá confirmar cada
 * propuesta explícitamente, dentro de una transacción serializable y auditada.
 *
 * FINANCE_STAGING_SANDBOX=1 node node_modules/tsx/dist/cli.mjs \
 *   scripts/init-confirming-draxton-c9-dry-run.ts
 */

type Row = {
  id: string
  oneDriveItemId: string | null
  oneDriveDriveId: string | null
  carpetaOrigen: string | null
  archivoOneDrive: string | null
  oneDriveRutaActual: string | null
  naturalezaDocumento: string | null
  tipoSoporteFinanciero: string | null
}
type Historial = { facturaId: string; anterior: unknown; actual: unknown }

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

async function main() {
  await assertFinanceStagingIsolated()
  const before = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`
    SELECT current_database() AS db, current_user AS usuario
  `
  if (before[0]?.db !== 'io_staging_finanzas' || before[0]?.usuario !== 'io_staging_finanzas') throw new Error('C9_STAGING_ISOLATION_REQUIRED')

  // No use `contains Confirming`: B1 route evidence is the canonical 2026 segment.
  // A broad candidate read is necessary only to recover sources moved after import;
  // the pure classifier rejects every row without exact actual/historical evidence.
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, onedrive_item_id AS "oneDriveItemId", onedrive_drive_id AS "oneDriveDriveId",
      carpeta_origen AS "carpetaOrigen", archivo_onedrive AS "archivoOneDrive",
      onedrive_ruta_actual AS "oneDriveRutaActual",
      naturaleza_documento::text AS "naturalezaDocumento",
      tipo_soporte_financiero::text AS "tipoSoporteFinanciero"
    FROM facturas_recibidas
    WHERE naturaleza_documento = 'FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
    ORDER BY id ASC
  `
  const history = await prisma.$queryRaw<Historial[]>`
    SELECT factura_id AS "facturaId", anterior, actual
    FROM historial_ubicaciones_facturas_recibidas
    ORDER BY factura_id ASC, created_at ASC, id ASC
  `
  const historyByInvoice = new Map<string, Array<{ anterior: unknown; actual: unknown }>>()
  for (const event of history) {
    const events = historyByInvoice.get(event.facturaId) ?? []
    events.push({ anterior: event.anterior, actual: event.actual })
    historyByInvoice.set(event.facturaId, events)
  }

  const propuestas = [] as Array<Record<string, unknown>>
  const descartadas = { sinRutaExacta: 0, yaClasificada: 0 }
  for (const row of rows) {
    if (row.naturalezaDocumento !== 'FACTURA_RECIBIDA') { descartadas.yaClasificada++; continue }
    const evidencia = evidenciaRutaConfirmingDraxton(row, historyByInvoice.get(row.id) ?? [])
    const propuesta = proponerClasificacionConfirmingDraxton({ fuente: { ...row, facturaRecibidaId: row.id }, historial: historyByInvoice.get(row.id) ?? [] })
    if ('codigo' in propuesta) { descartadas.sinRutaExacta++; continue }
    propuestas.push({
      facturaRecibidaId: propuesta.value.facturaRecibidaId,
      naturalezaPropuesta: propuesta.value.naturalezaDocumento,
      tipoSoportePropuesto: propuesta.value.tipoSoporteFinanciero,
      fuenteHash: propuesta.value.fuenteHash,
      evidenciaActual: evidencia.actual,
      evidenciaHistorica: evidencia.historica,
      rutasActuales: evidencia.rutasActuales,
      rutasHistoricas: evidencia.rutasHistoricas,
      // Deliberadamente no hay importes OCR, base, IVA, total, gasto ni factura emitida.
      requiereConfirmacionHumana: true,
    })
  }
  const result = {
    modo: 'SOLO_LECTURA_DRY_RUN',
    carpetaExacta: CARPETA_CONFIRMING_DRAXTON_2026,
    candidatas: propuestas.length,
    descartadas,
    hashPropuestas: sha256(propuestas),
    propuestas,
    garantia: 'No se ejecutó INSERT/UPDATE/DELETE, no se llamó a Graph y no se leyó ni fabricó importe alguno.',
  }
  console.log(JSON.stringify(result, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'C9_DRY_RUN_FAILED')
  process.exitCode = 1
}).finally(() => prisma.$disconnect())
