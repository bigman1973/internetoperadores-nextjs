import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: Obtener facturas vinculadas a un contrato + facturas candidatas + matriz facturación
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
          id: { notIn: idsYaVinculados.length > 0 ? idsYaVinculados : [0] },
        },
        orderBy: { fecha: 'desc' },
      })
    : []

  // Servicios del contrato
  const servicios = (contrato.serviciosJson as any[]) || []

  // Construir matriz de facturación: servicio × mes
  const matrizFacturacion = construirMatrizFacturacion(vinculaciones, servicios, anio)

  // Calcular resumen
  const totalFacturado = vinculaciones.reduce((sum, v) => sum + Number(v.importeAsignado), 0)

  return NextResponse.json({
    vinculadas: vinculaciones.map(v => ({
      id: v.id,
      facturaId: v.facturaId,
      importeAsignado: Number(v.importeAsignado),
      tipoVinculacion: v.auto ? 'auto' : 'manual',
      estado: v.estado || 'auto',
      servicioIndex: v.servicioIndex,
      notas: v.notas,
      factura: v.factura ? {
        id: v.factura.id,
        fecha: v.factura.fecha,
        numero: v.factura.numeroDocumento,
        documento: v.factura.documento,
        clienteNombre: v.factura.nombreCompleto,
        codigoCliente: v.factura.codigoCliente,
        baseImponible: Number(v.factura.base),
        total: Number(v.factura.total),
        situacion: v.factura.situacion,
      } : null,
    })),
    candidatas: facturasCandidatas.map(f => ({
      id: f.id,
      fecha: f.fecha,
      numero: f.numeroDocumento,
      documento: f.documento,
      clienteNombre: f.nombreCompleto,
      codigoCliente: f.codigoCliente,
      baseImponible: Number(f.base),
      total: Number(f.total),
      situacion: f.situacion,
    })),
    servicios: servicios.map((s, i) => ({
      index: i,
      ubicacion: s.ubicacion,
      servicio: s.servicio,
      precioMensual: Number(s.precioMensual || 0),
      empresaGrupoId: s.empresaGrupoId,
    })),
    matrizFacturacion,
    totalFacturado,
    totalFacturas: vinculaciones.length,
    codigosEmpresa: codigosCliente,
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
            estado: 'pendiente',
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

  // Modo automático: buscar facturas y asignar inteligentemente a servicios
  if (modo === 'auto') {
    const ejercicio = anio || new Date().getFullYear()

    const contrato = await prisma.contratoDraxton.findUnique({
      where: { id: contratoId },
    })

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 })
    }

    const codigosCliente = await obtenerCodigosClienteContrato(contrato)

    if (codigosCliente.length === 0) {
      return NextResponse.json({ 
        vinculadas: 0, 
        modo: 'auto', 
        mensaje: 'No hay empresas asignadas a este contrato. Asigna una empresa de facturación al contrato o a sus servicios.' 
      })
    }

    // Obtener vinculaciones existentes
    const vinculacionesExistentes = await prisma.facturaContratoDraxton.findMany({
      where: { contratoDraxtonId: contratoId },
      select: { facturaId: true },
    })
    const idsYaVinculados = new Set(vinculacionesExistentes.map(v => v.facturaId))

    // Obtener facturas candidatas
    const facturasCandidatas = await prisma.factura.findMany({
      where: {
        codigoCliente: { in: codigosCliente },
        ejercicio: ejercicio,
        id: { notIn: Array.from(idsYaVinculados) },
      },
      orderBy: { fecha: 'asc' },
    })

    // Servicios del contrato con info de empresa
    const servicios = (contrato.serviciosJson as any[]) || []
    const serviciosConEmpresa = await enriquecerServiciosConCodigo(servicios)

    // Matching inteligente: asignar facturas a servicios
    const nuevasVinculaciones: any[] = []

    // Agrupar facturas por mes y código de cliente
    const facturasPorMesYCliente = new Map<string, typeof facturasCandidatas>()
    for (const f of facturasCandidatas) {
      const fecha = new Date(f.fecha)
      const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}_${f.codigoCliente}`
      if (!facturasPorMesYCliente.has(key)) facturasPorMesYCliente.set(key, [])
      facturasPorMesYCliente.get(key)!.push(f)
    }

    // Para cada grupo mes+cliente, intentar asignar a servicios
    for (const [key, facturas] of facturasPorMesYCliente) {
      const codigoCliente = key.split('_')[1]
      
      // Encontrar servicios que corresponden a este código de cliente
      const serviciosDeEstaEmpresa = serviciosConEmpresa
        .filter(s => s.codigoCliente === codigoCliente)
        .sort((a, b) => b.precioMensual - a.precioMensual) // Mayor precio primero

      if (serviciosDeEstaEmpresa.length === 0) continue

      // Si hay un solo servicio para esta empresa, asignar todas las facturas que coincidan en importe
      if (serviciosDeEstaEmpresa.length === 1) {
        const servicio = serviciosDeEstaEmpresa[0]
        for (const f of facturas) {
          const baseFactura = Number(f.base)
          if (servicio.precioMensual > 0 && Math.abs(baseFactura - servicio.precioMensual) / servicio.precioMensual <= 0.05) {
            nuevasVinculaciones.push({
              facturaId: f.id,
              contratoDraxtonId: contratoId,
              importeAsignado: f.base,
              auto: true,
              estado: 'auto',
              servicioIndex: servicio.index,
            })
          }
        }
      } else {
        // Múltiples servicios para la misma empresa: matching por importe
        // Ordenar facturas por importe descendente
        const facturasOrdenadas = [...facturas].sort((a, b) => Number(b.base) - Number(a.base))
        const serviciosUsados = new Set<number>()

        for (const f of facturasOrdenadas) {
          const baseFactura = Number(f.base)
          // Buscar servicio con importe similar que no haya sido usado este mes
          const servicioMatch = serviciosDeEstaEmpresa.find(s => 
            !serviciosUsados.has(s.index) &&
            s.precioMensual > 0 &&
            Math.abs(baseFactura - s.precioMensual) / s.precioMensual <= 0.05
          )

          if (servicioMatch) {
            nuevasVinculaciones.push({
              facturaId: f.id,
              contratoDraxtonId: contratoId,
              importeAsignado: f.base,
              auto: true,
              estado: 'auto',
              servicioIndex: servicioMatch.index,
            })
            serviciosUsados.add(servicioMatch.index)
          } else {
            // Si todos los servicios tienen el mismo precio, asignar secuencialmente
            const servicioLibre = serviciosDeEstaEmpresa.find(s => !serviciosUsados.has(s.index))
            if (servicioLibre && servicioLibre.precioMensual > 0 && 
                Math.abs(baseFactura - servicioLibre.precioMensual) / servicioLibre.precioMensual <= 0.05) {
              nuevasVinculaciones.push({
                facturaId: f.id,
                contratoDraxtonId: contratoId,
                importeAsignado: f.base,
                auto: true,
                estado: 'auto',
                servicioIndex: servicioLibre.index,
              })
              serviciosUsados.add(servicioLibre.index)
            }
          }
        }
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
            update: { 
              importeAsignado: v.importeAsignado, 
              auto: true, 
              estado: 'auto',
              servicioIndex: v.servicioIndex,
            },
          })
        )
      )
    }

    return NextResponse.json({
      vinculadas: nuevasVinculaciones.length,
      candidatasAnalizadas: facturasCandidatas.length,
      codigosEmpresa: codigosCliente,
      modo: 'auto',
    })
  }

  return NextResponse.json({ error: 'Modo no válido (usar "auto" o "manual")' }, { status: 400 })
}

// PATCH: Actualizar vinculación (asignar servicio, cambiar estado, notas)
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { vinculacionId, servicioIndex, estado, notas } = body

  if (!vinculacionId) {
    return NextResponse.json({ error: 'vinculacionId requerido' }, { status: 400 })
  }

  const updateData: any = {}
  if (servicioIndex !== undefined) updateData.servicioIndex = servicioIndex
  if (estado) updateData.estado = estado
  if (notas !== undefined) updateData.notas = notas

  const updated = await prisma.facturaContratoDraxton.update({
    where: { id: vinculacionId },
    data: updateData,
  })

  return NextResponse.json({ ok: true, updated })
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

// Enriquecer servicios con código de cliente para matching
async function enriquecerServiciosConCodigo(servicios: any[]): Promise<any[]> {
  const empresaGrupoIds = [...new Set(servicios.filter(s => s.empresaGrupoId).map(s => s.empresaGrupoId))]
  
  if (empresaGrupoIds.length === 0) return servicios.map((s, i) => ({ ...s, index: i, codigoCliente: null }))

  const empresas = await prisma.empresaGrupoDraxton.findMany({
    where: { id: { in: empresaGrupoIds }, clienteWebId: { not: null } },
    select: { id: true, clienteWebId: true },
  })

  const clienteWebIds = empresas.map(e => e.clienteWebId as number)
  const clientes = await prisma.clienteWeb.findMany({
    where: { id: { in: clienteWebIds } },
    select: { id: true, codigo: true },
  })

  return servicios.map((s, i) => {
    const empresa = empresas.find(e => e.id === s.empresaGrupoId)
    const cliente = empresa ? clientes.find(c => c.id === empresa.clienteWebId) : null
    return {
      ...s,
      index: i,
      precioMensual: Number(s.precioMensual || 0),
      codigoCliente: cliente?.codigo || null,
    }
  })
}

// Construir matriz de facturación: servicio × mes
function construirMatrizFacturacion(vinculaciones: any[], servicios: any[], anio: number) {
  const meses = Array.from({ length: 12 }, (_, i) => i + 1)
  
  // Inicializar matriz
  const matriz: Record<number, Record<number, { facturado: boolean; importe: number; facturaId?: number }>> = {}
  servicios.forEach((_, i) => {
    matriz[i] = {}
    meses.forEach(m => {
      matriz[i][m] = { facturado: false, importe: 0 }
    })
  })

  // Rellenar con vinculaciones que tienen servicioIndex asignado
  for (const v of vinculaciones) {
    if (v.servicioIndex !== null && v.servicioIndex !== undefined && v.factura) {
      const fecha = new Date(v.factura.fecha)
      if (fecha.getFullYear() === anio) {
        const mes = fecha.getMonth() + 1
        if (matriz[v.servicioIndex] && matriz[v.servicioIndex][mes]) {
          matriz[v.servicioIndex][mes] = {
            facturado: true,
            importe: Number(v.importeAsignado),
            facturaId: v.facturaId,
          }
        }
      }
    }
  }

  return matriz
}
