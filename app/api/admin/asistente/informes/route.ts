import { z } from 'zod'
import prisma from '@/lib/prisma'
import { generarInformeSiProcede } from '@/lib/asistente/informes'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const esquema = z.object({ tipo: z.enum(['DIARIO', 'SEMANAL', 'MENSUAL']) })

function limiteSeguro(valor: string | null): number {
  const pedido = Number(valor || 20)
  return Number.isInteger(pedido) ? Math.max(1, Math.min(50, pedido)) : 20
}

const seleccionInforme = {
  id: true, tipo: true, fechaLocal: true, periodoInicio: true, periodoFin: true, datos: true, generadoPor: true, createdAt: true,
  propuestas: { orderBy: [{ prioridad: 'desc' as const }, { id: 'asc' as const }], take: 50, select: { id: true, titulo: true, detalle: true, impacto: true, esfuerzo: true, prioridad: true, estado: true, decidedAt: true } },
}

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.propuestas', 'lectura')
  if ('response' in acceso) return acceso.response
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (id) {
    if (!uuidValido(id)) return jsonPrivado({ error: 'Informe inválido' }, 400)
    const informe = await prisma.asistenteInforme.findUnique({ where: { id }, select: seleccionInforme })
    return informe ? jsonPrivado({ informe }) : jsonPrivado({ error: 'Informe no encontrado' }, 404)
  }
  const take = limiteSeguro(url.searchParams.get('limit'))
  const cursor = url.searchParams.get('cursor') || undefined
  if (cursor && !uuidValido(cursor)) return jsonPrivado({ error: 'Cursor inválido' }, 400)
  const filas = await prisma.asistenteInforme.findMany({ orderBy: [{ fechaLocal: 'desc' }, { createdAt: 'desc' }], take: take + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: seleccionInforme })
  const hayMas = filas.length > take
  const informes = hayMas ? filas.slice(0, take) : filas
  return jsonPrivado({ informes, siguienteCursor: hayMas ? informes[informes.length - 1]?.id || null : null })
}

export async function POST(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.propuestas', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  try {
    const resultado = await generarInformeSiProcede(entrada.data.tipo, new Date(), acceso.actor, { forzar: true })
    return jsonPrivado({ ok: true, ...resultado }, resultado.generado ? 201 : 200)
  } catch { return jsonPrivado({ error: 'No se ha podido generar el informe' }, 400) }
}
