import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD']

// Cuentas contables PGC por defecto
const CUENTAS = {
  clientes: '4300000',
  ventas_servicios: '7050000',
  iva_repercutido_21: '4770021',
  iva_repercutido_10: '4770010',
  iva_repercutido_4: '4770004',
  proveedores: '4000000',
  compras_servicios: '6290000',
  iva_soportado_21: '4720021',
  iva_soportado_10: '4720010',
  iva_soportado_4: '4720004',
  irpf_retenido: '4730000',
  sueldos_salarios: '6400000',
  ss_empresa: '6420000',
  irpf_nominas: '4751000',
  ss_trabajador: '4760010',
  ss_empresa_pagar: '4760020',
  remuneraciones_pendientes: '4650000',
  bancos: '5720001',
  gastos_viaje: '6290001',
  gastos_suministros: '6280000',
  gastos_varios: '6290000',
}

interface AsientoLinea {
  asiento: number
  apunte: number
  fecha: string
  cuenta: string
  concepto: string
  debe: number
  haber: number
  documento: string
  diario: string
}

function formatFecha(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0')
  const m = (date.getMonth() + 1).toString().padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

function getCuentaIVA(tipoIva: number, tipo: 'repercutido' | 'soportado'): string {
  const prefix = tipo === 'repercutido' ? '4770' : '4720'
  if (tipoIva === 21) return `${prefix}021`
  if (tipoIva === 10) return `${prefix}010`
  if (tipoIva === 4) return `${prefix}004`
  return `${prefix}021` // Default 21%
}

// GET - Obtener datos disponibles para exportar (resumen)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const userRole = session.user.role
    if (!ROLES_PERMITIDOS.includes(userRole)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    // Resumen de datos disponibles
    const [facturasEmitidas, facturasRecibidas, gastos, nominas, movimientos] = await Promise.all([
      prisma.facturaEmitida.count(),
      prisma.facturaRecibida.count(),
      prisma.gasto.count(),
      prisma.nomina.count(),
      prisma.movimientoBancario.count(),
    ])

    return NextResponse.json({
      resumen: {
        facturas_emitidas: facturasEmitidas,
        facturas_recibidas: facturasRecibidas,
        gastos,
        nominas,
        movimientos_bancarios: movimientos,
      }
    })
  } catch (error) {
    console.error('Error en exportar-a3 GET:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST - Generar fichero de exportación A3
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user?.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const userRole = session.user.role
    if (!ROLES_PERMITIDOS.includes(userRole)) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
    }

    const body = await request.json()
    const { tipo, periodo, anio, mes, trimestre } = body

    if (!tipo || !periodo || !anio) {
      return NextResponse.json({ error: 'Faltan parámetros: tipo, periodo, anio' }, { status: 400 })
    }

    // Calcular rango de fechas según periodo
    let fechaInicio: Date
    let fechaFin: Date

    if (periodo === 'mes') {
      if (!mes) return NextResponse.json({ error: 'Falta el mes' }, { status: 400 })
      fechaInicio = new Date(anio, mes - 1, 1)
      fechaFin = new Date(anio, mes, 0, 23, 59, 59)
    } else if (periodo === 'trimestre') {
      if (!trimestre) return NextResponse.json({ error: 'Falta el trimestre' }, { status: 400 })
      const mesInicio = (trimestre - 1) * 3
      fechaInicio = new Date(anio, mesInicio, 1)
      fechaFin = new Date(anio, mesInicio + 3, 0, 23, 59, 59)
    } else if (periodo === 'anual') {
      fechaInicio = new Date(anio, 0, 1)
      fechaFin = new Date(anio, 11, 31, 23, 59, 59)
    } else {
      return NextResponse.json({ error: 'Periodo inválido' }, { status: 400 })
    }

    let lineas: AsientoLinea[] = []
    let numAsiento = 1

    // Generar asientos según el tipo
    if (tipo === 'facturas_emitidas' || tipo === 'todo') {
      const facturas = await prisma.facturaEmitida.findMany({
        where: {
          fecha: { gte: fechaInicio, lte: fechaFin }
        },
        orderBy: { fecha: 'asc' }
      })

      for (const f of facturas) {
        const fecha = formatFecha(new Date(f.fecha))
        const concepto = `FE ${f.numFactura} ${f.cliente || ''}`
        let apunte = 1

        // Debe: Cliente por el total
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.clientes,
          concepto, debe: f.total || 0, haber: 0, documento: f.numFactura || '', diario: 'VENTAS'
        })

        // Haber: Ventas por la base
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.ventas_servicios,
          concepto, debe: 0, haber: f.base || 0, documento: f.numFactura || '', diario: 'VENTAS'
        })

        // Haber: IVA repercutido
        if (f.importeIva && f.importeIva > 0) {
          const cuentaIva = getCuentaIVA(f.tipoIva || 21, 'repercutido')
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: cuentaIva,
            concepto, debe: 0, haber: f.importeIva, documento: f.numFactura || '', diario: 'VENTAS'
          })
        }

        // Debe: IRPF (si hay retención, reduce el cobro)
        if (f.importeIrpf && f.importeIrpf > 0) {
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.irpf_retenido,
            concepto, debe: 0, haber: f.importeIrpf, documento: f.numFactura || '', diario: 'VENTAS'
          })
        }

        numAsiento++
      }
    }

    if (tipo === 'facturas_recibidas' || tipo === 'todo') {
      const facturas = await prisma.facturaRecibida.findMany({
        where: {
          fecha: { gte: fechaInicio, lte: fechaFin }
        },
        orderBy: { fecha: 'asc' }
      })

      for (const f of facturas) {
        const fecha = formatFecha(new Date(f.fecha))
        const concepto = `FR ${f.numFactura || ''} ${f.proveedor || ''}`
        let apunte = 1

        // Debe: Gasto/Compra por la base
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.compras_servicios,
          concepto, debe: f.base || 0, haber: 0, documento: f.numFactura || '', diario: 'COMPRAS'
        })

        // Debe: IVA soportado
        if (f.importeIva && f.importeIva > 0) {
          const cuentaIva = getCuentaIVA(f.tipoIva || 21, 'soportado')
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: cuentaIva,
            concepto, debe: f.importeIva, haber: 0, documento: f.numFactura || '', diario: 'COMPRAS'
          })
        }

        // Haber: Proveedor por el total
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.proveedores,
          concepto, debe: 0, haber: f.total || 0, documento: f.numFactura || '', diario: 'COMPRAS'
        })

        // Haber: IRPF retenido al proveedor
        if (f.importeIrpf && f.importeIrpf > 0) {
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.irpf_retenido,
            concepto, debe: 0, haber: f.importeIrpf, documento: f.numFactura || '', diario: 'COMPRAS'
          })
        }

        numAsiento++
      }
    }

    if (tipo === 'gastos' || tipo === 'todo') {
      const gastosData = await prisma.gasto.findMany({
        where: {
          fecha: { gte: fechaInicio, lte: fechaFin }
        },
        orderBy: { fecha: 'asc' }
      })

      for (const g of gastosData) {
        const fecha = formatFecha(new Date(g.fecha))
        const concepto = `GASTO ${g.concepto || ''} ${g.comercio || ''}`
        let apunte = 1

        const baseIva = g.baseIva || g.importe || 0
        const importeIva = g.importeIva || 0

        // Debe: Gasto por la base
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.gastos_varios,
          concepto, debe: baseIva, haber: 0, documento: '', diario: 'GASTOS'
        })

        // Debe: IVA soportado (si es deducible)
        if (g.deducibleIva && importeIva > 0) {
          const tipoIva = g.tipoIva || 21
          const cuentaIva = getCuentaIVA(tipoIva, 'soportado')
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: cuentaIva,
            concepto, debe: importeIva, haber: 0, documento: '', diario: 'GASTOS'
          })
        }

        // Haber: Banco/Caja por el total
        const total = g.importe || 0
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.bancos,
          concepto, debe: 0, haber: total, documento: '', diario: 'GASTOS'
        })

        numAsiento++
      }
    }

    if (tipo === 'nominas' || tipo === 'todo') {
      const nominasData = await prisma.nomina.findMany({
        where: {
          anio: anio,
          ...(periodo === 'mes' ? { mes: mes } : {}),
          ...(periodo === 'trimestre' ? { mes: { gte: (trimestre - 1) * 3 + 1, lte: trimestre * 3 } } : {}),
        },
        include: { empleado: true },
        orderBy: [{ mes: 'asc' }]
      })

      for (const n of nominasData) {
        const fecha = formatFecha(new Date(anio, (n.mes || 1) - 1, 28))
        const nombreEmpleado = n.empleado?.nombre || 'Empleado'
        const concepto = `NOMINA ${nombreEmpleado} ${n.mes}/${n.anio}`
        let apunte = 1

        // Debe: Sueldos y salarios (devengado total)
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.sueldos_salarios,
          concepto, debe: n.devengadoTotal || 0, haber: 0, documento: '', diario: 'NOMINAS'
        })

        // Debe: SS empresa
        if (n.ssEmpresa && n.ssEmpresa > 0) {
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.ss_empresa,
            concepto, debe: n.ssEmpresa, haber: 0, documento: '', diario: 'NOMINAS'
          })
        }

        // Haber: IRPF retenido
        if (n.irpf && n.irpf > 0) {
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.irpf_nominas,
            concepto, debe: 0, haber: n.irpf, documento: '', diario: 'NOMINAS'
          })
        }

        // Haber: SS trabajador
        if (n.ssTrabajador && n.ssTrabajador > 0) {
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.ss_trabajador,
            concepto, debe: 0, haber: n.ssTrabajador, documento: '', diario: 'NOMINAS'
          })
        }

        // Haber: SS empresa a pagar
        if (n.ssEmpresa && n.ssEmpresa > 0) {
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.ss_empresa_pagar,
            concepto, debe: 0, haber: n.ssEmpresa, documento: '', diario: 'NOMINAS'
          })
        }

        // Haber: Neto a pagar (banco)
        lineas.push({
          asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.remuneraciones_pendientes,
          concepto, debe: 0, haber: n.netoPercibir || 0, documento: '', diario: 'NOMINAS'
        })

        numAsiento++
      }
    }

    if (tipo === 'movimientos_bancarios' || tipo === 'todo') {
      const movimientos = await prisma.movimientoBancario.findMany({
        where: {
          fechaOperacion: { gte: fechaInicio, lte: fechaFin }
        },
        orderBy: { fechaOperacion: 'asc' }
      })

      for (const m of movimientos) {
        const fecha = formatFecha(new Date(m.fechaOperacion))
        const concepto = `BANCO ${m.concepto || ''}`
        let apunte = 1

        if (m.importe > 0) {
          // Cobro: Debe banco, Haber cliente
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.bancos,
            concepto, debe: m.importe, haber: 0, documento: m.referencia || '', diario: 'BANCO'
          })
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.clientes,
            concepto, debe: 0, haber: m.importe, documento: m.referencia || '', diario: 'BANCO'
          })
        } else {
          // Pago: Debe proveedor, Haber banco
          const importeAbs = Math.abs(m.importe)
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.proveedores,
            concepto, debe: importeAbs, haber: 0, documento: m.referencia || '', diario: 'BANCO'
          })
          lineas.push({
            asiento: numAsiento, apunte: apunte++, fecha, cuenta: CUENTAS.bancos,
            concepto, debe: 0, haber: importeAbs, documento: m.referencia || '', diario: 'BANCO'
          })
        }

        numAsiento++
      }
    }

    if (lineas.length === 0) {
      return NextResponse.json({ error: 'No hay datos para el periodo seleccionado' }, { status: 404 })
    }

    // Generar CSV en formato A3
    const headers = ['Asiento', 'Apunte', 'Fecha', 'Cuenta', 'Concepto', 'Debe', 'Haber', 'Documento', 'Diario']
    const csvRows = [headers.join(';')]

    for (const l of lineas) {
      csvRows.push([
        l.asiento,
        l.apunte,
        l.fecha,
        l.cuenta,
        `"${(l.concepto || '').replace(/"/g, '""').substring(0, 60)}"`,
        l.debe > 0 ? l.debe.toFixed(2).replace('.', ',') : '',
        l.haber > 0 ? l.haber.toFixed(2).replace('.', ',') : '',
        l.documento || '',
        l.diario
      ].join(';'))
    }

    const csv = csvRows.join('\r\n')

    // Nombre del archivo
    let nombrePeriodo = ''
    if (periodo === 'mes') nombrePeriodo = `${anio}-${mes.toString().padStart(2, '0')}`
    else if (periodo === 'trimestre') nombrePeriodo = `${anio}-T${trimestre}`
    else nombrePeriodo = `${anio}`

    const filename = `A3_${tipo}_${nombrePeriodo}.csv`

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      }
    })
  } catch (error) {
    console.error('Error en exportar-a3 POST:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
