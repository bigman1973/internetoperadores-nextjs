import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { estado, tipo, municipio, tieneFacturacion, tarifa } = body

  // Construir filtro para ClienteWeb
  const where: Prisma.ClienteWebWhereInput = {}

  // Estado: activo / baja / todos
  if (estado === 'activo') {
    where.activo = true
  } else if (estado === 'baja') {
    where.activo = false
  }

  // Tipo: empresa / particular / todos
  if (tipo === 'empresa') {
    where.personaFisica = false
  } else if (tipo === 'particular') {
    where.personaFisica = true
  }

  // Municipio
  if (municipio && municipio !== '') {
    where.municipio = { contains: municipio, mode: 'insensitive' }
  }

  // Solo con email válido
  where.email = { not: '', contains: '@' }

  // Filtrar por contratos/facturación
  if (tieneFacturacion === 'con' || (tarifa && tarifa !== '')) {
    where.clienteIdIsp = {
      in: await getClienteIdsConContratos(true, tarifa || undefined),
    }
  } else if (tieneFacturacion === 'sin') {
    const idsConContrato = await getClienteIdsConContratos(true, undefined)
    where.clienteIdIsp = { notIn: idsConContrato }
  }

  // Contar
  const total = await prisma.clienteWeb.count({ where })

  // Obtener muestra de 10 para preview
  const muestra = await prisma.clienteWeb.findMany({
    where,
    select: { id: true, nombre: true, email: true, municipio: true, personaFisica: true, activo: true },
    take: 10,
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({ total, muestra })
}

async function getClienteIdsConContratos(activo: boolean, tarifa?: string): Promise<string[]> {
  const contratoWhere: Prisma.ContratoServicioWhereInput = { activo }
  
  if (tarifa && tarifa !== '') {
    contratoWhere.tarifa = { contains: tarifa, mode: 'insensitive' }
  }

  const contratos = await prisma.contratoServicio.findMany({
    where: contratoWhere,
    select: { clienteId: true },
    distinct: ['clienteId'],
  })

  return contratos.map(c => c.clienteId)
}

// GET para obtener las opciones de filtro
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Obtener municipios únicos de clientes activos
  const municipiosRaw = await prisma.clienteWeb.groupBy({
    by: ['municipio'],
    where: { activo: true, municipio: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 50,
  })

  const municipios = municipiosRaw
    .filter(m => m.municipio && m.municipio.trim() !== '')
    .map(m => ({ value: m.municipio!, count: m._count.id }))

  // Obtener tarifas únicas de contratos activos
  const tarifasRaw = await prisma.contratoServicio.groupBy({
    by: ['tarifa'],
    where: { activo: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const tarifas = tarifasRaw
    .filter(t => t.tarifa && t.tarifa.trim() !== '')
    .map(t => ({ value: t.tarifa!, count: t._count.id }))

  // Stats generales
  const totalClientes = await prisma.clienteWeb.count()
  const totalActivos = await prisma.clienteWeb.count({ where: { activo: true } })
  const totalEmpresas = await prisma.clienteWeb.count({ where: { activo: true, personaFisica: false } })
  const totalParticulares = await prisma.clienteWeb.count({ where: { activo: true, personaFisica: true } })
  const totalConFacturacion = await getClienteIdsConContratos(true, undefined)

  return NextResponse.json({
    municipios,
    tarifas,
    stats: {
      totalClientes,
      totalActivos,
      totalEmpresas,
      totalParticulares,
      totalConFacturacion: totalConFacturacion.length,
    },
  })
}
