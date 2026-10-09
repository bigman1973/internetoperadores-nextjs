import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { operatorAuth, operatorJson } from '@/lib/finanzas/operator-costs-auth';
import { downloadPendingDocumentForProxy, PendingRefactoringError } from '@/lib/finanzas/pending-refactoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const ID = /^[A-Za-z0-9_-]{1,80}$/;

function safeFilename(name: string) {
  return name.replace(/[\r\n"\\]/g, '_').slice(0, 240) || 'documento';
}

export async function GET(_req: NextRequest, context: Context) {
  try {
    const auth = await operatorAuth(false);
    if (auth instanceof NextResponse) return auth;
    const { id } = await context.params;
    if (!ID.test(id)) return operatorJson({ error: 'Documento no válido.' }, 400);
    const row = await prisma.documentoRefacturacionPendiente.findUnique({
      where: { id },
      select: { drive: true, item: true, hash: true, mime: true, nombre: true },
    });
    if (!row) return operatorJson({ error: 'Documento pendiente no encontrado.' }, 404);
    const bytes = await downloadPendingDocumentForProxy(row);
    const contentType = row.mime === 'application/pdf' ? 'application/pdf' : row.mime === 'image/png' ? 'image/png' : 'image/jpeg';
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeFilename(row.nombre))}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof PendingRefactoringError) return operatorJson({ error: error.message }, error.status);
    return operatorJson({ error: 'No se pudo recuperar el documento privado.' }, 502);
  }
}
