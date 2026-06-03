export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

// IDs de listas
const HUBSPOT_LISTA_SOLICITUDES_PARTNER = '496';
const HUBSPOT_LISTA_NEWSLETTER_PARTNERS = '495';
const BREVO_LISTA_NEWSLETTER_PARTNERS = 32;

// Mapa de sectores
const SECTORES_MAP = {
  'gestoria': 'Gestoría / Asesoría',
  'seguros': 'Correduría de Seguros',
  'inmobiliaria': 'Inmobiliaria / Administración de Fincas',
  'consultora-it': 'Consultora IT / Empresa de Software',
  'seguridad': 'Empresa de Seguridad / Alarmas',
  'distribuidor': 'Distribuidor Informática / Material Oficina',
  'otro': 'Otro sector',
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { nombre, empresa, email, telefono, sector, numClientes, mensaje, newsletter } = body;

    console.log('🤝 NUEVA SOLICITUD DE PARTNER:');
    console.log('Nombre:', nombre, '| Empresa:', empresa);
    console.log('Email:', email, '| Tel:', telefono);
    console.log('Sector:', sector, '| Clientes:', numClientes);
    console.log('Newsletter:', newsletter);

    // Validación
    if (!nombre || !email || !telefono || !sector) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    const hubspotToken = (process.env.HUBSPOT_API_KEY || '').trim();
    const sectorNombre = SECTORES_MAP[sector] || sector;

    // Ejecutar todas las acciones en paralelo
    const promises = [];

    // 1. Email de notificación a comercial
    if (brevoApiKey) {
      promises.push(enviarEmailComercial(brevoApiKey, { nombre, empresa, email, telefono, sectorNombre, numClientes, mensaje }));
    }

    // 2. Email de confirmación al interesado
    if (brevoApiKey) {
      promises.push(enviarEmailConfirmacion(brevoApiKey, { nombre, empresa, email, sectorNombre }));
    }

    // 3. Crear contacto en HubSpot y añadir a lista de solicitudes partner
    if (hubspotToken) {
      promises.push(crearContactoHubSpot(hubspotToken, { nombre, empresa, email, telefono, sectorNombre, numClientes, newsletter }));
    }

    // 4. Si se suscribe al newsletter, crear contacto en Brevo con lista partners
    if (newsletter && brevoApiKey) {
      promises.push(crearContactoBrevo(brevoApiKey, { nombre, empresa, email, telefono }));
    }

    await Promise.allSettled(promises);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ Error procesando solicitud de partner:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}

// Email de notificación a comercial
async function enviarEmailComercial(apiKey, data) {
  const { nombre, empresa, email, telefono, sectorNombre, numClientes, mensaje } = data;
  
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores Web', email: 'noreply@internetoperadores.com' },
        to: [{ email: 'comercial@internetoperadores.com', name: 'Comercial' }],
        subject: `🤝 Nueva solicitud Partner - ${empresa || nombre} (${sectorNombre})`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1F2937, #F97316); padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Nueva solicitud de Partner</h1>
              <p style="color: #FED7AA; margin: 5px 0 0 0; font-size: 14px;">Programa de Partners - Internet Operadores</p>
            </div>
            <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280; width: 160px;"><strong>Nombre:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${nombre}</td>
                </tr>
                ${empresa ? `<tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Empresa:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937; font-weight: bold;">${empresa}</td>
                </tr>` : ''}
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Email:</strong></td>
                  <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #F97316;">${email}</a></td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Teléfono:</strong></td>
                  <td style="padding: 10px 0;"><a href="tel:${telefono}" style="color: #F97316;">${telefono}</a></td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Sector:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937; font-weight: bold;">${sectorNombre}</td>
                </tr>
                ${numClientes ? `<tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>N.º clientes:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${numClientes}</td>
                </tr>` : ''}
              </table>
              ${mensaje ? `
              <h2 style="color: #1F2937; font-size: 16px; margin-top: 20px;">Mensaje</h2>
              <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; border-left: 4px solid #F97316;">
                <p style="color: #374151; margin: 0; white-space: pre-wrap;">${mensaje}</p>
              </div>` : ''}
              <div style="margin-top: 24px; padding: 16px; background: #FFF7ED; border-radius: 8px;">
                <p style="margin: 0; color: #9A3412; font-size: 14px;">
                  <strong>⚡ Acción:</strong> Contactar en menos de 24h para presentar el programa y condiciones.
                </p>
              </div>
            </div>
            <div style="background: #F9FAFB; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="color: #9CA3AF; font-size: 12px; margin: 0; text-align: center;">
                Generado automáticamente desde internetoperadores.com/partners
              </p>
            </div>
          </div>
        `
      })
    });

    if (res.ok) {
      console.log('✅ Email notificación partner enviado a comercial');
    } else {
      const err = await res.json();
      console.error('❌ Error email comercial partner:', err);
    }
  } catch (e) {
    console.error('❌ Error enviando email comercial partner:', e);
  }
}

// Email de confirmación al interesado
async function enviarEmailConfirmacion(apiKey, data) {
  const { nombre, empresa, email, sectorNombre } = data;
  
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email: email, name: nombre }],
        subject: `Confirmación - Solicitud Programa de Partners`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #1F2937, #F97316); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">¡Bienvenido al Programa de Partners!</h1>
              <p style="color: #FED7AA; margin: 8px 0 0 0; font-size: 14px;">Hemos recibido tu solicitud correctamente</p>
            </div>
            <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Hola <strong>${nombre}</strong>,
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Hemos recibido tu solicitud para unirte al Programa de Partners de Internet Operadores. 
                Nuestro equipo de canal se pondrá en contacto contigo en las próximas <strong>24 horas laborables</strong> 
                para explicarte todos los detalles del programa y resolver cualquier duda.
              </p>
              
              <div style="background: #FFF7ED; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #F97316;">
                <h3 style="color: #9A3412; margin: 0 0 12px 0; font-size: 16px;">Tu solicitud:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  ${empresa ? `<tr>
                    <td style="padding: 6px 0; color: #6B7280;">Empresa:</td>
                    <td style="padding: 6px 0; color: #1F2937; font-weight: bold;">${empresa}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Sector:</td>
                    <td style="padding: 6px 0; color: #1F2937;">${sectorNombre}</td>
                  </tr>
                </table>
              </div>

              <h3 style="color: #1F2937; font-size: 16px; margin-top: 24px;">¿Qué puedes esperar?</h3>
              <ul style="color: #374151; font-size: 14px; line-height: 2.2; padding-left: 20px;">
                <li>📞 Te llamaremos para conocer tu negocio y tus clientes</li>
                <li>📋 Te explicaremos las condiciones y niveles del programa</li>
                <li>🎓 Te daremos acceso a formación y material comercial</li>
                <li>🚀 Podrás empezar a generar ingresos desde el primer día</li>
              </ul>

              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-top: 20px;">
                Si tienes alguna duda antes de nuestra llamada:
              </p>
              <ul style="color: #374151; font-size: 14px; line-height: 2;">
                <li>📞 Teléfono: <a href="tel:+34900730034" style="color: #F97316;">900 730 034</a></li>
                <li>💬 WhatsApp: <a href="https://wa.me/34900730034" style="color: #F97316;">Enviar mensaje</a></li>
                <li>✉️ Email: <a href="mailto:comercial@internetoperadores.com" style="color: #F97316;">comercial@internetoperadores.com</a></li>
              </ul>

              <p style="color: #6B7280; font-size: 14px; margin-top: 24px;">
                ¡Gracias por confiar en Internet Operadores!
              </p>
            </div>
            <div style="background: #F9FAFB; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
              <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
                Internet Operadores S.L. | Paseo De La Habana 26 1-1, 28036 Madrid | 
                <a href="https://www.internetoperadores.com" style="color: #F97316;">internetoperadores.com</a>
              </p>
            </div>
          </div>
        `
      })
    });

    if (res.ok) {
      console.log('✅ Email confirmación partner enviado a:', email);
    } else {
      const err = await res.json();
      console.error('❌ Error email confirmación partner:', err);
    }
  } catch (e) {
    console.error('❌ Error enviando email confirmación partner:', e);
  }
}

// Crear contacto en HubSpot y añadir a lista de solicitudes partner
async function crearContactoHubSpot(token, data) {
  const { nombre, empresa, email, telefono, sectorNombre, numClientes, newsletter } = data;
  
  try {
    const properties = {
      email,
      firstname: nombre,
      phone: telefono,
      company: empresa || '',
    };

    // Crear contacto
    const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties }),
    });

    let contactId = '';

    if (contactRes.status === 409) {
      // Ya existe, buscar ID
      const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        }),
      });
      const searchData = await searchRes.json();
      contactId = searchData.results?.[0]?.id || '';
    } else if (contactRes.ok) {
      const contactData = await contactRes.json();
      contactId = contactData.id;
    }

    if (contactId) {
      // Añadir a lista de Solicitudes Partner
      await fetch(`https://api.hubapi.com/crm/v3/lists/${HUBSPOT_LISTA_SOLICITUDES_PARTNER}/memberships/add`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([contactId]),
      });
      console.log('✅ Contacto añadido a lista Solicitudes Partner en HubSpot:', contactId);

      // Si se suscribe al newsletter partners, añadir también a esa lista
      if (newsletter) {
        await fetch(`https://api.hubapi.com/crm/v3/lists/${HUBSPOT_LISTA_NEWSLETTER_PARTNERS}/memberships/add`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([contactId]),
        });
        console.log('✅ Contacto añadido a newsletter partners HubSpot');
      }

      // Crear nota con detalles
      await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: {
            hs_note_body: `Solicitud Programa de Partners\nSector: ${sectorNombre}\nN.º clientes: ${numClientes || 'No especificado'}\nOrigen: Web internetoperadores.com/partners`,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [{
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
          }]
        }),
      });
    }
  } catch (e) {
    console.error('❌ Error HubSpot partner:', e);
  }
}

// Crear contacto en Brevo y añadir a lista newsletter partners
async function crearContactoBrevo(apiKey, data) {
  const { nombre, empresa, email, telefono } = data;
  
  try {
    const contactData = {
      email,
      attributes: {
        NOMBRE: nombre,
        EMPRESA: empresa || '',
        TELEFONO: telefono || '',
        ORIGEN: 'Programa de Partners'
      },
      listIds: [BREVO_LISTA_NEWSLETTER_PARTNERS],
      updateEnabled: true
    };

    const res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(contactData)
    });

    if (res.ok) {
      console.log('✅ Contacto creado en Brevo con newsletter partners');
    } else {
      const err = await res.json();
      if (err.code === 'duplicate_parameter') {
        // Ya existe, añadir a lista
        await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LISTA_NEWSLETTER_PARTNERS}/contacts/add`, {
          method: 'POST',
          headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ emails: [email] })
        });
        console.log('✅ Contacto existente añadido a newsletter partners Brevo');
      }
    }
  } catch (e) {
    console.error('❌ Error Brevo newsletter partners:', e);
  }
}
