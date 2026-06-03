import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { sendAbandonedCartEmail } from '@/lib/payments/notifications'

// Este endpoint se ejecuta cada 10 minutos via Vercel Cron
// Busca pedidos PENDING o PROCESSING creados hace más de 30 minutos
// y envía email de carrito abandonado + añade a lista HubSpot

export async function GET(request: NextRequest) {
  try {
    // Verificar que viene del cron de Vercel (seguridad)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Buscar pedidos abandonados: PENDING o PROCESSING, creados hace más de 30 min,
    // que NO hayan sido ya notificados (abandonedNotifiedAt es null)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)

    const abandonedOrders = await prisma.order.findMany({
      where: {
        paymentStatus: { in: ['PENDING', 'PROCESSING'] },
        createdAt: { lt: thirtyMinutesAgo },
        abandonedNotifiedAt: null,
      },
      take: 50, // Procesar máximo 50 por ejecución
    })

    let processed = 0

    for (const order of abandonedOrders) {
      // Enviar email de carrito abandonado + añadir a HubSpot
      await sendAbandonedCartEmail({
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

      // Marcar como notificado para no enviar de nuevo
      await prisma.order.update({
        where: { id: order.id },
        data: {
          abandonedNotifiedAt: new Date(),
          paymentStatus: 'ABANDONED',
        },
      })

      processed++
    }

    console.log(`[Cron Abandoned Carts] Procesados: ${processed} pedidos abandonados`)

    return NextResponse.json({
      success: true,
      processed,
      total: abandonedOrders.length,
    })
  } catch (error: any) {
    console.error('[Cron Abandoned Carts] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
