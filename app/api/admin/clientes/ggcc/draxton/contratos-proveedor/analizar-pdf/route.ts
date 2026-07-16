import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 120;

const systemPrompt = `Eres un asistente experto en análisis de contratos de telecomunicaciones con proveedores/operadores mayoristas. Analiza las imágenes del contrato proporcionado y extrae los datos estructurados. Este es un contrato que Internet Operadores firma CON UN PROVEEDOR (operador mayorista como Telefónica, Adamo, Lyntia, Avatel, Vodafone, etc.) para poder dar servicio a su cliente final.

REGLAS DE EXTRACCIÓN ESPECÍFICAS:
1. "proveedor": Busca el nombre de la empresa que emite la oferta/contrato (ej. "Telefónica Empresas", "Adamo Business", etc.). Suele estar en la portada o cabecera.
2. "cifProveedor": Busca el CIF/NIF real del proveedor en el documento (formato español: letra + 8 dígitos, ej. B82387770). SOLO pon el CIF si lo ves LITERALMENTE escrito en el documento. Si no aparece explícitamente, SIEMPRE pon null. NUNCA inventes un CIF como B12345678 o similar.
3. "titulo": Crea un título descriptivo basado en el OBJETO del contrato (ej. "Acceso a Internet Internacional - 3 sedes Europa"). No uses el nombre del archivo.
4. "fechaFirma": Busca la fecha de la oferta (portada) o la fecha de firma (última página). Formato YYYY-MM-DD.
5. "permanenciaMeses": Busca "Periodo de contratación", "permanencia", "duración del contrato" o similar. Extrae el número de meses (ej. "36 meses" -> 36).
6. "servicios": MUY IMPORTANTE - Busca tablas de "Valoración económica", "Desglose económico", "Resumen de servicios" o similar. Para CADA línea/sede extrae:
   - ubicacion: País, ciudad o sede
   - servicio: Tipo de servicio (ej. "Ethernet 100Mb con C1111-4P Security")
   - velocidad: Ancho de banda (ej. "100M", "1 Gbps")
   - precioMensual: Cuota MENSUAL en euros (columna "Mes", "€/mes", "Cuota mensual"). NO confundir con alta.
7. "importeMensual": Suma el TOTAL de cuotas mensuales de todos los servicios. Busca la fila "TOTAL" en la tabla económica.
8. "importeAnual": importeMensual × 12.
9. "notas": Resume brevemente: qué servicio se contrata, para qué sedes, y condiciones relevantes.
10. "condicionesEspeciales": Penalizaciones por baja anticipada, condiciones de facturación, plazos de provisión.
11. "formaPago": Busca si indica domiciliación, transferencia, confirming, etc.
12. "prorrogaAutomatica": Busca si el contrato se prorroga automáticamente al vencer.

Responde SOLO con un JSON válido (sin markdown, sin backticks) con esta estructura:
{
  "proveedor": "Nombre del proveedor/operador mayorista",
  "cifProveedor": "CIF/NIF real del proveedor o null si no aparece",
  "titulo": "Título descriptivo del contrato",
  "tipo": "Servicios Internet|Mantenimiento|Guardias|Consultoría|Otro",
  "fechaFirma": "YYYY-MM-DD o null",
  "fechaInicio": "YYYY-MM-DD o null (fecha inicio contractual)",
  "fechaFin": "YYYY-MM-DD o null",
  "fechaInicioServicio": "YYYY-MM-DD o null (fecha real en que se activó el servicio)",
  "permanenciaMeses": número o null,
  "prorrogaAutomatica": true/false,
  "plazoProrroga": "descripción del plazo de prórroga o null",
  "importeMensual": número decimal o null (TOTAL mensual de todos los servicios),
  "importeAnual": número decimal o null,
  "formaPago": "confirming|transferencia|domiciliacion|otro|null",
  "contactoProveedor": "Nombre - email - teléfono del contacto del proveedor o null",
  "notas": "Resumen breve del objeto del contrato",
  "condicionesEspeciales": "Penalizaciones, exclusiones, cláusulas especiales relevantes",
  "servicios": [
    {
      "ubicacion": "Ciudad/País/Sede",
      "servicio": "Descripción del servicio contratado",
      "velocidad": "Velocidad/Caudal contratado",
      "precioMensual": número (cuota mensual en euros),
      "fechaInicioServicio": "YYYY-MM-DD o null"
    }
  ]
}

Si no puedes determinar un campo con certeza, usa null. NUNCA inventes datos (especialmente CIF, precios o fechas).`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, imagenes, nombreArchivo } = body;

    // Si tenemos imágenes, usar Vision
    if (imagenes && Array.isArray(imagenes) && imagenes.length > 0) {
      // Construir mensajes con imágenes para GPT-4o Vision (máximo 6 imágenes)
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
            { type: 'text', text: systemPrompt + '\n\nAnaliza este contrato de proveedor de telecomunicaciones y extrae todos los datos estructurados. Presta especial atención a las tablas de precios y condiciones económicas.' + (texto && texto.trim().length > 50 ? '\n\nTexto extraído del PDF (puede estar incompleto):\n' + texto.substring(0, 15000) : '') },
            ...imageContents,
          ] },
        ],
        max_tokens: 4000,
        temperature: 0,
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
          error: 'No se pudo parsear la respuesta de GPT. Respuesta: ' + content.substring(0, 300)
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        datos: mapearDatos(datos, nombreArchivo),
        documentoNombre: nombreArchivo || 'contrato.pdf',
      });
    }

    // Fallback: solo texto (para PDFs con texto seleccionable)
    if (!texto || texto.trim().length < 50) {
      return NextResponse.json({ 
        error: 'No se pudo extraer texto ni imágenes del PDF. Puede ser un archivo corrupto.'
      }, { status: 400 });
    }

    const textoLimitado = texto.substring(0, 80000);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: systemPrompt + '\n\nAnaliza este contrato de proveedor y extrae todos los datos estructurados:\n\n' + textoLimitado },
      ],
      max_tokens: 4000,
      temperature: 0,
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
      datos: mapearDatos(datos, nombreArchivo),
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

function mapearDatos(datos: any, nombreArchivo?: string) {
  return {
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
    importeAnual: datos.importeAnual || (datos.importeMensual ? datos.importeMensual * 12 : null),
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
  };
}
