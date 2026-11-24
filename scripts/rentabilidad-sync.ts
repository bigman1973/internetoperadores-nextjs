#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appendRun, assertRentabilidadConfiguration, importInitial } from '../lib/rentabilidad/store'
import { ispAvailability, readConfiguredLineExport } from '../lib/rentabilidad/isp'
import { actorSchema, RentabilidadError } from '../lib/rentabilidad/types'

export async function main(): Promise<void> {
  // Finite application job, not a scheduler and never runs just by importing this module.
  assertRentabilidadConfiguration()
  if (process.env.RENTABILIDAD_SYNC_APPROVED !== '1') throw new RentabilidadError('SYNC_EXPLICIT_APPROVAL_REQUIRED')
  const actorId = actorSchema.parse(Number(process.env.RENTABILIDAD_SYSTEM_ACTOR_ID))
  const available = ispAvailability()
  if (!available.lines) {
    await appendRun({ actorId, process: 'ISP_LINE_EXPORT', estado: 'BLOQUEADO', reason: available.reason, contracts: false, lines: false, processed: 0 })
    console.log(JSON.stringify({ estado: 'BLOQUEADO', reason: available.reason, processed: 0 }))
    process.exitCode = 2; return
  }
  try {
    const input = await readConfiguredLineExport()
    const report = await importInitial({ ...input.payload, products: [], rules: [] }, actorId)
    await appendRun({ actorId, process: 'ISP_LINE_EXPORT', estado: report.rechazadas ? 'REVISION' : 'COMPLETADO', sourceHash: input.sourceHash, report })
    console.log(JSON.stringify({ estado: report.rechazadas ? 'REVISION' : 'COMPLETADO', ...report }))
  } catch (error) {
    const code = error instanceof RentabilidadError ? error.code : 'ISP_EXPORT_FAILED'
    await appendRun({ actorId, process: 'ISP_LINE_EXPORT', estado: 'BLOQUEADO', reason: code, processed: 0 })
    throw new RentabilidadError(code, 503)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ error: error instanceof RentabilidadError ? error.code : 'RENTABILIDAD_SYNC_FAILED' })); process.exitCode = 1 })
}
