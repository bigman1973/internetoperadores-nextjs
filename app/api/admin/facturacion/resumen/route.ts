import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { readMonthlyInvoicing } from '@/lib/finanzas/monthly-invoicing-db'

export const dynamic = 'force-dynamic'
const PRIVATE = { 'Cache-Control': 'private, no-store' }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
function strictMonth(params: URLSearchParams): string | null {
  const keys = [...params.keys()]
  if (keys.some(key => key !== 'mes') || params.getAll('mes').length > 1) throw new Error('Sólo se admite mes=YYYY-MM una sola vez.')
  const mes = params.get('mes'); if (mes !== null && !MONTH.test(mes)) throw new Error('mes debe tener formato YYYY-MM.'); return mes
}
/** Sólo histórico ISP/remesas; B7 sigue siendo el único cálculo de cobro/pendiente. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const denied = await checkAdminAreaRead('admin.facturacion', [], session)
    if (denied) { denied.headers.set('Cache-Control', PRIVATE['Cache-Control']); return denied }
    const userId = Number(session!.user.id); const actor = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } })
    if (!actor?.activo) return NextResponse.json({ error: 'Usuario no activo.' }, { status: 403, headers: PRIVATE })
    const mes = strictMonth(request.nextUrl.searchParams)
    await assertFinanceRuntimeReady()
    const data = await readMonthlyInvoicing(prisma, { mes })
    return NextResponse.json({ recurso: 'resumenFacturacionIspHistorico', query: { mes }, ...data }, { headers: PRIVATE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo leer el resumen mensual ISP.'
    const invalid = /mes|admite|límite|acota/i.test(message)
    return NextResponse.json({ error: invalid ? message : 'No se pudo leer el resumen mensual ISP. No se sustituyen datos por ceros.' }, { status: invalid ? 400 : 500, headers: PRIVATE })
  }
}
