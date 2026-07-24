import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// GET: Listar áreas de permisos y/o permisos de un usuario
export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'areas'
  const usuarioId = searchParams.get('usuarioId')

  // Listar todas las áreas
  if (action === 'areas') {
    const areas = await prisma.permisoArea.findMany({
      where: { activo: true },
      orderBy: [{ orden: 'asc' }, { codigo: 'asc' }],
    })
    return NextResponse.json({ areas })
  }

  // Obtener permisos de un usuario específico
  if (action === 'usuario' && usuarioId) {
    const permisos = await prisma.permisoUsuario.findMany({
      where: { usuarioId: parseInt(usuarioId) },
      include: { area: true },
    })
    return NextResponse.json({ permisos })
  }

  // Verificar permiso de un usuario en un área específica
  if (action === 'verificar') {
    const codigo = searchParams.get('codigo')
    const uid = searchParams.get('uid') || (session.user as any).id

    if (!codigo) return NextResponse.json({ error: 'codigo requerido' }, { status: 400 })

    const resultado = await verificarPermiso(parseInt(uid), codigo)
    return NextResponse.json(resultado)
  }

  // Obtener todos los usuarios con sus permisos (para panel admin)
  if (action === 'todos') {
    const usuarios = await prisma.usuarioAdmin.findMany({
      where: { activo: true },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        permisos: {
          include: { area: true },
        },
      },
      orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ usuarios })
  }

  // Listar perfiles de permisos
  if (action === 'perfiles') {
    const perfiles = await prisma.perfilPermisos.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    })
    return NextResponse.json({ perfiles })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}

// POST: Crear/actualizar permisos
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // Solo SUPER_ADMIN y GERENTE pueden gestionar permisos
  const user = session.user as any
  if (!['SUPER_ADMIN', 'GERENTE'].includes(user.role)) {
    return NextResponse.json({ error: 'Sin permisos para gestionar accesos' }, { status: 403 })
  }

  const body = await request.json()
  const { action } = body

  // Asignar/actualizar permiso a un usuario
  if (action === 'asignar') {
    const { usuarioId, areaId, lectura, escritura } = body

    if (!usuarioId || !areaId) {
      return NextResponse.json({ error: 'usuarioId y areaId requeridos' }, { status: 400 })
    }

    const permiso = await prisma.permisoUsuario.upsert({
      where: {
        usuarioId_areaId: { usuarioId: parseInt(usuarioId), areaId },
      },
      update: {
        lectura: lectura ?? false,
        escritura: escritura ?? false,
      },
      create: {
        usuarioId: parseInt(usuarioId),
        areaId,
        lectura: lectura ?? false,
        escritura: escritura ?? false,
      },
    })

    return NextResponse.json({ ok: true, permiso })
  }

  // Asignar permisos masivos (para un usuario, múltiples áreas)
  if (action === 'asignar_masivo') {
    const { usuarioId, permisos } = body
    // permisos: [{ areaId, lectura, escritura }]

    if (!usuarioId || !Array.isArray(permisos)) {
      return NextResponse.json({ error: 'usuarioId y permisos[] requeridos' }, { status: 400 })
    }

    const results = await Promise.all(
      permisos.map((p: any) =>
        prisma.permisoUsuario.upsert({
          where: {
            usuarioId_areaId: { usuarioId: parseInt(usuarioId), areaId: p.areaId },
          },
          update: {
            lectura: p.lectura ?? false,
            escritura: p.escritura ?? false,
          },
          create: {
            usuarioId: parseInt(usuarioId),
            areaId: p.areaId,
            lectura: p.lectura ?? false,
            escritura: p.escritura ?? false,
          },
        })
      )
    )

    return NextResponse.json({ ok: true, count: results.length })
  }

  // Revocar permiso
  if (action === 'revocar') {
    const { usuarioId, areaId } = body

    if (!usuarioId || !areaId) {
      return NextResponse.json({ error: 'usuarioId y areaId requeridos' }, { status: 400 })
    }

    await prisma.permisoUsuario.deleteMany({
      where: { usuarioId: parseInt(usuarioId), areaId },
    })

    return NextResponse.json({ ok: true })
  }

  // Registrar nueva área (auto-registro)
  if (action === 'registrar_area') {
    const { codigo, nombre, descripcion, padre } = body

    if (!codigo || !nombre) {
      return NextResponse.json({ error: 'codigo y nombre requeridos' }, { status: 400 })
    }

    const area = await prisma.permisoArea.upsert({
      where: { codigo },
      update: { nombre, descripcion, padre },
      create: { codigo, nombre, descripcion, padre, activo: true },
    })

    return NextResponse.json({ ok: true, area })
  }

  // Crear/actualizar perfil de permisos
  if (action === 'guardar_perfil') {
    const { id, nombre, descripcion, color, permisos: perfilPermisos } = body

    if (!nombre || !Array.isArray(perfilPermisos)) {
      return NextResponse.json({ error: 'nombre y permisos[] requeridos' }, { status: 400 })
    }

    let perfil
    if (id) {
      perfil = await prisma.perfilPermisos.update({
        where: { id },
        data: { nombre, descripcion, color, permisos: perfilPermisos },
      })
    } else {
      perfil = await prisma.perfilPermisos.create({
        data: { nombre, descripcion, color, permisos: perfilPermisos },
      })
    }

    return NextResponse.json({ ok: true, perfil })
  }

  // Eliminar perfil
  if (action === 'eliminar_perfil') {
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    await prisma.perfilPermisos.update({
      where: { id },
      data: { activo: false },
    })

    return NextResponse.json({ ok: true })
  }

  // Aplicar perfil a un usuario (copia los permisos del perfil al usuario)
  if (action === 'aplicar_perfil') {
    const { usuarioId, perfilId } = body

    if (!usuarioId || !perfilId) {
      return NextResponse.json({ error: 'usuarioId y perfilId requeridos' }, { status: 400 })
    }

    // Obtener perfil
    const perfil = await prisma.perfilPermisos.findUnique({ where: { id: perfilId } })
    if (!perfil) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 })

    const perfilPerms = perfil.permisos as Array<{ areaCodigo: string; lectura: boolean; escritura: boolean }>

    // Obtener las áreas por código
    const codigos = perfilPerms.map(p => p.areaCodigo)
    const areas = await prisma.permisoArea.findMany({
      where: { codigo: { in: codigos } },
    })
    const areaMap = new Map(areas.map(a => [a.codigo, a.id]))

    // Borrar permisos actuales del usuario
    await prisma.permisoUsuario.deleteMany({
      where: { usuarioId: parseInt(usuarioId) },
    })

    // Crear permisos del perfil
    const creates = perfilPerms
      .filter(p => areaMap.has(p.areaCodigo) && (p.lectura || p.escritura))
      .map(p => ({
        usuarioId: parseInt(usuarioId),
        areaId: areaMap.get(p.areaCodigo)!,
        lectura: p.lectura,
        escritura: p.escritura,
      }))

    if (creates.length > 0) {
      await prisma.permisoUsuario.createMany({ data: creates })
    }

    return NextResponse.json({ ok: true, count: creates.length })
  }

  // Auto-registrar área desde ProtectedRoute (solo SUPER_ADMIN puede auto-registrar)
  if (action === 'auto_registrar') {
    const { codigo, pathname: routePath } = body

    if (!codigo) {
      return NextResponse.json({ error: 'codigo requerido' }, { status: 400 })
    }

    // Verificar si ya existe
    const existing = await prisma.permisoArea.findUnique({ where: { codigo } })
    if (existing) {
      return NextResponse.json({ ok: true, existed: true })
    }

    // Generar nombre legible a partir del código
    const parts = codigo.replace('admin.', '').split('.')
    const nombre = parts.map((p: string) => 
      p.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    ).join(' > ')

    // Determinar padre
    const parentParts = codigo.split('.')
    parentParts.pop()
    const padre = parentParts.length > 0 ? parentParts.join('.') : null

    await prisma.permisoArea.create({
      data: {
        codigo,
        nombre,
        padre,
        activo: true,
      },
    })

    return NextResponse.json({ ok: true, created: true })
  }

  return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
}

// Función de verificación de permisos con herencia
export async function verificarPermiso(
  usuarioId: number,
  codigoArea: string
): Promise<{ lectura: boolean; escritura: boolean }> {
  // Obtener el usuario para verificar rol
  const usuario = await prisma.usuarioAdmin.findUnique({
    where: { id: usuarioId },
    select: { rol: true },
  })

  // SUPER_ADMIN siempre tiene acceso total
  if (usuario?.rol === 'SUPER_ADMIN') {
    return { lectura: true, escritura: true }
  }

  // GERENTE tiene acceso total de lectura, escritura según permisos
  if (usuario?.rol === 'GERENTE') {
    return { lectura: true, escritura: true }
  }

  // Buscar permisos directos y heredados (de padre a hijo)
  // Construir la cadena de códigos: admin.ggcc.draxton.contratos → [admin, admin.ggcc, admin.ggcc.draxton, admin.ggcc.draxton.contratos]
  const partes = codigoArea.split('.')
  const codigosHerencia: string[] = []
  for (let i = 1; i <= partes.length; i++) {
    codigosHerencia.push(partes.slice(0, i).join('.'))
  }

  // Buscar permisos del usuario en cualquiera de los niveles de herencia
  const permisos = await prisma.permisoUsuario.findMany({
    where: {
      usuarioId,
      area: {
        codigo: { in: codigosHerencia },
      },
    },
    include: { area: true },
  })

  if (permisos.length === 0) {
    return { lectura: false, escritura: false }
  }

  // El permiso más específico (más largo) tiene prioridad, pero herencia da acceso
  // Si tiene permiso en un padre, hereda lectura/escritura a los hijos
  let lectura = false
  let escritura = false

  for (const p of permisos) {
    if (p.lectura) lectura = true
    if (p.escritura) escritura = true
  }

  return { lectura, escritura }
}
