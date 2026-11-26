import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { requireArea4Capability } from '@/lib/area4/live-admin'
import { jsonPrivado, AREA_FACTURAS_B2, buscarIdentidadBloqueada } from './invoice-quality-db'
import { B4_CONCILIACION_AREA } from './reconciliation-auth'
import { assertPrototypeStaging, assertFinanceEasyRuntime } from './prototype-staging'
import { assertFinanceRuntimeReady } from './finance-runtime-safety'
import { createDocumentosPanelService, DocumentosPanelError, fail } from './documentos-panel-core'
import { createDocumentosPanelStorage } from './documentos-panel-storage'
import { assertDocumentosPanelRuntime, documentosPanelProductionPins, type DocumentosRuntime } from './documentos-panel-runtime'
import { assertDocumentosProductionTransportConfigured } from './documentos-production-selected'
export { readPanelJson, readPanelMultipart, DOCUMENTOS_PANEL_ROOT, DOCUMENTOS_PANEL_SCOPE, DOCUMENTOS_PANEL_SCHEMA } from './documentos-panel-core'

export function assertDocumentosPanelRequest(req: NextRequest, write = false) {
  if (write && (req.nextUrl.protocol !== 'https:' || req.headers.get('origin') !== req.nextUrl.origin || req.headers.get('sec-fetch-site') !== 'same-origin')) fail(403, 'ORIGIN_INVALIDO', 'HTTPS, Origin exacto y Sec-Fetch-Site same-origin obligatorios.')
  if (req.headers.has('next-action') || req.headers.has('x-io-acting-session') || ['verComo','actingAs','actorId','userId','driveId','itemId','url'].some(key => req.nextUrl.searchParams.has(key))) fail(403, 'ACTING_NOT_ALLOWED', 'No se admite actuación ni pointers del cliente.')
}
/** Registry is the native authority for each NEW route and capability. No duplicate
 * role/profile grants: Lorena's MODO_FACIL_ONLY is not changed by this service. */
export async function createDocumentosPanelForRequest(req: NextRequest, write = false, confirm = false) {
  assertDocumentosPanelRequest(req, write)
  let expectedActor: number | null = null
  let expectedRuntime: DocumentosRuntime | null = null
  const guard = async (needsWrite: boolean, needsConfirm: boolean, tx?: Prisma.TransactionClient, surfacePath = req.nextUrl.pathname) => {
    const context = assertDocumentosPanelRuntime(needsWrite)
    if (expectedRuntime && (context.environment !== expectedRuntime.environment || context.root !== expectedRuntime.root)) fail(403, 'RUNTIME_CHANGED', 'El entorno documental cambió durante la acción.')
    expectedRuntime = context
    if (context.stageOnly) {
      await assertPrototypeStaging()
      const runtime = await assertFinanceEasyRuntime(tx)
      if (runtime.runtime !== 'staging') fail(404, 'DOCUMENTOS_PANEL_STAGE_ONLY', 'Stage no aislado.')
    } else {
      if (req.nextUrl.protocol !== 'https:' || req.headers.get('sec-fetch-site') !== 'same-origin' || (req.headers.has('origin') && req.headers.get('origin') !== req.nextUrl.origin)) fail(403, 'ORIGIN_INVALIDO', 'Lectura Production sólo HTTPS same-origin.')
      // Static readiness only. Token roles/resource access are enforced by the
      // dedicated transport before Graph; no authentication on list/import.
      if (needsWrite) assertDocumentosProductionTransportConfigured()
    }
    await assertFinanceRuntimeReady(tx)
    const database = tx ?? prisma
    const access = await requireArea4Capability(database, AREA_FACTURAS_B2, 'lectura', surfacePath)
    if ('response' in access) throw access.response
    if (access.session?.impersonation != null || (access.session?.user as any)?.impersonation != null) fail(403, 'ACTING_NOT_ALLOWED', 'Se requiere sesión humana ordinaria sin claims de actuación.')
    const actorId = access.principal.id
    if (expectedActor !== null && actorId !== expectedActor) fail(403, 'ACTOR_CHANGED', 'La identidad cambió durante la acción.')
    expectedActor = actorId
    if (tx) {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM usuarios_admin WHERE id = ${actorId} FOR SHARE`)
      await tx.$queryRaw(Prisma.sql`SELECT id FROM permiso_usuarios WHERE usuario_id = ${actorId} FOR SHARE`)
    }
    // Recheck exact NEW surface consent for E/C, never infer C from E or role.
    for (const capability of [...(needsWrite ? ['escritura' as const] : []), ...(needsConfirm ? ['confirmar' as const] : [])]) {
      const grant = await requireArea4Capability(database, AREA_FACTURAS_B2, capability, surfacePath)
      if ('response' in grant) throw grant.response
      if (grant.principal.id !== actorId || grant.session?.impersonation != null || (grant.session?.user as any)?.impersonation != null) fail(403, 'ACTOR_CHANGED', 'La identidad cambió durante la acción.')
    }
    const facturas = await verificarPermisoServer(actorId, AREA_FACTURAS_B2, undefined, database)
    const conciliacion = await verificarPermisoServer(actorId, B4_CONCILIACION_AREA, undefined, database)
    if (!facturas.lectura || !conciliacion.lectura || (needsWrite && (!facturas.escritura || !conciliacion.escritura)) || (needsConfirm && (!facturas.confirmar || !conciliacion.confirmar))) fail(403, 'PERMISO_V_E_C', 'Falta permiso vivo V/E o C de confirmación humana en Facturas y Conciliación.')
    assertDocumentosPanelRuntime(needsWrite)
    return actorId
  }
  await guard(write, confirm)
  const context = expectedRuntime as unknown as DocumentosRuntime
  const provider = createDocumentosPanelStorage(guard, undefined, context.stageOnly ? undefined : documentosPanelProductionPins()!)
  const service = createDocumentosPanelService({ root: context.root, db: prisma, guard, provider,
    lock: async (tx, key) => { await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key}, 0)) LIMIT 1`) },
    canonical: async (tx, key) => buscarIdentidadBloqueada(tx, key),
  })
  const canWrite = async () => { try { await guard(true, false); return true } catch { return false } }
  const canConfirm = async () => { try { await guard(true, true, undefined, req.nextUrl.pathname === '/api/admin/finanzas/documentos' ? '/api/admin/finanzas/documentos/[id]' : req.nextUrl.pathname); return true } catch { return false } }
  return { service, canWrite, canConfirm, context, assertAccess: () => guard(false, false) }
}
export function documentosPanelError(error: unknown) {
  if (error instanceof Response) { error.headers.set('Cache-Control', 'private, no-store'); return error }
  if (error instanceof DocumentosPanelError) return jsonPrivado({ error: error.message, code: error.code }, error.status)
  const code = (error as any)?.code
  if (code === 'P2002' || code === 'P2034') return jsonPrivado({ error: 'Conflicto concurrente. Relea y reintente con la misma solicitud.', code: 'CONCURRENT_CONFLICT' }, 409)
  if ((error as any)?.status === 404) return jsonPrivado({ error: 'Panel no disponible en este entorno.', code: 'DOCUMENTOS_PANEL_RUNTIME_CLOSED' }, 404)
  return jsonPrivado({ error: 'Operación no confirmada. No se declara subida, validación o archivado exitoso sin evidencia.', code: 'DOCUMENTOS_PANEL_FAILURE' }, 503)
}
export { jsonPrivado }
