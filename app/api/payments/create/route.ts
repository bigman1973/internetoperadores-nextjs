import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { initiatePayment, type PaymentMethod } from '@/lib/payments'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      tarifaId,
      customerEmail,
      customerName,
      customerPhone,
      customerNif,
      customerCompany,
      customerType,
      paymentMethod,
      periodicidad,
    } = body

    // Validaciones básicas
    if (!tarifaId || !customerEmail || !customerName || !paymentMethod) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      )
    }

    // Obtener la tarifa
    const tarifa = await prisma.tarifa.findUnique({
      where: { id: parseInt(tarifaId) },
    })

    if (!tarifa) {
      return NextResponse.json(
        { error: 'Tarifa no encontrada' },
        { status: 404 }
      )
    }

    // Calcular importes
    const importeAlta = tarifa.cuotaAlta ? Number(tarifa.cuotaAlta) : null
    const importeCuota = Number(tarifa.precioConIva)
    const importeTotal = (importeAlta || 0) + importeCuota

    // Validar límites de Vivid
    if (paymentMethod === 'VIVID_CARD' && importeTotal > 5000) {
      return NextResponse.json(
        { error: 'El importe supera el límite de 5.000€ por transacción para pago con tarjeta' },
        { status: 400 }
      )
    }

    // Determinar periodicidad
    const period = periodicidad || (tarifa.tipoPeriodicidad === 2 ? 'ANUAL' : 'MENSUAL')

    // Crear el pedido en la base de datos
    const order = await prisma.order.create({
      data: {
        customerEmail,
        customerName,
        customerPhone: customerPhone || null,
        customerNif: customerNif || null,
        customerCompany: customerCompany || null,
        customerType: customerType || 'PARTICULAR',
        tarifaId: tarifa.id,
        tarifaNombre: tarifa.nombreComercial || tarifa.nombre,
        importeAlta: importeAlta,
        importeCuota: importeCuota,
        importeTotal: importeTotal,
        periodicidad: period,
        paymentGateway: paymentMethod as PaymentMethod,
        paymentStatus: 'PENDING',
        isRecurring: period !== 'PUNTUAL',
      },
    })

    // Iniciar el pago con el proveedor correspondiente
    const paymentResult = await initiatePayment({
      orderId: order.id,
      amount: importeTotal,
      customerEmail,
      customerName,
      productName: tarifa.nombreComercial || tarifa.nombre,
      productDescription: tarifa.descripcionCorta || undefined,
      method: paymentMethod as PaymentMethod,
    })

    // Actualizar el pedido con la URL de pago
    await prisma.order.update({
      where: { id: order.id },
      data: {
        gatewayPaymentUrl: paymentResult.paymentUrl,
        gatewayTransactionId: paymentResult.transactionId || null,
        paymentStatus: 'PROCESSING',
      },
    })

    return NextResponse.json({
      orderId: order.id,
      paymentUrl: paymentResult.paymentUrl,
      amount: importeTotal,
    })
  } catch (error: any) {
    console.error('Error creating payment:', error)
    return NextResponse.json(
      { error: error.message || 'Error al procesar el pago' },
      { status: 500 }
    )
  }
}
