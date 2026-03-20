export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { nombre, email, empresa, telefono, cargo, guia } = body;

    console.log('📚 NUEVA DESCARGA DE GUÍA:');
    console.log('Nombre:', nombre);
    console.log('Email:', email);
    console.log('Empresa:', empresa);
    console.log('Teléfono:', telefono);
    console.log('Cargo:', cargo);
    console.log('Guía:', guia);

    // Validación básica
    if (!nombre || !email) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (nombre, email)' },
        { status: 400 }
      );
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const emailDestino = 'comercial@internetoperadores.com';

    if (!brevoApiKey) {
      console.error('⚠️ BREVO_API_KEY no configurada');
      return NextResponse.json({ success: true, warning: 'Email no configurado' });
    }

    const guiaNombre = guia || 'Guía no especificada';

    // 1. Enviar email de notificación al equipo comercial
    const emailNotificacion = {
      sender: {
        name: 'Internet Operadores Web',
        email: 'noreply@internetoperadores.com'
      },
      to: [
        {
          email: emailDestino,
          name: 'Equipo Comercial'
        }
      ],
      subject: `📚 Descarga de Guía - ${nombre} (${empresa || 'Particular'})`,
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
              ${empresa ? `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Empresa:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${empresa}</td>
              </tr>` : ''}
              ${telefono ? `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Teléfono:</strong></td>
                <td style="padding: 10px 0;"><a href="tel:${telefono}" style="color: #F97316;">${telefono}</a></td>
              </tr>` : ''}
              ${cargo ? `
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Cargo:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${cargo}</td>
              </tr>` : ''}
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Guía descargada:</strong></td>
                <td style="padding: 10px 0; color: #1F2937; font-weight: bold;">${guiaNombre}</td>
              </tr>
            </table>

            <div style="margin-top: 24px; padding: 16px; background: #FFF7ED; border-radius: 8px;">
              <p style="margin: 0; color: #9A3412; font-size: 14px;">
                <strong>💡 Sugerencia:</strong> Este lead ha mostrado interés en ${guiaNombre}. Contactar en 24-48h para ofrecer asesoramiento personalizado.
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

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailNotificacion)
    });

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.json();
      console.error('❌ Error enviando email con Brevo:', errorData);
      return NextResponse.json({ 
        success: true, 
        warning: 'Descarga registrada pero email no enviado' 
      });
    }

    const brevoResult = await brevoResponse.json();
    console.log('✅ Email de notificación enviado:', brevoResult.messageId);

    // 2. Crear/actualizar contacto en Brevo
    try {
      const contactData = {
        email: email,
        attributes: {
          NOMBRE: nombre,
          EMPRESA: empresa || '',
          TELEFONO: telefono || '',
          CARGO: cargo || '',
          ORIGEN: `Descarga: ${guiaNombre}`
        },
        updateEnabled: true
      };

      const contactResponse = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(contactData)
      });

      if (contactResponse.ok) {
        console.log('✅ Contacto creado/actualizado en Brevo');
      } else {
        const contactError = await contactResponse.json();
        console.log('⚠️ Contacto ya existe o error:', contactError.message);
      }
    } catch (contactErr) {
      console.error('⚠️ Error creando contacto en Brevo:', contactErr);
    }

    return NextResponse.json({ 
      success: true,
      emailSent: true,
      messageId: brevoResult.messageId
    });

  } catch (error) {
    console.error('❌ Error procesando descarga de guía:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}
