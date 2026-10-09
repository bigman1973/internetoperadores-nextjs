import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { operatorAuth, operatorJson } from '@/lib/finanzas/operator-costs-auth';
import {
  analyzePendingDocument,
  discoverPendingDocuments,
  DISCOVERY_LIMIT,
  PendingRefactoringError,
  PENDING_STATES,
  sanitizePendingResult,
} from '@/lib/finanzas/pending-refactoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const LIMIT = 25;
const MAX_JSON = 128 * 1024;
const ID = /^[A-Za-z0-9_-]{1,80}$/;

class Invalid extends Error {}

function pageOf(req: NextRequest) {
  const value = req.nextUrl.searchParams.get('page') || '1';
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 100000) throw new Invalid('Página no válida.');
  return Number(value);
}

function publicDocument(row: any) {
  const result = sanitizePendingResult(row.resultado);
  return {
    id: row.id,
    ruta: row.ruta,
    nombre: row.nombre,
    mime: row.mime,
    size: row.size,
    modificadoAt: row.modificadoAt,
    estado: row.estado,
    incidencia: row.incidencia,
    version: row.version,
    fuenteId: row.fuenteId,
    hasResultado: result !== null,
    resultado: result,
  };
}

/** All documents found in the fixed 2026 scope contribute to this annual snapshot, not just the current page. */
async function annualSummary() {
  const rows = await prisma.documentoRefacturacionPendiente.findMany({
    take: DISCOVERY_LIMIT,
    select: { estado: true, fuenteId: true, resultado: true },
    orderBy: { createdAt: 'asc' },
  });
  const porEstado: Record<string, number> = Object.fromEntries(PENDING_STATES.map(state => [state, 0]));
  let basePendiente = 0;
  let totalPendiente = 0;
  let asignados = 0;
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(porEstado, row.estado)) porEstado[row.estado]++;
    if (row.fuenteId) asignados++;
    const result = row.estado === 'LISTO' ? sanitizePendingResult(row.resultado) : null;
    if (result && result.base !== null && !row.fuenteId) {
      // Amounts were constrained to two decimals by the strict extractor contract.
      basePendiente += result.base;
      if (result.total !== null) totalPendiente += result.total;
    }
  }
  return {
    detectados: porEstado.DETECTADO + porEstado.CAMBIADO + porEstado.ERROR,
    analizados: porEstado.LISTO + porEstado.REVISION,
    listos: porEstado.LISTO,
    revision: porEstado.REVISION,
    asignados,
    basePendiente: Math.round(basePendiente * 100) / 100,
    totalPendiente: Math.round(totalPendiente * 100) / 100,
    incomplete: rows.length >= DISCOVERY_LIMIT,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await operatorAuth(false);
    if (auth instanceof NextResponse) return auth;
    const page = pageOf(req);
    const params = req.nextUrl.searchParams;
    const buscar = params.get('buscar') || '';
    if (buscar.length > 160 || /[\u0000-\u001f\u007f]/.test(buscar)) throw new Invalid('Búsqueda no válida.');
    const estado = params.get('estado') || '';
    if (estado && !(PENDING_STATES as readonly string[]).includes(estado)) throw new Invalid('Estado no válido.');
    const where: any = {
      estado: estado || undefined,
      OR: buscar ? [
        { nombre: { contains: buscar, mode: 'insensitive' } },
        { ruta: { contains: buscar, mode: 'insensitive' } },
        { incidencia: { contains: buscar, mode: 'insensitive' } },
        { textoBusqueda: { contains: buscar, mode: 'insensitive' } },
      ] : undefined,
    };
    const [rows, total, resumen] = await Promise.all([
      prisma.documentoRefacturacionPendiente.findMany({
        where,
        select: {
          id: true, ruta: true, nombre: true, mime: true, size: true, modificadoAt: true,
          estado: true, incidencia: true, version: true, fuenteId: true, resultado: true,
        },
        orderBy: [{ modificadoAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * LIMIT,
        take: LIMIT,
      }),
      prisma.documentoRefacturacionPendiente.count({ where }),
      annualSummary(),
    ]);
    return operatorJson({
      documentos: rows.map(publicDocument),
      total,
      totalPages: Math.max(1, Math.ceil(total / LIMIT)),
      page,
      canWrite: auth.canWrite,
      resumen,
    });
  } catch (error) {
    return operatorJson({ error: error instanceof Invalid ? error.message : 'No se pudo cargar el catálogo de documentos pendientes.' }, error instanceof Invalid ? 400 : 500);
  }
}

async function jsonBody(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) throw new PendingRefactoringError('Origen no autorizado.', 403);
  if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new PendingRefactoringError('Se requiere JSON.', 415);
  if (Number(req.headers.get('content-length')) > MAX_JSON) throw new PendingRefactoringError('Solicitud demasiado grande.', 413);
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_JSON) throw new PendingRefactoringError('Solicitud demasiado grande.', 413);
  try { return JSON.parse(raw); } catch { throw new Invalid('JSON no válido.'); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await operatorAuth(true);
    if (auth instanceof NextResponse) return auth;
    const body = await jsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Invalid('Solicitud no válida.');
    if (body.action === 'descubrir') {
      if (Object.keys(body).some(key => key !== 'action')) throw new Invalid('Solicitud no válida.');
      const result = await discoverPendingDocuments(prisma);
      return operatorJson({ success: true, ...result });
    }
    if (body.action === 'analizar') {
      if (!ID.test(body.id || '') || !Number.isSafeInteger(body.version) || body.version < 1 || Object.keys(body).some(key => !['action', 'id', 'version'].includes(key))) throw new Invalid('Documento o versión no válidos.');
      const result = await analyzePendingDocument(prisma, { id: body.id, version: body.version });
      return operatorJson({ success: true, documento: result });
    }
    throw new Invalid('Acción no válida.');
  } catch (error) {
    if (error instanceof Invalid || error instanceof PendingRefactoringError) return operatorJson({ error: error.message }, error instanceof PendingRefactoringError ? error.status : 400);
    return operatorJson({ error: 'No se pudo completar la operación documental.' }, 502);
  }
}
