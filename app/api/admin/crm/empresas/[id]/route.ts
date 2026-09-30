import { NextRequest, NextResponse } from 'next/server'
import { SegmentoCrm } from '@prisma/client'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { parseEmpresaFields } from '@/lib/crm-empresas'

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en empresas CRM.' }, { status: auth.status })
  if (Number(request.headers.get('content-length') || 0) > 16000) return NextResponse.json({ error: 'Formulario demasiado grande.' }, { status: 413 })
  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  const { version, confirmarCambioTipo, ...raw } = body as Record<string, unknown>
  if (!Number.isInteger(version) || Number(version) < 0) return NextResponse.json({ error: 'Versión no válida. Recarga la ficha.' }, { status: 400 })
  let fields: ReturnType<typeof parseEmpresaFields>
  try { fields = parseEmpresaFields(raw, true) } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }) }
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'No hay campos modificados.' }, { status: 400 })
  try {
    const result = await prisma.$transaction(async (tx) => {
      // El mismo bloqueo se utiliza para crear y editar empresas con este NIF.
      if (fields.nifNormalizado) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${fields.nifNormalizado}))`
        const duplicate = await tx.crmEmpresa.findFirst({ where: { id: { not: id }, activo: true, nifNormalizado: fields.nifNormalizado }, select: { id: true } })
        if (duplicate) return { error: 'Ya existe otra empresa activa con este CIF/NIF. Revísala antes de continuar.', status: 409 }
      }
      const locked = await tx.$queryRaw<Array<{ id: string; tipo: string; version: number }>>`SELECT id, tipo, version FROM crm_empresas WHERE id = ${id} AND activo = true FOR UPDATE`
      if (!locked.length) return { error: 'Empresa no encontrada.', status: 404 }
      const previous = locked[0]
      if (previous.version !== version) return { error: 'La empresa se modificó en otra sesión. Recarga antes de guardar.', status: 409 }
      if (fields.tipo === 'AUTONOMO' && previous.tipo !== 'AUTONOMO') {
        const titular = await tx.crmEmpresaContacto.count({ where: { empresaId: id, activo: true, papel: 'TITULAR' } })
        if (!titular) return { error: 'Asocia primero a la persona titular antes de convertir esta cuenta en autónomo.', status: 409 }
      }
      const leavingSelfEmployed = previous.tipo === 'AUTONOMO' && fields.tipo && fields.tipo !== 'AUTONOMO'
      if (leavingSelfEmployed && confirmarCambioTipo !== true) return { error: 'Confirma la conversión: el titular pasará a figurar como representante.', status: 409 }
      const updated = await tx.crmEmpresa.updateMany({ where: { id, version: Number(version) }, data: { ...fields, ...(fields.segmentoCrm ? { segmentoCrm: fields.segmentoCrm as SegmentoCrm } : {}), version: { increment: 1 }, actualizadoPor: auth.user!.name } })
      if (!updated.count) return { error: 'La empresa se modificó en otra sesión. Recarga antes de guardar.', status: 409 }
      if (leavingSelfEmployed) await tx.crmEmpresaContacto.updateMany({ where: { empresaId: id, activo: true, papel: 'TITULAR' }, data: { papel: 'REPRESENTANTE', origen: 'LOCAL' } })
      return { success: true, version: Number(version) + 1 }
    })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (error) {
    console.error('[CRM-EMPRESAS] No se pudo guardar la empresa:', error)
    return NextResponse.json({ error: 'No se pudo guardar la empresa. Vuelve a cargar la ficha.' }, { status: 500 })
  }
}
