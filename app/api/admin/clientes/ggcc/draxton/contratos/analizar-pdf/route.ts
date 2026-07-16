import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado un archivo' }, { status: 400 });
    }

    // Convertir PDF a base64 para enviar a GPT-4o (vision)
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = file.type || 'application/pdf';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Eres un asistente experto en análisis de contratos. Analiza el documento PDF proporcionado y extrae los datos estructurados del contrato. Responde SOLO con un JSON válido (sin markdown, sin backticks) con la siguiente estructura:
{
  "titulo": "Título descriptivo del contrato",
  "tipo": "Servicios Internet|Mantenimiento|Guardias|Consultoría|Otro",
  "fechaFirma": "YYYY-MM-DD o null",
  "fechaInicio": "YYYY-MM-DD o null",
  "fechaFin": "YYYY-MM-DD o null",
  "permanenciaMeses": número o null,
  "prorrogaAutomatica": true/false,
  "plazoProrroga": "descripción del plazo de prórroga o null",
  "importeMensual": número decimal o null,
  "importeAnual": número decimal o null,
  "formaPago": "confirming|transferencia|domiciliacion|otro",
  "contactoCliente": "Nombre - email - teléfono del contacto del cliente",
  "contactoProveedor": "Nombre - email - teléfono del contacto del proveedor",
  "notas": "Resumen breve de las condiciones principales",
  "condicionesEspeciales": "Penalizaciones, exclusiones, cláusulas especiales relevantes",
  "servicios": [
    {
      "ubicacion": "Ciudad/Planta",
      "servicio": "Descripción del servicio",
      "velocidad": "Velocidad contratada",
      "precioMensual": número
    }
  ]
}

Si no puedes determinar un campo, usa null. Para importeMensual, suma todos los servicios mensuales. Para importeAnual, multiplica por 12.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                filename: file.name,
                file_data: `data:${mimeType};base64,${base64}`,
              },
            } as any,
            {
              type: 'text',
              text: 'Analiza este contrato y extrae todos los datos estructurados según el formato indicado.',
            },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Intentar parsear el JSON de la respuesta
    let datos;
    try {
      // Limpiar posibles backticks o markdown
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      datos = JSON.parse(cleanContent);
    } catch {
      return NextResponse.json({ 
        error: 'No se pudo parsear la respuesta de GPT',
        raw: content 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      datos: {
        titulo: datos.titulo || file.name.replace('.pdf', ''),
        tipo: datos.tipo || 'Servicios Internet',
        fechaFirma: datos.fechaFirma || null,
        fechaInicio: datos.fechaInicio || datos.fechaFirma || null,
        fechaFin: datos.fechaFin || null,
        permanenciaMeses: datos.permanenciaMeses || null,
        prorrogaAutomatica: datos.prorrogaAutomatica ?? true,
        plazoProrroga: datos.plazoProrroga || null,
        importeMensual: datos.importeMensual || null,
        importeAnual: datos.importeAnual || null,
        formaPago: datos.formaPago || null,
        contactoCliente: datos.contactoCliente || null,
        contactoProveedor: datos.contactoProveedor || null,
        notas: datos.notas || null,
        condicionesEspeciales: datos.condicionesEspeciales || null,
        serviciosJson: datos.servicios || null,
      },
      documentoNombre: file.name,
    });
  } catch (error: any) {
    console.error('Error analizando PDF:', error);
    return NextResponse.json({ 
      error: 'Error al analizar el PDF: ' + (error.message || 'Error desconocido')
    }, { status: 500 });
  }
}
