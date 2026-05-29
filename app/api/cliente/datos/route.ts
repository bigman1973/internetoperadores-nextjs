export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const clienteEmail = session.user.email
    const cliente = await prisma.clienteWeb.findFirst({
      where: { email: clienteEmail, activo: true },
      select: {
        nombre: true,
        nombreComercial: true,
        email: true,
        codigo: true,
        nif: true,
        cif: true,
        telefono: true,
        movil: true,
        domicilio: true,
        numero: true,
        localidad: true,
        municipio: true,
        codigoPostal: true,
        provincia: true,
        formaPago: true,
        cuentaCargo: true,
        fechaAlta: true,
      }
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    return NextResponse.json({
      ...cliente,
      fechaAlta: cliente.fechaAlta ? cliente.fechaAlta.toISOString().split('T')[0] : null,
    })
  } catch (error: any) {
    console.error('Error obteniendo datos del cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
