import { NextRequest, NextResponse } from 'next/server'
import { Prisma, SegmentoCrm } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { parseEmpresaFields } from '@/lib/crm-empresas'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await authorizeCrmEmpresas()
  if (!auth.user) return NextResponse.json({ error: 'Acceso no autorizado.' }, { status: auth.status })
  const query = (request.nextUrl.searchParams.get('query') || '').trim().slice(0, 100)
  const segment = request.nextUrl.searchParams.get('segment') || ''
  if (segment && !['EMPRESA', 'PARTNER'].includes(segment)) return NextResponse.json({ error: 'Filtro no válido.' }, { status: 400 })
  const page = Math.min(1000, Math.max(1, Number(request.nextUrl.searchParams.get('page')) || 1))
  const limit = Math.min(40, Math.max(1, Number(request.nextUrl.searchParams.get('limit')) || 24))
  const where: Prisma.CrmEmpresaWhereInput = {
    activo: true,
    ...(segment ? { segmentoCrm: segment as SegmentoCrm } : {}),
    ...(query ? { OR: [
      { nombre: { contains: query, mode: 'insensitive' } },
      { nombreComercial: { contains: query, mode: 'insensitive' } },
      { nifNormalizado: { contains: query.toUpperCase().replace(/[^A-Z0-9]/g, '') } },
      { dominio: { contains: query.toLowerCase() } },
    ] } : {}),
  }
  const [companies, total] = await Promise.all([
    prisma.crmEmpresa.findMany({
      where, skip: (page - 1) * limit, take: limit,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, nombre: true, nombreComercial: true, tipo: true, segmentoCrm: true, nif: true, dominio: true, origen: true,
        _count: { select: { contactos: { where: { activo: true } }, clientes: true } },
      },
    }),
    prisma.crmEmpresa.count({ where }),
  ])
  return NextResponse.json({ success: true, companies, total, page, limit })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso para crear empresas CRM.' }, { status: auth.status })
  if (Number(request.headers.get('content-length') || 0) > 16000) return NextResponse.json({ error: 'Formulario demasiado grande.' }, { status: 413 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  const { clienteId, contactoId, titularNuevo, ...rawFields } = body as Record<string, unknown>
  let fields: ReturnType<typeof parseEmpresaFields>
  try { fields = parseEmpresaFields(rawFields) } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }) }
  const clientId = clienteId == null || clienteId === '' ? null : Number(clienteId)
  if (clientId != null && (!Number.isInteger(clientId) || clientId <= 0)) return NextResponse.json({ error: 'Cliente seleccionado no válido.' }, { status: 400 })
  const contactId = contactoId == null || contactoId === '' ? null : String(contactoId)
  if (contactId && (!/^c[a-z0-9]{12,35}$/i.test(contactId))) return NextResponse.json({ error: 'Contacto seleccionado no válido.' }, { status: 400 })
  const holder = titularNuevo && typeof titularNuevo === 'object' && !Array.isArray(titularNuevo) ? titularNuevo as Record<string, unknown> : null
  if (holder && Object.keys(holder).some((key) => !['nombre', 'email', 'telefono'].includes(key))) return NextResponse.json({ error: 'Datos de titular no válidos.' }, { status: 400 })
  const holderName = typeof holder?.nombre === 'string' ? holder.nombre.trim() : ''
  const holderEmail = typeof holder?.email === 'string' ? holder.email.trim().toLowerCase() : ''
  const holderPhone = typeof holder?.telefono === 'string' ? holder.telefono.trim() : ''
  if (holder && (fields.tipo !== 'AUTONOMO' || contactId || holderName.length < 2 || holderName.length > 180 || holderEmail.length > 250 || holderPhone.length > 60 || (holderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(holderEmail)))) return NextResponse.json({ error: 'El nuevo titular requiere nombre válido, correo opcional y una cuenta autónoma sin otro titular seleccionado.' }, { status: 400 })
  if (fields.tipo === 'AUTONOMO' && !contactId && !holder) return NextResponse.json({ error: 'Selecciona o introduce la persona titular del autónomo.' }, { status: 400 })
  if (clientId && !await canAccessCrmRelated(auth.user, 'admin.clientes')) return NextResponse.json({ error: 'Necesitas acceso a Clientes para vincular una cuenta ISPgestion.' }, { status: 403 })
  if ((contactId || holder) && !await canAccessCrmRelated(auth.user, 'admin.crm.contactos', true)) return NextResponse.json({ error: 'Necesitas permiso de escritura en Contactos para vincular o crear al titular.' }, { status: 403 })
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (fields.nifNormalizado) {
        // El NIF puede aparecer en más de una cuenta de ISPgestion; no fusionamos empresas sin confirmación.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${fields.nifNormalizado}))`
        const existing = await tx.crmEmpresa.findFirst({ where: { nifNormalizado: fields.nifNormalizado, activo: true }, select: { id: true, nombre: true } })
        if (existing) return { conflict: existing }
      }
      if (contactId) {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM crm_registros_hubspot WHERE id = ${contactId} AND object_type_id = '0-1' FOR UPDATE`
        if (!locked.length) return { invalid: 'El contacto elegido ya no está disponible.' }
      }
      if (holderEmail) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${holderEmail}))`
        const duplicate = await tx.crmRegistroHubspot.findFirst({ where: { objectTypeId: '0-1', email: { equals: holderEmail, mode: 'insensitive' } }, select: { id: true } })
        if (duplicate) return { invalid: 'Ya existe un contacto con ese correo. Selecciónalo como titular para evitar duplicarlo.' }
      }
      if (clientId) {
        const exists = await tx.clienteWeb.findUnique({ where: { id: clientId }, select: { id: true } })
        if (!exists) return { invalid: 'El cliente elegido ya no está disponible.' }
      }
      const holderContactId = holder ? (await tx.crmRegistroHubspot.create({ data: {
        hubspotId: `local:${randomUUID()}`, objectTypeId: '0-1', nombre: holderName,
        email: holderEmail || null, telefono: holderPhone || null, empresa: fields.nombre,
        segmentoCrm: fields.segmentoCrm as SegmentoCrm, unidadesNegocio: ['Internet Operadores'],
        datosActualizadoAt: new Date(), datosActualizadoPor: auth.user!.name,
      }, select: { id: true } })).id : null
      const titularId = contactId || holderContactId
      const hasPrimary = titularId ? await tx.crmEmpresaContacto.count({ where: { contactoId: titularId, activo: true, principal: true } }) : 0
      const company = await tx.crmEmpresa.create({ data: {
        nombre: fields.nombre!, nombreComercial: fields.nombreComercial, nif: fields.nif,
        nifNormalizado: fields.nifNormalizado, tipo: fields.tipo || 'SOCIEDAD',
        segmentoCrm: (fields.segmentoCrm || 'EMPRESA') as SegmentoCrm,
        dominio: fields.dominio, web: fields.web, telefono: fields.telefono, email: fields.email,
        sector: fields.sector, direccion: fields.direccion, codigoPostal: fields.codigoPostal,
        localidad: fields.localidad, provincia: fields.provincia, pais: fields.pais || 'ES',
        descripcion: fields.descripcion, actualizadoPor: auth.user!.name,
        ...(titularId ? { contactos: { create: { contactoId: titularId, principal: !hasPrimary, papel: fields.tipo === 'AUTONOMO' ? 'TITULAR' : 'OTRO' } } } : {}),
        ...(clientId ? { clientes: { create: { clienteId: clientId } } } : {}),
      }, select: { id: true } })
      return { company }
    })
    if ('conflict' in result) return NextResponse.json({ error: `Ya existe una cuenta con este NIF: ${result.conflict?.nombre}. Ábrela y vincula el contacto o la cuenta de cliente allí.`, existingId: result.conflict?.id }, { status: 409 })
    if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 400 })
    return NextResponse.json({ success: true, id: result.company!.id }, { status: 201 })
  } catch (error) {
    console.error('[CRM-EMPRESAS] Error al crear:', error)
    return NextResponse.json({ error: 'No se ha podido crear la empresa.' }, { status: 500 })
  }
}
