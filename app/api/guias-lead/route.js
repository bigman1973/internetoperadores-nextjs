export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

const HUBSPOT_TOKEN = process.env.HUBSPOT_API_KEY;
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// IDs de listas
const HUBSPOT_LIST_NEWSLETTER_EMPRESAS = 489;
const HUBSPOT_LIST_DESCARGAS_GUIAS = 498;
const BREVO_LIST_NEWSLETTER_EMPRESAS = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const { nombre, email, empresa, telefono, cargo, guia } = body;

    console.log('📚 NUEVA DESCARGA DE GUÍA:', { nombre, email, empresa, guia });

    // Validación
    if (!nombre || !email) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (nombre, email)' },
        { status: 400 }
      );
    }

    const brevoApiKey = (BREVO_API_KEY || '').trim();
    const hubspotToken = (HUBSPOT_TOKEN || '').trim();
    const guiaNombre = guia || 'Guía no especificada';

    // Ejecutar todas las acciones en paralelo
    const results = await Promise.allSettled([
      // 1. Email de notificación a comercial
      sendEmailComercial(brevoApiKey, { nombre, email, empresa, telefono, cargo, guiaNombre }),
      // 2. Email de confirmación al interesado
      sendEmailInteresado(brevoApiKey, { nombre, email, guiaNombre }),
      // 3. Crear/actualizar contacto en Brevo + lista Newsletter Empresas
      addToBrevo(brevoApiKey, { nombre, email, empresa, telefono, cargo, guiaNombre }),
      // 4. Crear/actualizar contacto en HubSpot + listas
      addToHubSpot(hubspotToken, { nombre, email, empresa, telefono, cargo, guiaNombre }),
    ]);

    const emailComercial = results[0].status === 'fulfilled' && results[0].value;
    const emailInteresado = results[1].status === 'fulfilled' && results[1].value;
    const brevo = results[2].status === 'fulfilled' && results[2].value;
    const hubspot = results[3].status === 'fulfilled' && results[3].value;

    console.log('📚 Resultados:', { emailComercial, emailInteresado, brevo, hubspot });

    return NextResponse.json({
      success: true,
      emailComercial,
      emailInteresado,
      brevo,
      hubspot,
    });

  } catch (error) {
    console.error('❌ Error procesando descarga de guía:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}

// --- Email a comercial ---
async function sendEmailComercial(apiKey, { nombre, email, empresa, telefono, cargo, guiaNombre }) {
  if (!apiKey) return false;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Internet Operadores Web', email: 'noreply@internetoperadores.com' },
      to: [{ email: 'comercial@internetoperadores.com', name: 'Equipo Comercial' }],
      subject: `📚 Descarga de Guía - ${nombre} (${empresa || 'Sin empresa'})`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #F97316; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Nueva descarga de guía</h1>
            <p style="color: #FED7AA; margin: 5px 0 0 0; font-size: 14px;">${guiaNombre}</p>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #1F2937; font-size: 18px; margin-top: 0;">Datos del lead</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280; width: 140px;"><strong>Nombre:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${nombre}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Email:</strong></td>
                <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #F97316;">${email}</a></td>
              </tr>
              ${empresa ? `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px 0; color: #6B7280;"><strong>Empresa:</strong></td><td style="padding: 10px 0; color: #1F2937;">${empresa}</td></tr>` : ''}
              ${telefono ? `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px 0; color: #6B7280;"><strong>Teléfono:</strong></td><td style="padding: 10px 0;"><a href="tel:${telefono}" style="color: #F97316;">${telefono}</a></td></tr>` : ''}
              ${cargo ? `<tr style="border-bottom: 1px solid #f3f4f6;"><td style="padding: 10px 0; color: #6B7280;"><strong>Cargo:</strong></td><td style="padding: 10px 0; color: #1F2937;">${cargo}</td></tr>` : ''}
              <tr><td style="padding: 10px 0; color: #6B7280;"><strong>Guía:</strong></td><td style="padding: 10px 0; color: #1F2937; font-weight: bold;">${guiaNombre}</td></tr>
            </table>
            <div style="margin-top: 24px; padding: 16px; background: #FFF7ED; border-radius: 8px;">
              <p style="margin: 0; color: #9A3412; font-size: 14px;">
                <strong>💡 Sugerencia:</strong> Este lead se ha suscrito al newsletter y ha descargado ${guiaNombre}. Contactar en 24-48h para ofrecer asesoramiento personalizado.
              </p>
            </div>
          </div>
          <div style="background: #F9FAFB; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #9CA3AF; font-size: 12px; margin: 0; text-align: center;">
              Generado automáticamente desde internetoperadores.com
            </p>
          </div>
        </div>
      `
    })
  });

  return res.ok;
}

// --- Email de confirmación al interesado ---
async function sendEmailInteresado(apiKey, { nombre, email, guiaNombre }) {
  if (!apiKey) return false;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Internet Operadores', email: 'noreply@internetoperadores.com' },
      to: [{ email, name: nombre }],
      subject: `Tu guía "${guiaNombre}" está lista para descargar`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1F2937; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">¡Gracias por tu interés!</h1>
          </div>
          <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Hola <strong>${nombre}</strong>,
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Gracias por descargar <strong>"${guiaNombre}"</strong>. Esperamos que te sea de gran utilidad para tu empresa.
            </p>
            <p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Te has suscrito a nuestro newsletter de empresas. Recibirás periódicamente contenido exclusivo sobre soluciones IT y telecomunicaciones.
            </p>
            <div style="margin: 30px 0; padding: 20px; background: #FFF7ED; border-radius: 8px; border-left: 4px solid #F97316;">
              <p style="margin: 0; color: #9A3412; font-size: 14px;">
                <strong>¿Necesitas asesoramiento personalizado?</strong><br>
                Nuestro equipo de expertos puede ayudarte a implementar las soluciones de la guía. Llámanos al <a href="tel:900730034" style="color: #F97316;">900 730 034</a> o responde a este email.
              </p>
            </div>
          </div>
          <div style="background: #F9FAFB; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
            <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
              Internet Operadores · 900 730 034 · <a href="https://www.internetoperadores.com" style="color: #F97316;">internetoperadores.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 11px; margin: 8px 0 0 0;">
              Puedes darte de baja en cualquier momento desde el enlace de nuestros emails.
            </p>
          </div>
        </div>
      `
    })
  });

  return res.ok;
}

// --- Brevo: crear contacto + lista Newsletter Empresas ---
async function addToBrevo(apiKey, { nombre, email, empresa, telefono, cargo, guiaNombre }) {
  if (!apiKey) return false;

  try {
    const contactData = {
      email,
      attributes: {
        NOMBRE: nombre,
        EMPRESA: empresa || '',
        TELEFONO: telefono || '',
        ORIGEN: `Descarga: ${guiaNombre}`
      },
      listIds: [BREVO_LIST_NEWSLETTER_EMPRESAS],
      updateEnabled: true
    };

    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(contactData)
    });

    if (res.ok || res.status === 204) {
      console.log('✅ Contacto creado/actualizado en Brevo + Newsletter Empresas');
      return true;
    }

    // Si ya existe, actualizar listas
    if (res.status === 400) {
      const addToList = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST_NEWSLETTER_EMPRESAS}/contacts/add`, {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ emails: [email] })
      });
      return addToList.ok;
    }

    return false;
  } catch (err) {
    console.error('Error Brevo:', err);
    return false;
  }
}

// --- HubSpot: crear contacto + listas Newsletter Empresas + Descargas Guías ---
async function addToHubSpot(token, { nombre, email, empresa, telefono, cargo, guiaNombre }) {
  if (!token) return false;

  try {
    // 1. Crear o actualizar contacto
    let contactId;

    const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          email,
          firstname: nombre.split(' ')[0],
          lastname: nombre.split(' ').slice(1).join(' ') || '',
          company: empresa || '',
          phone: telefono || '',
          jobtitle: cargo || '',
          hs_lead_status: 'NEW',
        }
      })
    });

    if (createRes.ok) {
      const data = await createRes.json();
      contactId = data.id;
    } else if (createRes.status === 409) {
      // Contacto ya existe, buscar por email
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }]
        })
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          contactId = searchData.results[0].id;
        }
      }
    }

    if (!contactId) return false;

    // 2. Añadir a lista Newsletter Empresas + Descargas de Guías
    const listPromises = [HUBSPOT_LIST_NEWSLETTER_EMPRESAS, HUBSPOT_LIST_DESCARGAS_GUIAS].map(listId =>
      fetch(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships/add`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([contactId])
      })
    );

    await Promise.allSettled(listPromises);

    // 3. Crear nota con la guía descargada
    await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        properties: {
          hs_note_body: `📚 Descarga de guía: ${guiaNombre}\nFecha: ${new Date().toLocaleDateString('es-ES')}\nSuscrito a Newsletter Empresas (obligatorio para descarga)`,
          hs_timestamp: new Date().toISOString()
        },
        associations: [{
          to: { id: contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
        }]
      })
    });

    console.log('✅ HubSpot: contacto + listas + nota OK');
    return true;
  } catch (err) {
    console.error('Error HubSpot:', err);
    return false;
  }
}
