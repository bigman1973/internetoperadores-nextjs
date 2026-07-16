import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, nombreArchivo } = body;

    if (!texto || texto.trim().length < 50) {
      return NextResponse.json({ 
        error: 'No se pudo extraer texto del PDF. Puede ser un escaneo/imagen sin texto seleccionable.'
      }, { status: 400 });
    }

    const textoLimitado = texto.substring(0, 80000);

    const systemPrompt = `Eres un asistente experto en análisis de contratos de telecomunicaciones con proveedores/operadores mayoristas. Analiza el texto del contrato proporcionado y extrae los datos estructurados. Este es un contrato que Internet Operadores firma CON UN PROVEEDOR (operador mayorista como Telefónica, Adamo, Lyntia, Avatel, etc.) para poder dar servicio a su cliente final. 

REGLAS DE EXTRACCIÓN ESPECÍFICAS:
1. "proveedor": Busca el nombre de la empresa que emite la oferta (ej. "Telefónica Empresas", "Adamo", etc.).
2. "titulo": Crea un título descriptivo basado en el objeto del contrato (ej. "Acceso a Internet Internacional").
3. "fechaFirma": Busca la fecha de la oferta o firma (suele estar en la portada o al final).
4. "permanenciaMeses": Busca "Periodo de contratación", "permanencia" o "duración" (ej. "36 meses" -> 36).
5. "servicios": Busca tablas de "Valoración económica", "Desglose económico" o "Características de las conexiones". Extrae cada sede/ubicación, el servicio (ej. "Ethernet 100Mb"), la velocidad y el precio mensual ("Mes" o "Cuota mensual").
6. "importeMensual": Suma el total de las cuotas mensuales de todos los servicios.
7. "notas": Resume brevemente el objeto del contrato y las sedes involucradas.
8. "condicionesEspeciales": Extrae condiciones de facturación, penalizaciones, o plazos de provisión.

Responde SOLO con un JSON válido (sin markdown, sin backticks) con la siguiente estructura:
{
  "proveedor": "Nombre del proveedor/operador mayorista",
  "cifProveedor": "CIF/NIF del proveedor o null",
  "titulo": "Título descriptivo del contrato",
  "tipo": "Servicios Internet|Mantenimiento|Guardias|Consultoría|Otro",
  "fechaFirma": "YYYY-MM-DD o null",
  "fechaInicio": "YYYY-MM-DD o null (fecha inicio contractual)",
  "fechaFin": "YYYY-MM-DD o null",
  "fechaInicioServicio": "YYYY-MM-DD o null (fecha real en que se activó el servicio)",
  "permanenciaMeses": número o null,
  "prorrogaAutomatica": true/false,
  "plazoProrroga": "descripción del plazo de prórroga o null",
  "importeMensual": número decimal o null,
  "importeAnual": número decimal o null,
  "formaPago": "confirming|transferencia|domiciliacion|otro",
  "contactoProveedor": "Nombre - email - teléfono del contacto del proveedor",
  "notas": "Resumen breve de las condiciones principales",
  "condicionesEspeciales": "Penalizaciones, exclusiones, cláusulas especiales relevantes",
  "servicios": [
    {
      "ubicacion": "Ciudad/Planta/Sede",
      "servicio": "Descripción del servicio",
      "velocidad": "Velocidad contratada",
      "precioMensual": número,
      "fechaInicioServicio": "YYYY-MM-DD o null"
    }
  ]
}

Si no puedes determinar un campo, usa null. Para importeMensual, suma todos los servicios mensuales. Para importeAnual, multiplica por 12.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analiza este contrato de proveedor y extrae todos los datos estructurados:\n\n${textoLimitado}` },
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
        proveedor: datos.proveedor || '',
        cifProveedor: datos.cifProveedor || null,
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
        importeAnual: datos.importeAnual || null,
        formaPago: datos.formaPago || null,
        contactoProveedor: datos.contactoProveedor || null,
        notas: datos.notas || null,
        condicionesEspeciales: datos.condicionesEspeciales || null,
        serviciosJson: datos.servicios?.map((s: any) => ({
          ubicacion: s.ubicacion || '',
          servicio: s.servicio || '',
          velocidad: s.velocidad || '',
          precioMensual: s.precioMensual || 0,
          fechaInicioServicio: s.fechaInicioServicio || null,
        })) || null,
      },
      documentoNombre: nombreArchivo || 'contrato.pdf',
    });
  } catch (error: any) {
    console.error('Error analizando contrato proveedor:', error?.message || error);
    
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
