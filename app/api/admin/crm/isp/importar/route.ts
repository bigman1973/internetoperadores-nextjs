import { NextResponse } from 'next/server'
import { importacionesCrmCerradas } from '@/lib/area1-puertas-produccion'
import prisma from '@/lib/prisma'
import { autorizarSuperadminIsp } from '@/lib/crm-isp-auth'
import { ErrorFicheroIsp, leerFicheroIsp } from '@/lib/crm-isp-import-core'
import { aplicarImportacion, obtenerBajas, planificarImportacion } from '@/lib/crm-isp-import'
import { aplicarIspConRecibo, ErrorImportacionNoAuditada, propietarioImportacion } from '@/lib/area1-import-recibo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_BYTES = 4 * 1024 * 1024 // Vercel limita el cuerpo de la petición a 4,5 MB

/**
 * POST multipart: fichero (XLSX de ISP), modo=simular|aplicar, consultarBrevo=1|0.
 * Aplicar exige hashEsperado (el de la simulación revisada) y confirmacion=APLICAR.
 * La respuesta solo contiene agregados.
 */
export async function POST(request: Request) {
  if (importacionesCrmCerradas()) return NextResponse.json({ error: 'No disponible.' }, { status: 404 })
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: auth.status === 401 ? 'No autorizado.' : 'Solo el superadministrador puede importar el fichero de ISP.' }, { status: auth.status })
  const largo = Number(request.headers.get('content-length') || 0)
  if (largo > MAX_BYTES + 1024 * 64) return NextResponse.json({ error: 'El fichero supera 4 MB.' }, { status: 413 })
  const form = await request.formData().catch(() => null)
  const fichero = form?.get('fichero')
  if (!form || !fichero || typeof fichero === 'string') return NextResponse.json({ error: 'Adjunta el fichero XLSX de ISP Gestión.' }, { status: 400 })
  if (!/\.xlsx$/i.test(fichero.name)) return NextResponse.json({ error: 'El fichero debe ser .xlsx.' }, { status: 400 })
  const modo = String(form.get('modo') || 'simular')
  if (modo !== 'simular' && modo !== 'aplicar') return NextResponse.json({ error: 'Modo no válido.' }, { status: 400 })
  const consultarBrevo = String(form.get('consultarBrevo') ?? '1') !== '0'

  // Aplicar: propietario canónico vivo y sin «Actuar como» (frontera del Área 4); su id firma el recibo.
  let propietarioId: number | null = null
  if (modo === 'aplicar') {
    const owner = await propietarioImportacion()
    if (!owner.ok || !owner.actorId) return owner.response!
    propietarioId = owner.actorId
  }
  try {
    const buffer = Buffer.from(await fichero.arrayBuffer())
    const datos = leerFicheroIsp(buffer)
    if (modo === 'aplicar') {
      if (String(form.get('confirmacion') || '') !== 'APLICAR') return NextResponse.json({ error: 'Falta la confirmación expresa.' }, { status: 400 })
      if (String(form.get('hashEsperado') || '') !== datos.hash) return NextResponse.json({ error: 'El fichero no es el mismo que se simuló. Vuelve a simular.' }, { status: 409 })
    }
    const fuente = await obtenerBajas(prisma, { consultarBrevo })
    const plan = await planificarImportacion(prisma, datos, fuente)
    if (modo === 'simular') return NextResponse.json({ modo, hash: datos.hash, resumen: plan.resumen })
    const r = await aplicarIspConRecibo(prisma, plan, propietarioId!, (dentroTx) => aplicarImportacion(prisma, plan, { ficheroNombre: fichero.name, bytes: datos.bytes, actorId: propietarioId!, actorEmail: auth.actor!.email }, dentroTx))
    return NextResponse.json({ modo, hash: datos.hash, ...r, recibo: { resultado: r.recibo.resultado } })
  } catch (error) {
    if (error instanceof ErrorImportacionNoAuditada) return NextResponse.json({ error: 'La importación ha fallado y no se ha guardado nada. Además, no se pudo registrar en la auditoría.', auditoria: 'NO_REGISTRADA' }, { status: 500 })
    if (error instanceof ErrorFicheroIsp) return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: 422 })
    console.error('[CRM-ISP] Error en la importación:', error instanceof Error ? error.message : 'desconocido')
    return NextResponse.json({ error: 'No se pudo procesar el fichero. No se ha guardado nada.' }, { status: 500 })
  }
}

export async function GET() {
  const auth = await autorizarSuperadminIsp()
  if (!auth.actor) return NextResponse.json({ error: 'No autorizado.' }, { status: auth.status })
  try {
    const importaciones = await prisma.ispImportacionArea1.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, ficheroNombre: true, ficheroHash: true, actorEmail: true, createdAt: true, brevoVerificado: true, resumen: true } })
    return NextResponse.json({ importaciones })
  } catch {
    return NextResponse.json({ importaciones: [], aviso: 'Falta aplicar la migración 20261125_area1_isp_carga.' })
  }
}
