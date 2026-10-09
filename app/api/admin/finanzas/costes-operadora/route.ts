import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { operatorAuth, operatorJson } from '@/lib/finanzas/operator-costs-auth';
import { OPERATOR_AREA, ID, PERIOD, digest, normalize, groupInput, sourceInput, invoiceSnapshot, externalSnapshot, validateAssignments, sourceKey, OperatorSnapshot } from '@/lib/finanzas/operator-costs';

export const dynamic = 'force-dynamic';
const LIMIT = 25;
const invoiceSelect = { id: true, proveedor: true, numFactura: true, fecha: true, base: true, concepto: true, lineasDetalle: true, estado: true, imputadoAVentas: true } as const;
const include = { documentos: { include: { factura: { select: invoiceSelect } } }, asignaciones: { include: { grupo: true }, orderBy: { indice: 'asc' as const } } };

function publicSource(row: any) {
  const changed = row.documentos.some((d: any) => digest(invoiceSnapshot(d.factura)) !== d.version);
  return { ...row, creadoPor: undefined, claveOrigen: undefined, fuenteVersion: undefined, documentoDrive: undefined, documentoItem: undefined, documentoHash: undefined,
    documentoCambiado: changed, tienePdf: Boolean(row.documentoItem),
    documentos: row.documentos.map((d: any) => ({ facturaId: d.facturaId, rol: d.rol, factura: { id: d.factura.id, proveedor: d.factura.proveedor, numFactura: d.factura.numFactura } })),
    asignaciones: row.asignaciones.map((a: any) => ({ ...a, importe: Number(a.importe) })),
  };
}
function paramPage(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('page') || '1';
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 100000) throw new Invalid('Página no válida.');
  return Number(raw);
}
class Invalid extends Error {}
class Conflict extends Error {}

export async function GET(req: NextRequest) {
  try {
    const auth = await operatorAuth(false);
    if (auth instanceof NextResponse) return auth;
    const params = req.nextUrl.searchParams;
    const page = paramPage(req);
    const buscar = params.get('buscar') || '';
    if (buscar.length > 160 || /[\u0000-\u001f\u007f]/.test(buscar)) throw new Invalid('Búsqueda no válida.');
    const periodo = params.get('periodo') || '';
    if (periodo && !PERIOD.test(periodo)) throw new Invalid('Período no válido.');
    const action = params.get('action') || '';
    if (action === 'facturas') {
      const where: Prisma.FacturaRecibidaWhereInput = { estado: { not: 'RECHAZADA' }, OR: buscar ? [{ proveedor: { contains: buscar, mode: 'insensitive' } }, { numFactura: { contains: buscar, mode: 'insensitive' } }, { concepto: { contains: buscar, mode: 'insensitive' } }] : undefined };
      if (periodo) { const start = new Date(periodo + '-01T00:00:00Z'); const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1); where.fecha = { gte: start, lt: end }; }
      const [rows, total] = await Promise.all([
        prisma.facturaRecibida.findMany({ where, select: { ...invoiceSelect, documentosOperadora: { select: { id: true } } }, orderBy: [{ fecha: 'desc' }, { id: 'asc' }], skip: (page - 1) * LIMIT, take: LIMIT }),
        prisma.facturaRecibida.count({ where }),
      ]);
      return operatorJson({ facturas: rows.map(f => ({ id: f.id, ...invoiceSnapshot(f), version: digest(invoiceSnapshot(f)), reservada: f.documentosOperadora.length > 0, asignadaAVentas: f.imputadoAVentas })), total, totalPages: Math.max(1, Math.ceil(total / LIMIT)), page });
    }
    const grupos = await prisma.grupoCosteOperadora.findMany({ take: 500, orderBy: [{ nombre: 'asc' }, { id: 'asc' }] });
    if (action === 'detalle') {
      const id = params.get('id') || '';
      if (!ID.test(id)) throw new Invalid('Fuente no válida.');
      const row = await prisma.fuenteCosteOperadora.findUnique({ where: { id }, include });
      return row ? operatorJson({ fuente: publicSource(row), grupos, canWrite: auth.canWrite }) : operatorJson({ error: 'Fuente no encontrada' }, 404);
    }
    if (action) throw new Invalid('Acción no válida.');
    const origen = params.get('origen') || '';
    const estado = params.get('estado') || '';
    const grupoId = params.get('grupoId') || '';
    if ((origen && !['PROPIA', 'TERCERO'].includes(origen)) || (estado && !['BORRADOR', 'REVISADO', 'ARCHIVADO'].includes(estado)) || (grupoId && !ID.test(grupoId))) throw new Invalid('Filtro no válido.');
    const where: Prisma.FuenteCosteOperadoraWhereInput = { periodo: periodo || undefined, origen: origen || undefined, estado: estado || undefined,
      asignaciones: grupoId ? { some: { grupoId } } : undefined,
      OR: buscar ? [{ empresaPagadora: { contains: buscar, mode: 'insensitive' } }, { notas: { contains: buscar, mode: 'insensitive' } }, { snapshot: { path: ['proveedor'], string_contains: buscar } }, { snapshot: { path: ['numFactura'], string_contains: buscar } }, { asignaciones: { some: { descripcion: { contains: buscar, mode: 'insensitive' } } } }] : undefined,
    };
    const [rows, total, totals, states] = await Promise.all([
      prisma.fuenteCosteOperadora.findMany({ where, include, orderBy: [{ periodo: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * LIMIT, take: LIMIT }),
      prisma.fuenteCosteOperadora.count({ where }),
      prisma.articuloCosteOperadora.aggregate({ where: { fuente: { ...where, AND: [{ estado: { not: 'ARCHIVADO' } }] }, grupoId: grupoId || undefined }, _sum: { importe: true } }),
      prisma.fuenteCosteOperadora.groupBy({ by: ['origen', 'estado'], where, _count: { _all: true } }),
    ]);
    const count = (key: 'origen' | 'estado', value: string) => states.filter(s => s[key] === value).reduce((n, s) => n + s._count._all, 0);
    return operatorJson({ fuentes: rows.map(publicSource), grupos, total, totalPages: Math.max(1, Math.ceil(total / LIMIT)), page, canWrite: auth.canWrite,
      resumen: { baseSeleccionada: Number(totals._sum.importe || 0), propias: count('origen', 'PROPIA'), terceros: count('origen', 'TERCERO'), borradores: count('estado', 'BORRADOR'), revisadas: count('estado', 'REVISADO') } });
  } catch (error) { return operatorJson({ error: error instanceof Invalid ? error.message : 'No se pudieron cargar los costes de operadora.' }, error instanceof Invalid ? 400 : 500); }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await operatorAuth(true);
    if (auth instanceof NextResponse) return auth;
    if (req.headers.get('origin') !== req.nextUrl.origin) return operatorJson({ error: 'Origen no autorizado.' }, 403);
    if (req.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return operatorJson({ error: 'Se requiere JSON.' }, 415);
    if (Number(req.headers.get('content-length')) > 128 * 1024) return operatorJson({ error: 'Solicitud demasiado grande.' }, 413);
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 128 * 1024) return operatorJson({ error: 'Solicitud demasiado grande.' }, 413);
    let body: any; try { body = JSON.parse(raw); } catch { throw new Invalid('JSON no válido.'); }
    if (body?.action === 'grupo') {
      const parsed = groupInput.safeParse(body);
      if (!parsed.success) throw new Invalid(parsed.error.issues[0]?.message || 'Grupo no válido.');
      const v = parsed.data;
      const data = { id: v.solicitudId, nombre: v.nombre, clave: digest([normalize(v.nombre), v.ambito, normalize(v.zona || ''), normalize(v.conexion || '')]), ambito: v.ambito, zona: v.zona || null, conexion: v.conexion || null };
      const row = await prisma.grupoCosteOperadora.upsert({ where: { clave: data.clave }, create: data, update: {} });
      return operatorJson({ success: true, grupo: row });
    }
    const parsed = sourceInput.safeParse(body);
    if (!parsed.success) throw new Invalid(parsed.error.issues[0]?.message || 'Fuente no válida.');
    const v = parsed.data;
    const result = await prisma.$transaction(async tx => {
      // pg_advisory_xact_lock devuelve void, que Prisma 5 no puede deserializar.
      // Conservamos el mismo bloqueo y proyectamos únicamente un entero compatible.
      await tx.$queryRaw(Prisma.sql`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${v.id}))`);
      const previous = await tx.fuenteCosteOperadora.findUnique({ where: { id: v.id }, include });
      if (!previous && v.version) throw new Conflict('La fuente ya no existe. Recarga.');
      if (!previous && v.estado === 'ARCHIVADO') throw new Invalid('Guarda primero la fuente antes de archivarla.');
      const empresa = v.origen === 'PROPIA' ? 'Internet Operadores' : v.empresaPagadora!;
      if (v.facturaId) await tx.$queryRaw(Prisma.sql`SELECT id FROM facturas_recibidas WHERE id = ${v.facturaId} FOR UPDATE`);
      const original = v.facturaId ? await tx.facturaRecibida.findUnique({ where: { id: v.facturaId }, select: invoiceSelect }) : null;
      let snapshot: OperatorSnapshot;
      if (previous) {
        if (previous.origen !== v.origen || previous.empresaPagadora !== empresa || previous.periodo !== v.periodo || (v.origen === 'PROPIA' && previous.documentos.find(d => d.rol === 'ORIGINAL')?.facturaId !== v.facturaId)) throw new Conflict('La identidad y el período de una fuente guardada no se pueden sustituir.');
        snapshot = previous.snapshot as unknown as OperatorSnapshot;
        if (v.facturaVersion && v.facturaVersion !== previous.fuenteVersion) throw new Conflict('La versión enviada no coincide con la factura original guardada.');
        if (v.tercero && digest(externalSnapshot(v.tercero)) !== previous.fuenteVersion) throw new Conflict('El original de tercero es inmutable; conserva su trazabilidad.');
      } else {
        if (v.origen === 'PROPIA') {
          if (!original || original.estado === 'RECHAZADA') throw new Invalid('Factura original no válida.');
          snapshot = invoiceSnapshot(original);
          if (digest(snapshot) !== v.facturaVersion) throw new Conflict('La factura ha cambiado. Vuelve a seleccionarla.');
        } else snapshot = externalSnapshot(v.tercero!);
      }
      const assignments = validateAssignments(snapshot, v.asignaciones as { indice: number; grupoId: string }[], v.estado);
      const desired = { estado: v.estado, notas: v.notas || null, asignaciones: assignments.map(a => ({ indice: a.indice, grupoId: a.grupoId })).sort((a,b) => a.indice - b.indice), refacturaId: v.refacturaId === undefined ? previous?.documentos.find(d => d.rol === 'REFACTURA')?.facturaId || null : v.refacturaId };
      if (previous) {
        const oldState = { estado: previous.estado, notas: previous.notas, asignaciones: previous.asignaciones.map(a => ({ indice: a.indice, grupoId: a.grupoId })).sort((a,b) => a.indice - b.indice), refacturaId: previous.documentos.find(d => d.rol === 'REFACTURA')?.facturaId || null };
        if (digest(oldState) === digest(desired)) return previous;
        if (previous.estado === 'ARCHIVADO') throw new Conflict('La fuente archivada conserva sus documentos y no puede modificarse ni reactivarse.');
        if (v.version !== previous.version) throw new Conflict('Otra sesión ha cambiado esta fuente. Recarga antes de guardar.');
      }
      const grupos = await tx.grupoCosteOperadora.findMany({ where: { id: { in: [...new Set(assignments.map(a => a.grupoId))] } }, take: 200 });
      if (grupos.length !== new Set(assignments.map(a => a.grupoId)).size) throw new Invalid('Selecciona un grupo existente para cada artículo.');
      const documents = [] as { facturaId: string; rol: string; version: string }[];
      if (original) documents.push({ facturaId: original.id, rol: 'ORIGINAL', version: previous?.documentos.find(d => d.rol === 'ORIGINAL')?.version || digest(snapshot) });
      if (desired.refacturaId) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM facturas_recibidas WHERE id = ${desired.refacturaId} FOR UPDATE`);
        const invoice = await tx.facturaRecibida.findUnique({ where: { id: desired.refacturaId }, select: invoiceSelect });
        if (!invoice || invoice.estado === 'RECHAZADA') throw new Invalid('Factura de refacturación no válida.');
        const version = digest(invoiceSnapshot(invoice));
        const old = previous?.documentos.find(d => d.rol === 'REFACTURA' && d.facturaId === invoice.id);
        if (!old && version !== v.refacturaVersion) throw new Conflict('La refacturación ha cambiado; vuelve a seleccionarla.');
        documents.push({ facturaId: invoice.id, rol: 'REFACTURA', version: old?.version || version });
      }
      if (new Set(documents.map(d => d.facturaId)).size !== documents.length) throw new Invalid('Original y refacturación deben ser documentos distintos.');
      for (const doc of documents) {
        const reserved = await tx.documentoCosteOperadora.findUnique({ where: { facturaId: doc.facturaId }, select: { fuenteId: true } });
        if (reserved && reserved.fuenteId !== v.id) throw new Conflict('Esta factura ya está registrada como original o refacturación. No se puede duplicar el coste.');
        const linked = await tx.vinculacionFactura.count({ where: { facturaRecibidaId: doc.facturaId } });
        const allocated = await tx.imputacionCosteCliente.count({ where: { facturaId: doc.facturaId, confirmado: true } });
        const invo = doc.rol === 'ORIGINAL' ? original : await tx.facturaRecibida.findUnique({ where: { id: doc.facturaId }, select: { imputadoAVentas: true } });
        if (linked || allocated || invo?.imputadoAVentas) throw new Conflict('Esta factura ya está imputada a ventas. Revisa sus relaciones antes de registrarla como coste compartido.');
      }
      if (previous && v.estado === 'REVISADO' && previous.documentos.some(d => digest(invoiceSnapshot(d.factura)) !== d.version)) throw new Conflict('El documento original o refacturado ha cambiado. Conservamos el snapshot; revisa la diferencia antes de validarlo.');
      const claveOrigen = sourceKey(v.origen, v.facturaId, empresa, snapshot);
      const duplicate = await tx.fuenteCosteOperadora.findUnique({ where: { claveOrigen }, select: { id: true } });
      if (duplicate && duplicate.id !== v.id) throw new Conflict('El documento original ya existe en este apartado, incluso si cambias el período.');
      const data = { estado: v.estado, notas: desired.notas, version: previous ? previous.version + 1 : 1 };
      if (previous) {
        await tx.fuenteCosteOperadora.update({ where: { id: v.id }, data });
        await tx.articuloCosteOperadora.deleteMany({ where: { fuenteId: v.id } });
        await tx.documentoCosteOperadora.deleteMany({ where: { fuenteId: v.id } });
      } else await tx.fuenteCosteOperadora.create({ data: { id: v.id, claveOrigen, origen: v.origen, empresaPagadora: empresa, periodo: v.periodo, snapshot: snapshot as unknown as Prisma.InputJsonValue, fuenteVersion: digest(snapshot), creadoPor: auth.userId, ...data } });
      if (assignments.length) await tx.articuloCosteOperadora.createMany({ data: assignments.map(a => ({ fuenteId: v.id, grupoId: a.grupoId, indice: a.indice, descripcion: a.descripcion, importe: a.importe })) });
      if (documents.length) await tx.documentoCosteOperadora.createMany({ data: documents.map(d => ({ fuenteId: v.id, ...d })) });
      await tx.auditoriaCosteOperadora.create({ data: { fuenteId: v.id, usuarioId: auth.userId, accion: previous ? 'EDITAR_FUENTE' : 'CREAR_FUENTE', datos: { antes: previous ? { version: previous.version, estado: previous.estado, notas: previous.notas, asignaciones: previous.asignaciones.map(a => ({ indice: a.indice, grupoId: a.grupoId })), documentos: previous.documentos.map(d => ({ facturaId: d.facturaId, rol: d.rol })) } : null, despues: desired } } });
      return tx.fuenteCosteOperadora.findUniqueOrThrow({ where: { id: v.id }, include });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    return operatorJson({ success: true, fuente: publicSource(result) });
  } catch (error) {
    if (error instanceof Invalid || (error instanceof Error && error.name === 'Error' && /Artículo|selección|Base de factura|detalle|Revisa los artículos|Falta verificar/.test(error.message))) return operatorJson({ error: error.message }, 400);
    if (error instanceof Conflict) return operatorJson({ error: error.message }, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2004' || String(error.meta?.code) === '23514')) return operatorJson({ error: 'La factura está reservada o ya tiene costes imputados a ventas. Revisa sus relaciones.' }, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return operatorJson({ error: 'Documento duplicado o edición concurrente. Recarga antes de reintentar.' }, 409);
    return operatorJson({ error: 'No se pudo guardar; no se han modificado facturas ni repartido costes.' }, 500);
  }
}
