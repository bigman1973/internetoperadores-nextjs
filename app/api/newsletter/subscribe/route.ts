import { NextRequest, NextResponse } from 'next/server';

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY || '';

// IDs de las listas de HubSpot (ILS IDs)
const LISTA_NEWSLETTER_EMPRESAS = '489';
const LISTA_NEWSLETTER_PARTICULARES = '490';

export async function POST(request: NextRequest) {
  try {
    const { email, nombre, telefono, tipo } = await request.json();

    if (!email || !nombre) {
      return NextResponse.json(
        { error: 'Email y nombre son obligatorios' },
        { status: 400 }
      );
    }

    if (!HUBSPOT_TOKEN) {
      console.error('HUBSPOT_API_KEY no configurada');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // 1. Crear o actualizar contacto en HubSpot
    const properties: Record<string, string> = {
      email,
      firstname: nombre,
      lifecyclestage: 'subscriber',
      hs_lead_status: 'NEW',
    };

    // Añadir teléfono si se proporcionó
    if (telefono && telefono.trim()) {
      properties.phone = telefono.trim();
    }

    const contactPayload = { properties };

    const contactRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/contacts',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contactPayload),
      }
    );

    let contactId: string;

    if (contactRes.status === 409) {
      // Contacto ya existe - obtener su ID
      const conflictData = await contactRes.json();
      contactId = conflictData.message?.match(/Existing ID: (\d+)/)?.[1] || '';
      
      if (!contactId) {
        // Buscar por email
        const searchRes = await fetch(
          `https://api.hubapi.com/crm/v3/objects/contacts/search`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filterGroups: [{
                filters: [{
                  propertyName: 'email',
                  operator: 'EQ',
                  value: email,
                }],
              }],
            }),
          }
        );
        const searchData = await searchRes.json();
        contactId = searchData.results?.[0]?.id || '';
      }
    } else if (contactRes.ok) {
      const contactData = await contactRes.json();
      contactId = contactData.id;
    } else {
      const errData = await contactRes.json();
      console.error('Error creando contacto:', errData);
      return NextResponse.json(
        { error: 'Error al registrar el contacto' },
        { status: 500 }
      );
    }

    if (!contactId) {
      return NextResponse.json(
        { error: 'No se pudo identificar el contacto' },
        { status: 500 }
      );
    }

    // 2. Añadir contacto a la lista correspondiente
    const listaId = tipo === 'particulares'
      ? LISTA_NEWSLETTER_PARTICULARES
      : LISTA_NEWSLETTER_EMPRESAS;

    const addToListRes = await fetch(
      `https://api.hubapi.com/crm/v3/lists/${listaId}/memberships/add`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([contactId]),
      }
    );

    if (!addToListRes.ok) {
      const listErr = await addToListRes.json();
      console.error('Error añadiendo a lista:', listErr);
      // No fallar si el contacto ya está en la lista
    }

    return NextResponse.json({ success: true, contactId });
  } catch (error) {
    console.error('Error en suscripción newsletter:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
