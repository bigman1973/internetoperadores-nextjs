import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read'

const AREA_FACTURAS = 'admin.finanzas.facturas'
const ROLES_LEGACY = ['CONTABILIDAD']
const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
const MAX_PAGE = 100000
const MAX_BODY_BYTES = 32 * 1024
const MAX_TEXTO_LENGTH = 4000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      'Cache-Control': 'private, no-store',
      ...init?.headers,
    },
  })
}

function withNoStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

function parsePaginationInteger(value: string | null, fallback: number, maximum: number) {
  if (value === null) return fallback
  if (!/^[1-9]\d*$/.test(value)) return null

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed > maximum) return null
  return parsed
}

function isJsonContentType(contentType: string | null) {
  return contentType?.split(';', 1)[0].trim().toLowerCase() === 'application/json'
}

async function getActiveAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') {
    return { error: json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const userId = Number(session.user.id)
  if (!Number.isInteger(userId) || userId <= 0) {
    return { error: json({ error: 'No autorizado' }, { status: 401 }) }
  }

  // La sesión aporta la identidad, pero el estado actual y el nombre se obtienen siempre de la base de datos.
  const admin = await prisma.usuarioAdmin.findUnique({
    where: { id: userId },
    select: { activo: true, nombre: true },
  })
  if (!admin?.activo) {
    return { error: json({ error: 'No autorizado' }, { status: 401 }) }
  }

  return { session, userId, admin }
}

async function getFactura(id: string) {
  return prisma.facturaRecibida.findUnique({
    where: { id },
    select: { id: true, proveedor: true, cif: true },
  })
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return json({ error: 'Identificador de factura no válido' }, { status: 400 })
    }

    const auth = await getActiveAdmin()
    if ('error' in auth) return auth.error

    const denied = await checkAdminAreaRead(AREA_FACTURAS, ROLES_LEGACY, auth.session)
    if (denied) return withNoStore(denied)

    const page = parsePaginationInteger(req.nextUrl.searchParams.get('page'), 1, MAX_PAGE)
    const limit = parsePaginationInteger(req.nextUrl.searchParams.get('limit'), PAGE_SIZE, MAX_PAGE_SIZE)
    if (page === null || limit === null) {
      return json({ error: `Los parámetros page y limit deben ser enteros entre 1 y ${MAX_PAGE} y 1 y ${MAX_PAGE_SIZE}, respectivamente` }, { status: 400 })
    }
    const skip = (page - 1) * limit

    const factura = await getFactura(id)
    if (!factura) {
      return json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    // Se consulta con la misma sesión: saber si puede comentar no concede permiso de escritura.
    const writeDenied = await checkAdminAreaWrite(AREA_FACTURAS, ROLES_LEGACY, auth.session)
    const puedeComentar = !writeDenied

    const proveedorWhere = factura.cif?.trim()
      ? { factura: { cif: factura.cif } }
      : { factura: { proveedor: factura.proveedor } }

    const [comentarios, total, referenciasProveedor] = await Promise.all([
      prisma.comentarioFacturaRecibida.findMany({
        where: { facturaId: factura.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          texto: true,
          createdAt: true,
          autor: { select: { nombre: true } },
        },
      }),
      prisma.comentarioFacturaRecibida.count({ where: { facturaId: factura.id } }),
      prisma.comentarioFacturaRecibida.findMany({
        where: {
          ...proveedorWhere,
          facturaId: { not: factura.id },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          texto: true,
          createdAt: true,
          factura: {
            select: { id: true, numFactura: true, fecha: true },
          },
        },
      }),
    ])

    return json({
      comentarios,
      page,
      totalPages: Math.ceil(total / limit),
      total,
      puedeComentar,
      referenciasProveedor,
    })
  } catch {
    return json({ error: 'No se pudieron cargar los comentarios' }, { status: 500 })
  }
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) {
      return json({ error: 'Identificador de factura no válido' }, { status: 400 })
    }

    // No se lee ni procesa el cuerpo hasta autenticar y autorizar explícitamente la petición.
    const auth = await getActiveAdmin()
    if ('error' in auth) return auth.error

    const denied = await checkAdminAreaWrite(AREA_FACTURAS, ROLES_LEGACY, auth.session)
    if (denied) return withNoStore(denied)

    // En despliegues tras proxy, Next construye nextUrl con el origen público de la petición.
    const origin = req.headers.get('origin')
    if (!origin || origin !== req.nextUrl.origin) {
      return json({ error: 'Origen de la solicitud no válido' }, { status: 403 })
    }

    if (!isJsonContentType(req.headers.get('content-type'))) {
      return json({ error: 'El contenido debe ser JSON' }, { status: 415 })
    }

    const declaredLength = req.headers.get('content-length')
    if (declaredLength) {
      const contentLength = Number(declaredLength)
      if (!Number.isInteger(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
        return json({ error: 'La solicitud es demasiado grande' }, { status: 413 })
      }
    }

    const rawBody = await req.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'La solicitud es demasiado grande' }, { status: 413 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody)
    } catch {
      return json({ error: 'JSON no válido' }, { status: 400 })
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ error: 'El contenido de la solicitud no es válido' }, { status: 400 })
    }

    const { texto: textoRecibido, solicitudId } = body as { texto?: unknown; solicitudId?: unknown }
    if (typeof textoRecibido !== 'string' || typeof solicitudId !== 'string') {
      return json({ error: 'Texto o identificador de solicitud no válidos' }, { status: 400 })
    }

    const texto = textoRecibido.trim()
    if (!texto || texto.length > MAX_TEXTO_LENGTH || CONTROL_CHARS_RE.test(texto)) {
      return json({ error: 'El comentario debe tener entre 1 y 4.000 caracteres y no contener caracteres de control' }, { status: 400 })
    }
    if (!UUID_RE.test(solicitudId)) {
      return json({ error: 'Identificador de solicitud no válido' }, { status: 400 })
    }

    const factura = await getFactura(id)
    if (!factura) {
      return json({ error: 'Factura no encontrada' }, { status: 404 })
    }

    const previous = await prisma.comentarioFacturaRecibida.findUnique({
      where: { facturaId_solicitudId: { facturaId: factura.id, solicitudId } },
      select: {
        id: true,
        texto: true,
        createdAt: true,
        autorId: true,
        autor: { select: { nombre: true } },
      },
    })

    if (previous) {
      if (previous.texto !== texto) {
        return json({ error: 'El identificador de solicitud ya se usó con otro comentario' }, { status: 409 })
      }
      if (previous.autorId !== auth.userId) {
        return json({ error: 'La solicitud ya pertenece a otro usuario' }, { status: 409 })
      }
      return json({
        comentario: {
          id: previous.id,
          texto: previous.texto,
          createdAt: previous.createdAt,
          autor: previous.autor,
        },
        duplicado: true,
      })
    }

    // El upsert mantiene la operación idempotente y no actualiza nunca el contenido ya creado.
    const comentario = await prisma.comentarioFacturaRecibida.upsert({
      where: { facturaId_solicitudId: { facturaId: factura.id, solicitudId } },
      update: {},
      create: {
        facturaId: factura.id,
        autorId: auth.userId,
        texto,
        solicitudId,
      },
      select: {
        id: true,
        texto: true,
        createdAt: true,
        autorId: true,
        autor: { select: { nombre: true } },
      },
    })

    // El upsert puede devolver la fila de una carrera: nunca se sobreescribe su texto.
    if (comentario.texto !== texto) {
      return json({ error: 'El identificador de solicitud ya se usó con otro comentario' }, { status: 409 })
    }

    // Si dos usuarios reutilizan a la vez el mismo UUID, nunca se atribuye el comentario al segundo.
    if (comentario.autorId !== auth.userId) {
      return json({ error: 'La solicitud ya pertenece a otro usuario' }, { status: 409 })
    }

    return json({
      comentario: {
        id: comentario.id,
        texto: comentario.texto,
        createdAt: comentario.createdAt,
        autor: comentario.autor,
      },
      duplicado: false,
    }, { status: 201 })
  } catch {
    return json({ error: 'No se pudo guardar el comentario' }, { status: 500 })
  }
}
