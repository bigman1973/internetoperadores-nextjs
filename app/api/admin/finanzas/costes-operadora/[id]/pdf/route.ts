import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { operatorAuth, operatorJson } from '@/lib/finanzas/operator-costs-auth';
import { ID } from '@/lib/finanzas/operator-costs';
import { uploadOperatorPdf, downloadOperatorPdf } from '@/lib/finanzas/operator-costs-documents';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
const MAX = 4 * 1024 * 1024;
export async function GET(_req: NextRequest, context: Context) {
  try {
    const auth = await operatorAuth(false); if (auth instanceof NextResponse) return auth;
    const { id } = await context.params;
    if (!ID.test(id)) return operatorJson({ error: 'Fuente no válida' }, 400);
    const row = await prisma.fuenteCosteOperadora.findUnique({ where: { id }, select: { documentoItem: true, documentoDrive: true, documentoHash: true, documentoNombre: true } });
    if (!row?.documentoItem || !row.documentoDrive) return operatorJson({ error: 'No hay PDF original adjunto.' }, 404);
    const bytes = await downloadOperatorPdf(row.documentoDrive, row.documentoItem);
    if (createHash('sha256').update(bytes).digest('hex') !== row.documentoHash) return operatorJson({ error: 'El archivo cambió en OneDrive. Revisión documental necesaria.' }, 409);
    return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.documentoNombre || 'original.pdf')}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return operatorJson({ error: 'No se pudo recuperar el PDF privado.' }, 502); }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    const auth = await operatorAuth(true); if (auth instanceof NextResponse) return auth;
    if (req.headers.get('origin') !== req.nextUrl.origin) return operatorJson({ error: 'Origen no autorizado.' }, 403);
    if (!req.headers.get('content-type')?.startsWith('multipart/form-data')) return operatorJson({ error: 'Se requiere un PDF adjunto.' }, 415);
    const { id } = await context.params;
    if (!ID.test(id)) return operatorJson({ error: 'Fuente no válida.' }, 400);
    if (Number(req.headers.get('content-length')) > MAX + 65536) return operatorJson({ error: 'Máximo 4 MB por PDF.' }, 413);
    const row = await prisma.fuenteCosteOperadora.findUnique({ where: { id }, select: { origen: true, periodo: true, estado: true, documentoHash: true } });
    if (row?.estado === 'ARCHIVADO') return operatorJson({ error: 'Una fuente archivada no admite nuevos documentos.' }, 409);
    if (!row || row.origen !== 'TERCERO') return operatorJson({ error: 'Selecciona una fuente de tercero guardada.' }, 404);
    const form = await req.formData(); const file = form.get('file') || form.get('archivo');
    if (!(file instanceof File) || file.size < 5 || file.size > MAX || !file.name.toLowerCase().endsWith('.pdf')) return operatorJson({ error: 'PDF no válido, máximo 4 MB.' }, 400);
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== '%PDF-') return operatorJson({ error: 'El archivo no es un PDF.' }, 400);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (row.documentoHash) return row.documentoHash === hash ? operatorJson({ success: true, duplicado: true }) : operatorJson({ error: 'El original ya tiene un PDF. No se puede sustituir silenciosamente.' }, 409);
    if (await prisma.fuenteCosteOperadora.findUnique({ where: { documentoHash: hash }, select: { id: true } })) return operatorJson({ error: 'Este PDF original ya está vinculado a otro coste.' }, 409);
    const saved = await uploadOperatorPdf(id, row.periodo, bytes);
    await prisma.$transaction(async tx => {
      const update = await tx.fuenteCosteOperadora.updateMany({ where: { id, documentoHash: null, estado: { not: 'ARCHIVADO' } }, data: { documentoDrive: saved.drive, documentoItem: saved.item, documentoHash: saved.hash, documentoNombre: saved.name, version: { increment: 1 } } });
      if (!update.count) throw new Error('CONFLICT');
      await tx.auditoriaCosteOperadora.create({ data: { fuenteId: id, usuarioId: auth.userId, accion: 'ADJUNTAR_ORIGINAL', datos: { sha256: hash, nombre: saved.name } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return operatorJson({ success: true });
  } catch (error) {
    if ((error instanceof Error && error.message === 'CONFLICT') || (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code))) return operatorJson({ error: 'Otra sesión adjuntó o archivó la fuente. Recarga; no se ha sustituido ningún documento.' }, 409);
    return operatorJson({ error: 'La fuente sigue guardada, pero no se pudo adjuntar el PDF. Revisa permisos o disponibilidad de OneDrive y reintenta.' }, 502);
  }
}
