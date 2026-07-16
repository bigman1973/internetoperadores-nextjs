import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 120;

const systemPrompt = `Extrae datos de este documento comercial de telecomunicaciones. Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "proveedor": "Nombre empresa que emite el documento",
  "cifProveedor": null,
  "titulo": "Título descriptivo del servicio contratado",
  "tipo": "Servicios Internet",
  "fechaFirma": "YYYY-MM-DD o null",
  "fechaInicio": "YYYY-MM-DD o null",
  "fechaFin": "YYYY-MM-DD o null",
  "fechaInicioServicio": null,
  "permanenciaMeses": numero o null,
  "prorrogaAutomatica": true,
  "plazoProrroga": null,
  "importeMensual": numero total mensual o null,
  "importeAnual": numero total anual o null,
  "formaPago": null,
  "contactoProveedor": null,
  "notas": "Resumen breve",
  "condicionesEspeciales": null,
  "servicios": [{"ubicacion":"","servicio":"","velocidad":"","precioMensual":0,"fechaInicioServicio":null}]
}
Reglas: cifProveedor SIEMPRE null (el usuario lo pondrá). Busca tablas de precios para importeMensual y servicios. precioMensual es la cuota mensual recurrente, NO el alta.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, imagenes, nombreArchivo } = body;

    // Si tenemos imágenes, usar Vision
    if (imagenes && Array.isArray(imagenes) && imagenes.length > 0) {
      // Seleccionar páginas estratégicas: primera (portada/datos) + mitad del doc (tablas económicas)
      const total = imagenes.length;
      const selectedIndexes: number[] = [0]; // Siempre la primera página
      if (total > 4) selectedIndexes.push(Math.floor(total * 0.6)); // Página al 60% (tablas económicas)
      else if (total > 1) selectedIndexes.push(total - 1); // Última si es corto
      const imagenesLimitadas = selectedIndexes.map(i => imagenes[i]);
      const imageContents: any[] = imagenesLimitadas.map((img: string) => ({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${img}`,
          detail: 'high',
        },
      }));

      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [
            { type: 'text', text: systemPrompt + '\n\nExtrae los datos de este documento comercial.' + (texto && texto.trim().length > 50 ? '\n\nTexto del documento:\n' + texto.substring(0, 10000) : '') },
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
        { role: 'user', content: systemPrompt + '\n\nExtrae los datos de este documento comercial:\n\n' + textoLimitado },
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
