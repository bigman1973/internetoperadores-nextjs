import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const estado = searchParams.get('estado')
  const municipio = searchParams.get('municipio')
  const prioridad = searchParams.get('prioridad')
  const buscar = searchParams.get('buscar')

  const where: any = {}

  if (estado && estado !== 'todos') {
    where.estado = estado
  }

  if (municipio && municipio !== 'todos') {
    where.municipio = municipio
  }

  if (prioridad && prioridad !== 'todos') {
    where.prioridad = prioridad
  }

  if (buscar) {
    where.OR = [
      { nombre: { contains: buscar, mode: 'insensitive' } },
      { direccion: { contains: buscar, mode: 'insensitive' } },
      { tarifa: { contains: buscar, mode: 'insensitive' } },
    ]
  }

  const clientes = await prisma.clienteMigracionAdamo.findMany({
    where,
    orderBy: [
      { prioridad: 'asc' }, // ALTA primero (A antes que N)
      { facturacionMensual: 'desc' }, // Mayor facturación primero
      { nombre: 'asc' },
    ],
  })

  // Estadísticas
  const stats = await prisma.clienteMigracionAdamo.groupBy({
    by: ['estado'],
    _count: { estado: true },
  })

  const totalClientes = await prisma.clienteMigracionAdamo.count()
  const clientesAlta = await prisma.clienteMigracionAdamo.count({
    where: { prioridad: 'ALTA' },
  })
  const ingresosMensuales = await prisma.clienteMigracionAdamo.aggregate({
    _sum: { precioCliente: true },
  })
  const costeMensual = await prisma.clienteMigracionAdamo.aggregate({
    _sum: { precioOperador: true },
  })
  const totalFacturacion = await prisma.clienteMigracionAdamo.aggregate({
    _sum: { facturacionMensual: true },
  })

  // Municipios únicos para filtro
  const municipios = await prisma.clienteMigracionAdamo.findMany({
    select: { municipio: true },
    distinct: ['municipio'],
    where: { municipio: { not: null } },
    orderBy: { municipio: 'asc' },
  })

  // Tarifas de fibra disponibles para ofrecer como alternativa
  const tarifas = await prisma.tarifa.findMany({
    where: {
      activa: true,
      categoria: 'INTERNET',
      subcategoria: 'Fibra',
    },
    select: {
      id: true,
      nombre: true,
      precioSinIva: true,
      precioConIva: true,
      tipoCliente: true,
      velocidad: true,
    },
    orderBy: { precioSinIva: 'asc' },
  })

  return NextResponse.json({
    clientes,
    stats: {
      total: totalClientes,
      porEstado: stats,
      ingresosMensuales: ingresosMensuales._sum.precioCliente || 0,
      costeMensual: costeMensual._sum.precioOperador || 0,
      totalFacturacion: totalFacturacion._sum.facturacionMensual || 0,
      clientesAlta,
    },
    municipios: municipios.map(m => m.municipio).filter(Boolean),
    tarifas,
  })
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { id, estado, notas, alternativaOfrecida, precioAlternativa } = body

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
  }

  const updateData: any = {}
  if (estado) updateData.estado = estado
  if (notas !== undefined) updateData.notas = notas
  if (alternativaOfrecida !== undefined) updateData.alternativaOfrecida = alternativaOfrecida
  if (precioAlternativa !== undefined) updateData.precioAlternativa = precioAlternativa

  if (estado === 'CONTACTADO' && !updateData.fechaContacto) {
    updateData.fechaContacto = new Date()
  }
  if ((estado === 'MIGRADO' || estado === 'BAJA') && !updateData.fechaResolucion) {
    updateData.fechaResolucion = new Date()
  }

  const cliente = await prisma.clienteMigracionAdamo.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(cliente)
}

// Actualización masiva
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { ids, estado, notas } = body

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'IDs requeridos' }, { status: 400 })
  }

  const updateData: any = {}
  if (estado) updateData.estado = estado
  if (notas) updateData.notas = notas
  if (estado === 'CONTACTADO') updateData.fechaContacto = new Date()
  if (estado === 'MIGRADO' || estado === 'BAJA') updateData.fechaResolucion = new Date()

  await prisma.clienteMigracionAdamo.updateMany({
    where: { id: { in: ids } },
    data: updateData,
  })

  return NextResponse.json({ success: true, updated: ids.length })
}
