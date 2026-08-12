import { NextResponse } from 'next/server';

// Este cron se ejecuta cada 3 días para mantener el proyecto de Supabase activo
// y evitar que se pause por inactividad (Supabase Free pausa a los 7 días)
const SUPABASE_URL = 'https://gjdfjawxpneglbivplfs.supabase.co';

export async function GET() {
  try {
    // Hacer un request simple al storage público para generar actividad
    const response = await fetch(
      `${SUPABASE_URL}/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-WIN.exe`,
      { method: 'HEAD' }
    );

    const status = response.status;
    const timestamp = new Date().toISOString();

    console.log(`[keep-supabase-alive] Ping at ${timestamp} - Status: ${status}`);

    return NextResponse.json({
      success: true,
      timestamp,
      supabaseStatus: status,
      message: 'Supabase project kept alive successfully'
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[keep-supabase-alive] Error: ${errorMessage}`);
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
