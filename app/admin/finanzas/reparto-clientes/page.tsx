import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import CustomerCostAllocationWorkspace from '@/components/finanzas/customer-allocations/CustomerCostAllocationWorkspace'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { OPERATOR_AREA } from '@/lib/finanzas/operator-costs'
import { assertFinanceEasyRuntime, FinanceEasyRuntimeError } from '@/lib/finanzas/prototype-staging'

export const dynamic = 'force-dynamic'

/** Protected server-validated shell. The client never grants access by itself. */
export default async function CustomerCostAllocationPage() {
  let environment: 'staging' | 'production'
  try { environment = (await assertFinanceEasyRuntime()).runtime } catch (error) {
    if (error instanceof FinanceEasyRuntimeError) notFound()
    throw error
  }
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') redirect('/admin/login')
  const userId = Number(session.user.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) redirect('/admin/login')
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } })
  if (!admin?.activo) redirect('/admin/login')
  // Same established finance area: an existing restricted profile remains restrictive.
  const denied = await checkAdminAreaWrite(OPERATOR_AREA, ['CONTABILIDAD'], session)
  if (denied) redirect('/admin')
  return <CustomerCostAllocationWorkspace environment={environment} />
}
