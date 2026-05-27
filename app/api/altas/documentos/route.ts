import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import prisma from '@/lib/prisma'
import { TipoDocumento } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const tipo = formData.get('tipo') as string | null
    const token = formData.get('token') as string | null

    if (!file || !tipo || !token) {
      return NextResponse.json({ error: 'Faltan parámetros: file, tipo, token' }, { status: 400 })
    }

    // Validar token
    const alta = await prisma.altaServicio.findUnique({
      where: { token },
    })

    if (!alta) {
      return NextResponse.json({ error: 'Token no válido' }, { status: 404 })
    }

    // Validar tamaño (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo no puede superar los 10 MB' }, { status: 400 })
    }

    // Validar tipo de archivo
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Solo se permiten archivos JPG, PNG, WebP o PDF' }, { status: 400 })
    }

    // Subir a Vercel Blob
    const filename = `altas/${alta.id}/${tipo}_${Date.now()}.${file.name.split('.').pop()}`
    const blob = await put(filename, file, {
      access: 'public',
      contentType: file.type,
    })

    // Si ya existe un documento del mismo tipo, eliminarlo
    const existente = await prisma.documentoAlta.findFirst({
      where: { altaId: alta.id, tipo: tipo as TipoDocumento },
    })

    if (existente) {
      await prisma.documentoAlta.delete({ where: { id: existente.id } })
    }

    // Crear registro en BD
    const documento = await prisma.documentoAlta.create({
      data: {
        altaId: alta.id,
        tipo: tipo as TipoDocumento,
        nombreArchivo: file.name,
        url: blob.url,
        mimeType: file.type,
        tamano: file.size,
      },
    })

    // Actualizar estado del alta si estaba en FORMULARIO_COMPLETADO
    if (alta.estado === 'FORMULARIO_COMPLETADO' || alta.estado === 'DOCUMENTACION_PENDIENTE') {
      await prisma.altaServicio.update({
        where: { id: alta.id },
        data: { estado: 'DOCUMENTACION_PARCIAL' },
      })
    }

    return NextResponse.json({
      id: documento.id,
      tipo: documento.tipo,
      nombreArchivo: documento.nombreArchivo,
      url: documento.url,
    })
  } catch (error: any) {
    console.error('Error subiendo documento:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
