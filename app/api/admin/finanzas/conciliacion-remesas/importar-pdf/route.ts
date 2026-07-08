import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { listFolderByPath, downloadFileById } from '@/lib/microsoft-graph'
import { parsearPdfRemesaISP } from '@/lib/finanzas/parsers/remesa-ispgestion'
import { parsearPdfRemesaSantander } from '@/lib/finanzas/parsers/remesa-santander'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx')

// Tipos de archivo que acepta
type TipoArchivo = 'remesas' | 'recibos_devueltos' | 'devoluciones'

// Ruta base en OneDrive para facturas emitidas y remesas
const REMESAS_BASE_PATH = '2. Contabilidad y finanzas/1. Facturas emitidas y remesas/1. Facturas emitidas y remesas- Internet Operadores'

const MESES_NOMBRES: Record<number, string> = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre',
}

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
// NUEVA LÓGICA v2:
// 1. Lee PDFs de ISPGestión desde OneDrive → agrupa recibos por fecha vencimiento
// 2. Cruza con filas del XLS del banco por fecha + numRecibos + importe
// 3. Crea sub-remesas con la referencia del banco
// 4. Vincula con movimientos bancarios por referencia
// 5. Doble cotejo con PDF Santander de OneDrive
// 6. Calcula pendiente de abonar
// ============================================================
async function procesarRemesas(archivos: Array<{ buffer: Buffer; name: string }>) {
  // Concatenar todas las filas de todos los archivos XLS
  const todasLasFilasBanco: Array<{
    fecha: string
    numRecibos: number
    importe: number
    numeroRemesa: string
    estado: string
  }> = []

  for (const archivo of archivos) {
    const filas = parseRemesasXLS(archivo.buffer)
    todasLasFilasBanco.push(...filas)
  }

  if (todasLasFilasBanco.length === 0) {
    return NextResponse.json({ 
      error: 'No se pudieron extraer remesas de los archivos. Verifica que son archivos XLS del Santander.' 
    }, { status: 400 })
  }

  // Determinar el mes del archivo
  const fechas = todasLasFilasBanco.map(r => {
    const p = r.fecha.split('/')
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]))
  })
  const mesArchivo = fechas[0].getMonth() // 0-indexed
  const anioArchivo = fechas[0].getFullYear()
  const mesNombre = MESES_NOMBRES[mesArchivo + 1]
  
  // Rango del mes
  const inicioMes = new Date(anioArchivo, mesArchivo, 1)
  const finMes = new Date(anioArchivo, mesArchivo + 1, 0)

  // Obtener remesas ISP del mes
  const remesasISP = await prisma.remesa.findMany({
    where: {
      fecha: { gte: inicioMes, lte: finMes }
    },
    include: { conciliacion: { include: { subRemesas: true } } },
    orderBy: { totalImporte: 'desc' }
  })

  if (remesasISP.length === 0) {
    return NextResponse.json({ 
      error: `No hay remesas ISP para ${mesNombre} ${anioArchivo}. Verifica que las remesas de ISPGestión están importadas.` 
    }, { status: 400 })
  }

  // Borrar conciliaciones previas del mes (IDEMPOTENTE)
  const idsConConciliacion = remesasISP
    .filter(r => r.conciliacion)
    .map(r => r.conciliacion!.id)

  if (idsConConciliacion.length > 0) {
    // SubRemesas se borran en cascada
    await prisma.conciliacionRemesa.deleteMany({
      where: { id: { in: idsConConciliacion } }
    })
  }

  // PASO 1: Leer PDFs de ISPGestión desde OneDrive para obtener desglose por vencimiento
  const carpetaRemesas = `${REMESAS_BASE_PATH}/${anioArchivo}/${mesNombre} ${anioArchivo}`
  let pdfsISP: Array<{ remesaId: number; nombre: string; subGrupos: Array<{ fecha: string; numRecibos: number; importe: number }> }> = []
  
  try {
    const archivosOneDrive = await listFolderByPath(carpetaRemesas)
    
    // Buscar PDFs de ISPGestión (formato: "82- JUNIO 2026 LLEIDA.pdf")
    const pdfsISPFiles = archivosOneDrive.filter(f => 
      f.file && 
      f.name.endsWith('.pdf') && 
      /^\d+[-–]\s/.test(f.name) && // Empieza con número + guión
      !f.name.toLowerCase().includes('santander')
    )

    for (const pdfFile of pdfsISPFiles) {
      // Extraer número de remesa del nombre: "82- JUNIO 2026 LLEIDA.pdf" → 82
      const numMatch = pdfFile.name.match(/^(\d+)/)
      if (!numMatch) continue
      const numRemesaISP = parseInt(numMatch[1])

      // Buscar la remesa ISP correspondiente por ispGestionId
      const remesaISP = remesasISP.find(r => r.ispGestionId === numRemesaISP)
      if (!remesaISP) continue

      try {
        const buffer = await downloadFileById(pdfFile.id)
        const parsed = await parsearPdfRemesaISP(buffer)
        
        pdfsISP.push({
          remesaId: remesaISP.id,
          nombre: remesaISP.nombre,
          subGrupos: parsed.subGrupos.map(sg => ({
            fecha: sg.fechaVencimiento,
            numRecibos: sg.numRecibos,
            importe: sg.importeTotal,
          }))
        })
      } catch (e) {
        console.error(`Error parseando PDF ISP ${pdfFile.name}:`, e)
      }
    }
  } catch (e) {
    console.error(`No se pudo acceder a OneDrive (${carpetaRemesas}):`, e)
    // Continuar sin PDFs de OneDrive — usaremos solo el XLS
  }

  // PASO 2: Leer PDFs del Santander desde OneDrive para doble cotejo
  let pdfsSantander: Array<{ nombre: string; subRemesas: Array<{ fecha: string; numRecibos: number; importe: number }> }> = []
  
  try {
    const archivosOneDrive = await listFolderByPath(carpetaRemesas)
    const pdfsSantFiles = archivosOneDrive.filter(f => 
      f.file && 
      f.name.endsWith('.pdf') && 
      f.name.toLowerCase().includes('santander')
    )

    for (const pdfFile of pdfsSantFiles) {
      try {
        const buffer = await downloadFileById(pdfFile.id)
        const parsed = await parsearPdfRemesaSantander(buffer)
        
        pdfsSantander.push({
          nombre: pdfFile.name,
          subRemesas: parsed.subRemesas.map(sr => ({
            fecha: sr.fechaCobro,
            numRecibos: sr.numOrdenes,
            importe: sr.subtotal,
          }))
        })
      } catch (e) {
        console.error(`Error parseando PDF Santander ${pdfFile.name}:`, e)
      }
    }
  } catch (e) {
    // Ya se intentó arriba, no repetir error
  }

  // PASO 3: Cargar movimientos bancarios de remesa del mes
  const movimientosBancarios = await prisma.movimientoBancario.findMany({
    where: {
      cuentaId: '50910c7d-76f3-493e-8aed-962f22fc1413', // Santander Principal
      fechaOperacion: { gte: inicioMes, lte: new Date(anioArchivo, mesArchivo + 1, 15) }, // Hasta 15 del mes siguiente
      concepto: { contains: 'Emision Remesa Sepa', mode: 'insensitive' }
    }
  })

  // Mapa: referencia normalizada → movimiento bancario
  const mapaMovimientos = new Map<string, typeof movimientosBancarios[0]>()
  for (const mov of movimientosBancarios) {
    const match = mov.concepto.match(/[Rr]eferencia:\s*(.+)$/)
    if (match) {
      const refNorm = match[1].replace(/\s+/g, '').toLowerCase()
      mapaMovimientos.set(refNorm, mov)
    }
  }

  // PASO 4: Para cada remesa ISP, vincular sub-remesas del XLS
  let conciliadas = 0
  const errores: string[] = []
  const filasUsadas = new Set<number>()
  const resultadosDetalle: Array<{
    remesa: string
    subRemesas: number
    cobradas: number
    importeTotal: number
    importeCobrado: number
    pendiente: number
  }> = []

  for (const remesaISP of remesasISP) {
    // Obtener sub-grupos del PDF de ISPGestión (si existe)
    const pdfISP = pdfsISP.find(p => p.remesaId === remesaISP.id)
    
    // Buscar filas del XLS que corresponden a esta remesa
    let filasAsignadas: Array<{ idx: number; fila: typeof todasLasFilasBanco[0] }> = []

    if (pdfISP && pdfISP.subGrupos.length > 0) {
      // MÉTODO PRINCIPAL: Cruzar por fecha + numRecibos + importe (con tolerancia)
      for (const subGrupo of pdfISP.subGrupos) {
        const fechaISP = subGrupo.fecha // DD/MM/YYYY
        
        for (let i = 0; i < todasLasFilasBanco.length; i++) {
          if (filasUsadas.has(i)) continue
          const fila = todasLasFilasBanco[i]
          
          // Comparar fecha
          if (fila.fecha !== fechaISP) continue
          
          // Comparar número de recibos (exacto)
          if (fila.numRecibos !== subGrupo.numRecibos) continue
          
          // Comparar importe (tolerancia 1€ por posibles redondeos)
          if (Math.abs(fila.importe - subGrupo.importe) > 1.0) continue
          
          // Match encontrado
          filasAsignadas.push({ idx: i, fila })
          filasUsadas.add(i)
          break
        }
      }
    }

    // MÉTODO FALLBACK: Si no tenemos PDF o no encontramos todas las sub-remesas,
    // buscar la fila del XLS con mayor número de recibos que encaje con la remesa
    if (filasAsignadas.length === 0) {
      // Buscar filas cuya suma de recibos se acerque al total de la remesa ISP
      // Primero intentar con la fila más grande (> 60% de los recibos)
      for (let i = 0; i < todasLasFilasBanco.length; i++) {
        if (filasUsadas.has(i)) continue
        const fila = todasLasFilasBanco[i]
        const ratio = fila.numRecibos / remesaISP.numeroRegistros
        if (ratio >= 0.60 && ratio <= 1.05) {
          filasAsignadas.push({ idx: i, fila })
          filasUsadas.add(i)
          // Seguir buscando más filas que puedan pertenecer a esta remesa
          // (sub-remesas con pocos recibos del mismo día)
        }
      }
      
      // Si encontramos la principal, buscar complementarias (misma fecha pero menos recibos)
      if (filasAsignadas.length > 0) {
        const totalAsignado = filasAsignadas.reduce((s, f) => s + f.fila.numRecibos, 0)
        const faltantes = remesaISP.numeroRegistros - totalAsignado
        
        if (faltantes > 0) {
          // Buscar filas pequeñas que complementen
          for (let i = 0; i < todasLasFilasBanco.length; i++) {
            if (filasUsadas.has(i)) continue
            const fila = todasLasFilasBanco[i]
            if (fila.numRecibos <= faltantes && fila.numRecibos <= 10) {
              filasAsignadas.push({ idx: i, fila })
              filasUsadas.add(i)
            }
          }
        }
      }
    }

    if (filasAsignadas.length === 0) {
      errores.push(`${remesaISP.nombre}: No se encontraron sub-remesas en el XLS`)
      // Crear conciliación sin sub-remesas (pendiente)
      await prisma.conciliacionRemesa.create({
        data: {
          remesaId: remesaISP.id,
          importeRemesa: Number(remesaISP.totalImporte),
          estado: 'PENDIENTE',
          recibosRemesados: remesaISP.numeroRegistros,
          notas: `Sin sub-remesas encontradas. Archivos: ${archivos.map(a => a.name).join(', ')}`
        }
      })
      continue
    }

    // Crear conciliación con sub-remesas
    const importeRemesa = Number(remesaISP.totalImporte)
    let importeCobrado = 0
    let subRemesasCobradas = 0

    const conciliacion = await prisma.conciliacionRemesa.create({
      data: {
        remesaId: remesaISP.id,
        importeRemesa,
        recibosRemesados: remesaISP.numeroRegistros,
        recibosCobrados: filasAsignadas.reduce((s, f) => s + f.fila.numRecibos, 0),
        rechazos: Math.max(0, remesaISP.numeroRegistros - filasAsignadas.reduce((s, f) => s + f.fila.numRecibos, 0)),
        referenciaRemesaBanco: filasAsignadas.map(f => f.fila.numeroRemesa).join(', '),
        notas: `${filasAsignadas.length} sub-remesas. Archivos: ${archivos.map(a => a.name).join(', ')}`
      }
    })

    // Crear sub-remesas y vincular con movimientos bancarios
    for (const { fila } of filasAsignadas) {
      const refNorm = fila.numeroRemesa.replace(/\s+/g, '').toLowerCase()
      
      // Buscar movimiento bancario por referencia
      let movimiento = mapaMovimientos.get(refNorm)
      if (!movimiento) {
        // Fallback: búsqueda parcial por últimos 7 caracteres
        const refCorta = refNorm.slice(-7)
        for (const [key, mov] of mapaMovimientos.entries()) {
          if (key.endsWith(refCorta)) {
            movimiento = mov
            break
          }
        }
      }

      const cobrado = !!movimiento
      if (cobrado) {
        importeCobrado += movimiento!.importe
        subRemesasCobradas++
      }

      // Parsear fecha vencimiento
      const [d, m, y] = fila.fecha.split('/').map(Number)
      const fechaVenc = new Date(y, m - 1, d)

      await prisma.subRemesaBanco.create({
        data: {
          conciliacionId: conciliacion.id,
          referenciaRemesa: fila.numeroRemesa,
          fechaVencimiento: fechaVenc,
          numRecibos: fila.numRecibos,
          importe: fila.importe,
          movimientoBancarioId: movimiento?.id || null,
          cobrado,
        }
      })
    }

    // Actualizar conciliación con totales
    const pendienteAbonar = filasAsignadas.reduce((s, f) => s + f.fila.importe, 0) - importeCobrado
    const importeMovimiento = filasAsignadas.reduce((s, f) => s + f.fila.importe, 0)
    const diferencia = importeMovimiento - importeRemesa

    const estado = pendienteAbonar <= 0.01 
      ? (Math.abs(diferencia) <= 0.01 ? 'CONCILIADA' : 'DIFERENCIA')
      : 'PENDIENTE'

    await prisma.conciliacionRemesa.update({
      where: { id: conciliacion.id },
      data: {
        importeMovimiento,
        importeCobrado,
        pendienteAbonar: Math.max(0, pendienteAbonar),
        diferencia,
        estado,
        fechaConciliacion: estado === 'CONCILIADA' ? new Date() : null,
        movimientoBancarioId: filasAsignadas.length === 1 ? (mapaMovimientos.get(filasAsignadas[0].fila.numeroRemesa.replace(/\s+/g, '').toLowerCase())?.id || null) : null,
      }
    })

    conciliadas++
    resultadosDetalle.push({
      remesa: remesaISP.nombre,
      subRemesas: filasAsignadas.length,
      cobradas: subRemesasCobradas,
      importeTotal: importeMovimiento,
      importeCobrado,
      pendiente: Math.max(0, pendienteAbonar),
    })
  }

  // PASO 5: Las filas no usadas son recobros
  const recobros = todasLasFilasBanco.filter((_, i) => !filasUsadas.has(i))
  const totalRecobros = recobros.reduce((sum, r) => sum + r.importe, 0)
  const totalReciboRecobros = recobros.reduce((sum, r) => sum + r.numRecibos, 0)

  // PASO 6: Doble cotejo con PDFs Santander
  let cotejo = ''
  if (pdfsSantander.length > 0) {
    const totalSubRemesasSantander = pdfsSantander.reduce((s, p) => s + p.subRemesas.length, 0)
    cotejo = ` Doble cotejo: ${pdfsSantander.length} PDFs Santander leídos (${totalSubRemesasSantander} sub-remesas).`
  }

  return NextResponse.json({
    ok: true,
    tipo: 'remesas',
    mensaje: `${conciliadas} remesas conciliadas de ${remesasISP.length}.${recobros.length > 0 ? ` ${recobros.length} recobros (${totalReciboRecobros} rec, ${totalRecobros.toFixed(2)}€).` : ''}${errores.length > 0 ? ` ${errores.length} errores.` : ''}${cotejo}`,
    resumen: {
      totalArchivos: archivos.length,
      totalFilas: todasLasFilasBanco.length,
      conciliadas,
      recobros: recobros.length,
      importeRecobros: totalRecobros,
      pdfsISPLeidos: pdfsISP.length,
      pdfsSantanderLeidos: pdfsSantander.length,
      errores: errores.length,
      detalleErrores: errores,
      detalle: resultadosDetalle,
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
