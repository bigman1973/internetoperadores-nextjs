import prisma from '@/lib/prisma'
import { assistantClientEnabled, assistantPublicEnabled, envAssistantMode, type AssistantMode } from '@/lib/asistente/public-flag'

export type HorarioHumano = { zona: string; dias: number[]; inicio: string; fin: string }
export type AssistantRuntime = {
  modo: AssistantMode
  publicEnabled: boolean
  clientEnabled: boolean
  maxChars: number
  horario: HorarioHumano
  bienvenida: string
  temasProhibidos: string[]
  retencionMeses: number
  consentimientoVersion: string
}

const HORARIO_POR_DEFECTO: HorarioHumano = { zona: 'Europe/Madrid', dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' }
const BIENVENIDA_POR_DEFECTO = 'Hola, soy el asistente virtual de Internet Operadores. ¿En qué puedo ayudarte?'

function enteroSeguro(valor: string | undefined, defecto: number, min: number, max: number): number {
  const numero = Number(valor)
  return Number.isInteger(numero) && numero >= min && numero <= max ? numero : defecto
}

function modoMasRestrictivo(entorno: AssistantMode, base: unknown): AssistantMode {
  const modoBd: AssistantMode = base === 'local' || base === 'extractivo' || base === 'desactivado' ? base : 'extractivo'
  const rango: Record<AssistantMode, number> = { desactivado: 0, extractivo: 1, local: 2 }
  return rango[entorno] <= rango[modoBd] ? entorno : modoBd
}

function horarioSeguro(valor: unknown): HorarioHumano {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return HORARIO_POR_DEFECTO
  const entrada = valor as Partial<HorarioHumano>
  const dias = Array.isArray(entrada.dias) ? entrada.dias.filter((dia): dia is number => Number.isInteger(dia) && dia >= 1 && dia <= 7) : []
  const hora = (candidata: unknown, defecto: string) => typeof candidata === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidata) ? candidata : defecto
  return { zona: entrada.zona === 'Europe/Madrid' ? entrada.zona : 'Europe/Madrid', dias: dias.length ? dias : HORARIO_POR_DEFECTO.dias, inicio: hora(entrada.inicio, '09:00'), fin: hora(entrada.fin, '18:00') }
}

export async function getAssistantRuntime(): Promise<AssistantRuntime> {
  const modoEntorno = envAssistantMode()
  const porDefecto: AssistantRuntime = {
    modo: modoEntorno,
    publicEnabled: assistantPublicEnabled() && modoEntorno !== 'desactivado',
    clientEnabled: assistantClientEnabled() && modoEntorno !== 'desactivado',
    maxChars: enteroSeguro(process.env.ASSISTANT_MAX_MESSAGE_CHARS, 1500, 100, 4000),
    horario: HORARIO_POR_DEFECTO,
    bienvenida: BIENVENIDA_POR_DEFECTO,
    temasProhibidos: [],
    retencionMeses: enteroSeguro(process.env.ASSISTANT_RETENTION_MONTHS, 12, 1, 120),
    consentimientoVersion: process.env.ASSISTANT_CONSENT_VERSION?.trim() || '2026-10-borrador',
  }
  try {
    const configuracion = await prisma.asistenteConfiguracion.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    })
    const modo = modoMasRestrictivo(modoEntorno, configuracion.modo)
    return {
      modo,
      publicEnabled: porDefecto.publicEnabled && modo !== 'desactivado',
      clientEnabled: porDefecto.clientEnabled && modo !== 'desactivado',
      maxChars: porDefecto.maxChars,
      horario: horarioSeguro(configuracion.horarioHumano),
      bienvenida: configuracion.bienvenida?.trim().slice(0, 1200) || BIENVENIDA_POR_DEFECTO,
      temasProhibidos: Array.isArray(configuracion.temasProhibidos) ? configuracion.temasProhibidos.slice(0, 50) : [],
      retencionMeses: Math.max(1, Math.min(120, configuracion.retencionMeses || porDefecto.retencionMeses)),
      consentimientoVersion: configuracion.consentimientoVersion?.trim().slice(0, 120) || porDefecto.consentimientoVersion,
    }
  } catch {
    return porDefecto
  }
}

export { HORARIO_POR_DEFECTO, BIENVENIDA_POR_DEFECTO }
