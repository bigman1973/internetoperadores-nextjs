import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_LIST_INFRAESTRUCTURA = '505'; // Lista "IO-INFRAESTRUCTURA-RED"
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
    console.warn('[INFRAESTRUCTURA-RED] HUBSPOT_API_KEY no configurada');
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

    console.log('[INFRAESTRUCTURA-RED] Creando contacto en HubSpot:', email);

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
      console.log('[INFRAESTRUCTURA-RED] Contacto existente encontrado:', contactId);
    } else if (contactRes.ok) {
      const contactData = await contactRes.json();
      contactId = contactData.id;
      console.log('[INFRAESTRUCTURA-RED] Contacto creado con ID:', contactId);
    } else {
      const errText = await contactRes.text();
      console.error('[INFRAESTRUCTURA-RED] Error HubSpot creando contacto:', contactRes.status, errText);

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
      console.error('[INFRAESTRUCTURA-RED] No se pudo obtener contactId para:', email);
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
      console.log(`[INFRAESTRUCTURA-RED] Lista ${listId} response: ${listRes.status} - ${listText}`);
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
    console.error('[INFRAESTRUCTURA-RED] Error HubSpot:', error);
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
    const { nombre, email, empresa, telefono, tipoProyecto, numUsuarios, superficieM2, numPlantas, servicios, infraestructuraActual, fabricantePreferido, comentarios } = body;

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

    // Formatear servicios para el email
    const serviciosTexto = Array.isArray(servicios) && servicios.length > 0
      ? servicios.join(', ')
      : 'No especificados';

    // === EMAILS ===
    const emailComercialHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Nueva Solicitud de Infraestructura de Red</h1>
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
            <h3 style="margin: 0 0 12px 0; color: #f97316; font-size: 16px;">Datos del proyecto de red</h3>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Tipo de proyecto:</td><td style="padding: 8px; color: #1f2937;">${tipoProyecto || 'No indicado'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Nº usuarios:</td><td style="padding: 8px; color: #1f2937;">${numUsuarios || 'No indicado'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Superficie (m²):</td><td style="padding: 8px; color: #1f2937;">${superficieM2 || 'No indicada'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Nº plantas:</td><td style="padding: 8px; color: #1f2937;">${numPlantas || 'No indicado'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Infraestructura actual:</td><td style="padding: 8px; color: #1f2937;">${infraestructuraActual || 'No indicada'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Fabricante preferido:</td><td style="padding: 8px; color: #1f2937;">${fabricantePreferido || 'Sin preferencia'}</td></tr>
            </table>
            <div style="margin-top: 12px; padding: 12px; background: #fff7ed; border-radius: 6px; border: 1px solid #fed7aa;">
              <p style="margin: 0 0 4px 0; font-weight: bold; color: #9a3412;">Servicios solicitados:</p>
              <p style="margin: 0; color: #4b5563;">${serviciosTexto}</p>
            </div>
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
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Infraestructura de Red</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #4b5563; line-height: 1.6;">Hola <strong>${nombre}</strong>,</p>
          <p style="color: #4b5563; line-height: 1.6;">Hemos recibido tu solicitud de <strong>Infraestructura de Red</strong> para <strong>${empresa}</strong>.</p>
          <p style="color: #4b5563; line-height: 1.6;">Nuestro equipo de ingeniería analizará tu proyecto y te contactará en un plazo máximo de <strong>24 horas</strong> con una propuesta personalizada.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Resumen de tu solicitud:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
              <li>Tipo de proyecto: <strong>${tipoProyecto || 'No indicado'}</strong></li>
              <li>Usuarios: <strong>${numUsuarios || 'No indicado'}</strong></li>
              <li>Superficie: <strong>${superficieM2 || 'No indicada'}</strong></li>
              <li>Servicios: <strong>${serviciosTexto}</strong></li>
            </ul>
          </div>
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">¿Qué incluirá tu propuesta?</p>
            <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563; text-align: left; line-height: 1.8;">
              <li>Auditoría de tu infraestructura actual</li>
              <li>Diseño de red con planos de cobertura WiFi</li>
              <li>Selección de equipamiento óptimo</li>
              <li>Presupuesto detallado con instalación</li>
              <li>Plan de mantenimiento y soporte</li>
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
      sendBrevoEmail({ email: 'comercial@internetoperadores.com', name: 'Comercial IO' }, `Nueva solicitud Infraestructura de Red - ${empresa} (${tipoProyecto || 'Proyecto'})`, emailComercialHtml),
      sendBrevoEmail({ email: 'victor@internetoperadores.com', name: 'Victor' }, `Nueva solicitud Infraestructura de Red - ${empresa} (${tipoProyecto || 'Proyecto'})`, emailComercialHtml),
      sendBrevoEmail({ email, name: nombre }, `Tu solicitud de Infraestructura de Red ha sido recibida - Internet Operadores`, emailInteresadoHtml),
    ];

    // HubSpot: lista Infraestructura Red + Newsletter Empresas
    const notaHubspot = `Solicitud de Infraestructura de Red\n- Tipo proyecto: ${tipoProyecto || 'No indicado'}\n- Usuarios: ${numUsuarios || 'No indicado'}\n- Superficie: ${superficieM2 || 'No indicada'}\n- Plantas: ${numPlantas || 'No indicado'}\n- Infraestructura actual: ${infraestructuraActual || 'No indicada'}\n- Fabricante preferido: ${fabricantePreferido || 'Sin preferencia'}\n- Servicios: ${serviciosTexto}\n- Comentarios: ${comentarios || 'Sin comentarios'}\n\nFecha: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`;

    const hubspotPromise = addToHubSpot(email, nombre, empresa, telefono, [HUBSPOT_LIST_INFRAESTRUCTURA, HUBSPOT_LIST_NEWSLETTER_EMPRESAS], notaHubspot);

    // Brevo: newsletter empresas
    const brevoPromise = addToBrevoNewsletter(email, nombre, empresa, telefono);

    // Guardar en BD
    const dbPromise = prisma.leadSolucion.create({
      data: {
        tipo: 'INFRAESTRUCTURA_RED',
        nombre,
        email,
        empresa,
        telefono: telefono || null,
        datos: {
          tipoProyecto: tipoProyecto || null,
          numUsuarios: numUsuarios || null,
          superficieM2: superficieM2 || null,
          numPlantas: numPlantas || null,
          servicios: servicios || [],
          infraestructuraActual: infraestructuraActual || null,
          fabricantePreferido: fabricantePreferido || null,
          comentarios: comentarios || null,
        },
      },
    }).catch(err => console.error('[INFRAESTRUCTURA-RED] Error guardando en BD:', err));

    // Ejecutar todo en paralelo y esperar
    await Promise.allSettled([...emailPromises, hubspotPromise, brevoPromise, dbPromise]);

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error('[INFRAESTRUCTURA-RED] Error general:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
