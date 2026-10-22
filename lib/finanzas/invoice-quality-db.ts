import crypto from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { claveCanonicaFactura, conflictoDeDuplicados, elegirCanonicaDeterminista, hayErrorOcrHistorico } from './invoice-quality'
export { facturaEconomicaSQL, facturaEconomicaWhere } from './invoice-economic-filter'

export const AREA_FACTURAS_B2 = 'admin.finanzas.facturas'
export const ROLES_FINANZAS_LEGACY = ['CONTABILIDAD']
export const MAX_BODY_B2_BYTES = 8 * 1024
export const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function jsonPrivado(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export function respuestaPrivada(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export function facturaNoEconomicaWhere() {
  return { OR: [{ calidad: { not: 'VALIDA' as const } }, { copiaDeId: { not: null } }, { proveedor: { in: ['ERROR_OCR', 'DESCONOCIDO'], mode: 'insensitive' as const } }] }
}

export function serializeFacturaCalidad<T extends Record<string, any>>(factura: T): T & {
  estadoEfectivo: string
  incluidaEnTotales: boolean
  canonKey: string | null
} {
  const historicaRevisar = factura.calidad === 'REVISAR_LECTURA' || hayErrorOcrHistorico(factura.datosOcrRaw, factura.proveedor, factura.ocrCompletado)
  const copia = factura.calidad === 'COPIA' || Boolean(factura.copiaDeId)
  const incluidaEnTotales = !historicaRevisar && !copia && factura.calidad === 'VALIDA'
  const serializada: Record<string, unknown> = {
    ...factura,
    estadoEfectivo: historicaRevisar ? 'REVISAR_LECTURA' : factura.estado,
    incluidaEnTotales,
    // La clave se conserva en la base también para copias; no se muestra como
    // identidad económica de una copia.
    canonKey: copia ? null : (factura.canonKey ?? null),
  }
  if (historicaRevisar) {
    serializada.base = null
    serializada.importeIva = null
    serializada.importeIrpf = null
    serializada.total = null
  }
  return serializada as T & { estadoEfectivo: string; incluidaEnTotales: boolean; canonKey: string | null }
}

export async function requireFacturaAccess(write: boolean) {
  const session = await getServerSession(authOptions)
  const userId = Number(session?.user?.id)
  if (session?.user?.userType !== 'admin' || !Number.isSafeInteger(userId) || userId <= 0) return { error: jsonPrivado({ error: 'No autorizado' }, 401) }
  const active = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } })
  if (!active?.activo) return { error: jsonPrivado({ error: 'No autorizado' }, 401) }
  const denied = await (write ? checkAdminAreaWrite : checkAdminAreaRead)(AREA_FACTURAS_B2, ROLES_FINANZAS_LEGACY, session)
  if (denied) return { error: respuestaPrivada(denied) }
  const writeDenied = write ? null : await checkAdminAreaWrite(AREA_FACTURAS_B2, ROLES_FINANZAS_LEGACY, session)
  return { userId, session, canWriteB2: !writeDenied }
}

/** Lee y corta el stream antes de materializar un cuerpo no acotado. */
export async function readBoundedJsonB2(req: Request): Promise<{ body?: unknown; status?: number }> {
  const contentLength = req.headers.get('content-length')
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_B2_BYTES)) return { status: contentLength && /^\d+$/.test(contentLength) ? 413 : 400 }
  const reader = req.body?.getReader()
  if (!reader) return { status: 400 }
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) return { status: 400 }
      total += value.byteLength
      if (total > MAX_BODY_B2_BYTES) {
        try { await reader.cancel() } catch { /* cancelación de mejor esfuerzo */ }
        return { status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { status: 400 }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return { body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } } catch { return { status: 400 } }
}

export function huellaSolicitud(body: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
}

export type FilaDeduplicacion = {
  id: string
  createdAt: Date
  proveedor: string
  fecha: Date
  base: number
  importeIva: number
  importeIrpf: number
  total: number
  calidad?: 'VALIDA' | 'REVISAR_LECTURA' | 'COPIA'
  copiaDeId?: string | null
  canonKey?: string | null
  conflictoIdentidad?: boolean
  duplicadoExterno?: boolean
  versionCalidad?: number
  datosOcrRaw?: string | null
  movimientos: Array<{ id: string }>
  confirmingLineas: Array<{ id: string }>
  documentosOperadora: Array<{ id: string }>
}

export function contarEnlacesFactura(row: FilaDeduplicacion) {
  return row.movimientos.length + row.confirmingLineas.length + row.documentosOperadora.length
}

export function planDeduplicacion(rows: FilaDeduplicacion[]) {
  const canonica = elegirCanonicaDeterminista(rows.map(row => ({ ...row, enlaces: contarEnlacesFactura(row) })))
  return {
    canonica,
    copias: canonica ? rows.filter(row => row.id !== canonica.id) : [],
    conflicto: conflictoDeDuplicados(rows),
  }
}

export type AuditoriaCambioB2 = {
  facturaId?: string | null
  revisionId?: string | null
  actorId?: number | null
  accion: string
  solicitudId?: string | null
  huellaSolicitud?: string | null
  detalle: Prisma.InputJsonValue
}

/** Toda mutación B2 llama a este helper dentro de la misma transacción. */
export async function auditarCambioB2(tx: Prisma.TransactionClient, change: AuditoriaCambioB2) {
  return tx.auditoriaCalidadFactura.create({ data: {
    facturaId: change.facturaId ?? null,
    revisionId: change.revisionId ?? null,
    actorId: change.actorId ?? null,
    accion: change.accion,
    solicitudId: change.solicitudId ?? null,
    huellaSolicitud: change.huellaSolicitud ?? null,
    detalle: change.detalle,
  } })
}

/**
 * Bloqueo por identidad aunque todavía no exista una fila. La consulta debe
 * devolver una columna real: SELECT pg_advisory_xact_lock(...) devuelve void y
 * Prisma no debe hidratarlo como resultado de consulta.
 */
export async function bloquearCanonKey(tx: Prisma.TransactionClient, canonKey: string) {
  await tx.$queryRaw(Prisma.sql`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${canonKey}, 0))`)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "facturas_recibidas" WHERE "canon_key" = ${canonKey} FOR UPDATE`)
}

export async function buscarIdentidadBloqueada(tx: Prisma.TransactionClient, canonKey: string) {
  await bloquearCanonKey(tx, canonKey)
  return tx.facturaRecibida.findMany({
    where: { canonKey },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      movimientos: { select: { id: true } },
      confirmingLineas: { select: { id: true } },
      documentosOperadora: { select: { id: true } },
    },
  })
}

function dedupeUpdate(row: FilaDeduplicacion, canonica: FilaDeduplicacion, conflicto: boolean, esCopia: boolean) {
  let revisadaManualmente = false
  try { revisadaManualmente = Boolean(canonica.datosOcrRaw && JSON.parse(canonica.datosOcrRaw).correccionManual === true) } catch { /* original histórico no JSON */ }
  return {
    calidad: esCopia ? 'COPIA' as const : conflicto && !revisadaManualmente ? 'REVISAR_LECTURA' as const : 'VALIDA' as const,
    copiaDeId: esCopia ? canonica.id : null,
    conflictoIdentidad: conflicto,
    canonKey: canonica.canonKey,
  }
}

function sameDedupeState(row: FilaDeduplicacion, next: { calidad: 'VALIDA' | 'COPIA' | 'REVISAR_LECTURA'; copiaDeId: string | null; conflictoIdentidad: boolean; canonKey: string | null }) {
  return row.calidad === next.calidad && (row.copiaDeId || null) === next.copiaDeId && Boolean(row.conflictoIdentidad) === next.conflictoIdentidad && (row.canonKey || null) === next.canonKey
}

/**
 * Reconciliación ya identificada. Nunca elige una REVISAR_LECTURA como canónica,
 * conserva canonKey en las copias y no incrementa versiones ante un no-op.
 */
export async function reconciliarIdentidadEnTx(tx: Prisma.TransactionClient, canonKey: string, actorId: number | null = null) {
  const rows = await buscarIdentidadBloqueada(tx, canonKey) as FilaDeduplicacion[]
  if (!rows.length) return null
  const plan = planDeduplicacion(rows)
  if (!plan.canonica) return { ...plan, canonicaId: null, cambios: 0 }
  let cambios = 0
  for (const row of [...rows].sort((a, b) => Number(a.id === plan.canonica?.id) - Number(b.id === plan.canonica?.id))) {
    const next = dedupeUpdate(row, plan.canonica, plan.conflicto, row.id !== plan.canonica.id)
    if (sameDedupeState(row, next)) continue
    await tx.facturaRecibida.update({ where: { id: row.id }, data: { ...next, versionCalidad: { increment: 1 } } })
    await auditarCambioB2(tx, {
      facturaId: row.id,
      actorId,
      accion: 'RECONCILIAR_IDENTIDAD_B2',
      detalle: { antes: { calidad: row.calidad, copiaDeId: row.copiaDeId || null, canonKey: row.canonKey || null, conflictoIdentidad: Boolean(row.conflictoIdentidad) }, despues: next, canonicaId: plan.canonica.id },
    })
    cambios += 1
  }
  return { ...plan, canonicaId: plan.canonica.id, cambios }
}

/** Backfill por un grupo exacto ya calculado con CIF+número normalizados. */
export async function backfillIdentidadExactaEnTx(tx: Prisma.TransactionClient, canonKey: string, ids: string[], actorId: number | null = null) {
  await bloquearCanonKey(tx, canonKey)
  const rows = await tx.facturaRecibida.findMany({
    where: { id: { in: ids } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: { movimientos: { select: { id: true } }, confirmingLineas: { select: { id: true } }, documentosOperadora: { select: { id: true } } },
  }) as FilaDeduplicacion[]
  const plan = planDeduplicacion(rows)
  // El índice parcial comprueba la unicidad en cada UPDATE: primero las copias
  // y por último la canónica. No asignar antes la misma key a varias VALIDAS.
  const ordenadas = [...rows].sort((a, b) => Number(a.id === plan.canonica?.id) - Number(b.id === plan.canonica?.id))
  let cambios = 0
  for (const row of ordenadas) {
    const next = plan.canonica
      ? { ...dedupeUpdate(row, plan.canonica, plan.conflicto, row.id !== plan.canonica.id), canonKey }
      : { calidad: row.calidad || 'REVISAR_LECTURA' as const, copiaDeId: row.copiaDeId || null, conflictoIdentidad: plan.conflicto, canonKey }
    if (sameDedupeState(row, next)) continue
    await tx.facturaRecibida.update({ where: { id: row.id }, data: { ...next, versionCalidad: { increment: 1 } } })
    await auditarCambioB2(tx, { facturaId: row.id, actorId, accion: 'BACKFILL_IDENTIDAD_B2', detalle: { antes: { calidad: row.calidad, copiaDeId: row.copiaDeId || null, canonKey: row.canonKey || null, conflictoIdentidad: Boolean(row.conflictoIdentidad) }, despues: next } })
    cambios++
  }
  return { ...plan, canonicaId: plan.canonica?.id || null, cambios }
}

export function claveFacturaOError(cif: unknown, numero: unknown) {
  const key = claveCanonicaFactura(cif, numero)
  if (!key) throw new Error('IDENTIDAD_INCOMPLETA')
  return key
}

export function esEnteroPositivo(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function clientePrisma(): PrismaClient { return prisma }
