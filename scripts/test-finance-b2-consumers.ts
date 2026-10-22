import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { costCTE, parseCostFilters, totalColumns } from '../lib/finanzas/cost-analytics';
import { facturaEconomicaSQL, facturaEconomicaWhere } from '../lib/finanzas/invoice-economic-filter';
import { parseProfitFilters, profitabilityCTE } from '../lib/finanzas/sales-profitability';

const prisma = new PrismaClient();

function sqlText(query: Prisma.Sql): string {
  return query.strings.join('?');
}

function assertConsumerImports(): void {
  const routes = [
    'app/api/admin/finanzas/costes-operadora/route.ts',
    'app/api/admin/finanzas/conciliacion/route.ts',
    'app/api/admin/finanzas/imputacion/route.ts',
    'app/api/admin/finanzas/exportar-a3/route.ts',
  ];
  for (const route of routes) {
    const source = fs.readFileSync(route, 'utf8');
    assert.match(source, /invoice-economic-filter/, `${route} consumes the one B2 filter`);
  }
}

async function main() {
  const predicate = sqlText(facturaEconomicaSQL('fr'));
  assert.match(predicate, /"fr"\."calidad" = 'VALIDA'/);
  assert.match(predicate, /"fr"\."copia_de_id" IS NULL/);
  assert.match(predicate, /UPPER\(BTRIM\(COALESCE\("fr"\."proveedor", ''\)\)\) NOT IN \('ERROR_OCR', 'DESCONOCIDO'\)/);
  assert.throws(() => facturaEconomicaSQL('fr;DROP'), /Alias SQL B2 no permitido/);
  assert.equal(facturaEconomicaWhere.calidad, 'VALIDA');
  assert.equal(facturaEconomicaWhere.copiaDeId, null);
  assertConsumerImports();

  await prisma.$transaction(async tx => {
    // Everything below is transaction-local: it creates no persistent financial data.
    await tx.$executeRawUnsafe('SET LOCAL search_path = pg_temp, public');
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas_recibidas (
      id text PRIMARY KEY, proveedor text NOT NULL, cif text, num_factura text, fecha timestamp,
      base numeric, concepto text, imputacion text, imputado_a_ventas boolean, cliente_imputado text,
      estado text, calidad text NOT NULL, copia_de_id text
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE imputaciones_coste_cliente (
      id text, factura_id text, cliente_id int, importe numeric, confirmado boolean, cliente_nombre text
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE comentarios_facturas_recibidas (
      factura_id text, texto text
    ) ON COMMIT DROP`);

    await tx.$executeRaw(Prisma.sql`INSERT INTO facturas_recibidas
      (id, proveedor, fecha, base, imputado_a_ventas, estado, calidad, copia_de_id) VALUES
      ('valid', 'Proveedor válido', '2026-10-01', 100, false, 'CONTABILIZADA', 'VALIDA', NULL),
      ('copy', 'Proveedor válido', '2026-10-01', 200, false, 'CONTABILIZADA', 'VALIDA', 'valid'),
      ('review', 'Proveedor revisión', '2026-10-01', 300, false, 'CONTABILIZADA', 'REVISAR', NULL),
      ('ocr', ' error_ocr ', '2026-10-01', 400, false, 'CONTABILIZADA', 'VALIDA', NULL),
      ('unknown', 'DESCONOCIDO', '2026-10-01', 500, false, 'CONTABILIZADA', 'VALIDA', NULL)`);

    const canonical = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT fr.id FROM facturas_recibidas fr
      WHERE ${facturaEconomicaSQL('fr')}
      ORDER BY fr.id`);
    assert.deepEqual(canonical.map(row => row.id), ['valid'], 'the actual B2 SQL predicate admits only the canonical economic invoice');

    const costFilters = parseCostFilters(new URLSearchParams('desde=2026-10-01&hasta=2026-10-31'));
    const [costTotals] = await tx.$queryRaw<any[]>(Prisma.sql`${costCTE(costFilters)} SELECT ${totalColumns} FROM filtrados`);
    assert.equal(costTotals.totalFacturas, 1, 'cost totals exclude copies, review rows, OCR errors and unknown suppliers');
    assert.equal(costTotals.costeBase, 100);

    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas_emitidas (
      id text, num_factura text, cliente text, cif text, fecha timestamp, concepto text,
      imputacion text, base numeric, estado text, origen_sistema text, id_externo text
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE componentes_venta_servicio (
      factura_emitida_id text, tipo text, base numeric
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas (isp_gestion_id int, id_cliente int) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE clientes_web (
      id int, cliente_id_isp text, nombre text, nif text, cif text, isp_gestion_id text
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE vinculaciones_facturas (
      id text, factura_recibida_id text, factura_emitida_id text, porcentaje numeric, notas text
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE empleados (id text, nombre_completo text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE proyectos (id text, cliente_id int) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE imputaciones_horas (
      id text, empleado_id text, proyecto_id text, fecha timestamp, horas numeric, coste_imputado numeric,
      empresa_grupo text, cliente_id_imp int, descripcion text
    ) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE vinculaciones_personal_facturas (
      id text, factura_emitida_id text, imputacion_horas_id text, porcentaje numeric, notas text
    ) ON COMMIT DROP`);

    await tx.$executeRaw(Prisma.sql`INSERT INTO clientes_web VALUES (1, '1', 'Cliente B2', 'A-1', NULL, '1')`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO facturas VALUES (1, 1)`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO facturas_emitidas VALUES
      ('sale', 'V-B2', 'Cliente B2', 'A-1', '2026-10-15', 'Servicio', 'TELECO', 1000, 'EMITIDA', 'ISPGestion', '1')`);
    await tx.$executeRaw(Prisma.sql`INSERT INTO vinculaciones_facturas VALUES
      ('link-valid', 'valid', 'sale', 100, NULL),
      ('link-copy', 'copy', 'sale', 100, NULL),
      ('link-review', 'review', 'sale', 100, NULL),
      ('link-ocr', 'ocr', 'sale', 100, NULL),
      ('link-unknown', 'unknown', 'sale', 100, NULL)`);

    const profitabilityFilters = parseProfitFilters(new URLSearchParams('desde=2026-10-01&hasta=2026-10-31'));
    const purchaseRows = await tx.$queryRaw<{ fuente_id: string; incidencia: boolean; coste: number }[]>(Prisma.sql`
      ${profitabilityCTE(profitabilityFilters)}
      SELECT fuente_id, incidencia,
        (SIGN(base_centimos)::float8 * coste_centimos::float8 / 100)::float8 AS coste
      FROM purchase_links_global
      ORDER BY fuente_id`);
    assert.deepEqual(purchaseRows, [
      { fuente_id: 'copy', incidencia: true, coste: 0 },
      { fuente_id: 'ocr', incidencia: true, coste: 0 },
      { fuente_id: 'review', incidencia: true, coste: 0 },
      { fuente_id: 'unknown', incidencia: true, coste: 0 },
      { fuente_id: 'valid', incidencia: false, coste: 100 },
    ], 'profitability deductions admit only the valid canonical purchase and flag all non-economic sources');
  }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  console.log(JSON.stringify({ b2PredicateStable: true, actualPrismaSql: true, costTotalsFiltered: true, profitabilityDeductionsFiltered: true, productionWrites: 0 }));
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : 'B2 consumer regression failed'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
