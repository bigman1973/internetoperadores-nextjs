import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const maxDuration = 120;

const systemPrompt = `Eres un experto en contratos de telecomunicaciones. Extrae datos de este documento comercial/oferta de un proveedor de telecomunicaciones. Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "proveedor": "Nombre empresa que emite el documento (ej: Telefónica, Vodafone, Orange, MasMovil, Lyntia...)",
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
  "importeMensual": numero total mensual de TODOS los servicios sumados o null,
  "importeAnual": numero total anual o null,
  "formaPago": null,
  "contactoProveedor": null,
  "notas": "Resumen breve del contrato",
  "condicionesEspeciales": null,
  "servicios": [{"ubicacion":"nombre sede o dirección","servicio":"tipo servicio (FTTO, FTTH, F.O. dedicada, etc)","velocidad":"100M/100M","importeAlta":0,"precioMensual":258.83,"fechaInicioServicio":null}]
}
REGLAS IMPORTANTES:
1. cifProveedor SIEMPRE null (el usuario lo pondrá manualmente).
2. BUSCA TABLAS DE PRECIOS/VALORACIÓN ECONÓMICA. Los precios mensuales (€/m, €/mes, Mensual) son la cuota recurrente, NO el alta.
3. Cada servicio/sede debe tener su precioMensual individual extraído de la tabla de valoración económica.
4. importeMensual es la SUMA de todos los precioMensual de los servicios.
5. importeAlta es el coste de alta/instalación de cada servicio (columna "Alta (€)" en la tabla). Si es 0 o no aparece, poner 0.
6. Si hay sección "Valoración Económica" o "Resumen Económico", usa esos precios.
7. permanenciaMeses: busca "contrato mínimo de X meses" o "permanencia X meses".
8. Incluye SOLO servicios de conectividad/internet de las sedes del cliente final (no incluir CEX Premium, soporte, ni sedes internacionales salvo que sean relevantes).`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, imagenes, nombreArchivo } = body;

    // Si tenemos imágenes, usar Vision
    if (imagenes && Array.isArray(imagenes) && imagenes.length > 0) {
      // Seleccionar páginas estratégicas para maximizar la captura de precios
      const total = imagenes.length;
      const selectedIndexes: number[] = [];
      
      if (total <= 4) {
        // Si hay pocas páginas, enviar todas
        for (let i = 0; i < total; i++) selectedIndexes.push(i);
      } else if (total <= 8) {
        // Documento medio: primera, mitad y última
        selectedIndexes.push(0);
        selectedIndexes.push(Math.floor(total * 0.5));
        selectedIndexes.push(total - 1);
      } else {
        // Documento largo (>8 páginas): enviar 4 páginas estratégicas
        // Página 1 (portada/datos generales)
        selectedIndexes.push(0);
        // Página 2 (suele tener datos de control/cliente)
        selectedIndexes.push(1);
        // Página al 60-65% (donde suelen estar las tablas de precios/valoración económica)
        selectedIndexes.push(Math.floor(total * 0.63));
        // Página al 70% (condiciones/permanencia)
        selectedIndexes.push(Math.floor(total * 0.70));
      }
      
      // Eliminar duplicados
      const uniqueIndexes = [...new Set(selectedIndexes)].filter(i => i < total);
      const imagenesLimitadas = uniqueIndexes.map(i => imagenes[i]);
      
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
            { type: 'text', text: systemPrompt + '\n\nAnaliza las siguientes páginas del documento y extrae los datos. PRESTA ESPECIAL ATENCIÓN a las tablas con columnas "Mensual (€/m)" o "Precio" para obtener los importes de cada servicio.' + (texto && texto.trim().length > 50 ? '\n\nTexto adicional del documento:\n' + texto.substring(0, 8000) : '') },
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
        paginasAnalizadas: uniqueIndexes.map(i => i + 1),
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
      importeAlta: s.importeAlta || 0,
      precioMensual: s.precioMensual || 0,
      fechaInicioServicio: s.fechaInicioServicio || null,
    })) || null,
  };
}
