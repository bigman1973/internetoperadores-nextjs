import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { requireFacturaAccess, jsonPrivado, AREA_FACTURAS_B2, buscarIdentidadBloqueada } from './invoice-quality-db'
import { requireB4ActorAccess, B4_CONCILIACION_AREA } from './reconciliation-auth'
import { assertPrototypeStaging, assertFinanceEasyRuntime } from './prototype-staging'
import { assertFinanceRuntimeReady } from './finance-runtime-safety'
import { createDocumentosPanelService, DocumentosPanelError, fail } from './documentos-panel-core'
import { createDocumentosPanelStorage } from './documentos-panel-storage'
export { readPanelJson, readPanelMultipart, DOCUMENTOS_PANEL_ROOT, DOCUMENTOS_PANEL_SCOPE, DOCUMENTOS_PANEL_SCHEMA } from './documentos-panel-core'

export function assertDocumentosPanelRequest(req: NextRequest, write = false) {
  if (write && (req.nextUrl.protocol !== 'https:' || req.headers.get('origin') !== req.nextUrl.origin || req.headers.get('sec-fetch-site') !== 'same-origin')) fail(403, 'ORIGIN_INVALIDO', 'HTTPS, Origin exacto y Sec-Fetch-Site same-origin obligatorios.')
  if (req.headers.has('x-io-acting-session') || ['verComo','actingAs','actorId','userId','driveId','itemId','url'].some(key => req.nextUrl.searchParams.has(key))) fail(403, 'ACTING_NOT_ALLOWED', 'No se admite actuación ni pointers del cliente.')
}
function assertRuntimeFlags() {
  if (process.env.FINANCE_STAGING_SANDBOX !== '1' || process.env.VERCEL_ENV === 'production'
    || process.env.IO_PRODUCTION_READ_ONLY === '1' || process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1'
    || [process.env.FINANCE_EASY_PRODUCTION_ENABLED, process.env.FINANCE_MODEL_PRODUCTION_ENABLED].some(flag => flag !== undefined && flag !== '0')) fail(404, 'DOCUMENTOS_PANEL_STAGE_ONLY', 'Panel disponible sólo en Stage aislado y no-readonly.')
}
export async function createDocumentosPanelForRequest(req: NextRequest, write = false, confirm = false) {
  assertDocumentosPanelRequest(req, write)
  let expectedActor: number | null = null
  const guard = async (needsWrite: boolean, needsConfirm: boolean, tx?: Prisma.TransactionClient) => {
    assertRuntimeFlags()
    // Strict B4 prototype classifier + live DB identity, including caller tx.
    await assertPrototypeStaging()
    await assertFinanceRuntimeReady(tx)
    const runtime = await assertFinanceEasyRuntime(tx)
    if (runtime.runtime !== 'staging') fail(404, 'DOCUMENTOS_PANEL_STAGE_ONLY', 'No habilitado en producción.')
    const access = await requireFacturaAccess(needsWrite)
    if ('error' in access) throw access.error
    if (access.session?.impersonation != null || (access.session?.user as any)?.impersonation != null) fail(403, 'ACTING_NOT_ALLOWED', 'Se requiere sesión humana ordinaria sin claims de actuación.')
    if (expectedActor !== null && access.userId !== expectedActor) fail(403, 'ACTOR_CHANGED', 'La identidad cambió durante la acción.')
    expectedActor = access.userId
    const database = tx ?? prisma
    // Locks protect live permission/actor rows through financial writes. No auth mutation.
    if (tx) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM usuarios_admin WHERE id = ${access.userId} FOR SHARE`)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM permiso_usuarios WHERE usuario_id = ${access.userId} FOR SHARE`)
    }
    const b4 = await requireB4ActorAccess(access.userId, needsWrite ? 'escritura' : 'lectura', database)
    if (!b4.ok) throw (b4 as { response: Response }).response
    const facturas = await verificarPermisoServer(access.userId, AREA_FACTURAS_B2, undefined, database)
    // Confirmar is never synthesized from legacy E: both areas need explicit C.
    const conciliacion = await verificarPermisoServer(access.userId, B4_CONCILIACION_AREA, undefined, database)
    if (!(needsWrite ? facturas.escritura : facturas.lectura) || (needsConfirm && (!facturas.confirmar || !conciliacion.confirmar))) fail(403, 'PERMISO_V_E_C', 'Falta permiso vivo V/E o C de confirmación humana en Facturas y Conciliación.')
    assertRuntimeFlags()
    return access.userId
  }
  await guard(write, confirm)
  const provider = createDocumentosPanelStorage(guard)
  const service = createDocumentosPanelService({ db: prisma, guard, provider,
    lock: async (tx, key) => { await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0)) LIMIT 1`) },
    canonical: async (tx, key) => buscarIdentidadBloqueada(tx, key),
  })
  const canWrite = async () => { try { await guard(true, false); return true } catch { return false } }
  const canConfirm = async () => { try { await guard(true, true); return true } catch { return false } }
  return { service, canWrite, canConfirm }
}
export function documentosPanelError(error: unknown) {
  if (error instanceof Response) { error.headers.set('Cache-Control', 'private, no-store'); return error }
  if (error instanceof DocumentosPanelError) return jsonPrivado({ error: error.message, code: error.code }, error.status)
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034') return jsonPrivado({ error: 'Conflicto concurrente. Relea y reintente con la misma solicitud.', code: 'CONCURRENT_CONFLICT' }, 409)
  if ((error as any)?.status === 404) return jsonPrivado({ error: 'Panel no disponible en este entorno.', code: 'DOCUMENTOS_PANEL_STAGE_ONLY' }, 404)
  return jsonPrivado({ error: 'Operación no confirmada. No se declara subida, validación o archivado exitoso sin evidencia.', code: 'DOCUMENTOS_PANEL_FAILURE' }, 503)
}
export { jsonPrivado }
