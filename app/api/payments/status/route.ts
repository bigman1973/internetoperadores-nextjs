import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ error: 'orderId requerido' }, { status: 400 })
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        tarifaNombre: true,
        importeAlta: true,
        importeCuota: true,
        importeTotal: true,
        paymentGateway: true,
        paymentStatus: true,
        periodicidad: true,
        paidAt: true,
        createdAt: true,
      },
    })

    if (!order) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Error checking payment status:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
