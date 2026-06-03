import { NextResponse } from 'next/server';

const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();

// Endpoint temporal para crear listas en HubSpot
// Uso: POST /api/admin/hubspot-create-list { "name": "IO-UCAAS", "secret": "crear-lista-2026" }
export async function POST(request: Request) {
  try {
    const { name, secret } = await request.json();

    // Protección básica
    if (secret !== 'crear-lista-2026') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

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
