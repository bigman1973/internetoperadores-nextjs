import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verificarPermisoServer } from '@/lib/permisos';

export const dynamic = 'force-dynamic';

async function authorize(tipo: 'lectura' | 'escritura') {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'admin' || !session.user.id) return null;
  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.listas', session.user.role);
  return permission[tipo] ? session : null;
}

// Integración retirada: la autorización sigue precediendo a la respuesta.
// No se lee el cuerpo, se consultan claves ni se llama a HubSpot.
function retiredResponse() {
  return NextResponse.json(
    { success: false, code: 'HUBSPOT_RETIRED', error: 'Integracion HubSpot retirada', message: 'Integracion HubSpot retirada' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET() {
  try {
    if (!await authorize('lectura')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    return retiredResponse();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (!await authorize('escritura')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    return retiredResponse();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
