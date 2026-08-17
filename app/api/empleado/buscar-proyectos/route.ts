import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json([], { status: 401 })

  const q = req.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return NextResponse.json([])

  // Buscar en Proyecto (proyectos genéricos / internos)
  const proyectosGenericos = await prisma.proyecto.findMany({
    where: {
      OR: [
        { nombre: { contains: q, mode: 'insensitive' } },
        { codigo: { contains: q, mode: 'insensitive' } },
        { clienteNombre: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nombre: true, codigo: true, clienteNombre: true, estado: true },
    take: 10,
  })

  // Buscar en ProyectoContratoDraxton (proyectos singulares de cliente)
  const proyectosSingulares = await prisma.proyectoContratoDraxton.findMany({
    where: {
      AND: [
        { activo: true },
        {
          OR: [
            { titulo: { contains: q, mode: 'insensitive' } },
            { ubicacion: { contains: q, mode: 'insensitive' } },
            { descripcion: { contains: q, mode: 'insensitive' } },
          ],
        },
      ],
    },
    select: { id: true, titulo: true, ubicacion: true, estado: true, categoria: true },
    take: 10,
  })

  // Unificar resultados con tipo
  const resultados = [
    ...proyectosGenericos.map(p => ({
      id: p.id,
      nombre: p.nombre,
      tipo: 'interno' as const,
      detalle: p.clienteNombre || p.codigo || '',
      estado: p.estado,
    })),
    ...proyectosSingulares.map(p => ({
      id: p.id,
      nombre: p.titulo,
      tipo: 'cliente' as const,
      detalle: p.ubicacion || p.categoria || '',
      estado: p.estado,
    })),
  ]

  return NextResponse.json(resultados)
}
