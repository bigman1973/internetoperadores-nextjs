import nodemailer from 'nodemailer'

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

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.office365.com'
  const port = parseInt(process.env.SMTP_PORT || '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD

  if (!user || !pass) {
    return null
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false,
    },
  })
}

export async function sendEmail(options: EmailOptions): Promise<{ success: boolean; error?: string }> {
  // Intentar primero con SMTP (Microsoft 365)
  const transporter = getTransporter()

  if (transporter) {
    try {
      const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'info@internetoperadores.com'
      await transporter.sendMail({
        from: `"Internet Operadores" <${fromEmail}>`,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments,
      })
      return { success: true }
    } catch (error: any) {
      console.error('Error SMTP:', error.message)
      return { success: false, error: `Error SMTP: ${error.message}` }
    }
  }

  // Fallback a Resend si está configurado
  const resendApiKey = process.env.RESEND_API_KEY
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Internet Operadores <noreply@internetoperadores.com>',
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Error Resend:', errorData)
        return { success: false, error: `Error Resend: ${JSON.stringify(errorData)}` }
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: `Error Resend: ${error.message}` }
    }
  }

  return { success: false, error: 'No hay servicio de email configurado. Configure SMTP_USER/SMTP_PASSWORD o RESEND_API_KEY en las variables de entorno.' }
}
