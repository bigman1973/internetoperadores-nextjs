import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// POST /api/revalidate-tarifas - Force revalidation of public tarifa pages
export async function POST() {
  try {
    revalidatePath('/tarifas/empresa', 'page');
    revalidatePath('/tarifas/particular', 'page');
    return NextResponse.json({ 
      success: true, 
      message: 'Tarifas web revalidadas correctamente',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error revalidando tarifas:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error revalidando' },
      { status: 500 }
    );
  }
}
