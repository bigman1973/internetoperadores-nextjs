import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

// Tipos de archivo que acepta
type TipoArchivo = 'remesas' | 'recibos_devueltos' | 'devoluciones'

// ============================================================
// PARSER: XLS Remesas del banco (Santander)
// Formato: HTML disfrazado de .xls con tabla
// Columnas: Fecha vencimiento | Nº recibos | Imp. nominal | Número de remesa | Cuenta de abono | Estado
// ============================================================
function parseRemesasXLS(buffer: Buffer): Array<{
  fecha: string
  numRecibos: number
  importe: number
  numeroRemesa: string
  estado: string
}> {
  const resultados: Array<{
    fecha: string
    numRecibos: number
    importe: number
    numeroRemesa: string
    estado: string
  }> = []

  // El archivo .xls del Santander es HTML disfrazado
  const content = buffer.toString('utf-8')
  
  // Detectar si es HTML o XLS real
  if (content.startsWith('<html') || content.includes('<table')) {
    // Parsear como HTML - extraer filas de la tabla
    const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)
    if (!rows) return resultados

    let headerFound = false
    for (const row of rows) {
      const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g)
      if (!cells) continue
      const values = cells.map(c => c.replace(/<[^>]+>/g, '').trim())

      // Detectar cabecera
      if (values[0] === 'Fecha vencimiento') {
        headerFound = true
        continue
      }

      // Filas de datos (después de la cabecera)
      if (headerFound && values.length >= 6 && /^\d{2}\/\d{2}\/\d{4}$/.test(values[0])) {
        const fecha = values[0]
        const numRecibos = parseInt(values[1])
        const importeStr = values[2].replace(' EUR', '').replace('.', '').replace(',', '.')
        const importe = parseFloat(importeStr)
        const numeroRemesa = values[3].replace(/\s+/g, '')
        const estado = values[5]

        if (!isNaN(numRecibos) && !isNaN(importe) && importe > 0) {
          resultados.push({ fecha, numRecibos, importe, numeroRemesa, estado })
        }
      }
    }
  } else {
    // Intentar como XLS real con xlsx
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][]

    let headerRow = -1
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i][0] === 'Fecha vencimiento') {
        headerRow = i
        break
      }
    }

    if (headerRow >= 0) {
      for (let i = headerRow + 1; i < data.length; i++) {
        const row = data[i]
        if (!row || row.length < 6) continue
        if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(row[0]))) continue

        const fecha = String(row[0])
        const numRecibos = parseInt(String(row[1]))
        const importeStr = String(row[2]).replace(' EUR', '').replace('.', '').replace(',', '.')
        const importe = parseFloat(importeStr)
        const numeroRemesa = String(row[3]).replace(/\s+/g, '')
        const estado = String(row[5])

        if (!isNaN(numRecibos) && !isNaN(importe) && importe > 0) {
          resultados.push({ fecha, numRecibos, importe, numeroRemesa, estado })
        }
      }
    }
  }

  return resultados
}

// ============================================================
// PARSER: XLSX Listado de Devoluciones (Santander)
// Columnas: Fecha de cargo | Nº de recibos | Importe cargado | Importe recibos devueltos | Gastos | Número de devolución
// ============================================================
function parseDevolucionesXLSX(buffer: Buffer): Array<{
  fechaCargo: string
  numRecibos: number
  importeCargado: number
  importeRecibos: number
  gastos: number
  numeroDevolución: string
}> {
  const resultados: Array<{
    fechaCargo: string
    numRecibos: number
    importeCargado: number
    importeRecibos: number
    gastos: number
    numeroDevolución: string
  }> = []

  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][]

  // Buscar la fila de cabecera
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i] && (String(data[i][0]).includes('Fecha de cargo') || String(data[i][0]).includes('Fecha'))) {
      headerRow = i
      break
    }
  }

  if (headerRow < 0) return resultados

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 6) continue
    const fechaStr = String(row[0] || '')
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(fechaStr)) continue

    const parseImporte = (val: string | number): number => {
      const s = String(val).replace(' EUR', '').replace('.', '').replace(',', '.')
      return parseFloat(s)
    }

    resultados.push({
      fechaCargo: fechaStr,
      numRecibos: typeof row[1] === 'number' ? row[1] : parseInt(String(row[1])),
      importeCargado: parseImporte(row[2]),
      importeRecibos: parseImporte(row[3]),
      gastos: parseImporte(row[4]),
      numeroDevolución: String(row[5] || '').trim()
    })
  }

  return resultados
}

// ============================================================
// PARSER: XLSX Lista Recibos Devueltos (Santander)
// Columnas: Referencia externa | Deudor | Cuenta deudor | Concepto | Importe recibo | Fecha vencimiento | Motivo devolución | Remesa origen
// ============================================================
function parseRecibosDevueltosXLSX(buffer: Buffer): Array<{
  referenciaExterna: string
  nombreCliente: string
  cuentaDeudor: string
  concepto: string
  importe: number
  fechaVencimiento: string
  motivoDevolucion: string
  remesaOrigen: string
}> {
  const resultados: Array<{
    referenciaExterna: string
    nombreCliente: string
    cuentaDeudor: string
    concepto: string
    importe: number
    fechaVencimiento: string
    motivoDevolucion: string
    remesaOrigen: string
  }> = []

  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number)[][]

  // Buscar la fila de cabecera de recibos
  let headerRow = -1
  for (let i = 0; i < data.length; i++) {
    if (data[i] && String(data[i][0]).includes('Referencia externa')) {
      headerRow = i
      break
    }
  }

  if (headerRow < 0) return resultados

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i]
    if (!row || row.length < 7) continue
    const ref = String(row[0] || '').trim()
    if (!ref || ref.length < 3) continue

    const importeStr = String(row[4] || '').replace(' EUR', '').replace('.', '').replace(',', '.')
    const importe = parseFloat(importeStr)

    if (isNaN(importe) || importe <= 0) continue

    resultados.push({
      referenciaExterna: ref,
      nombreCliente: String(row[1] || '').trim(),
      cuentaDeudor: String(row[2] || '').trim(),
      concepto: String(row[3] || '').trim(),
      importe,
      fechaVencimiento: String(row[5] || '').trim(),
      motivoDevolucion: String(row[6] || '').trim(),
      remesaOrigen: String(row[7] || '').trim()
    })
  }

  return resultados
}

// ============================================================
// POST: Importar archivo del banco (XLS/XLSX)
// ============================================================
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tipo = formData.get('tipo') as TipoArchivo | null

    if (!file || !tipo) {
      return NextResponse.json({ error: 'Falta archivo o tipo' }, { status: 400 })
    }

    if (!['remesas', 'recibos_devueltos', 'devoluciones'].includes(tipo)) {
      return NextResponse.json({ error: 'Tipo inválido. Usar: remesas, recibos_devueltos, devoluciones' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    if (tipo === 'remesas') {
      return await procesarRemesas(buffer, file.name)
    } else if (tipo === 'devoluciones') {
      return await procesarDevoluciones(buffer, file.name)
    } else {
      return await procesarRecibosDevueltos(buffer, file.name)
    }
  } catch (error) {
    console.error('Error importando archivo:', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error procesando el archivo: ${msg}` }, { status: 500 })
  }
}

// ============================================================
// Procesar XLS de Remesas del banco
// ============================================================
async function procesarRemesas(buffer: Buffer, nombreArchivo: string) {
  const remesasBanco = parseRemesasXLS(buffer)

  if (remesasBanco.length === 0) {
    return NextResponse.json({ 
      error: 'No se pudieron extraer remesas del archivo. Verifica que es el formato correcto (XLS del Santander con columnas: Fecha vencimiento, Nº recibos, Imp. nominal, Número de remesa, Cuenta de abono, Estado).' 
    }, { status: 400 })
  }

  let conciliadas = 0
  const errores: string[] = []

  // Obtener todas las remesas ISP
  const remesasISP = await prisma.remesa.findMany({
    include: { conciliacion: true }
  })

  for (const remBanco of remesasBanco) {
    // Buscar movimiento bancario con importe exacto
    const movimiento = await prisma.movimientoBancario.findFirst({
      where: {
        importe: { gte: remBanco.importe - 0.02, lte: remBanco.importe + 0.02 },
        concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' },
      }
    })

    if (!movimiento) {
      errores.push(`No se encontró movimiento bancario para ${remBanco.importe.toFixed(2)}€ del ${remBanco.fecha} (ref: ${remBanco.numeroRemesa})`)
      continue
    }

    // Buscar la remesa ISP más cercana por número de recibos y fecha
    const fechaParts = remBanco.fecha.split('/')
    const fechaBanco = new Date(parseInt(fechaParts[2]), parseInt(fechaParts[1]) - 1, parseInt(fechaParts[0]))
    
    // Filtrar remesas candidatas: ventana temporal (±45 días) y sin conciliación previa
    const candidatas = remesasISP.filter(r => {
      const diffDias = Math.abs((fechaBanco.getTime() - new Date(r.fecha).getTime()) / (1000 * 60 * 60 * 24))
      return diffDias <= 45 && !r.conciliacion
    })

    if (candidatas.length === 0) {
      errores.push(`No se encontró remesa ISP para ${remBanco.numRecibos} recibos del ${remBanco.fecha}`)
      continue
    }

    // Asignar por número de recibos más cercano
    const mejorCandidata = candidatas.reduce((best, curr) => {
      const diffCurr = Math.abs(curr.numeroRegistros - remBanco.numRecibos)
      const diffBest = Math.abs(best.numeroRegistros - remBanco.numRecibos)
      return diffCurr < diffBest ? curr : best
    })

    // Solo asignar si la diferencia de recibos es razonable (< 50%)
    const diffRecibos = mejorCandidata.numeroRegistros - remBanco.numRecibos
    if (diffRecibos < 0 || diffRecibos > mejorCandidata.numeroRegistros * 0.5) {
      errores.push(`${remBanco.numRecibos} recibos (${remBanco.fecha}) no coincide con ${mejorCandidata.nombre} (${mejorCandidata.numeroRegistros} registros)`)
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
        importeRemesa,
        importeMovimiento: remBanco.importe,
        diferencia,
        estado: Math.abs(diferencia) < 1 ? 'CONCILIADA' : 'DIFERENCIA',
        fechaConciliacion: new Date(),
        recibosRemesados: mejorCandidata.numeroRegistros,
        recibosCobrados: remBanco.numRecibos,
        rechazos: diffRecibos,
        referenciaRemesaBanco: remBanco.numeroRemesa,
        notas: `Importado desde: ${nombreArchivo}`
      },
      update: {
        movimientoBancarioId: movimiento.id,
        importeMovimiento: remBanco.importe,
        diferencia,
        estado: Math.abs(diferencia) < 1 ? 'CONCILIADA' : 'DIFERENCIA',
        fechaConciliacion: new Date(),
        recibosCobrados: remBanco.numRecibos,
        rechazos: diffRecibos,
        referenciaRemesaBanco: remBanco.numeroRemesa,
        notas: `Actualizado desde: ${nombreArchivo}`
      }
    })

    // Marcar como usada para no reasignar
    const idx = remesasISP.findIndex(r => r.id === mejorCandidata.id)
    if (idx >= 0) {
      remesasISP[idx] = { ...remesasISP[idx], conciliacion: {} as never }
    }

    conciliadas++
  }

  return NextResponse.json({
    ok: true,
    tipo: 'remesas',
    mensaje: `PDF Remesas procesado: ${conciliadas} remesas conciliadas de ${remesasBanco.length} en el archivo${errores.length > 0 ? ` (${errores.length} errores)` : ''}`,
    resumen: {
      totalEnArchivo: remesasBanco.length,
      conciliadas,
      errores: errores.length,
      detalleErrores: errores
    }
  })
}

// ============================================================
// Procesar XLSX de Listado de Devoluciones
// ============================================================
async function procesarDevoluciones(buffer: Buffer, nombreArchivo: string) {
  const devoluciones = parseDevolucionesXLSX(buffer)

  if (devoluciones.length === 0) {
    return NextResponse.json({ 
      error: 'No se pudieron extraer devoluciones del archivo. Verifica que es el formato correcto (XLSX del Santander - Listado devoluciones).' 
    }, { status: 400 })
  }

  // Este archivo solo tiene el resumen (fecha, nº recibos, importe total, comisiones)
  // Lo guardamos como referencia pero el detalle viene del archivo "Recibos devueltos"
  return NextResponse.json({
    ok: true,
    tipo: 'devoluciones',
    mensaje: `Listado de devoluciones procesado: ${devoluciones.length} registros. Total devuelto: ${devoluciones.reduce((s, d) => s + d.importeRecibos, 0).toFixed(2)}€, Comisiones: ${devoluciones.reduce((s, d) => s + d.gastos, 0).toFixed(2)}€`,
    resumen: {
      totalRegistros: devoluciones.length,
      totalDevuelto: devoluciones.reduce((s, d) => s + d.importeRecibos, 0),
      totalComisiones: devoluciones.reduce((s, d) => s + d.gastos, 0),
      datos: devoluciones
    }
  })
}

// ============================================================
// Procesar XLSX de Recibos Devueltos (detalle con clientes)
// ============================================================
async function procesarRecibosDevueltos(buffer: Buffer, nombreArchivo: string) {
  const recibos = parseRecibosDevueltosXLSX(buffer)

  if (recibos.length === 0) {
    return NextResponse.json({ 
      error: 'No se pudieron extraer recibos devueltos del archivo. Verifica que es el formato correcto (XLSX del Santander - Lista recibos devueltos).' 
    }, { status: 400 })
  }

  let importados = 0
  const errores: string[] = []

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
    mensaje: `Recibos devueltos procesados: ${importados} de ${recibos.length}${errores.length > 0 ? ` (${errores.length} errores)` : ''}`,
    resumen: {
      totalEnArchivo: recibos.length,
      importados,
      errores: errores.length,
      detalleErrores: errores
    }
  })
}
