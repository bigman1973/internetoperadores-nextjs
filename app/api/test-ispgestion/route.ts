import { NextResponse } from 'next/server';
import { testConnection } from '../../../lib/ispgestion/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await testConnection();
    return NextResponse.json({ 
      success: true, 
      message: 'Conexión con ISPGestión probada',
      result 
    });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
