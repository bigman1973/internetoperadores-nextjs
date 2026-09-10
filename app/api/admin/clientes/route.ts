import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '../../../../lib/auth'
import { esSegmentoCrm } from '../../../../lib/crm-segmentos'
import prisma from '../../../../lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const ispGestionId = typeof body.ispGestionId === 'string' ? body.ispGestionId.trim() : ''

    if (!nombre || !email || !password || typeof body.personaFisica !== 'boolean' || !esSegmentoCrm(body.segmentoCrm)) {
      return NextResponse.json(
        { error: 'Nombre, email, contraseña, tipo fiscal y clasificación CRM son obligatorios' },
        { status: 400 }
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'El email no es válido' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña temporal debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const existing = await prisma.clienteWeb.findFirst({
      where: {
        OR: [
          { email: { equals: email, mode: 'insensitive' } },
          ...(ispGestionId ? [{ ispGestionId }] : []),
        ],
      },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json({ error: 'Ya existe un cliente con ese email o ID de ISPGestión' }, { status: 409 })
    }

    const cliente = await prisma.clienteWeb.create({
      data: {
        nombre,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        ispGestionId: ispGestionId || `manual-${randomUUID()}`,
        personaFisica: body.personaFisica,
        segmentoCrm: body.segmentoCrm,
        segmentoCrmActualizadoAt: new Date(),
        segmentoCrmActualizadoPor: session.user.email || session.user.name || 'Administrador',
        newsletterSuscrito: body.newsletterSuscrito === true,
        activo: true,
        origen: 'Alta manual panel',
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        segmentoCrm: true,
      },
    })

    return NextResponse.json({ success: true, cliente }, { status: 201 })
  } catch (error) {
    console.error('Error al crear cliente:', error)
    return NextResponse.json({ error: 'Error al crear cliente' }, { status: 500 })
  }
}
