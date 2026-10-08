import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read';
import {
  SaleSupplierReference,
  saleSupplierKey,
  saleSuppliersVersion,
  sameSaleSuppliers,
  validateSaleSuppliers,
} from '@/lib/finanzas/sale-suppliers';

export const dynamic = 'force-dynamic';

const AREA = 'admin.finanzas.analitica_costes';
const LEGACY = ['CONTABILIDAD'];
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const VERSION = /^[a-f0-9]{64}$/;
const LIMIT = 25;
const MAX_JSON_BYTES = 16 * 1024;
const json = (value: unknown, status = 200) => NextResponse.json(value, {
  status,
  headers: { 'Cache-Control': 'private, no-store' },
});

type CatalogRow = { proveedorKey: string; nombre: string; facturas: bigint | number };
type CatalogCount = { total: bigint | number };

function integerParam(value: string | null, fallback: number): number | null {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100000 ? parsed : null;
}

function supplierRows(rows: SaleSupplierReference[]) {
  return rows.map(({ id, nombre, proveedorKey }) => ({ id, nombre, proveedorKey }));
}

async function activeSession() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!session?.user || session.user.userType !== 'admin' || !Number.isSafeInteger(userId) || userId <= 0) return null;
  const user = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } });
  return user?.activo ? { session, userId } : null;
}

async function catalogoProveedores(buscar: string, page: number) {
  const key = saleSupplierKey(buscar);
  const filter = key
    ? Prisma.sql`AND POSITION(${key} IN LOWER(BTRIM(proveedor))) > 0`
    : Prisma.empty;
  const [rows, count] = await Promise.all([
    prisma.$queryRaw<CatalogRow[]>(Prisma.sql`
      SELECT
        LOWER(BTRIM(proveedor)) AS "proveedorKey",
        MIN(proveedor) AS nombre,
        COUNT(*) AS facturas
      FROM facturas_recibidas
      WHERE estado <> 'RECHAZADA'
        AND BTRIM(proveedor) <> ''
        AND LOWER(BTRIM(proveedor)) NOT IN ('desconocido','error_ocr')
        ${filter}
      GROUP BY LOWER(BTRIM(proveedor))
      ORDER BY MIN(proveedor) ASC, LOWER(BTRIM(proveedor)) ASC
      LIMIT ${LIMIT} OFFSET ${(page - 1) * LIMIT}
    `),
    prisma.$queryRaw<CatalogCount[]>(Prisma.sql`
      SELECT COUNT(*) AS total
      FROM (
        SELECT 1
        FROM facturas_recibidas
        WHERE estado <> 'RECHAZADA'
          AND BTRIM(proveedor) <> ''
        AND LOWER(BTRIM(proveedor)) NOT IN ('desconocido','error_ocr')
          ${filter}
        GROUP BY LOWER(BTRIM(proveedor))
      ) proveedores
    `),
  ]);
  const total = Number(count[0]?.total || 0);
  return {
    proveedores: rows.map(row => ({
      nombre: row.nombre,
      proveedorKey: row.proveedorKey,
      facturas: Number(row.facturas),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / LIMIT)),
    page,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await activeSession();
    if (!auth) return json({ error: 'No autorizado' }, 401);
    const denied = await checkAdminAreaRead(AREA, LEGACY, auth.session);
    if (denied) return denied;

    const facturaId = req.nextUrl.searchParams.get('facturaId') || '';
    if (facturaId && !ID.test(facturaId)) return json({ error: 'Factura no válida' }, 400);
    const buscar = req.nextUrl.searchParams.get('buscar') || '';
    if (buscar.length > 160 || /[\u0000-\u001f\u007f]/.test(buscar)) return json({ error: 'Búsqueda no válida' }, 400);
    const page = integerParam(req.nextUrl.searchParams.get('page'), 1);
    if (!page) return json({ error: 'Página no válida' }, 400);

    const canWrite = !(await checkAdminAreaWrite(AREA, LEGACY, auth.session));
    const catalogo = await catalogoProveedores(buscar, page);
    if (!facturaId) return json({ ...catalogo, canWrite });

    const result = await prisma.$transaction(async tx => {
      const factura = await tx.facturaEmitida.findUnique({
        where: { id: facturaId },
        select: { id: true, numFactura: true, fecha: true, estado: true },
      });
      if (!factura) return null;
      const references = await tx.proveedorVentaReferencia.findMany({
        where: { facturaEmitidaId: factura.id },
        select: { id: true, nombre: true, proveedorKey: true },
        orderBy: [{ proveedorKey: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      });
      const proveedores = supplierRows(references);
      return {
        factura: {
          id: factura.id,
          numFactura: factura.numFactura,
          fecha: factura.fecha,
          estado: factura.estado,
        },
        referencias: proveedores,
        version: saleSuppliersVersion(proveedores),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (!result) return json({ error: 'Factura no encontrada' }, 404);
    return json({ ...catalogo, ...result, canWrite });
  } catch {
    return json({ error: 'No se pudieron cargar los proveedores de la venta' }, 500);
  }
}

class SupplierConflict extends Error {}

export async function POST(req: NextRequest) {
  try {
    const auth = await activeSession();
    if (!auth) return json({ error: 'No autorizado' }, 401);
    const denied = await checkAdminAreaWrite(AREA, LEGACY, auth.session);
    if (denied) return denied;
    if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Origen no autorizado' }, 403);
    if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Se requiere contenido JSON' }, 415);

    const declared = req.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_JSON_BYTES)) return json({ error: 'Solicitud demasiado grande' }, 413);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > MAX_JSON_BYTES) return json({ error: 'Solicitud demasiado grande' }, 413);

    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON no válido' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Solicitud no válida' }, 400);
    const { facturaId, version, nombres } = body as { facturaId?: unknown; version?: unknown; nombres?: unknown };
    if (typeof facturaId !== 'string' || !ID.test(facturaId) || typeof version !== 'string' || !VERSION.test(version)) {
      return json({ error: 'Factura o versión no válidas' }, 400);
    }

    let requested;
    try { requested = validateSaleSuppliers(nombres); } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Proveedores no válidos' }, 400);
    }

    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM facturas_emitidas WHERE id = ${facturaId} FOR UPDATE`);
      const factura = await tx.facturaEmitida.findUnique({ where: { id: facturaId }, select: { id: true, estado: true } });
      if (!factura) throw new SupplierConflict('Factura no encontrada.');
      if (String(factura.estado) === 'ANULADA' || String(factura.estado) === 'BORRADOR') {
        throw new SupplierConflict('No se pueden modificar proveedores de una factura en borrador o anulada.');
      }

      const previous = await tx.proveedorVentaReferencia.findMany({
        where: { facturaEmitidaId: factura.id },
        select: { id: true, nombre: true, proveedorKey: true },
        orderBy: [{ proveedorKey: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      });
      const previousRows = supplierRows(previous);
      const desiredAlreadyStored = sameSaleSuppliers(previousRows, requested);
      if (saleSuppliersVersion(previousRows) !== version) {
        // A stale repeat of the desired state is a successful no-op, never a second audit.
        if (desiredAlreadyStored) return { duplicado: true, proveedores: previousRows };
        throw new SupplierConflict('Los proveedores han cambiado en otra sesión. Recarga antes de guardar.');
      }
      if (desiredAlreadyStored) return { duplicado: true, proveedores: previousRows };

      await tx.proveedorVentaReferencia.deleteMany({ where: { facturaEmitidaId: factura.id } });
      if (requested.length) {
        await tx.proveedorVentaReferencia.createMany({
          data: requested.map(item => ({ facturaEmitidaId: factura.id, nombre: item.nombre, proveedorKey: item.proveedorKey })),
        });
      }
      const current = await tx.proveedorVentaReferencia.findMany({
        where: { facturaEmitidaId: factura.id },
        select: { id: true, nombre: true, proveedorKey: true },
        orderBy: [{ proveedorKey: 'asc' }, { nombre: 'asc' }, { id: 'asc' }],
      });
      const proveedores = supplierRows(current);
      await tx.rentabilidadAuditoria.create({
        data: {
          usuarioId: auth.userId,
          accion: 'PROVEEDORES_VENTA',
          facturaEmitidaId: factura.id,
          fuenteId: factura.id,
          tipoFuente: 'PROVEEDOR',
          datos: { antes: previousRows, despues: proveedores } as unknown as Prisma.InputJsonValue,
        },
      });
      return { duplicado: false, proveedores };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });

    return json({ success: true, ...result, version: saleSuppliersVersion(result.proveedores) });
  } catch (error) {
    if (error instanceof SupplierConflict) return json({ error: error.message }, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return json({ error: 'Otra sesión está editando la factura. Recarga y vuelve a guardar.' }, 409);
    }
    return json({ error: 'No se pudieron guardar los proveedores; no se han modificado compras, costes ni ventas.' }, 500);
  }
}
