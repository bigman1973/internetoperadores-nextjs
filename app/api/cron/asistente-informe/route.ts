import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { cronInformeHabilitado, esHoraInformeMadrid } from '@/lib/asistente/cron'
import { ejecutarInformesProgramados } from '@/lib/asistente/informes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function autorizado(valor: string | null, secreto: string | undefined): boolean {
  if (!secreto || !valor?.startsWith('Bearer ')) return false
  const recibido = Buffer.from(valor.slice(7))
  const esperado = Buffer.from(secreto)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

export async function GET(req: Request) {
  const ahora = new Date()
  if (!cronInformeHabilitado() || !autorizado(req.headers.get('authorization'), process.env.CRON_SECRET) || !esHoraInformeMadrid(ahora)) {
    return new NextResponse(null, { status: 404 })
  }
  const resultados = await ejecutarInformesProgramados(ahora, 'cron:vercel-produccion')
  return NextResponse.json({ ok: true, informes: resultados.map(resultado => ({ tipo: resultado.tipo, generado: resultado.generado, motivo: resultado.motivo })) }, { headers: { 'cache-control': 'no-store' } })
}
