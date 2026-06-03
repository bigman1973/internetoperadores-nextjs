import { NextResponse } from 'next/server';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const HUBSPOT_TOKEN = (process.env.HUBSPOT_API_KEY || '').trim();

// IDs de listas de newsletter
const NEWSLETTER_LISTS = {
  particular: { hubspot: '490', brevo: 31 },
  empresa: { hubspot: '489', brevo: 30 },
  partner: { hubspot: '495', brevo: 32 },
};

/**
 * Envía email vía Brevo SMTP API
 */
async function sendEmail({ to, toName, subject, htmlContent }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Internet Operadores - SAT', email: 'sat@internetoperadores.com' },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent,
    }),
  });
  return res.ok;
}

/**
 * Suscribe al newsletter en Brevo + HubSpot según tipoUsuario
 */
async function subscribeNewsletter({ nombre, email, telefono, tipoUsuario }) {
  const lists = NEWSLETTER_LISTS[tipoUsuario] || NEWSLETTER_LISTS.empresa;

  // Brevo: crear contacto y añadir a lista
  try {
    const attributes = { NOMBRE: nombre };
    if (telefono) attributes.TELEFONO = telefono;

    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        email,
        attributes,
        listIds: [lists.brevo],
        updateEnabled: true,
      }),
    });
  } catch (e) {
    console.error('[Soporte] Error Brevo newsletter:', e.message);
  }

  // HubSpot: crear contacto y añadir a lista
  try {
    const properties = {
      email,
      firstname: nombre,
      phone: telefono || '',
      lifecyclestage: 'subscriber',
    };

    const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    let contactId;
    if (createRes.ok) {
      const data = await createRes.json();
      contactId = data.id;
    } else if (createRes.status === 409) {
      const errData = await createRes.json();
      contactId = errData?.message?.match(/Existing ID: (\d+)/)?.[1];
    }

    if (contactId) {
      await fetch(`https://api.hubapi.com/crm/v3/lists/${lists.hubspot}/memberships/add`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recordIdsToAdd: [contactId] }),
      });
    }
  } catch (e) {
    console.error('[Soporte] Error HubSpot newsletter:', e.message);
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { nombre, empresa, email, telefono, tipoUsuario, tipo, prioridad, descripcion, newsletter } = body;

    if (!nombre || !email || !tipoUsuario || !tipo || !prioridad || !descripcion) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 });
    }

    const tipoLabel = {
      conectividad: 'Conectividad / Internet',
      telefonia: 'Telefonía / VoIP',
      wifi: 'WiFi',
      seguridad: 'Seguridad de red',
      hardware: 'Hardware / Equipos',
      facturacion: 'Facturación',
      otro: 'Otro',
    }[tipo] || tipo;

    const prioridadLabel = {
      critica: 'Crítica - Servicio caído',
      alta: 'Alta - Degradación severa',
      media: 'Media - Problema parcial',
      baja: 'Baja - Consulta / Mejora',
    }[prioridad] || prioridad;

    const tipoUsuarioLabel = {
      particular: 'Particular',
      empresa: 'Empresa',
      partner: 'Partner',
    }[tipoUsuario] || tipoUsuario;

    // 1. Email de notificación a SAT
    const htmlSAT = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">🎫 Nuevo Ticket de Soporte</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Nombre:</td><td style="padding: 8px 0; color: #1f2937;">${nombre}</td></tr>
            ${empresa ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Empresa:</td><td style="padding: 8px 0; color: #1f2937;">${empresa}</td></tr>` : ''}
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Tipo usuario:</td><td style="padding: 8px 0; color: #1f2937;">${tipoUsuarioLabel}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Email:</td><td style="padding: 8px 0; color: #1f2937;">${email}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Teléfono:</td><td style="padding: 8px 0; color: #1f2937;">${telefono || 'No proporcionado'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Incidencia:</td><td style="padding: 8px 0; color: #1f2937;">${tipoLabel}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Prioridad:</td><td style="padding: 8px 0; color: #f97316; font-weight: bold;">${prioridadLabel}</td></tr>
          </table>
          <div style="margin-top: 16px; padding: 16px; background: white; border: 1px solid #e5e7eb; border-radius: 8px;">
            <p style="font-weight: bold; color: #374151; margin: 0 0 8px 0;">Descripción:</p>
            <p style="color: #1f2937; margin: 0; white-space: pre-wrap;">${descripcion}</p>
          </div>
        </div>
      </div>
    `;

    await sendEmail({
      to: 'sat@internetoperadores.com',
      toName: 'SAT Internet Operadores',
      subject: `[Ticket ${prioridad.toUpperCase()}] ${tipoLabel} - ${nombre}`,
      htmlContent: htmlSAT,
    });

    // 2. Email de confirmación al usuario
    const htmlConfirmacion = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Soporte Técnico</p>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin: 0 0 16px 0;">Hola ${nombre},</h2>
          <p style="color: #4b5563; line-height: 1.6;">
            Hemos recibido tu ticket de soporte correctamente. Nuestro equipo técnico lo revisará y te contactará lo antes posible según la prioridad indicada.
          </p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0; color: #374151;"><strong>Incidencia:</strong> ${tipoLabel}</p>
            <p style="margin: 4px 0; color: #374151;"><strong>Prioridad:</strong> ${prioridadLabel}</p>
          </div>
          <p style="color: #4b5563; line-height: 1.6;">
            Para incidencias urgentes, puedes llamarnos directamente al <strong>900 730 034</strong> (disponible 24/7).
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Este es un email automático. No respondas a este mensaje.
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: email,
      toName: nombre,
      subject: `Ticket recibido: ${tipoLabel} - Internet Operadores`,
      htmlContent: htmlConfirmacion,
    });

    // 3. Newsletter opt-in (si lo marcó)
    if (newsletter) {
      await subscribeNewsletter({ nombre, email, telefono, tipoUsuario });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Soporte API] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
