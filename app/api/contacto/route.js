export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

// Emails de destino según motivo
const EMAILS_DESTINO = {
  comercial: 'comercial@internetoperadores.com',
  administracion: 'administracion@internetoperadores.com',
  tecnico: 'sat@internetoperadores.com',
  direccion: 'direccion@internetoperadores.com',
};

// Nombres legibles de motivos
const MOTIVOS_MAP = {
  comercial: 'Comercial — Información o presupuesto',
  administracion: 'Administración — Facturación o contratos',
  tecnico: 'Técnico — Soporte o incidencia',
  direccion: 'Dirección — Sugerencias o reclamaciones',
};

// IDs de listas de Brevo para newsletter
const BREVO_LISTA_EMPRESAS = 30;
const BREVO_LISTA_PARTICULARES = 31;

// IDs de listas de HubSpot para newsletter
const HUBSPOT_LISTA_EMPRESAS = '489';
const HUBSPOT_LISTA_PARTICULARES = '490';

export async function POST(request) {
  try {
    const body = await request.json();
    const { tipoUsuario, nombre, empresa, email, telefono, motivo, mensaje, newsletter, origen } = body;

    console.log('📩 NUEVA SOLICITUD DE CONTACTO:');
    console.log('Tipo:', tipoUsuario);
    console.log('Nombre:', nombre);
    console.log('Empresa:', empresa);
    console.log('Email:', email);
    console.log('Teléfono:', telefono);
    console.log('Motivo:', motivo);
    console.log('Newsletter:', newsletter);

    // Validación básica
    if (!nombre || !email || !telefono || !motivo) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (nombre, email, teléfono, motivo)' },
        { status: 400 }
      );
    }

    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    const hubspotToken = (process.env.HUBSPOT_API_KEY || '').trim();
    const emailDestino = EMAILS_DESTINO[motivo] || 'comercial@internetoperadores.com';
    const motivoNombre = MOTIVOS_MAP[motivo] || motivo;
    const origenTexto = origen || 'Formulario de contacto';
    const tipoTexto = tipoUsuario === 'particular' ? 'Particular' : 'Empresa';

    // 1. Enviar email de notificación al departamento correspondiente
    if (brevoApiKey) {
      const emailNotificacion = {
        sender: {
          name: 'Internet Operadores Web',
          email: 'noreply@internetoperadores.com'
        },
        to: [
          {
            email: emailDestino,
            name: motivoNombre.split(' — ')[0]
          }
        ],
        subject: `🔔 Nuevo contacto (${tipoTexto}) - ${motivoNombre.split(' — ')[0]} - ${empresa || nombre}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #F97316; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Nueva consulta de contacto</h1>
              <p style="color: #FED7AA; margin: 5px 0 0 0; font-size: 14px;">Departamento: ${motivoNombre} | Tipo: ${tipoTexto}</p>
            </div>
            
            <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
              <h2 style="color: #1F2937; font-size: 18px; margin-top: 0;">Datos del contacto</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280; width: 140px;"><strong>Tipo:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${tipoTexto}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Nombre:</strong></td>
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
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Motivo:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${motivoNombre}</td>
                </tr>
              </table>

              ${mensaje ? `
              <h2 style="color: #1F2937; font-size: 18px; margin-top: 20px;">Mensaje</h2>
              <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; border-left: 4px solid #F97316;">
                <p style="color: #374151; margin: 0; white-space: pre-wrap;">${mensaje}</p>
              </div>
              ` : ''}

              <div style="margin-top: 24px; padding: 16px; background: #FFF7ED; border-radius: 8px;">
                <p style="margin: 0; color: #9A3412; font-size: 14px;">
                  <strong>⚡ Acción requerida:</strong> Contactar al cliente lo antes posible.
                </p>
              </div>
            </div>

            <div style="background: #F9FAFB; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="color: #9CA3AF; font-size: 12px; margin: 0; text-align: center;">
                Este email ha sido generado automáticamente desde internetoperadores.com
              </p>
            </div>
          </div>
        `
      };

      try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(emailNotificacion)
        });

        if (brevoResponse.ok) {
          const brevoResult = await brevoResponse.json();
          console.log('✅ Email de notificación enviado a', emailDestino, ':', brevoResult.messageId);
        } else {
          const errorData = await brevoResponse.json();
          console.error('❌ Error enviando email con Brevo:', errorData);
        }
      } catch (emailErr) {
        console.error('❌ Error conexión Brevo email:', emailErr);
      }
    }

    // 2. Crear/actualizar contacto en Brevo
    if (brevoApiKey) {
      try {
        const contactData = {
          email: email,
          attributes: {
            NOMBRE: nombre,
            EMPRESA: empresa || '',
            TELEFONO: telefono || '',
            ORIGEN: origenTexto
          },
          updateEnabled: true
        };

        // Si se suscribe al newsletter, añadir a la lista correspondiente
        if (newsletter) {
          const listId = tipoUsuario === 'particular' ? BREVO_LISTA_PARTICULARES : BREVO_LISTA_EMPRESAS;
          contactData.listIds = [listId];
        }

        const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(contactData)
        });

        if (contactResponse.ok) {
          console.log('✅ Contacto creado/actualizado en Brevo');
        } else {
          const contactError = await contactResponse.json();
          console.log('⚠️ Brevo contacto:', contactError.message || contactError.code);
          
          // Si ya existe y quiere newsletter, añadir a la lista
          if (newsletter && contactError.code === 'duplicate_parameter') {
            const listId = tipoUsuario === 'particular' ? BREVO_LISTA_PARTICULARES : BREVO_LISTA_EMPRESAS;
            await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/add`, {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
              },
              body: JSON.stringify({ emails: [email] })
            });
            console.log('✅ Contacto existente añadido a lista newsletter Brevo');
          }
        }
      } catch (contactErr) {
        console.error('⚠️ Error creando contacto en Brevo:', contactErr);
      }
    }

    // 3. Si se suscribe al newsletter, también añadir a HubSpot
    if (newsletter && hubspotToken) {
      try {
        // Crear contacto en HubSpot
        const properties = {
          email,
          firstname: nombre,
          phone: telefono || '',
          company: empresa || '',
          lifecyclestage: 'subscriber',
        };

        const contactRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hubspotToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ properties }),
        });

        let contactId = '';

        if (contactRes.status === 409) {
          // Ya existe, buscar su ID
          const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${hubspotToken}`,
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
        } else if (contactRes.ok) {
          const contactData = await contactRes.json();
          contactId = contactData.id;
        } else if (contactRes.status === 400) {
          // Reintentar sin lifecyclestage
          const retryRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${hubspotToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ properties: { email, firstname: nombre, phone: telefono || '' } }),
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            contactId = retryData.id;
          } else if (retryRes.status === 409) {
            const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${hubspotToken}`,
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
          }
        }

        // Añadir a lista de newsletter en HubSpot
        if (contactId) {
          const listaId = tipoUsuario === 'particular' ? HUBSPOT_LISTA_PARTICULARES : HUBSPOT_LISTA_EMPRESAS;
          await fetch(`https://api.hubapi.com/crm/v3/lists/${listaId}/memberships/add`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${hubspotToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify([contactId]),
          });
          console.log('✅ Contacto añadido a newsletter HubSpot:', contactId);
        }
      } catch (hubspotErr) {
        console.error('⚠️ Error HubSpot newsletter:', hubspotErr);
      }
    }

    return NextResponse.json({ 
      success: true,
      emailSent: true,
      departamento: motivo
    });

  } catch (error) {
    console.error('❌ Error procesando solicitud de contacto:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}
