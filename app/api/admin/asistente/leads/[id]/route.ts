import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado, uuidValido } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const cambio = z.object({
  estado: z.enum(['NUEVO', 'CONTACTADO', 'CERRADO', 'DESCARTADO']),
  nota: z.string().trim().max(1200).optional(),
})

function detalleSeguro(lead: {
  consentimiento: boolean; nombre: string; email: string | null; telefono: string | null; empresa: string | null
  id: string; conversacionId: string; tipo: string; codigoPostal: string; conexionActual: string | null; problemas: string[]
  usuarios: number; urgencia: string; resumen: string | null; necesidades: string | null; servicioRecomendado: string | null
  puntuacion: string; estado: string; consentimientoVersion: string; consentimientoAt: Date; borrarDespues: Date; createdAt: Date; updatedAt: Date
}) {
  const { consentimiento, nombre, email, telefono, empresa, ...resto } = lead
  return { ...resto, consentimiento, contacto: consentimiento ? { nombre, email, telefono, empresa } : null }
}

const seleccion = {
  id: true, conversacionId: true, tipo: true, codigoPostal: true, conexionActual: true, problemas: true,
  usuarios: true, urgencia: true, nombre: true, email: true, telefono: true, empresa: true, resumen: true,
  necesidades: true, servicioRecomendado: true, puntuacion: true, estado: true, consentimiento: true,
  consentimientoVersion: true, consentimientoAt: true, borrarDespues: true, createdAt: true, updatedAt: true,
} as const

export async function GET(_req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'lectura')
  if ('response' in acceso) return acceso.response
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Lead no válido' }, 400)
  const lead = await prisma.asistenteLead.findUnique({ where: { id }, select: seleccion })
  if (!lead) return jsonPrivado({ error: 'Lead no encontrado' }, 404)
  return jsonPrivado({ lead: detalleSeguro(lead) })
}

export async function PATCH(req: Request, contexto: { params: Promise<{ id: string }> }) {
  const acceso = await exigirAdminAsistente('admin.asistente.leads', 'escritura')
  if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const { id } = await contexto.params
  if (!uuidValido(id)) return jsonPrivado({ error: 'Lead no válido' }, 400)
  const cuerpo = await leerJsonLimitado(req)
  const entrada = cuerpo.ok ? cambio.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)

  const lead = await prisma.asistenteLead.update({ where: { id }, data: { estado: entrada.data.estado, updatedAt: new Date() }, select: seleccion }).catch(() => null)
  if (!lead) return jsonPrivado({ error: 'Lead no encontrado' }, 404)
  return jsonPrivado({
    ok: true,
    lead: detalleSeguro(lead),
    ...(entrada.data.nota ? { aviso: 'La nota se ha recibido, pero este modelo aún no dispone de un campo de notas internas.' } : {}),
  })
}
