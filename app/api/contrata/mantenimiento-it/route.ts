import { NextResponse } from 'next/server';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_LIST_MANTENIMIENTO = '502'; // Lista "IO-MANTENIMIENTO-IT"
const HUBSPOT_LIST_NEWSLETTER_EMPRESAS = '489';
const BREVO_LIST_NEWSLETTER_EMPRESAS = 30;

async function sendBrevoEmail(to: { email: string; name: string }, subject: string, htmlContent: string) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'noreply@internetoperadores.com' },
        to: [to],
        subject,
        htmlContent,
      }),
    });
    return res.ok;
  } catch { return false; }
}

async function addToHubSpot(email: string, nombre: string, empresa: string, telefono: string, listIds: string[], nota: string) {
  if (!HUBSPOT_API_KEY) {
    console.warn('[MANTENIMIENTO-IT] HUBSPOT_API_KEY no configurada');
    return false;
  }

  try {
    const properties: Record<string, string> = {
      email,
      firstname: nombre,
      company: empresa,
      lifecyclestage: 'subscriber',
      hs_lead_status: 'NEW',
    };
    if (telefono && telefono.trim()) {
      properties.phone = telefono.trim();
    }

    console.log('[MANTENIMIENTO-IT] Creando contacto en HubSpot:', email);

    const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    });

    let contactId: string = '';

    if (contactRes.status === 409) {
      const conflictData = await contactRes.json();
      contactId = conflictData.message?.match(/Existing ID: (\d+)/)?.[1] || '';

      if (!contactId) {
        const idMatch = JSON.stringify(conflictData).match(/(\d{8,})/);
        contactId = idMatch?.[1] || '';
      }

      if (!contactId) {
        const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST',
          headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }] }),
        });
        const searchData = await searchRes.json();
        contactId = searchData.results?.[0]?.id || '';
      }

      if (contactId) {
        const updateProps: Record<string, string> = { firstname: nombre, company: empresa };
        if (telefono && telefono.trim()) updateProps.phone = telefono.trim();
        await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: updateProps }),
        });
      }
      console.log('[MANTENIMIENTO-IT] Contacto existente encontrado:', contactId);
    } else if (contactRes.ok) {
      const contactData = await contactRes.json();
      contactId = contactData.id;
      console.log('[MANTENIMIENTO-IT] Contacto creado con ID:', contactId);
    } else {
      const errText = await contactRes.text();
      console.error('[MANTENIMIENTO-IT] Error HubSpot creando contacto:', contactRes.status, errText);

      if (contactRes.status === 400) {
        const simpleProps: Record<string, string> = { email, firstname: nombre, company: empresa };
        if (telefono && telefono.trim()) simpleProps.phone = telefono.trim();

        const retryRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ properties: simpleProps }),
        });

        if (retryRes.status === 409) {
          const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }] }),
          });
          const searchData = await searchRes.json();
          contactId = searchData.results?.[0]?.id || '';
        } else if (retryRes.ok) {
          const retryData = await retryRes.json();
          contactId = retryData.id;
        }
      }
    }

    if (!contactId) {
      console.error('[MANTENIMIENTO-IT] No se pudo obtener contactId para:', email);
      return false;
    }

    // Añadir a listas
    for (const listId of listIds) {
      const listRes = await fetch(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships/add`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([contactId]),
      });
      const listText = await listRes.text();
      console.log(`[MANTENIMIENTO-IT] Lista ${listId} response: ${listRes.status} - ${listText}`);
    }

    // Crear nota
    if (nota) {
      await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { hs_note_body: nota, hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
        }),
      });
    }

    return true;
  } catch (error) {
    console.error('[MANTENIMIENTO-IT] Error HubSpot:', error);
    return false;
  }
}

async function addToBrevoNewsletter(email: string, nombre: string, empresa: string, telefono: string) {
  try {
    const createRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        attributes: { NOMBRE: nombre, EMPRESA: empresa, TELEFONO: telefono },
        listIds: [BREVO_LIST_NEWSLETTER_EMPRESAS],
        updateEnabled: true,
      }),
    });

    if (createRes.ok || createRes.status === 204) return true;

    if (createRes.status === 400) {
      const errData = await createRes.json();
      if (errData.code === 'duplicate_parameter') {
        const addRes = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST_NEWSLETTER_EMPRESAS}/contacts/add`, {
          method: 'POST',
          headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: [email] }),
        });
        return addRes.ok;
      }
    }

    return false;
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nombre, email, empresa, telefono, numEquipos, numServidores, serviciosInteres, coberturaHoraria, equipoITInterno, produccion24h, sistemasCriticos, comentarios } = body;

    // Validaciones
    if (!nombre || !email || !empresa) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre, email y empresa' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'El email no es válido' },
        { status: 400 }
      );
    }

    // Normalizar servicios de interés
    const serviciosTexto = Array.isArray(serviciosInteres) ? serviciosInteres.join(', ') : (serviciosInteres || 'No indicado');

    // === EMAILS ===
    const emailComercialHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Nueva Solicitud de Servicios IT Gestionados</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Formulario Mantenimiento IT - Página Soluciones</p>
        </div>
        <div style="padding: 24px; background: #f9f9f9;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f3f4f6;"><td style="padding: 10px; font-weight: bold; color: #374151;">Nombre:</td><td style="padding: 10px; color: #1f2937;">${nombre}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold; color: #374151;">Empresa:</td><td style="padding: 10px; color: #1f2937;">${empresa}</td></tr>
            <tr style="background: #f3f4f6;"><td style="padding: 10px; font-weight: bold; color: #374151;">Email:</td><td style="padding: 10px; color: #1f2937;">${email}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold; color: #374151;">Teléfono:</td><td style="padding: 10px; color: #1f2937;">${telefono || 'No proporcionado'}</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h3 style="margin: 0 0 12px 0; color: #f97316; font-size: 16px;">Infraestructura y necesidades</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Nº equipos/PCs:</td><td style="padding: 8px; color: #1f2937;">${numEquipos || 'No indicado'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Nº servidores:</td><td style="padding: 8px; color: #1f2937;">${numServidores || 'No indicado'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Cobertura horaria:</td><td style="padding: 8px; color: #1f2937;">${coberturaHoraria || 'No indicado'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Producción 24h:</td><td style="padding: 8px; color: #1f2937;">${produccion24h || 'No indicado'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Equipo IT interno:</td><td style="padding: 8px; color: #1f2937;">${equipoITInterno || 'No indicado'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Sistemas críticos:</td><td style="padding: 8px; color: #1f2937;">${sistemasCriticos || 'No indicado'}</td></tr>
            </table>
          </div>
          ${serviciosTexto !== 'No indicado' ? `
          <div style="margin-top: 16px; padding: 16px; background: #fff7ed; border-radius: 8px; border: 1px solid #fed7aa;">
            <h3 style="margin: 0 0 8px 0; color: #ea580c; font-size: 14px;">Servicios de interés:</h3>
            <p style="margin: 0; color: #1f2937; font-size: 14px;">${serviciosTexto}</p>
          </div>
          ` : ''}
          ${comentarios ? `<div style="margin-top: 12px; padding: 12px; background: white; border-radius: 6px; border: 1px solid #e5e7eb;"><p style="margin: 0 0 4px 0; font-weight: bold; color: #374151;">Comentarios:</p><p style="margin: 0; color: #4b5563;">${comentarios}</p></div>` : ''}
          <p style="margin-top: 20px;"><a href="https://www.internetoperadores.com/admin" style="background: #f97316; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Ver en el panel</a></p>
        </div>
        <div style="background: #f9fafb; padding: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Internet Operadores © 2026</p>
        </div>
      </div>
    `;

    const emailInteresadoHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Solicitud recibida</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Servicios IT Gestionados</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #4b5563; line-height: 1.6;">Hola <strong>${nombre}</strong>,</p>
          <p style="color: #4b5563; line-height: 1.6;">Hemos recibido tu solicitud de <strong>Servicios IT Gestionados</strong> para <strong>${empresa}</strong>.</p>
          <p style="color: #4b5563; line-height: 1.6;">Nuestro equipo técnico analizará tu infraestructura y te contactará en un plazo máximo de <strong>24 horas</strong> con una propuesta personalizada.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Resumen de tu solicitud:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
              <li>Equipos/PCs: <strong>${numEquipos || 'No indicado'}</strong></li>
              <li>Servidores: <strong>${numServidores || 'No indicado'}</strong></li>
              <li>Cobertura horaria: <strong>${coberturaHoraria || 'No indicado'}</strong></li>
              <li>Producción 24h: <strong>${produccion24h || 'No indicado'}</strong></li>
              <li>Equipo IT interno: <strong>${equipoITInterno || 'No indicado'}</strong></li>
              ${serviciosTexto !== 'No indicado' ? `<li>Servicios de interés: <strong>${serviciosTexto}</strong></li>` : ''}
            </ul>
          </div>
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">¿Qué incluirá tu propuesta?</p>
            <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563; text-align: left; line-height: 1.8;">
              <li>Auditoría de tu infraestructura actual</li>
              <li>Plan de servicios IT adaptado a tu empresa</li>
              <li>SLA con tiempos de respuesta garantizados</li>
              <li>Presupuesto mensual sin sorpresas</li>
            </ul>
          </div>
          <p style="color: #4b5563; line-height: 1.6;">Si tienes alguna duda, no dudes en contactarnos:</p>
          <ul style="color: #4b5563;">
            <li>Tel: 900 730 034</li>
            <li>Email: comercial@internetoperadores.com</li>
          </ul>
          <p style="color: #4b5563;">Gracias por confiar en Internet Operadores.</p>
        </div>
        <div style="background: #f9fafb; padding: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Internet Operadores © 2026 — Todos los derechos reservados</p>
        </div>
      </div>
    `;

    // Enviar emails
    const emailPromises = [
      sendBrevoEmail({ email: 'comercial@internetoperadores.com', name: 'Comercial IO' }, `Nueva solicitud Servicios IT Gestionados - ${empresa}`, emailComercialHtml),
      sendBrevoEmail({ email: 'victor@internetoperadores.com', name: 'Victor' }, `Nueva solicitud Servicios IT Gestionados - ${empresa}`, emailComercialHtml),
      sendBrevoEmail({ email, name: nombre }, `Tu solicitud de Servicios IT ha sido recibida - Internet Operadores`, emailInteresadoHtml),
    ];

    // HubSpot: lista Mantenimiento IT + Newsletter Empresas
    const notaHubspot = `Solicitud de Servicios IT Gestionados\n- Equipos/PCs: ${numEquipos || 'No indicado'}\n- Servidores: ${numServidores || 'No indicado'}\n- Cobertura horaria: ${coberturaHoraria || 'No indicado'}\n- Producción 24h: ${produccion24h || 'No indicado'}\n- Equipo IT interno: ${equipoITInterno || 'No indicado'}\n- Sistemas críticos: ${sistemasCriticos || 'No indicado'}\n- Servicios de interés: ${serviciosTexto}\n- Comentarios: ${comentarios || 'Sin comentarios'}\n\nFecha: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`;

    const hubspotPromise = addToHubSpot(email, nombre, empresa, telefono, [HUBSPOT_LIST_MANTENIMIENTO, HUBSPOT_LIST_NEWSLETTER_EMPRESAS], notaHubspot);

    // Brevo: newsletter empresas
    const brevoPromise = addToBrevoNewsletter(email, nombre, empresa, telefono);

    // Ejecutar todo en paralelo y esperar
    await Promise.allSettled([...emailPromises, hubspotPromise, brevoPromise]);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[MANTENIMIENTO-IT] Error general:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
