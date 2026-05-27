import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token requerido' }, { status: 400 })
  }

  try {
    const alta = await prisma.altaServicio.findUnique({
      where: { token },
      include: {
        documentos: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 })
    }

    return NextResponse.json({
      id: alta.id,
      tipoCliente: alta.tipoCliente,
      nombre: alta.nombre,
      apellidos: alta.apellidos,
      razonSocial: alta.razonSocial,
      email: alta.email,
      tarifaNombre: alta.tarifaNombre,
      estado: alta.estado,
      esPortabilidad: alta.esPortabilidad,
      titularLineaDiferente: alta.titularLineaDiferente,
      documentos: alta.documentos.map(d => ({
        id: d.id,
        tipo: d.tipo,
        nombreArchivo: d.nombreArchivo,
        url: d.url,
        validado: d.validado,
        createdAt: d.createdAt,
      })),
    })
  } catch (error: any) {
    console.error('Error obteniendo info del alta:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
