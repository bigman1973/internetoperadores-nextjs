export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

// IDs de listas
const HUBSPOT_LISTA_DEMO = '494';
const HUBSPOT_LISTA_NEWSLETTER_EMPRESAS = '489';
const BREVO_LISTA_NEWSLETTER_EMPRESAS = 30;

// Mapa de nombres legibles para las demos
const DEMOS_MAP = {
  'conectividad-sdwan': 'Conectividad SD-WAN',
  'comunicaciones-unificadas': 'Comunicaciones Unificadas',
  'wifi-empresarial': 'WiFi Empresarial',
  'seguridad-red': 'Seguridad de Red',
  'exagrid-backup': 'ExaGrid Backup',
  'mantenimiento-it': 'Mantenimiento IT',
  'migracion-web': 'Migración Web',
  'soluciones-moviles': 'Soluciones Móviles',
  'auditoria-completa': 'Auditoría Completa',
};

export async function POST(request) {
  try {
    const body = await request.json();
    const { nombre, empresa, email, telefono, empleados, interes, fecha, horario, mensaje, newsletter } = body;

    console.log('🎯 NUEVA SOLICITUD DE DEMO:');
    console.log('Nombre:', nombre, '| Empresa:', empresa);
    console.log('Email:', email, '| Tel:', telefono);
    console.log('Interés:', interes, '| Fecha:', fecha, '| Horario:', horario);
    console.log('Newsletter:', newsletter);

    // Validación
    if (!nombre || !email || !telefono || !interes) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    const hubspotToken = (process.env.HUBSPOT_API_KEY || '').trim();
    const demoNombre = DEMOS_MAP[interes] || interes;
    const fechaTexto = fecha || 'No especificada';
    const horarioTexto = horario ? `${horario.replace('-', ':00 - ')}:00` : 'No especificado';

    // Ejecutar todas las acciones en paralelo
    const promises = [];

    // 1. Email de notificación a comercial
    if (brevoApiKey) {
      promises.push(enviarEmailComercial(brevoApiKey, { nombre, empresa, email, telefono, empleados, demoNombre, fechaTexto, horarioTexto, mensaje }));
    }

    // 2. Email de confirmación al interesado
    if (brevoApiKey) {
      promises.push(enviarEmailConfirmacion(brevoApiKey, { nombre, empresa, email, demoNombre, fechaTexto, horarioTexto }));
    }

    // 3. Crear contacto en HubSpot y añadir a lista de demos
    if (hubspotToken) {
      promises.push(crearContactoHubSpot(hubspotToken, { nombre, empresa, email, telefono, demoNombre, newsletter }));
    }

    // 4. Si se suscribe al newsletter, crear contacto en Brevo con lista
    if (newsletter && brevoApiKey) {
      promises.push(crearContactoBrevo(brevoApiKey, { nombre, empresa, email, telefono }));
    }

    await Promise.allSettled(promises);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ Error procesando solicitud de demo:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}

// Email de notificación a comercial
async function enviarEmailComercial(apiKey, data) {
  const { nombre, empresa, email, telefono, empleados, demoNombre, fechaTexto, horarioTexto, mensaje } = data;
  
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
        subject: `🎯 Nueva solicitud de Demo - ${demoNombre} - ${empresa || nombre}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #F97316; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Nueva solicitud de Demo</h1>
              <p style="color: #FED7AA; margin: 5px 0 0 0; font-size: 14px;">Demo: ${demoNombre}</p>
            </div>
            <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280; width: 140px;"><strong>Nombre:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${nombre}</td>
                </tr>
                ${empresa ? `<tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Empresa:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${empresa}</td>
                </tr>` : ''}
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Email:</strong></td>
                  <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #F97316;">${email}</a></td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Teléfono:</strong></td>
                  <td style="padding: 10px 0;"><a href="tel:${telefono}" style="color: #F97316;">${telefono}</a></td>
                </tr>
                ${empleados ? `<tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Empleados:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${empleados}</td>
                </tr>` : ''}
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Demo:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937; font-weight: bold;">${demoNombre}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Fecha:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${fechaTexto}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Horario:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${horarioTexto}</td>
                </tr>
              </table>
              ${mensaje ? `
              <h2 style="color: #1F2937; font-size: 16px; margin-top: 20px;">Comentarios</h2>
              <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; border-left: 4px solid #F97316;">
                <p style="color: #374151; margin: 0; white-space: pre-wrap;">${mensaje}</p>
              </div>` : ''}
              <div style="margin-top: 24px; padding: 16px; background: #FFF7ED; border-radius: 8px;">
                <p style="margin: 0; color: #9A3412; font-size: 14px;">
                  <strong>⚡ Acción:</strong> Contactar al cliente para confirmar fecha y hora de la demo.
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

    if (res.ok) {
      console.log('✅ Email notificación enviado a comercial');
    } else {
      const err = await res.json();
      console.error('❌ Error email comercial:', err);
    }
  } catch (e) {
    console.error('❌ Error enviando email comercial:', e);
  }
}

// Email de confirmación al interesado
async function enviarEmailConfirmacion(apiKey, data) {
  const { nombre, empresa, email, demoNombre, fechaTexto, horarioTexto } = data;
  
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
        subject: `Confirmación de tu solicitud de demo - ${demoNombre}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #F97316; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">¡Hemos recibido tu solicitud!</h1>
            </div>
            <div style="background: #fff; padding: 32px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Hola <strong>${nombre}</strong>,
              </p>
              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Hemos recibido tu solicitud de demo personalizada. Nuestro equipo técnico se pondrá en contacto contigo 
                en las próximas <strong>24 horas laborables</strong> para confirmar los detalles.
              </p>
              
              <div style="background: #FFF7ED; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #F97316;">
                <h3 style="color: #9A3412; margin: 0 0 12px 0; font-size: 16px;">Resumen de tu solicitud:</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Demo solicitada:</td>
                    <td style="padding: 6px 0; color: #1F2937; font-weight: bold;">${demoNombre}</td>
                  </tr>
                  ${empresa ? `<tr>
                    <td style="padding: 6px 0; color: #6B7280;">Empresa:</td>
                    <td style="padding: 6px 0; color: #1F2937;">${empresa}</td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Fecha preferida:</td>
                    <td style="padding: 6px 0; color: #1F2937;">${fechaTexto}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #6B7280;">Horario preferido:</td>
                    <td style="padding: 6px 0; color: #1F2937;">${horarioTexto}</td>
                  </tr>
                </table>
              </div>

              <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                Si tienes alguna duda antes de la demo, no dudes en contactarnos:
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
      console.log('✅ Email confirmación enviado al interesado:', email);
    } else {
      const err = await res.json();
      console.error('❌ Error email confirmación:', err);
    }
  } catch (e) {
    console.error('❌ Error enviando email confirmación:', e);
  }
}

// Crear contacto en HubSpot y añadir a lista de demos (+ newsletter si aplica)
async function crearContactoHubSpot(token, data) {
  const { nombre, empresa, email, telefono, demoNombre, newsletter } = data;
  
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
      // Añadir a lista de Solicitudes de Demo
      await fetch(`https://api.hubapi.com/crm/v3/lists/${HUBSPOT_LISTA_DEMO}/memberships/add`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([contactId]),
      });
      console.log('✅ Contacto añadido a lista Solicitudes de Demo en HubSpot:', contactId);

      // Si se suscribe al newsletter, añadir también a esa lista
      if (newsletter) {
        await fetch(`https://api.hubapi.com/crm/v3/lists/${HUBSPOT_LISTA_NEWSLETTER_EMPRESAS}/memberships/add`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([contactId]),
        });
        console.log('✅ Contacto añadido a newsletter empresas HubSpot');
      }

      // Crear nota con detalles de la demo
      await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: {
            hs_note_body: `Solicitud de Demo: ${demoNombre}\nOrigen: Web internetoperadores.com`,
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
    console.error('❌ Error HubSpot demo:', e);
  }
}

// Crear contacto en Brevo y añadir a lista newsletter empresas
async function crearContactoBrevo(apiKey, data) {
  const { nombre, empresa, email, telefono } = data;
  
  try {
    const contactData = {
      email,
      attributes: {
        NOMBRE: nombre,
        EMPRESA: empresa || '',
        TELEFONO: telefono || '',
        ORIGEN: 'Solicitud de Demo'
      },
      listIds: [BREVO_LISTA_NEWSLETTER_EMPRESAS],
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
      console.log('✅ Contacto creado en Brevo con newsletter');
    } else {
      const err = await res.json();
      if (err.code === 'duplicate_parameter') {
        // Ya existe, añadir a lista
        await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LISTA_NEWSLETTER_EMPRESAS}/contacts/add`, {
          method: 'POST',
          headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ emails: [email] })
        });
        console.log('✅ Contacto existente añadido a newsletter Brevo');
      }
    }
  } catch (e) {
    console.error('❌ Error Brevo newsletter:', e);
  }
}
