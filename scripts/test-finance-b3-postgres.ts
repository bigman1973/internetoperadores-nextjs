/** B3: prueba real sólo staging, con rollback forzoso y sin filas de prueba persistentes. */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { PrismaClient, Prisma } from '@prisma/client'
import * as core from '../lib/finanzas/bank-balance-chain'
import * as catalog from '../lib/finanzas/movement-catalog'

const p = new PrismaClient()
const rollback = new Error('B3_ROLLBACK_REQUIRED')
class NextRequest extends Request { nextUrl: URL; constructor(url: string, init?: RequestInit) { super(url, init); this.nextUrl = new URL(url) } }
const parsed: any[] = []
function loadRoute(tx: any) {
  const source = fs.readFileSync('app/api/admin/finanzas/importar-movimientos/route.ts', 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  const module = { exports: {} as any }
  vm.runInNewContext(code, {
    module, exports: module.exports, Request, Response, Headers, URL, Date, Buffer, FormData, File, Blob, Uint8Array, TextEncoder, TextDecoder, ReadableStream, console,
    require(name: string) {
      if (name === 'node:crypto' || name === 'crypto') return crypto
      if (name === 'next/server') return { NextRequest, NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } }
      if (name === 'next-auth') return { getServerSession: async () => ({ user: { id: '7', userType: 'admin', role: 'SUPER_ADMIN' } }) }
      if (name === '@/lib/auth') return { authOptions: {} }
      if (name === '@/lib/prisma') return { prisma: tx }
      if (name === '@/lib/api-admin-area-read') return { checkAdminAreaWrite: async () => null, checkAdminAreaRead: async () => null }
      if (name === '@/lib/finanzas/staging-safety') return { assertFinanceStagingIsolated: async () => { const rows = await tx.$queryRaw`SELECT current_database() AS db,current_user AS rol`; assert.equal(rows[0].db,'io_staging_finanzas'); assert.equal(rows[0].rol,'io_staging_finanzas') } }
      if (name === '@/lib/finanzas/bank-balance-chain') return core
      if (name === '@/lib/finanzas/movement-catalog') return catalog
      if (name === '@/lib/finanzas/parsers') return { detectarFormato: () => 'santander', parseSantanderTXT: () => parsed }
      if (name === '@/lib/finanzas/vivid-statement-validation') return { validateVividStatement: () => ({ ok: true }) }
      if (name === 'xlsx') return {}
      throw Error(`Dependencia B3 no simulada: ${name}`)
    },
  })
  return module.exports.POST as (request: NextRequest) => Promise<Response>
}
async function counts() { return { cuentas:await p.cuentaBancaria.count(),movimientos:await p.movimientoBancario.count(),importaciones:await p.importacionExtracto.count(),recibidas:await p.facturaRecibida.count(),emitidas:await p.facturaEmitida.count() } }
async function main() {
  assert.equal(process.env.FINANCE_STAGING_SANDBOX,'1'); assert.equal(process.env.FINANCE_B3_ROLLBACK_TEST,'1')
  const identity=await p.$queryRaw<Array<{db:string;rol:string}>>`SELECT current_database() AS db,current_user AS rol`
  assert.equal(identity[0].db,'io_staging_finanzas');assert.equal(identity[0].rol,'io_staging_finanzas')
  const before=await counts();let exercised=false
  try { await p.$transaction(async tx => {
    const uid=crypto.randomUUID()
    const account=await tx.cuentaBancaria.create({data:{banco:'Santander',iban:`B3-ROLLBACK-${uid}`,alias:'Fixture B3 sin persistencia',saldoActual:100,fechaSaldo:new Date('2026-01-01T00:00:00Z')}})
    await tx.movimientoBancario.create({data:{cuentaId:account.id,fechaOperacion:new Date('2026-01-01T00:00:00Z'),fechaValor:new Date('2026-01-01T00:00:00Z'),concepto:'B3 fixture puente',importe:0,saldo:100,hashUnico:`B3-bridge-${uid}`}})
    parsed.splice(0,parsed.length,...[
      {fechaOperacion:new Date('2026-01-02T00:00:00Z'),fechaValor:new Date('2026-01-02T00:00:00Z'),concepto:'Compra fixture COMISION 0,00',importe:-10,saldo:80,hashUnico:`B3-row1-${uid}`},
      {fechaOperacion:new Date('2026-01-03T00:00:00Z'),fechaValor:new Date('2026-01-03T00:00:00Z'),concepto:'Abono fixture',importe:5,saldo:85,hashUnico:`B3-row2-${uid}`},
    ])
    const POST=loadRoute(tx)
    function request() { const data=new FormData();data.set('banco','santander');data.set('cuentaId',account.id);data.set('archivo',new Blob(['B3-ROLLBACK-SYNTHETIC-ONLY'],{type:'text/plain'}),'b3-rollback.txt');return new NextRequest('https://staging.example/api/admin/finanzas/importar-movimientos',{method:'POST',headers:{origin:'https://staging.example'},body:data}) }
    const result=await POST(request());const body=await result.json()
    assert.equal(result.status,200,body.error);assert.equal(body.resumen.insertados,2);assert.equal(body.continuidadSaldo.estado,'HUECO');assert(body.avisosSaldo.some((x:any)=>x.codigo==='HUECO_SALDO'));assert.equal(body.resumen.saldoActualizado,false)
    const after=await tx.cuentaBancaria.findUniqueOrThrow({where:{id:account.id}})
    assert.equal(after.fechaCorteExtracto?.toISOString(),'2026-01-03T00:00:00.000Z');assert.equal(after.saldoActual,100);assert.equal(after.fechaSaldo?.toISOString(),'2026-01-01T00:00:00.000Z')
    const repeat=await POST(request());const repeated=await repeat.json();assert.equal(repeat.status,200);assert.equal(repeated.resumen.insertados,0);assert.equal(repeated.resumen.duplicadosHash,2)
    assert.equal(await tx.movimientoBancario.count({where:{cuentaId:account.id}}),3)
    const lines=await tx.movimientoBancario.findMany({where:{cuentaId:account.id}});assert(lines.every(x=>!x.conciliado&&x.facturaId===null&&x.facturaEmitidaId===null))
    assert.equal(await tx.facturaRecibida.count(),before.recibidas);assert.equal(await tx.facturaEmitida.count(),before.emitidas)
    exercised=true;throw rollback
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:10000,timeout:60000}) }catch(e){if(e!==rollback)throw e}
  assert(exercised);assert.deepEqual(await counts(),before)
  console.log('OK PostgreSQL B3 staging: importación real en rollback, hueco exacto visible, corte avanza sin pisar saldo, reintento por hash y ningún vínculo ni fixture persistente.')
}
main().catch(e=>{console.error(e instanceof Error?e.message:'B3_POSTGRES_FAILED');process.exitCode=1}).finally(()=>p.$disconnect())
