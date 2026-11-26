import { NextResponse } from 'next/server'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { autorizarSuperadminIsp } from '@/lib/crm-isp-auth'
import { ErrorVinculo, resolverVinculoEnTx } from '@/lib/crm-isp-import'
import { propietarioImportacion } from '@/lib/area1-import-recibo'
import { appendArea4Audit } from '@/lib/area4/audit'
import { readArea4IspVinculosStagingCommand } from '@/lib/area4/crm-staging-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TIPOS = new Set(['CLIENTE_WEB', 'CRM_CONTACTO', 'CRM_EMPRESA', 'CREAR_CONTACTO', 'CREAR_EMPRESA'])
const CONFIANZAS = new Set(['ALTA', 'MEDIA', 'BAJA'])
const ESTADOS = new Set(['PENDIENTE', 'CONFIRMADO', 'DESCARTADO', 'OBSOLETO'])
const POR_PAGINA = 50
const MOTIVOS = new Set(['NIF', 'EMAIL', 'NOMBRE', 'CODIGO', 'ID_ISP_CODIGO_DISTINTO', 'EMAIL_EN_OTRO_CLIENTE', 'SIN_CANDIDATO'])

export async function GET(request: Request) {
  if (importacionesCrmCerradas()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status })
  const url = new URL(request.url)
  const estado = url.searchParams.get('estado') || 'PENDIENTE'
  const tipo = url.searchParams.get('tipo') || ''
  const confianza = url.searchParams.get('confianza') || ''
  const motivo = url.searchParams.get('motivo') || ''
  const pagina = Math.max(1, Number(url.searchParams.get('pagina') || 1) || 1)
  if (!ESTADOS.has(estado) || (tipo && !TIPOS.has(tipo)) || (confianza && !CONFIANZAS.has(confianza)) || (motivo && !MOTIVOS.has(motivo))) return NextResponse.json({ error: 'Filtro no válido.' }, { status: 400 })
  const where: Prisma.IspVinculoArea1WhereInput = { estado, ...(tipo ? { tipo } : {}), ...(confianza ? { confianza } : {}), ...(motivo ? { motivo } : {}) }
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
  const owner = await propietarioImportacion()
  if (!owner.ok || !owner.actorId) return owner.response!
  const command = await readArea4IspVinculosStagingCommand(request, 16384)
  if (command.errorStatus || !command.body) return NextResponse.json({ error: 'Selecciona entre 1 y 200 propuestas y una acción válida.' }, { status: command.errorStatus || 400 })
  const { accion, ids } = command.body
  const actor = auth.actor.email
  const resultados: Array<{ id: string; ok: boolean; codigo?: string }> = []
  // Preserve the native per-proposal transactions and partial-result semantics.
  // Only an actual committed resolution is counted; no ficha/link forecasts.
  const receipt = (tx: Prisma.TransactionClient, resultado: 'EXITO' | 'ERROR', codigo?: string) => appendArea4Audit(tx, {
    actorId: owner.actorId!, objetivoUsuarioId: null, operacion: 'CRM_IMPORTACION_ISP', areaCodigo: 'admin.crm',
    origen: 'crm.isp.vinculos', despues: { fase: 'RESULTADO', resultado, accion,
      propuestasResueltas: resultado === 'EXITO' ? 1 : 0, ...(codigo ? { codigo } : {}) },
  })
  for (const id of new Set(ids)) {
    try {
      await prisma.$transaction(async tx => {
        await resolverVinculoEnTx(tx, id, accion, actor)
        // A failed RESULT receipt rolls back this proposal before ERROR audit.
        await receipt(tx, 'EXITO')
      }, { maxWait: 5000, timeout: 30000 })
      resultados.push({ id, ok: true })
    } catch (e) {
      const codigo = e instanceof ErrorVinculo ? e.codigo : 'ERROR'
      try {
        await prisma.$transaction(tx => receipt(tx, 'ERROR', codigo), { maxWait: 5000, timeout: 5000 })
      } catch {
        // Previous successful proposals may already be committed and audited.
        // Never claim total rollback or success when the failure is unaudited.
        return NextResponse.json({ error: 'No se pudo registrar el recibo de la propuesta fallida.', codigo: 'NO_AUDITADO',
          ok: resultados.filter(r => r.ok).length }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
      }
      resultados.push({ id, ok: false, codigo })
    }
  }
  return NextResponse.json({ ok: resultados.filter((r) => r.ok).length, errores: resultados.filter((r) => !r.ok) }, { headers: { 'Cache-Control': 'no-store' } })
}
