import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { RentabilidadError, monthSchema, INITIAL_PRODUCTS } from '@/lib/rentabilidad/types';
import { getRentabilidadReport } from '@/lib/rentabilidad/report';
import { rentabilidadAutomationStatus } from '@/lib/rentabilidad/status';

export const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
export const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
export function failure(error: unknown) {
  if (error instanceof RentabilidadError) {
    const messages:Record<string,string>={
      REOPEN_REVISION_CONFLICT:'Hay cambios posteriores a esta decisión. No se ha deshecho nada; revisa el historial antes de reabrir.',
      REOPEN_REVIEW_REQUIRED:'Esta decisión antigua no conserva la información necesaria para una reversión segura. No se ha modificado nada.',
      EXCEPTION_ALREADY_RESOLVED:'La excepción ya está resuelta. Reábrela antes de guardar una decisión diferente.',
      ORIGIN_NOT_ALLOWED:'La operación debe iniciarse desde la misma página de staging.',
      ALIAS_CONFLICT:'La fila contiene valores contradictorios para el mismo campo. Revisa su origen antes de importarla.',
      FOTO_DESGLOSE_NO_DISPONIBLE:'La foto del desglose ya no está disponible para este mes. Recarga la pantalla o revisa las fuentes.',
    };
    return reply({error:messages[error.code]??error.code,code:error.code},error.status);
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError) return reply({ error: 'Entrada no válida. Revisa los campos.' }, 400);
  // Never return or log stack traces, source payloads, session data or database errors.
  return reply({ error: 'No se pudo completar la operación. Consulta el estado del módulo.' }, 500);
}
const text = z.string().trim().min(1).max(240);
const optionalText = z.string().trim().max(240).optional();
export const querySchema = z.object({ month: monthSchema.optional(), mode: z.enum(['real', 'contratado']).default('real'), detalle: z.enum(['cliente', 'producto']).optional(), clave: z.string().trim().min(1).max(200).optional(), vista: z.enum(['facturado', 'coste', 'contratos']).optional(), snapshot: z.string().uuid().optional() }).strict().refine(q => !q.detalle || (!!q.clave && !!q.vista && !!q.month), { message: 'DETALLE_INCOMPLETO' }).refine(q => !q.snapshot || !!q.detalle, { message: 'SNAPSHOT_SOLO_DETALLE' });
export function parseQuery(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (Array.from(params.keys()).some(key => params.getAll(key).length !== 1)) throw new RentabilidadError('DUPLICATED_PARAMETER');
  return querySchema.parse(Object.fromEntries(params));
}
export async function readJson(req: NextRequest): Promise<unknown> {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) throw new RentabilidadError('ORIGIN_NOT_ALLOWED', 403);
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new RentabilidadError('JSON_REQUIRED', 415);
  const declared = req.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 65_536)) throw new RentabilidadError('REQUEST_TOO_LARGE', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new RentabilidadError('JSON_REQUIRED');
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 65_536) { await reader.cancel(); throw new RentabilidadError('REQUEST_TOO_LARGE', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const commonRule = { key: text.optional(), active: z.boolean().default(true), priority: z.number().int().min(0).max(100_000).default(0), productoId: text };
export const tariffRuleSchema = z.object({
  ...commonRule, type: z.literal('tariffRule'), matchType: z.enum(['CONTAINS', 'PREFIX', 'EXACT']), pattern: text, proveedor: text,
}).strict();
export const costRuleSchema = z.object({
  ...commonRule, type: z.literal('costRule'), proveedorNombre: optionalText, proveedorCif: optionalText,
  invoicePattern: optionalText, conceptPattern: optionalText,
  method: z.enum(['DIRECTA', 'INGRESO', 'MB', 'EXCLUIR']), period: z.enum(['MES', 'BIMESTRAL_VENCIDO', 'ANUAL']),
  directClient: optionalText, directContract: optionalText,
  periodAnchor: z.literal('INVOICE_MONTH').optional(),
}).strict().refine(row => Boolean(row.proveedorNombre || row.proveedorCif), { message: 'Proveedor requerido' })
  .refine(row => !row.periodAnchor || row.period === 'ANUAL', { message: 'El anclaje confirmado solo se aplica a anualidades' })
  .refine(row => row.method !== 'EXCLUIR' || (row.productoId === 'OTROS' && row.period === 'MES'), { message: 'La exclusión de estructura usa OTROS y MES' });
export const ruleSchema = z.union([tariffRuleSchema, costRuleSchema]);
export const exceptionSchema = z.object({
  exceptionKey: text, action: z.enum(['ASIGNAR_PROVEEDOR', 'CONFIRMAR_COSTE', 'DESCARTAR', 'REABRIR']),
  proveedor: text.optional(), productoId: text.optional(), note: z.string().trim().max(1000).optional(), rule: ruleSchema.optional(),
  costKey: text.optional(), amount: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
}).strict().superRefine((row, context) => {
  if (row.action === 'ASIGNAR_PROVEEDOR' && (!row.proveedor || !row.productoId)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Proveedor y producto requeridos' });
  if (row.action === 'CONFIRMAR_COSTE' && !row.costKey) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Clave de coste requerida' });
});
const date = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
export const externalSchema = z.union([
  z.object({ action: z.literal('save'), key: text.optional(), mes: monthSchema, proveedor: text, productoId: text,
    importe: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/), sociedadPagadora: z.enum(['Vola', 'Sotic']),
    note: z.string().trim().max(1000).default(''), fechaBaja: date.optional(),
  }).strict(),
  z.object({ action: z.literal('end'), key: text, fechaBaja: date }).strict(),
]);
export async function viewReport(month?: string, mode = 'real') {
  const report = await getRentabilidadReport(month, mode);
  return decorateReport(report);
}
export function decorateReport(report: any) {
  return {
    ...report,
    productCatalog: report.productCatalog ?? INITIAL_PRODUCTS,
    syncStatus: report.syncStatus ?? rentabilidadAutomationStatus(report.runs ?? []),
  };
}
export function assertProduct(productoId: string) {
  if (!INITIAL_PRODUCTS.some(product => product.key === productoId)) throw new RentabilidadError('INVALID_PRODUCT');
}
export function assertRuleProduct(rule: z.infer<typeof ruleSchema>) { assertProduct(rule.productoId); }
