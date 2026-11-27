import { NextRequest, NextResponse } from 'next/server'
import { SegmentoCrm, Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas } from '@/lib/crm-empresas-auth'
import { parseEmpresaFields } from '@/lib/crm-empresas'
import { registrarActividadEmpresa } from '@/lib/crm-empresa-actividad'
import { bloqueoActuacion } from '@/lib/area1-m365'
import { acquireIspOrigenFenceTx, readIspEmpresaOwnership } from '@/lib/isp-origen-server'
import { verificarPermisoServer } from '@/lib/permisos'
import { leerIdentidadIspEmpresa, identidadIspNoVerificable, camposPanelSinIdentidadIsp } from '@/lib/area1-isp-identidad'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return registrarActividadEmpresa(request, context)
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCrmEmpresas(false)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de lectura en empresas CRM.' }, { status: auth.status })
  const { id } = await context.params
  const company = await prisma.crmEmpresa.findFirst({ where: { id, activo: true }, select: {
    id: true, nombre: true, nif: true, nombreComercial: true, tipo: true, segmentoCrm: true, sector: true, descripcion: true, version: true,
  } })
  if (!company) return NextResponse.json({ error: 'Empresa no encontrada.' }, { status: 404 })
  const crm = { nombre: company.nombre, nif: company.nif }
  const identidadIsp = await leerIdentidadIspEmpresa(prisma, company.id, crm).then(l => l.identidad).catch(() => identidadIspNoVerificable(crm))
  return NextResponse.json({ ...company, nombre: identidadIsp.nombre, nif: identidadIsp.nif, identidadIsp }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  const acting = bloqueoActuacion(session)
  if (acting) return NextResponse.json({ error: acting }, { status: 403 })
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso de escritura en empresas CRM.' }, { status: auth.status })
  if (auth.user.id !== Number(session.user.id)) return NextResponse.json({ error: 'La sesión ha cambiado. Recarga la ficha.' }, { status: 401 })
  if (process.env.IO_PRODUCTION_READ_ONLY === '1' || process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1') return NextResponse.json({ error: 'La aplicación está en modo de solo lectura.' }, { status: 403 })
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
      await acquireIspOrigenFenceTx(tx)
      const actor = await tx.usuarioAdmin.findUnique({ where: { id: auth.user!.id }, select: { activo: true, rol: true } })
      if (!actor?.activo || !(await verificarPermisoServer(auth.user!.id, 'admin.crm.empresas', actor.rol, tx)).escritura) return { error: 'No tienes permiso de escritura en empresas CRM.', status: 403 }
      const locked = await tx.$queryRaw<Array<{ id: string; tipo: string; version: number; nombre: string; nif: string | null; nifNormalizado: string | null }>>`SELECT id, tipo, version, nombre, nif, nif_normalizado AS "nifNormalizado" FROM crm_empresas WHERE id = ${id} AND activo = true FOR UPDATE`
      if (!locked.length) return { error: 'Empresa no encontrada.', status: 404 }
      const previous = locked[0]
      if (previous.version !== version) return { error: 'La empresa se modificó en otra sesión. Recarga antes de guardar.', status: 409 }
      // El resolvedor compartido lee el grafo vivo en ESTA callback tx. Flags/origen/version del body no acreditan fuente.
      const ownership = await readIspEmpresaOwnership(tx, id)
      camposPanelSinIdentidadIsp(raw, previous, ownership.linked)
      const panelFields = { ...fields }
      // Raw igual ya probado: no se escribe ni se rederiva nifNormalizado de un dato histórico discrepante.
      if (ownership.linked) for (const key of ['nombre', 'nif', 'nifNormalizado']) delete panelFields[key]
      if (Object.keys(panelFields).length === 0) return { success: true, version: Number(version) }
      // Sólo identidad local no protegida llega a la comprobación de duplicados.
      if (panelFields.nifNormalizado) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${panelFields.nifNormalizado}))`
        const duplicate = await tx.crmEmpresa.findFirst({ where: { id: { not: id }, activo: true, nifNormalizado: panelFields.nifNormalizado }, select: { id: true } })
        if (duplicate) return { error: 'Ya existe otra empresa activa con este CIF/NIF. Revísala antes de continuar.', status: 409 }
      }
      if (panelFields.tipo === 'AUTONOMO' && previous.tipo !== 'AUTONOMO') {
        const titular = await tx.crmEmpresaContacto.count({ where: { empresaId: id, activo: true, papel: 'TITULAR' } })
        if (!titular) return { error: 'Asocia primero a la persona titular antes de convertir esta cuenta en autónomo.', status: 409 }
      }
      const leavingSelfEmployed = previous.tipo === 'AUTONOMO' && panelFields.tipo && panelFields.tipo !== 'AUTONOMO'
      if (leavingSelfEmployed && confirmarCambioTipo !== true) return { error: 'Confirma la conversión: el titular pasará a figurar como representante.', status: 409 }
      const updated = await tx.crmEmpresa.updateMany({ where: { id, version: Number(version) }, data: { ...panelFields, ...(panelFields.segmentoCrm ? { segmentoCrm: panelFields.segmentoCrm as SegmentoCrm } : {}), version: { increment: 1 }, actualizadoPor: auth.user!.name } })
      if (!updated.count) throw new Error('CRM_VERSION_CONFLICT')
      if (leavingSelfEmployed) await tx.crmEmpresaContacto.updateMany({ where: { empresaId: id, activo: true, papel: 'TITULAR' }, data: { papel: 'REPRESENTANTE', origen: 'LOCAL' } })
      return { success: true, version: Number(version) + 1 }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'ISP_ORIGEN_NO_EDITABLE') return NextResponse.json({ error: 'La identidad de origen ISP no se puede editar desde el CRM.', code }, { status: 409 })
    if (error instanceof Error && error.message === 'CRM_VERSION_CONFLICT') return NextResponse.json({ error: 'La empresa se modificó en otra sesión. Recarga antes de guardar.' }, { status: 409 })
    // Sin payload ni datos personales en error/log de esta operación.
    console.error('[CRM-EMPRESAS] No se pudo guardar la empresa.')
    return NextResponse.json({ error: 'No se pudo guardar la empresa. Vuelve a cargar la ficha.' }, { status: 500 })
  }
}
