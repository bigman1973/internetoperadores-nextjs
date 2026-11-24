import type { Prisma } from '@prisma/client'

export type Area4AuditOperation =
  | 'USUARIO_ALTA'
  | 'USUARIO_CAMBIO'
  | 'USUARIO_BAJA'
  | 'PERMISO_CAMBIO'
  | 'PERFIL_CAMBIO'
  | 'PERFIL_APLICADO'
  | 'CONFIRMACION_SOLICITADA'
  | 'EXPORTACION_SOLICITADA'
  | 'MENU_PRESENTACION_CAMBIO'

export type Area4AuditInput = Readonly<{
  actorId: number
  objetivoUsuarioId?: number | null
  operacion: Area4AuditOperation
  areaCodigo?: string | null
  antes?: Prisma.InputJsonValue | null
  despues?: Prisma.InputJsonValue | null
  origen?: string | null
}>

/**
 * El trigger SQL impide actualizar, borrar o truncar esta tabla. Cada llamada se
 * hace dentro de la misma transacción que el cambio de negocio correspondiente.
 */
export async function appendArea4Audit(
  tx: Pick<Prisma.TransactionClient, 'auditoriaPermisosArea4'>,
  input: Area4AuditInput,
) {
  return tx.auditoriaPermisosArea4.create({
    data: {
      actorId: input.actorId,
      objetivoUsuarioId: input.objetivoUsuarioId ?? null,
      operacion: input.operacion,
      areaCodigo: input.areaCodigo ?? null,
      antes: input.antes ?? undefined,
      despues: input.despues ?? undefined,
      origen: input.origen ?? null,
    },
  })
}

export function snapshotAdminUser(input: Readonly<{
  id: number
  nombre: string
  rol: string
  roles: readonly string[]
  activo: boolean
  perfilAsignado?: string | null
}>) {
  return {
    id: input.id,
    nombre: input.nombre,
    rol: input.rol,
    roles: [...input.roles],
    activo: input.activo,
    perfilAsignado: input.perfilAsignado ?? null,
  }
}
