export interface UsuarioInitialData {
  id: number;
  email: string;
  nombre: string;
  rol: string;
  roles: string[];
  activo: boolean;
  ultimoAcceso: string | null;
  createdAt: string;
  perfilAsignado?: string | null;
}

type UsuarioInitialRow = Omit<UsuarioInitialData, 'roles' | 'ultimoAcceso' | 'createdAt'> & {
  roles: readonly string[];
  ultimoAcceso: Date | null;
  createdAt: Date;
};

/**
 * React Server Components only accept serializable props. This deliberately
 * converts the same fields returned by /api/admin/usuarios without retaining
 * data beyond the current dynamic render.
 */
export function serializeUsuariosInitiales(rows: readonly UsuarioInitialRow[]): UsuarioInitialData[] {
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    nombre: row.nombre,
    rol: row.rol,
    roles: [...row.roles],
    activo: row.activo,
    ultimoAcceso: row.ultimoAcceso?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    perfilAsignado: row.perfilAsignado ?? null,
  }));
}
