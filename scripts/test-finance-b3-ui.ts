import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const movements = readFileSync(resolve(root, 'app/admin/finanzas/movimientos/page.tsx'), 'utf8');
const accounts = readFileSync(resolve(root, 'app/admin/finanzas/estado-cuentas/page.tsx'), 'utf8');
const importer = readFileSync(resolve(root, 'app/admin/finanzas/importar/page.tsx'), 'utf8');
const warnings = readFileSync(resolve(root, 'components/finanzas/BankImportWarnings.tsx'), 'utf8');
const catalog = readFileSync(resolve(root, 'lib/finanzas/movement-catalog.ts'), 'utf8');

function requireFragment(source: string, fragment: string, owner: string) {
  if (!source.includes(fragment)) throw new Error(`${owner}: falta «${fragment}».`);
}

function forbidFragment(source: string, fragment: string, owner: string) {
  if (source.includes(fragment)) throw new Error(`${owner}: no debe contener «${fragment}».`);
}

for (const fragment of [
  "import { CATEGORIAS_MOVIMIENTO, TIPOS_MOVIMIENTO } from '@/lib/finanzas/movement-catalog';",
  'const CATEGORIAS = CATEGORIAS_MOVIMIENTO;',
  'const TIPOS_PAGO = TIPOS_MOVIMIENTO;',
  'categoriaOriginal?: string | null;',
  'categoriaNormalizada?: boolean | null;',
  'data-testid="b3-categoria-historica"',
  'Histórico sin normalizar',
  'body: JSON.stringify({ categoria })',
  'data-testid="b3-closed-types"',
]) requireFragment(movements, fragment, 'Movimientos B3');

for (const fragment of [
  'Cobertura del extracto importado',
  'No se muestran importes sustituidos por cero.',
  'data-testid="b3-fecha-corte"',
  'BankImportWarnings',
]) requireFragment(accounts, fragment, 'Estado de cuentas B3');

for (const fragment of [
  '...json.resumen,',
  "typeof json.continuidadSaldo === 'object'",
  'json.continuidadSaldo.estado',
  'avisosSaldo: json.avisosSaldo ?? json.continuidadSaldo?.avisos',
  'fechaCorteExtracto: json.fechaCorteExtracto ?? json.resumen?.fechaCorteExtracto',
  'cuenta.cobertura?.continuidadSaldo',
  'cuenta.cobertura?.avisosSaldo',
  'name="cuentaId"',
  'data-testid="b3-import-account"',
  "bancoSeleccionado.id === 'norma43'",
  'cuenta.banco === bancoSeleccionado.nombre',
  'Caixa Guissona',
  "formData.append('cuentaId', cuentaIdEfectiva)",
  'Selecciona explícitamente la cuenta bancaria para este extracto.',
  'Cuenta seleccionada automáticamente:',
  'Se importará exactamente en:',
  'disabled={loading}',
  'json.success === false',
  'Se han conservado ${filasPersistidas}',
  'Importación con incidencias',
  'Importación conservada con hueco de saldo',
  'avisosSaldo={resultado.avisosSaldo}',
  'fechaCorteExtracto={resultado.fechaCorteExtracto}',
  'Último extracto verificable:',
  'data-testid="b3-import-result"',
  'saldoFinal !== undefined && resultado.saldoFinal !== null',
]) requireFragment(importer, fragment, 'Importar B3');

for (const fragment of [
  "'OK' | 'HUECO' | 'SIN_SALDO' | 'ORDEN_AMBIGUO'",
  'Los movimientos importados se conservan, pero este tramo necesita revisión. No se considera cuadrado.',
  'La ausencia de dato no equivale a saldo cero.',
  'role={hasGap ? \'alert\' : \'status\'}',
]) requireFragment(warnings, fragment, 'Avisos B3');

for (const fragment of [
  "'Oros Gastos'", "'Otros Gastos'", "'IMPUESTOS'", "'Impuestos'", "'Nomina'", "'Nómina'", "'Debito'", "'Débito'",
]) requireFragment(catalog, fragment, 'Catálogo B3');

forbidFragment(movements, 'crearRegla: true', 'Movimientos B3');
forbidFragment(movements, "ejecutarConciliacion('", 'Movimientos B3');
forbidFragment(movements, 'Conciliar Todo', 'Movimientos B3');
forbidFragment(importer, 'Todo cuadrado', 'Importar B3');
forbidFragment(importer, 'conciliar automáticamente', 'Importar B3');
forbidFragment(accounts, 'establecer/actualizar fecha de corte', 'Estado de cuentas B3');
forbidFragment(accounts, '<input', 'Estado de cuentas B3');

console.log('OK: UI B3 conserva mapping de avisos/corte, exige cuenta cuando procede y no presenta conciliación automática ni saldo inventado.');
