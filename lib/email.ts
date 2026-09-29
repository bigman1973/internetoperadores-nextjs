/**
 * Módulo centralizado de envío de correo con Microsoft Graph API.
 * Usa OAuth2 client credentials (sin interacción del usuario).
 */

import { readFile } from 'node:fs/promises'

interface EmailOptions {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  bcc?: string | string[]
  from?: string
  replyTo?: string | string[]
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

export type CrmEmailResult = {
  success: boolean
  sender: string
  status: number | null
  error?: string
  uncertain?: boolean
}

let cachedToken: { token: string; expiresAt: number } | null = null

export function getDefaultEmailSender() {
  return (process.env.EMAIL_FROM || 'david.perez@internetoperadores.com').trim().toLowerCase()
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) return cachedToken.token

  const tenantId = process.env.AZURE_TENANT_ID || process.env.AZURE_AD_TENANT_ID
  const clientId = process.env.AZURE_CLIENT_ID || process.env.AZURE_AD_CLIENT_ID
  const clientSecret = process.env.AZURE_CLIENT_SECRET || process.env.AZURE_AD_CLIENT_SECRET

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error('Faltan las credenciales de Azure AD necesarias para enviar correo')
  }

  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Error obteniendo token de Azure AD: ${response.status} - ${errorData}`)
  }

  const data: GraphTokenResponse = await response.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

function recipientList(value?: string | string[]) {
  if (!value) return []
  return (Array.isArray(value) ? value : [value]).map((email) => ({
    emailAddress: { address: email.trim().toLowerCase() },
  }))
}

async function sendGraphEmail(options: EmailOptions): Promise<CrmEmailResult> {
  const sender = (options.from || getDefaultEmailSender()).trim().toLowerCase()
  let requestStarted = false

  try {
    const accessToken = await getAccessToken()
    const attachments = await Promise.all(options.attachments?.map(async (attachment) => {
      const content = attachment.content != null
        ? attachment.content
        : attachment.path
          ? await readFile(attachment.path)
          : null
      if (content == null) throw new Error(`El adjunto “${attachment.filename}” no tiene contenido ni ruta de archivo`)
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.filename,
        contentType: attachment.contentType || 'application/octet-stream',
        contentBytes: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content).toString('base64'),
      }
    }) || [])

    const toRecipients = recipientList(options.to)
    const ccRecipients = recipientList(options.cc)
    const bccRecipients = recipientList(options.bcc)
    const replyTo = recipientList(options.replyTo)
    const message: Record<string, unknown> = {
      subject: options.subject,
      body: { contentType: 'HTML', content: options.html },
      from: { emailAddress: { address: sender } },
      toRecipients,
    }
    if (ccRecipients.length) message.ccRecipients = ccRecipients
    if (bccRecipients.length) message.bccRecipients = bccRecipients
    if (replyTo.length) message.replyTo = replyTo
    if (attachments.length) message.attachments = attachments

    requestStarted = true
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
      cache: 'no-store',
    })

    if (response.status === 202 || response.status === 200) {
      return { success: true, sender, status: response.status }
    }

    const errorText = await response.text()
    let errorMessage = `Graph API error ${response.status}`
    try {
      const errorJson = JSON.parse(errorText)
      errorMessage = errorJson.error?.message || errorMessage
    } catch {
      errorMessage = errorText || errorMessage
    }
    console.error('Error Microsoft Graph sendMail:', errorMessage)
    const uncertain = response.status === 408 || response.status >= 500
    return { success: false, sender, status: response.status, error: errorMessage, uncertain }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido enviando correo'
    console.error('Error enviando email:', message)
    return {
      success: false,
      sender,
      status: null,
      error: message,
      uncertain: requestStarted,
    }
  }
}

/** Contrato histórico para los correos transaccionales existentes. */
export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  const result = await sendGraphEmail(options)
  return result.success
    ? { success: true }
    : { success: false, error: `Error email: ${result.error || 'No se pudo enviar el correo'}` }
}

/**
 * Envío CRM con remitente explícito y resultado suficiente para gestionar
 * idempotencia, reintentos seguros y estados inciertos.
 */
export async function sendCrmEmail(options: EmailOptions): Promise<CrmEmailResult> {
  return sendGraphEmail(options)
}
