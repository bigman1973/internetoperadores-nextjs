#!/usr/bin/env -S npx tsx
import { readFile, writeFile } from 'node:fs/promises'
import { capturePublication, sha256, type CaptureContract } from '../lib/area9/capture'
import { Area9Error } from '../lib/area9/core'

// No workflow usa este script. Nunca importamos Prisma ni leemos conexiones en dry-run.
async function jsonFile(path: string | undefined) {
  if (!path) throw new Area9Error(400, 'Falta archivo obligatorio')
  const source = await readFile(path)
  if (source.byteLength > 1_000_000) throw new Area9Error(413, 'Archivo de recibo o contrato demasiado grande')
  return JSON.parse(source.toString('utf8'))
}
async function main() {
  const values: Record<string, string> = {}
  const flags = new Set<string>()
  const booleans = new Set(['--dry-run', '--allow-production', '--write-staging'])
  const named = new Set(['--receipt', '--contract', '--sha', '--expected-db-identity', '--confirm-production-sha', '--output'])
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (booleans.has(key)) { if (flags.has(key)) throw new Area9Error(400, 'Argumento duplicado'); flags.add(key); continue }
    if (!named.has(key) || values[key] !== undefined || !args[i + 1] || args[i + 1].startsWith('--')) throw new Area9Error(400, 'Argumentos inválidos')
    values[key] = args[++i]
  }
  if (flags.has('--dry-run') && flags.has('--write-staging')) throw new Area9Error(400, 'dry-run y write-staging son incompatibles')
  const contract = await jsonFile(values['--contract']) as CaptureContract
  const publication = capturePublication(await jsonFile(values['--receipt']), contract, {
    expectedSha: values['--sha'], expectedDatabaseIdentityHash: values['--expected-db-identity'],
    allowProduction: flags.has('--allow-production'), confirmProductionSha: values['--confirm-production-sha'],
  })
  if (!flags.has('--write-staging')) {
    const candidate = JSON.stringify({ dryRun: true, registrado: false, publication }, null, 2) + '\n'
    if (values['--output']) await writeFile(values['--output'], candidate, { flag: 'wx', mode: 0o600 })
    else process.stdout.write(candidate)
    return
  }
  // ÚNICA rama que puede escribir: futuro staging aislado existente, explícitamente autorizado.
  // No permite producción ni usa DATABASE_URL, DB_*, secretos comunes o fallbacks.
  if (publication.entorno !== 'staging' || flags.has('--allow-production') || values['--confirm-production-sha']) throw new Area9Error(403, 'El registrador solo admite staging; producción permanece desactivada')
  const connection = process.env.AREA9_ISOLATED_STAGING_DATABASE_URL
  if (!connection) throw new Area9Error(403, 'Falta conexión exclusiva de staging aislado')
  let url: URL
  try { url = new URL(connection) } catch { throw new Area9Error(403, 'Conexión de staging inválida') }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) || url.pathname !== '/io_staging_finanzas' || decodeURIComponent(url.username) !== 'io_staging_finanzas') throw new Area9Error(403, 'La BD y usuario deben ser io_staging_finanzas, exclusivos y aislados')
  const identity = sha256(JSON.stringify({ host: url.hostname.toLowerCase(), port: url.port || '5432', database: 'io_staging_finanzas', user: 'io_staging_finanzas' }))
  if (identity !== publication.databaseIdentityHash) throw new Area9Error(403, 'Identidad de staging no coincide con el recibo autorizado')
  const { PrismaClient, Prisma } = await import('@prisma/client')
  const db = new PrismaClient({ datasources: { db: { url: connection } }, log: [] })
  try {
    const live = await db.$queryRaw<Array<{ database: string; user: string }>>`SELECT current_database() AS database, current_user AS user LIMIT 1`
    if (live[0]?.database !== 'io_staging_finanzas' || live[0]?.user !== 'io_staging_finanzas') throw new Area9Error(403, 'Identidad viva de staging no verificada')
    // Lectura real: jamás insertar instantáneas tomadas solo de archivos preparados.
    const applied = await db.$queryRaw<Array<{ nombre: string; checksum: string; aplicadaAt: Date }>>(Prisma.sql`
      SELECT migration_name AS nombre, checksum, finished_at AS "aplicadaAt" FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC, id DESC LIMIT 100
    `)
    for (const snapshot of publication.migraciones) {
      if (!applied.some(row => row.nombre === snapshot.nombre && row.checksum === snapshot.checksum && row.aplicadaAt.toISOString() === snapshot.aplicadaAt)) throw new Area9Error(409, 'Una migración del recibo no coincide con las realmente aplicadas en staging')
    }
    const outcome = await db.$transaction(async tx => {
      const existing = await tx.area9Publicacion.findUnique({ where: { deploymentKey: publication.deploymentKey } })
      if (existing) {
        if (existing.entorno !== publication.entorno || existing.commitHash !== publication.commitHash || existing.url !== publication.url || existing.fechaPublicacion.toISOString() !== publication.fechaPublicacion) throw new Area9Error(409, 'El deployment ya existe con otra evidencia; no se altera el ledger')
        return { id: existing.id, creado: false }
      }
      const created = await tx.area9Publicacion.create({ data: {
        deploymentKey: publication.deploymentKey, entorno: 'staging', commitHash: publication.commitHash,
        fechaPublicacion: new Date(publication.fechaPublicacion), titulo: publication.titulo, resumen: publication.resumen,
        fuente: publication.fuente, url: publication.url, migraciones: publication.migraciones,
      } })
      for (const migration of publication.migraciones) {
        const already = await tx.area9Migracion.findUnique({ where: { databaseKey_nombre_checksum: { databaseKey: identity, nombre: migration.nombre, checksum: migration.checksum } }, select: { id: true } })
        if (!already) await tx.area9Migracion.create({ data: { databaseKey: identity, entorno: 'staging', nombre: migration.nombre,
          checksum: migration.checksum, aplicadaAt: new Date(migration.aplicadaAt), publicacionId: created.id } })
      }
      return { id: created.id, creado: true }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    process.stdout.write(JSON.stringify({ dryRun: false, registrado: true, entorno: 'staging', ...outcome }) + '\n')
  } finally { await db.$disconnect() }
}
main().catch(error => {
  // Errores técnicos nunca contienen conexión, SQL, recibos ni filas.
  process.stderr.write((error instanceof Area9Error ? error.message : 'No se pudo validar o registrar el recibo de Área9.') + '\n')
  process.exitCode = 1
})
