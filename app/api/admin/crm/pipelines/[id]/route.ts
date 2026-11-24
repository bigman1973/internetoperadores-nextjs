import { NextResponse } from 'next/server'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { obtenerTablero } from '@/lib/crm-pipelines'
export const dynamic = 'force-dynamic'
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  const { id } = await params
  const tablero = await obtenerTablero(String(id).slice(0, 80))
  if (!tablero) return NextResponse.json({ error: 'Pipeline no encontrado.' }, { status: 404 })
  return NextResponse.json({ success: true, ...tablero })
}
