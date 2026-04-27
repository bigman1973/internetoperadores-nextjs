export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getTarifasSolucionEmpresa } from '../../../lib/tarifas-web';

export async function GET(request: NextRequest) {
  try {
    const solucion = request.nextUrl.searchParams.get('solucion');
    
    if (!solucion) {
      return NextResponse.json({ error: 'Parámetro solucion requerido' }, { status: 400 });
    }

    const data = await getTarifasSolucionEmpresa(solucion);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching tarifas solucion:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
