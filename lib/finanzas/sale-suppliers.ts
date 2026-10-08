import { createHash } from 'node:crypto';

export interface SaleSupplierReference {
  id: string;
  nombre: string;
  proveedorKey: string;
}

export interface SaleSupplierName {
  nombre: string;
  proveedorKey: string;
}

const CONTROL = /[\u0000-\u001f\u007f]/;

/** Exact key: lower(trim(nombre)); it deliberately does not use CIFs or fuzzy matching. */
export function saleSupplierKey(nombre: string): string {
  return nombre.trim().toLowerCase();
}

export function validateSaleSuppliers(input: unknown): SaleSupplierName[] {
  if (!Array.isArray(input) || input.length > 10) {
    throw new Error('Selecciona como máximo 10 proveedores.');
  }

  const keys = new Set<string>();
  return input.map((value): SaleSupplierName => {
    if (typeof value !== 'string') {
      throw new Error('Cada proveedor debe ser un texto.');
    }
    const nombre = value.trim();
    if (!nombre || nombre.length > 160 || CONTROL.test(nombre)) {
      throw new Error('El nombre del proveedor debe tener entre 1 y 160 caracteres.');
    }
    const proveedorKey = saleSupplierKey(nombre);
    if (keys.has(proveedorKey)) {
      throw new Error('No se puede repetir un proveedor.');
    }
    keys.add(proveedorKey);
    return { nombre, proveedorKey };
  });
}

function orderedNames(rows: readonly Pick<SaleSupplierName, 'nombre' | 'proveedorKey'>[]): SaleSupplierName[] {
  return rows
    .map(({ nombre, proveedorKey }) => ({ nombre, proveedorKey }))
    .sort((a, b) => a.proveedorKey.localeCompare(b.proveedorKey) || a.nombre.localeCompare(b.nombre));
}

export function sameSaleSuppliers(
  stored: readonly Pick<SaleSupplierName, 'nombre' | 'proveedorKey'>[],
  requested: readonly Pick<SaleSupplierName, 'nombre' | 'proveedorKey'>[],
): boolean {
  return JSON.stringify(orderedNames(stored)) === JSON.stringify(orderedNames(requested));
}

/** SHA-256 of a canonical order, including IDs so a changed persisted reference changes the lock token. */
export function saleSuppliersVersion(rows: readonly SaleSupplierReference[]): string {
  const stable = rows
    .map(({ id, nombre, proveedorKey }) => ({ id, nombre, proveedorKey }))
    .sort((a, b) => a.proveedorKey.localeCompare(b.proveedorKey) || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
