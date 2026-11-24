import { Prisma } from '@prisma/client'
import { assertConciliarRuntime } from './conciliar-runtime'
import { requireB4ActorAccess, B4_CONCILIACION_AREA } from './reconciliation-auth'
import { requireActualActorPermissionB8Tx } from './centros-coste-db'

type Tx = Prisma.TransactionClient & Record<string, any>
type AccessPhoto = Readonly<{
  database_name: string; database_user: string;
  actor: { id: number; activo: boolean; rol: string; roles: string[] | null } | null;
  target: { activo: boolean } | null;
  permissions: readonly { lectura: boolean; escritura: boolean }[];
  granular: number;
}>
const AREA_CODES = B4_CONCILIACION_AREA.split('.').map((_, index, parts) => parts.slice(0, index + 1).join('.'))
function deny(): never { throw new Error('CONCILIAR_ACCESS_PHOTO_CONTRATO_INVALIDO') }
function exact(value: unknown, expected: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(expected)
}

/** Executes the SAME runtime/B4/B8 policies against one fresh authorization
 * read in this caller-owned transaction. B8's actor/permission FOR SHARE locks
 * still delegate to the original tx, in their original order. No permission,
 * role or environment decision is cached, returned, or shared across retries.
 * Only the exact queries issued by these three validators can use this photo;
 * any contract drift fails closed (rather than silently widening permissions). */
export async function assertConciliarLiveAccessTx(base: Prisma.TransactionClient, actorId: number, requireB8 = false) {
  const tx = base as Tx
  // B8 previously locked actor, then permissions, before reading either policy.
  // Keep that order through explicit MATERIALIZED dependencies, not parallel
  // transactions or an advisory grammar exception. Their later exact calls
  // consume only lock acknowledgements; no financial read may use this adapter.
  const rows = await tx.$queryRaw<AccessPhoto[]>(Prisma.sql`
    ${requireB8 ? Prisma.sql`WITH actor_locked AS MATERIALIZED (
      SELECT u.id,u.activo,u.rol,u.roles FROM usuarios_admin u WHERE u.id=${actorId} FOR SHARE OF u
    ), permissions_locked AS MATERIALIZED (
      SELECT p.id,p.area_id,p.lectura,p.escritura FROM permiso_usuarios p
      CROSS JOIN actor_locked u WHERE p.usuario_id=u.id FOR SHARE OF p
    )` : Prisma.empty}
    SELECT current_database() AS database_name,current_user AS database_user,
      (SELECT jsonb_build_object('id',u.id,'activo',u.activo,'rol',u.rol::text,'roles',u.roles) FROM ${requireB8 ? Prisma.sql`actor_locked` : Prisma.sql`usuarios_admin`} u WHERE u.id=${actorId}) AS actor,
      (SELECT jsonb_build_object('activo',a.activo) FROM permiso_areas a WHERE a.codigo=${B4_CONCILIACION_AREA}) AS target,
      COALESCE((SELECT json_agg(jsonb_build_object('lectura',p.lectura,'escritura',p.escritura))
        FROM ${requireB8 ? Prisma.sql`permissions_locked` : Prisma.sql`permiso_usuarios`} p JOIN permiso_areas a ON a.id=p.area_id
        WHERE ${requireB8 ? Prisma.sql`TRUE` : Prisma.sql`p.usuario_id=${actorId}`} AND a.activo=true AND a.codigo IN (${Prisma.join(AREA_CODES)})),'[]'::json) AS permissions,
      (SELECT COUNT(*)::integer FROM ${requireB8 ? Prisma.sql`permissions_locked` : Prisma.sql`permiso_usuarios`} p WHERE ${requireB8 ? Prisma.sql`TRUE` : Prisma.sql`p.usuario_id=${actorId}`} AND (p.lectura=true OR p.escritura=true)) AS granular
    LIMIT 1
  `)
  const photo = rows.length === 1 ? rows[0] : null
  if (!photo || typeof photo.database_name !== 'string' || typeof photo.database_user !== 'string'
    || !Array.isArray(photo.permissions) || !Number.isSafeInteger(photo.granular) || photo.granular < 0
    || photo.permissions.some(p => typeof p.lectura !== 'boolean' || typeof p.escritura !== 'boolean')
    || (photo.target !== null && typeof photo.target?.activo !== 'boolean')
    || (photo.actor !== null && (photo.actor?.id !== actorId || typeof photo.actor.activo !== 'boolean' || typeof photo.actor.rol !== 'string'
      || (photo.actor.roles !== null && (!Array.isArray(photo.actor.roles) || photo.actor.roles.some(role => typeof role !== 'string')))))) deny()
  let open = true
  const read = (value: unknown) => { if (!open) deny(); return structuredClone(value) }
  const accessTx = {
    $queryRaw: (...args: unknown[]) => {
      if (!open) deny()
      const statement = args[0] as { strings?: string[] }
      const text = Array.isArray(statement?.strings) ? statement.strings.join('?') : Array.isArray(args[0]) ? (args[0] as string[]).join('?') : ''
      if (/^\s*SELECT current_database\(\) AS database_name, current_user AS database_user LIMIT 1\s*$/.test(text)) {
        return Promise.resolve(read([{ database_name: photo.database_name, database_user: photo.database_user }]))
      }
      // Preserve only the exact two existing B8 row-lock queries. No generic raw
      // SQL or financial-source operation is admitted to this read adapter.
      if (/^\s*SELECT id FROM (?:usuarios_admin WHERE id|permiso_usuarios WHERE usuario_id) = \? FOR SHARE\s*$/.test(text)
        && exact((statement as any).values, [actorId]) && requireB8) {
        return Promise.resolve(read([]))
      }
      return deny()
    },
    usuarioAdmin: { findUnique: async (args: unknown) => {
      if (!exact(args, { where: { id: actorId }, select: { id: true, activo: true, rol: true, roles: true } })) deny()
      return read(photo.actor)
    } },
    permisoArea: { findUnique: async (args: unknown) => {
      if (!exact(args, { where: { codigo: B4_CONCILIACION_AREA }, select: { activo: true } })) deny()
      return read(photo.target)
    } },
    permisoUsuario: {
      findMany: async (args: unknown) => {
        if (!exact(args, { where: { usuarioId: actorId, area: { codigo: { in: AREA_CODES }, activo: true } } })) deny()
        return read(photo.permissions)
      },
      count: async (args: unknown) => {
        if (!exact(args, { where: { usuarioId: actorId, OR: [{ lectura: true }, { escritura: true }] } })) deny()
        return read(photo.granular)
      },
    },
  } as unknown as Tx
  try {
    await assertConciliarRuntime(accessTx)
    const access = await requireB4ActorAccess(actorId, 'escritura', accessTx)
    if ('response' in access) return access
    if (requireB8) await requireActualActorPermissionB8Tx(accessTx, actorId, 'escritura')
    return access
  } finally { open = false }
}
