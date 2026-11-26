import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Integración retirada: conservar la autenticación y la ACL del middleware,
// pero no consultar claves ni llamar a HubSpot, aunque vuelva a existir una clave.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  return NextResponse.json(
    { success: false, code: 'HUBSPOT_RETIRED', error: 'Integracion HubSpot retirada', message: 'Integracion HubSpot retirada' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}

// El POST conserva la misma comprobación de sesión que el GET; no crea pipelines.
export async function POST() {
  return GET();
}
