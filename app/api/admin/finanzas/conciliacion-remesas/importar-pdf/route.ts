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

  const content = buffer.toString('utf-8')
  
  if (content.startsWith('<html') || content.includes('<table')) {
    const rows = content.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)
    if (!rows) return resultados

    let headerFound = false
    for (const row of rows) {
      const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g)
      if (!cells) continue
      const values = cells.map((c: string) => c.replace(/<[^>]+>/g, '').trim())

      if (values[0] === 'Fecha vencimiento') {
        headerFound = true
        continue
      }

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
// POST: Importar archivos del banco (XLS/XLSX)
// Soporta múltiples archivos en una sola petición
// ============================================================
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const tipo = formData.get('tipo') as TipoArchivo | null
    
    // Obtener todos los archivos (soporta múltiples)
    const files = formData.getAll('file') as File[]

    if (!files || files.length === 0 || !tipo) {
      return NextResponse.json({ error: 'Falta archivo o tipo' }, { status: 400 })
    }

    if (!['remesas', 'recibos_devueltos', 'devoluciones'].includes(tipo)) {
      return NextResponse.json({ error: 'Tipo inválido. Usar: remesas, recibos_devueltos, devoluciones' }, { status: 400 })
    }

    // Leer todos los buffers
    const buffers: Array<{ buffer: Buffer; name: string }> = []
    for (const file of files) {
      buffers.push({ buffer: Buffer.from(await file.arrayBuffer()), name: file.name })
    }

    if (tipo === 'remesas') {
      return await procesarRemesas(buffers)
    } else if (tipo === 'devoluciones') {
      return await procesarDevoluciones(buffers[0].buffer, buffers[0].name)
    } else {
      return await procesarRecibosDevueltos(buffers[0].buffer, buffers[0].name)
    }
  } catch (error) {
    console.error('Error importando archivo:', error)
    const msg = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: `Error procesando el archivo: ${msg}` }, { status: 500 })
  }
}

// ============================================================
// Procesar XLS de Remesas del banco (múltiples archivos)
// IDEMPOTENTE: borra conciliaciones previas del periodo y las recrea
// LÓGICA: Cada remesa ISP tiene 1 movimiento principal (nº recibos cercano)
//         Los movimientos pequeños (1-5 recibos) son recobros de meses anteriores
// ============================================================
async function procesarRemesas(archivos: Array<{ buffer: Buffer; name: string }>) {
  // Concatenar todas las filas de todos los archivos
  const todasLasRemesasBanco: Array<{
    fecha: string
    numRecibos: number
    importe: number
    numeroRemesa: string
    estado: string
  }> = []

  for (const archivo of archivos) {
    const filas = parseRemesasXLS(archivo.buffer)
    todasLasRemesasBanco.push(...filas)
  }

  if (todasLasRemesasBanco.length === 0) {
    return NextResponse.json({ 
      error: 'No se pudieron extraer remesas de los archivos. Verifica que son archivos XLS del Santander (Remesas - Selecciona una remesa...).' 
    }, { status: 400 })
  }

  // Determinar el mes del archivo (usar la fecha más frecuente)
  const fechas = todasLasRemesasBanco.map(r => {
    const p = r.fecha.split('/')
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
  })
  const mesArchivo = fechas[0].getMonth() // 0-indexed
  const anioArchivo = fechas[0].getFullYear()
  
  // Rango del mes del archivo
  const inicioMes = new Date(anioArchivo, mesArchivo, 1)
  const finMes = new Date(anioArchivo, mesArchivo + 1, 0)

  // Borrar conciliaciones previas del mes (IDEMPOTENTE)
  const remesasDelMes = await prisma.remesa.findMany({
    where: {
      fecha: { gte: inicioMes, lte: finMes }
    },
    include: { conciliacion: true }
  })

  const idsConConciliacion = remesasDelMes
    .filter(r => r.conciliacion)
    .map(r => r.conciliacion!.id)

  if (idsConConciliacion.length > 0) {
    await prisma.conciliacionRemesa.deleteMany({
      where: { id: { in: idsConConciliacion } }
    })
  }

  // Obtener remesas ISP del mes (solo del mes del archivo)
  const remesasISP = await prisma.remesa.findMany({
    where: {
      fecha: { gte: inicioMes, lte: finMes }
    },
    orderBy: { totalImporte: 'desc' }
  })

  if (remesasISP.length === 0) {
    return NextResponse.json({ 
      error: `No hay remesas ISP para ${String(mesArchivo + 1).padStart(2, '0')}/${anioArchivo}. Verifica que las remesas de ISPGestión están importadas.` 
    }, { status: 400 })
  }

  // PASO 1: Vincular cada fila del XLS con su movimiento bancario por REFERENCIA DE REMESA
  // El concepto del movimiento bancario contiene la referencia: "Emision Remesa Sepa Sdd Referencia: 0049 2482 753 000084s"
  // El XLS del banco tiene el campo "Número de remesa" con la misma referencia (ej: "00492482753000084S")
  // Normalizamos ambas para cruzar: quitamos espacios y pasamos a minúsculas
  
  // Cargar todos los movimientos bancarios de remesa del mes
  const movimientosBancarios = await prisma.movimientoBancario.findMany({
    where: {
      cuentaId: '50910c7d-76f3-493e-8aed-962f22fc1413', // Santander Principal
      fechaOperacion: { gte: inicioMes, lte: finMes },
      concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' }
    }
  })

  // Crear mapa de referencia normalizada → movimiento bancario
  const mapaMovimientos = new Map<string, typeof movimientosBancarios[0]>()
  for (const mov of movimientosBancarios) {
    // Extraer referencia del concepto: últimos caracteres después de "Referencia:"
    const match = mov.concepto.match(/[Rr]eferencia:\s*(.+)$/)
    if (match) {
      const refNorm = match[1].replace(/\s+/g, '').toLowerCase()
      mapaMovimientos.set(refNorm, mov)
    }
  }

  // PASO 2: Para cada fila del XLS, buscar su movimiento bancario por referencia
  let conciliadas = 0
  const errores: string[] = []
  const remesasUsadas = new Set<number>()
  const movimientosPrincipales: typeof todasLasRemesasBanco = []
  const recobros: typeof todasLasRemesasBanco = []

  for (const remBanco of todasLasRemesasBanco) {
    // Normalizar referencia del XLS (quitar espacios, minúsculas)
    const refXLS = remBanco.numeroRemesa.replace(/\s+/g, '').toLowerCase()
    
    // Buscar movimiento bancario con esta referencia
    const movimiento = mapaMovimientos.get(refXLS)
    
    if (!movimiento) {
      // Intentar búsqueda parcial (los últimos 7 caracteres de la referencia)
      const refCorta = refXLS.slice(-7)
      let movEncontrado = null
      for (const [key, mov] of mapaMovimientos.entries()) {
        if (key.endsWith(refCorta)) {
          movEncontrado = mov
          break
        }
      }
      
      if (!movEncontrado) {
        // No encontramos movimiento bancario → es un recobro o no está importado
        recobros.push(remBanco)
        continue
      }
      
      // Encontrado por búsqueda parcial
      await vincularRemesa(remBanco, movEncontrado, remesasISP, remesasUsadas, archivos, errores)
      if (!remesasUsadas.has(-1)) conciliadas++ // Se incrementa dentro de vincularRemesa
      continue
    }

    // Encontrado por referencia exacta
    const resultado = await vincularRemesa(remBanco, movimiento, remesasISP, remesasUsadas, archivos, errores)
    if (resultado) conciliadas++
    else recobros.push(remBanco)
  }

  // PASO 3: Calcular totales de recobros
  const totalRecobros = recobros.reduce((sum, r) => sum + r.importe, 0)
  const totalReciboRecobros = recobros.reduce((sum, r) => sum + r.numRecibos, 0)

  return NextResponse.json({
    ok: true,
    tipo: 'remesas',
    mensaje: `${conciliadas} remesas conciliadas de ${remesasISP.length} del mes. ${recobros.length} movimientos son recobros (${totalReciboRecobros} recibos, ${totalRecobros.toFixed(2)}€)${errores.length > 0 ? `. ${errores.length} errores.` : ''}`,
    resumen: {
      totalArchivos: archivos.length,
      totalFilas: todasLasRemesasBanco.length,
      conciliadas,
      recobros: recobros.length,
      importeRecobros: totalRecobros,
      errores: errores.length,
      detalleErrores: errores
    }
  })
}

/**
 * Vincula una fila del XLS de remesas con una remesa ISP, usando el movimiento bancario encontrado.
 * Asigna la remesa ISP por número de recibos más cercano.
 * Retorna true si se concilió correctamente.
 */
async function vincularRemesa(
  remBanco: { fecha: string; numRecibos: number; importe: number; numeroRemesa: string; estado: string },
  movimiento: { id: string; importe: number },
  remesasISP: Array<{ id: number; nombre: string; numeroRegistros: number; totalImporte: any }>,
  remesasUsadas: Set<number>,
  archivos: Array<{ name: string }>,
  errores: string[]
): Promise<boolean> {
  // Filtrar remesas candidatas no usadas
  const candidatas = remesasISP.filter(r => !remesasUsadas.has(r.id))

  if (candidatas.length === 0) {
    errores.push(`Sin remesa ISP disponible para ref ${remBanco.numeroRemesa} (${remBanco.numRecibos} recibos, ${remBanco.importe.toFixed(2)}€)`)
    return false
  }

  // Asignar por número de recibos más cercano
  const mejorCandidata = candidatas.reduce((best, curr) => {
    const currValida = remBanco.numRecibos <= curr.numeroRegistros
    const bestValida = remBanco.numRecibos <= best.numeroRegistros
    
    if (currValida && !bestValida) return curr
    if (!currValida && bestValida) return best
    
    const diffCurr = Math.abs(curr.numeroRegistros - remBanco.numRecibos)
    const diffBest = Math.abs(best.numeroRegistros - remBanco.numRecibos)
    if (diffCurr === diffBest) {
      const ratioCurr = Math.abs(Number(curr.totalImporte) - remBanco.importe)
      const ratioBest = Math.abs(Number(best.totalImporte) - remBanco.importe)
      return ratioCurr < ratioBest ? curr : best
    }
    return diffCurr < diffBest ? curr : best
  })

  // Verificar que la asignación tiene sentido (ratio entre 40% y 110%)
  const ratio = remBanco.numRecibos / mejorCandidata.numeroRegistros
  if (ratio < 0.4 || ratio > 1.1) {
    errores.push(`Ref ${remBanco.numeroRemesa}: ${remBanco.numRecibos} recibos no coincide con ${mejorCandidata.nombre} (${mejorCandidata.numeroRegistros} reg)`)
    return false
  }

  const importeRemesa = Number(mejorCandidata.totalImporte)
  const diferencia = remBanco.importe - importeRemesa
  const rechazos = mejorCandidata.numeroRegistros - remBanco.numRecibos

  await prisma.conciliacionRemesa.create({
    data: {
      remesaId: mejorCandidata.id,
      movimientoBancarioId: movimiento.id,
      importeRemesa,
      importeMovimiento: remBanco.importe,
      diferencia,
      estado: rechazos <= 0 ? 'CONCILIADA' : 'DIFERENCIA',
      fechaConciliacion: new Date(),
      recibosRemesados: mejorCandidata.numeroRegistros,
      recibosCobrados: remBanco.numRecibos,
      rechazos: Math.max(0, rechazos),
      referenciaRemesaBanco: remBanco.numeroRemesa,
      notas: `Vinculado por referencia ${remBanco.numeroRemesa}. Importado desde: ${archivos.map(a => a.name).join(', ')}`
    }
  })

  remesasUsadas.add(mejorCandidata.id)
  return true
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

  return NextResponse.json({
    ok: true,
    tipo: 'devoluciones',
    mensaje: `Listado de devoluciones procesado: ${devoluciones.length} registros. Total devuelto: ${devoluciones.reduce((s, d) => s + d.importeRecibos, 0).toFixed(2)}€, Comisiones banco: ${devoluciones.reduce((s, d) => s + d.gastos, 0).toFixed(2)}€`,
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
// ACUMULATIVO: se puede subir varias veces, no duplica
// ============================================================
async function procesarRecibosDevueltos(buffer: Buffer, nombreArchivo: string) {
  const recibos = parseRecibosDevueltosXLSX(buffer)

  if (recibos.length === 0) {
    return NextResponse.json({ 
      error: 'No se pudieron extraer recibos devueltos del archivo. Verifica que es el formato correcto (XLSX del Santander - Lista recibos devueltos).' 
    }, { status: 400 })
  }

  let importados = 0
  let actualizados = 0
  const errores: string[] = []

  for (const recibo of recibos) {
    // Extraer número de factura del concepto o referencia
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
      errores.push(`No se pudo extraer nº factura de ref: ${recibo.referenciaExterna}`)
      continue
    }

    // Buscar la factura en BD
    const factura = await prisma.factura.findFirst({
      where: { numeroDocumento: { contains: numeroFactura, mode: 'insensitive' } }
    })

    // Determinar la remesa a la que pertenece por la serie de la factura
    let remesaId: number | null = null
    const serie = recibo.referenciaExterna.match(/^([A-Z]+)/)?.[1] || ''
    
    const fechaParts = recibo.fechaVencimiento.split('/')
    if (fechaParts.length === 3) {
      const mes = parseInt(fechaParts[1])
      const anio = parseInt(fechaParts[2])
      
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

    // Verificar si ya existe esta devolución (por referencia + importe)
    const existente = await prisma.devolucionRemesa.findFirst({
      where: {
        referenciaExterna: recibo.referenciaExterna,
        importe: { gte: recibo.importe - 0.01, lte: recibo.importe + 0.01 }
      }
    })

    if (existente) {
      // Actualizar con datos más recientes
      await prisma.devolucionRemesa.update({
        where: { id: existente.id },
        data: {
          nombreCliente: recibo.nombreCliente || existente.nombreCliente,
          motivoBanco: recibo.motivoDevolucion || existente.motivoBanco,
          facturaId: factura?.id || existente.facturaId,
          remesaId: remesaId || existente.remesaId,
          numeroFactura: numeroFactura || existente.numeroFactura,
        }
      })
      actualizados++
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
    mensaje: `Recibos devueltos: ${importados} nuevos, ${actualizados} actualizados de ${recibos.length} en el archivo${errores.length > 0 ? ` (${errores.length} errores)` : ''}`,
    resumen: {
      totalEnArchivo: recibos.length,
      importados,
      actualizados,
      errores: errores.length,
      detalleErrores: errores
    }
  })
}
