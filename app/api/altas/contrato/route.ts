import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { generarContratoHTML, type ContratoData, type ServicioContratado } from '@/lib/contrato/template'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const altaId = searchParams.get('altaId')
  const format = searchParams.get('format') || 'html' // html o pdf

  if (!altaId) {
    return NextResponse.json({ error: 'altaId requerido' }, { status: 400 })
  }

  try {
    const alta = await prisma.altaServicio.findUnique({
      where: { id: altaId },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    // Obtener tarifa para detalles
    const tarifa = await prisma.tarifa.findUnique({
      where: { id: alta.tarifaId },
    })

    // Construir datos del contrato
    const nombreTitular = alta.tipoCliente === 'EMPRESA'
      ? alta.razonSocial || ''
      : `${alta.nombre || ''} ${alta.apellidos || ''}`.trim()

    const dniCif = alta.tipoCliente === 'EMPRESA'
      ? alta.cif || ''
      : alta.dni || ''

    // Determinar tipo de servicio basado en la tarifa
    const servicios: ServicioContratado[] = []
    if (tarifa) {
      let tipo: 'INTERNET' | 'TELEFONIA_FIJA' | 'TELEFONIA_MOVIL' | 'OTROS' = 'OTROS'
      if (tarifa.esInternet) tipo = 'INTERNET'
      else if (tarifa.esFijo) tipo = 'TELEFONIA_FIJA'
      else if (tarifa.esMovil) tipo = 'TELEFONIA_MOVIL'

      servicios.push({
        tipo,
        tarifa: tarifa.nombreComercial || tarifa.nombre,
        detalle: tarifa.descripcionCorta || tarifa.velocidad || '',
        precio: Number(alta.importeCuota).toFixed(2),
        permanencia: alta.permanencia || 'Sin permanencia',
      })
    }

    const contratoData: ContratoData = {
      fechaContrato: new Date().toLocaleDateString('es-ES'),
      nombreTitular,
      dniCifNie: dniCif,
      direccionCompleta: alta.direccionFacturacion,
      localidad: alta.localidadFacturacion,
      provincia: alta.provinciaFacturacion,
      codigoPostal: alta.cpFacturacion,
      email: alta.email,
      personaContacto: nombreTitular,
      direccionInstalacion: alta.direccionInstalacion || undefined,
      localidadInstalacion: alta.localidadInstalacion || undefined,
      provinciaInstalacion: alta.provinciaInstalacion || undefined,
      cpInstalacion: alta.cpInstalacion || undefined,
      servicios,
      cuotaMensualConDescuento: Number(alta.importeCuota).toFixed(2),
      cuotaMensualSinDescuento: Number(alta.importeCuota).toFixed(2),
      cuotaInstalacion: alta.importeAlta ? Number(alta.importeAlta).toFixed(2) : '0,00',
      dispositivosCedidos: '',
      observaciones: alta.observaciones || undefined,
      iban: alta.iban || undefined,
      tipoCliente: alta.tipoCliente as 'PARTICULAR' | 'EMPRESA',
    }

    const html = generarContratoHTML(contratoData)

    if (format === 'html') {
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // Para PDF, devolvemos el HTML y el frontend lo convierte
    return NextResponse.json({ html, data: contratoData })
  } catch (error: any) {
    console.error('Error generando contrato:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
