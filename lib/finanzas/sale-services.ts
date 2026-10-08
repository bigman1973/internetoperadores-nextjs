export const SERVICE_TYPES = {
  PROYECTO: 'Proyecto · material y horas',
  TELECO_INTERMEDIACION: 'Telecomunicaciones · intermediación',
  TELECO_RED_PROPIA: 'Telecomunicaciones · red propia',
} as const;
export type ServiceType = keyof typeof SERVICE_TYPES;
export interface SaleService { id?: string; nombre: string; tipo: ServiceType; base: number }
export function serviceCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) >= 1e10 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) {
    throw new Error('Indica un importe válido con un máximo de dos decimales.');
  }
  return Math.round(value * 100);
}
export function validateSaleServices(input: unknown, invoiceBase: number): SaleService[] {
  if (!Array.isArray(input) || input.length > 50) throw new Error('El desglose admite hasta 50 componentes.');
  const base = Math.round(invoiceBase * 100);
  if (!Number.isSafeInteger(base)) throw new Error('La base de la factura no es válida.');
  const ids = new Set<string>();
  let total = 0;
  const result = input.map((item): SaleService => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Componente no válido.');
    if (item.id !== undefined && (typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(item.id) || ids.has(item.id))) throw new Error('Identificador repetido o no válido.');
    if (item.id) ids.add(item.id);
    if (typeof item.nombre !== 'string' || !item.nombre.trim() || item.nombre.trim().length > 160 || /[\u0000-\u001f\u007f]/.test(item.nombre)) throw new Error('El nombre del servicio debe tener entre 1 y 160 caracteres.');
    if (typeof item.tipo !== 'string' || !Object.prototype.hasOwnProperty.call(SERVICE_TYPES, item.tipo)) throw new Error('Modelo de servicio no válido.');
    const amount = serviceCents(item.base);
    if (!amount || !base || Math.sign(amount) !== Math.sign(base)) throw new Error('Cada componente debe tener el signo de la factura y un importe distinto de cero.');
    total += amount;
    return { ...(item.id ? { id: item.id } : {}), nombre: item.nombre.trim(), tipo: item.tipo as ServiceType, base: amount / 100 };
  });
  if (Math.abs(total) > Math.abs(base)) throw new Error('El desglose supera la base sin IVA de la venta.');
  return result;
}
export function serviceSummary(services: SaleService[], invoiceBase: number) {
  const classified = services.reduce((sum, item) => sum + serviceCents(item.base), 0);
  const remaining = Math.round(invoiceBase * 100) - classified;
  return { clasificado: classified / 100, pendiente: remaining / 100, completo: remaining === 0, mixto: new Set(services.map(item => item.tipo)).size > 1 };
}

interface TemplateInvoice { cif: string | null; serie: string | null; concepto: string | null; lineas: string | null; base: number; fecha: Date }
function normaliseReference(value: string | null) { return (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-ES'); }
function lineSignature(value: string | null): string {
  if (!value) return '';
  try {
    const canonical = (item: any): any => Array.isArray(item) ? item.map(canonical) : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])])) : item;
    return JSON.stringify(canonical(JSON.parse(value)));
  } catch { return value.trim(); }
}
export function monthlyTemplateEligible(current: TemplateInvoice, previous: TemplateInvoice): boolean {
  const thisMonth = current.fecha.getUTCFullYear() * 12 + current.fecha.getUTCMonth();
  const lastMonth = previous.fecha.getUTCFullYear() * 12 + previous.fecha.getUTCMonth();
  const cif = (current.cif || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const previousCif = (previous.cif || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const concept = normaliseReference(current.concepto);
  const lines = lineSignature(current.lineas);
  return Boolean(cif && cif === previousCif && thisMonth - lastMonth === 1
    && normaliseReference(current.serie) === normaliseReference(previous.serie)
    && (concept || lines) && concept === normaliseReference(previous.concepto)
    && lines === lineSignature(previous.lineas)
    && Math.round(current.base * 100) === Math.round(previous.base * 100));
}
