#!/usr/bin/env node
// Explicit isolated staging-only migration. Never applies legacy pending migrations.
const fs=require('node:fs');const path=require('node:path');const {Client}=require('pg');
async function main(){
 if(!process.argv.includes('--apply')||process.env.RENTABILIDAD_MIGRATION_APPROVED!=='1'||process.env.VERCEL_ENV==='production'||process.env.FINANCE_STAGING_SANDBOX!=='1')throw Error('MIGRATION_EXPLICIT_STAGING_APPROVAL_REQUIRED');
 const u=new URL(process.env.DATABASE_URL||'');if(u.pathname!=='/io_staging_finanzas'||decodeURIComponent(u.username)!=='io_staging_finanzas')throw Error('RENTABILIDAD_STAGING_REQUIRED');
 const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
 try{
  const identity=(await c.query('SELECT current_database() db,current_user usuario LIMIT 1')).rows[0];if(identity.db!=='io_staging_finanzas'||identity.usuario!=='io_staging_finanzas')throw Error('RENTABILIDAD_STAGING_REQUIRED');
  const existing=(await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('rentabilidad_versiones','rentabilidad_lineas','rentabilidad_ejecuciones','rentabilidad_snapshots') LIMIT 5")).rows;
  if(existing.length)throw Error('RENTABILIDAD_NAMESPACE_ALREADY_EXISTS');
  const counts=async()=>{const result={};for(const table of ['facturas_recibidas','facturas','contratos_servicio','contratos_draxton','contratos_proveedor_draxton','personal_contratos_draxton','nominas'])result[table]=(await c.query(`SELECT count(*)::int filas FROM "${table}" LIMIT 1`)).rows[0].filas;return result;};
  const before=await counts();await c.query('BEGIN');
  const sql=fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261124_area3_rentabilidad/migration.sql'),'utf8');
  if(/^\s*(?:DROP|ALTER\s+TABLE|TRUNCATE)\b/im.test(sql))throw Error('NON_ADDITIVE_DDL_REJECTED');
  await c.query(sql);await c.query('COMMIT');const after=await counts();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('SOURCE_COUNTS_CHANGED');
  console.log(JSON.stringify({migration:'20261124_area3_rentabilidad',status:'APPLIED_STAGING_ONLY',newTables:4,sourceCountsBefore:before,sourceCountsAfter:after}));
 }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{await c.end();}
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:error.code||'MIGRATION_FAILED'}));process.exitCode=1;});
