import { NextResponse } from 'next/server';

/** El endpoint de diagnóstico histórico exponía contenido salarial y ya no debe usarse. */
export async function GET() {
  return NextResponse.json({ error: 'No disponible' }, { status: 404 });
}
