import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../lib/auth';
import { verificarPermisoServer } from '../../../lib/permisos';
import { syncClients } from '../../../lib/ispgestion/service';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ success: false, error: 'No autorizado' }, { status: 401 });
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.clientes', session.user.role);
  if (!permission.escritura) {
    return NextResponse.json({ success: false, error: 'No tienes permiso para sincronizar clientes' }, { status: 403 });
  }

  try {
    const result = await syncClients();
    return NextResponse.json({ 
      success: true, 
      message: 'Sincronización completada',
      ...result 
    });
  } catch (error: any) {
    console.error('Error en API de sincronización:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}
