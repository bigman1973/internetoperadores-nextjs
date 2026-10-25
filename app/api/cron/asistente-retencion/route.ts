import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { previsualizarPurga } from '@/lib/asistente/retencion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function autorizado(valor: string | null, secreto: string | undefined): boolean {
  if (!secreto || !valor?.startsWith('Bearer ')) return false
  const recibido = Buffer.from(valor.slice(7))
  const esperado = Buffer.from(secreto)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

/**
 * No borra datos: Vercel Preview no ejecuta cron y ningún programador está
 * activado en staging. El host autorizado futuro podrá invocar sólo este ensayo
 * hasta que una persona confirme la previsualización administrativa.
 */
export async function GET(req: Request) {
  if (process.env.ASSISTANT_RETENTION_CRON_ENABLED !== 'true' || !autorizado(req.headers.get('authorization'), process.env.CRON_SECRET)) return new NextResponse(null, { status: 404 })
  const preview = await previsualizarPurga({ actorId: null })
  return NextResponse.json({ ok: true, ensayo: true, preview: { accion: preview.accion, objetivoTipo: preview.objetivoTipo, corteAt: preview.corteAt, recuentos: preview.recuentos, reviewHash: preview.reviewHash } })
}
