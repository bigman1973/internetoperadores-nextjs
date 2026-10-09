import { createHash } from 'node:crypto';
import { z } from 'zod';

export const OPERATOR_AREA = 'admin.finanzas.analitica_costes';
export const ID = /^[a-zA-Z0-9_-]{1,80}$/;
export const HASH = /^[a-f0-9]{64}$/;
export const PERIOD = /^(20\d{2})-(0[1-9]|1[0-2])$/;
export const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().min(1).max(max).refine(v => !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(v), 'Texto no válido');
const money = z.number().finite().min(-999999999).max(999999999).refine(v => Math.abs(v * 100 - Math.round(v * 100)) < 0.00001, 'Máximo dos decimales');
export const groupInput = z.object({
  action: z.literal('grupo'), solicitudId: uuid, nombre: text(160),
  ambito: z.enum(['GLOBAL_RED_PROPIA', 'ZONA']), zona: text(160).optional(), conexion: text(160).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.ambito === 'ZONA' && (!v.zona || !v.conexion)) ctx.addIssue({ code: 'custom', message: 'Indica la zona y la conexión.' });
  if (v.ambito === 'GLOBAL_RED_PROPIA' && (v.zona || v.conexion)) ctx.addIssue({ code: 'custom', message: 'Un grupo global no puede tener zona o conexión.' });
});
const date = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(v => {
  const parsed = new Date(v + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
}, 'Fecha no válida');
export const sourceInput = z.object({
  action: z.literal('guardar'), id: uuid, version: z.number().int().min(1).optional(),
  origen: z.enum(['PROPIA', 'TERCERO']), empresaPagadora: text(160).optional(), periodo: z.string().regex(PERIOD).optional(),
  facturaId: z.string().regex(ID).optional(), facturaVersion: z.string().regex(HASH).optional(),
  tercero: z.object({ proveedor: text(160), numFactura: text(100), fecha: date, base: money,
    concepto: z.string().trim().max(2000).optional(), lineas: z.array(z.object({ descripcion: text(2000), importe: money }).strict()).min(1).max(200),
  }).strict().optional(),
  refacturaId: z.string().regex(ID).nullable().optional(), refacturaVersion: z.string().regex(HASH).optional(),
  asignaciones: z.array(z.object({ indice: z.number().int().min(-1).max(199), grupoId: z.string().regex(ID) }).strict()).max(200),
  estado: z.enum(['BORRADOR', 'REVISADO', 'ARCHIVADO']), notas: z.string().trim().max(4000).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.origen === 'PROPIA' && (!v.facturaId || (!v.version && !v.facturaVersion) || v.tercero)) ctx.addIssue({ code: 'custom', message: 'Selecciona una factura propia y su versión.' });
  if (v.origen === 'TERCERO' && ((!v.version && !v.tercero) || !v.empresaPagadora || v.facturaId)) ctx.addIssue({ code: 'custom', message: 'Indica la empresa pagadora y la factura original de tercero.' });
  if (v.refacturaId && v.refacturaId === v.facturaId) ctx.addIssue({ code: 'custom', message: 'La factura original y la refacturada no pueden ser la misma.' });
  const indices = v.asignaciones.map(a => a.indice);
  if (new Set(indices).size !== indices.length || (indices.includes(-1) && indices.length > 1)) ctx.addIssue({ code: 'custom', message: 'No se puede contar dos veces un artículo o combinar la factura completa con artículos.' });
  if (v.estado === 'REVISADO' && !indices.length) ctx.addIssue({ code: 'custom', message: 'Selecciona al menos un artículo antes de marcar revisado.' });
});

export type OperatorLine = { index: number; descripcion: string; importe: number | null };
export type OperatorSnapshot = { proveedor: string; numFactura: string | null; fecha: string; base: number; concepto: string | null; lineas: OperatorLine[]; detalleInvalido?: boolean };
export const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const normalize = (v: string) => v.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-ES');
export const cents = (v: number) => Math.round(v * 100);

export function invoiceSnapshot(invoice: { proveedor: string; numFactura: string | null; fecha: Date; base: number; concepto: string | null; lineasDetalle: string | null }): OperatorSnapshot {
  let lineas: OperatorLine[] = [];
  let detalleInvalido = false;
  if (invoice.lineasDetalle) {
    try {
      const rows = JSON.parse(invoice.lineasDetalle);
      if (!Array.isArray(rows) || rows.length > 200) throw new Error('Detalle no válido');
      lineas = rows.map((row, index) => {
        const value = row?.importeNeto ?? row?.importe;
        const amount = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : null;
        return { index, descripcion: typeof row?.descripcion === 'string' ? row.descripcion.slice(0, 2000) : 'Artículo sin descripción', importe: amount !== null && Number.isFinite(amount) && Math.abs(amount) < 1000000000 ? cents(amount) / 100 : null };
      });
      detalleInvalido = lineas.some(l => l.importe === null);
    } catch { detalleInvalido = true; }
  }
  return { proveedor: invoice.proveedor, numFactura: invoice.numFactura, fecha: invoice.fecha.toISOString().slice(0, 10), base: invoice.base, concepto: invoice.concepto, lineas, detalleInvalido };
}

export function validateAssignments(snapshot: OperatorSnapshot, requested: { indice: number; grupoId: string }[], estado: string) {
  if (!Number.isFinite(snapshot.base) || Math.abs(snapshot.base) >= 1000000000) throw new Error('Base de factura no válida.');
  const seen = new Set<number>();
  const selected = requested.map(a => {
    if (seen.has(a.indice)) throw new Error('Artículo duplicado.');
    seen.add(a.indice);
    if (a.indice === -1) {
      if (snapshot.lineas.length || snapshot.detalleInvalido || requested.length !== 1) throw new Error('Revisa los artículos originales antes de seleccionar la factura completa.');
      return { ...a, descripcion: snapshot.concepto || 'Factura completa sin desglose de artículos', importe: cents(snapshot.base) / 100 };
    }
    const line = snapshot.lineas.find(l => l.index === a.indice);
    if (!line || line.importe === null) throw new Error('Artículo no válido o sin importe verificable.');
    return { ...a, descripcion: line.descripcion, importe: line.importe };
  });
  const sum = selected.reduce((s, l) => s + cents(l.importe), 0);
  if ((snapshot.base >= 0 && (sum < 0 || sum > cents(snapshot.base) + 2)) || (snapshot.base < 0 && (sum > 0 || sum < cents(snapshot.base) - 2))) throw new Error('La selección supera la base de la factura; revisa el detalle sin corregirlo automáticamente.');
  if (estado === 'REVISADO') {
    if (!selected.length || snapshot.detalleInvalido) throw new Error('Falta verificar el detalle de artículos.');
    if (snapshot.lineas.length && Math.abs(snapshot.lineas.reduce((s, l) => s + cents(l.importe ?? 0), 0) - cents(snapshot.base)) > 2) throw new Error('El detalle no cuadra con la base de factura. Corrígelo en su origen antes de revisar.');
  }
  return selected;
}

export function externalSnapshot(input: NonNullable<z.infer<typeof sourceInput>['tercero']>): OperatorSnapshot {
  return { proveedor: input.proveedor, numFactura: input.numFactura, fecha: input.fecha, base: input.base, concepto: input.concepto || null, lineas: input.lineas.map((l, index) => ({ index, descripcion: l.descripcion!, importe: l.importe! })), detalleInvalido: false };
}
export function sourceKey(origen: string, facturaId: string | undefined, empresa: string, snapshot: OperatorSnapshot) {
  // El período de coste no forma parte de la identidad: moverlo no crea otra factura.
  return digest(origen === 'PROPIA' ? ['FACTURA', facturaId] : ['TERCERO', normalize(empresa), normalize(snapshot.proveedor), normalize(snapshot.numFactura || '')]);
}
