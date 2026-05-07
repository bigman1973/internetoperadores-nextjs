import { NextResponse } from 'next/server'
import prisma from '../../../../lib/prisma'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth'

export const dynamic = 'force-dynamic'

// GET - Listar usuarios admin
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const usuarios = await prisma.usuarioAdmin.findMany({
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        ultimoAcceso: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ usuarios })
  } catch (error) {
    console.error('Error fetching usuarios:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

// POST - Crear nuevo usuario admin
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Solo SUPER_ADMIN puede crear usuarios
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Solo el Super Admin puede crear usuarios' }, { status: 403 })
    }

    const body = await request.json()
    const { email, nombre, password, rol } = body

    if (!email || !nombre || !password || !rol) {
      return NextResponse.json({ error: 'Todos los campos son obligatorios' }, { status: 400 })
    }

    // Verificar que el email no existe
    const existing = await prisma.usuarioAdmin.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existing) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10)

    const usuario = await prisma.usuarioAdmin.create({
      data: {
        email: email.toLowerCase(),
        nombre,
        passwordHash,
        rol: rol as any,
        activo: true,
      },
      select: {
        id: true,
        email: true,
        nombre: true,
        rol: true,
        activo: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ usuario }, { status: 201 })
  } catch (error) {
    console.error('Error creating usuario:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
