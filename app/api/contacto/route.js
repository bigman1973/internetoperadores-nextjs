export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { guardarCaptacionWeb } from '@/lib/crm-captacion-web';

// Emails de destino según motivo
const EMAILS_DESTINO = {
  comercial: 'comercial@internetoperadores.com',
  administracion: 'administracion@internetoperadores.com',
  tecnico: 'sat@internetoperadores.com',
  direccion: 'direccion@internetoperadores.com',
};

// Nombres legibles de motivos
const MOTIVOS_MAP = {
  comercial: 'Comercial — Información o presupuesto',
  administracion: 'Administración — Facturación o contratos',
  tecnico: 'Técnico — Soporte o incidencia',
  direccion: 'Dirección — Sugerencias o reclamaciones',
};

// IDs de listas de Brevo para newsletter
const BREVO_LISTA_EMPRESAS = 30;
const BREVO_LISTA_PARTICULARES = 31;

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'El formulario debe ser un objeto válido' }, { status: 400 });
    }
    const { tipoUsuario, nombre, empresa, email, telefono, motivo, mensaje, origen } = body;

    if (![tipoUsuario, nombre, empresa, email, telefono, motivo, mensaje, origen].every(value => value == null || typeof value === 'string')) {
      return NextResponse.json({ error: 'Los campos del formulario deben ser texto' }, { status: 400 });
    }

    // Validación básica
    if (!nombre?.trim() || !email?.trim() || !telefono?.trim() || !motivo?.trim()) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (nombre, email, teléfono, motivo)' },
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
      formulario: '/api/contacto',
      segmentoCrm: tipoUsuario === 'particular' ? 'PARTICULAR' : 'EMPRESA',
      nombre, email, telefono, empresa,
      datos: {
        tipoUsuario: tipoUsuario || 'empresa', nombre, email, telefono,
        empresa: empresa || null, motivo, mensaje: mensaje || null,
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
      return NextResponse.json({ ...resultadoLocal, emailSent: false, departamento: motivo });
    }

    let emailSent = false;
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
    const emailDestino = EMAILS_DESTINO[motivo] || 'comercial@internetoperadores.com';
    const motivoNombre = MOTIVOS_MAP[motivo] || motivo;
    const origenTexto = origen || 'Formulario de contacto';
    const tipoTexto = tipoUsuario === 'particular' ? 'Particular' : 'Empresa';

    // 1. Enviar email de notificación al departamento correspondiente
    if (brevoApiKey) {
      const emailNotificacion = {
        sender: {
          name: 'Internet Operadores Web',
          email: 'noreply@internetoperadores.com'
        },
        to: [
          {
            email: emailDestino,
            name: motivoNombre.split(' — ')[0]
          }
        ],
        subject: `🔔 Nuevo contacto (${tipoTexto}) - ${motivoNombre.split(' — ')[0]} - ${empresa || nombre}`,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #F97316; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 22px;">Nueva consulta de contacto</h1>
              <p style="color: #FED7AA; margin: 5px 0 0 0; font-size: 14px;">Departamento: ${motivoNombre} | Tipo: ${tipoTexto}</p>
            </div>
            
            <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
              <h2 style="color: #1F2937; font-size: 18px; margin-top: 0;">Datos del contacto</h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280; width: 140px;"><strong>Tipo:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${tipoTexto}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Nombre:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${nombre}</td>
                </tr>
                ${empresa ? `<tr style="border-bottom: 1px solid #f3f4f6;">
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Empresa:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${empresa}</td>
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
                  <td style="padding: 10px 0; color: #6B7280;"><strong>Motivo:</strong></td>
                  <td style="padding: 10px 0; color: #1F2937;">${motivoNombre}</td>
                </tr>
              </table>

              ${mensaje ? `
              <h2 style="color: #1F2937; font-size: 18px; margin-top: 20px;">Mensaje</h2>
              <div style="background: #F9FAFB; padding: 16px; border-radius: 8px; border-left: 4px solid #F97316;">
                <p style="color: #374151; margin: 0; white-space: pre-wrap;">${mensaje}</p>
              </div>
              ` : ''}

              <div style="margin-top: 24px; padding: 16px; background: #FFF7ED; border-radius: 8px;">
                <p style="margin: 0; color: #9A3412; font-size: 14px;">
                  <strong>⚡ Acción requerida:</strong> Contactar al cliente lo antes posible.
                </p>
              </div>
            </div>

            <div style="background: #F9FAFB; padding: 16px; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
              <p style="color: #9CA3AF; font-size: 12px; margin: 0; text-align: center;">
                Este email ha sido generado automáticamente desde internetoperadores.com
              </p>
            </div>
          </div>
        `
      };

      try {
        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(emailNotificacion)
        });

        if (brevoResponse.ok) {
          emailSent = true;
        } else {
          console.error('[contacto] No se pudo completar la operación');
        }
      } catch {
        console.error('[contacto] No se pudo completar la operación');
      }
    }

    // 2. Crear/actualizar contacto en Brevo solo con opt-in explícito
    if (newsletterOptIn && brevoApiKey) {
      try {
        const contactData = {
          email: email,
          attributes: {
            NOMBRE: nombre,
            EMPRESA: empresa || '',
            TELEFONO: telefono || '',
            ORIGEN: origenTexto
          },
          updateEnabled: true
        };

        // Si se suscribe al newsletter, añadir a la lista correspondiente
        if (newsletterOptIn) {
          const listId = tipoUsuario === 'particular' ? BREVO_LISTA_PARTICULARES : BREVO_LISTA_EMPRESAS;
          contactData.listIds = [listId];
        }

        const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json'
          },
          body: JSON.stringify(contactData)
        });

        if (!contactResponse.ok) {
          const contactError = await contactResponse.json();
          
          // Si ya existe y quiere newsletter, añadir a la lista
          if (contactError.code === 'duplicate_parameter') {
            const listId = tipoUsuario === 'particular' ? BREVO_LISTA_PARTICULARES : BREVO_LISTA_EMPRESAS;
            await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/add`, {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'api-key': brevoApiKey,
                'content-type': 'application/json'
              },
              body: JSON.stringify({ emails: [email] })
            });
          }
        }
      } catch {
        console.error('[contacto] No se pudo completar la operación');
      }
    }

    return NextResponse.json({ 
      ...resultadoLocal,
      emailSent,
      departamento: motivo
    });

  } catch {
    console.error('[contacto] No se pudo completar la operación');
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}
