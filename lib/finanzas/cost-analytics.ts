import { Prisma } from '@prisma/client';

export const SIN_CATEGORIA = '__SIN_CATEGORIA__';
const STATES = ['', 'pendiente', 'clasificada', 'sin_asignar', 'parcial', 'imputada', 'incidencia'] as const;
export type CostFilters = { desde?: string; hasta?: string; buscar: string; proveedor: string; estado: string; categoria: string; proveedorKey: string; nivel: string; page: number; limit: number };

export function validDay(value: string): boolean {
  const date = new Date(value + 'T00:00:00Z');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2200 && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function parseCostFilters(params: URLSearchParams): CostFilters {
  const text = (name: string, max = 200) => { const s = (params.get(name) || '').trim(); if (s.length > max) throw new Error('Filtro demasiado largo'); return s; };
  const desde = text('desde'), hasta = text('hasta');
  if ((desde && !validDay(desde)) || (hasta && !validDay(hasta)) || (desde && hasta && desde > hasta)) throw new Error('Período no válido');
  const integer = (key: string, fallback: number, max: number) => { const raw = params.get(key); if (raw === null) return fallback; if (!/^\d+$/.test(raw)) throw new Error('Paginación no válida'); const n = Number(raw); if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error('Paginación fuera de rango'); return n; };
  const estado = text('estadoAnalitica');
  const nivel = text('nivel') || 'categorias';
  if (!(STATES as readonly string[]).includes(estado) || !['categorias', 'proveedores', 'facturas'].includes(nivel)) throw new Error('Vista o estado no válido');
  return { desde: desde || undefined, hasta: hasta || undefined, buscar: text('buscar'), proveedor: text('proveedor'), estado, categoria: text('categoria'), proveedorKey: text('proveedorKey', 400), nivel, page: integer('page', 1, 100000), limit: integer('limit', 30, 100) };
}
export function normalizedProviderKey(provider: string, cif: string | null): string {
  const id = (cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return id ? `cif:${id}` : `nombre:${provider.trim().replace(/\s+/g, ' ').toUpperCase()}`;
}
export function allocationCents(base: number, allocated: number, hasFlag: boolean, invalid = false) {
  const b = Math.round(base * 100), a = Math.round(allocated * 100);
  const issue = invalid || (b === 0 ? a !== 0 : (a !== 0 && Math.sign(a) !== Math.sign(b)) || Math.abs(a) > Math.abs(b)) || (hasFlag && a === 0 && b !== 0) || (!hasFlag && a !== 0);
  const accepted = !hasFlag ? 0 : b >= 0 ? Math.max(0, Math.min(b, a)) : Math.min(0, Math.max(b, a));
  return { assigned: accepted, remaining: b - accepted, issue };
}

// Escape LIKE metacharacters: search is literal, never an SQL expression/wildcard.
const like = (s: string) => '%' + s.replace(/[\\%_]/g, '\\$&') + '%';
export function costCTE(f: CostFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`f.estado <> 'RECHAZADA'`];
  if (f.desde) conditions.push(Prisma.sql`f.fecha >= ${new Date(f.desde + 'T00:00:00Z')}`);
  if (f.hasta) { const end = new Date(f.hasta + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() + 1); conditions.push(Prisma.sql`f.fecha < ${end}`); }
  if (f.proveedor) conditions.push(Prisma.sql`f.proveedor ILIKE ${like(f.proveedor)}`);
  if (f.buscar) { const q = like(f.buscar); conditions.push(Prisma.sql`(f.proveedor ILIKE ${q} OR f.cif ILIKE ${q} OR f.concepto ILIKE ${q} OR f.num_factura ILIKE ${q} OR f.cliente_imputado ILIKE ${q} OR EXISTS (SELECT 1 FROM comentarios_facturas_recibidas c WHERE c.factura_id = f.id AND c.texto ILIKE ${q}))`); }
  const final: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.categoria) final.push(Prisma.sql`categoria_key = ${f.categoria}`);
  if (f.proveedorKey) final.push(Prisma.sql`proveedor_key = ${f.proveedorKey}`);
  if (f.estado === 'pendiente') final.push(Prisma.sql`categoria_key = ${SIN_CATEGORIA}`);
  if (f.estado === 'clasificada') final.push(Prisma.sql`categoria_key <> ${SIN_CATEGORIA}`);
  if (f.estado === 'sin_asignar') final.push(Prisma.sql`ABS(sin_asignar) > 0`);
  if (f.estado === 'parcial') final.push(Prisma.sql`ABS(asignado) > 0 AND ABS(sin_asignar) > 0`);
  if (f.estado === 'imputada') final.push(Prisma.sql`sin_asignar = 0 AND NOT incidencia`);
  if (f.estado === 'incidencia') final.push(Prisma.sql`incidencia`);
  return Prisma.sql`WITH documentos AS (
    SELECT f.id, f.proveedor, f.cif, f.num_factura, f.fecha, f.concepto, f.imputacion, f.imputado_a_ventas,
      ROUND(f.base::numeric, 2) AS base,
      COALESCE(NULLIF(BTRIM(f.imputacion), ''), ${SIN_CATEGORIA}) AS categoria_key,
      CASE WHEN REGEXP_REPLACE(UPPER(COALESCE(f.cif, '')), '[^A-Z0-9]', '', 'g') <> ''
        THEN 'cif:' || REGEXP_REPLACE(UPPER(f.cif), '[^A-Z0-9]', '', 'g')
        ELSE 'nombre:' || UPPER(REGEXP_REPLACE(BTRIM(f.proveedor), '\\s+', ' ', 'g')) END AS proveedor_key
    FROM facturas_recibidas f WHERE ${Prisma.join(conditions, ' AND ')}
  ), repartos AS (
    SELECT i.factura_id, SUM(ROUND(i.importe::numeric, 2)) AS importe,
      BOOL_OR((d.base > 0 AND i.importe < 0) OR (d.base < 0 AND i.importe > 0)) AS signo_invalido
    FROM imputaciones_coste_cliente i JOIN documentos d ON d.id = i.factura_id
    WHERE i.confirmado = true AND BTRIM(i.cliente_nombre) <> ''
      AND LOWER(BTRIM(i.cliente_nombre)) NOT IN ('(sin asignar)', 'sin asignar', '(sin cliente)', 'sin cliente')
    GROUP BY i.factura_id
  ), calculados AS (
    SELECT d.*, CASE WHEN NOT d.imputado_a_ventas THEN 0::numeric
      WHEN d.base >= 0 THEN GREATEST(0::numeric, LEAST(d.base, COALESCE(r.importe, 0)))
      ELSE LEAST(0::numeric, GREATEST(d.base, COALESCE(r.importe, 0))) END AS asignado,
      (COALESCE(r.signo_invalido, false) OR ABS(COALESCE(r.importe, 0)) > ABS(d.base)
        OR (d.base = 0 AND COALESCE(r.importe, 0) <> 0)
        OR (d.imputado_a_ventas AND d.base <> 0 AND COALESCE(r.importe, 0) = 0)
        OR (NOT d.imputado_a_ventas AND COALESCE(r.importe, 0) <> 0)) AS incidencia
    FROM documentos d LEFT JOIN repartos r ON r.factura_id = d.id
  ), importes AS (SELECT *, base - asignado AS sin_asignar FROM calculados),
  filtrados AS (SELECT * FROM importes WHERE ${Prisma.join(final, ' AND ')})`;
}

export const totalColumns = Prisma.sql`COUNT(*)::int AS "totalFacturas",
  COALESCE(SUM(base), 0)::float8 AS "costeBase",
  COALESCE(SUM(asignado), 0)::float8 AS asignado,
  COALESCE(SUM(sin_asignar), 0)::float8 AS "sinAsignar",
  COALESCE(SUM(base) FILTER (WHERE categoria_key <> ${SIN_CATEGORIA}), 0)::float8 AS clasificado,
  COALESCE(SUM(base) FILTER (WHERE categoria_key = ${SIN_CATEGORIA}), 0)::float8 AS "sinClasificar",
  COUNT(*) FILTER (WHERE incidencia)::int AS incidencias,
  COUNT(*) FILTER (WHERE base < 0)::int AS negativas,
  CASE WHEN COALESCE(SUM(base) FILTER (WHERE base > 0), 0) > 0
    THEN ROUND(100 * COALESCE(SUM(asignado) FILTER (WHERE base > 0), 0) / SUM(base) FILTER (WHERE base > 0), 1)::float8
    ELSE 0::float8 END AS "coberturaPorImporte"`;
