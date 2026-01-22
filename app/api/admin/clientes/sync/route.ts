import { NextResponse } from 'next/server';
import { syncClients } from '@/lib/ispgestion/service';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await syncClients();
    return NextResponse.json({ 
      success: true, 
      message: 'Sincronización completada',
      ...result 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
