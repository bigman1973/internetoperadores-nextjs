export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../../lib/auth'
import prisma from '../../../../../lib/prisma'
import { persistedClienteOrigin } from '../../../../../lib/isp-origen-policy'
import { acquireIspOrigenFenceTx } from '../../../../../lib/isp-origen-server'
import { esSegmentoCrm } from '../../../../../lib/crm-segmentos'
import { reconciliarContactosCrmConClientes } from '../../../../../lib/crm-contactos'

const originError = () => Object.assign(new Error('Los datos de origen ISP no son editables.'), { code: 'ISP_ORIGEN_NO_EDITABLE', status: 409 })
// No basta un prefijo recibido. Sólo un alta manual persistida y sin evidencia fuente permite edición de origen local.
async function manualAccount(tx: any, row: any): Promise<boolean> {
  const source = await tx.ispClienteArea1.findFirst({ where: { OR: [{ clienteWebId: row.id }, { ispClienteId: row.ispGestionId }] }, select: { id: true } })
  return persistedClienteOrigin(row, Boolean(source)) === 'manual'
}


export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Verificar permisos (solo Super Admin y Gerente pueden eliminar)
    if (!['SUPER_ADMIN', 'GERENTE'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'No tienes permisos para eliminar clientes' },
        { status: 403 }
      )
    }

    const resolvedParams = await params
    const clienteId = parseInt(resolvedParams.id)

    if (!Number.isSafeInteger(clienteId) || clienteId < 1) return NextResponse.json({ error: 'Cliente no válido.' }, { status: 400 })
    await prisma.$transaction(async (tx) => {
      await acquireIspOrigenFenceTx(tx)
      const row = await tx.clienteWeb.findUnique({ where: { id: clienteId } })
      if (!row) throw Object.assign(new Error('Cliente no encontrado'), { status: 404 })
      if (!await manualAccount(tx, row)) throw originError()
      // El veto fuente precede notificaciones/cascadas. Ambas escrituras revierten juntas.
      await tx.notificacionCliente.deleteMany({ where: { clienteId } })
      await tx.clienteWeb.delete({ where: { id: clienteId } })
    }, { isolationLevel: 'Serializable' })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error?.code === 'ISP_ORIGEN_NO_EDITABLE') return NextResponse.json({ error: 'Los datos de origen ISP no son editables.', code: error.code }, { status: 409 })
    if (error?.status === 400) return NextResponse.json({ error: 'Payload no válido.' }, { status: 400 })
    if (error?.status === 404) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 })
    console.error('Error al eliminar cliente:', error)
    return NextResponse.json(
      { error: 'Error al eliminar cliente' },
      { status: 500 }
    )
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const clienteId = parseInt(resolvedParams.id)

    const cliente = await prisma.clienteWeb.findUnique({
      where: { id: clienteId },
      include: {
        notificaciones: {
          orderBy: { fechaEnvio: 'desc' },
          take: 10,
        },
      },
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    return NextResponse.json(cliente)
  } catch (error: any) {
    if (error?.code === 'ISP_ORIGEN_NO_EDITABLE') return NextResponse.json({ error: 'Los datos de origen ISP no son editables.', code: error.code }, { status: 409 })
    if (error?.status === 400) return NextResponse.json({ error: 'Payload no válido.' }, { status: 400 })
    if (error?.status === 404) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 })
    console.error('Error al obtener cliente:', error)
    return NextResponse.json(
      { error: 'Error al obtener cliente' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const resolvedParams = await params
    const clienteId = parseInt(resolvedParams.id)
    const body = await request.json()

    if (!Number.isSafeInteger(clienteId) || clienteId < 1) return NextResponse.json({ error: 'Cliente no válido.' }, { status: 400 })

    // Campos actualizables
    const updateData: any = {}
    const allowedFields = [
      'nombre', 'email', 'nif', 'cif', 'personaFisica', 'nombreComercial',
      'apellidos', 'nombrePila', 'telefono', 'movil', 'fax', 'web', 'movilSms',
      'tipoCalle', 'domicilio', 'numero', 'edificio', 'bloque', 'escalera',
      'piso', 'puerta', 'municipio', 'localidad', 'codigoPostal', 'provincia',
      'pais', 'coordenadas', 'cuentaCargo', 'cuentaContable', 'formaPago',
      'tipoIva', 'facturaElectronica', 'facturaMail', 'facturaPapel',
      'alertaFacturacion', 'representante', 'cargoRepresentante', 'nifRepresentante',
      'activo', 'baneado', 'idioma', 'recibePublicidad', 'aceptoLopd',
      'newsletterSuscrito', 'origen', 'oficinaContable', 'organoGestor', 'unidadTramitadora'
    ]

    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.entries(body).some(([key, value]) => ![...allowedFields, 'segmentoCrm'].includes(key)
        || (value !== null && !['string', 'number', 'boolean'].includes(typeof value)))) throw originError()
    const cliente = await prisma.$transaction(async (tx) => {
      await acquireIspOrigenFenceTx(tx)
      const clienteActual = await tx.clienteWeb.findUnique({ where: { id: clienteId } })
      if (!clienteActual) throw Object.assign(new Error('Cliente no encontrado.'), { status: 404 })
      const manual = await manualAccount(tx, clienteActual)
      const local = new Set(['newsletterSuscrito', 'segmentoCrm', 'recibePublicidad', 'aceptoLopd'])
      for (const [key, value] of Object.entries(body)) {
        if (!manual && !local.has(key) && (clienteActual as any)[key] !== value) throw originError()
      }
      for (const field of allowedFields) {
        if (body[field] !== undefined && (manual || local.has(field))) {
          updateData[field] = body[field]
        }
      }

      if (body.segmentoCrm !== undefined) {
        if (!esSegmentoCrm(body.segmentoCrm)) {
          throw Object.assign(new Error('Clasificación CRM no válida.'), { status: 400 })
        }

        if (body.segmentoCrm !== clienteActual.segmentoCrm) {
          updateData.segmentoCrm = body.segmentoCrm
          updateData.segmentoCrmActualizadoAt = new Date()
          updateData.segmentoCrmActualizadoPor = session.user.email || session.user.name || 'Administrador'
        }
      }

      const updated = await tx.clienteWeb.update({
        where: { id: clienteId },
        data: updateData,
      })

      return { updated, previousEmail: clienteActual.email }
    }, { isolationLevel: 'Serializable' })
    if (body.email !== undefined || body.segmentoCrm !== undefined) {
      await reconciliarContactosCrmConClientes([cliente.previousEmail, cliente.updated.email])
    }
    return NextResponse.json(cliente.updated)
  } catch (error: any) {
    if (error?.code === 'ISP_ORIGEN_NO_EDITABLE') return NextResponse.json({ error: 'Los datos de origen ISP no son editables.', code: error.code }, { status: 409 })
    if (error?.status === 400) return NextResponse.json({ error: 'Payload no válido.' }, { status: 400 })
    if (error?.status === 404) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 })
    console.error('Error al actualizar cliente:', error)
    return NextResponse.json(
      { error: 'Error al actualizar cliente' },
      { status: 500 }
    )
  }
}
