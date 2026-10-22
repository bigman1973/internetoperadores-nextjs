import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import {
  presentarCategoriaHistorica,
  presentarTipoMovimientoHistorico,
  validarCategoriaNueva,
  validarTipoMovimientoNuevo,
} from '@/lib/finanzas/movement-catalog'

const AREA_MOVIMIENTOS = 'admin.finanzas.movimientos'
const ROLES_LEGACY = ['CONTABILIDAD']
const MAX_JSON_BYTES = 8 * 1024
const CAMPOS_B3 = new Set(['categoria', 'tipoPago', 'metodoPago'])

function jsonPrivado(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } })
}

async function leerJsonAcotado(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const length = req.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES)) {
    return { ok: false, response: jsonPrivado({ error: 'Cuerpo demasiado grande' }, 413) }
  }
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return { ok: false, response: jsonPrivado({ error: 'Se requiere JSON' }, 415) }
  let text: string
  try {
    if (!req.body) return { ok: false, response: jsonPrivado({ error: 'Cuerpo vacío' }, 400) }
    const reader = req.body.getReader()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    let size = 0
    text = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_JSON_BYTES) { await reader.cancel().catch(() => {}); return { ok: false, response: jsonPrivado({ error: 'Cuerpo demasiado grande' }, 413) } }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } catch {
    return { ok: false, response: jsonPrivado({ error: 'Cuerpo no legible' }, 400) }
  }
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    return { ok: false, response: jsonPrivado({ error: 'Cuerpo demasiado grande' }, 413) }
  }
  try {
    const body = JSON.parse(text)
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('INVALID')
    return { ok: true, body }
  } catch {
    return { ok: false, response: jsonPrivado({ error: 'JSON no válido' }, 400) }
  }
}

function normalizarMovimientoLectura(movimiento: any) {
  const categoria = presentarCategoriaHistorica(movimiento.categoria)
  const tipoPago = presentarTipoMovimientoHistorico(movimiento.tipoPago)
  const metodoPago = presentarTipoMovimientoHistorico(movimiento.metodoPago)
  return {
    ...movimiento,
    categoria: categoria.valor,
    tipoPago: tipoPago.valor,
    metodoPago: metodoPago.valor,
    catalogo: {
      categoriaOriginal: categoria.valorOriginal,
      categoriaEsLegacy: categoria.esLegacy,
      tipoPagoOriginal: tipoPago.valorOriginal,
      tipoPagoEsLegacy: tipoPago.esLegacy,
      metodoPagoOriginal: metodoPago.valorOriginal,
      metodoPagoEsLegacy: metodoPago.esLegacy,
    },
  }
}

/**
 * B3 limita la edición a clasificación bancaria explícita. No acepta vínculos,
 * conciliación ni actualizaciones masivas: pertenecen al modelo B4/B6 y las
 * rutas heredadas podían auto-conciliar o marcar facturas cobradas.
 */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') return jsonPrivado({ error: 'No autorizado' }, 401)
  const denied = await checkAdminAreaWrite(AREA_MOVIMIENTOS, ROLES_LEGACY, session)
  if (denied) return denied
  if (req.headers.get('origin') !== req.nextUrl.origin) return jsonPrivado({ error: 'Origen de la solicitud no válido' }, 403)

  const entrada = await leerJsonAcotado(req)
  if (entrada.ok === false) return entrada.response
  const claves = Object.keys(entrada.body)
  if (claves.length === 0 || claves.some((clave) => !CAMPOS_B3.has(clave))) {
    return jsonPrivado({ error: 'Sólo se permiten categoria, tipoPago y metodoPago en B3' }, 400)
  }

  const { id } = await context.params
  if (!id || id.length > 128) return jsonPrivado({ error: 'Identificador de movimiento no válido' }, 400)
  const data: Record<string, string | null> = {}

  for (const campo of claves) {
    const valor = entrada.body[campo]
    if (valor !== null && typeof valor !== 'string') return jsonPrivado({ error: `${campo} debe ser un valor de catálogo o null` }, 400)
    if (typeof valor === 'string' && (valor.length === 0 || valor.length > 100)) return jsonPrivado({ error: `${campo} no es válido` }, 400)
    if (campo === 'categoria' && valor !== null) {
      const validacion = validarCategoriaNueva(valor)
      if (validacion.ok === false) return jsonPrivado({ error: validacion.mensaje, codigo: validacion.codigo }, 400)
      data.categoria = validacion.valor
    }
    if ((campo === 'tipoPago' || campo === 'metodoPago') && valor !== null) {
      const validacion = validarTipoMovimientoNuevo(valor)
      if (validacion.ok === false) return jsonPrivado({ error: validacion.mensaje, codigo: validacion.codigo }, 400)
      data[campo] = validacion.valor
    }
    if (valor === null) data[campo] = null
  }

  try {
    await assertFinanceRuntimeReady()
    const movimiento = await prisma.movimientoBancario.update({
      where: { id },
      data,
      include: { cuenta: { select: { banco: true, alias: true } } },
    })
    // HistorialCambio pertenece a tarifas y no referencia movimientos: no se fuerza
    // una auditoría inconsistente; se conserva el valor histórico en la respuesta.
    return jsonPrivado({ ok: true, movimiento: normalizarMovimientoLectura(movimiento) })
  } catch (error: any) {
    const codigo = error instanceof Error ? error.message : ''
    if (codigo === 'STAGING_ISOLATION_REQUIRED') return jsonPrivado({ error: 'Staging aislado no verificado' }, 503)
    if (error?.code === 'P2025') return jsonPrivado({ error: 'Movimiento no encontrado' }, 404)
    return jsonPrivado({ error: 'No se pudo actualizar la clasificación del movimiento' }, 500)
  }
}

// Nunca exponer las mutaciones heredadas de propósito general en B3.
export async function PUT() {
  return jsonPrivado({ error: 'Método no permitido' }, 405)
}

export async function DELETE() {
  return jsonPrivado({ error: 'Método no permitido' }, 405)
}
