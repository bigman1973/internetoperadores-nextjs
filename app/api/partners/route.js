export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { guardarCaptacionWeb } from '@/lib/crm-captacion-web';

// IDs de listas
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'El formulario debe ser un objeto válido' }, { status: 400 });
    }
    const { nombre, empresa, email, telefono, sector, numClientes, mensaje } = body;

    if (![nombre, empresa, email, telefono, sector, numClientes, mensaje].every(value => value == null || typeof value === 'string')) {
      return NextResponse.json({ error: 'Los campos del formulario deben ser texto' }, { status: 400 });
    }

    // Validación
    if (!nombre?.trim() || !email?.trim() || !telefono?.trim() || !sector?.trim()) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'El email no es válido' }, { status: 400 });
    }

    const sectorNombre = SECTORES_MAP[sector] || sector;

    const newsletterOptIn = body.newsletter === true;
    const privacidad = typeof body.privacidad === 'boolean'
      ? body.privacidad
      : typeof body.acepta === 'boolean' ? body.acepta : null;
    // Crear CRM, captación y solicitud partner dentro de la misma transacción.
    const captacion = await guardarCaptacionWeb(request, {
      formulario: '/api/partners',
      segmentoCrm: 'PARTNER',
      nombre, email, telefono, empresa,
      datos: {
        nombre, email, telefono, empresa: empresa || null, sector,
        numClientes: numClientes || null, mensaje: mensaje || null,
      },
      newsletter: newsletterOptIn,
      privacidad,
      persistir: async (tx, contactoId) => tx.leadPartner.create({
        data: {
          crmContactoId: contactoId,
          segmentoCrm: 'PARTNER',
          nombre: nombre.trim(),
          empresa: empresa ? empresa.trim() : null,
          email: email.trim().toLowerCase(),
          telefono: telefono.trim(),
          sector: sectorNombre,
          numClientes: numClientes ? numClientes.trim() : null,
          mensaje: mensaje ? mensaje.trim() : null,
          newsletter: newsletterOptIn,
          estado: 'NUEVO',
          prioridad: 'MEDIA',
        },
      }),
    });
    const resultadoLocal = {
      success: true,
      contactoId: captacion.contactoId,
      captacionId: captacion.captacionId,
      repetido: captacion.repetido,
    };
    const respuesta = { ...resultadoLocal, id: captacion.registro.id };
    if (captacion.repetido) return NextResponse.json(respuesta, { status: 201 });

    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();

    // Ejecutar todas las acciones externas en paralelo
    const promises = [];

    // 1. Email de notificación a comercial
    if (brevoApiKey) {
      promises.push(enviarEmailComercial(brevoApiKey, { nombre, empresa, email, telefono, sectorNombre, numClientes, mensaje }));
    }

    // 2. Email de confirmación al interesado
    if (brevoApiKey) {
      promises.push(enviarEmailConfirmacion(brevoApiKey, { nombre, empresa, email, sectorNombre }));
    }

    // 3. Si se suscribe al newsletter, crear contacto en Brevo con lista partners
    if (newsletterOptIn && brevoApiKey) {
      promises.push(crearContactoBrevo(brevoApiKey, { nombre, empresa, email, telefono }));
    }

    await Promise.allSettled(promises);

    return NextResponse.json(respuesta, { status: 201 });

  } catch {
    console.error('[partners] No se pudo completar la operación');
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

    if (!res.ok) {

      console.error('[partners] No se pudo completar la operación');
    }
  } catch {
    console.error('[partners] No se pudo completar la operación');
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

    if (!res.ok) {

      console.error('[partners] No se pudo completar la operación');
    }
  } catch {
    console.error('[partners] No se pudo completar la operación');
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

    if (!res.ok) {
      const err = await res.json();
      if (err.code === 'duplicate_parameter') {
        // Ya existe, añadir a lista
        await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LISTA_NEWSLETTER_PARTNERS}/contacts/add`, {
          method: 'POST',
          headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
          body: JSON.stringify({ emails: [email] })
        });
      }
    }
  } catch {
    console.error('[partners] No se pudo completar la operación');
  }
}
