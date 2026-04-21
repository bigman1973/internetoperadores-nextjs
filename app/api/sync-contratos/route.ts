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
  } catch (error: any) {
    console.error('Error en API de sincronización de contratos:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
