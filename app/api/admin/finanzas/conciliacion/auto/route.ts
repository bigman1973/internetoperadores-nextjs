import { NextResponse } from 'next/server';

/**
 * Automatic reconciliation is intentionally retired.  This handler must stay
 * free of request parsing, authentication, database access, Graph access, and
 * feature-flag escape hatches so a request can never create an automatic link.
 */
export async function POST() {
  return NextResponse.json({
    error: 'La conciliación automática está desactivada. Revise las propuestas y confirme explícitamente en Conciliación bancaria.',
    codigo: 'FINANCE_AUTOMATIC_LINKS_DISABLED',
  }, {
    status: 409,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
