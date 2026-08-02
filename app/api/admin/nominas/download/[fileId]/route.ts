import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { downloadCostesFile } from '@/lib/microsoft-graph';

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH', 'VISOR'];

/**
 * GET /api/admin/nominas/download/[fileId]
 * Download a nómina PDF from OneDrive by its file ID
 * Proxies the file from Microsoft Graph API
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const { fileId } = params;

    if (!fileId) {
      return NextResponse.json({ error: 'fileId es requerido' }, { status: 400 });
    }

    // Download from OneDrive
    const pdfBuffer = await downloadCostesFile(fileId);

    // Return as PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Error downloading nómina PDF:', error);
    return NextResponse.json(
      { error: 'Error al descargar el PDF de la nómina' },
      { status: 500 }
    );
  }
}
