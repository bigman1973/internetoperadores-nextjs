import { NextResponse } from 'next/server';
import { syncContratos } from '../../../lib/ispgestion/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutos para la sincronización

export async function POST() {
  try {
    const result = await syncContratos();
    return NextResponse.json({ 
      success: true, 
      message: 'Sincronización de contratos completada',
      ...result 
    });
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'ISP_ORIGEN_NO_EDITABLE' || code === 'ISP_SNAPSHOT_INVALID' || code === 'ISP_SNAPSHOT_INCOMPLETE') return NextResponse.json({ success: false, error: 'La operación ISP no se ha completado. Revisa los permisos y los datos de origen.', code }, { status: 409 })
    if (code === 'ISP_SYNC_UNAUTHORIZED' || code === 'ISP_SYNC_READ_ONLY' || code === 'ISP_READ_ONLY') return NextResponse.json({ success: false, error: 'La operación ISP no se ha completado. Revisa los permisos y los datos de origen.', code }, { status: 403 })
    console.error('No se pudo completar la sincronización ISP.');
    return NextResponse.json({ success: false, error: 'No se pudo completar la sincronización ISP.' }, { status: 500 });
  }
}
