import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAccessToken, downloadFile } from '@/lib/finanzas/microsoft-graph';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/test-ocr
 * Diagnóstico OCR - ejecuta GPT-4o directamente con el PDF real
 * para capturar el error exacto
 * ELIMINAR después de resolver el problema
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    steps: [] as string[],
  };

  try {
    // Use the Wildix March invoice
    const facturaId = '226a5b7a-7897-4977-b10d-f8a0f0001242';
    
    const factura = await prisma.facturaRecibida.findUnique({
      where: { id: facturaId },
    });
    
    if (!factura) {
      diagnostics.error = 'Invoice not found';
      return NextResponse.json(diagnostics);
    }
    
    diagnostics.archivoOneDrive = factura.archivoOneDrive;
    diagnostics.steps.push('1. Invoice found');

    // Download from OneDrive
    const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;
    await getAccessToken();
    const fileBuffer = await downloadFile(DRIVE_ID, factura.oneDriveItemId!);
    diagnostics.fileSizeKB = Math.round(fileBuffer.length / 1024);
    diagnostics.steps.push(`2. Downloaded: ${diagnostics.fileSizeKB} KB`);

    // Send directly to GPT-4o (bypassing extraerDatosFactura to see raw error)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fileBase64 = fileBuffer.toString('base64');
    
    const systemPrompt = `Eres un experto en contabilidad española. Extraes datos de facturas.
Devuelve SOLO un JSON con: proveedor, cif, total, numFactura, fecha (YYYY-MM-DD), esInternacional (boolean), paisOrigen.
Sin markdown, sin explicaciones, SOLO el JSON.`;

    const userPrompt = `Extrae los datos de esta factura. El nombre del archivo es: "${factura.archivoOneDrive}".`;

    diagnostics.steps.push('3. Sending to GPT-4o with type:file...');
    
    let gptResponse: string | null = null;
    let gptError: string | null = null;
    
    try {
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
                  filename: factura.archivoOneDrive || 'factura.pdf',
                  file_data: `data:application/pdf;base64,${fileBase64}`,
                },
              } as any,
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      });
      
      gptResponse = response.choices[0]?.message?.content || '';
      diagnostics.steps.push('4. GPT-4o responded!');
    } catch (gptErr: any) {
      gptError = gptErr.message;
      diagnostics.gptErrorStatus = gptErr.status;
      diagnostics.gptErrorCode = gptErr.code;
      diagnostics.gptErrorType = gptErr.type;
      diagnostics.steps.push(`4. GPT-4o ERROR: ${gptErr.message}`);
    }
    
    diagnostics.gptResponse = gptResponse;
    diagnostics.gptError = gptError;
    
    // Try to parse the response
    if (gptResponse) {
      try {
        const jsonStr = gptResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(jsonStr);
        diagnostics.parsedResult = parsed;
        diagnostics.steps.push('5. JSON parsed successfully');
      } catch (parseErr: any) {
        diagnostics.parseError = parseErr.message;
        diagnostics.steps.push(`5. JSON parse ERROR: ${parseErr.message}`);
      }
    }
    
    diagnostics.success = !gptError;
    
  } catch (error: any) {
    diagnostics.error = error.message;
    diagnostics.errorStack = error.stack?.split('\n').slice(0, 5);
    diagnostics.success = false;
  }

  return NextResponse.json(diagnostics);
}
