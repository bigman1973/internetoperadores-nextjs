export type TecnicoDisponible = {
  id: string
  nombreCompleto: string
  categoria: string | null
  estado: string
}

export type AddTecnicoInput = {
  empleadoId: string
  nivel: 1 | 2 | 3
  fechaAlta: string
}

export type AddTecnicoValidation =
  | { ok: true; value: AddTecnicoInput }
  | { ok: false; error: string }

/** Convierte cualquier respuesta no-array en una lista vacía para que el selector sea seguro al renderizar. */
export function normalizeTecnicosDisponibles(payload: unknown): TecnicoDisponible[] {
  if (!payload || typeof payload !== 'object') return []

  const tecnicos = (payload as { tecnicos?: unknown }).tecnicos
  if (!Array.isArray(tecnicos)) return []

  return tecnicos.flatMap((tecnico): TecnicoDisponible[] => {
    if (!tecnico || typeof tecnico !== 'object') return []

    const { id, nombreCompleto, categoria, estado } = tecnico as Record<string, unknown>
    if (typeof id !== 'string' || !id.trim() || typeof nombreCompleto !== 'string' || !nombreCompleto.trim() || typeof estado !== 'string' || !estado.trim()) {
      return []
    }

    return [{
      id,
      nombreCompleto,
      categoria: typeof categoria === 'string' ? categoria : null,
      estado,
    }]
  })
}

/** Mantiene los estados de listas de la página como arrays aunque la API responda un JSON inesperado. */
export function normalizeGuardiasArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Valida el payload de alta antes de tocar la base de datos. */
export function validateAddTecnicoInput(input: unknown): AddTecnicoValidation {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Datos de técnico no válidos' }

  const { empleadoId, nivel, fechaAlta } = input as Record<string, unknown>
  if (typeof empleadoId !== 'string' || !empleadoId.trim()) {
    return { ok: false, error: 'empleadoId es obligatorio' }
  }

  if (typeof nivel !== 'number' && typeof nivel !== 'string') {
    return { ok: false, error: 'nivel debe ser un entero entre 1 y 3' }
  }
  const parsedNivel = typeof nivel === 'number' ? nivel : Number(nivel)
  if (!Number.isInteger(parsedNivel) || parsedNivel < 1 || parsedNivel > 3) {
    return { ok: false, error: 'nivel debe ser un entero entre 1 y 3' }
  }

  if (typeof fechaAlta !== 'string' || !isValidDateOnly(fechaAlta)) {
    return { ok: false, error: 'fechaAlta debe tener formato AAAA-MM-DD y ser una fecha válida' }
  }

  return {
    ok: true,
    value: {
      empleadoId: empleadoId.trim(),
      nivel: parsedNivel as 1 | 2 | 3,
      fechaAlta,
    },
  }
}
