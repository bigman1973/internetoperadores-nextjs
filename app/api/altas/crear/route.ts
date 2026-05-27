import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { initiatePayment, type PaymentMethod } from '@/lib/payments'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'

// Validar IBAN español
function validarIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase()
  if (cleaned.length !== 24 || !cleaned.startsWith('ES')) return false
  // Validación de dígitos de control
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString())
  let remainder = numeric.slice(0, 9)
  for (let i = 9; i < numeric.length; i += 7) {
    remainder = (parseInt(remainder) % 97).toString() + numeric.slice(i, i + 7)
  }
  return parseInt(remainder) % 97 === 1
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      tipoCliente,
      // Particular
      nombre,
      apellidos,
      dni,
      // Empresa
      razonSocial,
      cif,
      nombreApoderado,
      dniApoderado,
      // Comunes
      email,
      telefono,
      direccionFacturacion,
      localidadFacturacion,
      provinciaFacturacion,
      cpFacturacion,
      direccionInstalacion,
      localidadInstalacion,
      provinciaInstalacion,
      cpInstalacion,
      // Pago
      metodoPago,
      iban,
      // Tarifa
      tarifaId,
      // Portabilidad
      esPortabilidad,
      numeroPortar,
      operadorActual,
      titularLineaDiferente,
    } = body

    // Validaciones
    if (!tipoCliente || !email || !direccionFacturacion || !metodoPago || !tarifaId) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      )
    }

    if (tipoCliente === 'PARTICULAR' && (!nombre || !apellidos || !dni)) {
      return NextResponse.json(
        { error: 'Para particulares se requiere nombre, apellidos y DNI' },
        { status: 400 }
      )
    }

    if (tipoCliente === 'EMPRESA' && (!razonSocial || !cif)) {
      return NextResponse.json(
        { error: 'Para empresas se requiere razón social y CIF' },
        { status: 400 }
      )
    }

    // Validar IBAN si el método es SEPA
    if (metodoPago === 'SEPA_DOMICILIACION') {
      if (!iban) {
        return NextResponse.json(
          { error: 'El IBAN es obligatorio para domiciliación SEPA' },
          { status: 400 }
        )
      }
      if (!validarIBAN(iban)) {
        return NextResponse.json(
          { error: 'El IBAN introducido no es válido' },
          { status: 400 }
        )
      }
    }

    // Obtener tarifa
    const tarifa = await prisma.tarifa.findUnique({
      where: { id: parseInt(tarifaId) },
    })

    if (!tarifa) {
      return NextResponse.json({ error: 'Tarifa no encontrada' }, { status: 404 })
    }

    const importeCuota = Number(tarifa.precioConIva)
    const importeAlta = tarifa.cuotaAlta ? Number(tarifa.cuotaAlta) : null

    // Crear el alta
    const alta = await prisma.altaServicio.create({
      data: {
        tipoCliente,
        nombre: nombre || null,
        apellidos: apellidos || null,
        dni: dni || null,
        razonSocial: razonSocial || null,
        cif: cif || null,
        nombreApoderado: nombreApoderado || null,
        dniApoderado: dniApoderado || null,
        email,
        telefono: telefono || null,
        direccionFacturacion,
        localidadFacturacion,
        provinciaFacturacion,
        cpFacturacion,
        direccionInstalacion: direccionInstalacion || null,
        localidadInstalacion: localidadInstalacion || null,
        provinciaInstalacion: provinciaInstalacion || null,
        cpInstalacion: cpInstalacion || null,
        metodoPago,
        iban: iban ? iban.replace(/\s/g, '').toUpperCase() : null,
        tarifaId: tarifa.id,
        tarifaNombre: tarifa.nombreComercial || tarifa.nombre,
        importeCuota,
        importeAlta,
        permanencia: tarifa.permanencia || null,
        esPortabilidad: esPortabilidad || false,
        numeroPortar: numeroPortar || null,
        operadorActual: operadorActual || null,
        titularLineaDiferente: titularLineaDiferente || false,
        estado: 'FORMULARIO_COMPLETADO',
      },
    })

    // Si hay cuota de alta y el método es tarjeta/crypto, iniciar pago inmediato
    let pagoUrl: string | null = null
    if (importeAlta && importeAlta > 0 && metodoPago !== 'SEPA_DOMICILIACION') {
      const paymentMethod: PaymentMethod = metodoPago === 'TARJETA_VIVID' ? 'VIVID_CARD' : 'TRIPLE_A'
      
      try {
        const paymentResult = await initiatePayment({
          orderId: alta.id,
          amount: importeAlta,
          customerEmail: email,
          customerName: tipoCliente === 'EMPRESA' ? razonSocial : `${nombre} ${apellidos}`,
          productName: `Alta: ${tarifa.nombreComercial || tarifa.nombre}`,
          productDescription: 'Cuota de alta del servicio',
          method: paymentMethod,
        })

        await prisma.altaServicio.update({
          where: { id: alta.id },
          data: {
            pagoAltaGateway: paymentMethod,
            pagoAltaStatus: 'PROCESSING',
            pagoAltaUrl: paymentResult.paymentUrl,
            pagoAltaTransactionId: paymentResult.transactionId || null,
          },
        })

        pagoUrl = paymentResult.paymentUrl
      } catch (payError: any) {
        console.error('Error iniciando pago de alta:', payError)
        // No bloqueamos el alta por un error de pago
      }
    }

    return NextResponse.json({
      success: true,
      altaId: alta.id,
      token: alta.token,
      estado: alta.estado,
      pagoUrl,
      // URL para completar documentación
      documentacionUrl: `${BASE_URL}/alta-servicio/documentacion?token=${alta.token}`,
    })
  } catch (error: any) {
    console.error('Error creando alta:', error)
    return NextResponse.json(
      { error: error.message || 'Error al procesar el alta' },
      { status: 500 }
    )
  }
}
