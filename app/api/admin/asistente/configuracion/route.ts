import { z } from 'zod'
import prisma from '@/lib/prisma'
import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { getAssistantRuntime } from '@/lib/asistente/config'
import { esMismoOrigen, jsonPrivado, leerJsonLimitado } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const esquema = z.object({ modo: z.enum(['extractivo', 'local', 'desactivado']).optional(), modelo: z.string().max(200).nullable().optional(), tono: z.string().min(1).max(1000).optional(), bienvenida: z.string().min(1).max(1200).optional(), horarioHumano: z.object({ zona: z.literal('Europe/Madrid'), dias: z.array(z.number().int().min(1).max(7)).min(1), inicio: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), fin: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }).optional(), temasProhibidos: z.array(z.string().min(1).max(120)).max(50).optional(), retencionMeses: z.number().int().min(1).max(120).optional(), consentimientoVersion: z.string().min(1).max(120).optional(), motivo: z.string().min(3).max(500), confirmar: z.boolean().optional() })

export async function GET() {
  const acceso = await exigirAdminAsistente('admin.asistente.configuracion', 'lectura'); if ('response' in acceso) return acceso.response
  const configuracion = await getAssistantRuntime()
  return jsonPrivado(configuracion)
}

export async function PATCH(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.configuracion', 'escritura'); if ('response' in acceso) return acceso.response
  if (!esMismoOrigen(req)) return jsonPrivado({ error: 'Origen no válido' }, 403)
  const cuerpo = await leerJsonLimitado(req); const entrada = cuerpo.ok ? esquema.safeParse(cuerpo.datos) : { success: false as const }
  if (!entrada.success) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
  if (entrada.data.modo === 'local' && entrada.data.confirmar !== true) return jsonPrivado({ error: 'La activación local requiere confirmar: true' }, 400)
  const { motivo, confirmar: _confirmar, ...cambios } = entrada.data
  const claves = Object.keys(cambios).filter(clave => (cambios as Record<string, unknown>)[clave] !== undefined)
  if (!claves.length) return jsonPrivado({ error: 'No hay cambios' }, 400)
  const resultado = await prisma.$transaction(async tx => {
    const previa = await tx.asistenteConfiguracion.upsert({ where: { id: 'default' }, update: {}, create: { id: 'default' } })
    const datos: Record<string, unknown> = { actualizadoPor: acceso.actor.id, updatedAt: new Date() }
    const campos: Record<string, string> = { horarioHumano: 'horarioHumano', temasProhibidos: 'temasProhibidos', retencionMeses: 'retencionMeses', consentimientoVersion: 'consentimientoVersion', modo: 'modo', modelo: 'modelo', tono: 'tono', bienvenida: 'bienvenida' }
    for (const clave of claves) datos[campos[clave] || clave] = (cambios as Record<string, unknown>)[clave]
    const actualizada = await tx.asistenteConfiguracion.update({ where: { id: 'default' }, data: datos as any })
    await tx.asistenteConfigCambio.createMany({ data: claves.map(campo => ({ campo, antes: JSON.parse(JSON.stringify((previa as any)[campos[campo] || campo] ?? null)), despues: JSON.parse(JSON.stringify((cambios as Record<string, unknown>)[campo] ?? null)), actorId: acceso.actor.id, motivo })) })
    return actualizada
  })
  return jsonPrivado({ ok: true, configuracion: { modo: resultado.modo, modelo: resultado.modelo, tono: resultado.tono, bienvenida: resultado.bienvenida, horario: resultado.horarioHumano, temasProhibidos: resultado.temasProhibidos, retencionMeses: resultado.retencionMeses, consentimientoVersion: resultado.consentimientoVersion } })
}
