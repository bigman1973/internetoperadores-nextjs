import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { downloadCostesFile, findCostesFiles } from '@/lib/microsoft-graph';
import { parseCostesIOPdf } from '@/lib/nominas-parser';

export const maxDuration = 120;

/**
 * GET /api/admin/nominas/debug?fileId=xxx
 * Debug endpoint to test downloading and parsing a specific file from OneDrive
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const fileId = request.nextUrl.searchParams.get('fileId');
  const year = request.nextUrl.searchParams.get('year') || '2026';
  
  const steps: { step: string; result: string; duration?: number }[] = [];
  
  try {
    if (fileId) {
      // Test downloading a specific file
      const startDownload = Date.now();
      steps.push({ step: 'download_start', result: `Downloading file ${fileId}...` });
      
      const pdfBuffer = await downloadCostesFile(fileId);
      const downloadDuration = Date.now() - startDownload;
      steps.push({ step: 'download_complete', result: `Downloaded ${pdfBuffer.length} bytes`, duration: downloadDuration });
      
      // Test parsing
      const startParse = Date.now();
      steps.push({ step: 'parse_start', result: 'Parsing PDF...' });
      
      const parsed = await parseCostesIOPdf(pdfBuffer, 'debug_test.pdf');
      const parseDuration = Date.now() - startParse;
      steps.push({ step: 'parse_complete', result: `Found ${parsed.nominas.length} nominas, format: ${parsed.formato}`, duration: parseDuration });
      
      if (parsed.nominas.length > 0) {
        const n = parsed.nominas[0];
        steps.push({ step: 'data', result: `NIF=${n.nif} Dev=${n.devengadoTotal} Neto=${n.netoPercibir} IRPF=${n.irpf} SS=${n.ssTrabajador} Coste=${n.costeTotalEmpresa}` });
      }
      
      return NextResponse.json({ success: true, steps, parsed: parsed.nominas });
    } else {
      // List all files for the year and find David's
      steps.push({ step: 'find_files', result: `Finding files for year ${year}...` });
      const files = await findCostesFiles(parseInt(year));
      
      const davidFiles = files.filter(f => f.name.toUpperCase().includes('DAVID'));
      steps.push({ step: 'files_found', result: `Total files: ${files.length}, David's files: ${davidFiles.length}` });
      
      return NextResponse.json({ 
        success: true, 
        steps,
        allFiles: files.map(f => ({ name: f.name, id: f.id, type: f.type, monthNum: f.monthNum })),
        davidFiles: davidFiles.map(f => ({ name: f.name, id: f.id, type: f.type, monthNum: f.monthNum }))
      });
    }
  } catch (error: any) {
    steps.push({ step: 'error', result: `${error.message}\n${error.stack}` });
    return NextResponse.json({ success: false, steps, error: error.message }, { status: 500 });
  }
}
