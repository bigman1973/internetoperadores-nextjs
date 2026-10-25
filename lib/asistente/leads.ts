import { z } from 'zod'
import prisma from '@/lib/prisma'
import { conversacionPublicaSegura } from '@/lib/asistente/responder'

export const esquemaLead = z.object({
  conversacionId: z.string().uuid().optional(), tipo: z.enum(['EMPRESA', 'HOGAR']), codigoPostal: z.string().regex(/^\d{5}$/), conexionActual: z.string().max(300).optional(),
  problemas: z.array(z.string().min(1).max(120)).max(20), usuarios: z.number().int().min(0).max(100000), urgencia: z.enum(['ALTA', 'MEDIA', 'BAJA']),
  nombre: z.string().min(2).max(150), email: z.string().email().max(254).optional(), telefono: z.string().min(8).max(30).optional(), empresa: z.string().max(200).optional(),
  consentimiento: z.literal(true), consentimientoVersion: z.string().min(1).max(120), necesidades: z.string().max(2000).optional(),
}).refine(valor => Boolean(valor.email || valor.telefono), { message: 'EMAIL_O_TELEFONO_REQUERIDO' })

export function puntuarLead(entrada: Pick<z.infer<typeof esquemaLead>, 'urgencia' | 'usuarios' | 'problemas'>): 'CALIENTE' | 'TEMPLADO' | 'FRIO' {
  const puntos = (entrada.urgencia === 'ALTA' ? 4 : entrada.urgencia === 'MEDIA' ? 2 : 0) + (entrada.usuarios >= 20 ? 3 : entrada.usuarios >= 5 ? 2 : entrada.usuarios > 0 ? 1 : 0) + Math.min(3, entrada.problemas.length)
  return puntos >= 6 ? 'CALIENTE' : puntos >= 3 ? 'TEMPLADO' : 'FRIO'
}

export async function crearLead(entrada: z.infer<typeof esquemaLead>, retencionMeses: number, visitanteHash: string): Promise<{ conversacionId: string }> {
  const conversacion = { id: await conversacionPublicaSegura(entrada.conversacionId, visitanteHash, retencionMeses) }
  const ahora = new Date()
  const borrarDespues = new Date(ahora); borrarDespues.setMonth(borrarDespues.getMonth() + retencionMeses)
  // Un servicio recomendado sólo puede llegar desde una fuente recuperada y
  // validada por servidor; la API pública no acepta ese campo del navegador.
  await prisma.asistenteLead.create({ data: { conversacionId: conversacion.id, tipo: entrada.tipo, codigoPostal: entrada.codigoPostal, conexionActual: entrada.conexionActual?.trim() || null, problemas: entrada.problemas, usuarios: entrada.usuarios, urgencia: entrada.urgencia, nombre: entrada.nombre.trim(), email: entrada.email?.trim() || null, telefono: entrada.telefono?.trim() || null, empresa: entrada.empresa?.trim() || null, necesidades: entrada.necesidades?.trim() || null, servicioRecomendado: null, puntuacion: puntuarLead(entrada), consentimiento: true, consentimientoVersion: entrada.consentimientoVersion, consentimientoAt: ahora, borrarDespues } })
  return { conversacionId: conversacion.id }
}
