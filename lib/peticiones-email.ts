import { sendEmail } from '@/lib/email'

interface PeticionValidacionEmail {
  to: string
  usuarioNombre: string
  peticionId: number
  titulo: string
  entrega: string
  baseUrl?: string
}

type EmailSender = typeof sendEmail

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function construirEmailValidacionPeticion(input: PeticionValidacionEmail) {
  const baseUrl = (input.baseUrl || process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com').replace(/\/$/, '')
  const enlace = `${baseUrl}/peticiones`
  const nombre = escapeHtml(input.usuarioNombre || input.to)
  const titulo = escapeHtml(input.titulo)
  const entrega = escapeHtml(input.entrega).replaceAll('\n', '<br>')

  return {
    to: input.to,
    subject: `Petición #${input.peticionId} pendiente de tu validación`,
    html: `
      <div style="margin:0;background:#f6f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#172033">
        <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
          <div style="background:#21194f;padding:24px 28px;color:#ffffff">
            <p style="margin:0 0 6px;font-size:13px;opacity:.85">Internet Operadores</p>
            <h1 style="margin:0;font-size:22px;line-height:1.3">Tenemos una entrega para que la revises</h1>
          </div>
          <div style="padding:28px">
            <p style="margin:0 0 16px">Hola, <strong>${nombre}</strong>:</p>
            <p style="margin:0 0 18px;line-height:1.6">La petición <strong>#${input.peticionId} — ${titulo}</strong> ha pasado a <strong>pendiente de validación</strong>.</p>
            <div style="margin:0 0 22px;padding:16px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;line-height:1.6">
              <strong>Trabajo realizado</strong><br>${entrega}
            </div>
            <p style="margin:0 0 22px;line-height:1.6">Entra en el portal para confirmar si cumple tus requisitos, pedir ajustes o comentar cualquier detalle con el equipo.</p>
            <a href="${enlace}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:10px">Revisar mi petición</a>
            <p style="margin:24px 0 0;font-size:12px;color:#6b7280;line-height:1.5">La petición solo se cerrará cuando confirmes que estás satisfecho con el resultado.</p>
          </div>
        </div>
      </div>
    `,
  }
}

export async function notificarPeticionPendienteValidacion(
  input: PeticionValidacionEmail,
  sender: EmailSender = sendEmail,
) {
  const email = construirEmailValidacionPeticion(input)
  return sender(email)
}
