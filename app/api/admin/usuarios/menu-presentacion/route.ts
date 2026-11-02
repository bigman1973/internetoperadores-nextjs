import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { appendArea4Audit } from '@/lib/area4/audit'
import { requireArea4Owner } from '@/lib/area4/live-admin'
import { AREA4_MENU_CONFIGURATION_ID, readArea4MenuConfiguration } from '@/lib/area4/menu-presentation'

export const dynamic = 'force-dynamic'

async function owner() {
  return requireArea4Owner(prisma)
}

export async function GET() {
  const auth = await owner()
  if (auth.ok === false) return auth.response
  const configuracion = await readArea4MenuConfiguration(prisma)
  return NextResponse.json({ configuracion })
}

export async function PUT(request: Request) {
  const auth = await owner()
  if (auth.ok === false) return auth.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo no válido' }, { status: 400 })
  }
  const allowed = ['menuAgrupadoParaPropietario', 'menuAgrupadoParaTodos']
  if (Object.keys(body).some(key => !allowed.includes(key))
    || typeof body.menuAgrupadoParaPropietario !== 'boolean'
    || typeof body.menuAgrupadoParaTodos !== 'boolean') {
    return NextResponse.json({ error: 'Configuración no válida' }, { status: 400 })
  }

  const requested = {
    menuAgrupadoParaPropietario: body.menuAgrupadoParaPropietario,
    menuAgrupadoParaTodos: body.menuAgrupadoParaTodos,
  }
  // No tiene sentido abrir para todos una vista que ni siquiera se muestra al propietario.
  const next = { ...requested, menuAgrupadoParaPropietario: requested.menuAgrupadoParaPropietario || requested.menuAgrupadoParaTodos }
  const configuracion = await prisma.$transaction(async tx => {
    const before = await readArea4MenuConfiguration(tx)
    const saved = await tx.configuracionPanelArea4.upsert({
      where: { id: AREA4_MENU_CONFIGURATION_ID },
      update: { ...next, updatedById: auth.principal.id },
      create: { id: AREA4_MENU_CONFIGURATION_ID, ...next, updatedById: auth.principal.id },
      select: { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: true },
    })
    await appendArea4Audit(tx, {
      actorId: auth.principal.id,
      operacion: 'MENU_PRESENTACION_CAMBIO',
      antes: before,
      despues: saved,
      origen: new URL(request.url).pathname,
    })
    return saved
  })
  return NextResponse.json({ ok: true, configuracion })
}

export async function POST() { return NextResponse.json({ error: 'Método no permitido' }, { status: 405 }) }
export async function PATCH() { return NextResponse.json({ error: 'Método no permitido' }, { status: 405 }) }
export async function DELETE() { return NextResponse.json({ error: 'Método no permitido' }, { status: 405 }) }
