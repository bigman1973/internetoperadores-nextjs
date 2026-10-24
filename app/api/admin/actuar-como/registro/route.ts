import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import {
  ImpersonationError,
  nextAuthSessionCookieName,
  privateJsonHeaders,
  readImpersonationLog,
  requireLiveSuperAdmin,
} from '@/lib/impersonation'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateJsonHeaders() })
}

function page(value: string | null, fallback: number, maximum: number): number {
  if (value === null) return fallback
  if (!/^\d{1,5}$/.test(value)) throw new ImpersonationError(400, 'PAGINATION_INVALID', 'La paginación no es válida.')
  return Math.min(Number(value), maximum)
}

/** Ledger observability belongs only to the real, live super-admin—not an effective target. */
export async function GET(req: NextRequest) {
  if (req.headers.has('authorization')) return json({ error: 'Sólo se admite sesión web firmada.', codigo: 'AUTH_HEADER_DENIED' }, 401)
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET, cookieName: nextAuthSessionCookieName() })
    await requireLiveSuperAdmin(token)
    const limit = page(req.nextUrl.searchParams.get('limit'), 25, 100)
    const offset = page(req.nextUrl.searchParams.get('offset'), 0, 10_000)
    return json(await readImpersonationLog(limit, offset))
  } catch (error) {
    if (error instanceof ImpersonationError) return json({ error: error.message, codigo: error.code }, error.status)
    return json({ error: 'No se pudo leer el registro de actuación.', codigo: 'IMPERSONATION_LOG_FAILED' }, 500)
  }
}

export async function POST() { return json({ error: 'Método no permitido' }, 405) }
export async function PUT() { return json({ error: 'Método no permitido' }, 405) }
export async function PATCH() { return json({ error: 'Método no permitido' }, 405) }
export async function DELETE() { return json({ error: 'Método no permitido' }, 405) }
