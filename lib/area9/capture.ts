import { createHash, createPublicKey, verify } from 'node:crypto'
import { Area9Error, objectBody, plainText, publicSafeUrl } from './core'

export const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(',')}}`
  throw new Area9Error(400, 'El recibo contiene un valor no serializable')
}
function hex(value: unknown, length: number, field: string): string {
  if (typeof value !== 'string' || !(new RegExp(`^[0-9a-f]{${length}}$`)).test(value)) throw new Area9Error(400, `${field} inválido`)
  return value
}
function instant(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Area9Error(400, `${field} inválida`)
  return new Date(value).toISOString()
}

export type CaptureContract = {
  version: 1
  provider: 'github' | 'vercel'
  // Contrato administrado por el integrador, NO derivado del recibo ni de una rama.
  scope: string // owner/repo de GitHub o projectId de Vercel
  providerEnvironment: string // valor exacto observado por API autenticada
  environment: 'staging' | 'produccion'
  databaseIdentityHash: string
  verifierPublicKeyPem: string // clave Ed25519 fijada fuera del recibo
  verifiedDeploymentContract: boolean
}
export type CaptureOptions = { expectedSha: string; allowProduction?: boolean; confirmProductionSha?: string; expectedDatabaseIdentityHash: string }
export type MigrationSnapshot = { nombre: string; checksum: string; aplicadaAt: string }
export type CaptureResult = { deploymentKey: string; entorno: 'staging' | 'produccion'; commitHash: string; fechaPublicacion: string; titulo: string; resumen: string; fuente: 'github' | 'vercel'; url: string; migraciones: MigrationSnapshot[]; databaseIdentityHash: string; receiptHash: string }

export function appliedSnapshots(value: unknown): MigrationSnapshot[] {
  if (!Array.isArray(value) || value.length > 100) throw new Area9Error(400, 'Migraciones: se admite un lote de hasta 100 metadatos aplicados')
  const names = new Set<string>()
  const rows: MigrationSnapshot[] = []
  for (const candidate of value) {
    const row = objectBody(candidate)
    if (Object.keys(row).some(key => !['id', 'migration_name', 'checksum', 'finished_at', 'rolled_back_at'].includes(key))) throw new Area9Error(400, 'El recibo de migración solo puede contener metadatos, nunca SQL ni datos')
    // Una migración fallida, en curso o revertida NO se registra como aplicada.
    if (row.finished_at === null || row.rolled_back_at !== null) continue
    const nombre = plainText(row.migration_name, 'Nombre de migración', 255)
    if (!/^[a-zA-Z0-9_-]+$/.test(nombre) || names.has(nombre)) throw new Area9Error(400, 'Migración duplicada o nombre inválido')
    names.add(nombre)
    rows.push({ nombre, checksum: hex(row.checksum, 64, 'Checksum'), aplicadaAt: instant(row.finished_at, 'Fecha de aplicación') })
  }
  return rows.sort((a, b) => a.nombre.localeCompare(b.nombre))
}

/** Sin red, Git, BD, secretos, build ni efectos laterales. No acredita autenticidad sin el verificador fijado. */
export function capturePublication(signedReceipt: unknown, contract: CaptureContract, options: CaptureOptions): CaptureResult {
  if (contract.version !== 1 || contract.verifiedDeploymentContract !== true) throw new Area9Error(409, 'Capturador preparado: falta verificar el contrato real de despliegue')
  if (!['github', 'vercel'].includes(contract.provider) || !['staging', 'produccion'].includes(contract.environment)) throw new Area9Error(400, 'Contrato de proveedor o entorno inválido')
  const expectedSha = hex(options.expectedSha, 40, 'SHA esperado')
  const identity = hex(contract.databaseIdentityHash, 64, 'Identidad de BD')
  if (hex(options.expectedDatabaseIdentityHash, 64, 'Identidad de BD esperada') !== identity) throw new Area9Error(403, 'Identidad de BD no autorizada')
  if (contract.environment === 'produccion' && !(options.allowProduction === true && options.confirmProductionSha === expectedSha)) throw new Area9Error(403, 'Producción requiere dos opt-in explícitos y el SHA exacto; no se escribe ninguna BD')
  const envelope = objectBody(signedReceipt)
  if (Object.keys(envelope).some(key => !['payload', 'signature'].includes(key))) throw new Area9Error(400, 'Formato de recibo inválido')
  const payload = objectBody(envelope.payload)
  const canonical = canonicalJson(payload)
  let verified = false
  try {
    const key = createPublicKey(contract.verifierPublicKeyPem)
    if (key.asymmetricKeyType !== 'ed25519' || typeof envelope.signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.signature)) throw new Error('signature')
    verified = verify(null, Buffer.from(canonical), key, Buffer.from(envelope.signature, 'base64'))
  } catch { /* Nunca imprimir recibo, clave o metadatos internos. */ }
  if (!verified) throw new Area9Error(403, 'El recibo no está firmado por el verificador autorizado')
  if (payload.version !== 1 || payload.provider !== contract.provider || payload.scope !== contract.scope || payload.databaseIdentityHash !== identity
    || payload.verificationMethod !== 'authenticated-provider-read') throw new Area9Error(403, 'El recibo no corresponde al proveedor, alcance o BD autorizados')
  instant(payload.fetchedAt, 'Fecha de verificación')
  const deployment = objectBody(payload.deployment)
  let commitHash: string, publishedAt: string, url: string, deploymentKey: string
  if (contract.provider === 'github') {
    const status = objectBody(payload.status)
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(contract.scope)) throw new Area9Error(400, 'Repositorio inválido')
    if (deployment.environment !== contract.providerEnvironment || deployment.transient_environment !== false
      || deployment.production_environment !== (contract.environment === 'produccion')
      || /preview/i.test(String(deployment.environment)) || /preview/i.test(contract.providerEnvironment)
      || status.state !== 'success' || (status.environment !== undefined && status.environment !== contract.providerEnvironment)) throw new Area9Error(409, 'Solo un deployment exitoso del entorno exacto; preview, push y build no son publicaciones')
    if (typeof deployment.id !== 'number' || !Number.isSafeInteger(deployment.id) || deployment.id < 1 || status.deployment_id !== deployment.id) throw new Area9Error(400, 'El estado no corresponde al deployment')
    commitHash = hex(deployment.sha, 40, 'SHA de deployment')
    publishedAt = instant(status.created_at, 'Fecha del estado exitoso')
    url = publicSafeUrl(status.environment_url || status.deployment_url)
    deploymentKey = `github:${contract.scope}:${deployment.id}`
  } else {
    // No convertir jamás target=preview en staging/producción por branch, alias o flag de CLI.
    const projectId = deployment.projectId ?? (deployment.project && objectBody(deployment.project).id)
    if (projectId !== contract.scope || (deployment.projectId !== undefined && deployment.project && objectBody(deployment.project).id !== deployment.projectId) || deployment.target !== contract.providerEnvironment
      || contract.providerEnvironment !== (contract.environment === 'produccion' ? 'production' : 'staging')
      || deployment.readyState !== 'READY' || /preview/i.test(String(deployment.target))) throw new Area9Error(409, 'Vercel exige target exacto y READY; una preview no se puede reclasificar')
    const meta = objectBody(deployment.meta)
    commitHash = hex(meta.githubCommitSha, 40, 'SHA de deployment')
    if (typeof deployment.ready !== 'number' || !Number.isSafeInteger(deployment.ready) || deployment.ready < 1) throw new Area9Error(400, 'Falta instante READY verificable')
    publishedAt = new Date(deployment.ready).toISOString()
    url = publicSafeUrl(typeof deployment.url === 'string' && !deployment.url.includes('://') ? `https://${deployment.url}` : deployment.url)
    if (typeof deployment.id !== 'string' || !/^dpl_[A-Za-z0-9]{8,100}$/.test(deployment.id)) throw new Area9Error(400, 'Identificador Vercel inválido')
    deploymentKey = `vercel:${contract.scope}:${deployment.id}`
  }
  if (deploymentKey.length > 240 || commitHash !== expectedSha || Date.parse(publishedAt) > Date.parse(String(payload.fetchedAt))) throw new Area9Error(409, 'SHA o fecha no coincide con el deployment verificado')
  const migraciones = appliedSnapshots(payload.migrations)
  if (migraciones.some(row => Date.parse(row.aplicadaAt) > Date.parse(String(payload.fetchedAt)))) throw new Area9Error(409, 'Fecha de migración posterior a su verificación')
  return { deploymentKey, entorno: contract.environment, commitHash, fechaPublicacion: publishedAt,
    titulo: plainText(payload.titulo, 'Título en lenguaje claro', 200), resumen: plainText(payload.resumen, 'Resumen en lenguaje claro', 20_000),
    fuente: contract.provider, url, migraciones, databaseIdentityHash: identity, receiptHash: sha256(canonical) }
}
