export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { guardarCaptacionWeb } from '@/lib/crm-captacion-web';

const BREVO_API_KEY = process.env.BREVO_API_KEY;

// IDs de listas
const BREVO_LIST_NEWSLETTER_EMPRESAS = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'El formulario debe ser un objeto válido' }, { status: 400 });
    }
    const { nombre, email, empresa, telefono, cargo, guia } = body;

    if (![nombre, email, empresa, telefono, cargo, guia].every(value => value == null || typeof value === 'string')) {
      return NextResponse.json({ error: 'Los campos del formulario deben ser texto' }, { status: 400 });
    }

    // Validación
    if (!nombre?.trim() || !email?.trim()) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (nombre, email)' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json({ error: 'El email no es válido' }, { status: 400 });
    }

    const newsletterOptIn = body.newsletter === true;
    const privacidad = typeof body.privacidad === 'boolean'
      ? body.privacidad
      : typeof body.acepta === 'boolean' ? body.acepta : null;
    const captacion = await guardarCaptacionWeb(request, {
      formulario: '/api/guias-lead',
      segmentoCrm: 'EMPRESA',
      nombre, email, telefono, empresa,
      datos: {
        nombre, email, empresa: empresa || null, telefono: telefono || null,
        cargo: cargo || null, guia: guia || 'Guía no especificada',
      },
      newsletter: newsletterOptIn,
      privacidad,
    });
    const resultadoLocal = {
      success: true,
      contactoId: captacion.contactoId,
      captacionId: captacion.captacionId,
      repetido: captacion.repetido,
    };
    if (captacion.repetido) {
      return NextResponse.json({ ...resultadoLocal, emailComercial: false, emailInteresado: false, brevo: false });
    }

    const brevoApiKey = (BREVO_API_KEY || '').trim();
    const guiaNombre = guia || 'Guía no especificada';

    // Ejecutar todas las acciones en paralelo
    const results = await Promise.allSettled([
      // 1. Email de notificación a comercial
      sendEmailComercial(brevoApiKey, { nombre, email, empresa, telefono, cargo, guiaNombre, newsletter: newsletterOptIn }),
      // 2. Email de confirmación al interesado
      sendEmailInteresado(brevoApiKey, { nombre, email, guiaNombre, newsletter: newsletterOptIn }),
      // 3. Newsletter opcional, nunca implícito por descargar una guía
      newsletterOptIn ? addToBrevo(brevoApiKey, { nombre, email, empresa, telefono, guiaNombre }) : Promise.resolve(false),
    ]);

    const emailComercial = results[0].status === 'fulfilled' && results[0].value;
    const emailInteresado = results[1].status === 'fulfilled' && results[1].value;
    const brevo = results[2].status === 'fulfilled' && results[2].value;

    return NextResponse.json({
      ...resultadoLocal,
      emailComercial,
      emailInteresado,
      brevo,
    });

  } catch {
    console.error('[guias-lead] No se pudo completar la operación');
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}

// --- Email a comercial ---
async function sendEmailComercial(apiKey, { nombre, email, empresa, telefono, cargo, guiaNombre, newsletter }) {
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
                <strong>💡 Sugerencia:</strong> Este contacto ha descargado ${guiaNombre}.${newsletter ? " También se ha suscrito al newsletter." : " No ha solicitado suscribirse al newsletter."} Contactar en 24-48h para ofrecer asesoramiento personalizado.
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
async function sendEmailInteresado(apiKey, { nombre, email, guiaNombre, newsletter }) {
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
            ${newsletter ? `<p style="color: #374151; font-size: 16px; line-height: 1.6;">
              Te has suscrito a nuestro newsletter de empresas. Recibirás periódicamente contenido exclusivo sobre soluciones IT y telecomunicaciones.
            </p>` : ''}
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
            ${newsletter ? `<p style="color: #9CA3AF; font-size: 11px; margin: 8px 0 0 0;">
              Puedes darte de baja en cualquier momento desde el enlace de nuestros emails.
            </p>` : ''}
          </div>
        </div>
      `
    })
  });

  return res.ok;
}

// --- Brevo: crear contacto + lista Newsletter Empresas ---
async function addToBrevo(apiKey, { nombre, email, empresa, telefono, guiaNombre }) {
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
      return true;
    }

    // Si ya existe, actualizar listas
    if (res.status === 400 && (await res.json()).code === 'duplicate_parameter') {
      const addToList = await fetch(`https://api.brevo.com/v3/contacts/lists/${BREVO_LIST_NEWSLETTER_EMPRESAS}/contacts/add`, {
        method: 'POST',
        headers: { 'accept': 'application/json', 'api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ emails: [email] })
      });
      return addToList.ok;
    }

    return false;
  } catch {
    console.error('[guias-lead] No se pudo completar la operación');
    return false;
  }
}
