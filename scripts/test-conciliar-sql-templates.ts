import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'

// Sólo clasifica plantillas de código: las interpolaciones nunca se evalúan.
const files=[...fs.readdirSync('lib/finanzas').filter(name=>name.startsWith('conciliar-')&&name.endsWith('.ts')).map(name=>path.join('lib/finanzas',name)), 'lib/finanzas/easy-reconciliation-db.ts', 'lib/finanzas/reconciliation-db.ts', 'lib/finanzas/easy-counterparty-db.ts']
let reviewed=0,unknown=0
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
    const result=classifyPrisma5RawSqlStatement([{strings}])
    reviewed++
    if(result==='unknown'){
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
console.log(JSON.stringify({reviewed,unknown,databaseQueries:0}))
if(unknown)process.exitCode=1
