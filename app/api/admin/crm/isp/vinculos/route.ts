import { NextResponse } from 'next/server'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { autorizarSuperadminIsp } from '@/lib/crm-isp-auth'
import { resolverVinculos } from '@/lib/crm-isp-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TIPOS = new Set(['CLIENTE_WEB', 'CRM_CONTACTO', 'CRM_EMPRESA', 'CREAR_CONTACTO', 'CREAR_EMPRESA'])
const CONFIANZAS = new Set(['ALTA', 'MEDIA', 'BAJA'])
const ESTADOS = new Set(['PENDIENTE', 'CONFIRMADO', 'DESCARTADO', 'OBSOLETO'])
const POR_PAGINA = 50

export async function GET(request: Request) {
  if (importacionesCrmCerradas()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status })
  const url = new URL(request.url)
  const estado = url.searchParams.get('estado') || 'PENDIENTE'
  const tipo = url.searchParams.get('tipo') || ''
  const confianza = url.searchParams.get('confianza') || ''
  const pagina = Math.max(1, Number(url.searchParams.get('pagina') || 1) || 1)
  if (!ESTADOS.has(estado) || (tipo && !TIPOS.has(tipo)) || (confianza && !CONFIANZAS.has(confianza))) return NextResponse.json({ error: 'Filtro no válido.' }, { status: 400 })
  const where: Prisma.IspVinculoArea1WhereInput = { estado, ...(tipo ? { tipo } : {}), ...(confianza ? { confianza } : {}) }
  try {
    const [total, porTipo, filas] = await Promise.all([
      prisma.ispVinculoArea1.count({ where }),
      prisma.ispVinculoArea1.groupBy({ by: ['tipo', 'confianza'], where: { estado }, _count: { _all: true } }),
      prisma.ispVinculoArea1.findMany({ where, orderBy: [{ confianza: 'asc' }, { createdAt: 'asc' }], skip: (pagina - 1) * POR_PAGINA, take: POR_PAGINA,
        include: { cliente: { select: { codigo: true, nombre: true, docNormalizado: true, email: true, segmentoCrm: true, clienteWebId: true } } } }),
    ])
    // Etiquetas de destino para que la persona compare antes de confirmar.
    const contactos = filas.filter((f) => f.tipo === 'CRM_CONTACTO').map((f) => f.destinoId)
    const empresas = filas.filter((f) => f.tipo === 'CRM_EMPRESA').map((f) => f.destinoId)
    const clientes = filas.filter((f) => f.tipo === 'CLIENTE_WEB').map((f) => Number(f.destinoId)).filter(Number.isInteger)
    const [dc, de, dw] = await Promise.all([
      contactos.length ? prisma.crmRegistroHubspot.findMany({ where: { id: { in: contactos } }, select: { id: true, nombre: true, email: true, clienteWebId: true } }) : [],
      empresas.length ? prisma.crmEmpresa.findMany({ where: { id: { in: empresas } }, select: { id: true, nombre: true, nif: true } }) : [],
      clientes.length ? prisma.clienteWeb.findMany({ where: { id: { in: clientes } }, select: { id: true, nombre: true, codigo: true, ispGestionId: true } }) : [],
    ])
    const etiqueta = new Map<string, string>()
    for (const c of dc) etiqueta.set(`CRM_CONTACTO|${c.id}`, `${c.nombre || 'Sin nombre'} · ${c.email || 'sin email'}${c.clienteWebId ? ' · ya cliente' : ''}`)
    for (const e of de) etiqueta.set(`CRM_EMPRESA|${e.id}`, `${e.nombre}${e.nif ? ` · ${e.nif}` : ''}`)
    for (const w of dw) etiqueta.set(`CLIENTE_WEB|${w.id}`, `${w.nombre} · código ${w.codigo || '—'} · ID ISP ${w.ispGestionId}`)
    return NextResponse.json({
      total, pagina, porPagina: POR_PAGINA,
      porTipo: porTipo.map((p) => ({ tipo: p.tipo, confianza: p.confianza, total: p._count._all })),
      vinculos: filas.map((f) => ({
        id: f.id, tipo: f.tipo, motivo: f.motivo, confianza: f.confianza, estado: f.estado, destinoId: f.destinoId,
        destino: f.destinoId === 'NUEVO' ? 'Crear ficha nueva' : etiqueta.get(`${f.tipo}|${f.destinoId}`) || 'Destino no encontrado',
        cliente: f.cliente, revisadoPor: f.revisadoPor, revisadoAt: f.revisadoAt,
      })),
    })
  } catch {
    return NextResponse.json({ total: 0, pagina, porPagina: POR_PAGINA, porTipo: [], vinculos: [], aviso: 'Falta aplicar la migración 20261125_area1_isp_carga.' })
  }
}

export async function POST(request: Request) {
  if (importacionesCrmCerradas()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status })
  const body = await request.json().catch(() => ({}))
  const accion = body?.accion
  const ids: unknown = body?.ids
  if (accion !== 'CONFIRMAR' && accion !== 'DESCARTAR') return NextResponse.json({ error: 'Acción no válida.' }, { status: 400 })
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((x) => typeof x !== 'string' || x.length > 64)) return NextResponse.json({ error: 'Selecciona entre 1 y 200 propuestas.' }, { status: 400 })
  const resultados = await resolverVinculos(prisma, [...new Set(ids as string[])], accion, auth.actor.email)
  return NextResponse.json({ ok: resultados.filter((r) => r.ok).length, errores: resultados.filter((r) => !r.ok) })
}
