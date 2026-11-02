import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { initiatePayment, type PaymentMethod } from '@/lib/payments'
import { guardarCaptacionWeb } from '@/lib/crm-captacion-web'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://www.internetoperadores.com'
const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim()

// IDs de listas de newsletter
const NEWSLETTER_LISTS: Record<string, number> = {
  PARTICULAR: 31,
  EMPRESA: 30,
}

async function sendEmail({ to, toName, subject, htmlContent }: { to: string; toName: string; subject: string; htmlContent: string }) {
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email: to, name: toName }],
        subject,
        htmlContent,
      }),
    })
  } catch (e: any) {
    console.error('[Altas] Error enviando email:', e.message)
  }
}

async function subscribeNewsletter({ nombre, email, telefono, tipoCliente }: { nombre: string; email: string; telefono?: string; tipoCliente: string }) {
  const listId = NEWSLETTER_LISTS[tipoCliente] || NEWSLETTER_LISTS.EMPRESA

  // Brevo
  try {
    const attributes: Record<string, string> = { NOMBRE: nombre }
    if (telefono) attributes.TELEFONO = telefono
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify({ email, attributes, listIds: [listId], updateEnabled: true }),
    })
  } catch (e: any) {
    console.error('[Altas] Error Brevo newsletter:', e.message)
  }
}

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
      // Observaciones (servicios adicionales)
      observaciones,
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

    // Guardar captación y alta atómicamente. El CRM sólo recibe un resumen comercial;
    // documentos de identidad, apoderado, IBAN y direcciones permanecen en el detalle.
    const { contactoId, registro: alta, repetido } = await guardarCaptacionWeb(request, {
      formulario: '/api/altas/crear',
      segmentoCrm: tipoCliente === 'PARTICULAR' ? 'PARTICULAR' : 'EMPRESA',
      nombre: tipoCliente === 'EMPRESA' ? razonSocial : `${nombre || ''} ${apellidos || ''}`.trim(),
      email,
      telefono: telefono || null,
      empresa: tipoCliente === 'EMPRESA' ? razonSocial : null,
      datosIdempotencia: body,
      datos: {
        tipoCliente,
        tarifaId: tarifa.id,
        tarifaNombre: tarifa.nombreComercial || tarifa.nombre,
        importeCuota,
        importeAlta,
        permanencia: tarifa.permanencia || null,
        metodoPago,
        esPortabilidad: esPortabilidad || false,
        operadorActual: operadorActual || null,
      },
      newsletter: body.newsletter === true,
      privacidad: typeof body.privacidad === 'boolean' ? body.privacidad : null,
      persistir: async (tx, contactoId) => tx.altaServicio.create({
        data: {
          crmContactoId: contactoId,
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
          observaciones: observaciones || null,
          estado: 'FORMULARIO_COMPLETADO',
        },
      }),
    })

    // El reintento conserva identidad y enlaces existentes, sin iniciar otro pago.
    if (repetido) {
      return NextResponse.json({
        success: true,
        altaId: alta.id,
        contactoId,
        token: alta.token,
        estado: alta.estado,
        pagoUrl: alta.pagoAltaUrl || null,
        documentacionUrl: `${BASE_URL}/alta-servicio/documentacion?token=${alta.token}`,
        repetido: true,
      })
    }

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

    // --- Enviar emails y newsletter (no bloquean el flujo) ---
    const clienteNombre = tipoCliente === 'EMPRESA' ? (razonSocial || '') : `${nombre || ''} ${apellidos || ''}`.trim()
    const tarifaNombreStr = tarifa.nombreComercial || tarifa.nombre

    // Email a comercial
    const htmlComercial = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Nueva Alta de Servicio</h1>
        </div>
        <div style="padding: 24px; background: #f9fafb; border: 1px solid #e5e7eb;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; font-weight: bold;">Cliente:</td><td>${clienteNombre}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Tipo:</td><td>${tipoCliente}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Email:</td><td>${email}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Teléfono:</td><td>${telefono || 'No proporcionado'}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Servicio:</td><td>${tarifaNombreStr}</td></tr>
            <tr><td style="padding: 8px 0; font-weight: bold;">Importe mensual:</td><td style="color: #f97316; font-weight: bold;">${importeCuota.toFixed(2)}€/mes</td></tr>
            ${importeAlta ? `<tr><td style="padding: 8px 0; font-weight: bold;">Cuota alta:</td><td>${importeAlta.toFixed(2)}€</td></tr>` : ''}
            <tr><td style="padding: 8px 0; font-weight: bold;">Método pago:</td><td>${metodoPago}</td></tr>
            ${observaciones ? `<tr><td style="padding: 8px 0; font-weight: bold;">Observaciones:</td><td>${observaciones}</td></tr>` : ''}
          </table>
          <p style="margin-top: 16px;"><a href="${BASE_URL}/admin/altas/${alta.id}" style="color: #f97316;">Ver alta en el panel</a></p>
        </div>
      </div>
    `
    sendEmail({
      to: 'comercial@internetoperadores.com',
      toName: 'Comercial Internet Operadores',
      subject: `[Nueva Alta] ${tarifaNombreStr} - ${clienteNombre}`,
      htmlContent: htmlComercial,
    })

    // Email de confirmación al cliente
    const htmlCliente = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1f2937; padding: 20px; text-align: center;">
          <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
          <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Confirmación de alta</p>
        </div>
        <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
          <h2 style="color: #1f2937; margin: 0 0 16px 0;">Hola ${clienteNombre},</h2>
          <p style="color: #4b5563; line-height: 1.6;">Hemos recibido tu solicitud de alta correctamente. Nuestro equipo la procesará y te contactaremos para confirmar los próximos pasos.</p>
          <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0; color: #374151;"><strong>Servicio:</strong> ${tarifaNombreStr}</p>
            <p style="margin: 4px 0; color: #374151;"><strong>Importe:</strong> ${importeCuota.toFixed(2)}€/mes</p>
          </div>
          <p style="color: #4b5563; line-height: 1.6;">Si tienes alguna duda, puedes contactarnos en el <strong>900 730 034</strong> o por email a <strong>comercial@internetoperadores.com</strong>.</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Este es un email automático.</p>
        </div>
      </div>
    `
    sendEmail({
      to: email,
      toName: clienteNombre,
      subject: `Alta recibida: ${tarifaNombreStr} - Internet Operadores`,
      htmlContent: htmlCliente,
    })

    // Newsletter opt-in
    if (body.newsletter === true) {
      subscribeNewsletter({
        nombre: clienteNombre,
        email,
        telefono,
        tipoCliente,
      })
    }

    return NextResponse.json({
      success: true,
      altaId: alta.id,
      contactoId,
      token: alta.token,
      estado: alta.estado,
      pagoUrl,
      // URL para completar documentación
      documentacionUrl: `${BASE_URL}/alta-servicio/documentacion?token=${alta.token}`,
      repetido: false,
    })
  } catch (error: any) {
    console.error('Error creando alta:', error)
    return NextResponse.json(
      { error: error.message || 'Error al procesar el alta' },
      { status: 500 }
    )
  }
}
