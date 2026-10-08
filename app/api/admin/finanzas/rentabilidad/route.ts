import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read';
import {
  availablePercentage,
  clientColumns,
  endOfProfitDay,
  invoiceColumns,
  kpiColumns,
  literalLike,
  parseProfitFilters,
  pendingCTE,
  percentageToHundredths,
  profitabilityCTE,
  SERVICE_KEYS,
  saleIdentityCTE,
  serviceColumns,
  serviceInvoiceColumns,
  toMoney,
  type ProfitFilters,
} from '@/lib/finanzas/sales-profitability';
import type {
  ProfitCandidates,
  ProfitDetail,
  ProfitInvoice,
  ProfitResponse,
  PurchaseCandidate,
  StaffCandidate,
} from '@/lib/finanzas/profitability-types';

export const dynamic = 'force-dynamic';

const AREA = 'admin.finanzas.analitica_costes';
const LEGACY_ROLES = ['CONTABILIDAD'];
const MAX_BODY_BYTES = 16 * 1024;
const MAX_NOTES = 2_000;
const MAX_DETAIL_LINKS = 500;
const SOURCE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const SALE_KEY = /^(cliente:\d+|factura:[A-Za-z0-9_-]{1,200})$/;
const ACTIONS = new Set(['vincular_compra', 'vincular_personal', 'quitar_compra', 'quitar_personal']);

class SafeError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
  });
}

function withNoStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

function day(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value.slice(0, 10) : '';
}

function moneyRecord<T extends Record<string, any>>(record: T): T {
  const mutable = record as Record<string, any>;
  for (const key of ['ventas', 'comprasDirectas', 'comprasCliente', 'personalDirecto', 'personalCliente', 'margenConocido', 'base', 'coste']) {
    if (key in mutable) mutable[key] = toMoney(mutable[key]);
  }
  return record;
}

function invoiceRecord(record: any): ProfitInvoice {
  return moneyRecord({ ...record, fecha: day(record.fecha) }) as ProfitInvoice;
}

async function getActiveAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== 'admin') return { error: json({ error: 'No autorizado' }, { status: 401 }) };
  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) return { error: json({ error: 'No autorizado' }, { status: 401 }) };
  const admin = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } });
  if (!admin?.activo) return { error: json({ error: 'No autorizado' }, { status: 401 }) };
  return { session, userId };
}

function reportWarnings() {
  return [
    'Rentabilidad provisional: solo descuenta vínculos explícitos de compras de Exagrid/Draxton y costes imputados de horas; no incorpora cargas manuales, nómina mensual ni salarios actuales.',
    'La cohorte de ventas se filtra por fecha de factura; una compra u hora vinculada puede ser de otra fecha. Los pools de cliente solo se toman por fecha de coste del período y nunca se redistribuyen entre facturas.',
    'Facturas y packs mixtos pendientes de desglose por servicio: las categorías de factura no identifican el modelo de prestación (intermediación, red propia, proyectos o teleco) y no se atribuyen costes por porcentaje de ingresos.',
    'Se excluyen estructura, estimaciones y nóminas planificadas. Un margen sin costes vinculados no equivale a un margen del 100%; se muestra como pendiente/provisional.',
  ];
}

const SERVICE_LABELS: Record<(typeof SERVICE_KEYS)[number], string> = {
  PROYECTO: 'Proyectos',
  TELECO_INTERMEDIACION: 'Teleco · Intermediación',
  TELECO_RED_PROPIA: 'Teleco · Red propia',
  __SIN_DESGLOSE__: 'Sin desglose de servicio',
};

function stableServiceRows(rows: any[]) {
  const byKey = new Map(rows.map(row => [row.key, moneyRecord(row)]));
  return SERVICE_KEYS.map(key => {
    const row = byKey.get(key);
    if (!row) {
      return {
        key,
        label: SERVICE_LABELS[key],
        ventas: 0,
        comprasDirectas: 0,
        comprasCliente: 0,
        personalDirecto: 0,
        personalCliente: 0,
        margenConocido: 0,
        margenPct: null,
        totalFacturas: 0,
        sinCosteDirecto: 0,
        incidencias: 0,
        pendienteReparto: true,
      };
    }
    const noCosts = Number(row.comprasDirectas) === 0 && Number(row.comprasCliente) === 0
      && Number(row.personalDirecto) === 0 && Number(row.personalCliente) === 0;
    return { ...row, label: row.label || SERVICE_LABELS[key], margenPct: noCosts ? null : row.margenPct ?? null,
      pendienteReparto: Boolean(row.pendienteReparto || key === '__SIN_DESGLOSE__' || noCosts) };
  });
}

function periodActivitySQL(filters: ProfitFilters) {
  const start = new Date(`${filters.desde}T00:00:00.000Z`);
  const end = endOfProfitDay(filters.hasta);
  return Prisma.sql`SELECT DISTINCT NULLIF(BTRIM(imputacion), '') AS actividad
    FROM facturas_emitidas
    WHERE estado::text NOT IN ('ANULADA', 'BORRADOR') AND fecha >= ${start} AND fecha < ${end}
      AND NULLIF(BTRIM(imputacion), '') IS NOT NULL
    ORDER BY actividad ASC LIMIT 500`;
}

function candidateAvailability(value: unknown): number {
  const raw = Number(value);
  const bounded = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0;
  return availablePercentage(10_000 - Math.round(bounded * 100)) / 100;
}

function invalidPurchaseDocument() {
  // Solo evidencia explícita; una comisión bancaria real sigue siendo una compra.
  return Prisma.sql`(LOWER(COALESCE(fr.concepto, '')) ~ '(error_ocr|no es una factura|cesi[oó]n de cr[eé]dit|documento de confirming)'
    OR LOWER(TRIM(fr.proveedor)) IN ('desconocido', 'error_ocr'))`;
}
async function readCandidates(tx: Prisma.TransactionClient, filters: ProfitFilters): Promise<ProfitCandidates> {
  if (!filters.facturaId) throw new SafeError('Selecciona una factura para consultar candidatos.');
  const q = filters.buscar ? literalLike(filters.buscar) : null;
  const offset = (filters.page - 1) * 25;
  const allocationIsInvalid = Prisma.sql`v.porcentaje IS NULL OR v.porcentaje::text = 'NaN'
    OR v.porcentaje::text IN ('Infinity', '-Infinity')
    OR v.porcentaje <= 0 OR v.porcentaje > 100 OR ROUND(v.porcentaje::numeric, 2) <> v.porcentaje::numeric`;

  if (filters.nivel === 'compras') {
    const purchaseWhere = q ? Prisma.sql`AND (fr.proveedor ILIKE ${q} OR COALESCE(fr.num_factura, '') ILIKE ${q} OR COALESCE(fr.concepto, '') ILIKE ${q})` : Prisma.empty;
    const [count, purchases] = await Promise.all([
      tx.$queryRaw<{ total: number }[]>(Prisma.sql`${saleIdentityCTE(filters.facturaId)}
        SELECT COUNT(*)::int AS total FROM facturas_recibidas fr
        CROSS JOIN target_sale sale
        WHERE fr.estado::text <> 'RECHAZADA' ${purchaseWhere}`),
      tx.$queryRaw<any[]>(Prisma.sql`${saleIdentityCTE(filters.facturaId)}
        SELECT fr.id, fr.num_factura AS "numFactura", fr.proveedor, fr.fecha, fr.base::float8 AS base, CASE WHEN LOWER(COALESCE(fr.concepto, '')) LIKE 'error_ocr%' THEN 'Extracción pendiente de revisión' ELSE fr.concepto END AS concepto,
          LEAST(100, GREATEST(0, 100 - COALESCE(alloc.otros, 0)))::float8 AS "porcentajeDisponible",
          (fr.base = 0 OR ${invalidPurchaseDocument()} OR EXISTS(SELECT 1 FROM imputaciones_coste_cliente i WHERE i.factura_id = fr.id AND i.confirmado = true)
            OR COALESCE(alloc.invalido, false) OR COALESCE(alloc.total, 0) > 100.000001 OR COALESCE(alloc.otros, 0) >= 99.999999) AS bloqueado,
          CASE WHEN ${invalidPurchaseDocument()} THEN 'Documento no factura o extracción pendiente de revisión; comprueba la fuente antes de vincular'
            WHEN fr.base = 0 THEN 'La factura no tiene base asignable'
            WHEN EXISTS(SELECT 1 FROM imputaciones_coste_cliente i WHERE i.factura_id = fr.id AND i.confirmado = true) THEN 'Edita antes la imputación confirmada a cliente'
            WHEN COALESCE(alloc.invalido, false) OR COALESCE(alloc.total, 0) > 100.000001 THEN 'La fuente tiene vínculos globales no válidos'
            WHEN COALESCE(alloc.otros, 0) >= 99.999999 THEN 'La fuente ya está asignada al 100%'
            ELSE NULL END AS motivo
        FROM facturas_recibidas fr
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(CASE WHEN v.factura_emitida_id <> ${filters.facturaId} AND NOT (${allocationIsInvalid}) THEN v.porcentaje ELSE 0 END), 0)::float8 AS otros,
            COALESCE(SUM(CASE WHEN NOT (${allocationIsInvalid}) THEN v.porcentaje ELSE 0 END), 0)::float8 AS total,
            COALESCE(BOOL_OR(${allocationIsInvalid}), false) AS invalido
          FROM vinculaciones_facturas v WHERE v.factura_recibida_id = fr.id
        ) alloc ON TRUE
        CROSS JOIN target_sale sale
        WHERE fr.estado::text <> 'RECHAZADA' ${purchaseWhere}
        ORDER BY bloqueado ASC, fr.fecha DESC, fr.id DESC LIMIT 25 OFFSET ${offset}`),
    ]);
    const compras = purchases.map(row => moneyRecord({ ...row, fecha: day(row.fecha), porcentajeDisponible: candidateAvailability(row.porcentajeDisponible) })) as PurchaseCandidate[];
    const total = count[0]?.total || 0;
    return { compras, personal: [], total, page: filters.page, totalPages: Math.max(1, Math.ceil(total / 25)) };
  }

  const staffWhere = q ? Prisma.sql`AND (e.nombre_completo ILIKE ${q} OR COALESCE(ih.descripcion, '') ILIKE ${q})` : Prisma.empty;
  const [count, staff] = await Promise.all([
    tx.$queryRaw<{ total: number }[]>(Prisma.sql`${saleIdentityCTE(filters.facturaId)}
      SELECT COUNT(*)::int AS total FROM imputaciones_horas ih JOIN empleados e ON e.id = ih.empleado_id
      CROSS JOIN target_sale sale
      WHERE BTRIM(COALESCE(ih.empresa_grupo, '')) = 'INTERNET OPERADORES' ${staffWhere}`),
    tx.$queryRaw<any[]>(Prisma.sql`${saleIdentityCTE(filters.facturaId)}
      SELECT ih.id, e.nombre_completo AS empleado, ih.fecha, ih.horas::float8 AS horas, ih.coste_imputado::float8 AS coste,
        LEAST(100, GREATEST(0, 100 - COALESCE(alloc.otros, 0)))::float8 AS "porcentajeDisponible",
        (ih.coste_imputado IS NULL OR ih.coste_imputado < 0 OR ih.horas <= 0
          OR (ih.cliente_id_imp IS NOT NULL AND p.cliente_id IS NOT NULL AND ih.cliente_id_imp <> p.cliente_id)
          OR COALESCE(ih.cliente_id_imp, p.cliente_id) IS NULL
          OR COALESCE(ih.cliente_id_imp, p.cliente_id) IS DISTINCT FROM sale.cliente_web_id
          OR COALESCE(alloc.invalido, false) OR COALESCE(alloc.total, 0) > 100.000001 OR COALESCE(alloc.otros, 0) >= 99.999999) AS bloqueado,
        CASE WHEN ih.coste_imputado IS NULL OR ih.coste_imputado < 0 THEN 'No hay coste imputado válido'
          WHEN ih.horas <= 0 THEN 'Las horas deben ser positivas'
          WHEN ih.cliente_id_imp IS NOT NULL AND p.cliente_id IS NOT NULL AND ih.cliente_id_imp <> p.cliente_id THEN 'Cliente de hora y proyecto contradictorios'
          WHEN COALESCE(ih.cliente_id_imp, p.cliente_id) IS NULL THEN 'La hora no tiene cliente explícito'
          WHEN COALESCE(ih.cliente_id_imp, p.cliente_id) IS DISTINCT FROM sale.cliente_web_id THEN 'La hora pertenece a otro cliente'
          WHEN COALESCE(alloc.invalido, false) OR COALESCE(alloc.total, 0) > 100.000001 THEN 'La fuente tiene vínculos globales no válidos'
          WHEN COALESCE(alloc.otros, 0) >= 99.999999 THEN 'La fuente ya está asignada al 100%'
          ELSE NULL END AS motivo
      FROM imputaciones_horas ih
      JOIN empleados e ON e.id = ih.empleado_id
      LEFT JOIN proyectos p ON p.id = ih.proyecto_id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(CASE WHEN v.factura_emitida_id <> ${filters.facturaId} AND NOT (${allocationIsInvalid}) THEN v.porcentaje ELSE 0 END), 0)::float8 AS otros,
          COALESCE(SUM(CASE WHEN NOT (${allocationIsInvalid}) THEN v.porcentaje ELSE 0 END), 0)::float8 AS total,
          COALESCE(BOOL_OR(${allocationIsInvalid}), false) AS invalido
        FROM vinculaciones_personal_facturas v WHERE v.imputacion_horas_id = ih.id
      ) alloc ON TRUE
      CROSS JOIN target_sale sale
      WHERE BTRIM(COALESCE(ih.empresa_grupo, '')) = 'INTERNET OPERADORES' ${staffWhere}
      ORDER BY ih.fecha DESC, ih.id DESC LIMIT 25 OFFSET ${offset}`),
  ]);
  const personal = staff.map(row => moneyRecord({ ...row, fecha: day(row.fecha), porcentajeDisponible: candidateAvailability(row.porcentajeDisponible) })) as StaffCandidate[];
  const total = count[0]?.total || 0;
  return { compras: [], personal, total, page: filters.page, totalPages: Math.max(1, Math.ceil(total / 25)) };
}

async function readProfitability(filters: ProfitFilters, canWrite: boolean): Promise<ProfitResponse | ProfitDetail | ProfitCandidates | { facturas: ProfitInvoice[]; total: number; page: number; totalPages: number; canWrite: boolean }> {
  return prisma.$transaction(async tx => {
    if (filters.nivel === 'compras' || filters.nivel === 'personal') return readCandidates(tx, filters);
    if (filters.nivel === 'seleccionar') {
      const start = new Date(`${filters.desde}T00:00:00.000Z`);
      const end = endOfProfitDay(filters.hasta);
      const search = filters.buscar ? literalLike(filters.buscar) : null;
      const where = Prisma.sql`WHERE fe.estado::text NOT IN ('ANULADA', 'BORRADOR')
        AND fe.fecha >= ${start} AND fe.fecha < ${end}
        ${search ? Prisma.sql`AND (fe.cliente ILIKE ${search} OR fe.num_factura ILIKE ${search} OR COALESCE(fe.concepto, '') ILIKE ${search})` : Prisma.empty}`;
      const [count, rows] = await Promise.all([
        tx.$queryRaw<{total:number}[]>(Prisma.sql`SELECT COUNT(*)::int AS total FROM facturas_emitidas fe ${where}`),
        tx.$queryRaw<any[]>(Prisma.sql`SELECT fe.id, fe.num_factura AS "numFactura", fe.cliente, fe.fecha, fe.concepto, fe.base::float8 AS ventas
          FROM facturas_emitidas fe ${where} ORDER BY fe.fecha DESC, fe.id DESC LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}`),
      ]);
      const total = count[0]?.total || 0;
      return { facturas: rows.map(invoiceRecord), total, page: filters.page, totalPages: Math.max(1, Math.ceil(total / filters.limit)), canWrite };
    }
    if ((filters.nivel === 'facturas' && !filters.clienteKey) || (filters.nivel === 'detalle' && !filters.facturaId)) {
      throw new SafeError('Falta la selección de cliente o factura.');
    }
    if (filters.clienteKey && !SALE_KEY.test(filters.clienteKey)) throw new SafeError('Cliente no válido.');
    const cte = profitabilityCTE(filters);
    const [activities, pending] = await Promise.all([
      tx.$queryRaw<any[]>(periodActivitySQL(filters)),
      tx.$queryRaw<any[]>(pendingCTE(filters)),
    ]);

    if (filters.nivel === 'detalle') {
      const invoices = await tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${invoiceColumns} FROM invoice_metrics WHERE id = ${filters.facturaId} LIMIT 1`);
      if (invoices.length !== 1) throw new SafeError('Factura no encontrada en el período.', 404);
      const [purchases, staff] = await Promise.all([
        tx.$queryRaw<any[]>(Prisma.sql`${cte}
          SELECT id, fuente_id AS "fuenteId", num_factura AS "numFactura", proveedor, fecha, base::float8 AS base,
            porcentaje::float8 AS porcentaje, coste::float8 AS coste, notas, incidencia
          FROM purchase_links WHERE factura_emitida_id = ${filters.facturaId} ORDER BY fecha DESC, id DESC LIMIT ${MAX_DETAIL_LINKS + 1}`),
        tx.$queryRaw<any[]>(Prisma.sql`${cte}
          SELECT id, fuente_id AS "fuenteId", empleado, fecha, horas::float8 AS horas,
            porcentaje::float8 AS porcentaje, coste::float8 AS coste, notas, incidencia
          FROM staff_links WHERE factura_emitida_id = ${filters.facturaId} ORDER BY fecha DESC, id DESC LIMIT ${MAX_DETAIL_LINKS + 1}`),
      ]);
      const avisos = reportWarnings();
      if (purchases.length > MAX_DETAIL_LINKS) avisos.push(`Se muestran las primeras ${MAX_DETAIL_LINKS} vinculaciones de compras; hay más resultados.`);
      if (staff.length > MAX_DETAIL_LINKS) avisos.push(`Se muestran las primeras ${MAX_DETAIL_LINKS} vinculaciones de personal; hay más resultados.`);
      return {
        factura: invoiceRecord(invoices[0]),
        compras: purchases.slice(0, MAX_DETAIL_LINKS).map(row => moneyRecord({ ...row, fecha: day(row.fecha) })),
        personal: staff.slice(0, MAX_DETAIL_LINKS).map(row => moneyRecord({ ...row, fecha: day(row.fecha) })),
        avisos,
        canWrite,
      } as ProfitDetail;
    }

    const isInvoices = filters.nivel === 'facturas';
    const isServices = filters.nivel === 'servicios';
    const usingService = Boolean(filters.servicioKey);
    const invoiceSource = usingService ? Prisma.sql`service_invoice_metrics` : Prisma.sql`invoice_metrics`;
    const invoiceProjection = usingService ? serviceInvoiceColumns : invoiceColumns;
    const serviceFilter = filters.servicioKey ? Prisma.sql`AND service_key = ${filters.servicioKey}` : Prisma.empty;
    const clientSource = usingService ? Prisma.sql`service_client_all` : Prisma.sql`client_rollups`;
    const clientProjection = usingService ? Prisma.sql`
      cliente_key AS key, label, cliente_web_id AS "clienteWebId", ventas::float8 AS ventas,
      compras_directas::float8 AS "comprasDirectas", compras_cliente::float8 AS "comprasCliente",
      personal_directo::float8 AS "personalDirecto", personal_cliente::float8 AS "personalCliente",
      margen_conocido::float8 AS "margenConocido",
      CASE WHEN sin_coste_directo > 0 OR incidencias > 0 OR pendiente_reparto OR ventas = 0 THEN NULL
        ELSE ROUND((100 * margen_conocido / ventas)::numeric, 2)::float8 END AS "margenPct",
      total_facturas AS "totalFacturas", sin_coste_directo AS "sinCosteDirecto", incidencias`
      : clientColumns;
    const [kpis, count, rows] = await Promise.all([
      tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${kpiColumns} FROM client_rollups`),
      isServices
        ? tx.$queryRaw<{ total: number }[]>(Prisma.sql`${cte} SELECT COUNT(*)::int AS total FROM service_rollups`)
        : isInvoices
          ? tx.$queryRaw<{ total: number }[]>(Prisma.sql`${cte} SELECT COUNT(*)::int AS total FROM ${invoiceSource} WHERE cliente_key = ${filters.clienteKey} ${serviceFilter}`)
          : tx.$queryRaw<{ total: number }[]>(Prisma.sql`${cte} SELECT COUNT(*)::int AS total FROM ${clientSource} WHERE TRUE ${serviceFilter}`),
      isInvoices
        ? tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${invoiceProjection} FROM ${invoiceSource} WHERE cliente_key = ${filters.clienteKey} ${serviceFilter}
            ORDER BY fecha DESC, id DESC LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}`)
        : isServices
          ? tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${serviceColumns} FROM service_rollups
              ORDER BY CASE service_key WHEN 'PROYECTO' THEN 1 WHEN 'TELECO_INTERMEDIACION' THEN 2 WHEN 'TELECO_RED_PROPIA' THEN 3 ELSE 4 END`)
          : tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${clientProjection} FROM ${clientSource} WHERE TRUE ${serviceFilter}
              ORDER BY ventas DESC, key ASC LIMIT ${filters.limit} OFFSET ${(filters.page - 1) * filters.limit}`),
    ]);
    const total = isServices ? SERVICE_KEYS.length : count[0]?.total || 0;
    const result: ProfitResponse = {
      kpis: moneyRecord(kpis[0] || { ventas: 0, comprasDirectas: 0, comprasCliente: 0, personalDirecto: 0, personalCliente: 0, margenConocido: 0, margenPct: null, totalFacturas: 0, sinCosteDirecto: 0, incidencias: 0 }),
      servicios: isServices ? stableServiceRows(rows) : [],
      clientes: isInvoices || isServices ? [] : rows.map(row => moneyRecord(row)),
      facturas: isInvoices ? rows.map(invoiceRecord) : [],
      total,
      page: filters.page,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
      periodo: { desde: filters.desde, hasta: filters.hasta },
      actividades: activities.map(row => row.actividad).filter((value): value is string => typeof value === 'string'),
      canWrite,
      avisos: reportWarnings(),
      pendientes: pending[0] || { comprasSinVenta: 0, personalSinVenta: 0, horasSinCoste: 0, conflictos: 0 },
    };
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}

/** Resolve the accounting identity, never a name/amount match or a newly-created sale. */
async function directSaleFilters(params: URLSearchParams): Promise<ProfitFilters | null> {
  const saleId = params.get('ventaId');
  const ispId = params.get('facturaIspId');
  if (saleId === null && ispId === null) return null;
  if (saleId !== null && ispId !== null) throw new SafeError('Selecciona una única factura.');
  let rows: {id:string; fecha:Date}[];
  if (saleId !== null) {
    if (!SOURCE_ID.test(saleId)) throw new SafeError('Factura de venta no válida.');
    rows = await prisma.$queryRaw(Prisma.sql`SELECT id, fecha FROM facturas_emitidas WHERE id = ${saleId} LIMIT 1`);
  } else {
    if (!ispId || !/^[1-9]\d{0,9}$/.test(ispId)) throw new SafeError('Factura ISPgestion no válida.');
    rows = await prisma.$queryRaw(Prisma.sql`SELECT fe.id, fe.fecha FROM facturas f
      JOIN facturas_emitidas fe ON fe.id_externo = f.isp_gestion_id::text
        AND LOWER(BTRIM(COALESCE(fe.origen_sistema, ''))) = 'ispgestion'
      WHERE f.id = ${Number(ispId)} LIMIT 2`);
  }
  if (!rows.length) throw new SafeError('Esta factura no está disponible en ventas financieras. Revisa su sincronización con ISPgestion; no se ha creado ninguna copia.', 404);
  if (rows.length !== 1) throw new SafeError('La factura tiene más de una referencia financiera. Revisa su identidad antes de vincular costes.', 409);
  const fecha = day(rows[0].fecha);
  return parseProfitFilters(new URLSearchParams({ nivel: 'detalle', facturaId: rows[0].id, desde: fecha, hasta: fecha }));
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getActiveAdmin();
    if ('error' in auth) return auth.error;
    const denied = await checkAdminAreaRead(AREA, LEGACY_ROLES, auth.session);
    if (denied) return withNoStore(denied);
    const writeDenied = await checkAdminAreaWrite(AREA, LEGACY_ROLES, auth.session);
    let filters: ProfitFilters;
    try { filters = await directSaleFilters(req.nextUrl.searchParams) ?? parseProfitFilters(req.nextUrl.searchParams); }
    catch (error) { if (error instanceof SafeError) throw error; return json({ error: 'Revisa el período, filtros y paginación.' }, { status: 400 }); }
    return json(await readProfitability(filters, !writeDenied));
  } catch (error) {
    if (error instanceof SafeError) return json({ error: error.message }, { status: error.status });
    console.error('[rentabilidad] Lectura no disponible', error instanceof Error ? error.name : 'Error');
    return json({ error: 'No se pudo cargar la rentabilidad. Puedes reintentar sin modificar datos.' }, { status: 500 });
  }
}

type Mutation = {
  action: 'vincular_compra' | 'vincular_personal' | 'quitar_compra' | 'quitar_personal';
  facturaId: string;
  fuenteId: string;
  porcentaje?: number;
  notas?: string | null;
};

function parseMutation(value: unknown): Mutation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SafeError('La solicitud no es válida.');
  const body = value as Record<string, unknown>;
  if (typeof body.action !== 'string' || !ACTIONS.has(body.action) || typeof body.facturaId !== 'string' || typeof body.fuenteId !== 'string'
    || !SOURCE_ID.test(body.facturaId) || !SOURCE_ID.test(body.fuenteId)) throw new SafeError('La solicitud no es válida.');
  const isLink = body.action === 'vincular_compra' || body.action === 'vincular_personal';
  const percentage = percentageToHundredths(body.porcentaje);
  if (isLink && percentage === null) throw new SafeError('El porcentaje debe estar entre 0,01 y 100 con un máximo de dos decimales.');
  if (!isLink && (body.porcentaje !== undefined || body.notas !== undefined)) throw new SafeError('La solicitud no es válida.');
  if (isLink && body.notas !== undefined && body.notas !== null && typeof body.notas !== 'string') throw new SafeError('Las notas no son válidas.');
  const notas = typeof body.notas === 'string' ? body.notas.trim() : body.notas === null ? null : null;
  if (notas !== null && (notas.length > MAX_NOTES || /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/.test(notas))) throw new SafeError('Las notas no son válidas.');
  return { action: body.action as Mutation['action'], facturaId: body.facturaId, fuenteId: body.fuenteId, porcentaje: percentage === null ? undefined : percentage / 100, notas };
}

async function lockedSale(tx: Prisma.TransactionClient, facturaId: string) {
  const rows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT id, estado::text AS estado FROM facturas_emitidas WHERE id = ${facturaId} FOR UPDATE`);
  if (rows.length !== 1) throw new SafeError('Factura no encontrada.', 404);
  if (rows[0].estado === 'ANULADA' || rows[0].estado === 'BORRADOR') throw new SafeError('No se puede vincular una factura anulada o borrador.', 409);
  const identities = await tx.$queryRaw<any[]>(Prisma.sql`${saleIdentityCTE(facturaId)} SELECT cliente_web_id AS "clienteWebId" FROM target_sale`);
  if (identities.length !== 1) throw new SafeError('La factura no está disponible para rentabilidad.', 409);
  return identities[0] as { clienteWebId: number | null };
}

async function appendAudit(tx: Prisma.TransactionClient, userId: number, action: string, facturaId: string, fuenteId: string, tipoFuente: 'compra' | 'personal', datos: object) {
  await tx.$executeRaw(Prisma.sql`INSERT INTO rentabilidad_auditoria
    (id, usuario_id, accion, factura_emitida_id, fuente_id, tipo_fuente, datos, created_at)
    VALUES (${`c${randomUUID().replace(/-/g, '')}`}, ${userId}, ${action}, ${facturaId}, ${fuenteId}, ${tipoFuente}, ${JSON.stringify(datos)}::jsonb, NOW())`);
}

function storedPercentageHundredths(value: unknown): number | null {
  const percentage = Number(value);
  return Number.isFinite(percentage) ? percentageToHundredths(percentage) : null;
}

function checkedOtherHundredths(links: any[], facturaId: string) {
  let otherHundredths = 0;
  let targetCount = 0;
  for (const link of links) {
    const hundredths = storedPercentageHundredths(link.porcentaje);
    if (hundredths === null) throw new SafeError('La fuente tiene vínculos con porcentajes no válidos. Corrígelos antes de continuar.', 409);
    if (link.facturaId === facturaId) targetCount++;
    else otherHundredths += hundredths;
  }
  if (targetCount > 1 || otherHundredths > 10_000) throw new SafeError('La fuente tiene vínculos globales no válidos. Corrígelos antes de continuar.', 409);
  return otherHundredths;
}

function auditSnapshot(link: any | undefined) {
  return link ? { porcentaje: Number(link.porcentaje), notas: link.notas ?? null } : null;
}

async function linkPurchase(tx: Prisma.TransactionClient, mutation: Mutation, userId: number) {
  await lockedSale(tx, mutation.facturaId);
  const source = await tx.$queryRaw<any[]>(Prisma.sql`SELECT fr.id, fr.base::float8 AS base, fr.estado::text AS estado, ${invalidPurchaseDocument()} AS documento_invalido,
    EXISTS(SELECT 1 FROM imputaciones_coste_cliente i WHERE i.factura_id = fr.id AND i.confirmado = true) AS tiene_cliente
    FROM facturas_recibidas fr WHERE fr.id = ${mutation.fuenteId} FOR UPDATE`);
  if (source.length !== 1) throw new SafeError('Compra no encontrada.', 404);
  if (source[0].estado === 'RECHAZADA' || !Number.isFinite(source[0].base) || source[0].base === 0) throw new SafeError('La compra no tiene una base válida para vincular.', 409);
  if (source[0].documento_invalido) throw new SafeError('El documento no es una factura de compra válida o tiene extracción pendiente de revisión.', 409);
  if (source[0].tiene_cliente) throw new SafeError('La compra ya tiene imputación confirmada a cliente. Edita primero la fuente.', 409);
  const links = await tx.$queryRaw<any[]>(Prisma.sql`SELECT id, factura_emitida_id AS "facturaId", porcentaje::float8 AS porcentaje, notas
    FROM vinculaciones_facturas WHERE factura_recibida_id = ${mutation.fuenteId} FOR UPDATE`);
  const existing = links.find(link => link.facturaId === mutation.facturaId);
  const otherHundredths = checkedOtherHundredths(links, mutation.facturaId);
  const requested = Math.round((mutation.porcentaje || 0) * 100);
  if (otherHundredths + requested > 10000) throw new SafeError('El porcentaje supera el 100% global de la fuente.', 409);
  if (existing && storedPercentageHundredths(existing.porcentaje) === requested && (existing.notas ?? null) === mutation.notas) return { duplicated: true };
  const before = auditSnapshot(existing);
  const after = { porcentaje: mutation.porcentaje, notas: mutation.notas };
  if (existing) {
    await tx.$executeRaw(Prisma.sql`UPDATE vinculaciones_facturas SET porcentaje = ${mutation.porcentaje}, notas = ${mutation.notas}
      WHERE id = ${existing.id}`);
  } else {
    await tx.$executeRaw(Prisma.sql`INSERT INTO vinculaciones_facturas (id, factura_recibida_id, factura_emitida_id, porcentaje, notas, created_at)
      VALUES (${randomUUID()}, ${mutation.fuenteId}, ${mutation.facturaId}, ${mutation.porcentaje}, ${mutation.notas}, NOW())`);
  }
  await appendAudit(tx, userId, existing ? 'actualizar_vinculacion_compra' : 'vincular_compra', mutation.facturaId, mutation.fuenteId, 'compra', { before, after });
  return { duplicated: false };
}

async function linkStaff(tx: Prisma.TransactionClient, mutation: Mutation, userId: number) {
  const sale = await lockedSale(tx, mutation.facturaId);
  const source = await tx.$queryRaw<any[]>(Prisma.sql`SELECT ih.id, ih.horas::float8 AS horas, ih.coste_imputado::float8 AS coste,
    ih.empresa_grupo AS empresa, ih.cliente_id_imp AS "clienteExplicito", p.cliente_id AS "clienteProyecto"
    FROM imputaciones_horas ih LEFT JOIN proyectos p ON p.id = ih.proyecto_id WHERE ih.id = ${mutation.fuenteId} FOR UPDATE OF ih`);
  if (source.length !== 1) throw new SafeError('Hora no encontrada.', 404);
  const row = source[0];
  if (row.empresa !== 'INTERNET OPERADORES' || !Number.isFinite(row.coste) || row.coste < 0 || !Number.isFinite(row.horas) || row.horas <= 0) throw new SafeError('La hora no es una fuente válida para rentabilidad.', 409);
  if (sale.clienteWebId === null || (row.clienteExplicito !== null && row.clienteProyecto !== null && row.clienteExplicito !== row.clienteProyecto)
    || (row.clienteExplicito ?? row.clienteProyecto) !== sale.clienteWebId) throw new SafeError('La hora no pertenece inequívocamente al cliente de la factura.', 409);
  const links = await tx.$queryRaw<any[]>(Prisma.sql`SELECT id, factura_emitida_id AS "facturaId", porcentaje::float8 AS porcentaje, notas
    FROM vinculaciones_personal_facturas WHERE imputacion_horas_id = ${mutation.fuenteId} FOR UPDATE`);
  const existing = links.find(link => link.facturaId === mutation.facturaId);
  const otherHundredths = checkedOtherHundredths(links, mutation.facturaId);
  const requested = Math.round((mutation.porcentaje || 0) * 100);
  if (otherHundredths + requested > 10000) throw new SafeError('El porcentaje supera el 100% global de la fuente.', 409);
  if (existing && storedPercentageHundredths(existing.porcentaje) === requested && (existing.notas ?? null) === mutation.notas) return { duplicated: true };
  const before = auditSnapshot(existing);
  const after = { porcentaje: mutation.porcentaje, notas: mutation.notas };
  if (existing) {
    await tx.$executeRaw(Prisma.sql`UPDATE vinculaciones_personal_facturas SET porcentaje = ${mutation.porcentaje}, notas = ${mutation.notas}, updated_at = NOW()
      WHERE id = ${existing.id}`);
  } else {
    await tx.$executeRaw(Prisma.sql`INSERT INTO vinculaciones_personal_facturas
      (id, factura_emitida_id, imputacion_horas_id, porcentaje, notas, created_at, updated_at)
      VALUES (${`c${randomUUID().replace(/-/g, '')}`}, ${mutation.facturaId}, ${mutation.fuenteId}, ${mutation.porcentaje}, ${mutation.notas}, NOW(), NOW())`);
  }
  await appendAudit(tx, userId, existing ? 'actualizar_vinculacion_personal' : 'vincular_personal', mutation.facturaId, mutation.fuenteId, 'personal', { before, after });
  return { duplicated: false };
}

async function unlink(tx: Prisma.TransactionClient, mutation: Mutation, userId: number) {
  await lockedSale(tx, mutation.facturaId);
  const isPurchase = mutation.action === 'quitar_compra';
  const table = isPurchase ? Prisma.raw('vinculaciones_facturas') : Prisma.raw('vinculaciones_personal_facturas');
  const sourceField = isPurchase ? Prisma.raw('factura_recibida_id') : Prisma.raw('imputacion_horas_id');
  if (isPurchase) {
    await tx.$queryRaw<any[]>(Prisma.sql`SELECT id FROM facturas_recibidas WHERE id = ${mutation.fuenteId} FOR UPDATE`);
  } else {
    await tx.$queryRaw<any[]>(Prisma.sql`SELECT ih.id FROM imputaciones_horas ih WHERE ih.id = ${mutation.fuenteId} FOR UPDATE OF ih`);
  }
  const rows = await tx.$queryRaw<any[]>(Prisma.sql`SELECT id, porcentaje::float8 AS porcentaje, notas FROM ${table}
    WHERE factura_emitida_id = ${mutation.facturaId} AND ${sourceField} = ${mutation.fuenteId} FOR UPDATE`);
  if (!rows.length) return { duplicated: true };
  await tx.$executeRaw(Prisma.sql`DELETE FROM ${table} WHERE id = ${rows[0].id}`);
  await appendAudit(tx, userId, mutation.action, mutation.facturaId, mutation.fuenteId, isPurchase ? 'compra' : 'personal', { before: auditSnapshot(rows[0]), after: null });
  return { duplicated: false };
}

function isSerializationError(error: unknown) {
  const value = error as { code?: string; message?: string };
  return value?.code === 'P2034' || value?.code === '40001' || /could not serialize/i.test(value?.message || '');
}

async function executeMutation(mutation: Mutation, userId: number) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        if (mutation.action === 'vincular_compra') return linkPurchase(tx, mutation, userId);
        if (mutation.action === 'vincular_personal') return linkStaff(tx, mutation, userId);
        return unlink(tx, mutation, userId);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 12_000 });
    } catch (error) {
      if (error instanceof SafeError) throw error;
      if (!isSerializationError(error) || attempt === 1) throw error;
    }
  }
  throw new Error('unreachable');
}

async function readJson(req: NextRequest) {
  if (req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw new SafeError('El contenido debe ser JSON.', 415);
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw new SafeError('La solicitud es demasiado grande.', 413);
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new SafeError('La solicitud es demasiado grande.', 413);
  try { return JSON.parse(raw); } catch { throw new SafeError('JSON no válido.'); }
}

async function mutate(req: NextRequest, method: 'POST' | 'DELETE') {
  try {
    const auth = await getActiveAdmin();
    if ('error' in auth) return auth.error;
    const denied = await checkAdminAreaWrite(AREA, LEGACY_ROLES, auth.session);
    if (denied) return withNoStore(denied);
    if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Origen de la solicitud no válido.' }, { status: 403 });
    const mutation = parseMutation(await readJson(req));
    const isLink = mutation.action === 'vincular_compra' || mutation.action === 'vincular_personal';
    if ((method === 'POST' && !isLink) || (method === 'DELETE' && isLink)) throw new SafeError('La acción no corresponde al método de la solicitud.');
    const result = await executeMutation(mutation, auth.userId);
    return json({ success: true, duplicado: result.duplicated });
  } catch (error) {
    if (error instanceof SafeError) return json({ error: error.message }, { status: error.status });
    if (isSerializationError(error)) return json({ error: 'La operación coincidió con otro cambio. Reinténtala.' }, { status: 409 });
    console.error('[rentabilidad] Escritura no disponible', error instanceof Error ? error.name : 'Error');
    return json({ error: 'No se pudo guardar la vinculación. No se modificó la fuente contable.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) { return mutate(req, 'POST'); }
export async function DELETE(req: NextRequest) { return mutate(req, 'DELETE'); }
