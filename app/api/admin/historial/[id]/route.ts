import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireArea8Auth } from '@/lib/area8/auth'
import { checkWriteOrigin, readBody } from '@/lib/area8/validation'
import { prisma } from '@/lib/prisma'
import { Area9Error, automaticDevelopment, manualData, positiveId, serializeDevelopment } from '@/lib/area9/core'
import { area9Failure, area9Headers } from '@/lib/area9/http'

export const dynamic = 'force-dynamic'
const select = { id: true, titulo: true, descripcion: true, tipo: true, estado: true, autor: true, commitHash: true, rama: true, fecha: true } as const
function developmentOnly(request: NextRequest) {
  const vista = new URL(request.url).searchParams.get('vista')
  if (vista && vista !== 'desarrollos') throw new Area9Error(403, 'El ledger automático no se puede editar ni eliminar')
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireArea8Auth({ management: true, write: true, owner: true, area: 'admin.historial' })
    if ('error' in auth) return auth.error
    if (!auth.owner || auth.acting) throw new Area9Error(403, 'Solo el propietario real puede modificar el historial')
    developmentOnly(request)
    const id = positiveId((await params).id)
    const data = manualData(await readBody(request), true)
    const registro = await prisma.$transaction(async tx => {
      const previous = await tx.desarrolloHistorial.findUnique({ where: { id }, select })
      if (!previous) throw new Area9Error(404, 'Desarrollo no encontrado')
      if (automaticDevelopment(previous)) throw new Area9Error(403, 'Un registro automático no se puede editar')
      const changed = await tx.desarrolloHistorial.updateMany({ where: { id, commitHash: null, rama: null, autor: previous.autor }, data })
      if (changed.count !== 1) throw new Area9Error(409, 'El registro ha cambiado; actualiza antes de editar')
      return (await tx.desarrolloHistorial.findUniqueOrThrow({ where: { id }, select }))
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ registro: serializeDevelopment(registro) }, { headers: area9Headers })
  } catch (error) { return area9Failure(error) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireArea8Auth({ management: true, write: true, owner: true, area: 'admin.historial' })
    if ('error' in auth) return auth.error
    if (!auth.owner || auth.acting) throw new Area9Error(403, 'Solo el propietario real puede modificar el historial')
    checkWriteOrigin(request)
    developmentOnly(request)
    const id = positiveId((await params).id)
    await prisma.$transaction(async tx => {
      const previous = await tx.desarrolloHistorial.findUnique({ where: { id }, select })
      if (!previous) throw new Area9Error(404, 'Desarrollo no encontrado')
      if (automaticDevelopment(previous)) throw new Area9Error(403, 'Un registro automático no se puede eliminar')
      const deleted = await tx.desarrolloHistorial.deleteMany({ where: { id, commitHash: null, rama: null, autor: previous.autor } })
      if (deleted.count !== 1) throw new Area9Error(409, 'El registro ha cambiado; actualiza antes de eliminar')
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return NextResponse.json({ ok: true }, { headers: area9Headers })
  } catch (error) { return area9Failure(error) }
}
