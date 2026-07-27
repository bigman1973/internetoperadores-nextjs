import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/admin/clientes/ggcc/draxton/proyectos-contrato/ocr
 * Recibe un archivo (imagen renderizada del PDF en el cliente) y extrae datos con GPT-4o Vision
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'image/png';

    const prompt = `Analiza este documento comercial y extrae TODOS los datos en formato JSON.

INSTRUCCIONES:
- Extrae absolutamente TODOS los datos visibles: datos fiscales, líneas de detalle, totales, condiciones
- Si un campo no es visible o legible, pon null
- El importe_total debe ser el TOTAL FINAL (con IVA)
- Identifica el tipo de documento: presupuesto_cliente, pedido_cliente, presupuesto_proveedor, albaran, factura, fin_obra, otro
- La fecha en formato YYYY-MM-DD
- Si el documento va dirigido a INTERNET OPERADORES, es un presupuesto_proveedor
- Si lo emite INTERNET OPERADORES, es presupuesto_cliente o albaran
- En las líneas de detalle, extrae CADA línea con su código, descripción completa, unidades, precio unitario, descuento e importe

Responde SOLO con JSON válido, sin markdown ni explicaciones:
{
  "tipo_documento": "presupuesto_cliente|pedido_cliente|presupuesto_proveedor|albaran|factura|fin_obra|otro",
  "numero_documento": "Número de presupuesto/pedido/factura/albarán",
  "fecha": "YYYY-MM-DD",
  "validez": "Fecha de validez si aplica YYYY-MM-DD",
  "emisor": {
    "nombre": "Nombre/Razón social del emisor",
    "cif": "CIF/NIF del emisor",
    "direccion": "Dirección completa",
    "telefono": "Teléfono",
    "email": "Email",
    "web": "Web"
  },
  "receptor": {
    "nombre": "Nombre/Razón social del receptor",
    "cif": "CIF/NIF del receptor",
    "direccion": "Dirección completa",
    "codigo_cliente": "Código de cliente si visible"
  },
  "lineas": [
    {
      "codigo": "Código de artículo/referencia",
      "descripcion": "Descripción COMPLETA del producto/servicio",
      "unidades": 1,
      "precio_unitario": 0.00,
      "descuento_pct": 0,
      "importe": 0.00
    }
  ],
  "base_imponible": 0.00,
  "iva_porcentaje": 21,
  "importe_iva": 0.00,
  "importe_total": 0.00,
  "forma_pago": "Transferencia/Anticipado/30 días/etc",
  "iban": "IBAN si visible",
  "observaciones": "Condiciones, notas o comentarios del documento",
  "concepto": "Resumen breve del contenido (máx 150 chars)",
  "proveedor": "Nombre del proveedor (emisor si es presupuesto_proveedor)",
  "confianza": 0.95
}`;

    // Soportar tanto imágenes como PDFs directamente
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;
    
    let imageContents: any[];
    if (contentType === 'application/pdf') {
      // GPT-4o soporta PDFs nativamente como file input
      imageContents = [
        { type: 'file' as const, file: { filename: file.name, file_data: `data:application/pdf;base64,${base64}` } },
      ];
    } else {
      imageContents = [
        { type: 'image_url' as const, image_url: { url: dataUrl, detail: 'high' as const } },
      ];
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            ...imageContents,
          ],
        },
      ],
      max_tokens: 4000,
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

    // Mapear a los campos del formulario (campos simples para pre-rellenar)
    const resultado = {
      nombre: datos.numero_documento
        ? `${datos.numero_documento}${datos.concepto ? ' - ' + datos.concepto.substring(0, 50) : ''}`
        : datos.concepto || file.name.replace(/\.[^/.]+$/, ''),
      tipo: datos.tipo_documento || 'otro',
      fecha: datos.fecha || new Date().toISOString().split('T')[0],
      importe: datos.importe_total || null,
      proveedor: datos.proveedor || (datos.emisor?.nombre) || null,
      concepto: datos.concepto || null,
      numero_documento: datos.numero_documento || null,
      emisor: datos.emisor || null,
      receptor: datos.receptor || null,
      // Datos fiscales completos
      cif_emisor: datos.emisor?.cif || null,
      direccion_emisor: datos.emisor?.direccion || null,
      cif_receptor: datos.receptor?.cif || null,
      // Desglose económico
      base_imponible: datos.base_imponible || null,
      iva_porcentaje: datos.iva_porcentaje || null,
      importe_iva: datos.importe_iva || null,
      forma_pago: datos.forma_pago || null,
      iban: datos.iban || null,
      validez: datos.validez || null,
      observaciones: datos.observaciones || null,
      // Líneas de detalle completas
      lineas: datos.lineas || [],
      confianza: datos.confianza || 0.8,
      raw: datos,
    };

    return NextResponse.json({ success: true, datos: resultado });
  } catch (error: any) {
    console.error('Error OCR documento:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
