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
  } catch (error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'ISP_ORIGEN_NO_EDITABLE' || code === 'ISP_SNAPSHOT_INVALID' || code === 'ISP_SNAPSHOT_INCOMPLETE') return NextResponse.json({ success: false, error: 'La operación ISP no se ha completado. Revisa los permisos y los datos de origen.', code }, { status: 409 })
    if (code === 'ISP_SYNC_UNAUTHORIZED' || code === 'ISP_SYNC_READ_ONLY' || code === 'ISP_READ_ONLY') return NextResponse.json({ success: false, error: 'La operación ISP no se ha completado. Revisa los permisos y los datos de origen.', code }, { status: 403 })
    console.error('No se pudo completar la sincronización ISP.');
    return NextResponse.json({ success: false, error: 'No se pudo completar la sincronización ISP.' }, { status: 500 });
  }
}
