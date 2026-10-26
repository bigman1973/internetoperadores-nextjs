import { createHash } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { conversacionPublicaSegura } from '@/lib/asistente/responder'
import { redactarPIILocal } from '@/lib/asistente/pii'
import { buscar } from '@/lib/asistente/retrieval'
import { cifrarContacto, guardarContactoSeguro, type DatosContactoSeguro } from '@/lib/asistente/contacto-seguro'

export const esquemaLead = z.object({
  conversacionId: z.string().uuid().optional(),
  tipo: z.enum(['EMPRESA', 'HOGAR']),
  codigoPostal: z.string().regex(/^\d{5}$/),
  conexionActual: z.string().max(300).optional(),
  problemas: z.array(z.string().min(1).max(120)).max(20),
  usuarios: z.number().int().min(0).max(100000),
  urgencia: z.enum(['ALTA', 'MEDIA', 'BAJA']),
  nombre: z.string().min(2).max(150),
  email: z.string().email().max(254).optional(),
  telefono: z.string().min(8).max(30).optional(),
  empresa: z.string().max(200).optional(),
  consentimiento: z.literal(true),
  consentimientoVersion: z.string().min(1).max(120),
  necesidades: z.string().max(2000).optional(),
}).strict().refine(valor => Boolean(valor.email || valor.telefono), { message: 'EMAIL_O_TELEFONO_REQUERIDO' })

const MARCADOR_CONTACTO = '[CONTACTO_CIFRADO]'
const ALCANCE_PUBLICO = { espacios: ['PUBLICO' as const], roles: [], tenantId: null, usuarioId: null }

type EntradaLead = z.infer<typeof esquemaLead>
type DatosRedactadosLead = Pick<EntradaLead, 'tipo' | 'usuarios' | 'urgencia'> & {
  codigoPostal: string
  conexionActual: string | null
  problemas: string[]
  necesidades: string | null
}

export function puntuarLead(entrada: Pick<EntradaLead, 'urgencia' | 'usuarios' | 'problemas'>): 'CALIENTE' | 'TEMPLADO' | 'FRIO' {
  const puntos = (entrada.urgencia === 'ALTA' ? 4 : entrada.urgencia === 'MEDIA' ? 2 : 0)
    + (entrada.usuarios >= 20 ? 3 : entrada.usuarios >= 5 ? 2 : entrada.usuarios > 0 ? 1 : 0)
    + Math.min(3, entrada.problemas.length)
  return puntos >= 6 ? 'CALIENTE' : puntos >= 3 ? 'TEMPLADO' : 'FRIO'
}

function uuidDeterministaLead(conversacionId: string): string {
  const bytes = createHash('sha256').update(`internetoperadores/asistente/lead/v1:${conversacionId}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return `${bytes.subarray(0, 4).toString('hex')}-${bytes.subarray(4, 6).toString('hex')}-${bytes.subarray(6, 8).toString('hex')}-${bytes.subarray(8, 10).toString('hex')}-${bytes.subarray(10, 16).toString('hex')}`
}

function textoRedactado(valor: string | undefined | null, incluirCodigoPostal = false): string | null {
  if (!valor?.trim()) return null
  return redactarPIILocal(valor.trim(), incluirCodigoPostal).slice(0, 2000)
}

function prepararDatosRedactados(entrada: EntradaLead): DatosRedactadosLead {
  return {
    tipo: entrada.tipo,
    codigoPostal: textoRedactado(entrada.codigoPostal, true) || '[CP]',
    conexionActual: textoRedactado(entrada.conexionActual, true),
    problemas: entrada.problemas.map(problema => redactarPIILocal(problema.trim(), true).slice(0, 120)).filter(Boolean),
    usuarios: entrada.usuarios,
    urgencia: entrada.urgencia,
    necesidades: textoRedactado(entrada.necesidades, true),
  }
}

function resumenRedactado(datos: DatosRedactadosLead): string {
  const partes = [
    datos.tipo === 'EMPRESA' ? 'Solicitud de empresa' : 'Solicitud de hogar',
    `urgencia ${datos.urgencia.toLowerCase()}`,
    `${datos.usuarios} usuario${datos.usuarios === 1 ? '' : 's'}`,
    datos.problemas.length ? `necesidades: ${datos.problemas.join(', ')}` : null,
    datos.conexionActual ? `conexión indicada: ${datos.conexionActual}` : null,
  ].filter((parte): parte is string => Boolean(parte))
  return redactarPIILocal(partes.join('. '), true).slice(0, 2000)
}

function contactoConsentido(entrada: EntradaLead): DatosContactoSeguro {
  return {
    nombre: entrada.nombre.trim(),
    ...(entrada.email?.trim() ? { email: entrada.email.trim() } : {}),
    ...(entrada.telefono?.trim() ? { telefono: entrada.telefono.trim() } : {}),
    ...(entrada.empresa?.trim() ? { empresa: entrada.empresa.trim() } : {}),
  }
}

/**
 * Sólo propone un servicio si el servidor recupera una fuente pública aprobada.
 * El navegador no puede aportar ni seleccionar la recomendación.
 */
async function recomendacionDesdeFuentesAprobadas(datos: DatosRedactadosLead): Promise<string | null> {
  // No se concatena todo el formulario: una consulta FTS demasiado amplia puede
  // exigir términos incidentales y ocultar una fuente pertinente. Cada consulta
  // se limita a una necesidad ya redactada, sin incluir identidad ni CP.
  const consultas = [
    ...datos.problemas,
    datos.necesidades,
    datos.conexionActual,
  ].filter((consulta): consulta is string => Boolean(consulta?.trim() && consulta.trim().length >= 2))

  for (const consulta of consultas) {
    const [fuente] = await buscar(consulta, ALCANCE_PUBLICO, { limite: 1 })
    if (!fuente?.titulo || !(fuente.puntuacion > 0)) continue
    const titulo = redactarPIILocal(fuente.titulo.trim(), true).slice(0, 220)
    if (titulo) return titulo
  }
  return null
}

/**
 * Crea un lead con referencia determinista de conversación: una repetición de
 * la misma conversación/visitante actualiza el contacto cifrado y no duplica CRM.
 */
export async function crearLead(entrada: EntradaLead, retencionMeses: number, visitanteHash: string): Promise<{ conversacionId: string }> {
  const conversacionId = await conversacionPublicaSegura(entrada.conversacionId, visitanteHash, retencionMeses)
  const id = uuidDeterministaLead(conversacionId)
  const ahora = new Date()
  const borrarDespues = new Date(ahora)
  borrarDespues.setMonth(borrarDespues.getMonth() + retencionMeses)
  const datos = prepararDatosRedactados(entrada)
  const contexto = { referenciaTipo: 'LEAD' as const, referenciaId: id, conversacionId }
  const contacto = contactoConsentido(entrada)

  // Valida disponibilidad de clave y AAD antes de escribir campos operativos.
  // Si falta secreto, se rechaza la captura sin persistir PII en claro.
  cifrarContacto(contacto, contexto)
  const servicioRecomendado = await recomendacionDesdeFuentesAprobadas(datos)
  const puntuacion = puntuarLead(entrada)
  const resumen = resumenRedactado(datos)

  await prisma.$transaction(async db => {
    await db.asistenteLead.upsert({
      where: { id },
      create: {
        id,
        conversacionId,
        tipo: datos.tipo,
        codigoPostal: datos.codigoPostal,
        conexionActual: datos.conexionActual,
        problemas: datos.problemas,
        usuarios: datos.usuarios,
        urgencia: datos.urgencia,
        nombre: MARCADOR_CONTACTO,
        email: MARCADOR_CONTACTO,
        telefono: null,
        empresa: MARCADOR_CONTACTO,
        resumen,
        necesidades: datos.necesidades,
        servicioRecomendado,
        puntuacion,
        consentimiento: true,
        consentimientoVersion: entrada.consentimientoVersion,
        consentimientoAt: ahora,
        borrarDespues,
      },
      update: {
        tipo: datos.tipo,
        codigoPostal: datos.codigoPostal,
        conexionActual: datos.conexionActual,
        problemas: datos.problemas,
        usuarios: datos.usuarios,
        urgencia: datos.urgencia,
        nombre: MARCADOR_CONTACTO,
        email: MARCADOR_CONTACTO,
        telefono: null,
        empresa: MARCADOR_CONTACTO,
        resumen,
        necesidades: datos.necesidades,
        servicioRecomendado,
        puntuacion,
        consentimiento: true,
        consentimientoVersion: entrada.consentimientoVersion,
        consentimientoAt: ahora,
        borrarDespues,
        updatedAt: ahora,
      },
    })
    await guardarContactoSeguro(db, { ...contexto, datos: contacto, borrarDespues })
  })
  return { conversacionId }
}
