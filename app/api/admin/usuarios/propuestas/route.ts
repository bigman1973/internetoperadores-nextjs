import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireArea4Owner } from '@/lib/area4/live-admin'
import { configuredArea4OwnerId } from '@/lib/area4/policy'
import {
  UsersProposalError, applyUsersProposal, loadUsersSnapshot, previewUsersProposal, readUsersProposalJson,
} from '@/lib/area4/users-proposals'
import { SectionAssignmentError, applyArea4SectionAssignments, previewArea4SectionAssignments } from '@/lib/area4/section-assignments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const NO_STORE = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' }
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
function failure(error: unknown) {
  if (error instanceof UsersProposalError || error instanceof SectionAssignmentError) return reply({ error: error.message, code: error.code }, error.status)
  return reply({ error: 'No se pudo completar la operación.', code: 'INTERNAL' }, 500)
}
async function authorize(request: Request) {
  const auth = await requireArea4Owner(prisma)
  if (auth.ok === false) {
    for (const [name, value] of Object.entries(NO_STORE)) auth.response.headers.set(name, value)
    return { ok: false as const, response: auth.response }
  }
  // Signed acting contexts and session acting markers are not allowed here.
  // Presence also rejects malformed contexts; it can never grant normal traffic.
  const session = auth.session as { impersonation?: unknown } | null
  if (session?.impersonation || request.headers.has('x-io-impersonation-context')) {
    return { ok: false as const, response: reply({ error: 'Usuarios y permisos no está disponible durante una actuación.', code: 'IMPERSONATION_DENIED' }, 403) }
  }
  const ownerId = configuredArea4OwnerId()
  if (ownerId === null || auth.principal.id !== ownerId || !auth.principal.activo || auth.principal.rol !== 'SUPER_ADMIN') {
    return { ok: false as const, response: reply({ error: 'Solo el propietario real puede acceder.', code: 'OWNER_REQUIRED' }, 403) }
  }
  return { ok: true as const, actorId: auth.principal.id, ownerId }
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request)
    if (auth.ok === false) return auth.response
    return reply(await loadUsersSnapshot(prisma, auth.ownerId))
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request)
    if (auth.ok === false) return auth.response
    const command = await readUsersProposalJson(request)
    if (command.action === 'preview') {
      return reply({ proposal: await previewUsersProposal(prisma, auth.ownerId, command.drafts) })
    }
    if (command.action === 'preview-sections') {
      return reply({ proposal: await previewArea4SectionAssignments(prisma, auth.ownerId, command.drafts) })
    }
    if (command.action === 'assign-sections') {
      await applyArea4SectionAssignments(prisma, {
        actorId: auth.actorId, ownerId: auth.ownerId, origin: new URL(request.url).origin,
        confirmed: command.confirmed, revision: command.revision, drafts: command.drafts,
      })
      return reply({ ok: true, snapshot: await loadUsersSnapshot(prisma, auth.ownerId) })
    }
    const snapshot = await applyUsersProposal(prisma, {
      actorId: auth.actorId, ownerId: auth.ownerId, origin: new URL(request.url).origin,
      confirmed: command.confirmed, revision: command.revision, drafts: command.drafts,
    })
    return reply({ ok: true, snapshot })
  } catch (error) { return failure(error) }
}
