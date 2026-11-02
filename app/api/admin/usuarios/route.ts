import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { appendArea4Audit, snapshotAdminUser } from '@/lib/area4/audit'
import { requireArea4Owner } from '@/lib/area4/live-admin'

export const dynamic = 'force-dynamic'

const ROLES_VALIDOS = new Set(['SUPER_ADMIN', 'GERENTE', 'MARKETING', 'VENTAS', 'CONTABILIDAD', 'RRHH', 'VISOR'])

function normalizarRol(value: unknown): string | null {
  return typeof value === 'string' && ROLES_VALIDOS.has(value) ? value : null
}

// GET - La lista de cuentas y sus roles sólo es visible para Víctor.
export async function GET() {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) return auth.response

  const usuarios = await prisma.usuarioAdmin.findMany({
    select: {
      id: true, email: true, nombre: true, rol: true, roles: true, activo: true,
      ultimoAcceso: true, createdAt: true, perfilAsignado: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ usuarios })
}

// POST - Alta administrativa: sólo Víctor y nunca crea otro Super Admin.
export async function POST(request: Request) {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) return auth.response

  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const rol = normalizarRol(body.rol)
    if (!email || !nombre || !password || !rol) return NextResponse.json({ error: 'Todos los campos son obligatorios y el rol debe ser válido' }, { status: 400 })
    if (rol === 'SUPER_ADMIN') return NextResponse.json({ error: 'Solo existe un Super Admin canónico; no se pueden crear más.' }, { status: 403 })

    const existing = await prisma.usuarioAdmin.findUnique({ where: { email }, select: { id: true } })
    if (existing) return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })

    const passwordHash = await bcrypt.hash(password, 10)
    const usuario = await prisma.$transaction(async tx => {
      const created = await tx.usuarioAdmin.create({
        data: { email, nombre, passwordHash, rol: rol as never, roles: [rol], activo: true },
        select: { id: true, email: true, nombre: true, rol: true, roles: true, activo: true, createdAt: true, perfilAsignado: true },
      })
      await appendArea4Audit(tx, {
        actorId: auth.principal.id, objetivoUsuarioId: created.id, operacion: 'USUARIO_ALTA',
        despues: snapshotAdminUser(created), origen: new URL(request.url).pathname,
      })
      return created
    })
    return NextResponse.json({ usuario }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Error interno al crear el usuario' }, { status: 500 })
  }
}
