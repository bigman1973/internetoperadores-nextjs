import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireArea8Auth } from '@/lib/area8/auth'
import { readBody } from '@/lib/area8/validation'
import { prisma } from '@/lib/prisma'
import { normalizarEstado } from '@/lib/peticiones-flujo'
import { Area9Error, linkInput, manualData, objectBody, pagination, serializeDevelopment } from '@/lib/area9/core'
import { linkClosedRequest } from '@/lib/area9/link'
import { area9Failure, area9Headers } from '@/lib/area9/http'
import { readAppliedMigrations } from '@/lib/area9/migrations.server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const developmentSelect = { id: true, titulo: true, descripcion: true, tipo: true, estado: true, autor: true, commitHash: true, rama: true, fecha: true } as const

export async function GET(request: NextRequest) {
  try {
    const auth = await requireArea8Auth({ management: true, area: 'admin.historial' })
    if ('error' in auth) return auth.error
    const params = new URL(request.url).searchParams
    const paging = pagination(params)
    const vista = params.get('vista') || 'desarrollos'
    if (vista === 'migraciones') return NextResponse.json({ vista, ...(await readAppliedMigrations(paging)) }, { headers: area9Headers })
    if (vista === 'publicaciones') {
      const entorno = params.get('entorno') || ''
      if (entorno && !['staging', 'produccion'].includes(entorno)) throw new Area9Error(400, 'Entorno inválido')
      const where: Prisma.Area9PublicacionWhereInput = entorno ? { entorno } : {}
      const [rows, total] = await Promise.all([
        prisma.area9Publicacion.findMany({ where, skip: paging.skip, take: paging.limit,
          orderBy: [{ fechaPublicacion: 'desc' }, { id: 'desc' }], select: {
            id: true, deploymentKey: true, entorno: true, commitHash: true, fechaPublicacion: true,
            titulo: true, resumen: true, fuente: true, url: true, migraciones: true, createdAt: true,
            peticiones: { take: 100, orderBy: { fecha: 'desc' }, select: {
              peticionId: true, fecha: true, confirmadoPorInt: true, confirmadoNombre: true,
              peticion: { select: { titulo: true, estado: true, fechaCierre: true } },
            } }, _count: { select: { peticiones: true } },
          } }),
        prisma.area9Publicacion.count({ where }),
      ])
      const registros = rows.map(row => ({ id: row.id, deployment_key: row.deploymentKey, entorno: row.entorno,
        commit_hash: row.commitHash, fecha_publicacion: row.fechaPublicacion, titulo: row.titulo, resumen: row.resumen,
        fuente: row.fuente, url: row.url, migraciones: row.migraciones, created_at: row.createdAt, automatico: true,
        total_vinculos: row._count.peticiones, vinculos: row.peticiones.map(link => ({ peticion_id: link.peticionId,
          fecha: link.fecha, confirmado_por_int: link.confirmadoPorInt, confirmado_nombre: link.confirmadoNombre,
          titulo: link.peticion.titulo, estado: normalizarEstado(link.peticion.estado), fecha_cierre: link.peticion.fechaCierre })) }))
      return NextResponse.json({ vista, registros, total, page: paging.page, limit: paging.limit }, { headers: area9Headers })
    }
    if (vista !== 'desarrollos') throw new Area9Error(400, 'Vista inválida')
    const tipo = params.get('tipo') || ''
    const estado = params.get('estado') || ''
    if (tipo && !['publica', 'privada', 'ambas', 'feat', 'fix', 'refactor', 'perf', 'style', 'ui'].includes(tipo)) throw new Area9Error(400, 'Tipo inválido')
    if (estado && !['completado', 'en_progreso', 'planificado'].includes(estado)) throw new Area9Error(400, 'Estado inválido')
    const where: Prisma.DesarrolloHistorialWhereInput = { ...(tipo ? { tipo } : {}), ...(estado ? { estado } : {}) }
    const [rows, total] = await Promise.all([
      prisma.desarrolloHistorial.findMany({ where, select: developmentSelect, orderBy: [{ fecha: 'desc' }, { id: 'desc' }], take: paging.limit, skip: paging.skip }),
      prisma.desarrolloHistorial.count({ where }),
    ])
    return NextResponse.json({ vista, registros: rows.map(serializeDevelopment), total, page: paging.page, limit: paging.limit }, { headers: area9Headers })
  } catch (error) { return area9Failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireArea8Auth({ management: true, write: true, owner: true, area: 'admin.historial' })
    if ('error' in auth) return auth.error
    if (!auth.owner || auth.acting) throw new Area9Error(403, 'Solo el propietario real puede modificar el historial')
    const body = objectBody(await readBody(request))
    if (body.accion === 'vincular_peticion') {
      const input = linkInput(body)
      const result = await prisma.$transaction(tx => linkClosedRequest(tx, input, auth), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      return NextResponse.json(result, { status: result.creado ? 201 : 200, headers: area9Headers })
    }
    if (body.accion !== undefined && body.accion !== 'crear_desarrollo') throw new Area9Error(400, 'El ledger automático no admite escritura manual')
    const data = manualData(body)
    const registro = await prisma.desarrolloHistorial.create({ data: {
      titulo: data.titulo!, descripcion: data.descripcion!, tipo: data.tipo!, estado: data.estado!,
      fecha: data.fecha ?? new Date(), autor: auth.nombre.slice(0, 100), commitHash: null, rama: null,
    }, select: developmentSelect })
    return NextResponse.json({ registro: serializeDevelopment(registro) }, { status: 201, headers: area9Headers })
  } catch (error) { return area9Failure(error) }
}
