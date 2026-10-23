/*
 * B5 — adaptador de BD PROPUESTO; no está incorporado al repositorio.
 *
 * GET sólo proyecta: no hace DML, no crea wrappers B4, no inicializa estados y
 * no cambia cobros/pagos legacy. PATCH sólo cambia la gestión humana de un
 * movimiento que siga SIN_DOCUMENTO en B4. B4 conserva los vínculos y
 * NO_REQUIERE como única autoridad.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import {cardFromBankText,FINANCE_CARD_HOLDERS} from "@/lib/finanzas/card-holders";
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { readBankInvoicingPopulation, type B7ReadDatabase } from "@/lib/finanzas/bank-invoicing-db";
import type { InvoiceSettlement } from "@/lib/finanzas/bank-invoicing-core";

import {
  estadoEfectivoB5,
  pistaB6,
  porcentajeJustificadoBps,
  validarPatchGestionB5,
  type EstadoB4,
  type EstadoManualB5,
} from "@/lib/finanzas/pending-core";

type Tx = Prisma.TransactionClient & Record<string, any>;
type SqlRow = Record<string, unknown>;
const MAX_LIMIT = 100;
const MAX_OFFSET = 100_000;

export const VISTAS_PENDIENTES_B5 = [
  "CARGOS_SIN_DOCUMENTO",
  "COBROS_SIN_DOCUMENTO",
  "FACTURAS_RECIBIDAS_SIN_PAGO",
  "FACTURAS_EMITIDAS_SIN_COBRO",
] as const;
export type VistaPendientesB5 = (typeof VISTAS_PENDIENTES_B5)[number];
export type CoberturaB5 = "CUBIERTA" | "TODAS";

export class B5ServiceError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) { super(message); }
}
function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new B5ServiceError(status, code, message, details);
}
function asDb(): PrismaClient & Record<string, any> { return prisma as PrismaClient & Record<string, any>; }
function asTx(tx: Prisma.TransactionClient): Tx { return tx as Tx; }

type EmittedMetadataB5 = { id: string; cif: string | null; concepto: string | null };

/**
 * FACTURAS_EMITIDAS is a global FI population.  The B7 calculation only accepts
 * actual B4/B6 documentary proof; it does not and must not infer a bank account
 * for an unlinked FI.  Therefore this is deliberately reached only after the
 * existing cuentaId validation has rejected account-scoped invoice reads.
 */
function b7EmittedMatchesB5(invoice: InvoiceSettlement, metadata: EmittedMetadataB5 | undefined, options: ReadPendientesB5Options): boolean {
  if (invoice.paymentState === "COBRADA_CALCULADA") return false;
  const fecha = invoice.fechaISO;
  if (options.desde && (!fecha || fecha < options.desde.toISOString().slice(0, 10))) return false;
  if (options.hasta && (!fecha || fecha > options.hasta.toISOString().slice(0, 10))) return false;
  if (!options.q) return true;
  const needle = options.q.toLocaleLowerCase("es-ES");
  return [invoice.invoiceId, invoice.numFactura, invoice.cliente, metadata?.cif ?? null, metadata?.concepto ?? null]
    .some((value) => value !== null && value.toLocaleLowerCase("es-ES").includes(needle));
}

function b7EmittedOrder(left: InvoiceSettlement, right: InvoiceSettlement): number {
  // Keep B5's pending-first ordering without using abs() in any financial value.
  const leftAmount = left.remainingCents === null ? null : Math.abs(left.remainingCents);
  const rightAmount = right.remainingCents === null ? null : Math.abs(right.remainingCents);
  if (leftAmount !== null && rightAmount !== null && leftAmount !== rightAmount) return rightAmount - leftAmount;
  if (leftAmount !== null && rightAmount === null) return -1;
  if (leftAmount === null && rightAmount !== null) return 1;
  const leftDate = left.fechaISO ?? "9999-12-31";
  const rightDate = right.fechaISO ?? "9999-12-31";
  return leftDate.localeCompare(rightDate) || left.invoiceId.localeCompare(right.invoiceId);
}

function b7EmittedView(invoice: InvoiceSettlement, metadata: EmittedMetadataB5 | undefined) {
  const importeNoVerificable = invoice.targetCents === null
    || invoice.paidDocumentaryCents === null
    || invoice.remainingCents === null;
  const estadoCobroBancoEtiqueta = invoice.paymentState === "PENDIENTE_COBRO_REVISION"
    ? "Pendiente de cobro: requiere revisión bancaria"
    : invoice.paymentState === "PENDIENTE_COBRO"
      ? "Pendiente de cobro bancario"
      : "Cobrada calculada por banco";
  return {
    tipo: "FACTURA_EMITIDA" as const,
    id: invoice.invoiceId,
    // B7 may be paid by an explicitly audited B6 remittance.  There is then no
    // FI wrapper to expose as if it were the source document, so it stays null.
    documentoConciliableId: null as string | null,
    documentoConciliableNoInferido: true,
    referencia: invoice.numFactura,
    tercero: invoice.cliente ?? "SIN_CLIENTE_FUENTE",
    cliente: invoice.cliente,
    // Metadata comes only from the exact canonical FI id, never a client/CIF guess.
    cif: metadata?.cif ?? null,
    concepto: metadata?.concepto ?? null,
    fecha: invoice.fechaISO,
    fechaVencimiento: invoice.fechaVencimientoISO,
    // All are signed B7 cents.  Null explicitly means unknown/review, never zero.
    importeObjetivoCentimos: invoice.targetCents,
    importeAsignadoActivoCentimos: invoice.paidDocumentaryCents,
    importePendienteCentimos: invoice.remainingCents,
    importeNoVerificable,
    estadoCobroBanco: invoice.paymentState,
    estadoCobroBancoEtiqueta,
    fuentesCobroBanco: invoice.paymentSources,
    motivosRevisionBanco: invoice.reasons,
  };
}

async function readFacturasEmitidasPendientesB5(options: ReadPendientesB5Options, limit: number, offset: number) {
  return asDb().$transaction(async (base) => {
    const tx = asTx(base);
    // The staging guard was checked immediately before this transaction.  B7 runs
    // inside this caller-provided REPEATABLE READ snapshot and performs no DML.
    const population = await readBankInvoicingPopulation(tx as unknown as B7ReadDatabase, {
      enabled: true,
      assertIsolatedStaging: async () => undefined,
    });
    const ids = population.invoices.map((invoice) => invoice.invoiceId);
    const metadataRows = ids.length === 0 ? [] : await (tx as any).facturaEmitida.findMany({
      where: { id: { in: ids } },
      select: { id: true, cif: true, concepto: true },
    }) as EmittedMetadataB5[];
    const metadataById = new Map(metadataRows.map((row) => [row.id, row]));
    const matching = population.invoices
      .filter((invoice) => b7EmittedMatchesB5(invoice, metadataById.get(invoice.invoiceId), options))
      .sort(b7EmittedOrder);
    return {
      items: matching.slice(offset, offset + limit).map((invoice) => b7EmittedView(invoice, metadataById.get(invoice.invoiceId))),
      total: matching.length,
      bankCoverage: population.bankCoverage,
      calculationBasis: population.calculationBasis,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait:10000, timeout:60000 });
}

export type ReadPendientesB5Options = Readonly<{
  vista: VistaPendientesB5;
  limit?: number;
  offset?: number;
  cuentaId?: string;
  desde?: Date;
  hasta?: Date;
  q?: string;
  cobertura?: CoberturaB5;
  tarjeta?: string;
}>;

function boundedLimit(value: number | undefined): number {
  if (!Number.isInteger(value ?? 50) || (value ?? 50) < 1 || (value ?? 50) > MAX_LIMIT) {
    fail(400, "VALIDATION_ERROR", "limit debe ser un entero entre 1 y 100.");
  }
  return value ?? 50;
}
function boundedOffset(value: number | undefined): number {
  if (!Number.isInteger(value ?? 0) || (value ?? 0) < 0 || (value ?? 0) > MAX_OFFSET) {
    fail(400, "VALIDATION_ERROR", "offset debe ser un entero entre 0 y 100000.");
  }
  return value ?? 0;
}
function validText(value: string | undefined, name: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) fail(400, "VALIDATION_ERROR", `${name} no es válido.`);
  return normalized;
}

/** The B4 migration owns this exact conversion; no Float/Math.round fallback. */
const cents = (column: Prisma.Sql) => Prisma.sql`b4_importe_bancario_centimos(${column})`;

function movementFilter(options: ReadPendientesB5Options, alias = "m", accountAlias = "c"): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (options.cuentaId) parts.push(Prisma.sql`${Prisma.raw(alias)}.cuenta_id = ${options.cuentaId}`);
  if (options.desde) parts.push(Prisma.sql`${Prisma.raw(alias)}.fecha_operacion >= ${options.desde}`);
  if (options.hasta) parts.push(Prisma.sql`${Prisma.raw(alias)}.fecha_operacion < ${new Date(options.hasta.getTime() + 86_400_000)}`);
  // B3's fecha_corte_extracto proves extract coverage. TODAS is intentionally
  // the default: accounts with legacy data and no B3 cut stay visible together
  // with coverage metadata, rather than looking like a balanced zero.
  if ((options.cobertura ?? "TODAS") === "CUBIERTA") {
    parts.push(Prisma.sql`COALESCE((SELECT cm.fecha_corte FROM cortes_cobertura_manual_b3 cm WHERE cm.cuenta_id=${Prisma.raw(accountAlias)}.id ORDER BY cm.version DESC LIMIT 1),${Prisma.raw(accountAlias)}.fecha_corte_extracto) IS NOT NULL`);
    parts.push(Prisma.sql`${Prisma.raw(alias)}.fecha_operacion < date_trunc('day',COALESCE((SELECT cm.fecha_corte FROM cortes_cobertura_manual_b3 cm WHERE cm.cuenta_id=${Prisma.raw(accountAlias)}.id ORDER BY cm.version DESC LIMIT 1),${Prisma.raw(accountAlias)}.fecha_corte_extracto)) + interval '1 day'`);
  }
  if (options.tarjeta) {
    if (!(FINANCE_CARD_HOLDERS as readonly {last4:string}[]).some(card=>card.last4===options.tarjeta)) fail(400,'VALIDATION_ERROR','Tarjeta inválida.')
    const cardPattern = `(?:[*]{1,12}[[:space:]]*|[xX]{2,12}[[:space:]]*|[Tt][Aa][Rr][Jj][Ee][Tt][Aa][[:space:]]+)${options.tarjeta}([^0-9]|$)`
    parts.push(Prisma.sql`concat_ws(' ',${Prisma.raw(alias)}.concepto,${Prisma.raw(alias)}.referencia,${Prisma.raw(alias)}.info_adicional) ~ ${cardPattern}`)
  }
  if (options.q) {
    const pattern = `%${options.q}%`;
    parts.push(Prisma.sql`(
      COALESCE(${Prisma.raw(alias)}.concepto, '') ILIKE ${pattern}
      OR COALESCE(${Prisma.raw(alias)}.tercero, '') ILIKE ${pattern}
      OR COALESCE(${Prisma.raw(alias)}.referencia, '') ILIKE ${pattern}
      OR COALESCE(${Prisma.raw(alias)}.info_adicional, '') ILIKE ${pattern}
    )`);
  }
  return parts.length ? Prisma.join(parts, " AND ") : Prisma.sql`TRUE`;
}

/** No text/category heuristic makes a transfer. These are the only B4 evidences. */
function notExplicitTransfer(
  alias = "m",
  estadoColumn = "estado",
  motivoColumn = "motivo_no_requiere",
): Prisma.Sql {
  return Prisma.sql`
    NOT EXISTS (
      SELECT 1 FROM traspasos_internos t
      WHERE t.movimiento_origen_id = ${Prisma.raw(alias)}.id
         OR t.movimiento_destino_id = ${Prisma.raw(alias)}.id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM vinculos_movimiento_documento v
      JOIN documentos_conciliables d ON d.id = v.documento_conciliable_id
      WHERE v.movimiento_id = ${Prisma.raw(alias)}.id
        AND v.activo = true
        AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
        AND d.tipo = 'TRASPASO'::"TipoDocumentoConciliable"
    )
    AND NOT (
      COALESCE(${Prisma.raw(alias)}.${Prisma.raw(estadoColumn)}::text, 'SIN_DOCUMENTO') = 'NO_REQUIERE'
      AND ${Prisma.raw(alias)}.${Prisma.raw(motivoColumn)}::text = 'TRASPASO_INTERNO_SIN_DOCUMENTO'
    )
  `;
}

/** B4 effective state and B5 virtual management are read without materializing either. */
const bankProjection = Prisma.sql`
  FROM movimientos_bancarios m
  JOIN cuentas_bancarias c ON c.id = m.cuenta_id
  LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = m.id
  LEFT JOIN gestiones_pendientes_movimiento_b5 g ON g.movimiento_id = m.id
  LEFT JOIN usuarios_admin r ON r.id = g.responsable_admin_id AND r.activo = true
`;

function bankRowsQuery(options: ReadPendientesB5Options, sign: -1 | 1, take: number, skip: number): Prisma.Sql {
  const where = movementFilter(options);
  const signFilter = sign < 0 ? Prisma.sql`x.importe_centimos < 0` : Prisma.sql`x.importe_centimos > 0`;
  return Prisma.sql`
    WITH x AS (
      SELECT
        m.id, m.fecha_operacion, m.concepto, m.referencia, m.info_adicional, m.tercero,
        ${cents(Prisma.raw("m.importe"))} AS importe_centimos,
        c.id AS cuenta_id, c.banco, c.alias AS cuenta_alias, COALESCE((SELECT cm.fecha_corte FROM cortes_cobertura_manual_b3 cm WHERE cm.cuenta_id=c.id ORDER BY cm.version DESC LIMIT 1),c.fecha_corte_extracto) AS fecha_corte_extracto,
        COALESCE(e.estado::text, 'SIN_DOCUMENTO') AS estado_b4,
        e.motivo_no_requiere::text AS motivo_no_requiere_b4,
        e.version AS version_b4,
        g.id AS gestion_id, g.estado::text AS estado_manual_b5, g.version AS version_gestion_b5,
        g.nota, g.responsable_admin_id, r.nombre AS responsable_nombre
      ${bankProjection}
      WHERE ${where}
    )
    SELECT x.*
    FROM x
    WHERE x.estado_b4 = 'SIN_DOCUMENTO'
      AND ${signFilter}
      AND ${notExplicitTransfer("x", "estado_b4", "motivo_no_requiere_b4")}
    ORDER BY abs(x.importe_centimos::bigint) DESC, x.fecha_operacion DESC, x.id ASC
    LIMIT ${take} OFFSET ${skip}
  `;
}

/** Separate aggregate preserves total even when LIMIT/OFFSET yields zero rows. */
function bankCountQuery(options: ReadPendientesB5Options, sign: -1 | 1): Prisma.Sql {
  const where = movementFilter(options);
  const signFilter = sign < 0 ? Prisma.sql`x.importe_centimos < 0` : Prisma.sql`x.importe_centimos > 0`;
  return Prisma.sql`
    WITH x AS (
      SELECT m.id, ${cents(Prisma.raw("m.importe"))} AS importe_centimos,
        COALESCE(e.estado::text, 'SIN_DOCUMENTO') AS estado_b4,
        e.motivo_no_requiere::text AS motivo_no_requiere_b4
      FROM movimientos_bancarios m
      JOIN cuentas_bancarias c ON c.id = m.cuenta_id
      LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = m.id
      WHERE ${where}
    )
    SELECT COUNT(*)::bigint AS total
    FROM x
    WHERE x.estado_b4 = 'SIN_DOCUMENTO'
      AND ${signFilter}
      AND ${notExplicitTransfer("x", "estado_b4", "motivo_no_requiere_b4")}
  `;
}

/**
 * Active B4 DOCUMENTO lines are the sole allocation arithmetic. The invoice
 * status, importeCobrado, Factura.situacion and any ISP field are intentionally
 * absent. A wrapper not present/active is returned only as a review incidence,
 * never silently treated as paid.
 */
function invoiceRowsQuery(options: ReadPendientesB5Options, emitted: boolean, take: number, skip: number): Prisma.Sql {
  const type = emitted ? "FACTURA_EMITIDA" : "FACTURA_RECIBIDA";
  const table = emitted ? Prisma.raw("facturas_emitidas") : Prisma.raw("facturas_recibidas");
  const targetFk = emitted ? Prisma.raw("d.factura_emitida_id") : Prisma.raw("d.factura_recibida_id");
  const text = options.q ? `%${options.q}%` : null;
  const accountClause = options.cuentaId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM vinculos_movimiento_documento vm
        JOIN movimientos_bancarios mm ON mm.id = vm.movimiento_id
        WHERE vm.activo = true AND vm.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
          AND vm.documento_conciliable_id = d.id AND mm.cuenta_id = ${options.cuentaId}
      )`
    : Prisma.sql``;
  const dateClause = options.desde || options.hasta
    ? Prisma.sql`AND (
        ${options.desde ? Prisma.sql`f.fecha >= ${options.desde}` : Prisma.sql`TRUE`}
        AND ${options.hasta ? Prisma.sql`f.fecha < ${new Date(options.hasta.getTime() + 86_400_000)}` : Prisma.sql`TRUE`}
      )`
    : Prisma.sql``;
  const qClause = text
    ? emitted
      ? Prisma.sql`AND (f.num_factura ILIKE ${text} OR f.cliente ILIKE ${text} OR COALESCE(f.cif, '') ILIKE ${text} OR COALESCE(f.concepto, '') ILIKE ${text})`
      : Prisma.sql`AND (COALESCE(f.num_factura, '') ILIKE ${text} OR f.proveedor ILIKE ${text} OR COALESCE(f.cif, '') ILIKE ${text} OR COALESCE(f.concepto, '') ILIKE ${text})`
    : Prisma.sql``;
  const canonicalClause = emitted
    ? Prisma.sql`TRUE`
    : Prisma.sql`f.calidad = 'VALIDA'::"CalidadFacturaRecibida"
        AND f.copia_de_id IS NULL AND f.conflicto_identidad = false AND f.duplicado_externo = false
        AND f.naturaleza_documento = 'FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
        AND lower(f.proveedor) NOT IN ('error_ocr', 'desconocido')
        AND NOT (
          COALESCE(f.carpeta_origen, '') ILIKE '%3. Confirming Draxton 2026%'
          OR COALESCE(f.archivo_onedrive, '') ILIKE '%3. Confirming Draxton 2026%'
          OR COALESCE(f.onedrive_ruta_actual, '') ILIKE '%3. Confirming Draxton 2026%'
          OR EXISTS (SELECT 1 FROM historial_ubicaciones_facturas_recibidas c9h
            WHERE c9h.factura_id=f.id AND (c9h.anterior::text ILIKE '%3. Confirming Draxton 2026%' OR c9h.actual::text ILIKE '%3. Confirming Draxton 2026%'))
        )`;
  const partyColumn = emitted ? Prisma.raw("f.cliente") : Prisma.raw("f.proveedor");
  return Prisma.sql`
    WITH allocations AS (
      SELECT v.documento_conciliable_id, COALESCE(SUM(v.importe_centimos), 0)::bigint AS asignado_centimos
      FROM vinculos_movimiento_documento v
      JOIN estado_justificacion_movimientos ej ON ej.movimiento_id=v.movimiento_id AND ej.estado::text='JUSTIFICADO'
      JOIN operaciones_justificacion_b4 oj ON oj.id=v.operacion_creacion_id AND oj.estado::text='APLICADA'
      WHERE v.activo = true AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
      GROUP BY v.documento_conciliable_id
    ), x AS (
      SELECT
        f.id AS factura_id, f.num_factura, f.fecha, f.fecha_vencimiento,
        ${partyColumn} AS tercero, f.cif, f.concepto,
        d.id AS documento_conciliable_id, d.importe_objetivo_centimos,
        COALESCE(a.asignado_centimos, 0)::bigint AS asignado_centimos,
        (d.importe_objetivo_centimos::bigint - COALESCE(a.asignado_centimos, 0)::bigint) AS pendiente_centimos
      FROM ${table} f
      JOIN documentos_conciliables d ON ${targetFk} = f.id
        AND d.tipo = ${type}::"TipoDocumentoConciliable" AND d.activo = true
      LEFT JOIN allocations a ON a.documento_conciliable_id = d.id
      WHERE ${canonicalClause}
        AND d.importe_objetivo_centimos IS NOT NULL
        AND ${emitted ? Prisma.sql`b4_importe_bancario_centimos(f.total)` : Prisma.sql`-b4_importe_bancario_centimos(f.total)`} = d.importe_objetivo_centimos
        ${dateClause} ${qClause} ${accountClause}
    )
    SELECT x.*
    FROM x
    WHERE x.pendiente_centimos <> 0
      AND sign(x.pendiente_centimos) = sign(x.importe_objetivo_centimos)
    ORDER BY abs(x.pendiente_centimos) DESC, x.fecha ASC, x.factura_id ASC
    LIMIT ${take} OFFSET ${skip}
  `;
}

/** Invoice count repeats the bounded B4-only predicate; no empty-page false zero. */
function invoiceCountQuery(options: ReadPendientesB5Options, emitted: boolean): Prisma.Sql {
  const type = emitted ? "FACTURA_EMITIDA" : "FACTURA_RECIBIDA";
  const table = emitted ? Prisma.raw("facturas_emitidas") : Prisma.raw("facturas_recibidas");
  const targetFk = emitted ? Prisma.raw("d.factura_emitida_id") : Prisma.raw("d.factura_recibida_id");
  const text = options.q ? `%${options.q}%` : null;
  const dateClause = options.desde || options.hasta
    ? Prisma.sql`AND (
        ${options.desde ? Prisma.sql`f.fecha >= ${options.desde}` : Prisma.sql`TRUE`}
        AND ${options.hasta ? Prisma.sql`f.fecha < ${new Date(options.hasta.getTime() + 86_400_000)}` : Prisma.sql`TRUE`}
      )`
    : Prisma.sql``;
  const qClause = text
    ? emitted
      ? Prisma.sql`AND (f.num_factura ILIKE ${text} OR f.cliente ILIKE ${text} OR COALESCE(f.cif, '') ILIKE ${text} OR COALESCE(f.concepto, '') ILIKE ${text})`
      : Prisma.sql`AND (COALESCE(f.num_factura, '') ILIKE ${text} OR f.proveedor ILIKE ${text} OR COALESCE(f.cif, '') ILIKE ${text} OR COALESCE(f.concepto, '') ILIKE ${text})`
    : Prisma.sql``;
  const canonicalClause = emitted
    ? Prisma.sql`TRUE`
    : Prisma.sql`f.calidad = 'VALIDA'::"CalidadFacturaRecibida"
        AND f.copia_de_id IS NULL AND f.conflicto_identidad = false AND f.duplicado_externo = false
        AND f.naturaleza_documento = 'FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
        AND lower(f.proveedor) NOT IN ('error_ocr', 'desconocido')
        AND NOT (
          COALESCE(f.carpeta_origen, '') ILIKE '%3. Confirming Draxton 2026%'
          OR COALESCE(f.archivo_onedrive, '') ILIKE '%3. Confirming Draxton 2026%'
          OR COALESCE(f.onedrive_ruta_actual, '') ILIKE '%3. Confirming Draxton 2026%'
          OR EXISTS (SELECT 1 FROM historial_ubicaciones_facturas_recibidas c9h
            WHERE c9h.factura_id=f.id AND (c9h.anterior::text ILIKE '%3. Confirming Draxton 2026%' OR c9h.actual::text ILIKE '%3. Confirming Draxton 2026%'))
        )`;
  return Prisma.sql`
    WITH allocations AS (
      SELECT v.documento_conciliable_id, COALESCE(SUM(v.importe_centimos), 0)::bigint AS asignado_centimos
      FROM vinculos_movimiento_documento v
      JOIN estado_justificacion_movimientos ej ON ej.movimiento_id=v.movimiento_id AND ej.estado::text='JUSTIFICADO'
      JOIN operaciones_justificacion_b4 oj ON oj.id=v.operacion_creacion_id AND oj.estado::text='APLICADA'
      WHERE v.activo = true AND v.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
      GROUP BY v.documento_conciliable_id
    ), x AS (
      SELECT d.importe_objetivo_centimos,
        (d.importe_objetivo_centimos::bigint - COALESCE(a.asignado_centimos, 0)::bigint) AS pendiente_centimos
      FROM ${table} f
      JOIN documentos_conciliables d ON ${targetFk} = f.id
        AND d.tipo = ${type}::"TipoDocumentoConciliable" AND d.activo = true
      LEFT JOIN allocations a ON a.documento_conciliable_id = d.id
      WHERE ${canonicalClause}
        AND d.importe_objetivo_centimos IS NOT NULL
        AND ${emitted ? Prisma.sql`b4_importe_bancario_centimos(f.total)` : Prisma.sql`-b4_importe_bancario_centimos(f.total)`} = d.importe_objetivo_centimos
        ${dateClause} ${qClause}
    )
    SELECT COUNT(*)::bigint AS total
    FROM x
    WHERE x.pendiente_centimos <> 0
      AND sign(x.pendiente_centimos) = sign(x.importe_objetivo_centimos)
  `;
}

function isoDate(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null;
}
function asIntegerOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "bigint" && value >= BigInt(-2_147_483_648) && value <= BigInt(2_147_483_647)) return Number(value);
  return null;
}

/** Metadata only: bounded account coverage makes absence of a B3 cut explicit. */
async function coberturaCuentasB5(cuentaId: string | undefined) {
  const rows = await asDb().$queryRaw<Array<{
    id: string; banco: string; alias: string | null; fechaCorteExtracto: Date | null;
  }>>(Prisma.sql`
    SELECT c.id, c.banco, c.alias, COALESCE((SELECT cm.fecha_corte FROM cortes_cobertura_manual_b3 cm WHERE cm.cuenta_id=c.id ORDER BY cm.version DESC LIMIT 1),c.fecha_corte_extracto) AS "fechaCorteExtracto"
    FROM cuentas_bancarias c
    WHERE ${cuentaId ? Prisma.sql`c.id = ${cuentaId}` : Prisma.sql`c.activa = true`}
    ORDER BY c.banco ASC, c.alias ASC NULLS LAST, c.id ASC
    LIMIT 100
  `);
  const cuentas = rows.map((row) => ({
    id: row.id, banco: row.banco, alias: row.alias,
    fechaCorteExtracto: isoDate(row.fechaCorteExtracto),
  }));
  return {
    cuentas,
    sinCoberturaVerificableCount: cuentas.filter((cuenta) => cuenta.fechaCorteExtracto === null).length,
  };
}

function bankView(row: SqlRow) {
  const estadoB4 = String(row.estado_b4) as EstadoB4;
  const manual = row.estado_manual_b5 === null || row.estado_manual_b5 === undefined
    ? undefined : String(row.estado_manual_b5) as EstadoManualB5;
  const effective = estadoEfectivoB5(estadoB4, manual);
  if (effective.ok === false) fail(409, effective.code, effective.message);
  const fechaOperacion = isoDate(row.fecha_operacion);
  const pista = pistaB6({
    importeCentimos: asIntegerOrNull(row.importe_centimos),
    tercero: typeof row.tercero === "string" ? row.tercero : null,
    fechaOperacionIso: fechaOperacion ?? "",
    concepto: typeof row.concepto === "string" ? row.concepto : null,
    referencia: typeof row.referencia === "string" ? row.referencia : null,
    infoAdicional: typeof row.info_adicional === "string" ? row.info_adicional : null,
  });
  if (pista.ok === false) fail(409, pista.code, pista.message);
  return {
    tipo: "MOVIMIENTO" as const,
    id: String(row.id),
    grupoTercero: typeof row.tercero === "string" && row.tercero.trim() ? row.tercero.trim() : "SIN_TERCERO_BANCO",
    fechaOperacion,
    importeCentimos: asIntegerOrNull(row.importe_centimos),
    concepto: String(row.concepto ?? ""), referencia: row.referencia ?? null, infoAdicional: row.info_adicional ?? null,
    cuenta: { id: String(row.cuenta_id), banco: String(row.banco), alias: row.cuenta_alias ?? null, fechaCorteExtracto: isoDate(row.fecha_corte_extracto) },
    b4: { estado: estadoB4, version: row.version_b4 ?? 1 },
    gestion: {
      version: Number(row.version_gestion_b5 ?? 1), estadoManual: manual ?? "PENDIENTE", estadoEfectivo: effective.value,
      responsable: row.responsable_admin_id === null || row.responsable_admin_id === undefined ? null : { id: Number(row.responsable_admin_id), nombre: row.responsable_nombre ?? null },
      nota: row.nota ?? null,
    },
    pistaB6: pista.value,
    tarjeta: cardFromBankText([row.concepto,row.referencia,row.info_adicional].filter(Boolean).join(' ')),
  };
}

function invoiceView(row: SqlRow, emitted: boolean) {
  const target = asIntegerOrNull(row.importe_objetivo_centimos);
  const pending = asIntegerOrNull(row.pendiente_centimos);
  if (target === null || pending === null) fail(409, "CENTIMOS_B4_INVALIDOS", "La proyección B5 recibió un importe B4 no exacto.");
  return {
    tipo: emitted ? "FACTURA_EMITIDA" as const : "FACTURA_RECIBIDA" as const,
    id: String(row.factura_id), documentoConciliableId: String(row.documento_conciliable_id),
    referencia: row.num_factura ?? null, tercero: String(row.tercero), cif: row.cif ?? null, concepto: row.concepto ?? null,
    fecha: isoDate(row.fecha), fechaVencimiento: isoDate(row.fecha_vencimiento),
    importeObjetivoCentimos: target, importeAsignadoActivoCentimos: asIntegerOrNull(row.asignado_centimos), importePendienteCentimos: pending,
    // Cliente sólo aparece en emitidas. B5 deliberately does not expose or use
    // Factura.situacion/FacturaEmitida.estado/importeCobrado/ISP status.
    ...(emitted ? { cliente: String(row.tercero) } : {}),
  };
}

export async function readPendientesB5(options: ReadPendientesB5Options) {
  const limit = boundedLimit(options.limit);
  const offset = boundedOffset(options.offset);
  validText(options.cuentaId, "cuentaId", 160);
  validText(options.q, "q", 120);
  if (!(VISTAS_PENDIENTES_B5 as readonly string[]).includes(options.vista)) fail(400, "VALIDATION_ERROR", "vista B5 inválida.");
  if (options.cobertura && options.cobertura !== "CUBIERTA" && options.cobertura !== "TODAS") fail(400, "VALIDATION_ERROR", "cobertura B5 inválida.");
  if (options.desde && Number.isNaN(options.desde.getTime()) || options.hasta && Number.isNaN(options.hasta.getTime())) fail(400, "VALIDATION_ERROR", "fecha B5 inválida.");
  if (options.desde && options.hasta && options.desde > options.hasta) fail(400, "VALIDATION_ERROR", "desde no puede ser posterior a hasta.");
  if ((options.vista === "FACTURAS_RECIBIDAS_SIN_PAGO" || options.vista === "FACTURAS_EMITIDAS_SIN_COBRO") && options.cuentaId) {
    fail(422, "AMBITO_CUENTA_FACTURA_NO_DEFINIDO", "Una factura no tiene cuenta bancaria autoritativa; el filtro cuentaId sólo existe para movimientos y contadores hasta que negocio defina el ámbito.");
  }
  // También en GET: no se lee ni se expone una proyección financiera antes de
  // acreditar la copia io_staging_finanzas; assert realiza únicamente SELECT.
  await assertFinanceRuntimeReady();

  if (options.vista === "FACTURAS_EMITIDAS_SIN_COBRO") {
    const emitted = await readFacturasEmitidasPendientesB5(options, limit, offset);
    return {
      vista: options.vista, cobertura: options.cobertura ?? "TODAS", items: emitted.items,
      total: emitted.total, limit, offset,
      coberturaCuentas: await coberturaCuentasB5(options.cuentaId),
      // FI has no authoritative single account scope; B7 exposes coverage without
      // manufacturing a balanced result from UNKNOWN/PARTIAL bank coverage.
      coberturaBanco: emitted.bankCoverage,
      calculoBanco: emitted.calculationBasis,
      ambitoCuentaFacturas: "POBLACION_GLOBAL_FACTURAS_EMITIDAS_SIN_CUENTA_INFERIDA",
      criterioBanco: "Cobro documental B7: B4 vigente y B6 explícita; los campos ISP/legacy no intervienen.",
    };
  }

  let rows: SqlRow[];
  let countRows: Array<{ total: bigint | number }>;
  let mapper: (row: SqlRow) => unknown;
  if (options.vista === "CARGOS_SIN_DOCUMENTO" || options.vista === "COBROS_SIN_DOCUMENTO") {
    const sign = options.vista === "CARGOS_SIN_DOCUMENTO" ? -1 : 1;
    [rows, countRows] = await Promise.all([
      asDb().$queryRaw<SqlRow[]>(bankRowsQuery(options, sign, limit, offset)),
      asDb().$queryRaw<Array<{ total: bigint | number }>>(bankCountQuery(options, sign)),
    ]);
    mapper = bankView;
  } else {
    const emitted = false;
    [rows, countRows] = await Promise.all([
      asDb().$queryRaw<SqlRow[]>(invoiceRowsQuery(options, emitted, limit, offset)),
      asDb().$queryRaw<Array<{ total: bigint | number }>>(invoiceCountQuery(options, emitted)),
    ]);
    mapper = (row) => invoiceView(row, emitted);
  }
  const coberturaCuentas = await coberturaCuentasB5(options.cuentaId);
  return {
    vista: options.vista, cobertura: options.cobertura ?? "TODAS", items: rows.map(mapper),
    total: Number(countRows[0]?.total ?? 0), limit, offset,
    coberturaCuentas,
    // Absence of coverage never becomes a 0-pending assertion; UI must show this.
    criterioBanco: "Sólo B4 determina VINCULADO/NO_REQUIERE y los importes de pago/cobro; campos ISP/legacy no intervienen.",
  };
}

/** Counters by operation month/account: exact known cents only, explicit B4 transfer exclusion only. */
export async function readContadoresPendientesB5(options: Omit<ReadPendientesB5Options, "vista" | "limit" | "offset">) {
  await assertFinanceRuntimeReady();
  const where = movementFilter({ ...options, vista: "CARGOS_SIN_DOCUMENTO" });
  const rows = await asDb().$queryRaw<SqlRow[]>(Prisma.sql`
    WITH x AS (
      SELECT m.id, m.fecha_operacion, m.importe, c.id AS cuenta_id, c.banco, c.alias,
        ${cents(Prisma.raw("m.importe"))} AS importe_centimos,
        COALESCE(e.estado::text, 'SIN_DOCUMENTO') AS estado_b4,
        e.motivo_no_requiere::text AS motivo_no_requiere_b4
      FROM movimientos_bancarios m
      JOIN cuentas_bancarias c ON c.id = m.cuenta_id
      LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = m.id
      WHERE ${where}
    )
    SELECT date_trunc('month', x.fecha_operacion)::date AS mes, x.cuenta_id, x.banco, x.alias,
      COALESCE(SUM(abs(x.importe_centimos::bigint)) FILTER (
        WHERE x.importe_centimos IS NOT NULL AND x.importe_centimos <> 0 AND x.estado_b4 = 'JUSTIFICADO'
      ), 0)::text AS "importeJustificadoCentimos",
      COALESCE(SUM(abs(x.importe_centimos::bigint)) FILTER (
        WHERE x.importe_centimos IS NOT NULL AND x.importe_centimos <> 0
      ), 0)::text AS "importeEvaluableCentimos",
      COUNT(*) FILTER (WHERE x.importe_centimos IS NULL)::int AS "movimientosImporteNoExacto"
    FROM x
    WHERE ${notExplicitTransfer("x", "estado_b4", "motivo_no_requiere_b4")}
    GROUP BY date_trunc('month', x.fecha_operacion)::date, x.cuenta_id, x.banco, x.alias
    ORDER BY mes DESC, x.banco ASC, x.alias ASC NULLS LAST, x.cuenta_id ASC
  `);
  const contadores = rows.map((row) => {
    const justificado = BigInt(String(row.importeJustificadoCentimos));
    const evaluable = BigInt(String(row.importeEvaluableCentimos));
    // Totals are returned as exact text. Do not down-cast an out-of-range
    // aggregate just to show a rounded percentage.
    const porcentaje = evaluable === BigInt(0)
      ? null
      : justificado > BigInt(Number.MAX_SAFE_INTEGER) || evaluable > BigInt(Number.MAX_SAFE_INTEGER)
        ? null
        : porcentajeJustificadoBps(Number(justificado), Number(evaluable));
    const porcentajeJustificadoBpsValue = porcentaje === null ? null : porcentaje.ok ? porcentaje.value : null;
    const movimientosImporteNoExacto = Number(row.movimientosImporteNoExacto ?? 0);
    return {
      mes: isoDate(row.mes), cuenta: { id: String(row.cuenta_id), banco: String(row.banco), alias: row.alias ?? null },
      importeJustificadoCentimos: justificado.toString(), importeEvaluableCentimos: evaluable.toString(),
      porcentajeJustificadoBps: porcentajeJustificadoBpsValue,
      movimientosImporteNoExacto,
      parcial: movimientosImporteNoExacto > 0 || porcentajeJustificadoBpsValue === null,
    };
  });
  return {
    contadores,
    cobertura: options.cobertura ?? "TODAS",
    coberturaCuentas: await coberturaCuentasB5(options.cuentaId),
  };
}

async function lockMovementAndB4(tx: Tx, movimientoId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(CAST(${movimientoId} AS text), 0))::text AS locked`;
  const rows = await tx.$queryRaw<Array<{ id: string; estadoB4: string }>>`
    SELECT m.id, COALESCE(e.estado::text, 'SIN_DOCUMENTO') AS "estadoB4"
    FROM movimientos_bancarios m
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = m.id
    WHERE m.id = ${movimientoId}
    FOR UPDATE OF m
  `;
  if (rows.length !== 1) fail(404, "MOVIMIENTO_NO_ENCONTRADO", "El movimiento bancario no existe.");
  if (rows[0].estadoB4 !== "SIN_DOCUMENTO") {
    fail(409, "AUTORIDAD_B4", "El movimiento ya está JUSTIFICADO o NO_REQUIERE en B4; B5 no puede cambiar su estado efectivo.");
  }
}

/**
 * PATCH implementation. It obtains the actor through requireB4FinanceAccess in
 * the route; it never maps display names (Víctor/David) to admin IDs. The chosen
 * responsible is an explicit active UsuarioAdmin FK, or null.
 */
export async function patchGestionPendienteB5(actorId: number, raw: unknown) {
  const parsed = validarPatchGestionB5(raw);
  if (parsed.ok === false) fail(400, parsed.code, parsed.message);
  const input = parsed.value;
  await assertFinanceRuntimeReady();
  try {
    return await asDb().$transaction(async (base) => {
      const tx = asTx(base);
      await lockMovementAndB4(tx, input.movimientoId);
      if (input.responsableAdminId !== null) {
        const responsible = await tx.usuarioAdmin.findFirst({
          where: { id: input.responsableAdminId, activo: true }, select: { id: true },
        });
        if (!responsible) fail(422, "RESPONSABLE_NO_ACTIVO", "El responsable debe ser un UsuarioAdmin activo elegido explícitamente.");
      }
      const existing = await (tx as any).gestionPendienteMovimientoB5.findUnique({ where: { movimientoId: input.movimientoId } });
      const before = existing
        ? { responsableAdminId: existing.responsableAdminId, estado: existing.estado, nota: existing.nota, version: existing.version }
        : { responsableAdminId: null, estado: "PENDIENTE", nota: null, version: 1 };
      if (before.version !== input.version) fail(409, "VERSION_CONFLICT", "La gestión B5 cambió; relea el movimiento.");
      const result = { responsableAdminId: input.responsableAdminId, estado: input.estado, nota: input.nota, version: before.version + 1 };
      const gestion = existing
        ? await (tx as any).gestionPendienteMovimientoB5.update({ where: { id: existing.id }, data: result })
        : await (tx as any).gestionPendienteMovimientoB5.create({ data: { movimientoId: input.movimientoId, ...result } });
      await (tx as any).auditoriaGestionPendienteB5.create({ data: {
        gestionId: gestion.id, movimientoId: input.movimientoId, actorId,
        accion: existing ? "ACTUALIZACION" : "CREACION", versionAnterior: before.version,
        versionResultante: result.version, snapshotAnterior: before, snapshotResultado: result,
      } });
      return { ok: true, gestion: { movimientoId: input.movimientoId, ...result } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error: any) {
    if (error instanceof B5ServiceError) throw error;
    // Unique/state races and serialization never leak as 500. A PATCH must reread.
    if (error?.code === "P2002" || error?.code === "P2034") fail(409, "CONCURRENT_CONFLICT", "Conflicto concurrente B5; relea y reintente.");
    throw error;
  }
}

/** Configuración privada: IDs activos reales, sin asignación por nombre en GET. */
export async function readConfiguracionPendientesB5() {
  await assertFinanceRuntimeReady()
  const [cuentas,responsables,registradas] = await Promise.all([
    prisma.cuentaBancaria.findMany({where:{activa:true},select:{id:true,banco:true,alias:true,fechaCorteExtracto:true},orderBy:{banco:'asc'},take:100}),
    prisma.usuarioAdmin.findMany({where:{activo:true},select:{id:true,nombre:true},orderBy:{nombre:'asc'},take:200}),
    asDb().tarjetaFinancieraB5.findMany({select:{last4:true,titularAdminId:true},take:4}),
  ])
  return {cuentas:cuentas.map(c=>({...c,fechaCorteExtracto:isoDate(c.fechaCorteExtracto)})),responsables,tarjetas:FINANCE_CARD_HOLDERS.map(card=>({...card,titularAdminId:registradas.find((r:any)=>r.last4===card.last4)?.titularAdminId??null}))}
}

export async function readAvisoTarjetasB5(actorId:number) {
  await assertFinanceRuntimeReady()
  const cards = await asDb().tarjetaFinancieraB5.findMany({where:{titularAdminId:actorId},select:{last4:true},take:4})
  const counts = await Promise.all(cards.map(async (card:any)=>{
    const result=await readPendientesB5({vista:'CARGOS_SIN_DOCUMENTO',tarjeta:card.last4,limit:1})
    return {terminacion:card.last4,pendientes:result.total}
  }))
  return {tarjetas:counts,total:counts.reduce((sum:number,card:any)=>sum+card.pendientes,0)}
}
