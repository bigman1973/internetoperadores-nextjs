import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAccessToken, downloadFile } from '@/lib/finanzas/microsoft-graph';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/finanzas/test-ocr
 * Endpoint de diagnóstico para verificar OCR completo
 * Descarga un PDF real de OneDrive y lo envía a GPT-4o
 * ELIMINAR después de resolver el problema
 */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const diagnostics: any = {
    openaiKeySet: !!process.env.OPENAI_API_KEY,
    openaiKeyPrefix: process.env.OPENAI_API_KEY?.substring(0, 10) || 'NOT SET',
    graphConfigured: !!(process.env.MICROSOFT_GRAPH_TENANT_ID && process.env.MICROSOFT_GRAPH_CLIENT_ID),
    driveId: process.env.SHAREPOINT_DRIVE_ID ? 'SET' : 'NOT SET',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
    steps: [] as string[],
  };

  try {
    // Step 1: Get a Wildix invoice from DB
    diagnostics.steps.push('Finding Wildix invoice in DB...');
    const factura = await prisma.facturaRecibida.findFirst({
      where: { proveedor: { contains: 'Wildix', mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    });
    
    if (!factura) {
      diagnostics.error = 'No Wildix invoice found in DB';
      return NextResponse.json(diagnostics);
    }
    
    diagnostics.facturaId = factura.id;
    diagnostics.archivoOneDrive = factura.archivoOneDrive;
    diagnostics.oneDriveItemId = factura.oneDriveItemId;
    diagnostics.steps.push(`Found: ${factura.archivoOneDrive}`);

    // Step 2: Download from OneDrive
    diagnostics.steps.push('Getting access token...');
    const DRIVE_ID = process.env.SHAREPOINT_DRIVE_ID!;
    await getAccessToken();
    diagnostics.steps.push('Token OK. Downloading file...');
    
    const fileBuffer = await downloadFile(DRIVE_ID, factura.oneDriveItemId!);
    diagnostics.fileSize = fileBuffer.length;
    diagnostics.fileSizeKB = Math.round(fileBuffer.length / 1024);
    diagnostics.steps.push(`Downloaded: ${diagnostics.fileSizeKB} KB`);
    
    // Verify it's a valid PDF
    const header = fileBuffer.slice(0, 5).toString('utf8');
    diagnostics.fileHeader = header;
    diagnostics.isPdf = header === '%PDF-';
    diagnostics.steps.push(`File header: ${header}, isPdf: ${diagnostics.isPdf}`);

    // Step 3: Send to GPT-4o with type:file
    diagnostics.steps.push('Sending to GPT-4o...');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const fileBase64 = fileBuffer.toString('base64');
    diagnostics.base64Length = fileBase64.length;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Extract the invoice total amount and the company name from this PDF. Reply as JSON: {"company":"...","total":123.45}' },
          {
            type: 'file',
            file: {
              filename: factura.archivoOneDrive || 'factura.pdf',
              file_data: `data:application/pdf;base64,${fileBase64}`,
            },
          } as any,
        ],
      }],
      max_tokens: 200,
      temperature: 0.1,
    });
    
    diagnostics.gptResponse = response.choices[0]?.message?.content;
    diagnostics.steps.push('GPT-4o responded successfully!');
    diagnostics.success = true;
    
  } catch (error: any) {
    diagnostics.error = error.message;
    diagnostics.errorStack = error.stack?.split('\n').slice(0, 5);
    diagnostics.success = false;
  }

  return NextResponse.json(diagnostics);
}
