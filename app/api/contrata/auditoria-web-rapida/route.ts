import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_LIST_AUDITORIA = '501'; // Lista IO-MIGRACION-WEB
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
      await fetch(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships/add`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([contactId]),
      });
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
    const { nombre, email, empresa, telefono, urlWeb, mensaje } = body;

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

    // Crear lead en LeadMigracionWeb (formulario simplificado)
    const lead = await prisma.leadMigracionWeb.create({
      data: {
        nombreEmpresa: empresa,
        contacto: nombre,
        email,
        telefono: telefono || null,
        urlWebActual: urlWeb || null,
        frustracionActual: mensaje || null,
        comoNosConocio: 'Formulario rápido - Página Soluciones',
        origenFormulario: 'rapido',
        estado: 'NUEVO',
        prioridad: 'MEDIA',
      },
    });

    // === EMAILS ===
    const emailComercialHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Nueva Solicitud de Auditoría Web</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Formulario rápido - Página Soluciones</p>
        </div>
        <div style="padding: 24px; background: #f9f9f9;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Nombre:</td><td style="padding: 8px; color: #1f2937;">${nombre}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Empresa:</td><td style="padding: 8px; color: #1f2937;">${empresa}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Email:</td><td style="padding: 8px; color: #1f2937;">${email}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Teléfono:</td><td style="padding: 8px; color: #1f2937;">${telefono || 'No proporcionado'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold; color: #374151;">Web actual:</td><td style="padding: 8px; color: #1f2937;">${urlWeb ? `<a href="${urlWeb}">${urlWeb}</a>` : 'No proporcionada'}</td></tr>
          </table>
          ${mensaje ? `<div style="margin-top: 16px; padding: 12px; background: white; border-radius: 8px; border: 1px solid #e5e7eb;"><p style="margin: 0 0 4px 0; font-weight: bold; color: #374151;">Problemas con la web actual:</p><p style="margin: 0; color: #4b5563;">${mensaje}</p></div>` : ''}
          <p style="margin-top: 20px;"><a href="https://www.internetoperadores.com/admin/leads" style="background: #f97316; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Ver en el panel</a></p>
        </div>
        <div style="background: #f9fafb; padding: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #9ca3af; font-size: 12px;">Internet Operadores © 2026</p>
        </div>
      </div>
    `;

    // Construir URL del wizard con datos pre-rellenados
    const wizardParams = new URLSearchParams();
    if (empresa) wizardParams.set('empresa', empresa);
    if (nombre) wizardParams.set('contacto', nombre);
    if (email) wizardParams.set('email', email);
    if (telefono) wizardParams.set('telefono', telefono);
    if (urlWeb) wizardParams.set('url', urlWeb);
    const wizardUrl = `https://www.internetoperadores.com/contrata/migracion-web?${wizardParams.toString()}`;

    const emailInteresadoHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Solicitud recibida</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Auditoría Web Gratuita</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #4b5563; line-height: 1.6;">Hola <strong>${nombre}</strong>,</p>
          <p style="color: #4b5563; line-height: 1.6;">Hemos recibido tu solicitud de <strong>auditoría web gratuita</strong> para <strong>${empresa}</strong>.</p>
          <p style="color: #4b5563; line-height: 1.6;">Nuestro equipo de desarrollo web analizará tu sitio y te contactará en un plazo máximo de <strong>48 horas</strong> con un informe detallado de seguridad, rendimiento y oportunidades de mejora.</p>
          ${urlWeb ? `<div style="background: #f0f9ff; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0;"><p style="margin: 0; color: #374151;"><strong>Web a analizar:</strong> <a href="${urlWeb}" style="color: #f97316;">${urlWeb}</a></p></div>` : ''}
          <div style="background: #fff7ed; border: 2px solid #f97316; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 18px; font-weight: bold; color: #1f2937;">Siguiente paso: Prepáranos tu propuesta</p>
            <p style="margin: 0 0 16px 0; color: #4b5563; font-size: 14px;">Para poder preparar una propuesta personalizada y precisa, necesitamos conocer algunos detalles más sobre tu proyecto. Completa este breve cuestionario (3-5 minutos):</p>
            <a href="${wizardUrl}" style="display: inline-block; background: #f97316; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Completar cuestionario</a>
            <p style="margin: 12px 0 0 0; color: #9ca3af; font-size: 12px;">Tus datos ya están pre-rellenados, solo tienes que completar las preguntas adicionales.</p>
          </div>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #374151;">¿Qué incluye la auditoría?</p>
            <ul style="margin: 0; padding-left: 20px; color: #4b5563;">
              <li>Análisis de seguridad (vulnerabilidades, plugins obsoletos)</li>
              <li>Test de rendimiento (velocidad, Core Web Vitals)</li>
              <li>Evaluación SEO técnico</li>
              <li>Propuesta personalizada de migración</li>
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
      sendBrevoEmail({ email: 'comercial@internetoperadores.com', name: 'Comercial IO' }, `Nueva Auditoría Web (rápida) - ${empresa}`, emailComercialHtml),
      sendBrevoEmail({ email: 'victor@internetoperadores.com', name: 'Victor' }, `Nueva Auditoría Web (rápida) - ${empresa}`, emailComercialHtml),
      sendBrevoEmail({ email, name: nombre }, `Tu solicitud de auditoría web ha sido recibida - Internet Operadores`, emailInteresadoHtml),
    ];

    // HubSpot: lista Auditoría Web + Newsletter Empresas
    const notaHubspot = `Solicitud de Auditoría Web (formulario rápido)\n- Web actual: ${urlWeb || 'N/A'}\n- Problemas: ${mensaje || 'N/A'}\n- Origen: Página Soluciones Migración Web`;
    const integrationPromises = [
      addToHubSpot(email, nombre, empresa, telefono || '', [HUBSPOT_LIST_AUDITORIA, HUBSPOT_LIST_NEWSLETTER_EMPRESAS], notaHubspot),
      addToBrevoNewsletter(email, nombre, empresa, telefono || ''),
    ];

    // Ejecutar sin bloquear la respuesta
    await Promise.allSettled([...emailPromises, ...integrationPromises]);

    return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear lead (auditoría rápida):', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
