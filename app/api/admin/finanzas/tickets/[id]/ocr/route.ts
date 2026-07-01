import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import OpenAI from 'openai';

export const maxDuration = 60;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/admin/finanzas/tickets/[id]/ocr
 * Procesar OCR de un ticket/recibo usando GPT-4o vision
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const gasto = await prisma.gasto.findUnique({
      where: { id },
    });
    if (!gasto) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }
    if (!gasto.archivoUrl) {
      return NextResponse.json({ error: 'Este gasto no tiene archivo adjunto' }, { status: 400 });
    }

    // Descargar la imagen/PDF del ticket
    const fileResponse = await fetch(gasto.archivoUrl);
    if (!fileResponse.ok) {
      return NextResponse.json({ error: 'No se pudo descargar el archivo' }, { status: 500 });
    }
    
    const buffer = Buffer.from(await fileResponse.arrayBuffer());
    const base64 = buffer.toString('base64');
    const contentType = fileResponse.headers.get('content-type') || 'image/jpeg';
    const dataUrl = `data:${contentType};base64,${base64}`;

    // Prompt para OCR de tickets
    const prompt = `Analiza esta imagen de un ticket o recibo de compra y extrae los siguientes datos en formato JSON.

INSTRUCCIONES:
- Extrae TODOS los datos visibles del ticket
- Si un campo no es visible o legible, pon null
- El importe TOTAL es el importe final pagado (incluye IVA)
- Si hay desglose de IVA, extrae base imponible y tipo de IVA
- El comercio es la empresa/tienda que emite el ticket
- La fecha debe estar en formato YYYY-MM-DD
- Clasifica el tipo de gasto según estas categorías: GASTO_GENERAL, DIETA, DESPLAZAMIENTO, MATERIAL, COMBUSTIBLE, PARKING, PEAJE, MATERIAL_OFICINA, SUMINISTROS, COMIDA, ALOJAMIENTO, FORMACION, HERRAMIENTAS, OTROS

Responde SOLO con JSON válido, sin markdown ni explicaciones:
{
  "comercio": "Nombre del comercio/empresa",
  "cifComercio": "CIF/NIF del comercio (si visible)",
  "direccion": "Dirección del comercio (si visible)",
  "fecha": "YYYY-MM-DD",
  "concepto": "Descripción breve de la compra (máx 100 chars)",
  "importe": 0.00,
  "baseImponible": 0.00,
  "tipoIva": 21,
  "importeIva": 0.00,
  "tipo": "CATEGORIA_DEL_GASTO",
  "metodoPago": "Efectivo/Tarjeta/Otro",
  "numTicket": "Número de ticket si visible",
  "confianza": 0.95
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content || '';
    
    // Limpiar respuesta (quitar markdown si lo hay)
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    let datos: any;
    try {
      datos = JSON.parse(jsonStr);
    } catch {
      return NextResponse.json({ 
        error: 'No se pudo parsear la respuesta del OCR',
        raw: content 
      }, { status: 500 });
    }

    // Actualizar el gasto con los datos extraídos
    await prisma.gasto.update({
      where: { id },
      data: {
        concepto: datos.concepto || gasto.concepto,
        importe: datos.importe || gasto.importe,
        fecha: datos.fecha ? new Date(datos.fecha) : gasto.fecha,
        tipo: datos.tipo || gasto.tipo,
        comercio: datos.comercio || null,
        cifComercio: datos.cifComercio || null,
        baseIva: datos.baseImponible || null,
        importeIva: datos.importeIva || null,
        tipoIva: datos.tipoIva || null,
        deducibleIva: !!(datos.cifComercio && datos.baseImponible), // Solo deducible si tiene CIF
        ocrCompletado: true,
        ocrConfianza: datos.confianza || 0.8,
        datosOcrRaw: JSON.stringify(datos),
      },
    });

    return NextResponse.json({
      success: true,
      datos,
    });
  } catch (error: any) {
    console.error('Error OCR ticket:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
