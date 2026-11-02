import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { appendArea4Audit, snapshotAdminUser } from '@/lib/area4/audit'
import { requireArea4Owner } from '@/lib/area4/live-admin'

export const dynamic = 'force-dynamic'

const ROLES_VALIDOS = new Set(['SUPER_ADMIN', 'GERENTE', 'MARKETING', 'VENTAS', 'CONTABILIDAD', 'RRHH', 'VISOR'])

function parseId(value: string): number | null {
  const id = Number(value)
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

function normalizarRol(value: unknown): string | null {
  return typeof value === 'string' && ROLES_VALIDOS.has(value) ? value : null
}

function normalizarRoles(rol: string, value: unknown): string[] | null {
  if (value === undefined) return [rol]
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !ROLES_VALIDOS.has(item))) return null
  const normalized = [...new Set(value)]
  return normalized.includes(rol) ? normalized : [rol, ...normalized]
}

async function targetForChange(id: number) {
  return prisma.usuarioAdmin.findUnique({
    where: { id },
    select: { id: true, nombre: true, rol: true, roles: true, activo: true, perfilAsignado: true },
  })
}

// PUT - Víctor puede actualizar una cuenta, con protección especial de su propia identidad.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) return auth.response
  const userId = parseId((await params).id)
  if (!userId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

  try {
    const body = await request.json()
    const anterior = await targetForChange(userId)
    if (!anterior) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const requestedRol = body.rol === undefined ? anterior.rol : normalizarRol(body.rol)
    if (!requestedRol) return NextResponse.json({ error: 'Rol no válido' }, { status: 400 })
    const requestedRoles = normalizarRoles(requestedRol, body.roles)
    if (!requestedRoles) return NextResponse.json({ error: 'Lista de roles no válida' }, { status: 400 })

    const changesOwnerIdentity = userId === auth.principal.id && (
      requestedRol !== anterior.rol || Boolean(body.roles !== undefined) || body.activo !== undefined
    )
    if (changesOwnerIdentity) return NextResponse.json({ error: 'La identidad canónica de Víctor no se modifica desde esta pantalla.' }, { status: 409 })
    if (userId !== auth.principal.id && (requestedRol === 'SUPER_ADMIN' || requestedRoles.includes('SUPER_ADMIN'))) {
      return NextResponse.json({ error: 'No se puede crear ni promover otro Super Admin.' }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (typeof body.nombre === 'string' && body.nombre.trim()) updateData.nombre = body.nombre.trim()
    if (body.rol !== undefined) updateData.rol = requestedRol
    if (body.roles !== undefined || body.rol !== undefined) updateData.roles = requestedRoles
    if (typeof body.activo === 'boolean') updateData.activo = body.activo
    if (typeof body.password === 'string' && body.password) updateData.passwordHash = await bcrypt.hash(body.password, 10)

    const usuario = await prisma.$transaction(async tx => {
      const updated = await tx.usuarioAdmin.update({
        where: { id: userId }, data: updateData,
        select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true, ultimoAcceso: true, createdAt: true, perfilAsignado: true },
      })
      await appendArea4Audit(tx, {
        actorId: auth.principal.id, objetivoUsuarioId: userId,
        operacion: updated.activo ? 'USUARIO_CAMBIO' : 'USUARIO_BAJA',
        antes: snapshotAdminUser(anterior), despues: snapshotAdminUser(updated), origen: new URL(request.url).pathname,
      })
      return updated
    })
    return NextResponse.json({ usuario })
  } catch {
    return NextResponse.json({ error: 'Error interno al actualizar el usuario' }, { status: 500 })
  }
}

// DELETE - Por seguridad y trazabilidad, una baja es lógica: conserva historial y auditoría.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) return auth.response
  const userId = parseId((await params).id)
  if (!userId) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
  if (userId === auth.principal.id) return NextResponse.json({ error: 'No puedes desactivar la cuenta canónica de Víctor.' }, { status: 409 })

  const anterior = await targetForChange(userId)
  if (!anterior) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  const usuario = await prisma.$transaction(async tx => {
    const updated = await tx.usuarioAdmin.update({
      where: { id: userId }, data: { activo: false },
      select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true, ultimoAcceso: true, createdAt: true, perfilAsignado: true },
    })
    await appendArea4Audit(tx, {
      actorId: auth.principal.id, objetivoUsuarioId: userId, operacion: 'USUARIO_BAJA',
      antes: snapshotAdminUser(anterior), despues: snapshotAdminUser(updated), origen: new URL(request.url).pathname,
    })
    return updated
  })
  return NextResponse.json({ success: true, usuario })
}
