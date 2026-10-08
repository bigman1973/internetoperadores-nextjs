import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PrismaClient } from '@prisma/client';
import * as context from '../lib/finanzas/sale-invoice-context';
import { saleIdentityCTE } from '../lib/finanzas/sales-profitability';

const source = fs.readFileSync('app/api/admin/finanzas/rentabilidad/lineas/route.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(prisma: unknown, session: () => unknown, denied: () => unknown) {
  const module = { exports: {} as any };
  vm.runInNewContext(code, { module, exports: module.exports, Date, Number, console, require: (name: string) => {
    if (name === 'next/server') return { NextRequest, NextResponse };
    if (name === 'next-auth') return { getServerSession: async () => session() };
    if (name === '@prisma/client') return { Prisma };
    if (name === '@/lib/auth') return { authOptions: {} };
    if (name === '@/lib/prisma') return { prisma };
    if (name === '@/lib/api-admin-area-read') return { checkAdminAreaRead: async () => denied() };
    if (name === '@/lib/finanzas/sales-profitability') return { saleIdentityCTE };
    if (name === '@/lib/finanzas/sale-invoice-context') return context;
    throw Error(`Módulo no permitido: ${name}`);
  } });
  return (params: string) => module.exports.GET(new NextRequest(`https://panel.test/api/admin/finanzas/rentabilidad/lineas?${params}`));
}
async function main() {
  assert.equal(context.contractValidity('2020-01-01', null, true, '2026-10-01'), 'en_periodo');
  assert.equal(context.contractValidity('2026-11-01', null, true, '2026-10-01'), 'fuera_periodo');
  assert.equal(context.contractValidity('2020-01-01', '2026-09-30', false, '2026-10-01'), 'fuera_periodo');
  assert.equal(context.contractValidity('2020-01-01', '2026-10-01', false, '2026-10-01'), 'en_periodo');
  assert.equal(context.contractValidity('2020-01-01', null, false, '2026-10-01'), 'sin_confirmar');
  assert.equal(context.contractValidity(null, null, true, '2026-10-01'), 'sin_confirmar');
  assert.deepEqual(context.parseRecordedLines(null, 100).lineas, []);
  assert.equal(context.parseRecordedLines('invalid', 100).lineasConciliadas, null);
  assert.equal(context.parseRecordedLines(JSON.stringify([{ descripcion: 'Servicio', base: 10 }]), 10).lineasConciliadas, true);
  assert.equal(context.parseRecordedLines(JSON.stringify([{ descripcion: 'Servicio', base: 10 }]), 11).lineasConciliadas, false);
  assert.equal(context.parseRecordedLines(JSON.stringify([{ descripcion: 'Servicio', importe: 10 }]), 10).lineas[0].base, null, 'No convertir un importe ambiguo en base sin IVA');
  assert.equal(context.parseRecordedLines(JSON.stringify([{ descripcion: 'Servicio', base: true }]), 1).lineas[0].base, null);
  assert.equal(context.parseRecordedLines(JSON.stringify(Array(201).fill({ descripcion: 'x', base: 1 })), 201).lineas.length, 0);
  let authenticated = true, active = true, read = true, identity = true;
  let contractQueries = 0;
  const session = () => authenticated ? { user: { id: '1', userType: 'admin' } } : null;
  const prisma = {
    usuarioAdmin: { findUnique: async () => ({ activo: active }) },
    $transaction: async (fn: any) => fn({ $queryRaw: async (query: Prisma.Sql) => {
      if (query.sql.includes('FROM target_sale s')) return [{ id: 'sale-1', num_factura: 'TEST/1', cliente: 'Cliente sintético', fecha: new Date('2026-10-01'), base: 100, importe_iva: 21, total: 121, lineas: null, cliente_web_id: identity ? 1 : null, cliente_id_isp: '00001', isp_gestion_id: '1' }];
      contractQueries++;
      assert.ok(query.values.includes('00001'), 'Se usa el identificador contractual, nunca el nombre del cliente');
      assert.ok(query.sql.includes('LIMIT'), 'Consulta acotada');
      if (query.sql.includes('COUNT')) return [{ total: 26 }];
      return [{ id: 1, titulo: 'Servicio sintético', tarifa: 'Tarifa', precio: 50, concepto: 'Cuota', fecha_inicio: new Date('2020-01-01'), fecha_baja: null, activo: true }];
    } }),
  };
  const get = load(prisma, session, () => read ? null : NextResponse.json({}, { status: 403 }));
  authenticated = false; assert.equal((await get('facturaId=sale-1')).status, 401); authenticated = true;
  active = false; assert.equal((await get('facturaId=sale-1')).status, 401); active = true;
  read = false; assert.equal((await get('facturaId=sale-1')).status, 403); read = true;
  for (const params of ['facturaId=invalid%20id', 'facturaId=sale-1&page=0', 'facturaId=sale-1&contratos=invalid']) assert.equal((await get(params)).status, 400);
  for (const filter of ['periodo', 'actuales', 'todos']) {
    const res = await get(`facturaId=sale-1&contratos=${filter}`);
    assert.equal(res.status, 200); assert.equal(res.headers.get('Cache-Control'), 'private, no-store');
    const body = await res.json(); assert.equal(body.totalPages, 2); assert.equal(body.contratos.length, 1);
    assert.equal(body.lineas.length, 0, 'No se crean líneas a partir de contratos');
  }
  identity = false; const queriesBefore = contractQueries;
  const unknown = await (await get('facturaId=sale-1')).json();
  assert.equal(unknown.clienteWebId, null); assert.equal(unknown.contratos.length, 0); assert.equal(contractQueries, queriesBefore);
  console.log('Contexto de venta: permisos, identidad, paginación, históricos y ausencia de líneas inferidas correctos.');

  if (process.argv.includes('--db')) {
    const client = new PrismaClient();
    try {
      const readOnly = {
        usuarioAdmin: { findUnique: async () => ({ activo: true }) },
        $transaction: async (work: any, options: any) => client.$transaction(async tx => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
          return work({ $queryRaw: (query: Prisma.Sql) => tx.$queryRaw(query) });
        }, options),
      };
      const getReal = load(readOnly, () => ({ user: { id: '1', userType: 'admin' } }), () => null);
      const sales = await client.$queryRaw<{id:string}[]>(Prisma.sql`SELECT fe.id FROM facturas_emitidas fe
        JOIN facturas f ON f.isp_gestion_id::text = fe.id_externo
        JOIN clientes_web cw ON cw.isp_gestion_id = f.id_cliente::text
        WHERE LOWER(fe.origen_sistema)='ispgestion' AND fe.estado::text NOT IN ('ANULADA','BORRADOR')
          AND EXISTS(SELECT 1 FROM contratos_servicio c WHERE c.cliente_id=COALESCE(NULLIF(cw.cliente_id_isp,''),cw.isp_gestion_id))
        ORDER BY fe.fecha DESC, fe.id LIMIT 2`);
      assert.ok(sales.length > 0, 'Debe haber ventas con contratos locales verificables');
      for (const sale of sales) {
        for (const filter of ['periodo', 'actuales', 'todos']) {
          const res = await getReal(`facturaId=${sale.id}&contratos=${filter}`);
          assert.equal(res.status, 200);
          const body = await res.json(); assert.equal(body.facturaId, sale.id); assert.ok(body.clienteWebId, 'Identidad de cliente inequívoca');
          assert.ok(body.contratos.length <= 25);
          const clientRecord = await client.clienteWeb.findUniqueOrThrow({ where: { id: body.clienteWebId }, select: { clienteIdIsp: true, ispGestionId: true } });
          if (filter === 'todos') assert.equal(body.totalContratos, await client.contratoServicio.count({ where: { clienteId: clientRecord.clienteIdIsp || clientRecord.ispGestionId } }));
          if (filter === 'actuales') assert.ok(body.contratos.every((c:any) => c.activo));
          if (filter === 'periodo') assert.ok(body.contratos.every((c:any) => c.vigencia !== 'fuera_periodo'));
          assert.equal(body.lineasConciliadas, context.parseRecordedLines((await client.facturaEmitida.findUniqueOrThrow({ where: { id: sale.id }, select: { lineas: true } })).lineas, body.base).lineasConciliadas);
        }
      }
      console.log(JSON.stringify({ facturasRealesComprobadas: sales.length, contratosIgualesQueFichaCliente: true, filtrosHistoricosCorrectos: true, escriturasFinancieras: 0 }));
    } finally { await client.$disconnect(); }
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Prueba fallida'); process.exitCode = 1; });
