import type { HorarioHumano } from '@/lib/asistente/config'

function partesEnMadrid(fecha: Date, zona: string): Record<string, string> {
  const formato = new Intl.DateTimeFormat('en-GB', { timeZone: zona, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return Object.fromEntries(formato.formatToParts(fecha).filter(parte => parte.type !== 'literal').map(parte => [parte.type, parte.value]))
}

const DIA: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export function dentroHorarioHumano(horario: HorarioHumano, fecha = new Date()): boolean {
  try {
    const partes = partesEnMadrid(fecha, horario.zona || 'Europe/Madrid')
    const minuto = Number(partes.hour) * 60 + Number(partes.minute)
    const [hi, mi] = horario.inicio.split(':').map(Number)
    const [hf, mf] = horario.fin.split(':').map(Number)
    return horario.dias.includes(DIA[partes.weekday] || 0) && minuto >= hi * 60 + mi && minuto < hf * 60 + mf
  } catch { return false }
}

export function textoHorarioHumano(horario: HorarioHumano, dentro = dentroHorarioHumano(horario)): string {
  return dentro ? 'Nuestro equipo está disponible ahora.' : 'Atendemos de lunes a viernes, de 09:00 a 18:00 (hora peninsular).'
}
