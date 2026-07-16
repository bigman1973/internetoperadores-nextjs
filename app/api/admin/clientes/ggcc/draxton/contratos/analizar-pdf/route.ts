import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

// Máximo 4.5MB para enviar a GPT (Vercel tiene límite de body 4.5MB en serverless)
const MAX_FILE_SIZE = 4.5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado un archivo' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Verificar tamaño
    if (arrayBuffer.byteLength > MAX_FILE_SIZE) {
      return NextResponse.json({ 
        error: `El archivo es demasiado grande (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB). Máximo 4.5MB. Intenta con un PDF más ligero o las primeras páginas del contrato.`
      }, { status: 400 });
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');

    const systemPrompt = `Eres un asistente experto en análisis de contratos de telecomunicaciones. Analiza el documento PDF proporcionado y extrae los datos estructurados del contrato. Responde SOLO con un JSON válido (sin markdown, sin backticks) con la siguiente estructura:
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

Si no puedes determinar un campo, usa null. Para importeMensual, suma todos los servicios mensuales. Para importeAnual, multiplica por 12.`;

    const userContent: any[] = [
      {
        type: 'file',
        file: {
          filename: file.name || 'contrato.pdf',
          file_data: `data:application/pdf;base64,${base64}`,
        },
      },
      {
        type: 'text',
        text: 'Analiza este contrato y extrae todos los datos estructurados según el formato JSON indicado.',
      },
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    
    if (!content) {
      return NextResponse.json({ 
        error: 'GPT no devolvió respuesta. Intenta con un PDF más pequeño.'
      }, { status: 500 });
    }

    // Intentar parsear el JSON de la respuesta
    let datos;
    try {
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      datos = JSON.parse(cleanContent);
    } catch {
      return NextResponse.json({ 
        error: 'No se pudo parsear la respuesta de GPT. Respuesta: ' + content.substring(0, 200)
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
    console.error('Error analizando PDF:', error?.message || error);
    
    // Mensajes de error más descriptivos
    let errorMsg = 'Error desconocido';
    if (error?.message?.includes('timeout') || error?.message?.includes('TIMEOUT')) {
      errorMsg = 'Timeout: el PDF es demasiado grande para procesarse. Intenta con menos páginas.';
    } else if (error?.message?.includes('401') || error?.message?.includes('Unauthorized')) {
      errorMsg = 'Error de autenticación con OpenAI. Verifica la API key.';
    } else if (error?.message?.includes('429')) {
      errorMsg = 'Límite de rate de OpenAI alcanzado. Espera un momento e intenta de nuevo.';
    } else if (error?.message?.includes('413') || error?.message?.includes('too large')) {
      errorMsg = 'El archivo es demasiado grande para la API. Intenta con un PDF más pequeño.';
    } else if (error?.message) {
      errorMsg = error.message;
    }

    return NextResponse.json({ 
      error: 'Error al analizar el PDF: ' + errorMsg
    }, { status: 500 });
  }
}

// Aumentar el límite de body para esta ruta
export const config = {
  api: {
    bodyParser: false,
  },
};
