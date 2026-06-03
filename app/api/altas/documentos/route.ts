import { NextRequest, NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import prisma from '@/lib/prisma'
import { TipoDocumento } from '@prisma/client'

const BREVO_API_KEY = (process.env.BREVO_API_KEY || '').trim()

const DOC_LABELS: Record<string, string> = {
  CONTRATO_FIRMADO: 'Contrato firmado',
  DNI_FRONTAL: 'DNI (cara frontal)',
  DNI_TRASERO: 'DNI (cara trasera)',
  CIF_EMPRESA: 'Tarjeta CIF de la empresa',
  ESCRITURAS: 'Escrituras',
  TITULARIDAD_BANCARIA: 'Certificado de titularidad bancaria',
  DNI_TITULAR_LINEA: 'DNI del titular actual de la línea',
  FACTURA_OPERADOR_ACTUAL: 'Factura del operador actual',
}

async function sendEmailToCliente({
  email,
  nombre,
  tarifaNombre,
  docSubido,
  docsSubidos,
  docsRequeridos,
}: {
  email: string
  nombre: string
  tarifaNombre: string
  docSubido: string
  docsSubidos: string[]
  docsRequeridos: { tipo: string; obligatorio: boolean }[]
}) {
  const docsFaltantes = docsRequeridos
    .filter(d => d.obligatorio && !docsSubidos.includes(d.tipo))
    .map(d => DOC_LABELS[d.tipo] || d.tipo)

  const docsCompletados = docsSubidos.map(d => DOC_LABELS[d] || d)

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1f2937; padding: 20px; text-align: center;">
        <h1 style="color: #f97316; margin: 0; font-size: 20px;">Internet Operadores</h1>
        <p style="color: #9ca3af; margin: 8px 0 0 0; font-size: 14px;">Documentación de alta</p>
      </div>
      <div style="padding: 24px; background: white; border: 1px solid #e5e7eb;">
        <h2 style="color: #1f2937; margin: 0 0 16px 0; font-size: 18px;">Hola ${nombre},</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          Hemos recibido correctamente el documento: <strong>${DOC_LABELS[docSubido] || docSubido}</strong>
        </p>
        <p style="color: #4b5563; line-height: 1.6; margin-top: 8px;">
          Alta de servicio: <strong>${tarifaNombre}</strong>
        </p>

        <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #bbf7d0;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #166534;">Documentos recibidos (${docsCompletados.length}):</p>
          ${docsCompletados.map(d => `<p style="margin: 2px 0; color: #15803d;">✓ ${d}</p>`).join('')}
        </div>

        ${docsFaltantes.length > 0 ? `
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #fde68a;">
          <p style="margin: 0 0 8px 0; font-weight: bold; color: #92400e;">Documentos pendientes (${docsFaltantes.length}):</p>
          ${docsFaltantes.map(d => `<p style="margin: 2px 0; color: #b45309;">○ ${d}</p>`).join('')}
        </div>
        <p style="color: #4b5563; line-height: 1.6;">
          Cuando tengas todos los documentos obligatorios, pulsa <strong>"Enviar documentación"</strong> en la página de subida para completar el proceso.
        </p>
        ` : `
        <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0; border: 1px solid #bbf7d0;">
          <p style="margin: 0; font-weight: bold; color: #166534;">¡Todos los documentos obligatorios están subidos!</p>
          <p style="margin: 4px 0 0 0; color: #15803d;">Ya puedes pulsar "Enviar documentación" para completar el proceso.</p>
        </div>
        `}

        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
          Este es un email automático. Si necesitas ayuda, contacta con nosotros en el 900 730 034.
        </p>
      </div>
    </div>
  `

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Internet Operadores', email: 'comercial@internetoperadores.com' },
        to: [{ email, name: nombre }],
        subject: `Documento recibido: ${DOC_LABELS[docSubido] || docSubido} - Alta ${tarifaNombre}`,
        htmlContent,
      }),
    })
  } catch (e: any) {
    console.error('[Documentos] Error enviando email al cliente:', e.message)
  }
}

function getDocsRequeridos(tipoCliente: string, esPortabilidad: boolean, titularLineaDiferente: boolean) {
  const docsParticular = [
    { tipo: 'CONTRATO_FIRMADO', obligatorio: true },
    { tipo: 'DNI_FRONTAL', obligatorio: true },
    { tipo: 'DNI_TRASERO', obligatorio: true },
    { tipo: 'TITULARIDAD_BANCARIA', obligatorio: true },
  ]
  const docsEmpresa = [
    { tipo: 'CONTRATO_FIRMADO', obligatorio: true },
    { tipo: 'CIF_EMPRESA', obligatorio: true },
    { tipo: 'DNI_FRONTAL', obligatorio: true },
    { tipo: 'DNI_TRASERO', obligatorio: true },
    { tipo: 'ESCRITURAS', obligatorio: false },
    { tipo: 'TITULARIDAD_BANCARIA', obligatorio: true },
  ]
  const docsPortabilidad = [
    { tipo: 'DNI_TITULAR_LINEA', obligatorio: true },
    { tipo: 'FACTURA_OPERADOR_ACTUAL', obligatorio: true },
  ]

  let docs = tipoCliente === 'EMPRESA' ? [...docsEmpresa] : [...docsParticular]
  if (esPortabilidad && titularLineaDiferente) {
    docs = [...docs, ...docsPortabilidad]
  }
  return docs
}

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
      include: { documentos: true },
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

    // Enviar email al interesado con resumen de lo subido y lo que falta
    const docsRequeridos = getDocsRequeridos(
      alta.tipoCliente,
      alta.esPortabilidad,
      alta.titularLineaDiferente
    )
    // Documentos ya subidos (incluyendo el nuevo)
    const docsSubidosActuales = alta.documentos
      .filter(d => d.tipo !== tipo) // quitar el que se reemplazó si existía
      .map(d => d.tipo)
    docsSubidosActuales.push(tipo) // añadir el nuevo

    const clienteNombre = alta.tipoCliente === 'EMPRESA'
      ? (alta.razonSocial || '')
      : `${alta.nombre || ''} ${alta.apellidos || ''}`.trim()

    // No bloquear la respuesta
    sendEmailToCliente({
      email: alta.email,
      nombre: clienteNombre,
      tarifaNombre: alta.tarifaNombre || 'Servicio',
      docSubido: tipo,
      docsSubidos: docsSubidosActuales,
      docsRequeridos,
    })

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
