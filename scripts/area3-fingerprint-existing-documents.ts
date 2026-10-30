/*
 * Area 3 — huellas SHA-256 de bytes de documentos recibidos ya existentes.
 *
 * Fases deliberadamente separadas:
 * - por defecto DRY_RUN: valida un manifiesto privado y fuentes actuales, sin DML;
 * - --read-existing-files: sólo lee exactos itemId existentes mediante el preview
 *   autorizado, SHA-256 en memoria, y escribe un manifiesto privado sin bytes;
 * - --apply: sólo inserta metadatos Area 3 y exige FINANCE_AREA3_FINGERPRINT_APPLY=1.
 *
 * --read-existing-files y --apply son incompatibles. El CLI nunca lista carpetas,
 * no llama Graph directamente, no sigue archivo_url, no actualiza facturas ni usa
 * snapshots/artifacts. El endpoint heredado sólo se invoca por itemId existente;
 * el padre debe suministrar cookie de admin y origen preview exactos.
 *
 * Manifiesto privado exacto:
 * {
 *   "schema":"AREA3_EXISTING_DOCUMENT_BYTES_V1",
 *   "database":"io_staging_finanzas",
 *   "complete":true,
 *   "entries":[{
 *     "invoiceId":"...","sourceItemId":"...","sourceDriveId":null|"...",
 *     "sourceUpdatedAt":"2026-...Z","readOrigin":"AREA3_PREVIEW_EXISTING_FILE_V1",
 *     "readAt":"2026-...Z","status":"HASHED","sha256":"[64 hex]","byteLength":123
 *   }]
 * }
 * Una entrada UNREADABLE omite sha256/byteLength y añade reason. Nunca genera un
 * hash, duplicado o insert fabricado.
 *
 * Ejemplos (padre, tras backup y coordinación):
 *   npx tsx scripts/area3-fingerprint-existing-documents.ts --manifest /privado/area3.json
 *   AREA3_PREVIEW_ORIGIN=https://preview.example AREA3_PREVIEW_COOKIE='...' \
 *     npx tsx scripts/area3-fingerprint-existing-documents.ts --read-existing-files --manifest /privado/area3.json
 *   FINANCE_AREA3_FINGERPRINT_APPLY=1 npx tsx scripts/area3-fingerprint-existing-documents.ts --apply --manifest /privado/area3.json
 */
import 'dotenv/config'
import { readFile, writeFile } from 'node:fs/promises'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN,
  AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA,
  AREA3_STAGING_DATABASE,
  area3ManifestCoverage,
  area3StagingRuntimeAllowed,
  parseArea3ExistingDocumentBytesManifest,
  type Area3ExistingDocumentBytesManifest,
  type Area3ExistingDocumentBytesManifestEntry,
} from '@/lib/finanzas/area3-document-fingerprints-core'
import {
  applyArea3ReceivedDocumentHashObservationsTx,
  observationsFromArea3ManifestEntries,
  validateArea3ExistingDocumentManifestSourcesTx,
} from '@/lib/finanzas/area3-document-fingerprints-db'
import {
  createArea3PreviewExistingFileFetch,
  readArea3ExistingDocumentBytes,
  type Area3ExistingDocumentReadSource,
} from '@/lib/finanzas/area3-document-fingerprints-reader'

const MAX_MANIFEST_BYTES = 5 * 1024 * 1024
const MAX_SOURCES = 10_000
const ALLOWED_FLAGS = new Set(['--apply', '--manifest', '--read-existing-files'])
type CliOptions = Readonly<{ apply: boolean; manifestPath: string; readExistingFiles: boolean }>
type StoredReadSource = Readonly<Area3ExistingDocumentReadSource & { hasStoredDrive: boolean }>

function fail(code: string): never { throw new Error(code) }
function safeIso(value: Date | string | null): string | null {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null
}

export function parseArea3FingerprintCli(argv: readonly string[]): CliOptions {
  let apply = false
  let manifestPath: string | null = null
  let readExistingFiles = false
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (!ALLOWED_FLAGS.has(argument)) fail('AREA3_CLI_ARGUMENT_INVALID')
    if (argument === '--apply') {
      if (apply) fail('AREA3_CLI_ARGUMENT_INVALID')
      apply = true
      continue
    }
    if (argument === '--read-existing-files') {
      if (readExistingFiles) fail('AREA3_CLI_ARGUMENT_INVALID')
      readExistingFiles = true
      continue
    }
    const value = argv[index + 1]
    if (!value || value.startsWith('--') || manifestPath) fail('AREA3_CLI_MANIFEST_REQUIRED')
    manifestPath = value
    index += 1
  }
  if (!manifestPath) fail('AREA3_CLI_MANIFEST_REQUIRED')
  if (apply && readExistingFiles) fail('AREA3_CLI_READ_AND_APPLY_MUST_BE_SEPARATE')
  return { apply, manifestPath, readExistingFiles }
}

async function readManifest(path: string): Promise<Area3ExistingDocumentBytesManifest> {
  if (!path || path.length > 4096 || path.includes('\u0000')) fail('AREA3_MANIFEST_PATH_INVALID')
  const content = await readFile(path)
  if (content.byteLength < 2 || content.byteLength > MAX_MANIFEST_BYTES) fail('AREA3_MANIFEST_FILE_SIZE_INVALID')
  let parsed: unknown
  try { parsed = JSON.parse(content.toString('utf8')) } catch { fail('AREA3_MANIFEST_JSON_INVALID') }
  return parseArea3ExistingDocumentBytesManifest(parsed)
}

function runtimeAllowed(): boolean {
  return area3StagingRuntimeAllowed({
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    databaseUrl: process.env.DATABASE_URL,
    easyProductionEnabled: process.env.FINANCE_EASY_PRODUCTION_ENABLED,
    modelProductionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    conciliarProductionEnabled: process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED,
    publicConciliarProductionEnabled: process.env.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED,
  })
}

async function exactStagingIdentity(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ database: string; user: string }>>(Prisma.sql`
    SELECT current_database() AS database,current_user AS "user"
  `)
  if (rows.length !== 1 || rows[0]?.database !== AREA3_STAGING_DATABASE || rows[0]?.user !== 'io_staging_finanzas') fail('AREA3_STAGING_IDENTITY_REQUIRED')
}

/** Exactly stored IDs/timestamps only; no path, URL, name, search or Graph metadata. */
async function readExactExistingSources(): Promise<readonly StoredReadSource[]> {
  const rows = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
    return tx.$queryRaw<Array<{ invoiceId: string; sourceItemId: string | null; sourceDriveId: string | null; sourceUpdatedAt: Date | string | null }>>(Prisma.sql`
      SELECT f.id::text AS "invoiceId",f.onedrive_item_id AS "sourceItemId",f.onedrive_drive_id AS "sourceDriveId",f.updated_at AS "sourceUpdatedAt"
      FROM facturas_recibidas f
      WHERE f.onedrive_item_id IS NOT NULL
      ORDER BY f.id ASC
      LIMIT ${MAX_SOURCES}
    `)
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 })
  if (rows.length >= MAX_SOURCES) fail('AREA3_READER_SOURCE_LIMIT_REACHED')
  return rows.map(row => {
    const sourceUpdatedAt = safeIso(row.sourceUpdatedAt)
    if (!row.invoiceId || !row.sourceItemId || !sourceUpdatedAt) fail('AREA3_READER_SOURCE_INVALID')
    return { invoiceId: row.invoiceId, sourceItemId: row.sourceItemId, sourceDriveId: row.sourceDriveId, sourceUpdatedAt, hasStoredDrive: row.sourceDriveId !== null }
  })
}

function blockedEntry(source: StoredReadSource, reason: string): Area3ExistingDocumentBytesManifestEntry {
  return {
    invoiceId: source.invoiceId, sourceItemId: source.sourceItemId, sourceDriveId: source.sourceDriveId,
    sourceUpdatedAt: source.sourceUpdatedAt, readOrigin: AREA3_PREVIEW_EXISTING_FILE_READ_ORIGIN,
    readAt: new Date().toISOString(), status: 'UNREADABLE', reason,
  }
}

async function writeReadManifest(path: string, configuredDriveId: string | null): Promise<Area3ExistingDocumentBytesManifest> {
  const sources = await readExactExistingSources()
  // The legacy preview handler's direct item branch itself requires this exact
  // configured drive. Never let it fall through to its old dynamic site/drive
  // discovery branch, even where a historical per-row drive happens to exist.
  const readable = configuredDriveId === null ? [] : sources
  const blocked = configuredDriveId === null ? sources : []
  const previewOrigin = process.env.AREA3_PREVIEW_ORIGIN?.trim()
  const cookie = process.env.AREA3_PREVIEW_COOKIE
  if (readable.length && (!previewOrigin || !cookie)) fail('AREA3_PREVIEW_READER_CREDENTIALS_REQUIRED')
  const read = readable.length
    ? await readArea3ExistingDocumentBytes({
        sources: readable.map(({ hasStoredDrive: _ignored, ...source }) => source),
        fetchExistingFile: createArea3PreviewExistingFileFetch({ previewOrigin: previewOrigin!, cookie: cookie! }),
      })
    : { schema: AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA, database: AREA3_STAGING_DATABASE, complete: true as const, entries: [] as readonly Area3ExistingDocumentBytesManifestEntry[] }
  const manifest: Area3ExistingDocumentBytesManifest = {
    schema: AREA3_EXISTING_DOCUMENT_BYTES_MANIFEST_SCHEMA,
    database: AREA3_STAGING_DATABASE,
    complete: true,
    entries: [...read.entries, ...blocked.map(source => blockedEntry(source, 'BLOCKED_CONFIGURED_DRIVE_MISSING'))].sort((left, right) => left.invoiceId.localeCompare(right.invoiceId)),
  }
  // `wx` prohibits overwriting an existing private hand-off accidentally. A
  // fresh, explicit path is required for every finite observation run.
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
  return manifest
}

function concise(manifest: Area3ExistingDocumentBytesManifest, validation: readonly { valid: boolean; code: string }[], mode: 'DRY_RUN' | 'APPLY' | 'READ_EXISTING_FILES_MANIFEST_ONLY', inserted = 0, replayed = 0) {
  const coverage = area3ManifestCoverage(manifest)
  const invalid = validation.filter(row => !row.valid)
  const sourceBlocksByCode = invalid.reduce<Record<string, number>>((result, row) => {
    result[row.code] = (result[row.code] ?? 0) + 1
    return result
  }, {})
  return {
    mode, schema: manifest.schema, database: manifest.database, complete: manifest.complete,
    coverage: { ...coverage, sourceChangedOrBlocked: invalid.length, sourceBlocksByCode },
    observationsEligible: manifest.entries.filter(entry => entry.status === 'HASHED').length,
    persisted: { inserted, replayed },
    guarantees: [
      'Sólo se persisten metadatos Area 3; no se guardan bytes.',
      'No se llama Graph directamente, no se listan carpetas y no se usa archivo_url.',
      'No se modifican facturas, importes, estados, B4 ni document_version_snapshots.',
      'Las entradas UNREADABLE no generan hash, coincidencia ni inserción.',
      'No se fusiona ni elimina ningún documento.',
    ],
  }
}

async function main() {
  const options = parseArea3FingerprintCli(process.argv.slice(2))
  if (!runtimeAllowed()) fail('AREA3_STAGING_RUNTIME_REQUIRED')
  if (options.apply && process.env.FINANCE_AREA3_FINGERPRINT_APPLY !== '1') fail('AREA3_APPLY_DOUBLE_OPT_IN_REQUIRED')
  const configuredDriveId = process.env.SHAREPOINT_DRIVE_ID?.trim() || null
  await exactStagingIdentity()

  if (options.readExistingFiles) {
    const manifest = await writeReadManifest(options.manifestPath, configuredDriveId)
    console.log(JSON.stringify({ manifestPath: options.manifestPath, ...concise(manifest, [], 'READ_EXISTING_FILES_MANIFEST_ONLY') }, null, 2))
    return
  }

  const manifest = await readManifest(options.manifestPath)
  if (!options.apply) {
    const validation = await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
      return validateArea3ExistingDocumentManifestSourcesTx({ tx, entries: manifest.entries, configuredDriveId })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 })
    console.log(JSON.stringify(concise(manifest, validation, 'DRY_RUN'), null, 2))
    return
  }

  const observations = observationsFromArea3ManifestEntries(manifest.entries)
  const result = await prisma.$transaction(async tx => {
    const validation = await validateArea3ExistingDocumentManifestSourcesTx({ tx, entries: manifest.entries, configuredDriveId })
    if (validation.some(row => !row.valid)) fail('AREA3_APPLY_SOURCE_CHANGED_OR_BLOCKED')
    const persisted = await applyArea3ReceivedDocumentHashObservationsTx({ tx, entries: manifest.entries, observations, configuredDriveId })
    return { validation, persisted }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 })
  console.log(JSON.stringify(concise(manifest, result.validation, 'APPLY', result.persisted.inserted, result.persisted.replayed), null, 2))
}

if (process.argv[1]?.endsWith('area3-fingerprint-existing-documents.ts')) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'AREA3_FINGERPRINT_FAILED')
    process.exitCode = 1
  }).finally(() => prisma.$disconnect())
}
