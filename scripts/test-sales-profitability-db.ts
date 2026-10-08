import assert from 'node:assert/strict';
import { Prisma, PrismaClient } from '@prisma/client';
import { clientColumns, invoiceColumns, kpiColumns, parseProfitFilters, pendingCTE, profitabilityCTE, serviceColumns } from '../lib/finanzas/sales-profitability';

const prisma = new PrismaClient();

function sum(rows: any[], field: string): number {
  return Math.round(rows.reduce((total, row) => total + Number(row[field] || 0), 0) * 100) / 100;
}

function cents(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

async function main() {
  await prisma.$transaction(async tx => {
    // pg_temp shadows only these fixtures during this transaction. No real financial row is changed.
    await tx.$executeRawUnsafe(`SET LOCAL search_path = pg_temp, public`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas_emitidas (id text, num_factura text, cliente text, cif text, fecha timestamp, concepto text, imputacion text, base numeric, estado text, origen_sistema text, id_externo text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE componentes_venta_servicio (factura_emitida_id text, tipo text, base numeric) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas (isp_gestion_id int, id_cliente int) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE clientes_web (id int, cliente_id_isp text, nombre text, nif text, cif text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas_recibidas (id text, num_factura text, proveedor text, fecha timestamp, base numeric, concepto text, estado text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE vinculaciones_facturas (id text, factura_recibida_id text, factura_emitida_id text, porcentaje numeric, notas text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE imputaciones_coste_cliente (id text, factura_id text, cliente_id int, importe numeric, confirmado boolean) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE empleados (id text, nombre_completo text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE proyectos (id text, cliente_id int) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE imputaciones_horas (id text, empleado_id text, proyecto_id text, fecha timestamp, horas numeric, coste_imputado numeric, empresa_grupo text, cliente_id_imp int, descripcion text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE vinculaciones_personal_facturas (id text, factura_emitida_id text, imputacion_horas_id text, porcentaje numeric, notas text) ON COMMIT DROP`);

    await tx.$executeRawUnsafe(`INSERT INTO clientes_web VALUES (1, '11', 'Cliente Uno', 'A-1', null), (2, '22', 'Cliente Dos', 'B-2', null)`);
    await tx.$executeRawUnsafe(`INSERT INTO facturas VALUES (10, 11), (20, 22)`);
    await tx.$executeRawUnsafe(`INSERT INTO facturas_emitidas VALUES
      ('s1','V-1','Cliente Uno','A-1','2026-01-10','red propia','TELECO',100,'EMITIDA','ISPGestion','10'),
      ('s2','V-2','Cliente Uno','A-1','2026-01-12','pack mixto','TELECO',50,'EMITIDA','ISPGestion','10'),
      ('s3','V-3','Cliente Dos','B-2','2026-01-12','otro','PROYECTOS',90,'EMITIDA','ISPGestion','20'),
      ('s4','V-4','Cliente Uno','A-1','2026-01-13','centimos','TELECO',1,'EMITIDA','ISPGestion','10'),
      ('draft','V-4','Cliente Uno','A-1','2026-01-13','borrador','TELECO',999,'BORRADOR','ISPGestion','10')`);
    await tx.$executeRawUnsafe(`INSERT INTO componentes_venta_servicio VALUES
      ('s1','TELECO_RED_PROPIA',100), ('s2','TELECO_RED_PROPIA',25), ('s2','TELECO_INTERMEDIACION',25)`);
    await tx.$executeRawUnsafe(`INSERT INTO facturas_recibidas VALUES
      ('p1','C-1','Proveedor','2025-12-20',40,'equipo','CONTABILIZADA'),
      ('p2','C-2','Proveedor','2026-01-20',30,'cliente','CONTABILIZADA'),
      ('p3','C-3','Proveedor','2026-01-20',20,'conflicto','CONTABILIZADA'),
      ('p4','C-4','Proveedor','2025-12-21',0.01,'centimo','CONTABILIZADA')`);
    await tx.$executeRawUnsafe(`INSERT INTO vinculaciones_facturas VALUES ('l1','p1','s1',100,'directa'), ('l2','p3','s1',100,'conflicto'), ('l3','p4','s1',50,'centimos'), ('l4','p4','s4',50,'centimos')`);
    await tx.$executeRawUnsafe(`INSERT INTO imputaciones_coste_cliente VALUES ('i1','p2',1,30,true), ('i2','p3',1,20,true)`);
    await tx.$executeRawUnsafe(`INSERT INTO empleados VALUES ('e1','Sin datos salariales'), ('e2','Técnico')`);
    await tx.$executeRawUnsafe(`INSERT INTO proyectos VALUES ('pr1',1), ('pr2',2)`);
    await tx.$executeRawUnsafe(`INSERT INTO imputaciones_horas VALUES
      ('h1','e2','pr1','2025-12-22',2,10,'INTERNET OPERADORES',null,'soporte'),
      ('h2','e2','pr1','2026-01-21',2,null,'INTERNET OPERADORES',null,'sin coste')`);
    await tx.$executeRawUnsafe(`INSERT INTO vinculaciones_personal_facturas VALUES ('hp1','s1','h1',50,'media jornada')`);

    const f = parseProfitFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-01-31'));
    const cte = profitabilityCTE(f);
    const [kpis] = await tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${kpiColumns} FROM client_rollups`);
    const clientRows = await tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${clientColumns} FROM client_rollups ORDER BY key`);
    const invoiceRows = await tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${invoiceColumns} FROM invoice_metrics ORDER BY id`);
    const serviceRows = await tx.$queryRaw<any[]>(Prisma.sql`${cte} SELECT ${serviceColumns} FROM service_rollups ORDER BY key`);
    const [pending] = await tx.$queryRaw<any[]>(pendingCTE(f));

    // s1: 100 revenue - 40 direct purchase - 5 linked staff, p3 conflict excluded; client pool p2=30 only once.
    assert.equal(kpis.ventas, 241);
    assert.equal(kpis.comprasDirectas, 40.01);
    assert.equal(kpis.comprasCliente, 30);
    assert.equal(kpis.personalDirecto, 5);
    assert.equal(kpis.margenConocido, 165.99);
    assert.equal(kpis.totalFacturas, 4);
    assert.equal(kpis.incidencias, 2, 'the client-attribution conflict remains visible as a client incident');
    assert.equal(kpis.margenPct, null, 'aggregate is never complete while any invoice lacks direct coverage or has an incident');
    assert.equal(clientRows.find(row => row.key === 'cliente:1').comprasCliente, 30);
    assert.equal(invoiceRows.find(row => row.id === 's1').personalDirecto, 5);
    assert.equal(invoiceRows.find(row => row.id === 's1').calidad, 'incidencia');
    assert.equal(invoiceRows.find(row => row.id === 's2').margenPct, null);
    assert.equal(invoiceRows.find(row => row.id === 's1').comprasDirectas, 40.01, 'first 50% link receives the one-cent remainder deterministically');
    assert.equal(invoiceRows.find(row => row.id === 's4').comprasDirectas, 0, 'half-cent split never over-allocates its one-cent source');
    assert.equal(sum(serviceRows, 'ventas'), kpis.ventas);
    assert.equal(sum(serviceRows, 'comprasDirectas'), kpis.comprasDirectas);
    assert.equal(sum(serviceRows, 'personalDirecto'), kpis.personalDirecto);
    assert.equal(sum(serviceRows, 'comprasCliente'), kpis.comprasCliente);
    assert.equal(sum(serviceRows, 'personalCliente'), kpis.personalCliente);
    assert.equal(sum(serviceRows, 'margenConocido'), kpis.margenConocido);
    assert.equal(pending.conflictos, 1);
    assert.equal(pending.horasSinCoste, 1);

    // Allocation happens over every link of a source, not just sales selected by this view.
    // a-* deterministically receives a one-cent remainder even though s5 is outside January.
    await tx.$executeRawUnsafe(`INSERT INTO facturas_emitidas VALUES
      ('s5','V-5','Cliente Uno','A-1','2026-02-01','fuera de cohorte','TELECO',1,'EMITIDA','ISPGestion','10')`);
    await tx.$executeRawUnsafe(`INSERT INTO facturas_recibidas VALUES
      ('p5','C-5','Proveedor','2025-12-22',0.01,'cruza períodos','CONTABILIZADA'),
      ('p6','C-6','Proveedor','2025-12-22',10,'coste pack mixto','CONTABILIZADA'),
      ('p7','C-7','Proveedor','2025-12-22',10,'compra parcial','CONTABILIZADA'),
      ('p8','C-8','Proveedor','2026-01-22',1,'referencia huérfana','CONTABILIZADA'),
      ('p9','C-9','Proveedor','2026-01-22',10,'cliente parcial','CONTABILIZADA'),
      ('p10','C-10','Proveedor','2026-01-22',10,'vínculo parcial','CONTABILIZADA'),
      ('p11','C-11','Proveedor','2026-01-22',4,'sobreasignado','CONTABILIZADA')`);
    await tx.$executeRawUnsafe(`INSERT INTO vinculaciones_facturas VALUES
      ('a-cross-feb','p5','s5',50,'recibe el céntimo'), ('z-cross-jan','p5','s1',50,'no cambia al filtrar'),
      ('mixed-direct','p6','s2',100,'pack mixto'), ('partial-purchase','p7','s3',50,'asignación parcial'),
      ('orphan-purchase','p8','venta-inexistente',100,'no debe asignarse'),
      ('partial-purchase-period','p10','s3',50,'pendiente por porcentaje sin usar'),
      ('over-purchase','p11','s1',101,'globalmente inválido')`);
    await tx.$executeRawUnsafe(`INSERT INTO imputaciones_coste_cliente VALUES ('i3','p9',1,5,true)`);
    await tx.$executeRawUnsafe(`INSERT INTO imputaciones_horas VALUES
      ('h3','e2','pr1','2026-01-22',1,0.01,'INTERNET OPERADORES',null,'fracción de céntimo'),
      ('h4','e2','pr1','2026-01-22',1,0.01,'INTERNET OPERADORES',null,'cruza períodos'),
      ('h5','e2','pr1','2026-01-22',1,1,'INTERNET OPERADORES',null,'referencia huérfana'),
      ('h6','e2','pr1','2026-01-22',1,1,'INTERNET OPERADORES',null,'sobreasignado')`);
    await tx.$executeRawUnsafe(`INSERT INTO vinculaciones_personal_facturas VALUES
      ('partial-staff','s1','h3',25,'el resto queda en el pool'),
      ('a-staff-feb','s5','h4',50,'recibe el céntimo'), ('z-staff-jan','s1','h4',50,'no cambia al filtrar'),
      ('orphan-staff','venta-inexistente','h5',100,'no debe asignarse'),
      ('over-staff','s1','h6',101,'globalmente inválido')`);

    const january = profitabilityCTE(f);
    const januaryInvoices = await tx.$queryRaw<any[]>(Prisma.sql`${january} SELECT ${invoiceColumns} FROM invoice_metrics ORDER BY id`);
    const januaryServices = await tx.$queryRaw<any[]>(Prisma.sql`${january} SELECT ${serviceColumns} FROM service_rollups ORDER BY key`);
    const mixedCostOnly = await tx.$queryRaw<any[]>(Prisma.sql`${january}
      SELECT id, service_key, ventas, compras_directas, personal_directo
      FROM service_invoice_metrics WHERE id = 's2' AND service_key = '__SIN_DESGLOSE__'`);
    const [januaryKpis] = await tx.$queryRaw<any[]>(Prisma.sql`${january} SELECT ${kpiColumns} FROM client_rollups`);
    const [januaryPending] = await tx.$queryRaw<any[]>(pendingCTE(f));
    const teleco = parseProfitFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-01-31&actividad=TELECO'));
    const telecoInvoices = await tx.$queryRaw<any[]>(Prisma.sql`${profitabilityCTE(teleco)} SELECT ${invoiceColumns} FROM invoice_metrics ORDER BY id`);
    const s4Only = parseProfitFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-01-31&facturaId=s4'));
    const [s4OnlyInvoice] = await tx.$queryRaw<any[]>(Prisma.sql`${profitabilityCTE(s4Only)} SELECT ${invoiceColumns} FROM invoice_metrics`);
    const throughFebruary = parseProfitFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-02-28'));
    const fullInvoices = await tx.$queryRaw<any[]>(Prisma.sql`${profitabilityCTE(throughFebruary)} SELECT ${invoiceColumns} FROM invoice_metrics ORDER BY id`);

    assert.equal(januaryInvoices.find(row => row.id === 's1').comprasDirectas, 40.01,
      'January does not receive p5\'s remainder merely because its February peer is filtered out');
    assert.equal(januaryInvoices.find(row => row.id === 's1').personalDirecto, 5,
      'zero-cent valid staff links do not create a cent through per-link rounding');
    assert.equal(januaryInvoices.find(row => row.id === 's1').numHoras, 3,
      'valid zero-cost allocations still count as linked hours');
    assert.equal(telecoInvoices.find(row => row.id === 's1').comprasDirectas, 40.01,
      'an activity cohort also cannot change a global source allocation');
    assert.equal(s4OnlyInvoice.comprasDirectas, 0,
      'selecting only the second 50% invoice cannot award it the globally assigned one-cent remainder');
    assert.equal(fullInvoices.find(row => row.id === 's5').comprasDirectas, 0.01,
      'the deterministic purchase remainder stays on the globally first link');
    assert.equal(fullInvoices.find(row => row.id === 's5').personalDirecto, 0.01,
      'the deterministic staff remainder stays on the globally first link');
    assert.equal(januaryKpis.comprasDirectas, 60.01);
    assert.equal(januaryKpis.comprasCliente, 35, 'a partial client attribution remains recognised but labelled as residual');
    assert.equal(januaryKpis.personalCliente, 0.01,
      'a 25% link of a one-cent staff source leaves the exact global residual in the client pool');
    assert.deepEqual(mixedCostOnly, [{ id: 's2', service_key: '__SIN_DESGLOSE__', ventas: 0, compras_directas: 10, personal_directo: 0 }],
      'mixed invoices retain their zero-revenue cost-only service row');
    assert.equal(sum(januaryServices, 'ventas'), cents(januaryKpis.ventas));
    assert.equal(sum(januaryServices, 'comprasDirectas'), cents(januaryKpis.comprasDirectas),
      'mixed invoices keep cost-only __SIN_DESGLOSE__ service rows so service money reconciles');
    assert.equal(sum(januaryServices, 'personalDirecto'), cents(januaryKpis.personalDirecto));
    assert.equal(sum(januaryServices, 'comprasCliente'), cents(januaryKpis.comprasCliente));
    assert.equal(sum(januaryServices, 'personalCliente'), cents(januaryKpis.personalCliente));
    assert.equal(sum(januaryServices, 'margenConocido'), cents(januaryKpis.margenConocido));
    assert.equal(januaryPending.comprasSinVenta, 2, 'residual client and unused-link percentages are labelled as unassigned');
    assert.equal(januaryPending.conflictos, 3, 'client, orphan, and globally over-allocated purchases are excluded safely');
    assert.equal(januaryPending.personalSinVenta, 3, 'partial, orphan, and globally over-allocated staff sources remain pending');

    // bigint cents allow sources above the old signed-int ceiling of roughly EUR21.47m.
    await tx.$executeRawUnsafe(`INSERT INTO facturas_recibidas VALUES
      ('p12','C-12','Proveedor','2025-12-22',22000000.01,'base grande','CONTABILIZADA')`);
    await tx.$executeRawUnsafe(`INSERT INTO vinculaciones_facturas VALUES
      ('large-purchase','p12','s3',100,'no puede desbordar centimos')`);
    const [largeAllocation] = await tx.$queryRaw<any[]>(Prisma.sql`${profitabilityCTE(f)}
      SELECT coste FROM purchase_links WHERE id = 'large-purchase'`);
    assert.equal(largeAllocation.coste, 22000000.01);
  }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const [snapshot] = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    return tx.$queryRaw<{ snapshotRootReadable: boolean }[]>`SELECT COALESCE(BOOL_AND(id IS NOT NULL AND fecha IS NOT NULL), true) AS "snapshotRootReadable" FROM facturas_emitidas`;
  }, { timeout: 15_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  assert.equal(snapshot.snapshotRootReadable, true);
  console.log(JSON.stringify({ sqlTemporalCorrecto: true, ventasSoloEmitidas: true, asignacionGlobalEstable: true, serviciosReconciliados: true, residuosExactos: true, snapshotSoloLectura: true, escriturasProduccion: 0 }));
}

main()
  .catch(error => { console.error(error instanceof Error ? error.message : 'Error de prueba'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
