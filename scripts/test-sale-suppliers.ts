import assert from 'node:assert/strict';
import {
  saleSupplierKey,
  saleSuppliersVersion,
  sameSaleSuppliers,
  validateSaleSuppliers,
} from '../lib/finanzas/sale-suppliers';

assert.equal(saleSupplierKey('  Proveedor  Uno  '), 'proveedor  uno');
assert.equal(saleSupplierKey('ÁRBOL S.L.'), 'árbol s.l.');
assert.deepEqual(validateSaleSuppliers(['  Acme S.L. ', 'Proveedor  Dos']), [
  { nombre: 'Acme S.L.', proveedorKey: 'acme s.l.' },
  { nombre: 'Proveedor  Dos', proveedorKey: 'proveedor  dos' },
]);
assert.deepEqual(validateSaleSuppliers([]), []);
for (const input of [
  null,
  'Acme',
  [42],
  [''],
  ['\t'],
  ['Proveedor\nno válido'],
  ['A'.repeat(161)],
  ['Acme', ' acme '],
  Array.from({ length: 11 }, (_, index) => `Proveedor ${index}`),
]) assert.throws(() => validateSaleSuppliers(input));

const first = [
  { id: 'b', nombre: 'Beta', proveedorKey: 'beta' },
  { id: 'a', nombre: 'Acme', proveedorKey: 'acme' },
];
const reordered = [first[1], first[0]];
assert.match(saleSuppliersVersion(first), /^[a-f0-9]{64}$/);
assert.equal(saleSuppliersVersion(first), saleSuppliersVersion(reordered));
assert.notEqual(saleSuppliersVersion(first), saleSuppliersVersion([{ ...first[0], nombre: 'Beta 2' }, first[1]]));
assert.equal(
  sameSaleSuppliers(first, [{ nombre: 'Acme', proveedorKey: 'acme' }, { nombre: 'Beta', proveedorKey: 'beta' }]),
  true,
);
assert.equal(sameSaleSuppliers(first, [{ nombre: 'ACME', proveedorKey: 'acme' }, { nombre: 'Beta', proveedorKey: 'beta' }]), false);

console.log('Proveedores venta: normalización lower(trim), tipos, límites, claves exactas y versión SHA-256 estable correctos; sin CIF ni matching difuso.');
