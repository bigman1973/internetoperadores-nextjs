export const dynamic = "force-dynamic";
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

    if (!brevoApiKey) {
      console.error('⚠️ BREVO_API_KEY no configurada');
      return NextResponse.json({ success: true, warning: 'Email no configurado' });
    }

    const emailData = {
      sender: {
        name: 'Internet Operadores',
        email: 'noreply@internetoperadores.com'
      },
      to: [
        { email: 'administracion@internetoperadores.com', name: 'Administración' },
        { email: 'comercial@internetoperadores.com', name: 'Comercial' }
      ],
      subject: `🧾 Nuevos Datos Fiscales - ${razonSocial}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1f2937; padding: 20px; text-align: center;">
            <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
            <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Datos fiscales recibidos</p>
          </div>
          <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
            <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Nueva solicitud de factura</h2>
            <p style="color: #4b5563; line-height: 1.6;">Se han recibido nuevos datos fiscales de un cliente tras completar un pago.</p>
            <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #e5e7eb;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #374151; font-weight: bold;">CIF/NIF:</td><td style="color: #1f2937;">${cif}</td></tr>
                <tr><td style="padding: 8px 0; color: #374151; font-weight: bold;">Razón Social:</td><td style="color: #1f2937;">${razonSocial}</td></tr>
                <tr><td style="padding: 8px 0; color: #374151; font-weight: bold;">Dirección:</td><td style="color: #1f2937;">${direccion}</td></tr>
                <tr><td style="padding: 8px 0; color: #374151; font-weight: bold;">Código Postal:</td><td style="color: #1f2937;">${codigoPostal}</td></tr>
                <tr><td style="padding: 8px 0; color: #374151; font-weight: bold;">Ciudad:</td><td style="color: #1f2937;">${ciudad}</td></tr>
                <tr><td style="padding: 8px 0; color: #374151; font-weight: bold;">País:</td><td style="color: #1f2937;">${pais}</td></tr>
              </table>
            </div>
            <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin: 16px 0; border: 1px solid #fcd34d;">
              <p style="margin: 0; color: #92400e; font-size: 14px;"><strong>⚠️ Acción requerida:</strong> Generar y enviar factura al cliente.</p>
            </div>
            <p style="color: #6b7280; font-size: 13px;">Referencia de pago (Session ID): ${sessionId}</p>
          </div>
          <div style="background: #f9fafb; padding: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #9ca3af; font-size: 12px;">Internet Operadores © 2026</p>
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
