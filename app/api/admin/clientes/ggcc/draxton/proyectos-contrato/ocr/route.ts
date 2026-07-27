import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/admin/clientes/ggcc/draxton/proyectos-contrato/ocr
 * Recibe un archivo (PDF/imagen) y extrae datos con GPT-4o Vision
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const contentType = file.type || 'application/pdf';

    // Para PDFs, enviamos directamente como base64 (GPT-4o soporta PDFs)
    // Para imágenes, enviamos como image_url
    let content: any[];

    const prompt = `Analiza este documento y extrae los siguientes datos en formato JSON.

INSTRUCCIONES:
- Este documento puede ser un presupuesto, pedido de compra, albarán, factura o documentación de fin de obra
- Extrae TODOS los datos visibles relevantes
- Si un campo no es visible o legible, pon null
- El importe debe ser el TOTAL (con IVA si aplica)
- Identifica el tipo de documento según estas categorías: presupuesto_cliente, pedido_cliente, presupuesto_proveedor, albaran, factura, fin_obra, otro
- La fecha debe estar en formato YYYY-MM-DD
- Si hay varias fechas, usa la fecha del documento (emisión)

Responde SOLO con JSON válido, sin markdown ni explicaciones:
{
  "tipo_documento": "presupuesto_cliente|pedido_cliente|presupuesto_proveedor|albaran|factura|fin_obra|otro",
  "emisor": "Empresa que emite el documento",
  "receptor": "Empresa que recibe el documento",
  "numero_documento": "Número de presupuesto/pedido/factura/albarán",
  "fecha": "YYYY-MM-DD",
  "importe_total": 0.00,
  "base_imponible": 0.00,
  "iva_porcentaje": 21,
  "importe_iva": 0.00,
  "concepto": "Descripción breve del contenido (máx 150 chars)",
  "proveedor": "Nombre del proveedor (si es presupuesto/factura de proveedor)",
  "items_principales": ["item1", "item2"],
  "confianza": 0.95
}`;

    if (contentType.startsWith('image/')) {
      const dataUrl = `data:${contentType};base64,${base64}`;
      content = [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
      ];
    } else {
      // PDF - enviar como file (GPT-4o soporta PDFs directamente)
      const dataUrl = `data:${contentType};base64,${base64}`;
      content = [
        { type: 'text', text: prompt },
        { type: 'file', file: { file_data: dataUrl } },
      ];
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content,
        },
      ],
      max_tokens: 1500,
      temperature: 0,
    });

    const responseContent = response.choices[0]?.message?.content || '';

    // Limpiar respuesta (quitar markdown si lo hay)
    let jsonStr = responseContent.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    let datos: any;
    try {
      datos = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({
        error: 'No se pudo parsear la respuesta del OCR',
        raw: responseContent,
      }, { status: 500 });
    }

    // Mapear a los campos del formulario
    const resultado = {
      nombre: datos.numero_documento
        ? `${datos.numero_documento}${datos.concepto ? ' - ' + datos.concepto.substring(0, 50) : ''}`
        : datos.concepto || file.name.replace(/\.[^/.]+$/, ''),
      tipo: datos.tipo_documento || 'otro',
      fecha: datos.fecha || new Date().toISOString().split('T')[0],
      importe: datos.importe_total || null,
      proveedor: datos.proveedor || datos.emisor || null,
      concepto: datos.concepto || null,
      numero_documento: datos.numero_documento || null,
      emisor: datos.emisor || null,
      receptor: datos.receptor || null,
      items: datos.items_principales || [],
      confianza: datos.confianza || 0.8,
      raw: datos,
    };

    return NextResponse.json({ success: true, datos: resultado });
  } catch (error: any) {
    console.error('Error OCR documento:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
