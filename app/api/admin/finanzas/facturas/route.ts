import { NextRequest } from 'next/server'
import { CalidadFacturaRecibida, EstadoFactura, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { auditarCambioB2, buscarIdentidadBloqueada, jsonPrivado, readBoundedJsonB2, requireFacturaAccess, serializeFacturaCalidad } from '@/lib/finanzas/invoice-quality-db'
import { facturaEconomicaWhere, facturaNoConfirmingDraxtonWhere } from '@/lib/finanzas/invoice-economic-filter'
import { claveCanonicaFactura, esFechaDocumentoIso, esImporteCentimosFinito, esImporteFinito, fechaDocumentoUtc, totalCuadraEnCentimos } from '@/lib/finanzas/invoice-quality'

export const dynamic = 'force-dynamic'
const MAX_PAGE = 100_000
const MAX_LIMIT = 100
const MAX_TEXT = 300

function positive(value: string | null, fallback: number, max: number) {
  if (value === null) return fallback
  if (!/^[1-9]\d*$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number <= max ? number : null
}
function safeText(value: unknown, required = false) {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFKC').trim()
  if ((required && !text) || text.length > MAX_TEXT || /[\u0000-\u001F\u007F]/.test(text)) return null
  return text || null
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireFacturaAccess(false)
    if ('error' in access) return access.error
    const query = req.nextUrl.searchParams
    const page = positive(query.get('page'), 1, MAX_PAGE)
    const limit = positive(query.get('limit'), 50, MAX_LIMIT)
    if (!page || !limit) return jsonPrivado({ error: 'Paginación inválida' }, 400)
    const desde = query.get('desde'), hasta = query.get('hasta')
    if ((desde && !esFechaDocumentoIso(desde)) || (hasta && !esFechaDocumentoIso(hasta))) return jsonPrivado({ error: 'Fecha de filtro inválida' }, 400)
    // Por defecto se listan todas las facturas recibidas no-confirming y se conserva
    // su marca de calidad. incluirCalidad=false mantiene el listado económico legado.
    const soloEconomicas = query.has('incluirCalidad') && query.get('incluirCalidad') !== 'true'
    const estado = query.get('estado')
    const calidad = query.get('calidad')
    // C9 centraliza la exclusión por naturaleza; nunca depende de un texto de carpeta mutable.
    const conditions: Prisma.FacturaRecibidaWhereInput[] = [facturaNoConfirmingDraxtonWhere, { naturalezaDocumento: 'FACTURA_RECIBIDA' }]
    if (soloEconomicas) conditions.push(facturaEconomicaWhere)
    const where: Prisma.FacturaRecibidaWhereInput = { AND: conditions }
    if (calidad && ['VALIDA', 'REVISAR_LECTURA', 'COPIA'].includes(calidad)) where.calidad = calidad as CalidadFacturaRecibida
    else if (calidad) return jsonPrivado({ error: 'Calidad inválida' }, 400)
    if (estado && ['PENDIENTE_REVISION', 'VALIDADA', 'CONTABILIZADA', 'RECHAZADA'].includes(estado)) where.estado = estado as EstadoFactura
    else if (estado) return jsonPrivado({ error: 'Estado inválido' }, 400)
    const proveedor = query.get('proveedor')
    if (proveedor !== null) {
      const value = safeText(proveedor)
      if (value === null) return jsonPrivado({ error: 'Proveedor inválido' }, 400)
      if (value) where.proveedor = { contains: value, mode: 'insensitive' }
    }
    if (desde) where.fecha = { ...(where.fecha as object || {}), gte: fechaDocumentoUtc(desde) }
    if (hasta) where.fecha = { ...(where.fecha as object || {}), lte: fechaDocumentoUtc(hasta) }
    if (query.get('sinImputar') === 'true') where.imputacion = null
    if (query.get('sinOcr') === 'true') where.ocrCompletado = false
    if (query.get('conciliada') === 'true') where.movimientos = { some: { conciliado: true } }
    if (query.get('conciliada') === 'false') where.movimientos = { none: { conciliado: true } }
    if (query.get('count') === 'true') return jsonPrivado({ total: await prisma.facturaRecibida.count({ where }) })

    const economicWhere: Prisma.FacturaRecibidaWhereInput = {
      AND: [where, facturaEconomicaWhere, { estado: { not: 'RECHAZADA' }, deducibleIva: true }],
    }
    const [facturas, total, resumen] = await Promise.all([
      prisma.facturaRecibida.findMany({
        where, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit,
        include: { movimientos: { where: { conciliado: true }, select: { id: true, fechaOperacion: true, importe: true, concepto: true }, take: 1 } },
      }),
      prisma.facturaRecibida.count({ where }),
      prisma.facturaRecibida.aggregate({ where: economicWhere, _sum: { base: true, importeIva: true, importeIrpf: true, total: true }, _count: true }),
    ])
    return jsonPrivado({
      facturas: facturas.map(serializeFacturaCalidad), total, page, totalPages: Math.ceil(total / limit),
      resumenFiscal: {
        totalBase: resumen._sum.base || 0, totalIva: resumen._sum.importeIva || 0,
        totalIrpf: resumen._sum.importeIrpf || 0, totalFacturado: resumen._sum.total || 0, numFacturas: resumen._count,
      },
      canWriteB2: access.canWriteB2,
    })
  } catch {
    return jsonPrivado({ error: 'No se pudieron cargar las facturas' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireFacturaAccess(true)
    if ('error' in access) return access.error
    if (req.headers.get('origin') !== req.nextUrl.origin) return jsonPrivado({ error: 'Origen de la solicitud no válido' }, 403)
    if (req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return jsonPrivado({ error: 'El contenido debe ser JSON' }, 415)
    const parsed = await readBoundedJsonB2(req)
    if (parsed.status) return jsonPrivado({ error: parsed.status === 413 ? 'Solicitud demasiado grande' : 'JSON no válido' }, parsed.status)
    const body = parsed.body
    if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonPrivado({ error: 'Solicitud inválida' }, 400)
    const data = body as Record<string, unknown>
    const proveedor = safeText(data.proveedor, true), cif = safeText(data.cif, true), numFactura = safeText(data.numFactura, true)
    if (!proveedor || !cif || !numFactura || !esFechaDocumentoIso(data.fecha)) return jsonPrivado({ error: 'Proveedor, CIF, número y fecha documental son obligatorios' }, 400)
    for (const field of ['base', 'importeIva', 'importeIrpf', 'total'] as const) if (!esImporteCentimosFinito(data[field])) return jsonPrivado({ error: 'Importes inválidos o no expresados en céntimos' }, 400)
    const base = data.base as number, importeIva = data.importeIva as number, importeIrpf = data.importeIrpf as number, total = data.total as number
    const fecha = data.fecha as string
    if (!totalCuadraEnCentimos(base, importeIva, importeIrpf, total)) return jsonPrivado({ error: 'El total no cuadra exactamente en céntimos' }, 400)
    const canonKey = claveCanonicaFactura(cif, numFactura)
    if (!canonKey) return jsonPrivado({ error: 'IDENTIDAD_INCOMPLETA' }, 400)
    const result = await prisma.$transaction(async tx => {
      const coincidencias = await buscarIdentidadBloqueada(tx, canonKey)
      const existing = coincidencias.find(row => row.calidad === 'VALIDA' && !row.copiaDeId)
      if (existing) return { factura: existing, repetida: true }
      const factura = await tx.facturaRecibida.create({ data: {
        proveedor, cif, numFactura, fecha: fechaDocumentoUtc(fecha), base,
        tipoIva: esImporteFinito(data.tipoIva) ? data.tipoIva : 21, importeIva,
        tipoIrpf: esImporteFinito(data.tipoIrpf) ? data.tipoIrpf : 0, importeIrpf, total,
        concepto: safeText(data.concepto), estado: 'PENDIENTE_REVISION', calidad: 'VALIDA',
        canonKey, fechaProvenancia: 'DOCUMENTO', deducibleIva: data.deducibleIva !== false,
      } })
      await auditarCambioB2(tx, { facturaId: factura.id, actorId: access.userId, accion: 'ALTA_MANUAL_B2', detalle: { canonKey, factura: { proveedor, cif, numFactura, fecha, base, importeIva, importeIrpf, total } } })
      return { factura, repetida: false }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return jsonPrivado({ factura: serializeFacturaCalidad(result.factura), repetida: result.repetida }, result.repetida ? 200 : 201)
  } catch {
    return jsonPrivado({ error: 'No se pudo crear la factura de forma segura' }, 500)
  }
}
