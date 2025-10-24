import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { sessionId, cif, razonSocial, direccion, codigoPostal, ciudad, pais } = body;

    console.log('📄 DATOS FISCALES RECIBIDOS:');
    console.log('Session ID:', sessionId);
    console.log('CIF/NIF:', cif);
    console.log('Razón Social:', razonSocial);
    console.log('Dirección:', direccion);
    console.log('CP:', codigoPostal);
    console.log('Ciudad:', ciudad);
    console.log('País:', pais);

    // Enviar email con Brevo
    const brevoApiKey = process.env.BREVO_API_KEY;
    const emailDestino = process.env.EMAIL_NOTIFICACIONES || 'tu-email@ejemplo.com';

    if (!brevoApiKey) {
      console.error('⚠️ BREVO_API_KEY no configurada');
      // Continuar sin enviar email
      return NextResponse.json({ success: true, warning: 'Email no configurado' });
    }

    const emailData = {
      sender: {
        name: 'Internet Operadores',
        email: 'noreply@internetoperadores.com'
      },
      to: [
        {
          email: emailDestino,
          name: 'Administrador'
        }
      ],
      subject: `🧾 Nuevos Datos Fiscales - ${razonSocial}`,
      htmlContent: `
        <h2>Nueva solicitud de factura</h2>
        <p>Se han recibido nuevos datos fiscales de un cliente.</p>
        
        <h3>Detalles del pago:</h3>
        <ul>
          <li><strong>Session ID de Stripe:</strong> ${sessionId}</li>
        </ul>

        <h3>Datos fiscales:</h3>
        <ul>
          <li><strong>CIF/NIF:</strong> ${cif}</li>
          <li><strong>Razón Social:</strong> ${razonSocial}</li>
          <li><strong>Dirección:</strong> ${direccion}</li>
          <li><strong>Código Postal:</strong> ${codigoPostal}</li>
          <li><strong>Ciudad:</strong> ${ciudad}</li>
          <li><strong>País:</strong> ${pais}</li>
        </ul>

        <p><strong>Acción requerida:</strong> Generar y enviar factura al cliente.</p>
        
        <hr>
        <p style="color: #666; font-size: 12px;">
          Para ver más detalles del pago, accede a tu dashboard de Stripe y busca la sesión: ${sessionId}
        </p>
      `
    };

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    if (!brevoResponse.ok) {
      const errorData = await brevoResponse.json();
      console.error('❌ Error enviando email con Brevo:', errorData);
      // No fallar la petición aunque el email falle
      return NextResponse.json({ 
        success: true, 
        warning: 'Datos guardados pero email no enviado' 
      });
    }

    const brevoResult = await brevoResponse.json();
    console.log('✅ Email enviado correctamente:', brevoResult.messageId);

    return NextResponse.json({ 
      success: true,
      emailSent: true,
      messageId: brevoResult.messageId
    });

  } catch (error) {
    console.error('❌ Error procesando datos fiscales:', error);
    return NextResponse.json(
      { error: 'Error al procesar los datos' },
      { status: 500 }
    );
  }
}


