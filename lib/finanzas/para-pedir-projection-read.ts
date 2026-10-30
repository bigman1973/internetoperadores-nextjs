import { Prisma, type PrismaClient } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  type ParaPedirAgrupacion,
  type ParaPedirEstadoFila,
  type ParaPedirInput,
  type ParaPedirMovimiento,
  type ParaPedirRead,
} from './para-pedir-contract';
import { projectionRow } from './conciliar-projection-read';

type Db = PrismaClient & Record<string, any>;
type QueryRow = Record<string, unknown>;
const db = () => prisma as Db;
const SIN_TERCERO_DOCUMENTAL = 'Sin tercero documental';

export class ParaPedirProjectionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
function fail(status: number, code: string, message: string): never {
  throw new ParaPedirProjectionError(status, code, message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
function jsonArray(value: unknown, field: string): QueryRow[] {
  const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value;
  if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    fail(409, 'PROYECCION_CORRUPTA', `${field} no conserva un resultado verificable.`);
  }
  return parsed as QueryRow[];
}
function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(409, 'PROYECCION_CORRUPTA', `${field} no conserva texto verificable.`);
  return value;
}
function nullableText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field, max);
}
function integer(value: unknown, field: string, nonNegative = false): number {
  const parsed = typeof value === 'bigint' ? Number(value) : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || (nonNegative && Number(parsed) < 0)) fail(409, 'PROYECCION_CORRUPTA', `${field} no conserva céntimos o conteos exactos.`);
  return Number(parsed);
}
function day(value: unknown, field: string): string {
  const parsed = text(value, field, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) fail(409, 'PROYECCION_CORRUPTA', `${field} no conserva una fecha verificable.`);
  const date = new Date(`${parsed}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== parsed) fail(409, 'PROYECCION_CORRUPTA', `${field} no conserva una fecha verificable.`);
  return parsed;
}
function estado(value: unknown): ParaPedirEstadoFila {
  if (value === 'SIN_PEDIR' || value === 'PEDIDO' || value === 'PEDIDO_SIN_AUDITORIA' || value === 'RECIBIDO') return value;
  fail(409, 'PROYECCION_CORRUPTA', 'La gestión B5 no conserva un estado de pedido verificable.');
}
function projectionTimestamp(value: unknown): string {
  const parsed = text(value, 'La proyección', 80);
  if (!Number.isFinite(new Date(parsed).getTime())) fail(503, 'PROYECCION_NO_PREPARADA', 'La proyección de Conciliar aún no tiene una fecha verificable.');
  return parsed;
}
function conciliarPedir(row: QueryRow, currentState: ParaPedirEstadoFila): ParaPedirMovimiento['conciliarPedir'] {
  // La acción se habilita sólo en una fila roja de la misma foto. projectionRow
  // recompone el hash cerrado que Conciliar volverá a validar en POST.
  if (currentState !== 'SIN_PEDIR' || row.conciliar_color !== 'ROJO') return null;
  const projected = projectionRow({
    id: row.conciliar_row_id, movimiento_id: row.movimiento_id, tab: row.tab, fecha: row.fecha,
    concepto: row.concepto, banco: row.banco, cuenta: row.cuenta, importe_centimos: row.importe_centimos,
    pendiente_centimos: row.pendiente_centimos, color: row.conciliar_color, grupo: row.conciliar_grupo,
    motivo: row.motivo, documento: row.conciliar_documento, propuesta: row.conciliar_propuesta,
    seleccionable: row.conciliar_seleccionable, diferencia_centimos: row.conciliar_diferencia_centimos,
    links_movimiento: row.conciliar_links_movimiento, detail: row.conciliar_detail, source: row.conciliar_source,
    source_fingerprint: row.conciliar_source_fingerprint, updated_at: row.conciliar_updated_at,
  });
  if (projected.movimientoId !== row.movimiento_id || projected.color !== 'ROJO') {
    fail(409, 'PROYECCION_CORRUPTA', 'La fila de Conciliar no conserva una acción de pedir verificable.');
  }
  return { rowId: projected.id, decisionHash: projected.decisionHash };
}

function stateFilter(input: ParaPedirInput): Prisma.Sql {
  if (input.estado === 'SIN_PEDIR') return Prisma.sql`(s.gestion_estado IS NULL OR s.gestion_estado='PENDIENTE')`;
  if (input.estado === 'PEDIDO') return Prisma.sql`s.gestion_estado='PEDIDO'`;
  if (input.estado === 'PEDIDO_MAS_15_DIAS') return Prisma.sql`s.gestion_estado='PEDIDO' AND s.pedido_dia IS NOT NULL AND s.pedido_dia < CURRENT_DATE - 15`;
  return Prisma.sql`TRUE`;
}
function filters(input: ParaPedirInput): Prisma.Sql {
  const clauses: Prisma.Sql[] = [stateFilter(input)];
  if (input.q) {
    // La búsqueda es literal: los comodines entregados por el usuario no amplían la consulta.
    const pattern = `%${input.q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    clauses.push(Prisma.sql`(
      s.concepto ILIKE ${pattern} OR COALESCE(s.tercero,'') ILIKE ${pattern}
      OR COALESCE(s.referencia_documento,'') ILIKE ${pattern} OR COALESCE(s.banco,'') ILIKE ${pattern}
      OR COALESCE(s.cuenta,'') ILIKE ${pattern}
    )`);
  }
  if (input.tercero) clauses.push(Prisma.sql`s.grupo_tercero=${input.tercero}`);
  return Prisma.join(clauses, ' AND ');
}

/**
 * Lee una foto ya reconstruida. No toca fuentes B4, no genera candidatos, no
 * crea documentos y no programa refreshes. La deduplicación por movimiento se
 * limita a COBROS/PAGOS: las filas EMITIDAS pueden referenciar el mismo cobro.
 */
export async function readParaPedirProjection(input: ParaPedirInput, client: Pick<Db, '$queryRaw'> = db()): Promise<ParaPedirRead> {
  const shared = filters(input);
  const result = await client.$queryRaw<Array<{
    rows: unknown;
    total: unknown;
    groups: unknown;
    summary: unknown;
    state: unknown;
  }>>(Prisma.sql`
    WITH projection_base AS (
      SELECT DISTINCT ON (p.movimiento_id)
        p.movimiento_id,p.tab,p.fecha::date::text AS fecha,p.concepto,p.banco,p.cuenta,
        p.importe_centimos,p.pendiente_centimos,p.motivo,
        p.id AS conciliar_row_id,p.color AS conciliar_color,p.grupo AS conciliar_grupo,
        p.documento AS conciliar_documento,p.propuesta AS conciliar_propuesta,p.seleccionable AS conciliar_seleccionable,
        p.diferencia_centimos AS conciliar_diferencia_centimos,p.links_movimiento AS conciliar_links_movimiento,
        p.detail AS conciliar_detail,p.source AS conciliar_source,p.source_fingerprint AS conciliar_source_fingerprint,
        p.updated_at AS conciliar_updated_at,
        COALESCE(NULLIF(btrim(p.documento->>'tercero'),''),NULLIF(btrim(m.tercero),'')) AS tercero,
        NULLIF(btrim(p.documento->>'referencia'),'') AS referencia_documento,
        COALESCE(NULLIF(btrim(p.documento->>'tercero'),''),NULLIF(btrim(m.tercero),''),${SIN_TERCERO_DOCUMENTAL}) AS grupo_tercero
      FROM conciliar_proyecciones p
      JOIN movimientos_bancarios m ON m.id=p.movimiento_id
      WHERE p.movimiento_id IS NOT NULL AND p.tab IN ('COBROS','PAGOS')
        AND UPPER(COALESCE(p.grupo,'')) NOT IN ('TRASPASOS_PROPIOS','TRASPASOS ENTRE CUENTAS PROPIAS','GASTOS_BANCO','GASTOS DEL BANCO','COMISIONES','NOMINAS','NÓMINAS')
        AND NOT EXISTS (
          SELECT 1 FROM estado_justificacion_movimientos e
          WHERE e.movimiento_id=p.movimiento_id AND e.estado::text<>'SIN_DOCUMENTO'
        )
      ORDER BY p.movimiento_id,p.updated_at DESC,p.id ASC
    ), pedido_audit AS (
      SELECT DISTINCT ON (a.movimiento_id)
        a.movimiento_id,a.created_at::date AS pedido_dia,u.nombre AS actor_nombre
      FROM auditorias_gestiones_pendientes_b5 a
      JOIN projection_base b ON b.movimiento_id=a.movimiento_id
      LEFT JOIN usuarios_admin u ON u.id=a.actor_id
      WHERE a.snapshot_resultado->>'estado'='PEDIDO'
      ORDER BY a.movimiento_id,a.created_at DESC,a.id DESC
    ), scoped AS (
      SELECT b.*,
        g.estado::text AS gestion_estado,
        pa.pedido_dia,pa.actor_nombre,
        CASE
          WHEN g.estado::text='PEDIDO' AND pa.pedido_dia IS NOT NULL THEN 'PEDIDO'
          WHEN g.estado::text='PEDIDO' THEN 'PEDIDO_SIN_AUDITORIA'
          WHEN g.estado::text='RECIBIDO' THEN 'RECIBIDO'
          ELSE 'SIN_PEDIR'
        END AS estado_pedido,
        CASE WHEN g.estado::text='PEDIDO' AND pa.pedido_dia IS NOT NULL
          THEN (CURRENT_DATE-pa.pedido_dia)::int ELSE NULL END AS dias_pedido
      FROM projection_base b
      LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=b.movimiento_id
      LEFT JOIN pedido_audit pa ON pa.movimiento_id=b.movimiento_id
    ), filtered AS (
      SELECT * FROM scoped s WHERE ${shared}
    ), page AS (
      SELECT * FROM filtered
      ORDER BY abs(pendiente_centimos::bigint) DESC,fecha DESC,movimiento_id ASC
      LIMIT ${input.limit} OFFSET ${input.offset}
    ), grouped AS (
      SELECT grupo_tercero AS tercero,COUNT(*)::text AS movimientos,
        COALESCE(SUM(abs(pendiente_centimos::bigint)),0)::text AS pendiente_centimos,
        COUNT(*) FILTER (WHERE estado_pedido='PEDIDO')::text AS pedidos,
        COUNT(*) FILTER (WHERE estado_pedido='PEDIDO' AND pedido_dia < CURRENT_DATE-15)::text AS pedidos_mas_15_dias
      FROM filtered
      GROUP BY grupo_tercero
    ), summary AS (
      SELECT COUNT(*)::text AS movimientos,COALESCE(SUM(abs(pendiente_centimos::bigint)),0)::text AS pendiente_centimos
      FROM filtered
    ), state AS (
      SELECT rebuilt_at AS actualizada_en,projection_version,dirty_at IS NOT NULL AS pendiente_actualizacion
      FROM estado_proyeccion_conciliar WHERE singleton=true LIMIT 1
    )
    SELECT
      COALESCE((SELECT json_agg(row_to_json(page) ORDER BY abs(pendiente_centimos::bigint) DESC,fecha DESC,movimiento_id ASC) FROM page),'[]'::json) AS rows,
      COALESCE((SELECT COUNT(*)::text FROM filtered),'0') AS total,
      COALESCE((SELECT json_agg(row_to_json(grouped) ORDER BY pendiente_centimos::bigint DESC,tercero ASC) FROM grouped),'[]'::json) AS groups,
      (SELECT row_to_json(summary) FROM summary) AS summary,
      (SELECT row_to_json(state) FROM state) AS state
  `);
  if (result.length !== 1) fail(503, 'PROYECCION_NO_DISPONIBLE', 'No se pudo leer la foto de Para pedir.');
  const bundle = result[0];
  const state = object(bundle.state);
  const updatedAt = projectionTimestamp(state.actualizada_en);
  const rows = jsonArray(bundle.rows, 'Las filas').map((row): ParaPedirMovimiento => {
    const currentState = estado(row.estado_pedido);
    const pedidoDay = row.pedido_dia === null || row.pedido_dia === undefined ? null : day(row.pedido_dia, 'La auditoría de pedido');
    const pedido = currentState === 'PEDIDO'
      ? pedidoDay === null
        ? fail(409, 'AUDITORIA_PEDIDO_INCOMPLETA', 'Un pedido no conserva su auditoría B5 verificable.')
        : { dia: pedidoDay, actorNombre: nullableText(row.actor_nombre, 'El actor de pedido', 300), diasTranscurridos: integer(row.dias_pedido, 'Los días de pedido', true) }
      : null;
    return {
      movimientoId: text(row.movimiento_id, 'El movimiento', 240),
      tab: row.tab === 'COBROS' || row.tab === 'PAGOS' ? row.tab : fail(409, 'PROYECCION_CORRUPTA', 'La fila no pertenece a un movimiento conciliable.'),
      fecha: day(row.fecha, 'La fecha del movimiento'),
      concepto: text(row.concepto, 'El concepto del movimiento', 1_600),
      banco: nullableText(row.banco, 'El banco', 320),
      cuenta: nullableText(row.cuenta, 'La cuenta', 320),
      tercero: nullableText(row.tercero, 'El tercero documental', 320),
      grupoTercero: text(row.grupo_tercero, 'El grupo de tercero', 320),
      referenciaDocumento: nullableText(row.referencia_documento, 'La referencia documental', 320),
      importeCentimos: integer(row.importe_centimos, 'El importe'),
      pendienteCentimos: integer(row.pendiente_centimos, 'El importe pendiente'),
      motivo: text(row.motivo, 'El motivo', 1_200),
      estadoPedido: currentState,
      pedido,
      conciliarPedir: conciliarPedir(row, currentState),
    };
  });
  const groups = jsonArray(bundle.groups, 'Las agrupaciones').map((row): ParaPedirAgrupacion => ({
    tercero: text(row.tercero, 'El tercero agrupado', 320),
    movimientos: integer(row.movimientos, 'El número de movimientos', true),
    pendienteCentimos: integer(row.pendiente_centimos, 'El pendiente agrupado'),
    pedidos: integer(row.pedidos, 'El número de pedidos', true),
    pedidosMas15Dias: integer(row.pedidos_mas_15_dias, 'El número de pedidos antiguos', true),
  }));
  const summary = object(bundle.summary);
  const total = integer(bundle.total, 'El total de movimientos', true);
  return {
    stagingOnly: false,
    automaticas: false,
    accionExterna: 'NINGUNA',
    criterio: 'Foto persistida de Conciliar para movimientos B4 sin documento; la lectura no reconstruye, no crea documentos, no envía comunicaciones ni sincroniza.',
    filtro: { estado: input.estado, q: input.q ?? null, tercero: input.tercero ?? null },
    total,
    limit: input.limit,
    offset: input.offset,
    totalPagina: rows.length,
    resumen: { movimientos: integer(summary.movimientos, 'El resumen de movimientos', true), pendienteCentimos: integer(summary.pendiente_centimos, 'El resumen pendiente') },
    proyeccion: {
      actualizadaEn: updatedAt,
      version: integer(state.projection_version, 'La versión de proyección', true),
      pendienteActualizacion: state.pendiente_actualizacion === true,
    },
    agrupaciones: groups,
    movimientos: rows,
  };
}
