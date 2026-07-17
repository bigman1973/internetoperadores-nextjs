import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: Obtener facturas vinculadas a un contrato + facturas candidatas
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contratoId = searchParams.get('contratoId')
  const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString())

  if (!contratoId) {
    return NextResponse.json({ error: 'contratoId requerido' }, { status: 400 })
  }

  // Obtener vinculaciones existentes
  const vinculaciones = await prisma.facturaContratoDraxton.findMany({
    where: { contratoDraxtonId: contratoId },
  })

  // Obtener datos de las facturas vinculadas
  const facturaIds = vinculaciones.map(v => v.facturaId)
  const facturasVinculadas = facturaIds.length > 0
    ? await prisma.factura.findMany({
        where: { id: { in: facturaIds } },
        orderBy: { fecha: 'desc' },
      })
    : []

  // Obtener el contrato para saber las empresas asignadas
  const contrato = await prisma.contratoDraxton.findUnique({
    where: { id: contratoId },
  })

  if (!contrato) {
    return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  }

  // Obtener empresas del grupo vinculadas a este contrato
  const empresasGrupo = await prisma.empresaGrupoDraxton.findMany({
    where: { activa: true, clienteWebId: { not: null } },
  })

  // Obtener códigos de cliente de las empresas del grupo
  const clienteWebIds = empresasGrupo
    .filter(e => e.clienteWebId !== null)
    .map(e => e.clienteWebId as number)

  const clientesWeb = clienteWebIds.length > 0
    ? await prisma.clienteWeb.findMany({
        where: { id: { in: clienteWebIds } },
        select: { id: true, codigo: true, nombre: true },
      })
    : []

  const codigosCliente = clientesWeb
    .filter(c => c.codigo)
    .map(c => c.codigo as string)

  // Obtener facturas candidatas (de las empresas del grupo, año seleccionado, no vinculadas a este contrato)
  const facturasCandidatas = codigosCliente.length > 0
    ? await prisma.factura.findMany({
        where: {
          codigoCliente: { in: codigosCliente },
          ejercicio: anio,
          id: { notIn: facturaIds },
        },
        orderBy: { fecha: 'desc' },
      })
    : []

  // Calcular resumen
  const totalFacturado = vinculaciones.reduce((sum, v) => sum + Number(v.importeAsignado), 0)

  return NextResponse.json({
    vinculaciones,
    facturasVinculadas,
    facturasCandidatas,
    totalFacturado,
    empresasGrupo: empresasGrupo.map(e => ({
      ...e,
      codigoCliente: clientesWeb.find(c => c.id === e.clienteWebId)?.codigo,
      nombreCliente: clientesWeb.find(c => c.id === e.clienteWebId)?.nombre,
    })),
  })
}

// POST: Vincular facturas (automático o manual)
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { contratoId, modo, facturaIds, anio } = body

  if (!contratoId) {
    return NextResponse.json({ error: 'contratoId requerido' }, { status: 400 })
  }

  // Modo manual: vincular facturas específicas
  if (modo === 'manual' && facturaIds && facturaIds.length > 0) {
    const facturas = await prisma.factura.findMany({
      where: { id: { in: facturaIds } },
    })

    const vinculaciones = await Promise.all(
      facturas.map(f =>
        prisma.facturaContratoDraxton.upsert({
          where: {
            facturaId_contratoDraxtonId: {
              facturaId: f.id,
              contratoDraxtonId: contratoId,
            },
          },
          create: {
            facturaId: f.id,
            contratoDraxtonId: contratoId,
            importeAsignado: f.base,
            auto: false,
          },
          update: {
            importeAsignado: f.base,
            auto: false,
          },
        })
      )
    )

    return NextResponse.json({ vinculadas: vinculaciones.length, modo: 'manual' })
  }

  // Modo automático: buscar facturas que coincidan por empresa + importe
  if (modo === 'auto') {
    const ejercicio = anio || new Date().getFullYear()

    // Obtener contrato con sus servicios
    const contrato = await prisma.contratoDraxton.findUnique({
      where: { id: contratoId },
    })

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
    }

    // Obtener empresas del grupo
    const empresasGrupo = await prisma.empresaGrupoDraxton.findMany({
      where: { activa: true, clienteWebId: { not: null } },
    })

    const clienteWebIds = empresasGrupo
      .filter(e => e.clienteWebId !== null)
      .map(e => e.clienteWebId as number)

    const clientesWeb = clienteWebIds.length > 0
      ? await prisma.clienteWeb.findMany({
          where: { id: { in: clienteWebIds } },
          select: { id: true, codigo: true },
        })
      : []

    const codigosCliente = clientesWeb
      .filter(c => c.codigo)
      .map(c => c.codigo as string)

    if (codigosCliente.length === 0) {
      return NextResponse.json({ vinculadas: 0, modo: 'auto', mensaje: 'No hay empresas del grupo con código de cliente' })
    }

    // Obtener vinculaciones existentes para este contrato
    const vinculacionesExistentes = await prisma.facturaContratoDraxton.findMany({
      where: { contratoDraxtonId: contratoId },
      select: { facturaId: true },
    })
    const idsYaVinculados = new Set(vinculacionesExistentes.map(v => v.facturaId))

    // Obtener facturas de las empresas del grupo en el año
    const facturasCandidatas = await prisma.factura.findMany({
      where: {
        codigoCliente: { in: codigosCliente },
        ejercicio: ejercicio,
        id: { notIn: Array.from(idsYaVinculados) },
      },
    })

    // Lógica de matching: comparar importe de factura con el €/mes del contrato
    const importeMensualContrato = Number(contrato.importeMensual || 0)
    const servicios = (contrato.serviciosJson as any[]) || []

    // Crear mapa de importes esperados por empresa (código cliente)
    const importesPorEmpresa: Record<string, number> = {}
    for (const servicio of servicios) {
      if (servicio.empresaGrupoId) {
        const empresa = empresasGrupo.find(e => e.id === servicio.empresaGrupoId)
        if (empresa && empresa.clienteWebId) {
          const cliente = clientesWeb.find(c => c.id === empresa.clienteWebId)
          if (cliente && cliente.codigo) {
            const codigo = cliente.codigo
            importesPorEmpresa[codigo] = (importesPorEmpresa[codigo] || 0) + Number(servicio.precioMensual || 0)
          }
        }
      }
    }

    // Si no hay asignación por servicio, usar el importe total del contrato dividido entre empresas
    const tieneAsignacionPorServicio = Object.keys(importesPorEmpresa).length > 0

    let vinculadas = 0
    const nuevasVinculaciones: any[] = []

    for (const factura of facturasCandidatas) {
      const baseFactura = Number(factura.base)
      let coincide = false

      if (tieneAsignacionPorServicio) {
        // Comparar con el importe esperado para esa empresa (±10% tolerancia)
        const importeEsperado = importesPorEmpresa[factura.codigoCliente]
        if (importeEsperado && Math.abs(baseFactura - importeEsperado) / importeEsperado <= 0.10) {
          coincide = true
        }
      } else {
        // Sin asignación por servicio: vincular todas las facturas de empresas del grupo
        // con tolerancia del ±10% sobre el importe mensual total
        if (importeMensualContrato > 0 && Math.abs(baseFactura - importeMensualContrato) / importeMensualContrato <= 0.10) {
          coincide = true
        }
      }

      // También vincular si el importe coincide exactamente con algún servicio individual
      if (!coincide) {
        for (const servicio of servicios) {
          const precioServicio = Number(servicio.precioMensual || 0)
          if (precioServicio > 0 && Math.abs(baseFactura - precioServicio) / precioServicio <= 0.05) {
            coincide = true
            break
          }
        }
      }

      if (coincide) {
        nuevasVinculaciones.push({
          facturaId: factura.id,
          contratoDraxtonId: contratoId,
          importeAsignado: factura.base,
          auto: true,
          empresaGrupoDraxtonId: empresasGrupo.find(e => {
            const cliente = clientesWeb.find(c => c.id === e.clienteWebId)
            return cliente && cliente.codigo === factura.codigoCliente
          })?.id || null,
        })
        vinculadas++
      }
    }

    // Insertar vinculaciones en batch
    if (nuevasVinculaciones.length > 0) {
      await prisma.$transaction(
        nuevasVinculaciones.map(v =>
          prisma.facturaContratoDraxton.upsert({
            where: {
              facturaId_contratoDraxtonId: {
                facturaId: v.facturaId,
                contratoDraxtonId: v.contratoDraxtonId,
              },
            },
            create: v,
            update: { importeAsignado: v.importeAsignado, auto: true },
          })
        )
      )
    }

    return NextResponse.json({
      vinculadas,
      candidatasAnalizadas: facturasCandidatas.length,
      modo: 'auto',
    })
  }

  return NextResponse.json({ error: 'Modo no válido (usar "auto" o "manual")' }, { status: 400 })
}

// DELETE: Desvincular una factura de un contrato
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const contratoId = searchParams.get('contratoId')
  const facturaId = searchParams.get('facturaId')

  if (!contratoId || !facturaId) {
    return NextResponse.json({ error: 'contratoId y facturaId requeridos' }, { status: 400 })
  }

  await prisma.facturaContratoDraxton.delete({
    where: {
      facturaId_contratoDraxtonId: {
        facturaId: parseInt(facturaId),
        contratoDraxtonId: contratoId,
      },
    },
  })

  return NextResponse.json({ ok: true })
}
