import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { assertConciliarRuntime, ConciliarRuntimeError } from '@/lib/finanzas/conciliar-runtime'
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { bibliotecaFinancieraConfigurada } from '@/lib/finanzas/archivo-fuente-controlada'
import { DescargaPrivadaGraphError, descargarGraphPrivadoAcotado } from '@/lib/finanzas/descarga-privada-graph'
import { ConciliarDbError, conciliarDbErrorResponse, resolveConciliarProjectionFile } from '@/lib/finanzas/conciliar-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const MAX_FILE_BYTES = 12 * 1024 * 1024
const OPAQUE_ID = /^[A-Za-z0-9_-]{1,240}$/

function safeFilename(value: string): string {
  const safe = value.replace(/[\r\n"\\/]/g, ' ').trim().slice(0, 180)
  return safe || 'documento.pdf'
}
function isPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.subarray(0, 5).toString('ascii') === '%PDF-'
}
function errorResponse(error: unknown) {
  if (error instanceof ConciliarRuntimeError) return privateJson({ error: error.message, codigo: error.code }, error.status)
  if (error instanceof ConciliarDbError) {
    const response = conciliarDbErrorResponse(error)
    return privateJson(response.body, response.status)
  }
  if (error instanceof DescargaPrivadaGraphError) {
    if (error.code === 'ARCHIVO_FUERA_DE_LIMITE') return privateJson({ error: 'El archivo privado supera el límite permitido.', codigo: error.code }, 413)
    return privateJson({ error: 'No se pudo recuperar el archivo privado.', codigo: error.code }, 502)
  }
  return privateJson({ error: 'No se pudo leer el archivo de Conciliar.', codigo: 'CONCILIAR_ARCHIVO_FAILED' }, 500)
}

/**
 * The browser supplies only a projection row ID. The DB resolver rechecks that
 * the row still exposes this exact Conciliar href and returns a controlled
 * read-only locator. No URL, drive ID, item ID or legacy payroll endpoint is
 * accepted from the request.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await assertConciliarRuntime()
    const access = await requireB4FinanceAccess('lectura', await getServerSession(authOptions))
    if ('response' in access) return access.response
    const { id } = await context.params
    if (!OPAQUE_ID.test(id)) return privateJson({ error: 'Archivo no válido.', codigo: 'ARCHIVO_INVALIDO' }, 400)
    const file = await resolveConciliarProjectionFile(id)
    let bytes: Buffer
    if ('configured' in file.locator) {
      const driveId = bibliotecaFinancieraConfigurada()
      if (!driveId) return privateJson({ error: 'No está disponible la biblioteca privada de Finanzas.', codigo: 'DRIVE_PRIVADO_NO_CONFIGURADO' }, 503)
      bytes = await descargarGraphPrivadoAcotado(driveId, file.locator.itemId, MAX_FILE_BYTES)
    } else {
      bytes = await descargarGraphPrivadoAcotado(file.locator.driveId, file.locator.itemId, MAX_FILE_BYTES)
    }
    if (!isPdf(bytes)) return privateJson({ error: 'El documento privado no es un PDF válido.', codigo: 'ARCHIVO_NO_PDF' }, 502)
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(safeFilename(file.nombre))}`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) { return errorResponse(error) }
}

export async function POST() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function HEAD() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function OPTIONS() { return privateJson({ error: 'Método no permitido.' }, 405) }
