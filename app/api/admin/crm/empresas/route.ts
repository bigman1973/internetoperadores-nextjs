import { NextRequest, NextResponse } from 'next/server'
import { Prisma, SegmentoCrm } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { parseEmpresaFields, normalizarNif } from '@/lib/crm-empresas'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { bloqueoActuacion } from '@/lib/area1-m365'
import { verificarPermisoServer } from '@/lib/permisos'
import { acquireIspOrigenFenceTx, readIspEmpresaOwnership } from '@/lib/isp-origen-server'
import { persistedClienteOrigin, resolverIdentidadIsp, rejectIspOrigen } from '@/lib/isp-origen-policy'

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
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || session.user.userType !== 'admin') return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  if (bloqueoActuacion(session)) return NextResponse.json({ error: 'No se permite crear empresas durante una actuación.' }, { status: 403 })
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso para crear empresas CRM.' }, { status: auth.status })
  if (auth.user.id !== Number(session.user.id)) return NextResponse.json({ error: 'La sesión ha cambiado.' }, { status: 401 })
  if (process.env.IO_PRODUCTION_READ_ONLY === '1' || process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1') return NextResponse.json({ error: 'La aplicación está en modo de solo lectura.', code: 'ISP_READ_ONLY' }, { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > 16000) return NextResponse.json({ error: 'Formulario demasiado grande.' }, { status: 413 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 })
  const { clienteId, contactoId, titularNuevo, ...rawFields } = body as Record<string, unknown>
  let fields: ReturnType<typeof parseEmpresaFields>
  try { fields = parseEmpresaFields(rawFields) } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }) }
  const clientId = clienteId == null || clienteId === '' ? null : Number(clienteId)
  if (clientId != null && (!Number.isSafeInteger(clientId) || clientId <= 0)) return NextResponse.json({ error: 'Cliente seleccionado no válido.' }, { status: 400 })
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
      // Revalidar sesión, cuenta y permisos vivos antes de cualquier operación de negocio.
      const liveSession = await getServerSession(authOptions)
      const liveAuth = await authorizeCrmEmpresas(true)
      if (!liveSession?.user?.id || liveSession.user.userType !== 'admin' || bloqueoActuacion(liveSession)
        || Number(liveSession.user.id) !== auth.user!.id || liveAuth.user?.id !== auth.user!.id) {
        throw Object.assign(new Error('ISP_SYNC_UNAUTHORIZED'), { code: 'ISP_SYNC_UNAUTHORIZED' })
      }
      if (process.env.IO_PRODUCTION_READ_ONLY === '1' || process.env.FINANCE_DEPLOYMENT_READ_ONLY === '1') throw Object.assign(new Error('ISP_READ_ONLY'), { code: 'ISP_READ_ONLY' })
      const actor = await tx.usuarioAdmin.findUnique({ where: { id: auth.user!.id }, select: { activo: true, rol: true } })
      if (!actor?.activo || !(await verificarPermisoServer(auth.user!.id, 'admin.crm.empresas', actor.rol, tx)).escritura
        || (clientId && !(await verificarPermisoServer(auth.user!.id, 'admin.clientes', actor.rol, tx)).lectura)
        || ((contactId || holder) && !(await verificarPermisoServer(auth.user!.id, 'admin.crm.contactos', actor.rol, tx)).escritura)) {
        throw Object.assign(new Error('ISP_SYNC_UNAUTHORIZED'), { code: 'ISP_SYNC_UNAUTHORIZED' })
      }
      await acquireIspOrigenFenceTx(tx)
      let sourceIdentity: ReturnType<typeof resolverIdentidadIsp> | null = null
      if (clientId) {
        await tx.$queryRaw`SELECT id FROM clientes_web WHERE id = ${clientId} FOR UPDATE`.catch(() => rejectIspOrigen())
        const client = await tx.clienteWeb.findUnique({ where: { id: clientId }, select: { id: true, ispGestionId: true, clienteIdIsp: true, nombre: true, nif: true, cif: true } }).catch(() => rejectIspOrigen())
        if (!client) return { invalid: 'El cliente elegido ya no está disponible.' }
        const linked = await tx.crmEmpresaCliente.findUnique({ where: { clienteId: clientId }, select: { empresaId: true } }).catch(() => rejectIspOrigen())
        if (linked) rejectIspOrigen()
        const nativeId = typeof client.ispGestionId === 'string' && /^[1-9][0-9]*$/.test(client.ispGestionId) ? client.ispGestionId : null
        const snapshots = await tx.ispClienteArea1.findMany({ where: { OR: [{ clienteWebId: clientId }, ...(nativeId ? [{ ispClienteId: nativeId }] : [])] },
          select: { id: true, ispClienteId: true, clienteWebId: true, crmEmpresaId: true, nombre: true, cif: true, nif: true, docNormalizado: true }, take: 501 }).catch(() => rejectIspOrigen())
        if (snapshots.length >= 501 || snapshots.some(row => !row.id || !nativeId || row.ispClienteId !== nativeId
          || (row.clienteWebId != null && row.clienteWebId !== clientId) || row.crmEmpresaId != null)) rejectIspOrigen()
        const origin = persistedClienteOrigin(client, snapshots.length > 0)
        if (origin === 'unknown') rejectIspOrigen()
        if (origin === 'source') {
          sourceIdentity = resolverIdentidadIsp({ nombre: fields.nombre, nif: fields.nif }, snapshots.length ? snapshots : [client])
          // No elección arbitraria entre identidades, ni mezcla silenciosa de input y fuente.
          if (!sourceIdentity.nombre || sourceIdentity.multiplesIdentidades || sourceIdentity.conflictos.includes('DOCUMENTOS_ISP_CONTRADICTORIOS')
            || fields.nombre !== sourceIdentity.nombre || fields.nif !== sourceIdentity.nif) rejectIspOrigen()
          fields = { ...fields, nombre: sourceIdentity.nombre, nif: sourceIdentity.nif, nifNormalizado: normalizarNif(sourceIdentity.nif) }
        }
      }
      if (fields.nifNormalizado) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${fields.nifNormalizado}))`
        const existing = await tx.crmEmpresa.findFirst({ where: { nifNormalizado: fields.nifNormalizado, activo: true }, select: { id: true } })
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
      }, select: { id: true } })
      if (clientId) {
        await tx.crmEmpresaCliente.create({ data: { empresaId: company.id, clienteId: clientId } })
        const finalLink = await tx.crmEmpresaCliente.findUnique({ where: { clienteId: clientId }, select: { empresaId: true } }).catch(() => rejectIspOrigen())
        if (finalLink?.empresaId !== company.id) rejectIspOrigen()
        const ownership = await readIspEmpresaOwnership(tx, company.id)
        if (sourceIdentity) {
          const finalIdentity = resolverIdentidadIsp({ nombre: fields.nombre, nif: fields.nif }, ownership.cuentas)
          if (!ownership.linked || finalIdentity.nombre !== fields.nombre || finalIdentity.nif !== fields.nif || finalIdentity.multiplesIdentidades) rejectIspOrigen()
        } else if (ownership.linked) rejectIspOrigen()
      }
      return { company, identidadOrigen: sourceIdentity ? 'ISP' : 'LOCAL' }
    }, { isolationLevel: 'Serializable' })
    if ('conflict' in result) return NextResponse.json({ error: 'Ya existe una cuenta con este NIF. Ábrela y revisa la asociación.', existingId: result.conflict?.id }, { status: 409 })
    if ('invalid' in result) return NextResponse.json({ error: result.invalid }, { status: 400 })
    return NextResponse.json({ success: true, id: result.company!.id, identidadOrigen: result.identidadOrigen }, { status: 201 })
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : null
    if (code === 'ISP_ORIGEN_NO_EDITABLE' || code === 'P2002' || code === 'P2034') return NextResponse.json({ error: 'No se pudo verificar la identidad o la asociación del cliente. Recarga y revisa los datos de origen.', code: 'ISP_ORIGEN_NO_EDITABLE' }, { status: 409 })
    if (code === 'ISP_SYNC_UNAUTHORIZED' || code === 'ISP_READ_ONLY') return NextResponse.json({ error: 'La creación no está autorizada o está en modo de solo lectura.', code }, { status: 403 })
    console.error('[CRM-EMPRESAS] No se pudo crear la empresa.')
    return NextResponse.json({ error: 'No se ha podido crear la empresa.' }, { status: 500 })
  }
}
