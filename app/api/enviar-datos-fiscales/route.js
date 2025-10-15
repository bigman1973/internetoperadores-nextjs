import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      sessionId,
      nifCif,
      nombreFiscal,
      direccion,
      codigoPostal,
      ciudad,
      pais
    } = body;

    // Validar datos requeridos
    if (!nifCif || !nombreFiscal || !direccion) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      );
    }

    // Construir mensaje para WhatsApp
    const whatsappMessage = `🧾 *DATOS FISCALES RECIBIDOS*

📋 Session ID: ${sessionId || 'No disponible'}

*Datos Fiscales:*
• NIF/CIF: ${nifCif}
• Nombre Fiscal: ${nombreFiscal}
• Dirección: ${direccion}
• CP: ${codigoPostal || 'No proporcionado'}
• Ciudad: ${ciudad || 'No proporcionado'}
• País: ${pais || 'España'}

Por favor, proceder con la emisión de factura.`;

    const encodedMessage = encodeURIComponent(whatsappMessage);
    const whatsappUrl = `https://wa.me/34655100400?text=${encodedMessage}`;

    // En producción, aquí enviarías un email usando un servicio como Resend, SendGrid, etc.
    // Por ahora, solo devolvemos el enlace de WhatsApp
    
    console.log('Datos fiscales recibidos:', {
      sessionId,
      nifCif,
      nombreFiscal,
      direccion,
      codigoPostal,
      ciudad,
      pais
    });

    return NextResponse.json({ 
      success: true,
      whatsappUrl,
      message: 'Datos fiscales recibidos correctamente'
    });

  } catch (error) {
    console.error('Error procesando datos fiscales:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

