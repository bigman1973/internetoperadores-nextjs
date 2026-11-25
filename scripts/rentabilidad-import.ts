#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { previewImportFile, type ImportFileKind } from '../lib/rentabilidad/importers'
import { RentabilidadError, sourceHash } from '../lib/rentabilidad/types'
import { assertRentabilidadConfiguration, importInitial, normalizeInitialPayload } from '../lib/rentabilidad/store'

/** No .env loading or default production database; operator provides isolated env explicitly. */
export async function main(args = process.argv.slice(2)): Promise<void> {
  const allowed = new Set(['--apply', '--normalized', '--kind', '--sheet'])
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new RentabilidadError('CLI_ARGUMENT_INVALID')
    if (['--kind', '--sheet'].includes(args[i])) { if (!args[i + 1]) throw new RentabilidadError('CLI_ARGUMENT_MISSING'); i++ }
  }
  const file = process.env.RENTABILIDAD_IMPORT_FILE
  if (!file || !isAbsolute(file)) throw new RentabilidadError('PRIVATE_IMPORT_FILE_REQUIRED')
  const location = await realpath(file)
  const repository = await realpath(resolve(fileURLToPath(new URL('..', import.meta.url))))
  const within = relative(repository, location)
  if (!within.startsWith('..') && !isAbsolute(within)) throw new RentabilidadError('IMPORT_FILE_MUST_BE_OUTSIDE_REPOSITORY')
  let payload: any; let preview: any
  if (args.includes('--normalized')) {
    const bytes = await readFile(location)
    if (bytes.length > 40 * 1024 * 1024) throw new RentabilidadError('IMPORT_FILE_TOO_LARGE')
    payload = normalizeInitialPayload(JSON.parse(bytes.toString('utf8')))
    preview = { sourceHash: sourceHash(payload), leidas: Object.values(payload).filter(Array.isArray).reduce((sum: number, rows: any) => sum + rows.length, 0) }
  } else {
    const kind = args[args.indexOf('--kind') + 1]
    if (!args.includes('--kind') || !['contracts', 'lines'].includes(kind)) throw new RentabilidadError('CLI_IMPORT_KIND_REQUIRED')
    const sheet = args.includes('--sheet') ? args[args.indexOf('--sheet') + 1] : undefined
    const result = await previewImportFile(location, kind as ImportFileKind, sheet)
    payload = result.payload; const { payload: ignored, ...summary } = result; preview = summary
  }
  if (!args.includes('--apply')) { console.log(JSON.stringify({ dryRun: true, ...preview })); return }
  if (process.env.RENTABILIDAD_IMPORT_APPROVED !== '1') throw new RentabilidadError('IMPORT_EXPLICIT_APPROVAL_REQUIRED')
  assertRentabilidadConfiguration()
  const report = await importInitial(payload, Number(process.env.RENTABILIDAD_IMPORT_ACTOR_ID))
  console.log(JSON.stringify({ dryRun: false, ...report }))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(JSON.stringify({ error: error instanceof RentabilidadError ? error.code : 'RENTABILIDAD_IMPORT_FAILED' })); process.exitCode = 1 })
}
