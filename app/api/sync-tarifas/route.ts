import { NextResponse } from 'next/server';
import { syncTarifas } from '@/lib/ispgestion/service';

export const maxDuration = 300; // 5 minutos máximo

export async function POST() {
  try {
    console.log('[API] Iniciando sincronización de tarifas desde ISP Gestión...');
    const result = await syncTarifas();
    console.log('[API] Sincronización de tarifas completada:', result);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Error en sync-tarifas:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error sincronizando tarifas' },
      { status: 500 }
    );
  }
}
