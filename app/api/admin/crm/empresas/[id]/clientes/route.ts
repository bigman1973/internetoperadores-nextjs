import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { persistedClienteOrigin } from '@/lib/isp-origen-policy'
import { acquireIspOrigenFenceTx } from '@/lib/isp-origen-server'

async function mutate(request: NextRequest, context: { params: Promise<{ id: string }> }, unlink: boolean) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en empresas.' }, { status: auth.status })
  if (!await canAccessCrmRelated(auth.user, 'admin.clientes')) return NextResponse.json({ error: 'Necesitas acceso a Clientes para vincular una cuenta ISPgestion.' }, { status: 403 })
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  const clientId = Number(body?.clienteId)
  if (!body || Object.keys(body).some(key => key !== 'clienteId') || !Number.isSafeInteger(clientId) || clientId < 1) return NextResponse.json({ error: 'Cliente no válido.' }, { status: 400 })
  try {
    await prisma.$transaction(async (tx) => {
      await acquireIspOrigenFenceTx(tx)
      const [company, customer, linked] = await Promise.all([
        tx.crmEmpresa.findFirst({ where: { id, activo: true }, select: { id: true } }),
        tx.clienteWeb.findUnique({ where: { id: clientId } }),
        tx.crmEmpresaCliente.findUnique({ where: { clienteId: clientId }, select: { empresaId: true } }),
      ])
      if (!company || !customer) throw Object.assign(new Error('NOT_FOUND'), { status: 404 })
      if (unlink) {
        if (linked?.empresaId !== id) throw Object.assign(new Error('NOT_FOUND'), { status: 404 })
        const evidence = await tx.ispClienteArea1.findFirst({ where: { OR: [{ clienteWebId: clientId }, { ispClienteId: customer.ispGestionId }] }, select: { id: true } })
        if (persistedClienteOrigin(customer, Boolean(evidence)) !== 'manual') {
          const [direct, confirmed, others] = await Promise.all([
            tx.ispClienteArea1.findFirst({ where: { crmEmpresaId: id }, select: { id: true } }),
            tx.ispVinculoArea1.findFirst({ where: { tipo: { in: ['CRM_EMPRESA', 'CREAR_EMPRESA'] }, destinoId: id, estado: 'CONFIRMADO' }, select: { id: true } }),
            tx.crmEmpresaCliente.findMany({ where: { empresaId: id, clienteId: { not: clientId } }, select: { cliente: { select: { id: true, ispGestionId: true, clienteIdIsp: true } } } }),
          ])
          let remaining = Boolean(direct || confirmed)
          for (const link of others) {
            const source = await tx.ispClienteArea1.findFirst({ where: { clienteWebId: link.cliente.id }, select: { id: true } })
            if (persistedClienteOrigin(link.cliente, Boolean(source)) !== 'manual') remaining = true
          }
          if (!remaining) throw Object.assign(new Error('ISP_ORIGEN_NO_EDITABLE'), { code: 'ISP_ORIGEN_NO_EDITABLE', status: 409 })
        }
        await tx.crmEmpresaCliente.delete({ where: { empresaId_clienteId: { empresaId: id, clienteId: clientId } } })
      } else {
        if (linked && linked.empresaId !== id) throw Object.assign(new Error('LINK_CONFLICT'), { status: 409 })
        if (!linked) await tx.crmEmpresaCliente.create({ data: { empresaId: id, clienteId: clientId } })
        const final = await tx.crmEmpresaCliente.findUnique({ where: { clienteId: clientId }, select: { empresaId: true } })
        if (final?.empresaId !== id) throw Object.assign(new Error('LINK_CONFLICT'), { status: 409 })
      }
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.code === 'ISP_ORIGEN_NO_EDITABLE') return NextResponse.json({ error: 'No se puede retirar la última evidencia de origen ISP.', code: error.code }, { status: 409 })
    return NextResponse.json({ error: error?.status === 404 ? 'Empresa, cliente o vínculo no encontrado.' : 'No se pudo modificar esta asociación.' }, { status: error?.status === 404 ? 404 : 409 })
  }
}
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, false) }
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { return mutate(request, context, true) }
