import { NextResponse } from 'next/server';
import { guardarCaptacionWeb } from '@/lib/crm-captacion-web';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
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
    const { nombre, email, empresa, telefono, numSedes, conexionActual, velocidadNecesaria, servicios, problemaActual, operadorActual, comentarios } = body;

    // Validaciones
    if (!nombre || !email || !empresa || !numSedes) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre, email, empresa y número de sedes' },
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

    // Persistir contacto, captación y detalle en una única transacción antes de enviar emails.
    const datosSolicitud = {
      numSedes: numSedes || null,
      conexionActual: conexionActual || null,
      velocidadNecesaria: velocidadNecesaria || null,
      servicios: servicios || [],
      problemaActual: problemaActual || null,
      operadorActual: operadorActual || null,
      comentarios: comentarios || null,
    };
    const { contactoId, registro: lead, repetido } = await guardarCaptacionWeb(request, {
      formulario: '/api/contrata/conectividad-avanzada',
      segmentoCrm: 'EMPRESA',
      nombre,
      email,
      telefono: telefono || null,
      empresa,
      datos: datosSolicitud,
      newsletter: body.newsletter === true,
      privacidad: typeof body.privacidad === 'boolean' ? body.privacidad : null,
      persistir: async (tx, contactoId) => tx.leadSolucion.create({
        data: {
          crmContactoId: contactoId,
          tipo: 'CONECTIVIDAD_AVANZADA',
          segmentoCrm: 'EMPRESA',
          nombre,
          email,
          empresa,
          telefono: telefono || null,
          datos: datosSolicitud,
        },
      }),
    });

    // Un reintento devuelve el mismo detalle, sin repetir emails ni suscripciones.
    if (repetido) {
      return NextResponse.json({ success: true, leadId: lead.id, contactoId, repetido: true }, { status: 201 });
    }

    // === EMAILS ===
    const emailComercialHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Nueva Solicitud de Conectividad Avanzada</h1>
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
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Nº sedes:</td><td style="padding: 8px; color: #1f2937;">${numSedes}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Conexión actual:</td><td style="padding: 8px; color: #1f2937;">${conexionActual || 'No indicada'}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Velocidad necesaria:</td><td style="padding: 8px; color: #1f2937;">${velocidadNecesaria || 'No indicada'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Servicios:</td><td style="padding: 8px; color: #1f2937;">${serviciosTexto}</td></tr>
              <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Problema actual:</td><td style="padding: 8px; color: #1f2937;">${problemaActual || 'No indicado'}</td></tr>
              <tr style="background: #f9fafb;"><td style="padding: 8px; font-weight: bold; color: #374151;">Operador actual:</td><td style="padding: 8px; color: #1f2937;">${operadorActual || 'No indicado'}</td></tr>
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
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Conectividad Avanzada</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #4b5563; line-height: 1.6;">Hola <strong>${nombre}</strong>,</p>
          <p style="color: #4b5563; line-height: 1.6;">Hemos recibido tu solicitud de estudio de <strong>Conectividad Avanzada</strong> para <strong>${empresa}</strong>.</p>
          <p style="color: #4b5563; line-height: 1.6;">Nuestro equipo de ingeniería de redes analizará tus necesidades y te contactará en un plazo máximo de <strong>24 horas</strong> con una propuesta personalizada.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">Resumen de tu solicitud:</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563; line-height: 1.8;">
              <li>Sedes: <strong>${numSedes}</strong></li>
              <li>Conexión actual: <strong>${conexionActual || 'No indicada'}</strong></li>
              <li>Velocidad necesaria: <strong>${velocidadNecesaria || 'No indicada'}</strong></li>
              <li>Servicios: <strong>${serviciosTexto}</strong></li>
            </ul>
          </div>
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">¿Qué incluirá tu estudio?</p>
            <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #4b5563; text-align: left; line-height: 1.8;">
              <li>Análisis de cobertura en tu zona</li>
              <li>Comparativa de tecnologías disponibles (fibra, radio, SD-WAN)</li>
              <li>Propuesta de redundancia y backup de línea</li>
              <li>Presupuesto detallado con SLA garantizado</li>
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
      sendBrevoEmail({ email: 'comercial@internetoperadores.com', name: 'Comercial IO' }, `Nueva solicitud Conectividad Avanzada - ${empresa} (${numSedes})`, emailComercialHtml),
      sendBrevoEmail({ email: 'victor@internetoperadores.com', name: 'Victor' }, `Nueva solicitud Conectividad Avanzada - ${empresa} (${numSedes})`, emailComercialHtml),
      sendBrevoEmail({ email, name: nombre }, `Tu solicitud de Conectividad Avanzada ha sido recibida - Internet Operadores`, emailInteresadoHtml),
    ];

    // La suscripción comercial es opcional y requiere un opt-in explícito.
    const newsletterPromises = body.newsletter === true
      ? [addToBrevoNewsletter(email, nombre, empresa, telefono || '')]
      : [];
    await Promise.allSettled([...emailPromises, ...newsletterPromises]);

    return NextResponse.json({ success: true, leadId: lead.id, contactoId, repetido: false }, { status: 201 });
  } catch (error) {
    console.error('[CONECTIVIDAD] Error general:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
