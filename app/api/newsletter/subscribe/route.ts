import { NextRequest, NextResponse } from 'next/server';

const HUBSPOT_TOKEN = (process.env.HUBSPOT_API_KEY || '').trim();
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();

// IDs de las listas de HubSpot (ILS IDs)
const HUBSPOT_LISTA_EMPRESAS = '489';
const HUBSPOT_LISTA_PARTICULARES = '490';
const HUBSPOT_LISTA_PARTNERS = '495';

// IDs de las listas de Brevo
const BREVO_LISTA_EMPRESAS = 30;
const BREVO_LISTA_PARTICULARES = 31;
const BREVO_LISTA_PARTNERS = 32;

/**
 * Crea o actualiza un contacto en Brevo y lo añade a la lista correspondiente
 */
async function addToBrevo(email: string, nombre: string, telefono: string, tipo: string): Promise<{ success: boolean; error?: string }> {
  if (!BREVO_API_KEY) {
    console.warn('[Newsletter] BREVO_API_KEY no configurada, saltando Brevo');
    return { success: false, error: 'BREVO_API_KEY no configurada' };
  }

  const listId = tipo === 'partners' ? BREVO_LISTA_PARTNERS : tipo === 'particulares' ? BREVO_LISTA_PARTICULARES : BREVO_LISTA_EMPRESAS;

  const attributes: Record<string, string> = {
    NOMBRE: nombre,
  };

  if (telefono && telefono.trim()) {
    attributes.TELEFONO = telefono.trim();
  }

  try {
    // Intentar crear el contacto
    const createRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: [listId],
        updateEnabled: true, // Si ya existe, actualiza y añade a la lista
      }),
    });

    console.log('[Newsletter] Brevo create response status:', createRes.status);

    if (createRes.ok || createRes.status === 204) {
      console.log('[Newsletter] Contacto añadido/actualizado en Brevo:', email);
      return { success: true };
    }

    // Si el contacto ya existe (duplicate_parameter), actualizar la lista
    if (createRes.status === 400) {
      const errData = await createRes.json();
      if (errData.code === 'duplicate_parameter') {
        // Añadir a la lista manualmente
        const addRes = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/add`, {
          method: 'POST',
          headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ emails: [email] }),
        });

        if (addRes.ok) {
          console.log('[Newsletter] Contacto existente añadido a lista Brevo:', email);
          return { success: true };
        }
      }

      console.error('[Newsletter] Error Brevo:', errData);
      return { success: false, error: JSON.stringify(errData) };
    }

    const errText = await createRes.text();
    console.error('[Newsletter] Error Brevo:', createRes.status, errText);
    return { success: false, error: errText };
  } catch (error) {
    console.error('[Newsletter] Error conexión Brevo:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Crea o actualiza un contacto en HubSpot y lo añade a la lista correspondiente
 */
async function addToHubSpot(email: string, nombre: string, telefono: string, tipo: string): Promise<{ success: boolean; contactId?: string; error?: string }> {
  if (!HUBSPOT_TOKEN) {
    console.warn('[Newsletter] HUBSPOT_API_KEY no configurada, saltando HubSpot');
    return { success: false, error: 'HUBSPOT_API_KEY no configurada' };
  }

  try {
    // 1. Crear o actualizar contacto en HubSpot
    const properties: Record<string, string> = {
      email,
      firstname: nombre,
      lifecyclestage: 'subscriber',
      hs_lead_status: 'NEW',
    };

    if (telefono && telefono.trim()) {
      properties.phone = telefono.trim();
    }

    console.log('[Newsletter] Creando contacto en HubSpot:', email);

    const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    let contactId: string = '';

    if (contactRes.status === 409) {
      // Contacto ya existe - obtener su ID
      const conflictData = await contactRes.json();
      contactId = conflictData.message?.match(/Existing ID: (\d+)/)?.[1] || '';

      if (!contactId) {
        const idMatch = JSON.stringify(conflictData).match(/(\d{8,})/);
        contactId = idMatch?.[1] || '';
      }

      if (!contactId) {
        // Buscar por email
        const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
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
        });
        const searchData = await searchRes.json();
        contactId = searchData.results?.[0]?.id || '';
      }

      // Actualizar propiedades del contacto existente
      if (contactId) {
        const updateProps: Record<string, string> = { firstname: nombre };
        if (telefono && telefono.trim()) {
          updateProps.phone = telefono.trim();
        }
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: updateProps }),
        });
      }
    } else if (contactRes.ok) {
      const contactData = await contactRes.json();
      contactId = contactData.id;
      console.log('[Newsletter] Contacto creado en HubSpot con ID:', contactId);
    } else {
      const errText = await contactRes.text();
      console.error('[Newsletter] Error HubSpot creando contacto:', contactRes.status, errText);

      // Si es error 401, token expirado
      if (contactRes.status === 401) {
        return { success: false, error: 'Token HubSpot expirado' };
      }

      // Si es error 400, reintentar sin lifecyclestage
      if (contactRes.status === 400) {
        const simpleProperties: Record<string, string> = { email, firstname: nombre };
        if (telefono && telefono.trim()) {
          simpleProperties.phone = telefono.trim();
        }

        const retryRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties: simpleProperties }),
        });

        if (retryRes.status === 409) {
          const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              filterGroups: [{
                filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
              }],
            }),
          });
          const searchData = await searchRes.json();
          contactId = searchData.results?.[0]?.id || '';
        } else if (retryRes.ok) {
          const retryData = await retryRes.json();
          contactId = retryData.id;
        } else {
          return { success: false, error: 'Error creando contacto en HubSpot' };
        }
      } else {
        return { success: false, error: `HubSpot error ${contactRes.status}` };
      }
    }

    if (!contactId) {
      return { success: false, error: 'No se pudo identificar el contacto en HubSpot' };
    }

    // 2. Añadir contacto a la lista correspondiente
    const listaId = tipo === 'partners' ? HUBSPOT_LISTA_PARTNERS : tipo === 'particulares' ? HUBSPOT_LISTA_PARTICULARES : HUBSPOT_LISTA_EMPRESAS;

    await fetch(`https://api.hubapi.com/crm/v3/lists/${listaId}/memberships/add`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([contactId]),
    });

    console.log('[Newsletter] Contacto añadido a lista HubSpot:', contactId);
    return { success: true, contactId };
  } catch (error) {
    console.error('[Newsletter] Error HubSpot:', error);
    return { success: false, error: String(error) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, nombre, telefono, tipo } = await request.json();

    if (!email || !nombre) {
      return NextResponse.json(
        { error: 'Email y nombre son obligatorios' },
        { status: 400 }
      );
    }

    // Ejecutar ambas integraciones en paralelo
    const [brevoResult, hubspotResult] = await Promise.all([
      addToBrevo(email, nombre, telefono || '', tipo || 'empresas'),
      addToHubSpot(email, nombre, telefono || '', tipo || 'empresas'),
    ]);

    // Si al menos una funcionó, consideramos éxito
    if (brevoResult.success || hubspotResult.success) {
      console.log('[Newsletter] Suscripción completada:', email, 
        '| Brevo:', brevoResult.success ? 'OK' : 'FAIL',
        '| HubSpot:', hubspotResult.success ? 'OK' : 'FAIL');
      
      return NextResponse.json({
        success: true,
        contactId: hubspotResult.contactId || '',
        brevo: brevoResult.success,
        hubspot: hubspotResult.success,
      });
    }

    // Si ambas fallaron
    console.error('[Newsletter] Ambas integraciones fallaron:', {
      brevo: brevoResult.error,
      hubspot: hubspotResult.error,
    });

    return NextResponse.json(
      { error: 'Error al registrar el contacto' },
      { status: 500 }
    );
  } catch (error) {
    console.error('[Newsletter] Error en suscripción newsletter:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
