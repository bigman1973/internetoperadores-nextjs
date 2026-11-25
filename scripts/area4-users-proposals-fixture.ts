import { AREA4_SECTION_REGISTRY } from '../lib/area4/section-registry'
import type { UsersApplyDatabase, UsersCurrentState, UsersCurrentUser } from '../lib/area4/users-proposals'

export const OWNER_ID = 901
export const TEST_ENV = {
  AREA4_OWNER_USER_ID: String(OWNER_ID), FINANCE_STAGING_SANDBOX: '1', AREA4_STAGING_USER_APPLY: '1', VERCEL_ENV: 'preview',
  DATABASE_URL: 'postgresql://io_staging_finanzas:synthetic@database.example.invalid/io_staging_finanzas',
  VERCEL_URL: 'area4-synthetic-preview.vercel.app',
}
const at = '2026-11-24T12:00:00.000Z'
export function fixtureUser(id: number, nombre: string, overrides: Partial<UsersCurrentUser> = {}): UsersCurrentUser {
  return { id, nombre, email: `account-${id}@example.invalid`, activo: true, rol: 'VISOR', roles: ['VISOR'], perfilAsignado: null,
    permisosArea4Vivos: false, ultimoAcceso: '2026-11-23T10:00:00.000Z', createdAt: at, updatedAt: at, grants: [], ...overrides }
}
export function fixtureState(): UsersCurrentState {
  const codes = [...new Set([...AREA4_SECTION_REGISTRY.map(s => s.areaCode), 'admin.gastos_nominas', 'admin.personal.empleados', 'admin.finanzas.nominas', 'admin.empleados.condiciones_salariales', 'admin.futuro_cerrado', 'empleado.mis_gastos'])]
  return {
    users: [fixtureUser(OWNER_ID, 'Propietario sintético', { rol: 'SUPER_ADMIN', roles: ['SUPER_ADMIN'] }),
      fixtureUser(910, 'David Pérez', { rol: 'GERENTE', roles: ['GERENTE', 'RRHH', 'CONTABILIDAD'] }),
      fixtureUser(911, 'Jordi Giró Marqués', { rol: 'VISOR', roles: ['VISOR', 'GERENTE'] }),
      fixtureUser(912, 'Lorena Gimeno Martínez', { rol: 'GERENTE', roles: ['GERENTE', 'CONTABILIDAD', 'RRHH'] }),
      fixtureUser(913, 'Jesús Parra García'), fixtureUser(914, 'Alejandro Martínez Cayuelas'), fixtureUser(915, 'Patricia Parra García'),
      fixtureUser(916, 'Iván Pérez', { activo: true }), fixtureUser(917, 'Tutorial Bot', { activo: false }),
      fixtureUser(918, 'Persona sin asignación'), fixtureUser(919, 'Segunda persona sin asignación')],
    areas: codes.map((codigo, index) => ({ id: `synthetic-area-${index}`, codigo, padre: codigo.includes('.') ? codigo.split('.').slice(0, -1).join('.') : null, activo: true })),
    profiles: [{ id: 'synthetic-legacy-profile', nombre: 'Perfil anterior', activo: true, permisos: [], updatedAt: at }],
  }
}
export function createProposalStub(initial: UsersCurrentState, options: { failAudit?: number; serializationFailure?: boolean } = {}) {
  let committed = structuredClone(initial)
  let audits: any[] = []
  const stats = { transactions: 0, writes: 0, readCalls: 0, isolation: '' }
  const delegates = (state: UsersCurrentState, ledger: any[]) => ({
    usuarioAdmin: {
      async findMany(args: any) {
        stats.readCalls++
        if (args.select.passwordHash || args.select.empleado || args.select.nif) throw new Error('unsafe select')
        return state.users.map(({ grants, ...u }) => ({ ...u, ultimoAcceso: u.ultimoAcceso ? new Date(u.ultimoAcceso) : null,
          createdAt: new Date(u.createdAt), updatedAt: new Date(u.updatedAt), permisos: grants.map(({ codigo, ...g }) => ({ ...g,
            createdAt: new Date(g.createdAt), updatedAt: new Date(g.updatedAt), area: { codigo } })) }))
      },
      async update(args: any) {
        stats.writes++
        const user = state.users.find(u => u.id === args.where.id)!
        Object.assign(user, args.data, { updatedAt: '2026-11-24T13:00:00.000Z' })
        return { id: user.id }
      },
    },
    permisoArea: { async findMany() { stats.readCalls++; return structuredClone(state.areas) } },
    perfilPermisos: { async findMany() { stats.readCalls++; return state.profiles.map(p => ({ ...p, updatedAt: new Date(p.updatedAt) })) } },
    permisoUsuario: {
      async deleteMany(args: any) { stats.writes++; state.users.find(u => u.id === args.where.usuarioId)!.grants = []; return { count: 1 } },
      async createMany(args: any) {
        stats.writes++
        for (const data of args.data) {
          const user = state.users.find(u => u.id === data.usuarioId)!
          const area = state.areas.find(a => a.id === data.areaId)!
          user.grants.push({ id: `synthetic-grant-${user.id}-${area.id}`, areaId: area.id, codigo: area.codigo,
            lectura: data.lectura, escritura: data.escritura, confirmar: data.confirmar, exportar: data.exportar, createdAt: at, updatedAt: '2026-11-24T13:00:00.000Z' })
        }
        return { count: args.data.length }
      },
    },
    auditoriaPermisosArea4: {
      async findFirst(args: any) {
        stats.readCalls++
        const index = ledger.map((event, index) => ({ event, index })).reverse().find(item =>
          item.event.objetivoUsuarioId === args.where.objetivoUsuarioId && item.event.operacion === args.where.operacion && item.event.origen === args.where.origen)
        return index ? { id: `synthetic-audit-${index.index + 1}`, actorId: index.event.actorId, createdAt: new Date('2026-11-24T13:00:00.000Z'), despues: structuredClone(index.event.despues) } : null
      },
      async create(args: any) {
        if (options.failAudit === ledger.length + 1) throw new Error('synthetic audit failure contains private values')
        ledger.push(structuredClone(args.data)); return { id: `synthetic-audit-${ledger.length}` }
      },
    },
  })
  const db = { ...delegates(committed, audits), async $transaction(callback: any, settings: any) {
    stats.transactions++
    stats.isolation = settings?.isolationLevel || ''
    const working = structuredClone(committed)
    const ledger = structuredClone(audits)
    const result = await callback(delegates(working, ledger))
    if (options.serializationFailure) throw Object.assign(new Error('serialization'), { code: 'P2034' })
    committed = working; audits = ledger
    return result
  } } as unknown as UsersApplyDatabase
  return { db, stats, state: () => committed, audits: () => audits }
}
