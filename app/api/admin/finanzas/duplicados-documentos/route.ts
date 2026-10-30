import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { privateJson, requireB4FinanceAccess as requireReconciliationActor } from '@/lib/finanzas/reconciliation-auth'
import { area3StagingRuntimeAllowed } from '@/lib/finanzas/area3-document-fingerprints-core'
import { parseArea3DuplicatePage, readArea3ReceivedDocumentDuplicatesPage, Area3DocumentFingerprintStoreError } from '@/lib/finanzas/area3-document-fingerprints-db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Read-only, private Conciliar notice. It is deliberately preview/staging-only;
 * mounting the component never enables a new finance route in production.
 */
function runtimeAllowed(): boolean {
  return process.env.VERCEL_ENV === 'preview' && area3StagingRuntimeAllowed({
    stagingSandbox: process.env.FINANCE_STAGING_SANDBOX,
    vercelEnvironment: process.env.VERCEL_ENV,
    databaseUrl: process.env.DATABASE_URL,
    easyProductionEnabled: process.env.FINANCE_EASY_PRODUCTION_ENABLED,
    modelProductionEnabled: process.env.FINANCE_MODEL_PRODUCTION_ENABLED,
    conciliarProductionEnabled: process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED,
    publicConciliarProductionEnabled: process.env.NEXT_PUBLIC_FINANCE_CONCILIAR_PRODUCTION_ENABLED,
  })
}

export async function GET(request: NextRequest) {
  try {
    if (!runtimeAllowed()) return privateJson({ error: 'La consulta documental no está disponible en este entorno.' }, 404)
    // Alias intentional: the reviewed B4 guard re-reads UsuarioAdmin and the
    // effective admin.finanzas.conciliacion permission, including Lorena's live ACL.
    const access = await requireReconciliationActor('lectura')
    if ('response' in access) return access.response
    const page = parseArea3DuplicatePage({ page: request.nextUrl.searchParams.get('page'), limit: request.nextUrl.searchParams.get('limit') })
    return privateJson(await readArea3ReceivedDocumentDuplicatesPage(prisma, page))
  } catch (error) {
    if (error instanceof Area3DocumentFingerprintStoreError) return privateJson({ error: 'La consulta de documentos no es válida.' }, 400)
    return privateJson({ error: 'No se pudieron leer los avisos de archivos repetidos. Inténtelo de nuevo.' }, 500)
  }
}

export async function POST() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PUT() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function PATCH() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function DELETE() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function HEAD() { return privateJson({ error: 'Método no permitido.' }, 405) }
export async function OPTIONS() { return privateJson({ error: 'Método no permitido.' }, 405) }
