import { z } from 'zod'
import prisma from '@/lib/prisma'
import { guardarContactoSeguro } from '@/lib/asistente/contacto-seguro'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { dentroHorarioHumano } from '@/lib/asistente/horario'
import { esMismoOrigen, ipSolicitud, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'
import { consumirRateLimit, hmacAsistente } from '@/lib/asistente/rate-limit'
import { conversacionPublicaSegura } from '@/lib/asistente/responder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ conversacionId: z.string().uuid().optional(), motivo: z.enum(['PETICION', 'ENFADO', 'SIN_RESPUESTA', 'FUERA_DOMINIO', 'OTRO']).transform(motivo => motivo === 'FUERA_DOMINIO' ? 'OTRO' as const : motivo), nombre: z.string().max(150).optional(), telefono: z.string().max(30).optional(), email: z.string().email().max(254).optional(), preferencia: z.enum(['LLAMADA', 'EMAIL']).optional(), franja: z.string().max(120).optional(), consentimiento: z.boolean() }).superRefine((valor, contexto) => {
  const tieneContacto = Boolean(valor.nombre?.trim() || valor.telefono?.trim() || valor.email?.trim())
  if (!valor.consentimiento && tieneContacto) contexto.addIssue({ code: 'custom', message: 'CONSENTIMIENTO_REQUERIDO' })
  if (valor.consentimiento && (!valor.nombre?.trim() || (!valor.telefono?.trim() && !valor.email?.trim()))) contexto.addIssue({ code: 'custom', message: 'CONTACTO_REQUERIDO' })
  if (valor.preferencia === 'LLAMADA' && !valor.telefono?.trim()) contexto.addIssue({ code: 'custom', message: 'TELEFONO_REQUERIDO' })
  if (valor.preferencia === 'EMAIL' && !valor.email?.trim()) contexto.addIssue({ code: 'custom', message: 'EMAIL_REQUERIDO' })
})
type ContactoSeguroDb = Parameters<typeof guardarContactoSeguro>[0]

export async function POST(req: Request) {
  const configuracion = await getAssistantRuntime(); if (!configuracion.publicEnabled) return jsonPrivado({ codigo: 'ASSISTANT_DISABLED' }, 503)
  if (!esMismoOrigen(req)) return jsonPrivado({ codigo: 'ORIGEN_INVALIDO' }, 403)
  if (!(await consumirRateLimit(`escalado:${ipSolicitud(req)}`, new Date(), 5)).permitido) return jsonPrivado({ codigo: 'RATE_LIMIT' }, 429)
  const cuerpo = await leerJsonLimitado(req); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ codigo: 'CUERPO_INVALIDO' }, 400)
  // Sólo la conversación del mismo visitante; si no existe (escalado antes de chatear) se crea una nueva.
  const conversacion = { id: await conversacionPublicaSegura(entrada.data.conversacionId, hmacAsistente(ipSolicitud(req)), configuracion.retencionMeses) }
  const dentroHorario = dentroHorarioHumano(configuracion.horario)
  try {
    await prisma.$transaction(async (tx) => {
      const escalado = await tx.asistenteEscalado.create({ data: { conversacionId: conversacion.id, motivo: entrada.data.motivo, dentroHorario, contactoNombre: null, contactoTelefono: null, contactoEmail: null, preferencia: entrada.data.preferencia || null, franja: entrada.data.franja?.trim() || null, consentimiento: entrada.data.consentimiento } })
      if (entrada.data.consentimiento) {
        const borrarDespues = new Date()
        borrarDespues.setMonth(borrarDespues.getMonth() + configuracion.retencionMeses)
        await guardarContactoSeguro(tx as unknown as ContactoSeguroDb, {
          referenciaTipo: 'ESCALADO',
          referenciaId: escalado.id,
          conversacionId: conversacion.id,
          datos: { nombre: entrada.data.nombre, telefono: entrada.data.telefono, email: entrada.data.email },
          borrarDespues,
        })
      }
      await tx.asistenteConversacion.update({ where: { id: conversacion.id }, data: { estado: 'ESCALADA', escaladoMotivo: entrada.data.motivo, updatedAt: new Date() } })
    })
  } catch (error) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'CONTACTO_CIFRADO_NO_CONFIGURADO' || codigo === 'ASSISTANT_CONTACT_ENCRYPTION_KEY_INVALIDA') return jsonPrivado({ codigo: 'CONTACTO_SEGURO_NO_CONFIGURADO' }, 503)
    return jsonPrivado({ codigo: 'ASISTENTE_NO_DISPONIBLE' }, 503)
  }
  return jsonPrivado({ ok: true, conversacionId: conversacion.id, dentroHorario, mensaje: dentroHorario ? 'Hemos registrado tu solicitud para que el equipo pueda atenderte.' : 'Hemos registrado tu solicitud. Te responderemos en horario de atención.' })
}
