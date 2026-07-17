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

  // Obtener contrato con sus datos
  const contrato = await prisma.contratoDraxton.findUnique({
    where: { id: contratoId },
  })

  if (!contrato) {
    return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
  }

  // Obtener vinculaciones existentes con datos de factura
  const vinculaciones = await prisma.facturaContratoDraxton.findMany({
    where: { contratoDraxtonId: contratoId },
    include: {
      factura: true,
    },
    orderBy: { factura: { fecha: 'desc' } },
  })

  // Obtener los códigos de cliente relevantes para este contrato
  const codigosCliente = await obtenerCodigosClienteContrato(contrato)

  // Obtener facturas candidatas (de las empresas asignadas, año seleccionado, no vinculadas)
  const idsYaVinculados = vinculaciones.map(v => v.facturaId)
  
  const facturasCandidatas = codigosCliente.length > 0
    ? await prisma.factura.findMany({
        where: {
          codigoCliente: { in: codigosCliente },
          ejercicio: anio,
          id: { notIn: idsYaVinculados },
        },
        orderBy: { fecha: 'desc' },
      })
    : []

  // Calcular resumen
  const totalFacturado = vinculaciones.reduce((sum, v) => sum + Number(v.importeAsignado), 0)

  return NextResponse.json({
    vinculadas: vinculaciones.map(v => ({
      id: v.id,
      facturaId: v.facturaId,
      importeAsignado: v.importeAsignado,
      tipoVinculacion: v.auto ? 'auto' : 'manual',
      factura: v.factura ? {
        id: v.factura.id,
        fecha: v.factura.fecha,
        numero: v.factura.numero,
        documento: v.factura.documento,
        clienteNombre: v.factura.clienteNombre,
        baseImponible: v.factura.base,
        total: v.factura.total,
      } : null,
    })),
    candidatas: facturasCandidatas.map(f => ({
      id: f.id,
      fecha: f.fecha,
      numero: f.numero,
      documento: f.documento,
      clienteNombre: f.clienteNombre,
      baseImponible: f.base,
      total: f.total,
      codigoCliente: f.codigoCliente,
    })),
    totalFacturado,
    totalFacturas: vinculaciones.length,
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

  // Modo automático: buscar facturas que coincidan por empresa asignada + importe mensual
  if (modo === 'auto') {
    const ejercicio = anio || new Date().getFullYear()

    // Obtener contrato con sus servicios
    const contrato = await prisma.contratoDraxton.findUnique({
      where: { id: contratoId },
    })

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
    }

    // Obtener códigos de cliente SOLO de empresas asignadas a este contrato
    const codigosCliente = await obtenerCodigosClienteContrato(contrato)

    if (codigosCliente.length === 0) {
      return NextResponse.json({ 
        vinculadas: 0, 
        modo: 'auto', 
        mensaje: 'No hay empresas asignadas a este contrato. Asigna una empresa de facturación al contrato o a sus servicios.' 
      })
    }

    // Obtener vinculaciones existentes para este contrato
    const vinculacionesExistentes = await prisma.facturaContratoDraxton.findMany({
      where: { contratoDraxtonId: contratoId },
      select: { facturaId: true },
    })
    const idsYaVinculados = new Set(vinculacionesExistentes.map(v => v.facturaId))

    // Obtener facturas de las empresas asignadas en el año
    const facturasCandidatas = await prisma.factura.findMany({
      where: {
        codigoCliente: { in: codigosCliente },
        ejercicio: ejercicio,
        id: { notIn: Array.from(idsYaVinculados) },
      },
    })

    // Lógica de matching: 
    // Comparar importe de factura con el €/mes del contrato o de los servicios asignados a esa empresa
    const importeMensualContrato = Number(contrato.importeMensual || 0)
    const servicios = (contrato.serviciosJson as any[]) || []

    // Crear mapa de importes esperados por código de cliente
    const importesPorCodigo = await calcularImportesPorCodigo(servicios, contrato)

    let vinculadas = 0
    const nuevasVinculaciones: any[] = []

    for (const factura of facturasCandidatas) {
      const baseFactura = Number(factura.base)
      let coincide = false

      // 1. Comparar con el importe esperado para esa empresa específica (±5% tolerancia)
      const importeEsperado = importesPorCodigo[factura.codigoCliente]
      if (importeEsperado && importeEsperado > 0) {
        if (Math.abs(baseFactura - importeEsperado) / importeEsperado <= 0.05) {
          coincide = true
        }
      }

      // 2. Si solo hay una empresa asignada, comparar con el importe total del contrato (±5%)
      if (!coincide && codigosCliente.length === 1 && importeMensualContrato > 0) {
        if (Math.abs(baseFactura - importeMensualContrato) / importeMensualContrato <= 0.05) {
          coincide = true
        }
      }

      if (coincide) {
        nuevasVinculaciones.push({
          facturaId: factura.id,
          contratoDraxtonId: contratoId,
          importeAsignado: factura.base,
          auto: true,
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
      codigosEmpresa: codigosCliente,
      importesEsperados: importesPorCodigo,
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

// ===== FUNCIONES AUXILIARES =====

// Obtener códigos de cliente SOLO de las empresas asignadas a este contrato
async function obtenerCodigosClienteContrato(contrato: any): Promise<string[]> {
  const clienteWebIds: number[] = []

  // 1. Empresa de facturación global del contrato
  if (contrato.clienteFacturacionId) {
    clienteWebIds.push(contrato.clienteFacturacionId)
  }

  // 2. Empresas asignadas a servicios individuales
  const servicios = (contrato.serviciosJson as any[]) || []
  const empresaGrupoIds = servicios
    .filter(s => s.empresaGrupoId)
    .map(s => s.empresaGrupoId)

  if (empresaGrupoIds.length > 0) {
    const empresas = await prisma.empresaGrupoDraxton.findMany({
      where: { id: { in: empresaGrupoIds }, clienteWebId: { not: null } },
      select: { clienteWebId: true },
    })
    empresas.forEach(e => {
      if (e.clienteWebId && !clienteWebIds.includes(e.clienteWebId)) {
        clienteWebIds.push(e.clienteWebId)
      }
    })
  }

  if (clienteWebIds.length === 0) return []

  // Obtener códigos de cliente
  const clientes = await prisma.clienteWeb.findMany({
    where: { id: { in: clienteWebIds } },
    select: { codigo: true },
  })

  return clientes
    .filter(c => c.codigo)
    .map(c => c.codigo as string)
}

// Calcular importes esperados por código de cliente (para matching)
async function calcularImportesPorCodigo(servicios: any[], contrato: any): Promise<Record<string, number>> {
  const importesPorCodigo: Record<string, number> = {}

  // Agrupar servicios por empresaGrupoId
  const serviciosConEmpresa = servicios.filter(s => s.empresaGrupoId)
  
  if (serviciosConEmpresa.length > 0) {
    const empresaGrupoIds = [...new Set(serviciosConEmpresa.map(s => s.empresaGrupoId))]
    const empresas = await prisma.empresaGrupoDraxton.findMany({
      where: { id: { in: empresaGrupoIds }, clienteWebId: { not: null } },
      select: { id: true, clienteWebId: true },
    })

    const clienteWebIds = empresas.map(e => e.clienteWebId as number)
    const clientes = await prisma.clienteWeb.findMany({
      where: { id: { in: clienteWebIds } },
      select: { id: true, codigo: true },
    })

    for (const servicio of serviciosConEmpresa) {
      const empresa = empresas.find(e => e.id === servicio.empresaGrupoId)
      if (empresa) {
        const cliente = clientes.find(c => c.id === empresa.clienteWebId)
        if (cliente && cliente.codigo) {
          importesPorCodigo[cliente.codigo] = (importesPorCodigo[cliente.codigo] || 0) + Number(servicio.precioMensual || 0)
        }
      }
    }
  }

  // Si no hay asignación por servicio pero hay empresa de facturación global
  if (Object.keys(importesPorCodigo).length === 0 && contrato.clienteFacturacionId) {
    const cliente = await prisma.clienteWeb.findUnique({
      where: { id: contrato.clienteFacturacionId },
      select: { codigo: true },
    })
    if (cliente && cliente.codigo) {
      importesPorCodigo[cliente.codigo] = Number(contrato.importeMensual || 0)
    }
  }

  return importesPorCodigo
}
