import { Prisma } from '@prisma/client';
import { safeConciliarDocumentHref } from './conciliar-file-href';

export type ParaPedirRequestState = 'SIN_PEDIR' | 'PEDIDO' | 'PEDIDO_SIN_AUDITORIA' | 'RECIBIDO';
export type ParaPedirRequestMetadata = Readonly<{
  estadoPedido: ParaPedirRequestState;
  /** Sólo existe cuando una auditoría B5 inmutable acredita el resultado PEDIDO. */
  pedido: Readonly<{ fechaISO: string; actorVisible: string | null }> | null;
  /** Un adjunto completo es evidencia para revisión; nunca confirma B4 por sí solo. */
  documentoActual: Readonly<{
    soporteB5Completo: boolean;
    ticketB5Completo: boolean;
    requiereRevisionConfirmacion: true;
    vinculadoAutomaticamente: false;
    archivoHref?: string | null;
  }>;
}>;

type Tx = Prisma.TransactionClient & Record<string, any>;
type Row = Record<string, unknown>;
const MOVIMIENTO_ID = /^[A-Za-z0-9:_-]{1,240}$/;
const MAX_METADATA_MOVEMENTS = 100;

export class ParaPedirRequestMetadataError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}
function fail(status: number, code: string, message: string): never {
  throw new ParaPedirRequestMetadataError(status, code, message);
}
function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(409, 'B5_METADATA_CORRUPTA', `${field} no conserva una fecha de auditoría verificable.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(409, 'B5_METADATA_CORRUPTA', `${field} no conserva una fecha de auditoría verificable.`);
  return value;
}
function nullableName(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 300) fail(409, 'B5_METADATA_CORRUPTA', 'El actor de la auditoría B5 no conserva un nombre visible verificable.');
  return value;
}
function bool(value: unknown, field: string): boolean {
  if (value !== true && value !== false) fail(409, 'B5_METADATA_CORRUPTA', `${field} no conserva una bandera verificable.`);
  return value;
}

/**
 * Metadatos para filas ya seleccionadas por Conciliar. Una única SELECT agrupada
 * lee B5 y su auditoría inmutable; no actualiza gestión, no crea soporte ni cambia
 * B4. Un adjunto UPLOAD_COMPLETO solamente indica que procede revisión humana.
 */
export async function readParaPedirRequestMetadataTx(
  transaction: Prisma.TransactionClient,
  movimientoIds: readonly string[],
): Promise<ReadonlyMap<string, ParaPedirRequestMetadata>> {
  const ids = [...new Set(movimientoIds)].sort();
  if (ids.some((id) => !MOVIMIENTO_ID.test(id))) fail(400, 'MOVIMIENTO_INVALIDO', 'El identificador de movimiento no es válido para sus metadatos B5.');
  if (ids.length > MAX_METADATA_MOVEMENTS) fail(400, 'DEMASIADOS_MOVIMIENTOS', 'Los metadatos B5 se leen por páginas de hasta 100 movimientos.');
  if (!ids.length) return new Map();
  const tx = transaction as Tx;
  const rows = await tx.$queryRaw<Row[]>(Prisma.sql`
    WITH requested AS (
      SELECT DISTINCT m.id AS movimiento_id
      FROM movimientos_bancarios m
      WHERE m.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
    ), ultimo_pedido_auditado AS (
      SELECT DISTINCT ON (a.movimiento_id)
        a.movimiento_id,a.created_at::date::text AS pedido_fecha,u.nombre AS actor_visible
      FROM auditorias_gestiones_pendientes_b5 a
      JOIN requested r ON r.movimiento_id=a.movimiento_id
      LEFT JOIN usuarios_admin u ON u.id=a.actor_id
      WHERE a.snapshot_resultado->>'estado'='PEDIDO'
      ORDER BY a.movimiento_id,a.created_at DESC,a.id DESC
    ), adjuntos_actuales AS (
      SELECT a.movimiento_id,
        NOT BOOL_AND(NOT (a.estado::text='UPLOAD_COMPLETO' AND a.tipo_documento='SOPORTE')) AS soporte_b5_completo,
        NOT BOOL_AND(NOT (a.estado::text='UPLOAD_COMPLETO' AND a.tipo_documento='TICKET'
          AND a.gasto_id IS NOT NULL AND a.documento_conciliable_id IS NOT NULL)) AS ticket_b5_completo,
        MIN(CASE WHEN a.estado::text='UPLOAD_COMPLETO' AND a.tipo_documento IN ('TICKET','SOPORTE') THEN a.id::text ELSE NULL END) AS archivo_b5_id
      FROM adjuntos_pendientes_b5 a
      JOIN requested r ON r.movimiento_id=a.movimiento_id
      GROUP BY a.movimiento_id
    )
    SELECT r.movimiento_id,g.estado::text AS gestion_estado,p.pedido_fecha,p.actor_visible,
      COALESCE(a.soporte_b5_completo,false) AS soporte_b5_completo,
      COALESCE(a.ticket_b5_completo,false) AS ticket_b5_completo,a.archivo_b5_id
    FROM requested r
    LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id=r.movimiento_id
    LEFT JOIN ultimo_pedido_auditado p ON p.movimiento_id=r.movimiento_id
    LEFT JOIN adjuntos_actuales a ON a.movimiento_id=r.movimiento_id
    ORDER BY r.movimiento_id ASC
  `);
  return parseParaPedirRequestMetadataRows(rows);
}

/** Shared parser for the standalone reader and Conciliar's one-query bundle. */
export function parseParaPedirRequestMetadataRows(rows: readonly Row[]): ReadonlyMap<string, ParaPedirRequestMetadata> {
  const result = new Map<string, ParaPedirRequestMetadata>();
  for (const row of rows) {
    const movimientoId = typeof row.movimiento_id === 'string' && MOVIMIENTO_ID.test(row.movimiento_id)
      ? row.movimiento_id : fail(409, 'B5_METADATA_CORRUPTA', 'La consulta B5 no conserva la identidad de movimiento.');
    const gestion = row.gestion_estado === null || row.gestion_estado === undefined ? null : String(row.gestion_estado);
    const pedidoFecha = row.pedido_fecha === null || row.pedido_fecha === undefined ? null : date(row.pedido_fecha, 'La auditoría de pedido');
    const estadoPedido: ParaPedirRequestState = gestion === 'PEDIDO'
      ? pedidoFecha ? 'PEDIDO' : 'PEDIDO_SIN_AUDITORIA'
      : gestion === 'RECIBIDO' ? 'RECIBIDO'
        : 'SIN_PEDIR';
    const fileId = row.archivo_b5_id === null || row.archivo_b5_id === undefined ? null
      : typeof row.archivo_b5_id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(row.archivo_b5_id) ? row.archivo_b5_id
        : fail(409, 'B5_METADATA_CORRUPTA', 'El archivo recibido no conserva una identidad válida.');
    const archivoHref = fileId ? safeConciliarDocumentHref(`/api/admin/finanzas/movimientos/${encodeURIComponent(movimientoId)}/archivos?archivoId=${encodeURIComponent(`ADJUNTO_B5:${fileId}`)}`) : null;
    result.set(movimientoId, {
      estadoPedido,
      pedido: estadoPedido === 'PEDIDO' ? { fechaISO: pedidoFecha!, actorVisible: nullableName(row.actor_visible) } : null,
      documentoActual: {
        soporteB5Completo: bool(row.soporte_b5_completo, 'El soporte B5'),
        ticketB5Completo: bool(row.ticket_b5_completo, 'El ticket B5'),
        requiereRevisionConfirmacion: true,
        vinculadoAutomaticamente: false,
        archivoHref,
      },
    });
  }
  // La ausencia se conserva como desconocida del conjunto pedido: nunca se
  // sintetiza una gestión para un id que no exista o no haya sido devuelto.
  return result;
}

/** Permite a un lector de proyección conservar el estado seguro cuando no recibió metadatos B5. */
export function paraPedirRequestMetadataOrDefault(value: ParaPedirRequestMetadata | undefined): ParaPedirRequestMetadata {
  return value ?? {
    estadoPedido: 'SIN_PEDIR', pedido: null,
    documentoActual: { soporteB5Completo: false, ticketB5Completo: false, requiereRevisionConfirmacion: true, vinculadoAutomaticamente: false },
  };
}
