import { NextResponse } from 'next/server'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

/** B7: una remesa ni el estado ISP acreditan un cobro; esta acción no hace DML. */
export async function POST() {
  const denied = await checkAdminAreaRead('admin.finanzas.conciliacion')
  if (denied) { denied.headers.set('Cache-Control', headers['Cache-Control']); return denied }
  return NextResponse.json({
    error: 'ACCIÓN_DESACTIVADA_B7',
    mensaje: 'Los cobros se calculan exclusivamente desde los vínculos bancarios B4 y las relaciones explícitas B6. No se marcan facturas cobradas por serie, mes o estado de ISP Gestión.',
  }, { status: 410, headers })
}
