import { NextResponse } from 'next/server';
import { syncFacturas, syncRemesas } from '@/lib/ispgestion/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST() {
  try {
    // Sincronizar facturas y remesas en paralelo
    const [facturasResult, remesasResult] = await Promise.all([
      syncFacturas(),
      syncRemesas()
    ]);

    return NextResponse.json({
      success: true,
      facturas: facturasResult,
      remesas: remesasResult
    });
  } catch (error: any) {
    console.error('Error en sincronización de facturación:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error desconocido' },
      { status: 500 }
    );
  }
}
