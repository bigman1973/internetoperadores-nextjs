import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { appendArea4Audit } from '@/lib/area4/audit'
import { evaluateArea4Capability, isArea4Owner } from '@/lib/area4/policy'
import { normalizeArea4Grants, requireArea4Owner, requireLiveArea4Admin } from '@/lib/area4/live-admin'

export const dynamic = 'force-dynamic'

type PermisoPayload = {
  areaId?: string
  areaCodigo?: string
  lectura?: boolean
  escritura?: boolean
  confirmar?: boolean
  exportar?: boolean
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function normalizarPermiso(input: PermisoPayload) {
  const escritura = input.escritura === true
  const confirmar = input.confirmar === true
  const exportar = input.exportar === true
  return {
    lectura: input.lectura === true || escritura || confirmar || exportar,
    escritura,
    confirmar,
    exportar,
  }
}

function permisosAuditables(permisos: readonly { area: { codigo: string }; lectura: boolean; escritura: boolean; confirmar: boolean; exportar: boolean }[]) {
  return permisos.map(permiso => ({
    areaCodigo: permiso.area.codigo,
    lectura: permiso.lectura,
    escritura: permiso.escritura,
    confirmar: permiso.confirmar,
    exportar: permiso.exportar,
  })).sort((a, b) => a.areaCodigo.localeCompare(b.areaCodigo))
}

async function requireOwner() {
  return requireArea4Owner(prisma)
}

// GET: el actor puede leer únicamente su foto ACL; la administración completa
// de áreas, perfiles o permisos de terceros es exclusiva del propietario canónico.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'areas'
  const requestedUserId = positiveInteger(searchParams.get('usuarioId'))

  const live = await requireLiveArea4Admin(prisma)
  if (live.ok === false) return live.response
  const owner = isArea4Owner(live.principal)
  const checkUserId = positiveInteger(searchParams.get('uid')) || live.principal.id
  const selfPermissionRead = (action === 'usuario' && requestedUserId === live.principal.id)
    || (action === 'verificar' && checkUserId === live.principal.id)
  if (!owner && !selfPermissionRead) return NextResponse.json({ error: 'Solo Víctor puede consultar accesos de terceros' }, { status: 403 })

  if (action === 'usuario' && requestedUserId) {
    const permisos = await prisma.permisoUsuario.findMany({
      where: { usuarioId: requestedUserId, area: { activo: true } },
      include: { area: true },
      orderBy: { area: { codigo: 'asc' } },
    })
    return NextResponse.json({ permisos })
  }

  if (action === 'verificar') {
    const codigo = searchParams.get('codigo')
    if (!codigo) return NextResponse.json({ error: 'codigo requerido' }, { status: 400 })
    if (!owner && checkUserId !== live.principal.id) return NextResponse.json({ error: 'Solo Víctor puede consultar accesos de terceros' }, { status: 403 })
    const [target, area, rows] = await Promise.all([
      prisma.usuarioAdmin.findUnique({ where: { id: checkUserId }, select: { id: true, activo: true, rol: true, roles: true } }),
      prisma.permisoArea.findUnique({ where: { codigo }, select: { activo: true } }),
      prisma.permisoUsuario.findMany({
        where: { usuarioId: checkUserId, area: { activo: true } },
        select: { lectura: true, escritura: true, confirmar: true, exportar: true, area: { select: { codigo: true } } },
      }),
    ])
    if (!target?.activo || !area?.activo) return NextResponse.json({ lectura: false, escritura: false, confirmar: false, exportar: false })
    const grants = normalizeArea4Grants(rows)
    return NextResponse.json(Object.fromEntries(
      ['lectura', 'escritura', 'confirmar', 'exportar'].map(capability => [capability, evaluateArea4Capability({
        principal: target, grants, codigoArea: codigo, capability: capability as 'lectura' | 'escritura' | 'confirmar' | 'exportar',
      })]),
    ))
  }

  if (!owner) return NextResponse.json({ error: 'Solo Víctor puede consultar este recurso' }, { status: 403 })

  if (action === 'areas') {
    const areas = await prisma.permisoArea.findMany({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
    })
    return NextResponse.json({ areas })
  }

  if (action === 'todos') {
    const usuarios = await prisma.usuarioAdmin.findMany({
      select: {
        id: true, email: true, nombre: true, rol: true, roles: true,
        permisos: { include: { area: true } },
      },
      orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ usuarios })
  }

  if (action === 'perfiles') {
    const perfiles = await prisma.perfilPermisos.findMany({
      where: { activo: true }, orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ perfiles })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}

// POST: todos los cambios de catálogo, perfiles o grants son de Víctor, se
// realizan en transacción y escriben un evento append-only en la misma operación.
export async function POST(request: Request) {
  const auth = await requireOwner()
  if (auth.ok === false) return auth.response
  const actorId = auth.principal.id
  const origin = new URL(request.url).pathname

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 })
  }

  const action = String(body.action || '')

  if (action === 'asignar') {
    const usuarioId = positiveInteger(body.usuarioId)
    const areaId = typeof body.areaId === 'string' ? body.areaId : null
    if (!usuarioId || !areaId) return NextResponse.json({ error: 'usuarioId y areaId requeridos' }, { status: 400 })
    const values = normalizarPermiso(body as PermisoPayload)

    try {
      const permiso = await prisma.$transaction(async tx => {
        const [usuario, area, anterior] = await Promise.all([
          tx.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { id: true } }),
          tx.permisoArea.findFirst({ where: { id: areaId, activo: true }, select: { id: true, codigo: true } }),
          tx.permisoUsuario.findUnique({ where: { usuarioId_areaId: { usuarioId, areaId } }, include: { area: { select: { codigo: true } } } }),
        ])
        if (!usuario || !area) throw new Error('AREA_OR_USER_NOT_FOUND')
        const next = await tx.permisoUsuario.upsert({
          where: { usuarioId_areaId: { usuarioId, areaId } },
          update: values,
          create: { usuarioId, areaId, ...values },
          include: { area: { select: { codigo: true } } },
        })
        await tx.usuarioAdmin.update({ where: { id: usuarioId }, data: { permisosArea4Vivos: true } })
        await appendArea4Audit(tx, {
          actorId, objetivoUsuarioId: usuarioId, operacion: 'PERMISO_CAMBIO', areaCodigo: area.codigo,
          antes: anterior ? permisosAuditables([anterior])[0] : null,
          despues: permisosAuditables([next])[0], origen: origin,
        })
        return next
      })
      return NextResponse.json({ ok: true, permiso })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error && error.message === 'AREA_OR_USER_NOT_FOUND' ? 'Usuario o área no encontrados' : 'No se pudo guardar el permiso' }, { status: 400 })
    }
  }

  if (action === 'asignar_masivo') {
    const usuarioId = positiveInteger(body.usuarioId)
    const payload = Array.isArray(body.permisos) ? body.permisos as PermisoPayload[] : null
    if (!usuarioId || !payload) return NextResponse.json({ error: 'usuarioId y permisos[] requeridos' }, { status: 400 })

    try {
      const result = await prisma.$transaction(async tx => {
        const [usuario, areas, antes] = await Promise.all([
          tx.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { id: true } }),
          tx.permisoArea.findMany({ where: { id: { in: payload.map(item => item.areaId).filter((id): id is string => typeof id === 'string') }, activo: true }, select: { id: true, codigo: true } }),
          tx.permisoUsuario.findMany({ where: { usuarioId }, include: { area: { select: { codigo: true } } } }),
        ])
        if (!usuario || areas.length !== payload.length) throw new Error('AREAS_INVALIDAS')
        const byId = new Map(areas.map(area => [area.id, area]))
        const creates = payload.map(item => {
          const areaId = item.areaId as string
          if (!byId.has(areaId)) throw new Error('AREAS_INVALIDAS')
          return { usuarioId, areaId, ...normalizarPermiso(item) }
        }).filter(item => item.lectura || item.escritura || item.confirmar || item.exportar)
        await tx.permisoUsuario.deleteMany({ where: { usuarioId } })
        if (creates.length) await tx.permisoUsuario.createMany({ data: creates })
        await tx.usuarioAdmin.update({ where: { id: usuarioId }, data: { permisosArea4Vivos: true } })
        const despues = await tx.permisoUsuario.findMany({ where: { usuarioId }, include: { area: { select: { codigo: true } } } })
        await appendArea4Audit(tx, {
          actorId, objetivoUsuarioId: usuarioId, operacion: 'PERMISO_CAMBIO',
          antes: permisosAuditables(antes), despues: permisosAuditables(despues), origen: origin,
        })
        return { count: creates.length }
      })
      return NextResponse.json({ ok: true, ...result })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error && error.message === 'AREAS_INVALIDAS' ? 'El conjunto de áreas no es válido' : 'No se pudieron guardar los permisos' }, { status: 400 })
    }
  }

  if (action === 'revocar') {
    const usuarioId = positiveInteger(body.usuarioId)
    const areaId = typeof body.areaId === 'string' ? body.areaId : null
    if (!usuarioId || !areaId) return NextResponse.json({ error: 'usuarioId y areaId requeridos' }, { status: 400 })
    await prisma.$transaction(async tx => {
      const anterior = await tx.permisoUsuario.findUnique({ where: { usuarioId_areaId: { usuarioId, areaId } }, include: { area: { select: { codigo: true } } } })
      if (!anterior) return
      await tx.permisoUsuario.delete({ where: { usuarioId_areaId: { usuarioId, areaId } } })
      await tx.usuarioAdmin.update({ where: { id: usuarioId }, data: { permisosArea4Vivos: true } })
      await appendArea4Audit(tx, {
        actorId, objetivoUsuarioId: usuarioId, operacion: 'PERMISO_CAMBIO', areaCodigo: anterior.area.codigo,
        antes: permisosAuditables([anterior])[0], despues: null, origen: origin,
      })
    })
    return NextResponse.json({ ok: true })
  }

  if (action === 'guardar_perfil') {
    const id = typeof body.id === 'string' ? body.id : null
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    const descripcion = typeof body.descripcion === 'string' ? body.descripcion.trim() : null
    const color = typeof body.color === 'string' ? body.color : '#FF5300'
    const perfilPermisos = Array.isArray(body.permisos) ? body.permisos as PermisoPayload[] : null
    if (!nombre || !perfilPermisos) return NextResponse.json({ error: 'nombre y permisos[] requeridos' }, { status: 400 })
    const codigos = perfilPermisos.map(item => item.areaCodigo).filter((code): code is string => typeof code === 'string')
    const areas = await prisma.permisoArea.findMany({ where: { codigo: { in: codigos }, activo: true }, select: { codigo: true } })
    if (new Set(codigos).size !== perfilPermisos.length || areas.length !== new Set(codigos).size) return NextResponse.json({ error: 'El perfil contiene áreas no registradas' }, { status: 400 })
    const permisos = perfilPermisos.map(item => ({ areaCodigo: item.areaCodigo!, ...normalizarPermiso(item) }))
    const perfil = await prisma.$transaction(async tx => {
      const anterior = id ? await tx.perfilPermisos.findUnique({ where: { id } }) : null
      const result = id
        ? await tx.perfilPermisos.update({ where: { id }, data: { nombre, descripcion, color, permisos } })
        : await tx.perfilPermisos.create({ data: { nombre, descripcion, color, permisos } })
      await appendArea4Audit(tx, {
        actorId, operacion: 'PERFIL_CAMBIO',
        antes: anterior ? { id: anterior.id, nombre: anterior.nombre, activo: anterior.activo } : null,
        despues: { id: result.id, nombre: result.nombre, permisos: permisos.length, activo: result.activo }, origen: origin,
      })
      return result
    })
    return NextResponse.json({ ok: true, perfil })
  }

  if (action === 'eliminar_perfil') {
    const id = typeof body.id === 'string' ? body.id : null
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const perfil = await prisma.$transaction(async tx => {
      const anterior = await tx.perfilPermisos.findUnique({ where: { id } })
      if (!anterior) throw new Error('NOT_FOUND')
      const result = await tx.perfilPermisos.update({ where: { id }, data: { activo: false } })
      await appendArea4Audit(tx, {
        actorId, operacion: 'PERFIL_CAMBIO',
        antes: { id: anterior.id, nombre: anterior.nombre, activo: anterior.activo },
        despues: { id: result.id, nombre: result.nombre, activo: result.activo }, origen: origin,
      })
      return result
    }).catch(() => null)
    return perfil ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })
  }

  if (action === 'aplicar_perfil') {
    const usuarioId = positiveInteger(body.usuarioId)
    const perfilId = typeof body.perfilId === 'string' ? body.perfilId : null
    if (!usuarioId || !perfilId) return NextResponse.json({ error: 'usuarioId y perfilId requeridos' }, { status: 400 })
    try {
      const result = await prisma.$transaction(async tx => {
        const [usuario, perfil, antes] = await Promise.all([
          tx.usuarioAdmin.findUnique({ where: { id: usuarioId }, select: { id: true } }),
          tx.perfilPermisos.findFirst({ where: { id: perfilId, activo: true } }),
          tx.permisoUsuario.findMany({ where: { usuarioId }, include: { area: { select: { codigo: true } } } }),
        ])
        if (!usuario || !perfil) throw new Error('NOT_FOUND')
        const requested = perfil.permisos as unknown as Array<{ areaCodigo: string; lectura?: boolean; escritura?: boolean; confirmar?: boolean; exportar?: boolean }>
        const codigos = requested.map(item => item.areaCodigo)
        const areas = await tx.permisoArea.findMany({ where: { codigo: { in: codigos }, activo: true }, select: { id: true, codigo: true } })
        if (areas.length !== new Set(codigos).size) throw new Error('AREAS_INVALIDAS')
        const areaByCode = new Map(areas.map(area => [area.codigo, area.id]))
        const creates = requested.map(item => ({ usuarioId, areaId: areaByCode.get(item.areaCodigo)!, ...normalizarPermiso(item) }))
          .filter(item => item.lectura || item.escritura || item.confirmar || item.exportar)
        await tx.permisoUsuario.deleteMany({ where: { usuarioId } })
        if (creates.length) await tx.permisoUsuario.createMany({ data: creates })
        await tx.usuarioAdmin.update({ where: { id: usuarioId }, data: { perfilAsignado: perfil.nombre, permisosArea4Vivos: true } })
        const despues = await tx.permisoUsuario.findMany({ where: { usuarioId }, include: { area: { select: { codigo: true } } } })
        await appendArea4Audit(tx, {
          actorId, objetivoUsuarioId: usuarioId, operacion: 'PERFIL_APLICADO',
          antes: permisosAuditables(antes), despues: { perfil: perfil.nombre, permisos: permisosAuditables(despues) }, origen: origin,
        })
        return { count: creates.length, perfil: perfil.nombre }
      })
      return NextResponse.json({ ok: true, ...result })
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      return NextResponse.json({ error: message === 'NOT_FOUND' ? 'Usuario o perfil no encontrado' : message === 'AREAS_INVALIDAS' ? 'El perfil contiene áreas no registradas' : 'No se pudo aplicar el perfil' }, { status: 400 })
    }
  }

  if (action === 'registrar_area' || action === 'auto_registrar') {
    return NextResponse.json({ error: 'El catálogo de permisos se actualiza mediante migración revisada, no desde el navegador.' }, { status: 409 })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}
