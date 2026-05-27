/**
 * Módulo centralizado de envío de email usando Microsoft Graph API
 * Usa OAuth2 client credentials flow (sin interacción de usuario)
 * Envía desde: administracion@internetoperadores.com
 */

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  attachments?: Array<{
    filename: string
    content?: Buffer | string
    path?: string
    contentType?: string
  }>
}

interface GraphTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

// Cache del token para evitar solicitar uno nuevo en cada envío
let cachedToken: { token: string; expiresAt: number } | null = null

/**
 * Obtiene un access token de Azure AD usando client credentials flow
 */
async function getAccessToken(): Promise<string> {
  // Usar token cacheado si aún es válido (con 5 min de margen)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300000) {
    return cachedToken.token
  }

  const tenantId = process.env.AZURE_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Faltan variables de entorno de Azure AD (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)')
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Error obteniendo token de Azure AD: ${response.status} - ${errorData}`)
  }

  const data: GraphTokenResponse = await response.json()

  // Cachear el token
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }

  return data.access_token
}

/**
 * Envía un email usando Microsoft Graph API
 */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  try {
    const accessToken = await getAccessToken()
    const fromEmail = process.env.EMAIL_FROM || 'david.perez@internetoperadores.com'

    // Construir la lista de destinatarios
    const toRecipients = (Array.isArray(options.to) ? options.to : [options.to]).map(email => ({
      emailAddress: { address: email },
    }))

    // Construir attachments para Graph API (base64 encoded)
    const graphAttachments = options.attachments?.map(att => {
      let contentBytes: string

      if (att.content) {
        if (Buffer.isBuffer(att.content)) {
          contentBytes = att.content.toString('base64')
        } else {
          contentBytes = Buffer.from(att.content).toString('base64')
        }
      } else {
        contentBytes = ''
      }

      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        contentBytes,
      }
    }) || []

    // Construir el payload del mensaje
    const mailPayload: any = {
      message: {
        subject: options.subject,
        body: {
          contentType: 'HTML',
          content: options.html,
        },
        from: {
          emailAddress: { address: fromEmail },
        },
        toRecipients,
      },
      saveToSentItems: true,
    }

    // Añadir attachments si existen
    if (graphAttachments.length > 0) {
      mailPayload.message.attachments = graphAttachments
    }

    // Enviar usando Graph API
    const sendUrl = `https://graph.microsoft.com/v1.0/users/${fromEmail}/sendMail`

    const response = await fetch(sendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mailPayload),
    })

    if (response.status === 202 || response.status === 200) {
      return { success: true }
    }

    // Si hay error, intentar leer el detalle
    const errorText = await response.text()
    let errorMessage = `Graph API error ${response.status}`
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error?.message || errorMessage
    } catch {
      errorMessage = errorText || errorMessage
    }

    console.error('Error Microsoft Graph sendMail:', errorMessage)
    return { success: false, error: `Error Graph API: ${errorMessage}` }
  } catch (error: any) {
    console.error('Error enviando email:', error.message)
    return { success: false, error: `Error email: ${error.message}` }
  }
}
