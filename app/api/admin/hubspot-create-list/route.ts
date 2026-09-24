import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { verificarPermisoServer } from '@/lib/permisos';

const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();

async function authorize(tipo: 'lectura' | 'escritura') {
  const session = await getServerSession(authOptions);
  if (!session || session.user.userType !== 'admin' || !session.user.id) return null;
  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.listas', session.user.role);
  return permission[tipo] ? session : null;
}

export async function GET(request: Request) {
  try {
    if (!await authorize('lectura')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    const url = new URL(request.url);
    const name = url.searchParams.get('name');

    // Buscar lista por nombre
    const res = await fetch('https://api.hubapi.com/crm/v3/lists/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: name || '',
        count: 50,
      }),
    });

    const data = await res.json();
    console.log('[HubSpot] Search lists response:', res.status);

    if (res.ok) {
      const lists = data.lists?.map((l: any) => ({ listId: l.listId, name: l.name, listVersion: l.listVersion })) || [];
      return NextResponse.json({ success: true, lists });
    } else {
      return NextResponse.json({ success: false, status: res.status, error: data }, { status: res.status });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!await authorize('escritura')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Falta el nombre de la lista' }, { status: 400 });
    }

    if (!HUBSPOT_API_KEY) {
      return NextResponse.json({ error: 'HUBSPOT_API_KEY no configurada' }, { status: 500 });
    }

    // Crear lista estática en HubSpot
    const res = await fetch('https://api.hubapi.com/crm/v3/lists', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: name,
        objectTypeId: '0-1', // Contactos
        processingType: 'MANUAL', // Lista estática
      }),
    });

    const data = await res.json();
    console.log('[HubSpot] Crear lista response:', res.status, JSON.stringify(data));

    if (res.ok) {
      return NextResponse.json({
        success: true,
        listId: data.listId,
        name: data.name,
        message: `Lista "${name}" creada con ID: ${data.listId}`,
      });
    } else {
      return NextResponse.json({
        success: false,
        status: res.status,
        error: data,
      }, { status: res.status });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
