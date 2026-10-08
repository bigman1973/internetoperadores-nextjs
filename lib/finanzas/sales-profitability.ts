import { Prisma } from '@prisma/client';

export type ProfitLevel = 'servicios' | 'clientes' | 'facturas' | 'detalle' | 'compras' | 'personal' | 'seleccionar';

export type ProfitFilters = {
  desde: string;
  hasta: string;
  actividad: string;
  buscar: string;
  nivel: ProfitLevel;
  servicioKey: string;
  clienteKey: string;
  facturaId: string;
  page: number;
  limit: number;
};

const MAX_TEXT = 200;
const MAX_ID = 200;
const LEVELS: readonly ProfitLevel[] = ['servicios', 'clientes', 'facturas', 'detalle', 'compras', 'personal', 'seleccionar'];
export const SERVICE_KEYS = ['PROYECTO', 'TELECO_INTERMEDIACION', 'TELECO_RED_PROPIA', '__SIN_DESGLOSE__'] as const;

/** Calendar-day validation avoids JavaScript's permissive Date rollover behaviour. */
export function validProfitDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2200) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function textParam(params: URLSearchParams, name: string, maximum = MAX_TEXT): string {
  const value = (params.get(name) || '').trim();
  if (value.length > maximum || /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/.test(value)) throw new Error('invalid');
  return value;
}

function positiveInteger(params: URLSearchParams, name: string, fallback: number, maximum: number): number {
  const raw = params.get(name);
  if (raw === null) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) throw new Error('invalid');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) throw new Error('invalid');
  return value;
}

/** Parses only the public read filters. Dates are deliberately mandatory for every profitability view. */
export function parseProfitFilters(params: URLSearchParams): ProfitFilters {
  const desde = textParam(params, 'desde', 10);
  const hasta = textParam(params, 'hasta', 10);
  if (!validProfitDay(desde) || !validProfitDay(hasta) || desde > hasta) throw new Error('invalid');
  const nivel = (textParam(params, 'nivel', 20) || 'servicios') as ProfitLevel;
  if (!LEVELS.includes(nivel)) throw new Error('invalid');
  const servicioKey = textParam(params, 'servicioKey', 40);
  if (servicioKey && !(SERVICE_KEYS as readonly string[]).includes(servicioKey)) throw new Error('invalid');
  return {
    desde,
    hasta,
    actividad: textParam(params, 'actividad', 160),
    buscar: textParam(params, 'buscar', MAX_TEXT),
    nivel,
    servicioKey,
    clienteKey: textParam(params, 'clienteKey', MAX_ID),
    facturaId: textParam(params, 'facturaId', MAX_ID),
    page: positiveInteger(params, 'page', 1, 100000),
    limit: positiveInteger(params, 'limit', 25, 50),
  };
}

export function literalLike(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export function endOfProfitDay(day: string): Date {
  const result = new Date(`${day}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

/** A stable two-decimal comparison for write idempotency and percentage constraints. */
export function percentageToHundredths(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 1e-8 || cents < 1 || cents > 10000) return null;
  return cents;
}

export function availablePercentage(totalHundredths: number, currentHundredths = 0): number {
  return Math.max(0, Math.min(10000, 10000 - totalHundredths + currentHundredths));
}

export function toMoney(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
}

const clientIdentity = Prisma.sql`
  SELECT fe.id, fe.num_factura, fe.cliente, fe.fecha, fe.concepto,
    NULLIF(BTRIM(fe.imputacion), '') AS actividad, fe.base::float8 AS ventas,
    COALESCE(isp_match.id, nif_match.id) AS cliente_web_id,
    COALESCE(isp_match.nombre, nif_match.nombre) AS cliente_web_nombre
  FROM facturas_emitidas fe
  LEFT JOIN (
    SELECT f.isp_gestion_id::text AS external_id, MIN(cw.id) AS id, MIN(cw.nombre) AS nombre
    FROM facturas f
    JOIN clientes_web cw ON cw.cliente_id_isp = f.id_cliente::text
    GROUP BY f.isp_gestion_id::text
    HAVING COUNT(DISTINCT cw.id) = 1
  ) isp_match ON LOWER(BTRIM(COALESCE(fe.origen_sistema, ''))) = 'ispgestion'
    AND fe.id_externo = isp_match.external_id
  LEFT JOIN (
    SELECT normalized_tax_id, MIN(id) AS id, MIN(nombre) AS nombre
    FROM (
      SELECT cw.id, cw.nombre,
        REGEXP_REPLACE(UPPER(COALESCE(tax.value, '')), '[^A-Z0-9]', '', 'g') AS normalized_tax_id
      FROM clientes_web cw
      CROSS JOIN LATERAL (VALUES (cw.nif), (cw.cif)) AS tax(value)
    ) tax_ids
    WHERE normalized_tax_id <> ''
    GROUP BY normalized_tax_id
    HAVING COUNT(DISTINCT id) = 1
  ) nif_match ON nif_match.normalized_tax_id = REGEXP_REPLACE(UPPER(COALESCE(fe.cif, '')), '[^A-Z0-9]', '', 'g')`;

/**
 * Shared CTE graph for every read view. The graph is intentionally source-centric:
 * source allocations are validated globally before an amount is allowed into a sale,
 * and client pools are never spread back over individual invoices.
 */
export function profitabilityCTE(filters: ProfitFilters): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`fe.estado::text NOT IN ('ANULADA', 'BORRADOR')`];
  conditions.push(Prisma.sql`fe.fecha >= ${new Date(`${filters.desde}T00:00:00.000Z`)}`);
  conditions.push(Prisma.sql`fe.fecha < ${endOfProfitDay(filters.hasta)}`);
  if (filters.actividad) conditions.push(Prisma.sql`COALESCE(BTRIM(fe.imputacion), '') = ${filters.actividad}`);
  if (filters.facturaId) conditions.push(Prisma.sql`fe.id = ${filters.facturaId}`);
  if (filters.buscar) {
    const q = literalLike(filters.buscar);
    conditions.push(Prisma.sql`(fe.num_factura ILIKE ${q} OR fe.cliente ILIKE ${q} OR COALESCE(fe.concepto, '') ILIKE ${q})`);
  }

  const costStart = new Date(`${filters.desde}T00:00:00.000Z`);
  const costEnd = endOfProfitDay(filters.hasta);

  return Prisma.sql`
WITH sales_base AS (
  ${clientIdentity}
  WHERE ${Prisma.join(conditions, ' AND ')}
), sales AS (
  SELECT *,
    CASE WHEN cliente_web_id IS NULL THEN 'factura:' || id ELSE 'cliente:' || cliente_web_id::text END AS cliente_key,
    COALESCE(cliente_web_nombre, cliente) AS cliente_label
  FROM sales_base
), purchase_link_totals AS (
  SELECT v.factura_recibida_id AS fuente_id,
    COALESCE(SUM(CASE WHEN v.porcentaje IS NOT NULL
        AND BTRIM(v.porcentaje::text) NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN v.porcentaje::numeric ELSE 0::numeric END), 0) AS porcentaje_total,
    BOOL_OR(v.porcentaje IS NULL OR BTRIM(v.porcentaje::text) IN ('NaN', 'Infinity', '-Infinity')
      OR v.porcentaje <= 0 OR v.porcentaje > 100) AS porcentaje_invalido,
    BOOL_OR(fe.id IS NULL) AS factura_huerfana
  FROM vinculaciones_facturas v
  LEFT JOIN facturas_emitidas fe ON fe.id = v.factura_emitida_id
  GROUP BY v.factura_recibida_id
), purchase_confirmed AS (
  SELECT factura_id AS fuente_id, COUNT(*)::int AS cantidad
  FROM imputaciones_coste_cliente
  WHERE confirmado = true
  GROUP BY factura_id
), purchase_client_validation AS (
  SELECT i.factura_id AS fuente_id,
    BOOL_OR(i.importe IS NULL OR BTRIM(i.importe::text) IN ('NaN', 'Infinity', '-Infinity')
      OR fr.base IS NULL OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity')) AS importe_invalido,
    BOOL_OR(CASE
      WHEN i.importe IS NULL OR BTRIM(i.importe::text) IN ('NaN', 'Infinity', '-Infinity')
        OR fr.base IS NULL OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity') THEN false
      WHEN (fr.base > 0 AND i.importe < 0) OR (fr.base < 0 AND i.importe > 0)
        OR (fr.base = 0 AND i.importe <> 0) THEN true
      ELSE false END) AS signo_invalido,
    ABS(COALESCE(SUM(CASE WHEN i.importe IS NOT NULL
        AND BTRIM(i.importe::text) NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN i.importe::numeric ELSE 0::numeric END), 0))
      > ABS(COALESCE(MAX(CASE WHEN fr.base IS NOT NULL
          AND BTRIM(fr.base::text) NOT IN ('NaN', 'Infinity', '-Infinity')
          THEN fr.base::numeric ELSE NULL END), 0)) + 0.005 AS sobreasignado
  FROM imputaciones_coste_cliente i
  JOIN facturas_recibidas fr ON fr.id = i.factura_id
  WHERE i.confirmado = true
  GROUP BY i.factura_id
), purchase_link_raw AS (
  SELECT v.factura_emitida_id, v.id, v.factura_recibida_id AS fuente_id,
    fr.num_factura, fr.proveedor, fr.fecha, fr.base::float8 AS base, v.porcentaje::float8 AS porcentaje, v.notas,
    (COALESCE(pl.porcentaje_invalido, false) OR COALESCE(pl.porcentaje_total, 0) > 100
      OR COALESCE(pl.factura_huerfana, false) OR COALESCE(pc.cantidad, 0) > 0
      OR fr.id IS NULL OR fr.estado::text = 'RECHAZADA' OR fr.base IS NULL
      OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity') OR fr.base = 0
      OR (fr.base <> 0 AND SIGN(fr.base) <> SIGN(fr.base * v.porcentaje))) AS incidencia,
    CASE WHEN COALESCE(pl.porcentaje_invalido, false) OR COALESCE(pl.porcentaje_total, 0) > 100
      OR COALESCE(pl.factura_huerfana, false) OR COALESCE(pc.cantidad, 0) > 0
      OR fr.id IS NULL OR fr.estado::text = 'RECHAZADA' OR fr.base IS NULL
      OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity') OR fr.base = 0
      OR (fr.base <> 0 AND SIGN(fr.base) <> SIGN(fr.base * v.porcentaje))
      THEN 0::bigint ELSE ROUND(fr.base::numeric * 100)::bigint END AS base_centimos,
    COALESCE(pl.porcentaje_total, 0) AS porcentaje_total
  FROM vinculaciones_facturas v
  LEFT JOIN facturas_recibidas fr ON fr.id = v.factura_recibida_id
  LEFT JOIN purchase_link_totals pl ON pl.fuente_id = v.factura_recibida_id
  LEFT JOIN purchase_confirmed pc ON pc.fuente_id = v.factura_recibida_id
), purchase_link_floors AS (
  SELECT *,
    CASE WHEN incidencia THEN 0::bigint
      ELSE FLOOR(ABS(base_centimos)::numeric * porcentaje::numeric / 100)::bigint END AS coste_centimos_base,
    CASE WHEN incidencia THEN 0::numeric
      ELSE ABS(base_centimos)::numeric * porcentaje::numeric / 100
        - FLOOR(ABS(base_centimos)::numeric * porcentaje::numeric / 100) END AS resto,
    SUM(CASE WHEN incidencia THEN 0::bigint
      ELSE FLOOR(ABS(base_centimos)::numeric * porcentaje::numeric / 100)::bigint END)
      OVER (PARTITION BY fuente_id) AS centimos_suelo
  FROM purchase_link_raw
), purchase_link_allocations AS (
  SELECT *,
    GREATEST(0::numeric, LEAST(ABS(base_centimos)::numeric,
      ROUND(ABS(base_centimos)::numeric * porcentaje_total / 100)) - centimos_suelo) AS centimos_repartir,
    ROW_NUMBER() OVER (PARTITION BY fuente_id ORDER BY resto DESC, id ASC) AS orden_resto
  FROM purchase_link_floors
), purchase_links_global AS (
  SELECT *, CASE WHEN incidencia THEN 0::bigint ELSE coste_centimos_base +
    CASE WHEN orden_resto <= centimos_repartir THEN 1::bigint ELSE 0::bigint END END AS coste_centimos
  FROM purchase_link_allocations
), purchase_links AS (
  SELECT plg.*, (SIGN(plg.base_centimos)::float8 * plg.coste_centimos::float8 / 100)::float8 AS coste
  FROM purchase_links_global plg
  JOIN sales s ON s.id = plg.factura_emitida_id
), purchase_invoice AS (
  SELECT factura_emitida_id,
    COALESCE(SUM(SIGN(base_centimos)::float8 * coste_centimos::float8 / 100), 0)::float8 AS compras_directas,
    COUNT(*) FILTER (WHERE NOT incidencia)::int AS num_compras,
    COALESCE(BOOL_OR(incidencia), false) AS incidencia
  FROM purchase_links
  GROUP BY factura_emitida_id
), purchase_client_rows AS (
  SELECT i.factura_id, i.cliente_id, i.importe,
    (i.cliente_id IS NULL OR fr.estado::text = 'RECHAZADA' OR fr.base IS NULL
      OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity') OR fr.base = 0
      OR plt.fuente_id IS NOT NULL OR COALESCE(pcv.importe_invalido, false)
      OR COALESCE(pcv.signo_invalido, false) OR COALESCE(pcv.sobreasignado, false)) AS incidencia
  FROM imputaciones_coste_cliente i
  JOIN facturas_recibidas fr ON fr.id = i.factura_id
  LEFT JOIN purchase_link_totals plt ON plt.fuente_id = i.factura_id
  LEFT JOIN purchase_client_validation pcv ON pcv.fuente_id = i.factura_id
  WHERE i.confirmado = true
), purchase_pool AS (
  SELECT 'cliente:' || cliente_id::text AS cliente_key,
    COALESCE(SUM(CASE WHEN NOT incidencia THEN importe::numeric ELSE 0::numeric END), 0)::float8 AS compras_cliente,
    COALESCE(BOOL_OR(incidencia), false) AS incidencia
  FROM purchase_client_rows pcr
  JOIN facturas_recibidas fr ON fr.id = pcr.factura_id
  WHERE fr.fecha >= ${costStart} AND fr.fecha < ${costEnd}
  GROUP BY cliente_id
), staff_link_totals AS (
  SELECT v.imputacion_horas_id AS fuente_id,
    COALESCE(SUM(CASE WHEN v.porcentaje IS NOT NULL
        AND BTRIM(v.porcentaje::text) NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN v.porcentaje::numeric ELSE 0::numeric END), 0) AS porcentaje_total,
    BOOL_OR(v.porcentaje IS NULL OR BTRIM(v.porcentaje::text) IN ('NaN', 'Infinity', '-Infinity')
      OR v.porcentaje <= 0 OR v.porcentaje > 100) AS porcentaje_invalido,
    BOOL_OR(ih.id IS NULL) AS horas_huerfanas,
    BOOL_OR(fe.id IS NULL) AS factura_huerfana
  FROM vinculaciones_personal_facturas v
  LEFT JOIN imputaciones_horas ih ON ih.id = v.imputacion_horas_id
  LEFT JOIN facturas_emitidas fe ON fe.id = v.factura_emitida_id
  GROUP BY v.imputacion_horas_id
), staff_source AS (
  SELECT ih.id, ih.fecha, ih.horas::float8 AS horas, ih.coste_imputado::float8 AS coste_imputado,
    ih.empresa_grupo, ih.cliente_id_imp AS cliente_explicito_id, p.cliente_id AS cliente_proyecto_id,
    e.nombre_completo AS empleado,
    CASE WHEN ih.cliente_id_imp IS NOT NULL AND p.cliente_id IS NOT NULL AND ih.cliente_id_imp <> p.cliente_id THEN NULL
      WHEN ih.cliente_id_imp IS NOT NULL THEN ih.cliente_id_imp ELSE p.cliente_id END AS cliente_id,
    (ih.cliente_id_imp IS NOT NULL AND p.cliente_id IS NOT NULL AND ih.cliente_id_imp <> p.cliente_id) AS cliente_contradictorio,
    CASE WHEN ih.coste_imputado IS NOT NULL
        AND BTRIM(ih.coste_imputado::text) NOT IN ('NaN', 'Infinity', '-Infinity')
      THEN ROUND(ih.coste_imputado::numeric * 100)::bigint ELSE 0::bigint END AS coste_centimos
  FROM imputaciones_horas ih
  JOIN empleados e ON e.id = ih.empleado_id
  LEFT JOIN proyectos p ON p.id = ih.proyecto_id
), all_sales AS (
  SELECT all_sales_identity.id, all_sales_identity.cliente_web_id
  FROM (${clientIdentity}) all_sales_identity
  JOIN facturas_emitidas all_fe ON all_fe.id = all_sales_identity.id
  WHERE all_fe.estado::text NOT IN ('ANULADA', 'BORRADOR')
), staff_link_raw AS (
  SELECT v.factura_emitida_id, v.id, v.imputacion_horas_id AS fuente_id, ss.empleado, ss.fecha,
    ss.horas, ss.coste_imputado, v.porcentaje::float8 AS porcentaje, v.notas, ss.coste_centimos,
    COALESCE(slt.porcentaje_total, 0) AS porcentaje_total,
    (COALESCE(slt.porcentaje_invalido, false) OR COALESCE(slt.porcentaje_total, 0) > 100
      OR COALESCE(slt.horas_huerfanas, false) OR COALESCE(slt.factura_huerfana, false) OR ss.id IS NULL
      OR BTRIM(COALESCE(ss.empresa_grupo, '')) <> 'INTERNET OPERADORES'
      OR ss.coste_imputado IS NULL OR BTRIM(ss.coste_imputado::text) IN ('NaN', 'Infinity', '-Infinity')
      OR ss.coste_imputado < 0 OR ss.horas IS NULL OR BTRIM(ss.horas::text) IN ('NaN', 'Infinity', '-Infinity')
      OR ss.horas <= 0 OR ss.cliente_contradictorio) AS fuente_incidencia,
    (COALESCE(slt.porcentaje_invalido, false) OR COALESCE(slt.porcentaje_total, 0) > 100
      OR COALESCE(slt.horas_huerfanas, false) OR COALESCE(slt.factura_huerfana, false) OR ss.id IS NULL
      OR BTRIM(COALESCE(ss.empresa_grupo, '')) <> 'INTERNET OPERADORES'
      OR ss.coste_imputado IS NULL OR BTRIM(ss.coste_imputado::text) IN ('NaN', 'Infinity', '-Infinity')
      OR ss.coste_imputado < 0 OR ss.horas IS NULL OR BTRIM(ss.horas::text) IN ('NaN', 'Infinity', '-Infinity')
      OR ss.horas <= 0 OR ss.cliente_contradictorio
      OR gs.id IS NULL OR gs.cliente_web_id IS NULL OR ss.cliente_id IS DISTINCT FROM gs.cliente_web_id) AS incidencia,
    CASE WHEN v.porcentaje IS NOT NULL AND BTRIM(v.porcentaje::text) NOT IN ('NaN', 'Infinity', '-Infinity')
      THEN v.porcentaje::numeric ELSE 0::numeric END AS porcentaje_numerico
  FROM vinculaciones_personal_facturas v
  LEFT JOIN staff_source ss ON ss.id = v.imputacion_horas_id
  LEFT JOIN staff_link_totals slt ON slt.fuente_id = v.imputacion_horas_id
  LEFT JOIN all_sales gs ON gs.id = v.factura_emitida_id
), staff_link_floors AS (
  SELECT *,
    CASE WHEN fuente_incidencia THEN 0::bigint
      ELSE FLOOR(coste_centimos::numeric * porcentaje_numerico / 100)::bigint END AS coste_centimos_base,
    CASE WHEN fuente_incidencia THEN 0::numeric
      ELSE coste_centimos::numeric * porcentaje_numerico / 100
        - FLOOR(coste_centimos::numeric * porcentaje_numerico / 100) END AS resto,
    SUM(CASE WHEN fuente_incidencia THEN 0::bigint
      ELSE FLOOR(coste_centimos::numeric * porcentaje_numerico / 100)::bigint END)
      OVER (PARTITION BY fuente_id) AS centimos_suelo
  FROM staff_link_raw
), staff_link_allocations AS (
  SELECT *,
    GREATEST(0::numeric, LEAST(coste_centimos::numeric,
      ROUND(coste_centimos::numeric * porcentaje_total / 100)) - centimos_suelo) AS centimos_repartir,
    ROW_NUMBER() OVER (PARTITION BY fuente_id ORDER BY resto DESC, id ASC) AS orden_resto
  FROM staff_link_floors
), staff_links_global AS (
  SELECT *, CASE WHEN incidencia THEN 0::bigint ELSE coste_centimos_base +
    CASE WHEN orden_resto <= centimos_repartir THEN 1::bigint ELSE 0::bigint END END AS coste_asignado_centimos
  FROM staff_link_allocations
), staff_global_allocations AS (
  SELECT fuente_id, COALESCE(SUM(coste_asignado_centimos), 0)::bigint AS coste_asignado_centimos,
    COALESCE(BOOL_OR(incidencia), false) AS incidencia
  FROM staff_links_global
  GROUP BY fuente_id
), staff_links AS (
  SELECT slg.*, (slg.coste_asignado_centimos::float8 / 100)::float8 AS coste
  FROM staff_links_global slg
  JOIN sales s ON s.id = slg.factura_emitida_id
), staff_invoice AS (
  SELECT factura_emitida_id,
    COALESCE(SUM(coste_asignado_centimos::float8 / 100), 0)::float8 AS personal_directo,
    COUNT(*) FILTER (WHERE NOT incidencia)::int AS num_horas,
    COALESCE(BOOL_OR(incidencia), false) AS incidencia
  FROM staff_links
  GROUP BY factura_emitida_id
), staff_pool AS (
  SELECT 'cliente:' || ss.cliente_id::text AS cliente_key,
    COALESCE(SUM(CASE WHEN COALESCE(slt.porcentaje_invalido, false)
          OR COALESCE(slt.porcentaje_total, 0) > 100 OR COALESCE(slt.horas_huerfanas, false)
          OR COALESCE(slt.factura_huerfana, false) OR ss.coste_imputado IS NULL
          OR BTRIM(ss.coste_imputado::text) IN ('NaN', 'Infinity', '-Infinity') OR ss.coste_imputado < 0
          OR ss.horas IS NULL OR BTRIM(ss.horas::text) IN ('NaN', 'Infinity', '-Infinity') OR ss.horas <= 0
          OR ss.cliente_contradictorio THEN 0::numeric
        ELSE (ss.coste_centimos - COALESCE(sga.coste_asignado_centimos, 0))::numeric / 100 END), 0)::float8 AS personal_cliente,
    COALESCE(BOOL_OR(COALESCE(slt.porcentaje_invalido, false) OR COALESCE(slt.porcentaje_total, 0) > 100
      OR COALESCE(slt.horas_huerfanas, false) OR COALESCE(slt.factura_huerfana, false)
      OR ss.coste_imputado IS NULL OR BTRIM(ss.coste_imputado::text) IN ('NaN', 'Infinity', '-Infinity')
      OR ss.coste_imputado < 0 OR ss.horas IS NULL OR BTRIM(ss.horas::text) IN ('NaN', 'Infinity', '-Infinity')
      OR ss.horas <= 0 OR ss.cliente_contradictorio OR COALESCE(sga.incidencia, false)), false) AS incidencia
  FROM staff_source ss
  LEFT JOIN staff_link_totals slt ON slt.fuente_id = ss.id
  LEFT JOIN staff_global_allocations sga ON sga.fuente_id = ss.id
  WHERE ss.fecha >= ${costStart} AND ss.fecha < ${costEnd}
    AND BTRIM(COALESCE(ss.empresa_grupo, '')) = 'INTERNET OPERADORES'
    AND ss.cliente_id IS NOT NULL AND NOT ss.cliente_contradictorio
  GROUP BY ss.cliente_id
), invoice_metrics AS (
  SELECT s.*, COALESCE(pi.compras_directas, 0)::float8 AS compras_directas,
    COALESCE(si.personal_directo, 0)::float8 AS personal_directo,
    COALESCE(pi.num_compras, 0)::int AS num_compras, COALESCE(si.num_horas, 0)::int AS num_horas,
    COALESCE(pi.incidencia, false) OR COALESCE(si.incidencia, false) AS incidencia,
    (s.ventas - COALESCE(pi.compras_directas, 0) - COALESCE(si.personal_directo, 0))::float8 AS margen_conocido
  FROM sales s
  LEFT JOIN purchase_invoice pi ON pi.factura_emitida_id = s.id
  LEFT JOIN staff_invoice si ON si.factura_emitida_id = s.id
), invoice_rollups AS (
  SELECT cliente_key, MIN(cliente_label) AS label, MIN(cliente_web_id) AS cliente_web_id,
    COALESCE(SUM(ventas), 0)::float8 AS ventas, COALESCE(SUM(compras_directas), 0)::float8 AS compras_directas,
    COALESCE(SUM(personal_directo), 0)::float8 AS personal_directo,
    COUNT(*)::int AS total_facturas,
    COUNT(*) FILTER (WHERE num_compras + num_horas = 0)::int AS sin_coste_directo,
    COUNT(*) FILTER (WHERE incidencia)::int AS incidencias
  FROM invoice_metrics
  GROUP BY cliente_key
), client_rollups AS (
  SELECT ir.*, COALESCE(pp.compras_cliente, 0)::float8 AS compras_cliente,
    COALESCE(sp.personal_cliente, 0)::float8 AS personal_cliente,
    (ir.incidencias + CASE WHEN COALESCE(pp.incidencia, false) OR COALESCE(sp.incidencia, false) THEN 1 ELSE 0 END)::int AS incidencias_totales,
    (ir.ventas - ir.compras_directas - ir.personal_directo - COALESCE(pp.compras_cliente, 0) - COALESCE(sp.personal_cliente, 0))::float8 AS margen_conocido
  FROM invoice_rollups ir
  LEFT JOIN purchase_pool pp ON pp.cliente_key = ir.cliente_key
  LEFT JOIN staff_pool sp ON sp.cliente_key = ir.cliente_key
), service_components AS (
  SELECT c.factura_emitida_id,
    c.tipo AS service_key,
    COALESCE(SUM(c.base), 0)::numeric AS ventas_componente
  FROM componentes_venta_servicio c
  WHERE c.tipo IN ('PROYECTO', 'TELECO_INTERMEDIACION', 'TELECO_RED_PROPIA')
  GROUP BY c.factura_emitida_id, c.tipo
), service_component_totals AS (
  SELECT im.id AS factura_emitida_id,
    COALESCE(SUM(sc.ventas_componente), 0)::numeric AS ventas_desglosadas,
    COUNT(DISTINCT sc.service_key)::int AS tipos_desglosados,
    MIN(sc.service_key) AS tipo_homogeneo,
    COALESCE(SUM(sc.ventas_componente), 0)::numeric = ROUND(im.ventas::numeric, 2) AS desglose_completo
  FROM invoice_metrics im
  LEFT JOIN service_components sc ON sc.factura_emitida_id = im.id
  GROUP BY im.id, im.ventas
), service_invoice_metrics AS (
  SELECT im.id, im.num_factura, im.cliente_label, im.cliente_key, im.cliente_web_id, im.fecha, im.concepto, im.actividad,
    sc.service_key, ROUND(sc.ventas_componente, 2)::float8 AS ventas,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN im.compras_directas ELSE 0::float8 END AS compras_directas,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN im.personal_directo ELSE 0::float8 END AS personal_directo,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN im.num_compras ELSE 0 END AS num_compras,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN im.num_horas ELSE 0 END AS num_horas,
    im.incidencia OR NOT (sct.desglose_completo AND sct.tipos_desglosados = 1) AS incidencia,
    (NOT (sct.desglose_completo AND sct.tipos_desglosados = 1)
      AND (im.compras_directas <> 0 OR im.personal_directo <> 0)) AS pendiente_reparto
  FROM invoice_metrics im
  JOIN service_components sc ON sc.factura_emitida_id = im.id
  JOIN service_component_totals sct ON sct.factura_emitida_id = im.id
  UNION ALL
  SELECT im.id, im.num_factura, im.cliente_label, im.cliente_key, im.cliente_web_id, im.fecha, im.concepto, im.actividad,
    '__SIN_DESGLOSE__' AS service_key,
    ROUND((im.ventas::numeric - sct.ventas_desglosadas), 2)::float8 AS ventas,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN 0::float8 ELSE im.compras_directas END AS compras_directas,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN 0::float8 ELSE im.personal_directo END AS personal_directo,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN 0 ELSE im.num_compras END AS num_compras,
    CASE WHEN sct.desglose_completo AND sct.tipos_desglosados = 1 THEN 0 ELSE im.num_horas END AS num_horas,
    im.incidencia OR NOT (sct.desglose_completo AND sct.tipos_desglosados = 1) AS incidencia,
    (NOT (sct.desglose_completo AND sct.tipos_desglosados = 1)
      AND (im.compras_directas <> 0 OR im.personal_directo <> 0)) AS pendiente_reparto
  FROM invoice_metrics im
  JOIN service_component_totals sct ON sct.factura_emitida_id = im.id
  WHERE ROUND((im.ventas::numeric - sct.ventas_desglosadas), 2) <> 0
    OR (NOT (sct.desglose_completo AND sct.tipos_desglosados = 1)
      AND (im.compras_directas <> 0 OR im.personal_directo <> 0))
), service_invoice_rollups AS (
  SELECT service_key, cliente_key, MIN(cliente_label) AS label, MIN(cliente_web_id) AS cliente_web_id,
    COALESCE(SUM(ventas), 0)::float8 AS ventas, COALESCE(SUM(compras_directas), 0)::float8 AS compras_directas,
    COALESCE(SUM(personal_directo), 0)::float8 AS personal_directo, COUNT(DISTINCT id)::int AS total_facturas,
    COUNT(DISTINCT id) FILTER (WHERE num_compras + num_horas = 0)::int AS sin_coste_directo,
    COUNT(DISTINCT id) FILTER (WHERE incidencia)::int AS incidencias,
    COALESCE(BOOL_OR(pendiente_reparto), false) AS pendiente_reparto
  FROM service_invoice_metrics
  GROUP BY service_key, cliente_key
), service_client_rollups AS (
  SELECT sir.*, COALESCE(pp.compras_cliente, 0)::float8 AS compras_cliente,
    COALESCE(sp.personal_cliente, 0)::float8 AS personal_cliente,
    (sir.ventas - sir.compras_directas - sir.personal_directo -
      CASE WHEN sir.service_key = '__SIN_DESGLOSE__' THEN COALESCE(pp.compras_cliente, 0) ELSE 0 END -
      CASE WHEN sir.service_key = '__SIN_DESGLOSE__' THEN COALESCE(sp.personal_cliente, 0) ELSE 0 END)::float8 AS margen_conocido
  FROM service_invoice_rollups sir
  LEFT JOIN purchase_pool pp ON pp.cliente_key = sir.cliente_key AND sir.service_key = '__SIN_DESGLOSE__'
  LEFT JOIN staff_pool sp ON sp.cliente_key = sir.cliente_key AND sir.service_key = '__SIN_DESGLOSE__'
), service_pool_only AS (
  SELECT '__SIN_DESGLOSE__'::text AS service_key, s.cliente_key, s.cliente_label AS label, s.cliente_web_id,
    0::float8 AS ventas, 0::float8 AS compras_directas, 0::float8 AS personal_directo, 0::int AS total_facturas,
    0::int AS sin_coste_directo, 1::int AS incidencias, true AS pendiente_reparto,
    COALESCE(pp.compras_cliente, 0)::float8 AS compras_cliente, COALESCE(sp.personal_cliente, 0)::float8 AS personal_cliente,
    (-COALESCE(pp.compras_cliente, 0) - COALESCE(sp.personal_cliente, 0))::float8 AS margen_conocido
  FROM (SELECT DISTINCT cliente_key, cliente_label, cliente_web_id FROM sales) s
  LEFT JOIN service_client_rollups scr ON scr.cliente_key = s.cliente_key AND scr.service_key = '__SIN_DESGLOSE__'
  LEFT JOIN purchase_pool pp ON pp.cliente_key = s.cliente_key
  LEFT JOIN staff_pool sp ON sp.cliente_key = s.cliente_key
  WHERE scr.cliente_key IS NULL AND (COALESCE(pp.compras_cliente, 0) <> 0 OR COALESCE(sp.personal_cliente, 0) <> 0)
), service_client_all AS (
  SELECT * FROM service_client_rollups
  UNION ALL SELECT * FROM service_pool_only
), service_rollups AS (
  SELECT service_key,
    COALESCE(SUM(ventas), 0)::float8 AS ventas, COALESCE(SUM(compras_directas), 0)::float8 AS compras_directas,
    COALESCE(SUM(compras_cliente), 0)::float8 AS compras_cliente, COALESCE(SUM(personal_directo), 0)::float8 AS personal_directo,
    COALESCE(SUM(personal_cliente), 0)::float8 AS personal_cliente, COALESCE(SUM(margen_conocido), 0)::float8 AS margen_conocido,
    COALESCE(SUM(total_facturas), 0)::int AS total_facturas, COALESCE(SUM(sin_coste_directo), 0)::int AS sin_coste_directo,
    COALESCE(SUM(incidencias), 0)::int AS incidencias, COALESCE(BOOL_OR(pendiente_reparto), false) AS pendiente_reparto
  FROM service_client_all
  GROUP BY service_key
)`;
}

/** The selected invoice's recognised direct costs; customer pools deliberately remain outside this result. */
export const invoiceColumns = Prisma.sql`
  id, num_factura AS "numFactura", cliente_label AS cliente, fecha, concepto, actividad,
  ventas::float8 AS ventas, compras_directas::float8 AS "comprasDirectas", personal_directo::float8 AS "personalDirecto",
  margen_conocido::float8 AS "margenConocido",
  CASE WHEN num_compras + num_horas = 0 OR incidencia OR ventas = 0 THEN NULL
    ELSE ROUND((100 * margen_conocido / ventas)::numeric, 2)::float8 END AS "margenPct",
  num_compras AS "numCompras", num_horas AS "numHoras",
  CASE WHEN incidencia THEN 'incidencia' WHEN num_compras + num_horas = 0 THEN 'sin_costes' ELSE 'provisional' END AS calidad`;

export const clientColumns = Prisma.sql`
  cliente_key AS key, label, cliente_web_id AS "clienteWebId", ventas::float8 AS ventas,
  compras_directas::float8 AS "comprasDirectas", compras_cliente::float8 AS "comprasCliente",
  personal_directo::float8 AS "personalDirecto", personal_cliente::float8 AS "personalCliente",
  margen_conocido::float8 AS "margenConocido",
  CASE WHEN sin_coste_directo > 0 OR incidencias_totales > 0 OR ventas = 0 THEN NULL
    ELSE ROUND((100 * margen_conocido / ventas)::numeric, 2)::float8 END AS "margenPct",
  total_facturas AS "totalFacturas", sin_coste_directo AS "sinCosteDirecto", incidencias_totales AS incidencias`;

export const kpiColumns = Prisma.sql`
  COALESCE(SUM(ventas), 0)::float8 AS ventas,
  COALESCE(SUM(compras_directas), 0)::float8 AS "comprasDirectas",
  COALESCE(SUM(compras_cliente), 0)::float8 AS "comprasCliente",
  COALESCE(SUM(personal_directo), 0)::float8 AS "personalDirecto",
  COALESCE(SUM(personal_cliente), 0)::float8 AS "personalCliente",
  COALESCE(SUM(margen_conocido), 0)::float8 AS "margenConocido",
  CASE WHEN COALESCE(SUM(sin_coste_directo), 0) > 0 OR COALESCE(SUM(incidencias_totales), 0) > 0 OR COALESCE(SUM(ventas), 0) = 0 THEN NULL
    ELSE ROUND((100 * SUM(margen_conocido) / SUM(ventas))::numeric, 2)::float8 END AS "margenPct",
  COALESCE(SUM(total_facturas), 0)::int AS "totalFacturas",
  COALESCE(SUM(sin_coste_directo), 0)::int AS "sinCosteDirecto",
  COALESCE(SUM(incidencias_totales), 0)::int AS incidencias`;

export const serviceColumns = Prisma.sql`
  service_key AS key,
  CASE service_key
    WHEN 'PROYECTO' THEN 'Proyectos'
    WHEN 'TELECO_INTERMEDIACION' THEN 'Teleco · Intermediación'
    WHEN 'TELECO_RED_PROPIA' THEN 'Teleco · Red propia'
    ELSE 'Sin desglose de servicio' END AS label,
  ventas::float8 AS ventas, compras_directas::float8 AS "comprasDirectas", compras_cliente::float8 AS "comprasCliente",
  personal_directo::float8 AS "personalDirecto", personal_cliente::float8 AS "personalCliente",
  margen_conocido::float8 AS "margenConocido",
  CASE WHEN sin_coste_directo > 0 OR incidencias > 0 OR pendiente_reparto OR ventas = 0 THEN NULL
    ELSE ROUND((100 * margen_conocido / ventas)::numeric, 2)::float8 END AS "margenPct",
  total_facturas AS "totalFacturas", sin_coste_directo AS "sinCosteDirecto", incidencias,
  pendiente_reparto AS "pendienteReparto"`;

export const serviceInvoiceColumns = Prisma.sql`
  id, num_factura AS "numFactura", cliente_label AS cliente, fecha, concepto, actividad,
  ventas::float8 AS ventas, compras_directas::float8 AS "comprasDirectas", personal_directo::float8 AS "personalDirecto",
  (ventas - compras_directas - personal_directo)::float8 AS "margenConocido",
  CASE WHEN num_compras + num_horas = 0 OR incidencia OR pendiente_reparto OR ventas = 0 THEN NULL
    ELSE ROUND((100 * (ventas - compras_directas - personal_directo) / ventas)::numeric, 2)::float8 END AS "margenPct",
  num_compras AS "numCompras", num_horas AS "numHoras",
  CASE WHEN incidencia OR pendiente_reparto THEN 'incidencia' WHEN num_compras + num_horas = 0 THEN 'sin_costes' ELSE 'provisional' END AS calidad`;

/** Pending sources are counted separately so an unmatched cost never silently vanishes from the analysis. */
export function pendingCTE(filters: ProfitFilters): Prisma.Sql {
  const start = new Date(`${filters.desde}T00:00:00.000Z`);
  const end = endOfProfitDay(filters.hasta);
  return Prisma.sql`
WITH selected_sales AS (
  SELECT DISTINCT cliente_web_id FROM (${clientIdentity}
    WHERE fe.estado::text NOT IN ('ANULADA', 'BORRADOR')
      AND fe.fecha >= ${start} AND fe.fecha < ${end}) x
), purchase_link_state AS (
  SELECT v.factura_recibida_id AS fuente_id,
    COALESCE(SUM(CASE WHEN v.porcentaje IS NOT NULL
        AND BTRIM(v.porcentaje::text) NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN v.porcentaje::numeric ELSE 0::numeric END), 0) AS porcentaje_total,
    BOOL_OR(v.porcentaje IS NULL OR BTRIM(v.porcentaje::text) IN ('NaN', 'Infinity', '-Infinity')
      OR v.porcentaje <= 0 OR v.porcentaje > 100) AS porcentaje_invalido,
    BOOL_OR(fe.id IS NULL) AS venta_huerfana
  FROM vinculaciones_facturas v
  LEFT JOIN facturas_emitidas fe ON fe.id = v.factura_emitida_id
  GROUP BY v.factura_recibida_id
), purchase_client_state AS (
  SELECT i.factura_id AS fuente_id,
    BOOL_OR(i.cliente_id IS NULL OR i.importe IS NULL OR BTRIM(i.importe::text) IN ('NaN', 'Infinity', '-Infinity')
      OR fr.base IS NULL OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity')) AS importe_invalido,
    BOOL_OR(CASE WHEN i.importe IS NULL OR BTRIM(i.importe::text) IN ('NaN', 'Infinity', '-Infinity')
          OR fr.base IS NULL OR BTRIM(fr.base::text) IN ('NaN', 'Infinity', '-Infinity') THEN false
      WHEN (fr.base > 0 AND i.importe < 0) OR (fr.base < 0 AND i.importe > 0)
        OR (fr.base = 0 AND i.importe <> 0) THEN true ELSE false END) AS signo_invalido,
    ABS(COALESCE(SUM(CASE WHEN i.importe IS NOT NULL
        AND BTRIM(i.importe::text) NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN i.importe::numeric ELSE 0::numeric END), 0))
      > ABS(COALESCE(MAX(CASE WHEN fr.base IS NOT NULL
          AND BTRIM(fr.base::text) NOT IN ('NaN', 'Infinity', '-Infinity')
          THEN fr.base::numeric ELSE NULL END), 0)) + 0.005 AS sobreasignado
  FROM imputaciones_coste_cliente i
  JOIN facturas_recibidas fr ON fr.id = i.factura_id
  WHERE i.confirmado = true
  GROUP BY i.factura_id
), purchase_conflicts AS (
  SELECT fr.id AS fuente_id
  FROM facturas_recibidas fr
  LEFT JOIN purchase_link_state pls ON pls.fuente_id = fr.id
  LEFT JOIN purchase_client_state pcs ON pcs.fuente_id = fr.id
  WHERE fr.fecha >= ${start} AND fr.fecha < ${end} AND fr.estado::text <> 'RECHAZADA'
    AND (COALESCE(pls.porcentaje_invalido, false) OR COALESCE(pls.porcentaje_total, 0) > 100
      OR COALESCE(pls.venta_huerfana, false) OR COALESCE(pcs.importe_invalido, false)
      OR COALESCE(pcs.signo_invalido, false) OR COALESCE(pcs.sobreasignado, false)
      OR (pls.fuente_id IS NOT NULL AND pcs.fuente_id IS NOT NULL))
), purchase_pending AS (
  SELECT fr.id
  FROM facturas_recibidas fr
  LEFT JOIN purchase_link_state pls ON pls.fuente_id = fr.id
  LEFT JOIN purchase_client_state pcs ON pcs.fuente_id = fr.id
  LEFT JOIN imputaciones_coste_cliente i ON i.factura_id = fr.id AND i.confirmado = true
  LEFT JOIN selected_sales ss ON ss.cliente_web_id = i.cliente_id
  WHERE fr.fecha >= ${start} AND fr.fecha < ${end} AND fr.estado::text <> 'RECHAZADA'
  GROUP BY fr.id
  HAVING (MAX(pls.fuente_id) IS NULL AND (COUNT(i.id) = 0 OR BOOL_OR(ss.cliente_web_id IS NULL)))
    OR (MAX(pls.fuente_id) IS NOT NULL AND COALESCE(MAX(pls.porcentaje_total), 0) < 100)
    OR COALESCE(BOOL_OR(pcs.importe_invalido OR pcs.signo_invalido OR pcs.sobreasignado), false)
    OR (MAX(pls.fuente_id) IS NULL
      AND ABS(COALESCE(SUM(CASE WHEN i.importe IS NOT NULL
          AND BTRIM(i.importe::text) NOT IN ('NaN', 'Infinity', '-Infinity')
          THEN i.importe::numeric ELSE 0::numeric END), 0))
        < ABS(MAX(fr.base::numeric)) - 0.005)
), staff_total AS (
  SELECT ih.id, ih.coste_imputado, ih.horas, ih.fecha, ih.empresa_grupo,
    ih.cliente_id_imp AS cliente_explicito, p.cliente_id AS cliente_proyecto,
    COALESCE(SUM(CASE WHEN v.porcentaje IS NOT NULL
        AND BTRIM(v.porcentaje::text) NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN v.porcentaje::numeric ELSE 0::numeric END), 0) AS porcentaje_total,
    BOOL_OR(v.id IS NOT NULL AND (v.porcentaje IS NULL OR BTRIM(v.porcentaje::text) IN ('NaN', 'Infinity', '-Infinity')
      OR v.porcentaje <= 0 OR v.porcentaje > 100)) AS porcentaje_invalido,
    BOOL_OR(v.id IS NOT NULL AND fe.id IS NULL) AS venta_huerfana,
    COUNT(v.id)::int AS enlaces
  FROM imputaciones_horas ih
  LEFT JOIN proyectos p ON p.id = ih.proyecto_id
  LEFT JOIN vinculaciones_personal_facturas v ON v.imputacion_horas_id = ih.id
  LEFT JOIN facturas_emitidas fe ON fe.id = v.factura_emitida_id
  WHERE ih.fecha >= ${start} AND ih.fecha < ${end}
  GROUP BY ih.id, ih.coste_imputado, ih.horas, ih.fecha, ih.empresa_grupo, ih.cliente_id_imp, p.cliente_id
), staff_pending AS (
  SELECT id FROM staff_total
  WHERE BTRIM(COALESCE(empresa_grupo, '')) = 'INTERNET OPERADORES'
    AND coste_imputado IS NOT NULL AND BTRIM(coste_imputado::text) NOT IN ('NaN', 'Infinity', '-Infinity')
    AND coste_imputado >= 0 AND horas > 0
    AND (enlaces = 0 OR porcentaje_total < 100 OR porcentaje_invalido OR venta_huerfana)
), hours_without_cost AS (
  SELECT id FROM staff_total
  WHERE BTRIM(COALESCE(empresa_grupo, '')) = 'INTERNET OPERADORES'
    AND horas > 0 AND (coste_imputado IS NULL OR BTRIM(coste_imputado::text) IN ('NaN', 'Infinity', '-Infinity') OR coste_imputado < 0)
)
SELECT (SELECT COUNT(*)::int FROM purchase_pending) AS "comprasSinVenta",
  (SELECT COUNT(*)::int FROM staff_pending) AS "personalSinVenta",
  (SELECT COUNT(*)::int FROM hours_without_cost) AS "horasSinCoste",
  (SELECT COUNT(*)::int FROM purchase_conflicts) AS conflictos`;
}

/** Identity CTE for candidates and write-time client checks, intentionally not restricted to a reporting period. */
export function saleIdentityCTE(facturaId: string): Prisma.Sql {
  return Prisma.sql`WITH target_sale AS (
    SELECT *, CASE WHEN cliente_web_id IS NULL THEN 'factura:' || id ELSE 'cliente:' || cliente_web_id::text END AS cliente_key
    FROM (${clientIdentity}) base
    WHERE id = ${facturaId} AND (SELECT estado::text FROM facturas_emitidas WHERE id = ${facturaId}) NOT IN ('ANULADA', 'BORRADOR')
  )`;
}
