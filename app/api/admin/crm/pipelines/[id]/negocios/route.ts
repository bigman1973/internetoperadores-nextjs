import { NextResponse } from 'next/server'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { crearNegocio } from '@/lib/crm-pipelines'
export const dynamic = 'force-dynamic'
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en el CRM.' }, { status: auth.status })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  const { id } = await params
  const str = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v))
  const result = await crearNegocio(String(id).slice(0, 80), {
    nombre: str(body.nombre), importe: str(body.importe), fechaCierrePrevista: str(body.fechaCierrePrevista),
    contactoId: str(body.contactoId), empresaId: str(body.empresaId), etapaId: str(body.etapaId), notas: str(body.notas),
  }, auth.user)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, id: result.id }, { status: 201 })
}
