import { NextRequest } from 'next/server'
import { Prisma, type FacturaRecibida, type RevisionLecturaFacturaRecibida } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { facturaEconomicaWhere, jsonPrivado, requireFacturaAccess, serializeFacturaCalidad } from '@/lib/finanzas/invoice-quality-db'

export const dynamic = 'force-dynamic'
const MAX_PAGE = 100_000
const MAX_LIMIT = 100

type Tipo = 'todos' | 'cuarentena' | 'copias'
type ColaId = { origen: 'CUARENTENA' | 'HISTORICA'; id: string; createdAt: Date }
function positive(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback
  if (!/^[1-9]\d*$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null
}
function metadata(total: number, current: number, limit: number) {
  return { total, page: current, totalPages: Math.ceil(total / limit) }
}

/** Una sola página sobre ambas fuentes; nunca aplica skip dos veces y mezcla mal el orden. */
async function paginaCuarentena(skip: number, take: number) {
  const ids = await prisma.$queryRaw<ColaId[]>(Prisma.sql`
    SELECT origen, id, "createdAt" FROM (
      SELECT 'CUARENTENA'::text AS origen, "id", "created_at" AS "createdAt"
      FROM "revisiones_lectura_facturas_recibidas"
      WHERE "resuelta_at" IS NULL
      UNION ALL
      SELECT 'HISTORICA'::text AS origen, "id", "created_at" AS "createdAt"
      FROM "facturas_recibidas"
      WHERE "calidad" = 'REVISAR_LECTURA'
    ) cola
    ORDER BY "createdAt" DESC, id DESC
    OFFSET ${skip} LIMIT ${take}
  `)
  const revisionIds = ids.filter(row => row.origen === 'CUARENTENA').map(row => row.id)
  const facturaIds = ids.filter(row => row.origen === 'HISTORICA').map(row => row.id)
  const revisiones: RevisionLecturaFacturaRecibida[] = revisionIds.length
    ? await prisma.revisionLecturaFacturaRecibida.findMany({ where: { id: { in: revisionIds } } })
    : []
  const historicas: FacturaRecibida[] = facturaIds.length
    ? await prisma.facturaRecibida.findMany({ where: { id: { in: facturaIds } } })
    : []
  const revisionMap = new Map(revisiones.map(row => [row.id, row]))
  const historicaMap = new Map(historicas.map(row => [row.id, row]))
  const items: Array<Record<string, unknown>> = []
  for (const row of ids) {
    if (row.origen === 'CUARENTENA') {
      const item = revisionMap.get(row.id)
      if (item) items.push({ ...item, estadoEfectivo: 'PENDIENTE_REVISION', calidad: 'REVISAR_LECTURA', incluidaEnTotales: false, origenCalidad: 'CUARENTENA', base: null, importeIva: null, importeIrpf: null, total: null, pdfUrl: item.oneDriveItemId ? `/api/admin/finanzas/facturas/calidad/${encodeURIComponent(item.id)}/pdf` : null })
      continue
    }
    const item = historicaMap.get(row.id)
    if (item) items.push({ ...serializeFacturaCalidad(item), estadoEfectivo: 'PENDIENTE_REVISION', origenCalidad: 'HISTORICA', motivoRevision: 'OCR histórico o fecha no documental; los valores originales se conservan en la auditoría.', pdfUrl: item.oneDriveItemId ? `/api/admin/finanzas/facturas/calidad/${encodeURIComponent(item.id)}/pdf` : null })
  }
  return items
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireFacturaAccess(false)
    if ('error' in access) return access.error
    const tipo = (req.nextUrl.searchParams.get('tipo') || 'todos') as Tipo
    const current = positive(req.nextUrl.searchParams.get('page'), 1, MAX_PAGE)
    const limit = positive(req.nextUrl.searchParams.get('limit'), 25, MAX_LIMIT)
    if (!current || !limit || !['todos', 'cuarentena', 'copias'].includes(tipo)) return jsonPrivado({ error: 'Parámetros de paginación o tipo inválidos' }, 400)
    const skip = (current - 1) * limit
    const [totalRevisiones, totalHistoricas, totalCopias, sumaCopias, activas, colaItems, copias] = await Promise.all([
      prisma.revisionLecturaFacturaRecibida.count({ where: { resueltaAt: null } }),
      prisma.facturaRecibida.count({ where: { calidad: 'REVISAR_LECTURA' } }),
      prisma.facturaRecibida.count({ where: { calidad: 'COPIA', copiaDeId: { not: null } } }),
      prisma.facturaRecibida.aggregate({ where: { calidad: 'COPIA' }, _sum: { total: true } }),
      prisma.facturaRecibida.count({ where: facturaEconomicaWhere }),
      tipo === 'copias' ? Promise.resolve([]) : paginaCuarentena(skip, limit),
      tipo === 'cuarentena' ? Promise.resolve([]) : prisma.facturaRecibida.findMany({
        where: { calidad: 'COPIA', copiaDeId: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take: limit,
        include: { copiaDe: { select: { id: true, proveedor: true, cif: true, numFactura: true, fecha: true, total: true } } },
      }),
    ])
    const totalCuarentena = totalRevisiones + totalHistoricas
    const copiasItems = copias.map(item => ({ ...serializeFacturaCalidad(item), canonica: item.copiaDe ? serializeFacturaCalidad(item.copiaDe) : null }))
    return jsonPrivado({
      cuarentena: { items: colaItems, ...metadata(totalCuarentena, current, limit) },
      copias: { items: copiasItems, ...metadata(totalCopias, current, limit) },
      resumen: {
        cuarentena: totalCuarentena,
        copias: totalCopias,
        importeExcluidoCopias: sumaCopias._sum.total || 0,
        facturasRevisionHistorica: totalHistoricas,
        facturasEconomicas: activas,
      },
      canWriteB2: access.canWriteB2,
    })
  } catch {
    return jsonPrivado({ error: 'No se pudo cargar la bandeja privada de calidad B2' }, 500)
  }
}
