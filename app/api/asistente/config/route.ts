import { getAssistantRuntime } from '@/lib/asistente/config'
import { dentroHorarioHumano, textoHorarioHumano } from '@/lib/asistente/horario'
import { jsonPrivado } from '@/lib/asistente/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const configuracion = await getAssistantRuntime()
  if (!configuracion.publicEnabled) return jsonPrivado({ enabled: false })
  const dentroHorario = dentroHorarioHumano(configuracion.horario)
  return jsonPrivado({ enabled: true, modo: configuracion.modo, bienvenida: configuracion.bienvenida, aviso: 'Soy un asistente virtual. Verifica la información importante con nuestro equipo.', privacidadUrl: '/politica-privacidad', horario: { dentroHorario, texto: textoHorarioHumano(configuracion.horario, dentroHorario) }, consentimientoVersion: configuracion.consentimientoVersion, maxChars: configuracion.maxChars })
}
