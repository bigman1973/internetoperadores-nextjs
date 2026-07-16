import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado un archivo' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extraer texto del PDF usando pdf-parse
    let textoExtraido = '';
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const pdfData = await pdfParse(buffer);
      textoExtraido = pdfData.text;
    } catch (pdfErr: any) {
      return NextResponse.json({ 
        error: 'No se pudo leer el PDF. Asegúrate de que no está protegido con contraseña. ' + (pdfErr.message || '')
      }, { status: 400 });
    }

    if (!textoExtraido || textoExtraido.trim().length < 50) {
      return NextResponse.json({ 
        error: 'El PDF no contiene texto extraíble (puede ser un escaneo/imagen). Intenta con un PDF con texto seleccionable.'
      }, { status: 400 });
    }

    // Limitar texto a ~80.000 caracteres (~20k tokens) para no exceder el contexto
    const textoLimitado = textoExtraido.substring(0, 80000);

    const systemPrompt = `Eres un asistente experto en análisis de contratos de telecomunicaciones. Analiza el texto del contrato proporcionado y extrae los datos estructurados. Responde SOLO con un JSON válido (sin markdown, sin backticks) con la siguiente estructura:
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

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analiza este contrato y extrae todos los datos estructurados:\n\n${textoLimitado}` },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const content = response.choices[0]?.message?.content || '';
    
    if (!content) {
      return NextResponse.json({ 
        error: 'GPT no devolvió respuesta. Intenta de nuevo.'
      }, { status: 500 });
    }

    // Intentar parsear el JSON de la respuesta
    let datos;
    try {
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      datos = JSON.parse(cleanContent);
    } catch {
      return NextResponse.json({ 
        error: 'No se pudo parsear la respuesta de GPT. Respuesta parcial: ' + content.substring(0, 200)
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
    
    let errorMsg = 'Error desconocido';
    if (error?.message?.includes('timeout') || error?.message?.includes('TIMEOUT') || error?.message?.includes('FUNCTION_INVOCATION_TIMEOUT')) {
      errorMsg = 'Timeout del servidor. El PDF es muy complejo. Intenta de nuevo.';
    } else if (error?.message?.includes('401') || error?.message?.includes('Unauthorized')) {
      errorMsg = 'Error de autenticación con OpenAI. Contacta al administrador.';
    } else if (error?.message?.includes('429')) {
      errorMsg = 'Límite de rate de OpenAI alcanzado. Espera un momento e intenta de nuevo.';
    } else if (error?.message) {
      errorMsg = error.message;
    }

    return NextResponse.json({ 
      error: 'Error al analizar el PDF: ' + errorMsg
    }, { status: 500 });
  }
}

// Configurar el runtime para permitir más tiempo de ejecución
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 segundos máximo
