import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { generarInformeSiProcede } from '@/lib/asistente/informes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function autorizado(valor: string | null, secreto: string | undefined): boolean {
  if (!secreto || !valor?.startsWith('Bearer ')) return false
  const recibido = Buffer.from(valor.slice(7))
  const esperado = Buffer.from(secreto)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

export async function GET(req: Request) {
  if (process.env.ASSISTANT_CRON_ENABLED !== 'true' || !autorizado(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return new NextResponse(null, { status: 404 })
  }
  const resultado = await generarInformeSiProcede('DIARIO', new Date(), 'cron')
  return NextResponse.json({ ok: true, generado: resultado.generado })
}
