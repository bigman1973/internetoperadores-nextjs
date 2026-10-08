import assert from 'node:assert/strict';
import { Prisma, PrismaClient } from '@prisma/client';
import { costCTE, parseCostFilters, totalColumns } from '../lib/finanzas/cost-analytics';
const prisma = new PrismaClient();
async function main() {
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE facturas_recibidas (id text, proveedor text, cif text, num_factura text, fecha timestamp, base numeric, concepto text, imputacion text, imputado_a_ventas boolean, cliente_imputado text, estado text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE imputaciones_coste_cliente (factura_id text, importe numeric, confirmado boolean, cliente_nombre text) ON COMMIT DROP`);
    await tx.$executeRawUnsafe(`CREATE TEMP TABLE comentarios_facturas_recibidas (factura_id text, texto text) ON COMMIT DROP`);
    await tx.$executeRaw`INSERT INTO facturas_recibidas VALUES
      ('a','Proveedor Uno','B-001','F1','2026-09-01',100,'servicio','Operadora',true,null,'CONTABILIZADA'),
      ('b','Proveedor uno','B001','F2','2026-09-30 23:59:59.999',50,'material',null,false,null,'PENDIENTE_REVISION'),
      ('c','Proveedor Dos',null,'F3','2026-10-01',999,'otro','Tecnología',false,null,'CONTABILIZADA'),
      ('d','Proveedor Uno','B001','F4','2026-09-20',-20,'abono','Operadora',true,null,'CONTABILIZADA'),
      ('e','Proveedor Tres',null,'F5','2026-09-20',10,'sobreasignada','Estructura',true,null,'CONTABILIZADA'),
      ('x','Proveedor Tres',null,'RECHAZADA','2026-09-20',500,'rechazada',null,false,null,'RECHAZADA')`;
    await tx.$executeRaw`INSERT INTO imputaciones_coste_cliente VALUES ('a',60,true,'Cliente Uno'),('a',40,true,'(Sin asignar)'),('a',500,false,'No confirmado'),('d',-20,true,'Cliente Uno'),('e',11,true,'Cliente Dos')`;
    await tx.$executeRaw`INSERT INTO comentarios_facturas_recibidas VALUES ('b','Comentario de licencia especial 100%_'),('b','Otra licencia especial')`;
    const f = parseCostFilters(new URLSearchParams('desde=2026-09-01&hasta=2026-09-30'));
    const totals = async (q: string) => (await tx.$queryRaw<any[]>(Prisma.sql`${costCTE(parseCostFilters(new URLSearchParams(q)))} SELECT ${totalColumns} FROM filtrados`))[0];
    const k = await totals('desde=2026-09-01&hasta=2026-09-30');
    assert.equal(k.totalFacturas, 4); assert.equal(k.costeBase, 140); assert.equal(k.asignado, 50); assert.equal(k.sinAsignar, 90); assert.equal(k.sinClasificar, 50); assert.equal(k.incidencias, 1); assert.equal(k.negativas, 1);
    assert.equal((await totals('desde=2026-09-01&hasta=2026-09-30&buscar=licencia especial')).totalFacturas, 1);
    assert.equal((await totals('buscar=100%25_')).totalFacturas, 1);
    assert.equal((await totals('buscar=%25_')).totalFacturas, 1);
    assert.equal((await totals('buscar=XYZ%25_')).totalFacturas, 0);
    assert.equal((await totals('desde=2026-09-01&hasta=2026-09-30&estadoAnalitica=pendiente')).costeBase, 50);
    assert.equal((await totals('desde=2026-09-01&hasta=2026-09-30&estadoAnalitica=parcial')).costeBase, 100);
    assert.equal((await totals('desde=2026-09-01&hasta=2026-09-30&estadoAnalitica=incidencia')).costeBase, 10);
    assert.equal((await totals('desde=2026-09-01&hasta=2026-09-30&proveedorKey=cif:B001')).totalFacturas, 3);
    const nodes = await tx.$queryRaw<any[]>(Prisma.sql`${costCTE(f)} SELECT categoria_key, ${totalColumns} FROM filtrados GROUP BY categoria_key`);
    assert.equal(nodes.reduce((sum, n) => sum + n.costeBase, 0), k.costeBase);
    assert.equal(nodes.reduce((sum, n) => sum + n.asignado, 0), k.asignado);
  }, { timeout: 15000 });
  const f = parseCostFilters(new URLSearchParams('desde=2026-01-01&hasta=2026-12-31'));
  const [total] = await prisma.$queryRaw<any[]>(Prisma.sql`${costCTE(f)} SELECT ${totalColumns} FROM filtrados`);
  const [reference] = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS count, COALESCE(SUM(ROUND(base::numeric,2)),0)::float8 AS base FROM facturas_recibidas WHERE estado <> 'RECHAZADA' AND fecha >= '2026-01-01' AND fecha < '2027-01-01'`;
  assert.equal(total.totalFacturas, reference.count);
  assert.equal(total.costeBase, reference.base);
  assert.equal(Math.round((total.asignado + total.sinAsignar) * 100), Math.round(total.costeBase * 100));
  console.log(JSON.stringify({sqlTemporalCorrecto:true,periodoInclusivo:true,busquedaComentariosSinDuplicados:true,totalesRealesConciliados:true,escriturasProduccion:0}));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Error de prueba'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
