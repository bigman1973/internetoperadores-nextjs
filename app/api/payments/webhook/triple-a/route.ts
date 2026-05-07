import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { type TripleAWebhookPayload } from '@/lib/payments/triple-a'

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-signature') || request.headers.get('triple-a-sig') || ''

    // TODO: Verificar firma cuando Triple-A documente el formato exacto
    // Por ahora logueamos y procesamos
    
    const payload: TripleAWebhookPayload = JSON.parse(rawBody)
    console.log('Triple-A webhook received:', payload)

    const { order_id, status, tx_hash, payment_id, settlement_id } = payload

    // Buscar el pedido
    const order = await prisma.order.findUnique({
      where: { id: order_id },
    })

    if (!order) {
      console.error(`Triple-A webhook: pedido no encontrado: ${order_id}`)
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Actualizar según el estado
    switch (status) {
      case 'done':
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PAID',
            paidAt: new Date(),
            gatewayTransactionId: payment_id,
            blockchainTxHash: tx_hash || null,
            reconciliationStatus: 'PENDING_SETTLEMENT',
          },
        })
        console.log(`Triple-A webhook: pago exitoso para pedido ${order.id}`)
        break

      case 'expired':
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'CANCELLED',
          },
        })
        console.log(`Triple-A webhook: pago expirado para pedido ${order.id}`)
        break

      case 'underpaid':
        // Pago parcial - marcar como processing, Triple-A lo gestiona
        await prisma.order.update({
          where: { id: order.id },
          data: {
            paymentStatus: 'PROCESSING',
            blockchainTxHash: tx_hash || null,
            notes: `Pago parcial recibido. Status: ${status}`,
          },
        })
        console.log(`Triple-A webhook: pago parcial para pedido ${order.id}`)
        break

      default:
        console.log(`Triple-A webhook: estado desconocido ${status} para pedido ${order.id}`)
    }

    // Si viene settlement_id, actualizar para conciliación
    if (settlement_id) {
      await prisma.order.update({
        where: { id: order.id },
        data: { settlementId: settlement_id },
      })
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Triple-A webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
