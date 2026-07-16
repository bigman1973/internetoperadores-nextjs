import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 120;

const systemPrompt = `Eres un asistente experto en análisis de contratos de telecomunicaciones. Analiza el contrato proporcionado y extrae los datos estructurados. Este es un contrato que Internet Operadores firma CON UN CLIENTE (como Draxton, una empresa industrial) para prestarle servicios de telecomunicaciones.

REGLAS DE EXTRACCIÓN:
1. "titulo": Título descriptivo del contrato basado en su objeto.
2. "fechaFirma": Fecha de firma o de la oferta. Formato YYYY-MM-DD.
3. "permanenciaMeses": Busca "permanencia", "duración", "periodo de contratación".
4. "servicios": Busca tablas de servicios/sedes con ubicación, tipo de servicio, velocidad y precio mensual.
5. "importeMensual": Suma total de cuotas mensuales.
6. "importeAnual": importeMensual × 12.
7. "fechaInicioServicio": Fecha REAL en que se activó el servicio (puede diferir de la contractual).

Responde SOLO con un JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "titulo": "Título descriptivo del contrato",
  "tipo": "Servicios Internet|Mantenimiento|Guardias|Consultoría|Otro",
  "fechaFirma": "YYYY-MM-DD o null",
  "fechaInicio": "YYYY-MM-DD o null (fecha inicio contractual)",
  "fechaFin": "YYYY-MM-DD o null",
  "fechaInicioServicio": "YYYY-MM-DD o null",
  "permanenciaMeses": número o null,
  "prorrogaAutomatica": true/false,
  "plazoProrroga": "descripción del plazo de prórroga o null",
  "importeMensual": número decimal o null,
  "importeAnual": número decimal o null,
  "formaPago": "confirming|transferencia|domiciliacion|otro",
  "contactoCliente": "Nombre - email - teléfono del contacto del cliente",
  "contactoProveedor": "Nombre - email - teléfono del contacto del proveedor (nosotros)",
  "notas": "Resumen breve de las condiciones principales",
  "condicionesEspeciales": "Penalizaciones, exclusiones, cláusulas especiales relevantes",
  "servicios": [
    {
      "ubicacion": "Ciudad/Planta/Sede",
      "servicio": "Descripción del servicio",
      "velocidad": "Velocidad contratada",
      "importeAlta": número (coste de alta/instalación, 0 si no aplica),
      "precioMensual": número,
      "fechaInicioServicio": "YYYY-MM-DD o null"
    }
  ]
}

Si no puedes determinar un campo, usa null. NUNCA inventes datos.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, imagenes, nombreArchivo } = body;

    // Si tenemos imágenes, usar Vision
    if (imagenes && Array.isArray(imagenes) && imagenes.length > 0) {
      // Máximo 6 imágenes para evitar rechazo
      const imagenesLimitadas = imagenes.slice(0, 6);
      const imageContents: any[] = imagenesLimitadas.map((img: string) => ({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${img}`,
          detail: 'auto',
        },
      }));

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [
            { type: 'text', text: systemPrompt + '\n\nAnaliza este contrato de cliente de telecomunicaciones y extrae todos los datos estructurados. Presta especial atención a las tablas de servicios y precios.' + (texto && texto.trim().length > 50 ? '\n\nTexto extraído del PDF (puede estar incompleto):\n' + texto.substring(0, 15000) : '') },
            ...imageContents,
          ] },
        ],
        max_tokens: 4000,
        temperature: 0,
      });

      const content = response.choices[0]?.message?.content || '';
      
      if (!content) {
        return NextResponse.json({ error: 'GPT no devolvió respuesta.' }, { status: 500 });
      }

      let datos;
      try {
        const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        datos = JSON.parse(cleanContent);
      } catch {
        return NextResponse.json({ 
          error: 'No se pudo parsear la respuesta de GPT. Respuesta: ' + content.substring(0, 300)
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        datos: mapearDatos(datos, nombreArchivo),
        documentoNombre: nombreArchivo || 'contrato.pdf',
      });
    }

    // Fallback: solo texto
    if (!texto || texto.trim().length < 50) {
      return NextResponse.json({ 
        error: 'No se pudo extraer texto ni imágenes del PDF.'
      }, { status: 400 });
    }

    const textoLimitado = texto.substring(0, 80000);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: systemPrompt + '\n\nAnaliza este contrato y extrae todos los datos estructurados:\n\n' + textoLimitado },
      ],
      max_tokens: 4000,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content || '';
    
    if (!content) {
      return NextResponse.json({ error: 'GPT no devolvió respuesta.' }, { status: 500 });
    }

    let datos;
    try {
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      datos = JSON.parse(cleanContent);
    } catch {
      return NextResponse.json({ 
        error: 'No se pudo parsear la respuesta. Respuesta: ' + content.substring(0, 200)
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      datos: mapearDatos(datos, nombreArchivo),
      documentoNombre: nombreArchivo || 'contrato.pdf',
    });
  } catch (error: any) {
    console.error('Error analizando contrato:', error?.message || error);
    
    let errorMsg = 'Error desconocido';
    if (error?.message?.includes('timeout') || error?.message?.includes('TIMEOUT')) {
      errorMsg = 'Timeout del servidor. El contrato es muy largo. Intenta de nuevo.';
    } else if (error?.message?.includes('401') || error?.message?.includes('Unauthorized')) {
      errorMsg = 'Error de autenticación con OpenAI. Contacta al administrador.';
    } else if (error?.message?.includes('429')) {
      errorMsg = 'Límite de rate alcanzado. Espera un momento e intenta de nuevo.';
    } else if (error?.message) {
      errorMsg = error.message;
    }

    return NextResponse.json({ 
      error: 'Error al analizar: ' + errorMsg
    }, { status: 500 });
  }
}

function mapearDatos(datos: any, nombreArchivo?: string) {
  return {
    titulo: datos.titulo || (nombreArchivo || '').replace('.pdf', ''),
    tipo: datos.tipo || 'Servicios Internet',
    fechaFirma: datos.fechaFirma || null,
    fechaInicio: datos.fechaInicio || datos.fechaFirma || null,
    fechaFin: datos.fechaFin || null,
    fechaInicioServicio: datos.fechaInicioServicio || null,
    permanenciaMeses: datos.permanenciaMeses || null,
    prorrogaAutomatica: datos.prorrogaAutomatica ?? true,
    plazoProrroga: datos.plazoProrroga || null,
    importeMensual: datos.importeMensual || null,
    importeAnual: datos.importeAnual || (datos.importeMensual ? datos.importeMensual * 12 : null),
    formaPago: datos.formaPago || null,
    contactoCliente: datos.contactoCliente || null,
    contactoProveedor: datos.contactoProveedor || null,
    notas: datos.notas || null,
    condicionesEspeciales: datos.condicionesEspeciales || null,
    serviciosJson: datos.servicios?.map((s: any) => ({
      ubicacion: s.ubicacion || '',
      servicio: s.servicio || '',
      velocidad: s.velocidad || '',
      importeAlta: s.importeAlta || 0,
      precioMensual: s.precioMensual || 0,
      fechaInicioServicio: s.fechaInicioServicio || null,
    })) || null,
  };
}
