import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'

async function mutate(request: NextRequest, context: { params: Promise<{ id: string }> }, unlink: boolean) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en empresas.' }, { status: auth.status })
  if (!await canAccessCrmRelated(auth.user, 'admin.clientes')) return NextResponse.json({ error: 'Necesitas acceso a Clientes para vincular una cuenta ISPgestion.' }, { status: 403 })
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const clientId = Number(body?.clienteId)
  if (!Number.isInteger(clientId) || clientId < 1) return NextResponse.json({ error: 'Cliente no válido.' }, { status: 400 })
  const [company, customer, linked] = await Promise.all([
    prisma.crmEmpresa.findFirst({ where: { id, activo: true }, select: { id: true } }),
    prisma.clienteWeb.findUnique({ where: { id: clientId }, select: { id: true } }),
    prisma.crmEmpresaCliente.findUnique({ where: { clienteId: clientId }, select: { empresaId: true } }),
  ])
  if (!company || !customer) return NextResponse.json({ error: 'Empresa o cliente no encontrado.' }, { status: 404 })
  if (unlink) {
    if (linked?.empresaId !== id) return NextResponse.json({ error: 'Este cliente no está vinculado a esta empresa.' }, { status: 404 })
    await prisma.crmEmpresaCliente.delete({ where: { clienteId: clientId } })
    return NextResponse.json({ success: true })
  }
  if (linked && linked.empresaId !== id) return NextResponse.json({ error: 'Este cliente ya está asociado a otra empresa. Revísalo antes de vincularlo.', existingId: linked.empresaId }, { status: 409 })
  try {
    await prisma.crmEmpresaCliente.upsert({ where: { clienteId: clientId }, create: { empresaId: id, clienteId: clientId }, update: {} })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[CRM-EMPRESAS] Error vinculando cliente:', error)
    return NextResponse.json({ error: 'No se pudo vincular esta cuenta de cliente.' }, { status: 409 })
  }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, false) }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, true) }
