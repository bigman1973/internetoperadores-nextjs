export const EMPRESAS_GRUPO = [
  'INTERNET OPERADORES',
  'LFGD',
  'LFDEAL',
  'LFKAPITAL',
  'FARMSPLANET',
  'MIKELS',
] as const;

export const DEPARTAMENTOS_BASE = [
  'Dirección',
  'Administración',
  'Comercial',
  'Técnico',
  'Marketing',
  'Finanzas',
  'Operaciones',
] as const;

export type EmpresaGrupo = (typeof EMPRESAS_GRUPO)[number];

export function normalizeOrganizationText(value: unknown, maxLength = 160) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function parseOrganizationDate(value: unknown, fieldName: string) {
  const dateText = normalizeOrganizationText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) throw new Error(`${fieldName} no es válida`);
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`${fieldName} no es válida`);
  return date;
}

export function endOfPreviousDay(date: Date) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

export function formatOrganizationDate(date: Date | string | null | undefined) {
  if (!date) return '';
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(date));
}

export function activePositionWhere(referenceDate: Date) {
  return {
    fechaInicio: { lte: referenceDate },
    OR: [{ fechaFin: null }, { fechaFin: { gte: referenceDate } }],
  };
}

export function categorySourceLabel(source: string) {
  return source === 'nomina' ? 'Nómina' : 'Ficha del empleado';
}
