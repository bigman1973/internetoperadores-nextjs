import { Prisma } from '@prisma/client'
import { lstatSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import prisma from '../lib/prisma'
import { assertFinanceEasyProduction } from '../lib/finanzas/prototype-staging'

const apply = process.argv.includes('--apply')
const restore = process.argv.includes('--restore')
const allowedArgs = new Set(['--apply', '--restore'])
if (process.argv.slice(2).some(arg => !allowedArgs.has(arg))) throw new Error('PROFILE_ARGUMENT_INVALID')
if (apply && process.env.FINANCE_EASY_PROFILE_PRODUCTION_APPLY !== '1') throw new Error('PROFILE_PRODUCTION_DOUBLE_OPT_IN_REQUIRED')

function privateFile(variable: string): string {
  const value = process.env[variable]
  if (!value) throw new Error(`${variable}_REQUIRED`)
  const path = resolve(value)
  let stat
  try { stat = lstatSync(path) } catch { throw new Error(`${variable}_NOT_PRIVATE`) }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw new Error(`${variable}_NOT_PRIVATE`)
  return path
}

function privateJson(variable: string): Record<string, unknown> {
  const path = privateFile(variable)
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid')
    return value as Record<string, unknown>
  } catch {
    throw new Error(`${variable}_INVALID`)
  }
}

function targetIdentity(value: Record<string, unknown>) {
  const id = value.id
  const email = value.email
  const nombre = value.nombre
  if (!Number.isSafeInteger(id) || Number(id) <= 0 || typeof email !== 'string' || !email.trim() || typeof nombre !== 'string' || !nombre.trim()) throw new Error('PROFILE_TARGET_INVALID')
  return { id: Number(id), email, nombre }
}

function actorIdentity(): number {
  const value = readFileSync(privateFile('FINANCE_EASY_PROFILE_ACTOR_FILE'), 'utf8').trim()
  const actor = Number(value)
  if (!Number.isSafeInteger(actor) || actor <= 0) throw new Error('PROFILE_ACTOR_INVALID')
  return actor
}

function authorization(): string {
  const value = readFileSync(privateFile('FINANCE_EASY_PROFILE_AUTHORIZATION_FILE'), 'utf8').trim()
  if (value.length < 12 || value.length > 300) throw new Error('PROFILE_AUTHORIZATION_INVALID')
  return value
}

function writePrivateReceipt(value: unknown) {
  const output = process.env.FINANCE_EASY_PROFILE_RECEIPT
  if (!output) return
  const destination = resolve(output)
  const directory = dirname(destination)
  let parent
  try { parent = lstatSync(directory) } catch { throw new Error('PROFILE_RECEIPT_DIRECTORY_NOT_PRIVATE') }
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) !== 0) throw new Error('PROFILE_RECEIPT_DIRECTORY_NOT_PRIVATE')
  const temporary = `${destination}.tmp-${process.pid}`
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    renameSync(temporary, destination)
  } catch (error) {
    try { unlinkSync(temporary) } catch { /* no receipt to clean */ }
    throw error
  }
}

async function main() {
  await assertFinanceEasyProduction()
  const target = targetIdentity(privateJson('FINANCE_EASY_PROFILE_TARGET_FILE'))
  const actorId = actorIdentity()
  const instruction = authorization()
  if (actorId === target.id) throw new Error('PROFILE_ACTOR_TARGET_CONFLICT')

  return prisma.$transaction(async tx => {
    const live = await tx.$queryRaw<Array<{ database_name: string; database_user: string }>>`
      SELECT current_database() AS database_name, current_user AS database_user LIMIT 1
    `
    if (live.length !== 1 || live[0].database_name !== 'railway' || live[0].database_user !== 'postgres') throw new Error('PROFILE_PRODUCTION_IDENTITY_MISMATCH')

    const [actor, rows] = await Promise.all([
      tx.usuarioAdmin.findUnique({ where: { id: actorId }, select: { activo: true, rol: true } }),
      tx.usuarioAdmin.findMany({ where: { id: target.id, email: target.email, nombre: target.nombre, activo: true }, select: { id: true, nombre: true, email: true, rol: true, roles: true, perfilAsignado: true, activo: true }, take: 2 }),
    ])
    if (!actor?.activo || !['SUPER_ADMIN', 'GERENTE'].includes(actor.rol)) throw new Error('PROFILE_ACTOR_INVALID')
    if (rows.length !== 1) throw new Error('TARGET_IDENTITY_CHANGED')

    const before = JSON.stringify(rows[0])
    await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtextextended('easy-profile:' || CAST(${target.id} AS text), 0))`
    const previous = await tx.$queryRaw<Array<{ perfil: string; version: number }>>(Prisma.sql`
      SELECT perfil, version FROM perfiles_acceso_modo_facil WHERE usuario_id=${target.id} ORDER BY version DESC LIMIT 1
    `)
    const profile = restore ? 'RESTABLECIDO' : 'MODO_FACIL_ONLY'
    const idempotent = previous[0]?.perfil === profile
    const version = idempotent ? previous[0].version : (previous[0]?.version ?? 0) + 1
    const receipt = { target: 'production', applied: apply, rollback: !apply, idempotent, profile, version, userLegacyUnchanged: true, automaticPoliciesCopied: 0, ownAccountsCopied: 0 }
    // Default mode is a true dry-run: no DML is issued, even transactionally.
    if (!apply) throw Object.assign(new Error('ROLLBACK_OK'), { receipt })
    if (!idempotent) {
      const snapshot = JSON.stringify({
        schema: 'EASY_ACCESS_PRODUCTION_V1',
        previousProfile: previous[0]?.perfil ?? null,
        rolesUnchanged: true,
        previousUser: rows[0],
        scope: ['modo-facil', 'para-pedir', 'private-downloads'],
        automaticPolicyCopied: false,
        ownAccountsCopied: false,
        productionApply: apply,
      })
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO perfiles_acceso_modo_facil(usuario_id,version,perfil,actor_id,instruccion,snapshot)
        VALUES(${target.id},${version},${profile},${actorId},${instruction},CAST(${snapshot} AS jsonb))
      `)
    }
    const after = await tx.usuarioAdmin.findUniqueOrThrow({ where: { id: target.id }, select: { id: true, nombre: true, email: true, rol: true, roles: true, perfilAsignado: true, activo: true } })
    if (JSON.stringify(after) !== before) throw new Error('USER_LEGACY_CHANGED')
    return receipt
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20_000 })
}

main()
  .then(result => { writePrivateReceipt(result); console.log(JSON.stringify(result)) })
  .catch((error: unknown) => {
    if (error instanceof Error && error.message === 'ROLLBACK_OK') {
      const receipt = (error as Error & { receipt: unknown }).receipt
      writePrivateReceipt(receipt)
      console.log(JSON.stringify(receipt))
      return
    }
    console.error(`PRODUCTION_PROFILE_STOPPED:${error instanceof Error ? error.message : 'UNKNOWN'}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
