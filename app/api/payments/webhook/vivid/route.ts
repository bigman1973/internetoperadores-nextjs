import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { verifyWebhookSignature, type VividWebhookPayload } from '@/lib/payments/vivid'
import { sendPaymentSuccessEmails } from '@/lib/payments/notifications'

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

      // Enviar emails de confirmación (no bloquea la respuesta)
      sendPaymentSuccessEmails({
        id: order.id,
        customerEmail: order.customerEmail,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerCompany: order.customerCompany,
        customerType: order.customerType,
        tarifaNombre: order.tarifaNombre,
        importeAlta: order.importeAlta ? Number(order.importeAlta) : null,
        importeCuota: Number(order.importeCuota),
        importeTotal: Number(order.importeTotal),
        periodicidad: order.periodicidad,
        paymentGateway: order.paymentGateway,
      })
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
