import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAccessToken, downloadFile } from '@/lib/finanzas/microsoft-graph';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/test-ocr
 * Diagnóstico OCR - reproduce exactamente el flujo de la ruta OCR
 * pero con logging detallado para capturar el error
 * ELIMINAR después de resolver el problema
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    steps: [] as string[],
  };

  try {
    const facturaId = '226a5b7a-7897-4977-b10d-f8a0f0001242';
    
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id: facturaId },
    });
    
    if (!factura) {
      diagnostics.error = 'Invoice not found';
      return NextResponse.json(diagnostics);
    }
    
    diagnostics.steps.push('1. Invoice found');

    // Download
    const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;
    await getAccessToken();
    const fileBuffer = await downloadFile(DRIVE_ID, factura.oneDriveItemId!);
    diagnostics.fileSizeKB = Math.round(fileBuffer.length / 1024);
    diagnostics.steps.push(`2. Downloaded: ${diagnostics.fileSizeKB} KB`);

    // Reproduce EXACTLY what extraerDatosFactura does
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fileBase64 = fileBuffer.toString('base64');
    const fileName = factura.archivoOneDrive || '';

    // EXACT same system prompt from ocr-facturas.ts
    const systemPrompt = `Eres un experto en contabilidad española. Extraes datos de facturas recibidas con máxima precisión.
SIEMPRE devuelves un JSON válido con los siguientes campos:
- proveedor: nombre del emisor de la factura (empresa que factura)
- cif: CIF/NIF/VAT del emisor (formato español: B12345678, o formato extranjero si aplica: EE, DE, FR, NL, etc.)
- domicilioProveedor: dirección fiscal completa del emisor tal como aparece en la factura (calle, número, ciudad, código postal, país). Si no aparece, pon null
- numFactura: número de factura exacto tal como aparece en el documento
- fecha: fecha de emisión de la factura en formato YYYY-MM-DD (IMPORTANTE: lee el año exacto del documento, no inventes)
- base: base imponible total (número decimal, sin símbolo €)
- tipoIva: porcentaje de IVA principal aplicado (21, 10, 4, 0). Si es factura intracomunitaria sin IVA, pon 0
- importeIva: importe total del IVA (número decimal). Si no hay IVA, pon 0
- tipoIrpf: porcentaje de IRPF retenido (15, 7, 0). Solo aplica a facturas de profesionales/autónomos españoles
- importeIrpf: importe del IRPF retenido (número decimal, positivo)
- total: importe total de la factura (número decimal)
- concepto: descripción general del servicio/producto facturado
- confianza: tu nivel de confianza en la extracción (0.0 a 1.0)
- esInternacional: true si el emisor NO es una empresa española
- paisOrigen: código ISO de 2 letras del país del emisor si es internacional, null si es española
- lineas: array de TODAS las líneas de detalle de la factura. Cada línea tiene:
  - descripcion: texto descriptivo de la línea
  - cliente: nombre de empresa/persona si aparece, null si no
  - cantidad: cantidad (número)
  - precioUnitario: precio por unidad (número decimal)
  - iva: porcentaje de IVA de esta línea
  - importe: importe total de la línea

REGLAS:
- Lee la fecha EXACTA del documento
- Si no puedes leer un campo, pon null (excepto números que van a 0)
- Responde SOLO con el JSON, sin markdown ni explicaciones`;

    const userPrompt = `Extrae los datos de esta factura. El nombre del archivo es: "${fileName}". Incluye TODAS las líneas de detalle con precio, tengan o no cliente asociado.`;

    diagnostics.steps.push('3. Calling GPT-4o with FULL prompt...');
    diagnostics.systemPromptLength = systemPrompt.length;
    diagnostics.base64Length = fileBase64.length;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'file',
              file: {
                filename: fileName,
                file_data: `data:application/pdf;base64,${fileBase64}`,
              },
            } as any,
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0.1,
    });

    const responseContent = response.choices[0]?.message?.content || '';
    diagnostics.steps.push('4. GPT-4o responded!');
    diagnostics.responseLength = responseContent.length;
    diagnostics.responseFirst200 = responseContent.substring(0, 200);
    diagnostics.responseLast100 = responseContent.substring(responseContent.length - 100);
    
    // Try to parse
    const jsonStr = responseContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    diagnostics.jsonStrFirst200 = jsonStr.substring(0, 200);
    
    try {
      const datos = JSON.parse(jsonStr);
      diagnostics.parsedOk = true;
      diagnostics.proveedor = datos.proveedor;
      diagnostics.total = datos.total;
      diagnostics.numLineas = datos.lineas?.length || 0;
      diagnostics.esInternacional = datos.esInternacional;
      diagnostics.steps.push(`5. Parsed OK: ${datos.proveedor}, ${datos.total}€, ${datos.lineas?.length || 0} lines`);
    } catch (parseErr: any) {
      diagnostics.parsedOk = false;
      diagnostics.parseError = parseErr.message;
      diagnostics.steps.push(`5. Parse ERROR: ${parseErr.message}`);
    }
    
    diagnostics.success = true;
    
  } catch (error: any) {
    diagnostics.error = error.message;
    diagnostics.errorName = error.name;
    diagnostics.errorStatus = (error as any).status;
    diagnostics.errorCode = (error as any).code;
    diagnostics.errorStack = error.stack?.split('\n').slice(0, 5);
    diagnostics.success = false;
  }

  return NextResponse.json(diagnostics);
}
