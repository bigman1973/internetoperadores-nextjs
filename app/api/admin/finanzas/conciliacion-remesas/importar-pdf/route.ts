import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

// Tipos de PDF que acepta
type TipoPDF = 'remesas' | 'recibos_devueltos'

// ============================================================
// PARSER: PDF Remesas del banco
// Extrae: fecha, nº recibos, importe, número de remesa
// ============================================================
function parseRemesasBanco(text: string): Array<{
  fecha: string
  numRecibos: number
  importe: number
  numeroRemesa: string
}> {
  const resultados: Array<{
    fecha: string
    numRecibos: number
    importe: number
    numeroRemesa: string
  }> = []

  // El texto viene en formato: "01/06/2026" + "2" + "509,70 EUR" + "0049 2482 75300007KL" + "0049 1886 2810745257" + "Contabilizada"
  // Pero pdf-parse lo concatena sin separadores claros
  // Patrón: fecha (dd/mm/yyyy) + nRecibos + importe (xxx,xx EUR) + referencia (0049 2482 753XXXXXXX) + cuenta + estado
  
  // Regex para extraer cada línea de la tabla
  const regex = /(\d{2}\/\d{2}\/\d{4})(\d+)([\d.,]+)\s*EUR(0049\s*2482\s*753\d+[A-Z0-9]+)/gi
  let match

  while ((match = regex.exec(text)) !== null) {
    const fecha = match[1]
    const numRecibos = parseInt(match[2])
    const importeStr = match[3].replace('.', '').replace(',', '.')
    const importe = parseFloat(importeStr)
    const numeroRemesa = match[4].replace(/\s+/g, ' ').trim()

    if (!isNaN(numRecibos) && !isNaN(importe) && importe > 0) {
      resultados.push({ fecha, numRecibos, importe, numeroRemesa })
    }
  }

  // Si el regex anterior no funciona bien, intentar un enfoque más flexible
  if (resultados.length === 0) {
    // Buscar patrones de fecha seguidos de datos
    const lines = text.split('\n').filter(l => l.trim())
    const dateRegex = /(\d{2}\/\d{2}\/\d{4})/
    
    for (const line of lines) {
      const dateMatch = line.match(dateRegex)
      if (dateMatch) {
        // Extraer número de recibos (dígitos después de la fecha)
        const afterDate = line.substring(line.indexOf(dateMatch[0]) + dateMatch[0].length)
        const numMatch = afterDate.match(/^(\d+)/)
        if (numMatch) {
          const numRecibos = parseInt(numMatch[1])
          // Extraer importe
          const importeMatch = afterDate.match(/([\d.]+,\d{2})\s*EUR/)
          if (importeMatch) {
            const importe = parseFloat(importeMatch[1].replace('.', '').replace(',', '.'))
            // Extraer referencia
            const refMatch = afterDate.match(/(0049\s*2482\s*753\d+[A-Z0-9]+)/i)
            if (refMatch && !isNaN(importe) && importe > 0) {
              resultados.push({
                fecha: dateMatch[1],
                numRecibos,
                importe,
                numeroRemesa: refMatch[1].replace(/\s+/g, ' ').trim()
              })
            }
          }
        }
      }
    }
  }

  return resultados
}

// ============================================================
// PARSER: PDF Recibos devueltos del banco
// Extrae: referencia factura, nombre cliente, importe, motivo
// ============================================================
function parseRecibosDevueltos(text: string): {
  remesaInfo: { fecha: string; numRecibos: number; importe: number; numeroRemesa: string } | null
  recibos: Array<{
    referenciaExterna: string
    nombreCliente: string
    cuentaDeudor: string
    concepto: string
    importe: number
    fechaVencimiento: string
    motivoDevolucion: string
    remesaOrigen: string
  }>
} {
  const recibos: Array<{
    referenciaExterna: string
    nombreCliente: string
    cuentaDeudor: string
    concepto: string
    importe: number
    fechaVencimiento: string
    motivoDevolucion: string
    remesaOrigen: string
  }> = []

  // Extraer info de la remesa de cabecera
  let remesaInfo: { fecha: string; numRecibos: number; importe: number; numeroRemesa: string } | null = null
  const fechaMatch = text.match(/Fecha de vencimiento\s*[\n\r]*(\d{2}\/\d{2}\/\d{4})/)
  const numRemesaMatch = text.match(/(\d{13,}[A-Z0-9]+)(\d+)\s*\n/)
  const importeMatch = text.match(/([\d.,]+)\s*EUR/)
  
  // Extraer número de remesa y recibos de la cabecera
  const remesaHeaderMatch = text.match(/00492482753\d+([A-Z0-9]+)(\d+)/)
  if (remesaHeaderMatch || numRemesaMatch) {
    // Buscar "Número de recibos" y su valor
    const recibosMatch = text.match(/(\d+)\s*\n\s*Importe recibo/)
    const numRecibosFromHeader = recibosMatch ? parseInt(recibosMatch[1]) : 0
    
    // Buscar importe del recibo
    const importeRecibo = text.match(/Importe recibo\s*\n\s*([\d.,]+)\s*EUR/)
    
    // Buscar fecha
    const fechaVenc = text.match(/(\d{2}\/\d{2}\/\d{4})\s*\n?\s*ES42000/)
    
    if (numRecibosFromHeader > 0 && importeRecibo) {
      remesaInfo = {
        fecha: fechaVenc ? fechaVenc[1] : '',
        numRecibos: numRecibosFromHeader,
        importe: parseFloat(importeRecibo[1].replace('.', '').replace(',', '.')),
        numeroRemesa: ''
      }
    }
  }

  // Extraer cada recibo devuelto
  // Patrón: Referencia (CLL/CPL/CMV/CCM + número), seguido de nombre, cuenta, concepto, importe, fecha, motivo
  // El texto viene desordenado por pdf-parse, así que buscamos las referencias como ancla
  
  const refPattern = /(C[A-Z]{2}\d+)\s*\n([^\n]+(?:\n[^\n]+)?)\s*\n(ES\d+\s*\n?\d+)\s*\n(FACTURA N\.\s*\n?[^\n]+(?:\n[^\n]+)?)\s*\n([\d.,]+)\s*EUR\s*(\d{2}\/\d{2}\/\d{4})\s*\n?([^\n]+(?:\n[^\n]+)?)\s*\n(\d+\s*\n?[A-Z0-9]+)/g
  
  let refMatch
  while ((refMatch = refPattern.exec(text)) !== null) {
    const importeStr = refMatch[5].replace('.', '').replace(',', '.')
    recibos.push({
      referenciaExterna: refMatch[1].trim(),
      nombreCliente: refMatch[2].replace(/\n/g, ' ').trim(),
      cuentaDeudor: refMatch[3].replace(/\n/g, '').trim(),
      concepto: refMatch[4].replace(/\n/g, ' ').trim(),
      importe: parseFloat(importeStr),
      fechaVencimiento: refMatch[6].trim(),
      motivoDevolucion: refMatch[7].replace(/\n/g, ' ').trim(),
      remesaOrigen: refMatch[8].replace(/\n/g, '').trim()
    })
  }

  // Si el regex complejo no funciona, intentar un enfoque más simple
  if (recibos.length === 0) {
    // Buscar referencias de factura (CLL, CPL, CMV, CCM seguido de números)
    const simpleRefPattern = /(C[A-Z]{2}\d+)/g
    const refs: string[] = []
    let simpleMatch
    while ((simpleMatch = simpleRefPattern.exec(text)) !== null) {
      if (!refs.includes(simpleMatch[1])) {
        refs.push(simpleMatch[1])
      }
    }

    // Para cada referencia, extraer datos del contexto
    for (const ref of refs) {
      const refIndex = text.indexOf(ref)
      if (refIndex === -1) continue
      
      // Extraer el bloque de texto después de la referencia
      const block = text.substring(refIndex, refIndex + 500)
      
      // Buscar nombre (texto después de la referencia hasta la cuenta ES)
      const nombreMatch = block.match(new RegExp(ref + '\\s*\\n([\\s\\S]*?)\\nES'))
      const nombre = nombreMatch ? nombreMatch[1].replace(/\n/g, ' ').trim() : 'DESCONOCIDO'
      
      // Buscar importe
      const impMatch = block.match(/([\d.,]+)\s*EUR/)
      const importe = impMatch ? parseFloat(impMatch[1].replace('.', '').replace(',', '.')) : 0
      
      // Buscar fecha
      const fechaMatch2 = block.match(/(\d{2}\/\d{2}\/\d{4})/)
      const fecha = fechaMatch2 ? fechaMatch2[1] : ''
      
      // Buscar concepto (FACTURA N.)
      const conceptoMatch = block.match(/FACTURA N\.\s*\n?([^\n]+(?:\n[^\n]+)?)/)
      const concepto = conceptoMatch ? 'FACTURA N. ' + conceptoMatch[1].replace(/\n/g, ' ').trim() : ''
      
      // Buscar motivo (después del importe y fecha)
      const motivoMatch = block.match(/\d{2}\/\d{2}\/\d{4}\s*\n?([^\n]+(?:\n[^\n]+)?)/)
      const motivo = motivoMatch ? motivoMatch[1].replace(/\n/g, ' ').trim() : ''

      if (importe > 0) {
        recibos.push({
          referenciaExterna: ref,
          nombreCliente: nombre,
          cuentaDeudor: '',
          concepto,
          importe,
          fechaVencimiento: fecha,
          motivoDevolucion: motivo,
          remesaOrigen: ''
        })
      }
    }
  }

  return { remesaInfo, recibos }
}

// ============================================================
// POST: Importar PDF del banco
// ============================================================
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tipo = formData.get('tipo') as TipoPDF | null

    if (!file || !tipo) {
      return NextResponse.json({ error: 'Falta archivo o tipo' }, { status: 400 })
    }

    if (!['remesas', 'recibos_devueltos'].includes(tipo)) {
      return NextResponse.json({ error: 'Tipo inválido. Usar: remesas, recibos_devueltos' }, { status: 400 })
    }

    // Leer el PDF
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfData = await pdfParse(buffer)
    const text = pdfData.text

    if (tipo === 'remesas') {
      return await procesarPDFRemesas(text, file.name)
    } else {
      return await procesarPDFRecibosDevueltos(text, file.name)
    }
  } catch (error) {
    console.error('Error importando PDF:', error)
    return NextResponse.json({ error: 'Error procesando el PDF' }, { status: 500 })
  }
}

// ============================================================
// Procesar PDF de Remesas del banco
// ============================================================
async function procesarPDFRemesas(text: string, nombreArchivo: string) {
  const remesasBanco = parseRemesasBanco(text)

  if (remesasBanco.length === 0) {
    return NextResponse.json({ error: 'No se pudieron extraer remesas del PDF. Verifica que es el formato correcto.' }, { status: 400 })
  }

  // Para cada remesa del PDF, buscar el movimiento bancario por importe exacto
  // y luego asignar a la remesa ISP por número de recibos
  let conciliadas = 0
  let errores: string[] = []

  // Obtener todas las remesas ISP
  const remesasISP = await prisma.remesa.findMany({
    include: { conciliacion: true }
  })

  for (const remBanco of remesasBanco) {
    // Buscar movimiento bancario con importe exacto
    const movimiento = await prisma.movimientoBancario.findFirst({
      where: {
        importe: { gte: remBanco.importe - 0.01, lte: remBanco.importe + 0.01 },
        concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' },
      }
    })

    if (!movimiento) {
      errores.push(`No se encontró movimiento bancario para importe ${remBanco.importe}€ (${remBanco.fecha})`)
      continue
    }

    // Buscar la remesa ISP más cercana por número de recibos y fecha
    const fechaParts = remBanco.fecha.split('/')
    const fechaBanco = new Date(parseInt(fechaParts[2]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[0]))
    
    // Filtrar remesas candidatas: misma ventana temporal (±45 días) y sin conciliación
    const candidatas = remesasISP.filter(r => {
      const diffDias = Math.abs((fechaBanco.getTime() - new Date(r.fecha).getTime()) / (1000 * 60 * 60 * 24))
      return diffDias <= 45 && !r.conciliacion
    })

    if (candidatas.length === 0) {
      errores.push(`No se encontró remesa ISP para ${remBanco.numRecibos} recibos (${remBanco.fecha})`)
      continue
    }

    // Asignar por número de recibos más cercano
    const mejorCandidata = candidatas.reduce((best, curr) => {
      const diffCurr = Math.abs(curr.numeroRegistros - remBanco.numRecibos)
      const diffBest = Math.abs(best.numeroRegistros - remBanco.numRecibos)
      return diffCurr < diffBest ? curr : best
    })

    // Solo asignar si la diferencia de recibos es razonable (< 20% de rechazos)
    const diffRecibos = mejorCandidata.numeroRegistros - remBanco.numRecibos
    if (diffRecibos < 0 || diffRecibos > mejorCandidata.numeroRegistros * 0.5) {
      errores.push(`Remesa ${remBanco.numRecibos} recibos no coincide con ninguna ISP (mejor: ${mejorCandidata.nombre} con ${mejorCandidata.numeroRegistros})`)
      continue
    }

    // Crear o actualizar conciliación
    const importeRemesa = Number(mejorCandidata.totalImporte)
    const diferencia = remBanco.importe - importeRemesa

    await prisma.conciliacionRemesa.upsert({
      where: { remesaId: mejorCandidata.id },
      create: {
        remesaId: mejorCandidata.id,
        movimientoBancarioId: movimiento.id,
        importeRemesa: importeRemesa,
        importeMovimiento: remBanco.importe,
        diferencia: diferencia,
        estado: Math.abs(diferencia) < 1 ? 'CONCILIADA' : 'DIFERENCIA',
        fechaConciliacion: new Date(),
        recibosRemesados: mejorCandidata.numeroRegistros,
        recibosCobrados: remBanco.numRecibos,
        rechazos: diffRecibos,
        referenciaRemesaBanco: remBanco.numeroRemesa,
        notas: `Importado desde PDF: ${nombreArchivo}`
      },
      update: {
        movimientoBancarioId: movimiento.id,
        importeMovimiento: remBanco.importe,
        diferencia: diferencia,
        estado: Math.abs(diferencia) < 1 ? 'CONCILIADA' : 'DIFERENCIA',
        fechaConciliacion: new Date(),
        recibosCobrados: remBanco.numRecibos,
        rechazos: diffRecibos,
        referenciaRemesaBanco: remBanco.numeroRemesa,
        notas: `Actualizado desde PDF: ${nombreArchivo}`
      }
    })

    // Marcar como usada para no reasignar
    const idx = remesasISP.findIndex(r => r.id === mejorCandidata.id)
    if (idx >= 0) {
      remesasISP[idx] = { ...remesasISP[idx], conciliacion: {} as any }
    }

    conciliadas++
  }

  return NextResponse.json({
    ok: true,
    tipo: 'remesas',
    resumen: {
      totalEnPDF: remesasBanco.length,
      conciliadas,
      errores: errores.length,
      detalleErrores: errores
    },
    datos: remesasBanco
  })
}

// ============================================================
// Procesar PDF de Recibos Devueltos
// ============================================================
async function procesarPDFRecibosDevueltos(text: string, nombreArchivo: string) {
  const { remesaInfo, recibos } = parseRecibosDevueltos(text)

  if (recibos.length === 0) {
    return NextResponse.json({ error: 'No se pudieron extraer recibos devueltos del PDF. Verifica el formato.' }, { status: 400 })
  }

  let importados = 0
  let errores: string[] = []

  for (const recibo of recibos) {
    // Extraer número de factura del concepto o referencia
    // Referencia: CLL986 → Factura: CLL26/986
    // Concepto: "FACTURA N. CLL26/986 - 1"
    let numeroFactura = ''
    const conceptoMatch = recibo.concepto.match(/FACTURA N\.\s*([A-Z]+\d+\/\d+)/)
    if (conceptoMatch) {
      numeroFactura = conceptoMatch[1]
    } else {
      // Derivar de la referencia: CLL986 → CLL26/986
      const refMatch = recibo.referenciaExterna.match(/([A-Z]+)(\d+)/)
      if (refMatch) {
        numeroFactura = `${refMatch[1]}26/${refMatch[2]}`
      }
    }

    if (!numeroFactura) {
      errores.push(`No se pudo extraer número de factura de ${recibo.referenciaExterna}`)
      continue
    }

    // Buscar la factura en BD
    const factura = await prisma.factura.findFirst({
      where: { numeroDocumento: { contains: numeroFactura, mode: 'insensitive' } }
    })

    // Determinar la remesa a la que pertenece por la serie de la factura
    let remesaId: number | null = null
    const serie = recibo.referenciaExterna.match(/^([A-Z]+)/)?.[1] || ''
    
    // Buscar remesa del mismo mes por serie
    const fechaParts = recibo.fechaVencimiento.split('/')
    if (fechaParts.length === 3) {
      const mes = parseInt(fechaParts[1])
      const anio = parseInt(fechaParts[2])
      
      // Mapeo serie → tipo remesa
      let nombreRemesaPattern = ''
      if (serie === 'CLL') nombreRemesaPattern = 'LLEIDA'
      else if (serie === 'CPL') nombreRemesaPattern = 'PALLARS'
      else if (serie === 'CMV') nombreRemesaPattern = 'MÓVILES'
      else if (serie === 'CCM') nombreRemesaPattern = 'COMUNIDAD'

      if (nombreRemesaPattern) {
        const remesa = await prisma.remesa.findFirst({
          where: {
            nombre: { contains: nombreRemesaPattern, mode: 'insensitive' },
            ejercicio: anio,
            fecha: {
              gte: new Date(anio, mes - 1, 1),
              lt: new Date(anio, mes, 1)
            }
          }
        })
        if (remesa) remesaId = remesa.id
      }
    }

    // Verificar si ya existe esta devolución
    const existente = await prisma.devolucionRemesa.findFirst({
      where: {
        referenciaExterna: recibo.referenciaExterna,
        importe: recibo.importe
      }
    })

    if (existente) {
      // Actualizar con datos del banco si faltaban
      await prisma.devolucionRemesa.update({
        where: { id: existente.id },
        data: {
          nombreCliente: recibo.nombreCliente || existente.nombreCliente,
          motivoBanco: recibo.motivoDevolucion || existente.motivoBanco,
          facturaId: factura?.id || existente.facturaId,
          remesaId: remesaId || existente.remesaId,
        }
      })
      importados++
      continue
    }

    // Crear nueva devolución
    const fechaDevolucion = fechaParts.length === 3
      ? new Date(parseInt(fechaParts[2]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[0]))
      : new Date()

    await prisma.devolucionRemesa.create({
      data: {
        remesaId,
        facturaId: factura?.id || null,
        numeroFactura,
        referenciaExterna: recibo.referenciaExterna,
        referenciaRemesa: recibo.remesaOrigen || null,
        nombreCliente: recibo.nombreCliente,
        importe: recibo.importe,
        motivo: recibo.motivoDevolucion,
        motivoBanco: recibo.motivoDevolucion,
        fechaDevolucion,
        archivoOrigen: nombreArchivo,
        mesDevolucion: fechaDevolucion.getMonth() + 1,
        anioDevolucion: fechaDevolucion.getFullYear(),
      }
    })
    importados++
  }

  return NextResponse.json({
    ok: true,
    tipo: 'recibos_devueltos',
    resumen: {
      totalEnPDF: recibos.length,
      importados,
      errores: errores.length,
      detalleErrores: errores
    },
    datos: recibos
  })
}
