import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyWebhookSignature, type VividWebhookPayload } from '@/lib/payments/vivid'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-signature') || ''

    // Verificar la firma del webhook
    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('Vivid webhook: firma inválida')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const payload: VividWebhookPayload = JSON.parse(rawBody)
    console.log('Vivid webhook received:', payload)

    const { status, externalOrderId } = payload

    // Buscar el pedido
    const order = await prisma.order.findUnique({
      where: { id: externalOrderId },
    })

    if (!order) {
      console.error(`Vivid webhook: pedido no encontrado: ${externalOrderId}`)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Actualizar según el estado
    if (status === 'STATUS_SUCCESS') {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: 'PAID',
          paidAt: new Date(),
          reconciliationStatus: 'PENDING_SETTLEMENT',
        },
      })
      console.log(`Vivid webhook: pago exitoso para pedido ${order.id}`)
    } else if (status === 'STATUS_FAILED' || status === 'STATUS_CANCELLED') {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: status === 'STATUS_FAILED' ? 'FAILED' : 'CANCELLED',
        },
      })
      console.log(`Vivid webhook: pago ${status} para pedido ${order.id}`)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Vivid webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
