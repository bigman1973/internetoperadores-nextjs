import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { dentroHorarioHumano } from '@/lib/asistente/horario'
import { esMismoOrigen, ipSolicitud, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { consumirRateLimit } from '@/lib/asistente/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ conversacionId: z.string().uuid(), motivo: z.enum(['PETICION', 'ENFADO', 'SIN_RESPUESTA', 'OTRO']), nombre: z.string().max(150).optional(), telefono: z.string().max(30).optional(), email: z.string().email().max(254).optional(), preferencia: z.enum(['LLAMADA', 'EMAIL']).optional(), franja: z.string().max(120).optional(), consentimiento: z.boolean() }).superRefine((valor, contexto) => { if (!valor.consentimiento && (valor.nombre || valor.telefono || valor.email)) contexto.addIssue({ code: 'custom', message: 'CONSENTIMIENTO_REQUERIDO' }) })

export async function POST(req: Request) {
  const configuracion = await getAssistantRuntime(); if (!configuracion.publicEnabled) return jsonPrivado({ codigo: 'ASSISTANT_DISABLED' }, 503)
  if (!esMismoOrigen(req)) return jsonPrivado({ codigo: 'ORIGEN_INVALIDO' }, 403)
  if (!(await consumirRateLimit(`escalado:${ipSolicitud(req)}`, new Date(), 5)).permitido) return jsonPrivado({ codigo: 'RATE_LIMIT' }, 429)
  const cuerpo = await leerJsonLimitado(req); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ codigo: 'CUERPO_INVALIDO' }, 400)
  const conversacion = await prisma.asistenteConversacion.findFirst({ where: { id: entrada.data.conversacionId, canal: 'PUBLICO' }, select: { id: true } }); if (!conversacion) return jsonPrivado({ codigo: 'CONVERSACION_INVALIDA' }, 400)
  const dentroHorario = dentroHorarioHumano(configuracion.horario)
  await prisma.asistenteEscalado.create({ data: { conversacionId: conversacion.id, motivo: entrada.data.motivo, dentroHorario, contactoNombre: entrada.data.consentimiento ? entrada.data.nombre?.trim() || null : null, contactoTelefono: entrada.data.consentimiento ? entrada.data.telefono?.trim() || null : null, contactoEmail: entrada.data.consentimiento ? entrada.data.email?.trim() || null : null, preferencia: entrada.data.consentimiento ? entrada.data.preferencia || null : null, franja: entrada.data.consentimiento ? entrada.data.franja?.trim() || null : null, consentimiento: entrada.data.consentimiento } })
  await prisma.asistenteConversacion.update({ where: { id: conversacion.id }, data: { estado: 'ESCALADA', escaladoMotivo: entrada.data.motivo, updatedAt: new Date() } })
  return jsonPrivado({ ok: true, dentroHorario, mensaje: dentroHorario ? 'Hemos registrado tu solicitud para que el equipo pueda atenderte.' : 'Hemos registrado tu solicitud. Te responderemos en horario de atención.' })
}
