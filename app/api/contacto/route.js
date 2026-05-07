export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { nombre, empresa, email, telefono, empleados, servicio, mensaje, origen } = body;

    console.log('📩 NUEVA SOLICITUD DE CONTACTO:');
    console.log('Nombre:', nombre);
    console.log('Empresa:', empresa);
    console.log('Email:', email);
    console.log('Teléfono:', telefono);
    console.log('Empleados:', empleados);
    console.log('Servicio:', servicio);
    console.log('Mensaje:', mensaje);
    console.log('Origen:', origen || 'Formulario de contacto');

    // Validación básica
    if (!nombre || !email || !telefono) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios (nombre, email, teléfono)' },
        { status: 400 }
      );
    }

    const brevoApiKey = process.env.BREVO_API_KEY;
    const emailDestino = 'comercial@internetoperadores.com';

    if (!brevoApiKey) {
      console.error('⚠️ BREVO_API_KEY no configurada');
      return NextResponse.json({ success: true, warning: 'Email no configurado' });
    }

    // Mapeo de servicios para mostrar nombre legible
    const serviciosMap = {
      'conectividad': 'Conectividad avanzada (Fibra, MPLS, SD-WAN)',
      'comunicaciones': 'Comunicaciones unificadas (VoIP, Teams)',
      'infraestructura': 'Infraestructura de red (WiFi, Switching)',
      'mantenimiento': 'Mantenimiento IT',
      'moviles': 'Líneas móviles empresariales',
      'exagrid': 'ExaGrid (Backup y recuperación)',
      'varios': 'Varios servicios / No especificado'
    };

    const servicioNombre = serviciosMap[servicio] || servicio || 'No especificado';
    const origenTexto = origen || 'Formulario de contacto';

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
      subject: `🔔 Nuevo Lead - ${empresa || nombre} - ${servicioNombre}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #F97316; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 22px;">Nueva solicitud de presupuesto</h1>
            <p style="color: #FED7AA; margin: 5px 0 0 0; font-size: 14px;">Origen: ${origenTexto}</p>
          </div>
          
          <div style="background: #fff; padding: 24px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #1F2937; font-size: 18px; margin-top: 0;">Datos del contacto</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280; width: 140px;"><strong>Nombre:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${nombre}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Empresa:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${empresa || 'No indicada'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Email:</strong></td>
                <td style="padding: 10px 0;"><a href="mailto:${email}" style="color: #F97316;">${email}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Teléfono:</strong></td>
                <td style="padding: 10px 0;"><a href="tel:${telefono}" style="color: #F97316;">${telefono}</a></td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Empleados:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${empleados || 'No indicado'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 10px 0; color: #6B7280;"><strong>Servicio:</strong></td>
                <td style="padding: 10px 0; color: #1F2937;">${servicioNombre}</td>
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
                <strong>⚡ Acción requerida:</strong> Contactar al cliente en menos de 24h laborables.
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
        warning: 'Solicitud recibida pero email no enviado' 
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
          EMPLEADOS: empleados || '',
          SERVICIO: servicioNombre,
          ORIGEN: origenTexto
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
    console.error('❌ Error procesando solicitud de contacto:', error);
    return NextResponse.json(
      { error: 'Error al procesar la solicitud' },
      { status: 500 }
    );
  }
}
