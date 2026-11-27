import { prisma } from '../prisma';
import type { Prisma } from '@prisma/client';
import request, { requireIspSyncActor } from './service';
import { acquireIspOrigenFenceTx, runWithIspSourceWriteTx } from '../isp-origen-server';

const fail = (code: string): never => { throw Object.assign(new Error('No se puede aplicar el snapshot ISP.'), { code, status: 409 }); };
function positive(value: unknown): number {
  if (!/^[1-9]\d*$/.test(String(value))) return fail('ISP_SNAPSHOT_INVALID');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > 2147483647) return fail('ISP_SNAPSHOT_INVALID');
  return n;
}
function amount(value: unknown): string {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) return fail('ISP_SNAPSHOT_INVALID');
  return String(value);
}
function date(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|[T ])/u.test(value)) return fail('ISP_SNAPSHOT_INVALID');
  const result = new Date(value);
  if (!Number.isFinite(result.getTime())) return fail('ISP_SNAPSHOT_INVALID');
  return result;
}
export async function getAllFacturas() {
  const data = await request('facturacion', 'GET', null, { mostrar: 5000 });
  if (!Array.isArray(data) || data.length >= 5000) return fail('ISP_SNAPSHOT_INCOMPLETE');
  return data;
}
/** Writer real reutilizado con fixtures en memoria; no recibe flags ni capability cliente. */
export async function applyIspInvoiceSnapshot(db: typeof prisma, rows: any[]) {
  const ids = rows.map((f) => positive(f.id));
  if (new Set(ids).size !== ids.length) return fail('ISP_SNAPSHOT_INVALID');
  return db.$transaction(async (tx) => {
    await requireIspSyncActor(tx);
    await acquireIspOrigenFenceTx(tx);
    for (const f of rows) {
      const ispGestionId = positive(f.id), fecha = date(f.fecha);
      const source = {
        serieFactura: String(f.serie_factura || ''), numeroDocumento: String(f.numero_documento || ''), documento: f.documento ? String(f.documento) : null,
        fecha, idCliente: positive(f.id_cliente), codigoCliente: String(f.codigo_cliente || ''), nombreCompleto: String(f.nombrecompleto || ''),
        nifCif: f.nif_cif ? String(f.nif_cif) : null, base: amount(f.base), totalImpuesto: amount(f.total_impuesto), total: amount(f.total),
        situacion: String(f.situacion || 'PENDIENTE'), totalPendiente: amount(f.total_pendiente ?? f.total), ejercicio: fecha.getUTCFullYear(),
      } satisfies Omit<Prisma.FacturaUncheckedCreateInput, 'ispGestionId'>;
      // Una colisión manual no se convierte en espejo ISP por id_externo.
      const fi = await tx.facturaEmitida.findUnique({ where: { idExterno: String(ispGestionId) } });
      if (fi && fi.origenSistema !== 'ISPGestion') return fail('ISP_ORIGEN_NO_EDITABLE');
      const factura = await tx.factura.findUnique({ where: { ispGestionId }, select: { id: true } });
      if (fi?.facturaISPId != null && fi.facturaISPId !== factura?.id) return fail('ISP_ORIGEN_NO_EDITABLE');
      const sourceFactura = await runWithIspSourceWriteTx('isp-facturas', tx, async (writerTx) => {
        return factura
          ? await writerTx.factura.update({ where: { id: factura.id }, data: source })
          : await writerTx.factura.create({ data: { ispGestionId, ...source } });
      });
      if (sourceFactura.ispGestionId !== ispGestionId || (fi?.facturaISPId != null && fi.facturaISPId !== sourceFactura.id)) return fail('ISP_ORIGEN_NO_EDITABLE');
      await runWithIspSourceWriteTx('isp-facturas', tx, async (writerTx) => {
        const base = Number(sourceFactura.base), iva = Number(sourceFactura.totalImpuesto);
        const header = { cliente: sourceFactura.nombreCompleto, cif: sourceFactura.nifCif, numFactura: sourceFactura.numeroDocumento,
          serie: sourceFactura.serieFactura, fecha: sourceFactura.fecha, base, tipoIva: base === 0 ? 0 : Number(((iva / base) * 100).toFixed(8)),
          importeIva: iva, total: Number(sourceFactura.total), concepto: String(sourceFactura.documento || '') } satisfies Prisma.FacturaEmitidaUpdateInput;
        if (fi) await writerTx.facturaEmitida.update({ where: { id: fi.id }, data: header });
        else await writerTx.facturaEmitida.create({ data: { ...header, origenSistema: 'ISPGestion', idExterno: String(ispGestionId),
          tipoIrpf: 0, importeIrpf: 0, estado: 'EMITIDA', importeCobrado: 0, fechaCobro: null } });
      }, { facturaISPId: sourceFactura.id, idExterno: String(ispGestionId) });
      // Ningún estado/importeCobrado/fechaCobro/clasificación/FK/ledger existente se modifica.
    }
    return { success: true, total: rows.length, upserted: rows.length, upsertedEmitidas: rows.length, errors: 0, errorsEmitidas: 0,
      cobradas: rows.filter((f) => f.situacion === 'COBRADA').length, pendientes: rows.filter((f) => f.situacion === 'PENDIENTE').length,
      totalFacturado: Math.round(rows.reduce((sum, f) => sum + Number(f.total), 0) * 100) / 100 };
  }, { timeout: 180000 });
}
export async function syncFacturasBatch() {
  await prisma.$transaction(async (tx) => requireIspSyncActor(tx));
  return applyIspInvoiceSnapshot(prisma, await getAllFacturas());
}
export async function getAllRemesas() {
  const data = await request('remesas', 'GET', null, { mostrar: 500 });
  if (!Array.isArray(data) || data.length >= 500) return fail('ISP_SNAPSHOT_INCOMPLETE');
  return data;
}
export async function syncRemesasBatch() {
  await prisma.$transaction(async (tx) => requireIspSyncActor(tx));
  const rows = await getAllRemesas();
  return prisma.$transaction(async (tx) => {
    await requireIspSyncActor(tx);
    await runWithIspSourceWriteTx('isp-remesas', tx, async (writerTx) => {
      const seen = new Set<number>();
      for (const r of rows) {
        const ispGestionId = positive(r.id), fecha = date(r.fecha);
        if (seen.has(ispGestionId)) return fail('ISP_SNAPSHOT_INVALID');
        seen.add(ispGestionId);
        const source = { nombre: String(r.nombre || ''), fecha, nifPresentador: r.nif_presentador || null,
          nombrePresentador: r.nombre_presentador || null, ibanAcreedor: r.iban_acredor || r.iban_acreedor || null,
          remesado: r.remesado === '1' || r.remesado === true, contabilizado: r.contabilizado === '1' || r.contabilizado === true,
          totalImporte: amount(r.total_importe), numeroRegistros: Number(r.numero_registros) || 0,
          archivoGenerado: r.archivo_generado || null, ejercicio: fecha.getUTCFullYear() };
        const existing = await writerTx.remesa.findUnique({ where: { ispGestionId }, select: { id: true } });
        if (existing) await writerTx.remesa.update({ where: { id: existing.id }, data: source });
        else await writerTx.remesa.create({ data: { ispGestionId, ...source } });
      }
    });
    return { success: true, total: rows.length, upserted: rows.length, errors: 0,
      totalRemesado: Math.round(rows.reduce((sum, r) => sum + Number(r.total_importe), 0) * 100) / 100 };
  });
}
