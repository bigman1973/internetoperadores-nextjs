import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { authorizeCrmEmpresas, canAccessCrmRelated } from '@/lib/crm-empresas-auth'
import { importCompaniesBatch, previewCompaniesImport } from '@/lib/crm-empresas-import'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await authorizeCrmEmpresas(true)
  if (!auth.user) return NextResponse.json({ error: 'No tienes permiso para traspasar empresas.' }, { status: auth.status })
  const body = await request.json().catch(() => ({}))
  if (body.mode !== 'preview' && body.mode !== 'sync') return NextResponse.json({ error: 'Modo no válido.' }, { status: 400 })
  try {
    if (body.mode === 'preview') {
      const [summary, lastSync] = await Promise.all([
        previewCompaniesImport(),
        prisma.crmSincronizacionHubspot.findFirst({ where: { modo: 'EMPRESAS' }, orderBy: { iniciadoAt: 'desc' }, select: { estado: true, iniciadoAt: true, detalle: true } }),
      ])
      return NextResponse.json({ success: true, summary, lastSync })
    }
    if (!await canAccessCrmRelated(auth.user, 'admin.crm.contactos', true)) return NextResponse.json({ error: 'Necesitas permiso de escritura en Contactos para traspasar sus vínculos.' }, { status: 403 })
    const after = body.after == null ? undefined : body.after
    if (after != null && typeof after !== 'string') return NextResponse.json({ error: 'Cursor no válido.' }, { status: 400 })
    const result = await importCompaniesBatch(auth.user.name, after)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('[CRM-EMPRESAS] Error de traspaso:', error)
    // No exponer respuestas de HubSpot ni credenciales a cliente.
    return NextResponse.json({ error: error instanceof Error && error.message.includes('configurada') ? 'La conexión temporal HubSpot no está configurada en este entorno.' : 'No se pudo completar este lote de importación. Lo ya importado permanece intacto; se puede continuar desde el último cursor.' }, { status: 503 })
  }
}
