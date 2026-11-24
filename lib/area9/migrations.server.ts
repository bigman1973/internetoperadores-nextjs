import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { Area9Error } from './core'

type Applied = { id: string; nombre: string; checksum: string; aplicadaAt: Date }
// Solo metadatos. Nunca SELECT *, logs, SQL de migraciones ni datos de negocio.
export async function readAppliedMigrations(page: { page: number; limit: number; skip: number }) {
  const [aplicadas, count] = await Promise.all([
    prisma.$queryRaw<Applied[]>(Prisma.sql`
      SELECT id, migration_name AS nombre, checksum, finished_at AS "aplicadaAt"
      FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY finished_at DESC, id DESC LIMIT ${page.limit} OFFSET ${page.skip}
    `),
    prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS total FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL LIMIT 1
    `),
  ])
  let directories: string[]
  const base = join(process.cwd(), 'prisma', 'migrations')
  try {
    directories = (await readdir(base, { withFileTypes: true }))
      .filter(entry => entry.isDirectory() && /^[0-9][a-zA-Z0-9_-]{1,254}$/.test(entry.name))
      .map(entry => entry.name).sort().reverse()
  } catch { throw new Area9Error(503, 'No se pudo comprobar el inventario de migraciones preparadas') }
  const preparedNames = directories.slice(page.skip, page.skip + page.limit)
  const appliedForPrepared = preparedNames.length ? await prisma.$queryRaw<Applied[]>(Prisma.sql`
    SELECT id, migration_name AS nombre, checksum, finished_at AS "aplicadaAt"
    FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      AND migration_name IN (${Prisma.join(preparedNames)})
    ORDER BY finished_at DESC, id DESC LIMIT 100
  `) : []
  const matching = new Map<string, Applied>()
  for (const row of appliedForPrepared) if (!matching.has(row.nombre)) matching.set(row.nombre, row)
  const preparadas = await Promise.all(preparedNames.map(async nombre => {
    let checksum: string
    try { checksum = createHash('sha256').update(await readFile(join(base, nombre, 'migration.sql'))).digest('hex') }
    catch { return { nombre, checksum: null, estado: 'no_verificable' as const, aplicadaAt: null } }
    const applied = matching.get(nombre)
    return { nombre, checksum, estado: applied ? (applied.checksum === checksum ? 'aplicada' as const : 'checksum_distinto' as const) : 'preparada' as const,
      aplicadaAt: applied?.aplicadaAt ?? null }
  }))
  return { registros: aplicadas.map(row => ({ ...row, estado: 'aplicada' })), total: count[0]?.total ?? 0,
    preparadas, totalPreparadas: directories.length, ...page,
    fuente: '_prisma_migrations', nota: 'Aplicada exige finished_at y ausencia de rolled_back_at. Un archivo preparado no acredita aplicación.' }
}
