import { NextResponse } from 'next/server'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { moverNegocio } from '@/lib/crm-pipelines'
export const dynamic = 'force-dynamic'
/** Mueve un negocio de etapa. Queda auditado en area1_crm_negocio_movimientos. */
export async function PATCH(request: Request, { params }: { params: Promise<{ negocioId: string }> }) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en el CRM.' }, { status: auth.status })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.etapaId !== 'string') return NextResponse.json({ error: 'Indica la etapa de destino.' }, { status: 400 })
  const { negocioId } = await params
  const result = await moverNegocio(String(negocioId).slice(0, 80), body.etapaId.slice(0, 160), {
    motivo: typeof body.motivo === 'string' ? body.motivo : null,
    detalleMotivo: typeof body.detalleMotivo === 'string' ? body.detalleMotivo : null,
  }, auth.user)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, sinCambios: result.sinCambios })
}
