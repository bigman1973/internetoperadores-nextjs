import { NextResponse } from 'next/server';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_LIST_COMUNICACIONES = '482'; // Lista "IO — Comunicaciones Unificadas"
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
  try {
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }] }),
    });
    const searchData = await searchRes.json();
    let contactId: string;

    if (searchData.results && searchData.results.length > 0) {
      contactId = searchData.results[0].id;
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { firstname: nombre, company: empresa, phone: telefono } }),
      });
    } else {
      const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { email, firstname: nombre, company: empresa, phone: telefono } }),
      });
      const createData = await createRes.json();
      contactId = createData.id;
    }

    for (const listId of listIds) {
      const listRes = await fetch(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships/add`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([contactId]),
      });
      console.log(`HubSpot lista ${listId} response:`, listRes.status, await listRes.text());
    }

    if (nota) {
      await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { hs_note_body: nota, hs_timestamp: new Date().toISOString() },
          associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }],
        }),
      });
    }

    return true;
  } catch { return false; }
}

async function addToBrevoNewsletter(email: string, nombre: string, empresa: string, telefono: string) {
  try {
    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        attributes: { NOMBRE: nombre, EMPRESA: empresa, TELEFONO: telefono },
        listIds: [BREVO_LIST_NEWSLETTER_EMPRESAS],
        updateEnabled: true,
      }),
    });
    return res.ok || res.status === 204;
  } catch { return false; }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { nombre, email, empresa, telefono, numEmpleados, centralitaActual, funcionalidades, modalidadTrabajo, operadorActual, comentarios } = body;

    // Validaciones
    if (!nombre || !email || !empresa || !numEmpleados) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre, email, empresa y número de empleados' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'El email no es válido' },
        { status: 400 }
      );
    }

    // Formatear funcionalidades para el email
    const funcionalidadesTexto = Array.isArray(funcionalidades) && funcionalidades.length > 0
      ? funcionalidades.join(', ')
      : 'No especificadas';

    // === EMAILS ===
    const emailComercialHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Nueva Solicitud de Comunicaciones Unificadas</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Formulario - Página Soluciones</p>
        </div>
        <div style="padding: 24px; background: #f9f9f9;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr style="background: #f3f4f6;"><td style="padding: 10px; font-weight: bold; color: #374151;">Nombre:</td><td style="padding: 10px; color: #1f2937;">${nombre}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold; color: #374151;">Empresa:</td><td style="padding: 10px; color: #1f2937;">${empresa}</td></tr>
            <tr style="background: #f3f4f6;"><td style="padding: 10px; font-weight: bold; color: #374151;">Email:</td><td style="padding: 10px; color: #1f2937;">${email}</td></tr>
            <tr><td style="padding: 10px; font-weight: bold; color: #374151;">Teléfono:</td><td style="padding: 10px; color: #1f2937;">${telefono || 'No proporcionado'}</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;">
            <h3 style="margin: 0 0 12px 0; color: #f97316; font-size: 16px;">Datos del proyecto</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Nº empleados:</td><td style="padding: 8px; color: #1f2937;">${numEmpleados}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Centralita actual:</td><td style="padding: 8px; color: #1f2937;">${centralitaActual || 'No indicada'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Funcionalidades:</td><td style="padding: 8px; color: #1f2937;">${funcionalidadesTexto}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Modalidad trabajo:</td><td style="padding: 8px; color: #1f2937;">${modalidadTrabajo || 'No indicada'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Operador actual:</td><td style="padding: 8px; color: #1f2937;">${operadorActual || 'No indicado'}</td></tr>
            </table>
            ${comentarios ? `<div style="margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 6px;"><p style="margin: 0 0 4px 0; font-weight: bold; color: #374151;">Comentarios:</p><p style="margin: 0; color: #4b5563;">${comentarios}</p></div>` : ''}
          </div>
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
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Comunicaciones Unificadas</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #4b5563; line-height: 1.6;">Hola <strong>${nombre}</strong>,</p>
          <p style="color: #4b5563; line-height: 1.6;">Hemos recibido tu solicitud de información sobre <strong>Comunicaciones Unificadas</strong> para <strong>${empresa}</strong>.</p>
          <p style="color: #4b5563; line-height: 1.6;">Nuestro equipo de expertos en comunicaciones analizará tus necesidades y te contactará en un plazo máximo de <strong>24 horas</strong> con una propuesta personalizada.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Resumen de tu solicitud:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
              <li>Empleados: <strong>${numEmpleados}</strong></li>
              <li>Centralita actual: <strong>${centralitaActual || 'No indicada'}</strong></li>
              <li>Modalidad: <strong>${modalidadTrabajo || 'No indicada'}</strong></li>
              <li>Funcionalidades: <strong>${funcionalidadesTexto}</strong></li>
            </ul>
          </div>
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">¿Qué incluirá tu propuesta?</p>
            <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563; text-align: left; line-height: 1.8;">
              <li>Comparativa de soluciones (Wildix, Zoom, Teams) adaptada a tu caso</li>
              <li>Presupuesto detallado con coste por usuario/mes</li>
              <li>Plan de implementación y migración</li>
              <li>Demo gratuita de la plataforma recomendada</li>
            </ul>
          </div>
          <p style="color: #4b5563; line-height: 1.6;">Si tienes alguna duda, no dudes en contactarnos:</p>
          <ul style="color: #4b5563;">
            <li>📞 900 730 034</li>
            <li>📧 comercial@internetoperadores.com</li>
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
      sendBrevoEmail({ email: 'comercial@internetoperadores.com', name: 'Comercial IO' }, `Nueva solicitud Comunicaciones Unificadas - ${empresa} (${numEmpleados} empleados)`, emailComercialHtml),
      sendBrevoEmail({ email: 'victor@internetoperadores.com', name: 'Victor' }, `Nueva solicitud Comunicaciones Unificadas - ${empresa} (${numEmpleados} empleados)`, emailComercialHtml),
      sendBrevoEmail({ email, name: nombre }, `Tu solicitud de Comunicaciones Unificadas ha sido recibida - Internet Operadores`, emailInteresadoHtml),
    ];

    // HubSpot: lista Comunicaciones Unificadas + Newsletter Empresas
    const notaHubspot = `Solicitud de Comunicaciones Unificadas\n- Empleados: ${numEmpleados}\n- Centralita actual: ${centralitaActual || 'N/A'}\n- Funcionalidades: ${funcionalidadesTexto}\n- Modalidad: ${modalidadTrabajo || 'N/A'}\n- Operador actual: ${operadorActual || 'N/A'}\n- Comentarios: ${comentarios || 'N/A'}\n- Origen: Página Soluciones Comunicaciones Unificadas`;
    const integrationPromises = [
      addToHubSpot(email, nombre, empresa, telefono || '', [HUBSPOT_LIST_COMUNICACIONES, HUBSPOT_LIST_NEWSLETTER_EMPRESAS], notaHubspot),
      addToBrevoNewsletter(email, nombre, empresa, telefono || ''),
    ];

    // Ejecutar todas las integraciones antes de responder
    await Promise.allSettled([...emailPromises, ...integrationPromises]);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: any) {
    console.error('Error al procesar solicitud de comunicaciones unificadas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
