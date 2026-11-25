import { NextResponse } from 'next/server'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { listarPipelines } from '@/lib/crm-pipelines'
import { MOTIVOS_PERDIDA } from '@/lib/crm-pipelines-core'
export const dynamic = 'force-dynamic'
export async function GET() {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  const pipelines = await listarPipelines()
  return NextResponse.json({ success: true, motivosPerdida: MOTIVOS_PERDIDA, pipelines: pipelines.map((p) => ({ id: p.id, nombre: p.nombre, producto: p.producto, segmentoCrm: p.segmentoCrm, negocios: p._count.negocios })) })
}
