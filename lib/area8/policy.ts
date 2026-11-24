import { configuredArea4OwnerId, evaluateArea4Capability, isArea4Owner } from '../area4/policy'

export type Area8Account = { id: number; activo: boolean; email: string; rol: string; roles?: readonly string[] }
export type Area8Grant = { lectura: boolean; escritura: boolean; area: { codigo: string } }
export const area8OwnerId = configuredArea4OwnerId

/** El propietario y la gestión siguen la política común, sin privilegios por JWT. */
export function isArea8Owner(account: Area8Account, acting: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return !acting && isArea4Owner(account, env)
}
export function canManageArea8(account: Area8Account, grants: Area8Grant[], write: boolean, area = 'admin.peticiones', permissionsAdopted = false): boolean {
  return evaluateArea4Capability({
    principal: account,
    grants: grants.map(grant => ({ codigo: grant.area.codigo, lectura: grant.lectura, escritura: grant.escritura })),
    codigoArea: area,
    capability: write ? 'escritura' : 'lectura',
    permissionsAdopted,
  })
}
