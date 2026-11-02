import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireArea4Owner } from '@/lib/area4/live-admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) return auth.response

  const url = new URL(request.url)
  const requestedLimit = Number(url.searchParams.get('limit') || 50)
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
  const cursor = url.searchParams.get('cursor') || undefined

  const rows = await prisma.auditoriaPermisosArea4.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, operacion: true, areaCodigo: true, antes: true, despues: true, origen: true, createdAt: true,
      actor: { select: { id: true, nombre: true } },
      objetivoUsuario: { select: { id: true, nombre: true } },
    },
  })
  const hasMore = rows.length > limit
  const events = hasMore ? rows.slice(0, limit) : rows
  return NextResponse.json({ events, nextCursor: hasMore ? events.at(-1)?.id ?? null : null })
}
