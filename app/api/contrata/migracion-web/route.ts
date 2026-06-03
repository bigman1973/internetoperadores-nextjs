import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim();
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim();
const HUBSPOT_LIST_AUDITORIA = '499';
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
    // Buscar contacto existente
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }] }),
    });
    const searchData = await searchRes.json();
    let contactId: string;

    if (searchData.results && searchData.results.length > 0) {
      contactId = searchData.results[0].id;
      // Actualizar
      await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { firstname: nombre, company: empresa, phone: telefono } }),
      });
    } else {
      // Crear
      const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: { email, firstname: nombre, company: empresa, phone: telefono } }),
      });
      const createData = await createRes.json();
      contactId = createData.id;
    }

    // Añadir a listas
    for (const listId of listIds) {
      await fetch(`https://api.hubapi.com/crm/v3/lists/${listId}/memberships/add`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordIdsToAdd: [contactId] }),
      });
    }

    // Crear nota
    if (nota) {
      const noteRes = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
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

    const {
      nombreEmpresa,
      contacto,
      email,
      telefono,
      urlWebActual,
      sector,
      sectorOtro,
      numPaginas,
      tieneBlog,
      tieneTienda,
      tieneFormularios,
      tieneAreaPrivada,
      frustracionActual,
      objetivos,
      respuestasSector,
      softwareActual,
      tieneApi,
      datosIntegracion,
      proveedorActual,
      presupuesto,
      fechaLimite,
      comoNosConocio,
      newsletter,
    } = body;

    // Validaciones básicas
    if (!nombreEmpresa || !contacto || !email) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre empresa, contacto y email' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'El email no es válido' },
        { status: 400 }
      );
    }

    // Determinar si necesita integración
    const necesitaIntegracion = Array.isArray(objetivos) && objetivos.includes('integrar_software');

    // Crear el lead en la BD
    const lead = await prisma.leadMigracionWeb.create({
      data: {
        nombreEmpresa,
        contacto,
        email,
        telefono: telefono || null,
        urlWebActual: urlWebActual || null,
        sector: sector || null,
        sectorOtro: sectorOtro || null,
        numPaginas: numPaginas || null,
        tieneBlog: tieneBlog || false,
        tieneTienda: tieneTienda || false,
        tieneFormularios: tieneFormularios || false,
        tieneAreaPrivada: tieneAreaPrivada || false,
        frustracionActual: frustracionActual || null,
        objetivos: objetivos || [],
        respuestasSector: respuestasSector || {},
        necesitaIntegracion,
        softwareActual: necesitaIntegracion ? (softwareActual || null) : null,
        tieneApi: necesitaIntegracion ? (tieneApi || null) : null,
        datosIntegracion: necesitaIntegracion ? (datosIntegracion || null) : null,
        proveedorActual: necesitaIntegracion ? (proveedorActual || null) : null,
        presupuesto: presupuesto || null,
        fechaLimite: fechaLimite || null,
        comoNosConocio: comoNosConocio || null,
        estado: 'NUEVO',
        prioridad: calcularPrioridad(presupuesto, sector),
      },
    });

    // === EMAILS Y INTEGRACIONES (no bloquean la respuesta) ===
    const sectorLabel = sectorOtro || sector || 'No especificado';
    const objetivosLabel = Array.isArray(objetivos) ? objetivos.join(', ') : 'No especificados';

    // Email a comercial + victor@
    const emailComercialHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0;">Nueva Solicitud de Auditoría Web</h1>
        </div>
        <div style="padding: 20px; background: #f9f9f9;">
          <h2 style="color: #333;">Datos del solicitante</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px; font-weight: bold;">Empresa:</td><td style="padding: 8px;">${nombreEmpresa}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Contacto:</td><td style="padding: 8px;">${contacto}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${email}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Teléfono:</td><td style="padding: 8px;">${telefono || 'No proporcionado'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Web actual:</td><td style="padding: 8px;">${urlWebActual || 'No proporcionada'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Sector:</td><td style="padding: 8px;">${sectorLabel}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Nº páginas:</td><td style="padding: 8px;">${numPaginas || 'No especificado'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Objetivos:</td><td style="padding: 8px;">${objetivosLabel}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Presupuesto:</td><td style="padding: 8px;">${presupuesto || 'No especificado'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Fecha límite:</td><td style="padding: 8px;">${fechaLimite || 'Sin prisa'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Cómo nos conoció:</td><td style="padding: 8px;">${comoNosConocio || 'No especificado'}</td></tr>
            <tr><td style="padding: 8px; font-weight: bold;">Prioridad:</td><td style="padding: 8px;">${calcularPrioridad(presupuesto, sector)}</td></tr>
          </table>
          ${frustracionActual ? `<p><strong>Frustración actual:</strong> ${frustracionActual}</p>` : ''}
          ${necesitaIntegracion ? `<p><strong>Software actual:</strong> ${softwareActual || 'N/A'} | <strong>Tiene API:</strong> ${tieneApi || 'N/A'}</p>` : ''}
          <p style="margin-top: 20px;"><a href="https://www.internetoperadores.com/admin/leads" style="background: #f97316; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ver en el panel</a></p>
        </div>
      </div>
    `;

    // Email de confirmación al interesado
    const emailInteresadoHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1a1a2e; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0;">Solicitud recibida</h1>
        </div>
        <div style="padding: 20px;">
          <p>Hola <strong>${contacto}</strong>,</p>
          <p>Hemos recibido tu solicitud de <strong>auditoría web gratuita</strong> para <strong>${nombreEmpresa}</strong>.</p>
          <p>Nuestro equipo de desarrollo web revisará la información proporcionada y te enviará una propuesta personalizada en un plazo máximo de <strong>5 días laborables</strong>.</p>
          <div style="background: #f0f9ff; border-left: 4px solid #f97316; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Resumen de tu solicitud:</strong></p>
            <ul style="margin: 10px 0;">
              <li>Web actual: ${urlWebActual || 'No proporcionada'}</li>
              <li>Sector: ${sectorLabel}</li>
              <li>Objetivos: ${objetivosLabel}</li>
              <li>Presupuesto orientativo: ${presupuesto || 'No especificado'}</li>
            </ul>
          </div>
          <p>Si tienes alguna duda, no dudes en contactarnos:</p>
          <ul>
            <li>📞 900 730 034</li>
            <li>📧 comercial@internetoperadores.com</li>
          </ul>
          <p>Gracias por confiar en Internet Operadores.</p>
        </div>
      </div>
    `;

    // Enviar emails en paralelo
    const emailPromises = [
      sendBrevoEmail({ email: 'comercial@internetoperadores.com', name: 'Comercial IO' }, `Nueva Auditoría Web - ${nombreEmpresa} [${calcularPrioridad(presupuesto, sector)}]`, emailComercialHtml),
      sendBrevoEmail({ email: 'victor@internetoperadores.com', name: 'Victor' }, `Nueva Auditoría Web - ${nombreEmpresa} [${calcularPrioridad(presupuesto, sector)}]`, emailComercialHtml),
      sendBrevoEmail({ email, name: contacto }, `Tu solicitud de auditoría web ha sido recibida - Internet Operadores`, emailInteresadoHtml),
    ];

    // HubSpot: crear contacto + lista Auditoría Web + newsletter si aplica
    const hubspotLists = [HUBSPOT_LIST_AUDITORIA];
    if (newsletter) {
      hubspotLists.push(HUBSPOT_LIST_NEWSLETTER_EMPRESAS);
    }
    const notaHubspot = `Solicitud de Auditoría Web\n- Web actual: ${urlWebActual || 'N/A'}\n- Sector: ${sectorLabel}\n- Objetivos: ${objetivosLabel}\n- Presupuesto: ${presupuesto || 'N/A'}\n- Prioridad: ${calcularPrioridad(presupuesto, sector)}`;

    const integrationPromises = [
      addToHubSpot(email, contacto, nombreEmpresa, telefono || '', hubspotLists, notaHubspot),
    ];

    // Brevo newsletter (siempre obligatorio para descargar/solicitar)
    integrationPromises.push(addToBrevoNewsletter(email, contacto, nombreEmpresa, telefono || ''));

    // Ejecutar todo en paralelo sin bloquear
    await Promise.allSettled([...emailPromises, ...integrationPromises]);

    return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear lead:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

function calcularPrioridad(presupuesto?: string, sector?: string): 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE' {
  if (presupuesto === 'Más de 12.000 €') return 'ALTA';
  if (presupuesto === '6.000 - 12.000 €') return 'ALTA';
  if (presupuesto === '3.000 - 6.000 €') return 'MEDIA';
  if (presupuesto === 'Menos de 3.000 €') return 'BAJA';
  return 'MEDIA';
}
