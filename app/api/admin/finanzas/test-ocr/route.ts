import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

/**
 * GET /api/admin/finanzas/test-ocr
 * Endpoint de diagnóstico temporal para verificar OCR
 * ELIMINAR después de resolver el problema
 */
export async function GET(req: NextRequest) {
  const diagnostics: any = {
    openaiKeySet: !!process.env.OPENAI_API_KEY,
    openaiKeyPrefix: process.env.OPENAI_API_KEY?.substring(0, 10) || 'NOT SET',
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  };

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Test 1: Simple text completion
    const simpleResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Respond with just: OK' }],
      max_tokens: 5,
    });
    diagnostics.simpleTest = simpleResponse.choices[0]?.message?.content;

    // Test 2: PDF with type:file
    const testPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n5 0 obj<</Length 52>>stream\nBT /F1 14 Tf 100 700 Td (Wildix OU Invoice 1293) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000340 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n442\n%%EOF').toString('base64');

    const pdfResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'What text is in this PDF? Reply with just the text.' },
          {
            type: 'file',
            file: {
              filename: 'test.pdf',
              file_data: `data:application/pdf;base64,${testPdf}`,
            },
          } as any,
        ],
      }],
      max_tokens: 50,
    });
    diagnostics.pdfTest = pdfResponse.choices[0]?.message?.content;
    diagnostics.pdfTestSuccess = true;
  } catch (error: any) {
    diagnostics.error = error.message;
    diagnostics.errorStatus = error.status;
    diagnostics.errorCode = error.code;
    diagnostics.pdfTestSuccess = false;
  }

  return NextResponse.json(diagnostics);
}
