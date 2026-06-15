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
  const { estado, tipo, municipio, tieneFacturacion, categoriaContrato, soloConEmail } = body

  // Construir filtro para ClienteWeb
  const where: Prisma.ClienteWebWhereInput = {}

  // Estado: activo / baja / todos
  if (estado === 'activo') {
    where.activo = true
  } else if (estado === 'baja') {
    where.activo = false
  }
  // si es 'todos' no filtramos

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

  // Solo con email válido (siempre recomendado para envío)
  if (soloConEmail !== false) {
    where.email = { not: '', contains: '@' }
  }

  // Filtrar por si tiene contratos activos con facturación
  if (tieneFacturacion === 'con') {
    // Clientes que tienen al menos un contrato activo
    where.ispGestionId = {
      in: await getClienteIdsConContratos(true, categoriaContrato),
    }
  } else if (tieneFacturacion === 'sin') {
    where.ispGestionId = {
      notIn: await getClienteIdsConContratos(true, undefined),
    }
  } else if (categoriaContrato && categoriaContrato !== '') {
    // Si hay filtro de categoría de contrato pero no de facturación
    where.ispGestionId = {
      in: await getClienteIdsConContratos(true, categoriaContrato),
    }
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

async function getClienteIdsConContratos(activo: boolean, categoria?: string): Promise<string[]> {
  const contratoWhere: Prisma.ContratoServicioWhereInput = { activo }
  
  if (categoria && categoria !== '') {
    contratoWhere.categoria = { contains: categoria, mode: 'insensitive' }
  }

  const contratos = await prisma.contratoServicio.findMany({
    where: contratoWhere,
    select: { clienteId: true },
    distinct: ['clienteId'],
  })

  return contratos.map(c => c.clienteId)
}

// GET para obtener las opciones de filtro (municipios, categorías de contrato)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Obtener municipios únicos
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

  // Obtener categorías de contrato únicas
  const categoriasRaw = await prisma.contratoServicio.groupBy({
    by: ['categoria'],
    where: { activo: true, categoria: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const categorias = categoriasRaw
    .filter(c => c.categoria && c.categoria.trim() !== '')
    .map(c => ({ value: c.categoria!, count: c._count.id }))

  // Stats generales
  const totalClientes = await prisma.clienteWeb.count()
  const totalActivos = await prisma.clienteWeb.count({ where: { activo: true } })
  const totalEmpresas = await prisma.clienteWeb.count({ where: { activo: true, personaFisica: false } })
  const totalParticulares = await prisma.clienteWeb.count({ where: { activo: true, personaFisica: true } })

  return NextResponse.json({
    municipios,
    categorias,
    stats: { totalClientes, totalActivos, totalEmpresas, totalParticulares },
  })
}
