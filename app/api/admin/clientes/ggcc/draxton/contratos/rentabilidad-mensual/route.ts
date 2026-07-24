import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: Calcular rentabilidad mes a mes de un contrato
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contratoId = searchParams.get('contratoId')

  if (!contratoId) {
    return NextResponse.json({ error: 'contratoId requerido' }, { status: 400 })
  }

  // Obtener contrato
  const contrato = await prisma.contratoDraxton.findUnique({
    where: { id: contratoId },
    include: {
      contratosProveedor: { where: { estado: 'Activo' } },
    },
  })

  if (!contrato) {
    return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  }

  // Obtener TODO el personal asignado (activo e inactivo/histórico)
  const personalAsignado = await prisma.personalContratoDraxton.findMany({
    where: { contratoDraxtonId: contratoId },
    include: {
      empleado: {
        select: {
          id: true,
          nombreCompleto: true,
          nominas: {
            where: { anio: { in: [2025, 2026] } },
            select: {
              mes: true,
              anio: true,
              costeTotalEmpresa: true,
              gastosDesplazamiento: true,
            },
          },
        },
      },
    },
  })

  // Determinar rango de meses del contrato
  const fechaInicio = contrato.fechaInicio ? new Date(contrato.fechaInicio) : new Date('2026-01-01')
  const fechaFin = contrato.fechaFin ? new Date(contrato.fechaFin) : new Date('2026-12-31')
  const ahora = new Date()
  const hastaFecha = ahora < fechaFin ? ahora : fechaFin

  const meses: { anio: number; mes: number }[] = []
  const cursor = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth(), 1)
  while (cursor <= hastaFecha) {
    meses.push({ anio: cursor.getFullYear(), mes: cursor.getMonth() + 1 })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  // Ingreso mensual fijo
  const ingresoMensual = Number(contrato.importeMensual) || 0

  // Coste proveedores (fijo mensual)
  const costeProveedores = contrato.contratosProveedor.reduce(
    (sum, p) => sum + (Number(p.importeMensual) || 0), 0
  )

  // Calcular rentabilidad mes a mes
  const rentabilidadMensual = meses.map(({ anio, mes }) => {
    const mesDate = new Date(anio, mes - 1, 1)
    const mesFin = new Date(anio, mes, 0) // último día del mes

    // Filtrar personal que estaba asignado en este mes
    const personalDelMes = personalAsignado.filter(p => {
      const pInicio = p.fechaInicio ? new Date(p.fechaInicio) : new Date('2020-01-01')
      const pFin = p.fechaFin ? new Date(p.fechaFin) : new Date('2099-12-31')
      // El personal estaba activo si su rango se solapa con el mes
      return pInicio <= mesFin && pFin >= mesDate
    })

    // Calcular coste de personal para este mes
    let costePersonal = 0
    const detallePersonal: { nombre: string; coste: number; dedicacion: number }[] = []

    personalDelMes.forEach(p => {
      const nomina = p.empleado.nominas.find(n => n.anio === anio && n.mes === mes)
      let costeMensual = 0

      if (nomina) {
        const costeEmpresa = Number(nomina.costeTotalEmpresa) || 0
        const desplazamiento = Number(nomina.gastosDesplazamiento) || 0
        costeMensual = costeEmpresa - desplazamiento
      } else {
        // Fallback: promedio de nóminas disponibles
        const nominasDisp = p.empleado.nominas.filter(n => n.costeTotalEmpresa)
        if (nominasDisp.length > 0) {
          costeMensual = nominasDisp.reduce((s, n) => s + (Number(n.costeTotalEmpresa) || 0) - (Number(n.gastosDesplazamiento) || 0), 0) / nominasDisp.length
        }
      }

      const costeImputado = costeMensual * ((p.porcentajeDedicacion || 0) / 100)
      costePersonal += costeImputado

      detallePersonal.push({
        nombre: p.empleado.nombreCompleto,
        coste: Math.round(costeImputado * 100) / 100,
        dedicacion: p.porcentajeDedicacion || 0,
      })
    })

    const costeTotal = costeProveedores + costePersonal
    const margen = ingresoMensual - costeTotal
    const margenPct = ingresoMensual > 0 ? (margen / ingresoMensual) * 100 : 0

    return {
      anio,
      mes,
      mesLabel: new Date(anio, mes - 1, 1).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
      ingreso: Math.round(ingresoMensual * 100) / 100,
      costeProveedores: Math.round(costeProveedores * 100) / 100,
      costePersonal: Math.round(costePersonal * 100) / 100,
      costeTotal: Math.round(costeTotal * 100) / 100,
      margen: Math.round(margen * 100) / 100,
      margenPct: Math.round(margenPct * 10) / 10,
      personalActivo: detallePersonal.length,
      detallePersonal,
    }
  })

  // Totales acumulados
  const totalIngreso = rentabilidadMensual.reduce((s, m) => s + m.ingreso, 0)
  const totalCosteProveedores = rentabilidadMensual.reduce((s, m) => s + m.costeProveedores, 0)
  const totalCostePersonal = rentabilidadMensual.reduce((s, m) => s + m.costePersonal, 0)
  const totalMargen = rentabilidadMensual.reduce((s, m) => s + m.margen, 0)
  const margenPctTotal = totalIngreso > 0 ? (totalMargen / totalIngreso) * 100 : 0

  return NextResponse.json({
    contrato: { id: contrato.id, titulo: contrato.titulo },
    meses: rentabilidadMensual,
    totales: {
      ingreso: Math.round(totalIngreso * 100) / 100,
      costeProveedores: Math.round(totalCosteProveedores * 100) / 100,
      costePersonal: Math.round(totalCostePersonal * 100) / 100,
      margen: Math.round(totalMargen * 100) / 100,
      margenPct: Math.round(margenPctTotal * 10) / 10,
      mesesCalculados: rentabilidadMensual.length,
    },
  })
}
