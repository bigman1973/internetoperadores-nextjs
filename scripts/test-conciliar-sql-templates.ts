import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'

// Sólo clasifica plantillas de código: las interpolaciones nunca se evalúan.
const files=[...fs.readdirSync('lib/finanzas').filter(name=>name.startsWith('conciliar-')&&name.endsWith('.ts')).map(name=>path.join('lib/finanzas',name)), 'lib/finanzas/easy-reconciliation-db.ts', 'lib/finanzas/reconciliation-db.ts', 'lib/finanzas/easy-counterparty-db.ts']
// Preparación explícita de superadmin por CLI, no capacidad de una sesión actuada.
// Estos cuatro SQL de catálogo/dependencias/modo transaccional deben SEGUIR
// rechazados por el guard; una modificación de la plantilla falla cerrada.
const maintenanceTemplates=new Set([
 'lib/finanzas/conciliar-preparation-epoch.ts:6e4417f7be661e33766f07ec2fa78e8141ebe25ebd20fc9f9d5c86ad200b7ad2',
 'lib/finanzas/conciliar-preparation-epoch.ts:53ddd3e67498033383b79cbabc71861afc73ae89cf7a79357cd66ee2735d9df9',
 'lib/finanzas/conciliar-preparation.ts:4de15d6a5e1966b8876deda5bef32a70faf0115e3c361541f248dc285b776e24',
 'lib/finanzas/conciliar-preparation.ts:dd8eede4989830fb5b12d4877ac81115fd8da7e40453d93f1196cb31ba8db48f',
])
for(const f of [...files,'app/api/admin/finanzas/conciliar/route.ts']) {
 if(!f.endsWith('/conciliar-preparation.ts')) assert.doesNotMatch(fs.readFileSync(f,'utf8'), /(?:from\s*|import\s*\()['"][^'"]*\/conciliar-preparation['"]/)
}
let reviewed=0,unknown=0,maintenanceRejected=0
function sqlTemplate(strings: readonly string[]) {
 const parts=Object.assign([...strings],{raw:[...strings]}) as unknown as TemplateStringsArray
 return Prisma.sql(parts,...strings.slice(1).map((_,index)=>`template-${index}`))
}
for(const file of files){
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true)
 const visit=(node:ts.Node)=>{
  if(ts.isTaggedTemplateExpression(node)){
   const tag=node.tag.getText(source)
   if(tag==='Prisma.sql'||/\.\$queryRaw(?:Unsafe)?$|\.\$executeRaw(?:Unsafe)?$/.test(tag)){
    const strings=ts.isNoSubstitutionTemplateLiteral(node.template)?[node.template.text]:[node.template.head.text,...node.template.templateSpans.map(span=>span.literal.text)]
    if(tag==='Prisma.sql'&&!/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE|SET)\b/i.test(strings[0])){
      ts.forEachChild(node,visit)
      return
    }
    let classificationStrings=strings
    if(file==='lib/finanzas/conciliar-batch.ts' && /^\s*SELECT pg_advisory_xact_lock\(hashtextextended\(v\.movimiento_id,0\)\)::text AS locked\s+FROM \(VALUES\s*$/i.test(strings[0])){
     assert(ts.isTemplateExpression(node.template) && node.template.templateSpans.length===1)
     assert.equal(node.template.templateSpans[0].expression.getText(source),'Prisma.join(values)')
     assert.match(source.text,/const values = \[\.\.\.new Set\(keys\)\]\.sort\(\(left, right\) => left\.localeCompare\(right\)\)/)
     assert(source.text.includes('.map(id => Prisma.sql`(CAST(${id} AS text))`)'))
     // Una fila ligada representativa; 1/20/100 y rechazos se prueban además
     // con Prisma.sql REAL en test-conciliar-batch-lock-classifier.ts.
     classificationStrings=[strings[0]+'(CAST(', ' AS text))'+strings[1]]
    }
    const result=classifyPrisma5RawSqlStatement([sqlTemplate(classificationStrings)])
    reviewed++
    const maintenanceKey=file+':'+createHash('sha256').update(JSON.stringify(strings)).digest('hex')
    if(maintenanceTemplates.has(maintenanceKey)) {
     assert.equal(result,'unknown','No habilitar mantenimiento desde una sesión actuada')
     maintenanceRejected++
    } else if(result==='unknown'){
     unknown++
     const line=source.getLineAndCharacterOfPosition(node.pos).line+1
     const calls=[...strings.join('?').matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)].map(match=>match[1]).filter((name,index,list)=>list.indexOf(name)===index)
     console.log(JSON.stringify({file,line,classification:result,calls}))
    }
   }
  }
  ts.forEachChild(node,visit)
 }
 visit(source)
}
assert.equal(maintenanceRejected,4,'Todas y sólo las cuatro plantillas cerradas deben quedar rechazadas')
console.log(JSON.stringify({reviewed,unknown,maintenanceRejected,databaseQueries:0}))
if(unknown)process.exitCode=1
