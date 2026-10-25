import { NextResponse } from 'next/server'
import { requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth'
import { assertFinanceEasyRuntime } from '@/lib/finanzas/prototype-staging'
import { canManageEasyAutomation, isEasyOnlyFinanceUser } from '@/lib/finanzas/easy-access-profile'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const context = await assertFinanceEasyRuntime()
    const auth = await requireB4FinanceAccess('lectura')
    if ('response' in auth) return auth.response
    const [easyOnly, canManageAutomation, writeAccess] = await Promise.all([
      isEasyOnlyFinanceUser(auth.actor.id),
      canManageEasyAutomation(auth.actor.id, context),
      requireB4FinanceAccess('escritura'),
    ])
    return NextResponse.json({
      easyOnly,
      canWrite: writeAccess.ok === true,
      canManageAutomation,
      environment: context.runtime,
    }, { headers: { 'cache-control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'No se pudo verificar el perfil.' }, { status: 403, headers: { 'cache-control': 'private, no-store' } })
  }
}
