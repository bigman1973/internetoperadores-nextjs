import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read';
import { monthlyTemplateEligible, SaleService, serviceSummary, validateSaleServices } from '@/lib/finanzas/sale-services';

export const dynamic = 'force-dynamic';
const AREA = 'admin.finanzas.analitica_costes';
const LEGACY = ['CONTABILIDAD'];
const ID = /^[a-zA-Z0-9_-]{1,80}$/;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
const select = { id: true, nombre: true, tipo: true, base: true } as const;
function serialise(rows: { id: string; nombre: string; tipo: string; base: unknown }[]) {
  return rows.map(row => ({ ...row, base: Number(row.base) })) as SaleService[];
}
function version(rows: SaleService[]) {
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
async function activeSession() {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (!session?.user || session.user.userType !== 'admin' || !Number.isSafeInteger(userId) || userId <= 0) return null;
  const user = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } });
  return user?.activo ? { session, userId } : null;
}
export async function GET(req: NextRequest) {
  try {
    const auth = await activeSession();
    if (!auth) return json({ error: 'No autorizado' }, 401);
    const denied = await checkAdminAreaRead(AREA, LEGACY, auth.session);
    if (denied) return denied;
    const facturaId = req.nextUrl.searchParams.get('facturaId') || '';
    if (!ID.test(facturaId)) return json({ error: 'Factura no válida' }, 400);
    const result = await prisma.$transaction(async tx => {
      const factura = await tx.facturaEmitida.findUnique({ where: { id: facturaId }, select: { base: true, cif: true, serie: true, concepto: true, lineas: true, fecha: true } });
      if (!factura) return null;
      const componentes = serialise(await tx.componenteVentaServicio.findMany({ where: { facturaEmitidaId: facturaId }, select, orderBy: { id: 'asc' }, take: 50 }));
      let referenciaAnterior: { facturaId: string; numFactura: string; componentes: SaleService[] } | null = null;
      if (!componentes.length && factura.cif?.trim()) {
        const from = new Date(Date.UTC(factura.fecha.getUTCFullYear(), factura.fecha.getUTCMonth() - 1, 1));
        const until = new Date(Date.UTC(factura.fecha.getUTCFullYear(), factura.fecha.getUTCMonth(), 1));
        const candidates = await tx.facturaEmitida.findMany({
          where: { cif: factura.cif, serie: factura.serie, fecha: { gte: from, lt: until }, estado: { not: 'ANULADA' }, serviciosRentabilidad: { some: {} } },
          select: { id: true, numFactura: true, base: true, cif: true, serie: true, concepto: true, lineas: true, fecha: true }, take: 21, orderBy: { fecha: 'desc' },
        });
        const matches = candidates.length <= 20 ? candidates.filter(candidate => monthlyTemplateEligible(factura, candidate)) : [];
        if (matches.length === 1) {
          const previous = serialise(await tx.componenteVentaServicio.findMany({ where: { facturaEmitidaId: matches[0].id }, select, orderBy: { id: 'asc' }, take: 50 }));
          if (serviceSummary(previous, matches[0].base).completo) referenciaAnterior = {
            facturaId: matches[0].id, numFactura: matches[0].numFactura,
            componentes: previous.map(({ nombre, tipo, base }) => ({ nombre, tipo, base })),
          };
        }
      }
      return { base: factura.base, componentes, version: version(componentes), referenciaAnterior, ...serviceSummary(componentes, factura.base) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (!result) return json({ error: 'Factura no encontrada' }, 404);
    return json({ ...result, canWrite: !(await checkAdminAreaWrite(AREA, LEGACY, auth.session)), costesPorServicio: 'pendiente_de_reparto', aviso: 'Este desglose clasifica ingresos. Las compras y horas se vinculan a la factura; todavía no se distribuyen entre sus servicios. Red propia no es intermediación.' });
  } catch { return json({ error: 'No se pudo cargar el desglose de servicios' }, 500); }
}
class ServiceConflict extends Error {}
export async function POST(req: NextRequest) {
  try {
    const auth = await activeSession();
    if (!auth) return json({ error: 'No autorizado' }, 401);
    const denied = await checkAdminAreaWrite(AREA, LEGACY, auth.session);
    if (denied) return denied;
    if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Origen no autorizado' }, 403);
    if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Se requiere contenido JSON' }, 415);
    const declared = req.headers.get('content-length');
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32000)) return json({ error: 'Solicitud demasiado grande' }, 413);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 32000) return json({ error: 'Solicitud demasiado grande' }, 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON no válido' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.facturaId !== 'string' || !ID.test(body.facturaId) || typeof body.version !== 'string' || !/^[a-f0-9]{64}$/.test(body.version)) return json({ error: 'Factura o versión del desglose no válidas' }, 400);
    // Validación preliminar de forma; la base se comprueba bajo bloqueo en la transacción.
    if (!Array.isArray(body.componentes) || body.componentes.length > 50) return json({ error: 'Desglose no válido' }, 400);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM facturas_emitidas WHERE id = ${body.facturaId} FOR UPDATE`);
      const factura = await tx.facturaEmitida.findUnique({ where: { id: body.facturaId }, select: { id: true, base: true, estado: true } });
      if (!factura) throw new ServiceConflict('Factura no encontrada.');
      if (factura.estado === 'ANULADA') throw new ServiceConflict('La factura está anulada.');
      const previous = serialise(await tx.componenteVentaServicio.findMany({ where: { facturaEmitidaId: factura.id }, select, orderBy: { id: 'asc' }, take: 50 }));
      let incoming: SaleService[];
      try { incoming = validateSaleServices(body.componentes, factura.base); } catch (error) { throw new RangeError(error instanceof Error ? error.message : 'Desglose no válido.'); }
      if (version(previous) !== body.version) {
        // Una repetición del mismo guardado no crea componentes ni auditorías de nuevo.
        const requested = incoming.map(({ nombre, tipo, base }) => ({ nombre, tipo, base })).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        const stored = previous.map(({ nombre, tipo, base }) => ({ nombre, tipo, base })).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
        if (JSON.stringify(requested) === JSON.stringify(stored)) return { duplicado: true };
        throw new ServiceConflict('El desglose ha cambiado en otra sesión. Recarga antes de guardar.');
      }
      const allowed = new Set(previous.map(item => item.id));
      if (incoming.some(item => item.id && !allowed.has(item.id))) throw new ServiceConflict('Uno de los componentes no pertenece a esta factura.');
      const unchanged = incoming.length === previous.length && incoming.every(item => previous.some(p => p.id === item.id && p.nombre === item.nombre && p.tipo === item.tipo && p.base === item.base));
      if (unchanged) return { duplicado: true };
      const kept = incoming.filter(item => item.id).map(item => item.id!);
      await tx.componenteVentaServicio.deleteMany({ where: { facturaEmitidaId: factura.id, ...(kept.length ? { id: { notIn: kept } } : {}) } });
      for (const item of incoming) {
        const data = { nombre: item.nombre, tipo: item.tipo, base: item.base };
        if (item.id) await tx.componenteVentaServicio.update({ where: { id: item.id }, data });
        else await tx.componenteVentaServicio.create({ data: { ...data, facturaEmitidaId: factura.id } });
      }
      await tx.rentabilidadAuditoria.create({ data: { usuarioId: auth.userId, accion: 'desglosar_servicios', facturaEmitidaId: factura.id, fuenteId: factura.id, tipoFuente: 'servicios', datos: { antes: previous, despues: incoming } as unknown as Prisma.InputJsonValue } });
      return { duplicado: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return json({ success: true, ...result });
  } catch (error) {
    if (error instanceof RangeError) return json({ error: error.message }, 400);
    if (error instanceof ServiceConflict) return json({ error: error.message }, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return json({ error: 'Otra sesión está editando la factura. Recarga y vuelve a guardar.' }, 409);
    return json({ error: 'No se pudo guardar el desglose; no se han cambiado importes de factura.' }, 500);
  }
}
