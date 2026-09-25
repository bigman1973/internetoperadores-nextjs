import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { verificarPermisoServer } from '@/lib/permisos'
import { reconciliarContactosCrmConClientes } from '@/lib/crm-contactos'

function asStringRecord(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, field]) => [key, field == null ? null : String(field)]))
}

function cleanValue(value: unknown) {
  if (value == null) return null
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return undefined
  const normalized = String(value).trim()
  if (normalized.length > 20_000) return undefined
  return normalized || null
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.userType !== 'admin' || !session.user.id) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const permission = await verificarPermisoServer(Number(session.user.id), 'admin.crm.contactos', session.user.role)
  if (!permission.escritura) {
    return NextResponse.json({ error: 'No tienes permiso para editar este contacto.' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: 'La edición supera el tamaño permitido.' }, { status: 413 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  }

  const values = body.values
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    return NextResponse.json({ error: 'No se han recibido campos de contacto válidos.' }, { status: 400 })
  }
  if (Object.keys(values).length > 500) {
    return NextResponse.json({ error: 'Se han enviado demasiados campos en una sola operación.' }, { status: 400 })
  }
  const requestedVersion = Number(body.version)
  if (!Number.isInteger(requestedVersion) || requestedVersion < 0) {
    return NextResponse.json({ error: 'La versión de la ficha no es válida. Recarga la página.' }, { status: 400 })
  }
  const notes = typeof body.notasInternas === 'string' ? body.notasInternas.trim().slice(0, 20_000) || null : null
  const author = session.user.email || session.user.name || 'Administrador'

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM crm_registros_hubspot WHERE id = ${id} AND object_type_id = '0-1' FOR UPDATE`)
      const [current, definitions] = await Promise.all([
        tx.crmRegistroHubspot.findFirst({ where: { id, objectTypeId: '0-1' } }),
        tx.crmPropiedadHubspot.findMany({
          where: { objectTypeId: '0-1', soloLectura: false, calculada: false, oculta: false },
          select: { nombre: true },
        }),
      ])
      if (!current) return { kind: 'missing' as const }
      if (current.datosVersion !== requestedVersion) return { kind: 'conflict' as const }

      const allowed = new Set(definitions.map((definition) => definition.nombre))
      const source = asStringRecord(current.propiedades)
      const previousLocal = asStringRecord(current.propiedadesLocales)
      const nextLocal = { ...previousLocal }
      const changes: Array<{ campo: string; anterior: string | null; nuevo: string | null }> = []

      for (const [name, rawValue] of Object.entries(values as Record<string, unknown>)) {
        if (!allowed.has(name)) continue
        const value = cleanValue(rawValue)
        if (value === undefined) return { kind: 'invalid' as const, field: name }
        const previousEffective = Object.prototype.hasOwnProperty.call(previousLocal, name) ? previousLocal[name] : source[name] ?? null
        if (value === (source[name] ?? null)) delete nextLocal[name]
        else nextLocal[name] = value
        const nextEffective = Object.prototype.hasOwnProperty.call(nextLocal, name) ? nextLocal[name] : source[name] ?? null
        if (previousEffective !== nextEffective) changes.push({ campo: name, anterior: previousEffective, nuevo: nextEffective })
      }

      if ((current.notasInternas || null) !== notes) {
        changes.push({ campo: 'notas_internas', anterior: current.notasInternas || null, nuevo: notes })
      }
      if (changes.length === 0) {
        return { kind: 'unchanged' as const, localProperties: previousLocal, version: current.datosVersion }
      }

      const effective = { ...source, ...nextLocal }
      const name = [effective.firstname, effective.lastname].filter(Boolean).join(' ').trim() || effective.email || null
      const email = effective.email?.trim().toLowerCase() || null
      const now = new Date()
      const previousHistory = Array.isArray(current.historialCambios) ? current.historialCambios : []
      const history = [...previousHistory, { fecha: now.toISOString(), autor: author, cambios: changes }].slice(-100)

      const update = await tx.crmRegistroHubspot.updateMany({
        where: { id, datosVersion: requestedVersion },
        data: {
          propiedadesLocales: Object.keys(nextLocal).length ? nextLocal : Prisma.DbNull,
          notasInternas: notes,
          historialCambios: history,
          datosActualizadoAt: now,
          datosActualizadoPor: author,
          nombre: name,
          email,
          telefono: effective.phone || effective.mobilephone || null,
          empresa: effective.company || effective.name || null,
          vinculoClienteOrigen: current.clienteWebId && (current.email || null) !== email ? 'CRM_MANUAL' : current.vinculoClienteOrigen,
          datosVersion: { increment: 1 },
        },
      })
      if (update.count !== 1) return { kind: 'conflict' as const }

      const contact = await tx.crmRegistroHubspot.findUniqueOrThrow({
        where: { id },
        select: { id: true, email: true, propiedadesLocales: true, datosActualizadoAt: true, datosActualizadoPor: true, datosVersion: true },
      })
      return { kind: 'updated' as const, contact, previousEmail: current.email }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })

    if (result.kind === 'missing') return NextResponse.json({ error: 'Contacto no encontrado.' }, { status: 404 })
    if (result.kind === 'conflict') return NextResponse.json({ error: 'Otra persona o una sincronización ha actualizado esta ficha. Recárgala antes de guardar para no perder cambios.' }, { status: 409 })
    if (result.kind === 'invalid') return NextResponse.json({ error: `El valor de ${result.field} no es válido.` }, { status: 400 })
    if (result.kind === 'unchanged') return NextResponse.json({ success: true, unchanged: true, localProperties: result.localProperties, version: result.version })

    await reconciliarContactosCrmConClientes([result.previousEmail || '', result.contact.email || ''])
    return NextResponse.json({
      success: true,
      contactId: result.contact.id,
      localProperties: asStringRecord(result.contact.propiedadesLocales),
      updatedAt: result.contact.datosActualizadoAt,
      updatedBy: result.contact.datosActualizadoPor,
      version: result.contact.datosVersion,
    })
  } catch (error: any) {
    if (error?.code === 'P2034' || (error?.code === 'P2010' && error?.meta?.code === '40001')) {
      return NextResponse.json({ error: 'La ficha se ha actualizado al mismo tiempo en otra operación. Recarga y vuelve a guardar.' }, { status: 409 })
    }
    throw error
  }
}
