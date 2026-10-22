import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read';
import { resolveInvoiceLibrary, listFolderContents, downloadFile, FACTURAS_BASE_PATH } from '@/lib/finanzas/microsoft-graph';
import { extraerDatosFactura } from '@/lib/finanzas/ocr-facturas';
import { INVOICE_FOLDERS, InvoiceFolderKey, invoiceFile, invoiceLocation, inventoryStatus, normalizeInvoiceFolder, unavailableFolder } from '@/lib/finanzas/onedrive-inventory';
import { fechaDocumentoUtc, validarResultadoOcrNuevo } from '@/lib/finanzas/invoice-quality';
import { auditarCambioB2, buscarIdentidadBloqueada, planDeduplicacion } from '@/lib/finanzas/invoice-quality-db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;
const area = 'admin.finanzas.facturas';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function auth(write: boolean) {
  const session = await getServerSession(authOptions);
  const userId = Number(session?.user?.id);
  if (session?.user?.userType !== 'admin' || !Number.isSafeInteger(userId) || userId <= 0) return json({ error: 'No autorizado' }, 401);
  const active = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { activo: true } });
  if (!active?.activo) return json({ error: 'No autorizado' }, 401);
  const denied = await (write ? checkAdminAreaWrite : checkAdminAreaRead)(area, ['CONTABILIDAD'], session);
  if (denied) return json({ error: write ? 'Sin permiso de escritura' : 'Sin permiso de lectura' }, denied.status);
  return { userId, canWrite: write || !(await checkAdminAreaWrite(area, ['CONTABILIDAD'], session)) };
}
async function isolationCheck() {
  if (process.env.VERCEL_ENV !== 'preview' && process.env.FINANCE_STAGING_SANDBOX !== '1') return;
  if (process.env.FINANCE_STAGING_SANDBOX !== '1') throw new Error('ISOLATION');
  const rows = await prisma.$queryRaw<Array<{ db: string; usuario: string }>>`SELECT current_database() AS db, current_user AS usuario`;
  if (rows[0]?.db !== 'io_staging_finanzas' || rows[0]?.usuario !== 'io_staging_finanzas') throw new Error('ISOLATION');
}
const locationSelect = { id: true, oneDriveItemId: true, carpetaOrigen: true, archivoOneDrive: true, oneDriveDriveId: true, oneDriveRutaActual: true, estadoCarpeta: true, etiquetaMateriales: true } as const;
type InvoiceLocation = Prisma.FacturaRecibidaGetPayload<{ select: typeof locationSelect }>;
function locationSnapshot(invoice: InvoiceLocation) {
  return { carpetaOrigen: invoice.carpetaOrigen, archivoOneDrive: invoice.archivoOneDrive, oneDriveDriveId: invoice.oneDriveDriveId, oneDriveRutaActual: invoice.oneDriveRutaActual, estadoCarpeta: invoice.estadoCarpeta, etiquetaMateriales: invoice.etiquetaMateriales };
}
async function boundedUpdates(tasks: Array<() => Promise<void>>) {
  // Cuatro filas independientes como máximo; esperar todos los trabajadores antes de responder.
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (next < tasks.length) {
      const task = tasks[next++];
      try { await task(); } catch { failed = true; }
    }
  }));
  if (failed) throw new Error('LOCATION_UPDATES_INCOMPLETE');
}
async function inventory() {
  const ubicacion = await resolveInvoiceLibrary();
  const folders = {} as Record<InvoiceFolderKey, { items: any[] | null; status: ReturnType<typeof inventoryStatus> | ReturnType<typeof unavailableFolder> }>;
  const existentes = await prisma.facturaRecibida.findMany({ where: { oneDriveItemId: { not: null } }, select: locationSelect });
  const revisiones = await prisma.revisionLecturaFacturaRecibida.findMany({ where: { oneDriveItemId: { not: null } }, select: { id: true, oneDriveItemId: true, oneDriveDriveId: true, oneDriveRutaActual: true, carpetaOrigen: true, archivoOneDrive: true, estadoCarpeta: true, version: true } });
  const ids = new Set([...existentes.map(f => f.oneDriveItemId!), ...revisiones.map(r => r.oneDriveItemId!)]);
  const seen = new Set<string>();
  for (const [key, config] of Object.entries(INVOICE_FOLDERS) as Array<[InvoiceFolderKey, typeof INVOICE_FOLDERS[InvoiceFolderKey]]>) {
    try {
      const path = key === 'raiz' ? FACTURAS_BASE_PATH : `${FACTURAS_BASE_PATH}/${config.nombre}`;
      const items = (await listFolderContents(ubicacion.driveId, path, key !== 'raiz')).filter((item: any) => !item.folder);
      for (const item of items) {
        if (typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) throw new Error('INVALID_INVENTORY_ID');
        seen.add(item.id);
        if (invoiceFile(item)) invoiceLocation(item, key, ubicacion.driveId);
      }
      folders[key] = { items, status: inventoryStatus(items, ids) };
    } catch {
      folders[key] = { items: null, status: unavailableFolder() };
    }
  }
  return { ubicacion, folders, existentes, revisiones };
}
export async function GET(req: NextRequest) {
  const access = await auth(false);
  if (access instanceof NextResponse) return access;
  try {
    await isolationCheck();
    const facturaId = req.nextUrl.searchParams.get('facturaId');
    if (facturaId) {
      if (facturaId.length > 100) return json({ error: 'Identificador inválido' }, 400);
      const historial = await prisma.historialUbicacionFacturaRecibida.findMany({ where: { facturaId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, motivo: true, anterior: true, actual: true, createdAt: true } });
      return json({ historial });
    }
    const data = await inventory();
    const resultado = Object.fromEntries(Object.entries(data.folders).map(([key, val]) => [key, val.status]));
    const errores = Object.entries(data.folders).filter(([, f]) => !f.items).map(([key]) => ({ carpeta: key, error: unavailableFolder().error }));
    const complete = errores.length === 0;
    const sum = (field: 'total' | 'nuevos' | 'yaImportados' | 'admitidos') => complete ? Object.values(data.folders).reduce((n, f) => n + (f.status[field] || 0), 0) : null;
    return json({ ...resultado, pendientes: resultado.pendiente, totalNuevos: sum('nuevos'), totalArchivos: sum('total'), totalImportados: sum('yaImportados'), totalAdmitidos: sum('admitidos'), inventarioCompleto: complete, ubicacion: data.ubicacion, errores, canWrite: access.canWrite, sandbox: process.env.FINANCE_STAGING_SANDBOX === '1' });
  } catch (e) {
    return json({ error: e instanceof Error && e.message === 'ISOLATION' ? 'Staging bloqueado: no se ha verificado la base de datos aislada.' : 'No se pudo resolver la biblioteca configurada. Comprueba los IDs de sitio y biblioteca y sus permisos.' }, 503);
  }
}

async function updateLocation(invoiceId: string, changes: ReturnType<typeof invoiceLocation> | { carpetaOrigen: string | null }, userId: number, motivo: string) {
  return prisma.$transaction(async tx => {
    // Bloqueo de fila idempotente, sin devolver tipos void a Prisma.
    await tx.$queryRaw`SELECT id FROM facturas_recibidas WHERE id = ${invoiceId} FOR UPDATE`;
    const invoice = await tx.facturaRecibida.findUnique({ where: { id: invoiceId }, select: locationSelect });
    if (!invoice) return false;
    if ('oneDriveDriveId' in changes && invoice.oneDriveDriveId && invoice.oneDriveDriveId !== changes.oneDriveDriveId) throw new Error('DRIVE_MISMATCH');
    const before = locationSnapshot(invoice);
    const after = { ...before, ...changes };
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    await tx.facturaRecibida.update({ where: { id: invoiceId }, data: changes });
    await tx.historialUbicacionFacturaRecibida.create({ data: { facturaId: invoiceId, autorId: userId, motivo, anterior: before, actual: after } });
    return true;
  }, { maxWait: 10000, timeout: 15000 });
}
const MAX_JSON_BYTES = 4096;
async function readBoundedJson(req: NextRequest): Promise<{ body?: any; error?: number }> {
  const contentLength = req.headers.get('content-length');
  if (contentLength !== null && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_BYTES) return { error: 413 };
  const reader = req.body?.getReader();
  if (!reader) return { error: 400 };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || typeof value.byteLength !== 'number') return { error: 400 };
      const chunk = new Uint8Array(value);
      size += chunk.byteLength;
      if (size > MAX_JSON_BYTES) {
        try { await reader.cancel(); } catch { /* stream cancellation is best effort */ }
        return { error: 413 };
      }
      chunks.push(chunk);
    }
  } catch {
    return { error: 400 };
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return { body: JSON.parse(new TextDecoder().decode(bytes)) }; } catch { return { error: 400 }; }
}
export async function POST(req: NextRequest) {
  const access = await auth(true);
  if (access instanceof NextResponse) return access;
  if (req.headers.get('origin') !== req.nextUrl.origin) return json({ error: 'Origen no permitido' }, 403);
  if (!req.headers.get('content-type')?.includes('application/json')) return json({ error: 'Se requiere JSON' }, 415);
  const parsed = await readBoundedJson(req);
  if (parsed.error === 413) return json({ error: 'Solicitud demasiado grande' }, 413);
  if (parsed.error) return json({ error: 'JSON inválido' }, 400);
  const body = parsed.body;
  const carpeta = body?.carpeta ?? 'todas';
  const limite = body?.limite ?? 10;
  const soloUbicaciones = body?.soloUbicaciones ?? false;
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Number.isInteger(limite) || limite < 1 || limite > 20 || typeof soloUbicaciones !== 'boolean' || !['todas', 'ambas', ...Object.keys(INVOICE_FOLDERS)].includes(carpeta)) return json({ error: 'Parámetros de sincronización inválidos' }, 400);
  try {
    await isolationCheck();
    const data = await inventory();
    // C9: confirming Draxton es comunicación de cliente, no factura recibida. Esta
    // ruta no la descarga ni crea FacturaRecibida/OCR; el integrador usará el flujo
    // documental seguro y con confirmación humana descrito en CONTRATO.md.
    if (carpeta === 'confirming_draxton') return json({ error: 'Confirming Draxton no se importa como factura recibida. Requiere clasificación documental y confirmación humana.' }, 422);
    const keys: InvoiceFolderKey[] = carpeta === 'todas'
      ? (Object.keys(INVOICE_FOLDERS).filter((key) => key !== 'confirming_draxton') as InvoiceFolderKey[])
      : carpeta === 'ambas' ? ['pendiente', 'materiales'] : [carpeta as InvoiceFolderKey];
    // Inventario parcial: no normalizar ni registrar una ubicación posiblemente incompleta.
    const failed = keys.filter(key => data.folders[key].items === null);
    if (failed.length) return json({ error: 'Lectura incompleta: no se han modificado facturas. Revisa las carpetas indicadas.', carpetasError: failed, procesados: 0, ubicacionesActualizadas: 0, normalizadas: 0, inventarioCompleto: false }, 503);
    let ubicacionesActualizadas = 0, normalizadas = 0, procesados = 0, errores = 0;
    const existing = new Map(data.existentes.map(f => [f.oneDriveItemId!, f]));
    const revisiones = new Map(data.revisiones.map(r => [r.oneDriveItemId!, r]));
    const resultados: Array<{ archivo: string; carpeta: string; estado: string; error?: string }> = [];
    const preflight = new Set<string>();
    for (const key of keys) for (const item of data.folders[key].items!) {
      if (!invoiceFile(item)) continue;
      if (preflight.has(item.id)) throw new Error('DUPLICATE_LOCATION');
      preflight.add(item.id);
      invoiceLocation(item, key, data.ubicacion.driveId);
      const invoice = existing.get(item.id);
      const revision = revisiones.get(item.id);
      if (revision?.oneDriveDriveId && revision.oneDriveDriveId !== data.ubicacion.driveId) throw new Error('DRIVE_MISMATCH');
      if (invoice?.oneDriveDriveId && invoice.oneDriveDriveId !== data.ubicacion.driveId) throw new Error('DRIVE_MISMATCH');
    }
    const legacy = [...preflight].filter(id => existing.has(id) && !existing.get(id)!.oneDriveDriveId);
    if (legacy.length && body.bibliotecaHistoricaConfirmada !== data.ubicacion.driveId) return json({
      error: 'Los documentos históricos no conservan el ID de su biblioteca. Confirma su procedencia antes de actualizar ubicaciones; no se ha escrito ningún dato.',
      requiereConfirmarBiblioteca: true, cantidad: legacy.length, driveId: data.ubicacion.driveId, ubicacion: data.ubicacion,
      procesados: 0, ubicacionesActualizadas: 0, normalizadas: 0,
    }, 409);
    const seen = new Set<string>();
    const updates: Array<() => Promise<void>> = [];
    // Actualizar todos los documentos existentes independientemente del límite OCR.
    for (const key of keys) for (const item of data.folders[key].items!) {
      if (!invoiceFile(item)) continue;
      if (seen.has(item.id)) throw new Error('DUPLICATE_LOCATION');
      seen.add(item.id);
      const invoice = existing.get(item.id);
      const revision = revisiones.get(item.id);
      if (revision && !invoice) {
        const { etiquetaMateriales: _etiqueta, ...nextLocation } = invoiceLocation(item, key, data.ubicacion.driveId);
        updates.push(async () => { await prisma.$transaction(async tx => {
          await tx.$queryRaw`SELECT id FROM revisiones_lectura_facturas_recibidas WHERE id = ${revision.id} FOR UPDATE`;
          const current = await tx.revisionLecturaFacturaRecibida.findUnique({ where: { id: revision.id } });
          if (!current) return;
          const anterior = { oneDriveDriveId: current.oneDriveDriveId, oneDriveRutaActual: current.oneDriveRutaActual, carpetaOrigen: current.carpetaOrigen, archivoOneDrive: current.archivoOneDrive, estadoCarpeta: current.estadoCarpeta };
          if (Object.entries(nextLocation).every(([key, value]) => (current as unknown as Record<string, unknown>)[key] === value)) return;
          await tx.revisionLecturaFacturaRecibida.update({ where: { id: current.id }, data: { ...nextLocation, version: { increment: 1 } } });
          await auditarCambioB2(tx, { revisionId: current.id, actorId: access.userId, accion: 'UBICACION_CUARENTENA_B2', detalle: { anterior, actual: nextLocation } });
          ubicacionesActualizadas++;
        }, { maxWait: 10000, timeout: 15000 }); });
      }
      if (invoice) {
        if (invoice.oneDriveDriveId && invoice.oneDriveDriveId !== data.ubicacion.driveId) throw new Error('DRIVE_MISMATCH');
        updates.push(async () => { if (await updateLocation(invoice.id, invoiceLocation(item, key, data.ubicacion.driveId), access.userId, invoice.oneDriveDriveId ? 'LECTURA_ONEDRIVE' : 'VERIFICACION_BIBLIOTECA_HISTORICA')) ubicacionesActualizadas++; });
      }
    }
    await boundedUpdates(updates);
    // Normalizar alias también para documentos no encontrados, sin inferir traslado ni estado.
    if (carpeta === 'todas') for (const invoice of data.existentes) {
      if (seen.has(invoice.oneDriveItemId!)) continue;
      const normalized = normalizeInvoiceFolder(invoice.carpetaOrigen);
      if (normalized !== invoice.carpetaOrigen && await updateLocation(invoice.id, { carpetaOrigen: normalized }, access.userId, 'NORMALIZACION_ETIQUETA')) normalizadas++;
    }
    if (!soloUbicaciones) for (const key of keys) for (const item of data.folders[key].items!) {
      if (!invoiceFile(item) || existing.has(item.id) || revisiones.has(item.id) || procesados + errores >= limite) continue;
      if (key === 'confirming_draxton') throw new Error('C9_CONFIRMING_IMPORT_BLOCKED');
      try {
        const buffer = await downloadFile(data.ubicacion.driveId, item.id);
        const ext = item.name.toLowerCase().split('.').pop();
        const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', tiff: 'image/tiff' } as Record<string,string>)[ext!] || 'application/pdf';
        const datos = await extraerDatosFactura(buffer.toString('base64'), mime, item.name);
        const location = invoiceLocation(item, key, data.ubicacion.driveId);
        const validacion = validarResultadoOcrNuevo(datos);
        await prisma.$transaction(async tx => {
          if (validacion.ok === false) {
            // Conserva exactamente el resultado OCR (incluidos importes leídos
            // pero inválidos) para revisión; la cola nunca crea una factura 0 €.
            const motivoRevision = validacion.motivo;
            await tx.revisionLecturaFacturaRecibida.upsert({
              where: { oneDriveItemId: item.id },
              update: { ...location, proveedor: typeof datos.proveedor === 'string' ? datos.proveedor : null, cif: typeof datos.cif === 'string' ? datos.cif : null, numFactura: typeof datos.numFactura === 'string' ? datos.numFactura : null, fecha: typeof datos.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? fechaDocumentoUtc(datos.fecha) : null, base: typeof datos.base === 'number' && Number.isFinite(datos.base) ? datos.base : null, tipoIva: typeof datos.tipoIva === 'number' && Number.isFinite(datos.tipoIva) ? datos.tipoIva : null, importeIva: typeof datos.importeIva === 'number' && Number.isFinite(datos.importeIva) ? datos.importeIva : null, tipoIrpf: typeof datos.tipoIrpf === 'number' && Number.isFinite(datos.tipoIrpf) ? datos.tipoIrpf : null, importeIrpf: typeof datos.importeIrpf === 'number' && Number.isFinite(datos.importeIrpf) ? datos.importeIrpf : null, total: typeof datos.total === 'number' && Number.isFinite(datos.total) ? datos.total : null, concepto: typeof datos.concepto === 'string' ? datos.concepto : null, ocrConfianza: typeof datos.confianza === 'number' && Number.isFinite(datos.confianza) ? datos.confianza : null, datosOcrRaw: JSON.stringify(datos), motivoRevision },
              create: { oneDriveItemId: item.id, ...location, proveedor: typeof datos.proveedor === 'string' ? datos.proveedor : null, cif: typeof datos.cif === 'string' ? datos.cif : null, numFactura: typeof datos.numFactura === 'string' ? datos.numFactura : null, fecha: typeof datos.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? fechaDocumentoUtc(datos.fecha) : null, base: typeof datos.base === 'number' && Number.isFinite(datos.base) ? datos.base : null, tipoIva: typeof datos.tipoIva === 'number' && Number.isFinite(datos.tipoIva) ? datos.tipoIva : null, importeIva: typeof datos.importeIva === 'number' && Number.isFinite(datos.importeIva) ? datos.importeIva : null, tipoIrpf: typeof datos.tipoIrpf === 'number' && Number.isFinite(datos.tipoIrpf) ? datos.tipoIrpf : null, importeIrpf: typeof datos.importeIrpf === 'number' && Number.isFinite(datos.importeIrpf) ? datos.importeIrpf : null, total: typeof datos.total === 'number' && Number.isFinite(datos.total) ? datos.total : null, concepto: typeof datos.concepto === 'string' ? datos.concepto : null, ocrConfianza: typeof datos.confianza === 'number' && Number.isFinite(datos.confianza) ? datos.confianza : null, datosOcrRaw: JSON.stringify(datos), motivoRevision },
            });
            return;
          }
          const coincidencias = await buscarIdentidadBloqueada(tx, validacion.identidad);
          const plan = coincidencias.length ? planDeduplicacion(coincidencias) : null;
          const invoice = await tx.facturaRecibida.create({ data: { proveedor: datos.proveedor, cif: datos.cif, numFactura: datos.numFactura, fecha: fechaDocumentoUtc(datos.fecha), base: datos.base, tipoIva: datos.tipoIva, importeIva: datos.importeIva, tipoIrpf: datos.tipoIrpf, importeIrpf: datos.importeIrpf, total: datos.total, concepto: datos.concepto, estado: 'PENDIENTE_REVISION', calidad: plan?.canonica ? 'COPIA' : 'VALIDA', canonKey: validacion.identidad, copiaDeId: plan?.canonica?.id || null, fechaProvenancia: 'DOCUMENTO', conflictoIdentidad: plan?.conflicto || false, duplicadoExterno: Boolean(plan?.conflicto), ...location, oneDriveItemId: item.id, ocrCompletado: true, ocrConfianza: datos.confianza, datosOcrRaw: JSON.stringify(datos), deducibleIva: true, ...(key === 'confirming_draxton' ? { formaPago: 'confirming', confirmingProveedor: 'Draxton' } : {}) } });
          await tx.historialUbicacionFacturaRecibida.create({ data: { facturaId: invoice.id, autorId: access.userId, motivo: plan ? 'ALTA_ONEDRIVE_COPIA_B2' : 'ALTA_ONEDRIVE', anterior: {}, actual: location } });
          await auditarCambioB2(tx, { facturaId: invoice.id, actorId: access.userId, accion: plan?.canonica ? 'ALTA_ONEDRIVE_COPIA_B2' : 'ALTA_ONEDRIVE_B2', detalle: { canonKey: validacion.identidad, calidad: plan?.canonica ? 'COPIA' : 'VALIDA', copiaDeId: plan?.canonica?.id || null, conflictoIdentidad: Boolean(plan?.conflicto), ocr: { proveedor: datos.proveedor, cif: datos.cif, numFactura: datos.numFactura, fecha: datos.fecha, base: datos.base, importeIva: datos.importeIva, importeIrpf: datos.importeIrpf, total: datos.total } } });
        });
        existing.set(item.id, { id: '', oneDriveItemId: item.id, ...location });
        procesados++;
        resultados.push({ archivo: item.name, carpeta: INVOICE_FOLDERS[key].nombre, estado: validacion.ok ? 'ok' : 'cuarentena_revisar_lectura' });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') { resultados.push({ archivo: item.name, carpeta: INVOICE_FOLDERS[key].nombre, estado: 'ya_importado' }); continue; }
        errores++;
        resultados.push({ archivo: item.name, carpeta: INVOICE_FOLDERS[key].nombre, estado: 'error', error: 'No se ha creado la factura: lectura incompleta o conflicto. Revisar el documento.' });
      }
    }
    return json({ mensaje: `${ubicacionesActualizadas} ubicaciones actualizadas, ${normalizadas} etiquetas normalizadas; ${procesados} documentos nuevos, ${errores} errores. No se han cambiado importes de facturas existentes, validaciones ni pagos.`, procesados, errores, ubicacionesActualizadas, normalizadas, resultados, inventarioCompleto: true });
  } catch {
    return json({ error: 'No se completó la actualización. Los cambios confirmados conservan historial; reintenta para continuar sin duplicarlos.' }, 503);
  }
}
