import { NextResponse } from 'next/server';
import { syncFacturasBatch, syncRemesasBatch } from '@/lib/ispgestion/sync-facturas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    // Ambas cargas tienen transacciones independientes; esperar las dos no implica rollback conjunto.
    const results = await Promise.allSettled([
      syncFacturasBatch(),
      syncRemesasBatch()
    ]);

    const failed = results.find(result => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
    const facturasResult = results[0].status === 'fulfilled' ? results[0].value : null;
    const remesasResult = results[1].status === 'fulfilled' ? results[1].value : null;
    return NextResponse.json({
      success: true,
      facturas: facturasResult,
      remesas: remesasResult
    });
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'ISP_ORIGEN_NO_EDITABLE' || code === 'ISP_SNAPSHOT_INVALID' || code === 'ISP_SNAPSHOT_INCOMPLETE') return NextResponse.json({ success: false, error: 'La sincronización de facturas/remesas no se ha completado. Revisa el recibo y el estado de ambas cargas.', code }, { status: 409 })
    if (code === 'ISP_SYNC_UNAUTHORIZED' || code === 'ISP_SYNC_READ_ONLY' || code === 'ISP_READ_ONLY') return NextResponse.json({ success: false, error: 'La sincronización de facturas/remesas no se ha completado. Revisa el recibo y el estado de ambas cargas.', code }, { status: 403 })
    console.error('No se pudo completar la sincronización ISP.');
    return NextResponse.json({ success: false, error: 'La sincronización de facturas/remesas no se ha completado. Revisa el recibo y el estado de ambas cargas.' }, { status: 500 });
  }
}
