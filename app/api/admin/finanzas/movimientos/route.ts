import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'
import {
  presentarCategoriaHistorica,
  presentarTipoMovimientoHistorico,
  valoresCategoriaFiltro,
} from '@/lib/finanzas/movement-catalog'
import { prisma } from '@/lib/prisma'

function jsonPrivado(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } })
}

function normalizarMovimientoLectura(movimiento: any) {
  const categoria = presentarCategoriaHistorica(movimiento.categoria)
  const tipoPago = presentarTipoMovimientoHistorico(movimiento.tipoPago)
  const metodoPago = presentarTipoMovimientoHistorico(movimiento.metodoPago)
  return {
    ...movimiento,
    categoria: categoria.valor,
    tipoPago: tipoPago.valor,
    metodoPago: metodoPago.valor,
    catalogo: {
      categoriaOriginal: categoria.valorOriginal,
      categoriaEsLegacy: categoria.esLegacy,
      categoriaFueAlias: categoria.fueAlias,
      tipoPagoOriginal: tipoPago.valorOriginal,
      tipoPagoEsLegacy: tipoPago.esLegacy,
      tipoPagoFueAlias: tipoPago.fueAlias,
      metodoPagoOriginal: metodoPago.valorOriginal,
      metodoPagoEsLegacy: metodoPago.esLegacy,
      metodoPagoFueAlias: metodoPago.fueAlias,
    },
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') return jsonPrivado({ error: 'No autorizado' }, 401)
  const denied = await checkAdminAreaRead('admin.finanzas.movimientos', ['CONTABILIDAD'], session)
  if (denied) return denied
  try {
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, Math.min(100000, Number.parseInt(searchParams.get('page') || '1', 10) || 1))
    const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '50', 10) || 50))
    const cuentaId = searchParams.get('cuentaId')
    const categoriaSolicitada = searchParams.get('categoria')
    const conciliado = searchParams.get('conciliado')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const buscar = searchParams.get('buscar')
    const where: any = {}

    if (cuentaId) where.cuentaId = cuentaId
    if (buscar && buscar.length <= 160) {
      where.OR = [
        { concepto: { contains: buscar, mode: 'insensitive' } },
        { tercero: { contains: buscar, mode: 'insensitive' } },
        { entidadFiscal: { razonSocial: { contains: buscar, mode: 'insensitive' } } },
        { entidadFiscal: { nombreComercial: { contains: buscar, mode: 'insensitive' } } },
        { entidadFiscal: { nifCif: { contains: buscar, mode: 'insensitive' } } },
        { entregaACuentaEmpleado: { nombreCompleto: { contains: buscar, mode: 'insensitive' } } },
      ]
    }

    // Filtros virtuales heredados: no mutan ni usan dimensiones de coste como catálogo B3.
    if (categoriaSolicitada === 'Transferencias Nóminas') {
      where.categoria = 'Sueldos y Salarios'
      where.AND = [
        { NOT: { concepto: { contains: 'TGSS', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'COTIZACION', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'AUTONOMOS', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'APLAZAM', mode: 'insensitive' } } },
      ]
    } else if (categoriaSolicitada === 'Cotizaciones SS') {
      where.categoria = 'Sueldos y Salarios'
      where.OR = [
        { concepto: { contains: 'TGSS', mode: 'insensitive' } },
        { concepto: { contains: 'COTIZACION', mode: 'insensitive' } },
        { concepto: { contains: 'AUTONOMOS', mode: 'insensitive' } },
        { concepto: { contains: 'APLAZAM', mode: 'insensitive' } },
      ]
    } else if (categoriaSolicitada === 'Retenciones') {
      where.categoria = 'IMPUESTOS'
      where.OR = [
        { concepto: { contains: 'RET', mode: 'insensitive' } },
        { concepto: { contains: 'INGRESO A CUENTA', mode: 'insensitive' } },
      ]
    } else if (categoriaSolicitada === 'Sociedades Pago a Cuenta') {
      where.categoria = 'IMPUESTOS'
      where.OR = [{ concepto: { contains: 'SOCIEDADES', mode: 'insensitive' } }]
    } else if (categoriaSolicitada === 'Aplazamientos AEAT') {
      where.categoria = 'IMPUESTOS'
      where.AND = [
        { NOT: { concepto: { contains: 'RET', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'INGRESO A CUENTA', mode: 'insensitive' } } },
        { NOT: { concepto: { contains: 'SOCIEDADES', mode: 'insensitive' } } },
      ]
    } else if (categoriaSolicitada) {
      // Alias B3 se normalizan en la respuesta; no se reescribe historial al filtrar.
      where.categoria = { in: valoresCategoriaFiltro(categoriaSolicitada), mode: 'insensitive' }
    }

    if (conciliado === 'true') where.conciliado = true
    if (conciliado === 'false') where.conciliado = false
    if (desde && !Number.isNaN(new Date(desde).getTime())) where.fechaOperacion = { ...where.fechaOperacion, gte: new Date(desde) }
    if (hasta && !Number.isNaN(new Date(hasta).getTime())) where.fechaOperacion = { ...where.fechaOperacion, lte: new Date(hasta) }

    const pendienteFactura = searchParams.get('pendienteFactura')
    if (pendienteFactura === 'true') where.pendienteFactura = true
    const pdteRecibir = searchParams.get('pdteRecibir')
    if (pdteRecibir === 'true') where.OR = [{ pendienteFactura: true }, { tipoDocumento: 'factura', documentoRecibido: false }]
    if (searchParams.get('pagoACuentaVola') === 'true') where.pagoACuentaVola = true
    const tipoDocumento = searchParams.get('tipoDocumento')
    if (tipoDocumento === 'null') where.tipoDocumento = null
    else if (tipoDocumento) where.tipoDocumento = tipoDocumento
    if (searchParams.get('documentoRecibido') === 'true') where.documentoRecibido = true
    if (searchParams.get('documentoRecibido') === 'false') where.documentoRecibido = false
    if (searchParams.get('sinDocumento') === 'true') {
      where.tipoDocumento = 'factura'
      where.documentoRecibido = false
    }
    if (searchParams.get('entregaACuenta') === 'true') where.entregaACuentaEmpleadoId = { not: null }
    const tipo = searchParams.get('tipo')
    if (tipo === 'ingresos') where.importe = { gt: 0 }
    if (tipo === 'cargos' || tipo === 'gastos') where.importe = { lt: 0 }

    const importeExacto = searchParams.get('importeExacto')
    if (importeExacto) {
      const importe = Number(importeExacto)
      if (!Number.isFinite(importe) || Math.abs(importe * 100 - Math.round(importe * 100)) > 1e-7) return jsonPrivado({ error: 'Importe exacto no válido' }, 400)
      where.AND = [...(where.AND || []), { importe: -importe }]
    }
    const entidadFiscalId = searchParams.get('entidadFiscalId')
    if (entidadFiscalId) where.entidadFiscalId = entidadFiscalId
    if (searchParams.get('conProveedor') === 'true') where.entidadFiscalId = { not: null }
    if (searchParams.get('conFacturaRecibida') === 'true') where.facturaId = { not: null }
    if (searchParams.get('conFacturaEmitida') === 'true') where.facturaEmitidaId = { not: null }
    if (searchParams.get('sinProveedor') === 'true') {
      where.entidadFiscalId = null
      where.importe = { lt: 0 }
    }
    if (searchParams.get('traspasoPendiente') === 'true') {
      where.tipoDocumento = 'traspaso'
      where.traspasoRelacionadoId = null
    }
    if (searchParams.get('pendientesValidar') === 'true') {
      where.factura = { estado: 'PENDIENTE_REVISION' }
      where.tipoDocumento = { in: ['factura', 'ticket'] }
    }

    const sortBy = searchParams.get('sortBy') || 'fechaOperacion'
    const sortDir = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'
    let orderBy: any = { fechaOperacion: sortDir }
    if (sortBy === 'importe') orderBy = { importe: sortDir }
    else if (sortBy === 'tercero') orderBy = { tercero: sortDir }
    else if (sortBy === 'categoria') orderBy = { categoria: sortDir }
    else if (sortBy === 'concepto') orderBy = { concepto: sortDir }
    else if (sortBy === 'banco') orderBy = { cuenta: { banco: sortDir } }

    const [movimientos, total] = await Promise.all([
      prisma.movimientoBancario.findMany({
        where, orderBy, skip: (page - 1) * limit, take: limit,
        include: {
          cuenta: { select: { banco: true, alias: true } },
          factura: { select: { id: true, proveedor: true, numFactura: true, total: true } },
          facturaEmitida: { select: { id: true, cliente: true, numFactura: true, total: true } },
          entregaACuentaEmpleado: { select: { id: true, nombreCompleto: true } },
          entidadFiscal: { select: { id: true, razonSocial: true, tipo: true, nifCif: true, cuentaContableA3: true } },
          nomina: { select: { id: true, mes: true, anio: true, netoPercibir: true, empleado: { select: { nombreCompleto: true } }, movimientos: { select: { id: true, importe: true } } } },
        },
      }),
      prisma.movimientoBancario.count({ where }),
    ])

    const enriquecidos = await Promise.all(movimientos.map(async (movimiento: any) => {
      const traspasoRelacionado = movimiento.traspasoRelacionadoId
        ? await prisma.movimientoBancario.findUnique({ where: { id: movimiento.traspasoRelacionadoId }, select: { id: true, fechaOperacion: true, importe: true, concepto: true, cuenta: { select: { banco: true, alias: true } } } })
        : null
      return normalizarMovimientoLectura({ ...movimiento, traspasoRelacionado })
    }))
    return jsonPrivado({ movimientos: enriquecidos, total, page, totalPages: Math.ceil(total / limit) })
  } catch {
    return jsonPrivado({ error: 'No se pudieron consultar los movimientos' }, 500)
  }
}
