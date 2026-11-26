import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Función JSX productiva exacta, no una reconstrucción. No hooks, Graph ni BD.
const source=readFileSync('components/admin/CrmContactoWorkspace.tsx','utf8')
const start=source.indexOf('function ActivityCard('),end=source.indexOf('\nfunction FollowUpCard(',start)
assert.ok(start>=0&&end>start)
const realCard=source.slice(start,end)
assert.doesNotMatch(realCard,/outlookConnection/,'la tarjeta no debe leer una variable fuera de alcance')
assert.match(source,/<ActivityCard[^>]+m365Enabled=\{outlookConnection\.m365 !== false\}/)
const code=ts.transpileModule(realCard+'\nmodule.exports={ActivityCard};',{
  fileName:'activity-card.tsx',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText
const mod:any={exports:{}}
const jsx=(type:any,props:any)=>({type,props})
vm.runInNewContext(code,{
  module:mod,exports:mod.exports,
  require(name:string){if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'fragment'};throw Error('UNEXPECTED_MODULE:'+name)},
  activityVisual:()=>({icon:'activity-icon',style:''}),stringArray:(v:unknown)=>Array.isArray(v)?v:[],
  activityMeta:()=>'',resultStyle:()=>'',activityResultLabel:()=>'',MapPinIcon:'map-icon',Area1M365Acciones:'m365-actions',
})
function countActions(node:any):number {
  if(Array.isArray(node))return node.reduce((n,value)=>n+countActions(value),0)
  if(!node||typeof node!=='object')return 0
  return Number(node.type==='m365-actions')+countActions(node.props?.children)
}
for(const type of ['NOTA','CORREO','REUNION'])for(const canWrite of [false,true])for(const m365Enabled of [false,true]){
  test(`Tarjeta ${type} escritura=${canWrite} M365=${m365Enabled}: render sin ReferenceError y puerta real`,()=>{
    const tree=mod.exports.ActivityCard({activity:{id:'ficticia',contactId:'ficticio',type,title:'Actividad ficticia',date:'26/11/2026',author:'Prueba',
      origin:'CRM',result:null,metadata:{},description:'Texto local',deals:[],followUp:null},canWrite,m365Enabled,updating:false,onTaskState(){throw Error('NO_MUTATIONS')}})
    assert.equal(countActions(tree),Number(canWrite&&m365Enabled&&type!=='NOTA'))
  })
}
