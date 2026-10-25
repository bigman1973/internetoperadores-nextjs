import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from 'pg'
import { readOwnershipDeclarationsTx, mergeDeclaredAccountIds } from '../lib/finanzas/easy-account-ownership'

async function main() {
  assert.deepEqual(mergeDeclaredAccountIds(['previa'],[{accountId:'nueva',state:'DECLARADA'}]),['nueva','previa'])
  assert.deepEqual(mergeDeclaredAccountIds(['previa'],[{accountId:'previa',state:'REVOCADA'}]),[])
  const receipt=JSON.parse(readFileSync('/home/ubuntu/cobros-produccion-20261025/respaldo/respaldo-verificado.json','utf8'))
  assert(/^io_restore_cobros_\d{8}_\d{4}$/.test(receipt.restoreDatabase))
  const c=new Client({host:'/var/run/postgresql',user:'ubuntu',database:receipt.restoreDatabase})
  await c.connect()
  const tx:any={$queryRaw:async(q:any)=>(await c.query(q.text,q.values)).rows}
  try {
    await c.query('BEGIN')
    const id=(await c.query('SELECT current_database() db,current_user role LIMIT 1')).rows[0]
    assert.equal(id.db,receipt.restoreDatabase);assert.equal(id.role,'ubuntu')
    assert.deepEqual(await readOwnershipDeclarationsTx(tx),[])
    const before=(await c.query('SELECT count(*)::int n FROM politicas_auto_modo_facil LIMIT 1')).rows[0].n
    await c.query(readFileSync('prisma/migrations/20261025_titularidad_declarada/migration.sql','utf8'))
    const account=(await c.query('SELECT id FROM cuentas_bancarias WHERE activa=true ORDER BY id LIMIT 1')).rows[0].id
    const actor=(await c.query("SELECT id FROM usuarios_admin WHERE activo=true AND rol::text='SUPER_ADMIN' ORDER BY id LIMIT 1")).rows[0].id
    const snap=JSON.stringify({schema:'EASY_ACCOUNT_OWNERSHIP_DECLARATION_V1',ejecutadoPor:'prueba local'})
    await c.query("INSERT INTO declaraciones_titularidad_modo_facil(cuenta_id,version,estado,titular_declarado,fecha_declaracion,confirmacion_declarada,actor_id,referencia_evidencia,snapshot) VALUES($1,1,'DECLARADA','Entidad de prueba',CURRENT_DATE,true,$2,'Declaración sintética local',$3::jsonb)",[account,actor,snap])
    const declared=await readOwnershipDeclarationsTx(tx)
    assert(declared.some(d=>d.accountId===account&&d.state==='DECLARADA'))
    assert(mergeDeclaredAccountIds([],declared).includes(account))
    await c.query("INSERT INTO declaraciones_titularidad_modo_facil(cuenta_id,version,estado,titular_declarado,fecha_declaracion,confirmacion_declarada,actor_id,referencia_evidencia,snapshot) VALUES($1,2,'REVOCADA','Entidad de prueba',CURRENT_DATE,true,$2,'Revocación sintética local',$3::jsonb)",[account,actor,snap])
    assert(!mergeDeclaredAccountIds([account],await readOwnershipDeclarationsTx(tx)).includes(account))
    await c.query('SAVEPOINT probe');let blocked=false
    try{await c.query('TRUNCATE declaraciones_titularidad_modo_facil')}catch{blocked=true}
    await c.query('ROLLBACK TO SAVEPOINT probe');assert(blocked)
    const after=(await c.query('SELECT count(*)::int n FROM politicas_auto_modo_facil LIMIT 1')).rows[0].n
    assert.equal(after,before)
    console.log(JSON.stringify({ok:true,localOnly:true,rollback:true,declaration:true,revocation:true,appendOnly:true,policiesUnchanged:true}))
  } finally {await c.query('ROLLBACK');await c.end()}
}
main().catch(()=>{console.error('OWNERSHIP_LOCAL_TEST_FAILED');process.exitCode=1})
