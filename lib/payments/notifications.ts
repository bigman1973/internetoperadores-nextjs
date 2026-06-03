const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim()
const HUBSPOT_API_KEY = (process.env.HUBSPOT_API_KEY || '').trim()
const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'

interface OrderData {
  id: string
  customerEmail: string
  customerName: string
  customerPhone?: string | null
  customerCompany?: string | null
  customerType?: string | null
  tarifaNombre: string
  importeAlta?: number | null
  importeCuota: number
  importeTotal: number
  periodicidad?: string | null
  paymentGateway: string
}

async function sendEmail({ to, toName, subject, htmlContent }: { to: string; toName: string; subject: string; htmlContent: string }) {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email: to, name: toName }],
        subject,
        htmlContent,
      }),
    })
    if (!res.ok) {
      console.error('[PaymentNotif] Error email:', await res.text())
    }
  } catch (e: any) {
    console.error('[PaymentNotif] Error enviando email:', e.message)
  }
}

export async function sendPaymentSuccessEmails(order: OrderData) {
  const gateway = order.paymentGateway === 'VIVID_CARD' ? 'Tarjeta' : order.paymentGateway === 'TRIPLE_A_CRYPTO' ? 'Crypto' : order.paymentGateway

  // 1. Email al interesado
  const htmlCliente = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1f2937; padding: 20px; text-align: center;">
        <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
        <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Confirmación de pago</p>
      </div>
      <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">¡Pago recibido correctamente!</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          Hola <strong>${order.customerName}</strong>, hemos recibido tu pago correctamente.
        </p>
        <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #bbf7d0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Servicio:</td><td style="color: #1f2937;">${order.tarifaNombre}</td></tr>
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Importe total:</td><td style="color: #166534; font-weight: bold; font-size: 18px;">${order.importeTotal.toFixed(2)}€</td></tr>
            ${order.importeAlta ? `<tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">  - Alta:</td><td style="color: #6b7280; font-size: 13px;">${order.importeAlta.toFixed(2)}€</td></tr>` : ''}
            <tr><td style="padding: 6px 0; color: #6b7280; font-size: 13px;">  - Cuota:</td><td style="color: #6b7280; font-size: 13px;">${order.importeCuota.toFixed(2)}€/${order.periodicidad === 'ANUAL' ? 'año' : 'mes'}</td></tr>
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Método de pago:</td><td style="color: #1f2937;">${gateway}</td></tr>
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Nº Pedido:</td><td style="color: #1f2937;">${order.id}</td></tr>
          </table>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          Nuestro equipo procederá a activar tu servicio. Te contactaremos si necesitamos algún dato adicional.
        </p>
        <div style="background: #f9fafb; padding: 12px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 0; color: #374151; font-size: 14px;">
            <strong>Tiempo estimado de activación:</strong> 5-10 días hábiles
          </p>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          Si necesitas ayuda, contacta con nosotros en el <strong>900 730 034</strong> o en <strong>comercial@internetoperadores.com</strong>.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Este es un email automático.</p>
      </div>
    </div>
  `

  sendEmail({
    to: order.customerEmail,
    toName: order.customerName,
    subject: `Pago confirmado: ${order.tarifaNombre} - ${order.importeTotal.toFixed(2)}€`,
    htmlContent: htmlCliente,
  })

  // 2. Email a comercial + administración
  const htmlInterno = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #166534; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px;">💰 Nuevo Pago Recibido</h1>
        <p style="color: #bbf7d0; margin: 8px 0 0 0; font-size: 14px;">Pedido #${order.id}</p>
      </div>
      <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Cliente:</td><td style="color: #1f2937;">${order.customerName}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Tipo:</td><td style="color: #1f2937;">${order.customerType || 'PARTICULAR'}</td></tr>
          ${order.customerCompany ? `<tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Empresa:</td><td style="color: #1f2937;">${order.customerCompany}</td></tr>` : ''}
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Email:</td><td style="color: #1f2937;">${order.customerEmail}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Teléfono:</td><td style="color: #1f2937;">${order.customerPhone || 'No proporcionado'}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Servicio:</td><td style="color: #1f2937;">${order.tarifaNombre}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Importe:</td><td style="color: #166534; font-weight: bold; font-size: 18px;">${order.importeTotal.toFixed(2)}€</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Método:</td><td style="color: #1f2937;">${gateway}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Periodicidad:</td><td style="color: #1f2937;">${order.periodicidad || 'MENSUAL'}</td></tr>
        </table>
        <p style="margin-top: 16px;">
          <a href="${BASE_URL}/admin/pedidos/${order.id}" style="display: inline-block; background: #f97316; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">Ver pedido en el panel</a>
        </p>
      </div>
    </div>
  `

  sendEmail({
    to: 'comercial@internetoperadores.com',
    toName: 'Comercial Internet Operadores',
    subject: `[Pago Recibido] ${order.customerName} - ${order.tarifaNombre} - ${order.importeTotal.toFixed(2)}€`,
    htmlContent: htmlInterno,
  })

  sendEmail({
    to: 'administracion@internetoperadores.com',
    toName: 'Administración Internet Operadores',
    subject: `[Pago Recibido] ${order.customerName} - ${order.tarifaNombre} - ${order.importeTotal.toFixed(2)}€`,
    htmlContent: htmlInterno,
  })
}

export async function sendAbandonedCartEmail(order: OrderData) {
  const gateway = order.paymentGateway === 'VIVID_CARD' ? 'Tarjeta' : order.paymentGateway === 'TRIPLE_A_CRYPTO' ? 'Crypto' : order.paymentGateway

  // Email al interesado
  const htmlCliente = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1f2937; padding: 20px; text-align: center;">
        <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
        <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Tu pedido está pendiente</p>
      </div>
      <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Hola ${order.customerName},</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          Hemos visto que iniciaste la contratación de un servicio pero no completaste el pago. ¿Necesitas ayuda?
        </p>
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fde68a;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Servicio:</td><td style="color: #1f2937;">${order.tarifaNombre}</td></tr>
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Importe:</td><td style="color: #92400e; font-weight: bold;">${order.importeTotal.toFixed(2)}€</td></tr>
            <tr><td style="padding: 6px 0; color: #374151; font-weight: bold;">Método:</td><td style="color: #1f2937;">${gateway}</td></tr>
          </table>
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          Si tuviste algún problema durante el proceso de pago o tienes alguna duda, no dudes en contactarnos:
        </p>
        <ul style="color: #4b5563; line-height: 2;">
          <li>Teléfono: <strong>900 730 034</strong></li>
          <li>Email: <strong>comercial@internetoperadores.com</strong></li>
          <li>WhatsApp: <strong>900 730 034</strong></li>
        </ul>
        <p style="color: #4b5563; line-height: 1.6;">
          Estaremos encantados de ayudarte a completar tu contratación.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          Este es un email automático. Si ya completaste el pago, ignora este mensaje.
        </p>
      </div>
    </div>
  `

  sendEmail({
    to: order.customerEmail,
    toName: order.customerName,
    subject: `¿Necesitas ayuda? Tu pedido de ${order.tarifaNombre} está pendiente`,
    htmlContent: htmlCliente,
  })

  // Email a comercial (para seguimiento)
  const htmlInterno = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #92400e; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px;">⚠️ Carrito Abandonado</h1>
        <p style="color: #fde68a; margin: 8px 0 0 0; font-size: 14px;">Pedido #${order.id}</p>
      </div>
      <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Cliente:</td><td style="color: #1f2937;">${order.customerName}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Email:</td><td style="color: #1f2937;">${order.customerEmail}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Teléfono:</td><td style="color: #1f2937;">${order.customerPhone || 'No proporcionado'}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Servicio:</td><td style="color: #1f2937;">${order.tarifaNombre}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #374151;">Importe:</td><td style="color: #92400e; font-weight: bold;">${order.importeTotal.toFixed(2)}€</td></tr>
        </table>
        <p style="margin-top: 12px; color: #6b7280; font-size: 13px;">
          El cliente ha sido notificado automáticamente. Se recomienda contactar para ofrecer asistencia.
        </p>
      </div>
    </div>
  `

  sendEmail({
    to: 'comercial@internetoperadores.com',
    toName: 'Comercial Internet Operadores',
    subject: `[Carrito Abandonado] ${order.customerName} - ${order.tarifaNombre} - ${order.importeTotal.toFixed(2)}€`,
    htmlContent: htmlInterno,
  })

  // Añadir a lista de HubSpot "IO - Carritos Abandonados" (ID: 497)
  try {
    // Primero crear/buscar contacto en HubSpot
    const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: order.customerEmail }] }],
      }),
    })
    const searchData = await searchRes.json()
    let contactId: string

    if (searchData.total > 0) {
      contactId = searchData.results[0].id
    } else {
      // Crear contacto
      const createRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            email: order.customerEmail,
            firstname: order.customerName.split(' ')[0],
            lastname: order.customerName.split(' ').slice(1).join(' ') || '',
            phone: order.customerPhone || '',
            company: order.customerCompany || '',
          },
        }),
      })
      const createData = await createRes.json()
      contactId = createData.id
    }

    // Añadir a lista 497
    if (contactId) {
      await fetch(`https://api.hubapi.com/crm/v3/lists/497/memberships/add`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${HUBSPOT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([contactId]),
      })
    }
  } catch (e: any) {
    console.error('[AbandonedCart] Error HubSpot:', e.message)
  }
}
