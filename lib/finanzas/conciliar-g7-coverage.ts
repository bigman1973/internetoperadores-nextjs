/** Pure counters, no SQL/fixtures: zero green coverage is never a passing G7. */
import { CONCILIAR_PRECHECK_KINDS } from './conciliar-precheck-kinds'
import type { ConciliarPrecheck } from './conciliar-precheck'
import type { ConciliarProjectionSource } from './conciliar-contract'
export type G7ClassCount = { population:number; green:number; checked:number; amber:number; red:number }
export function newConciliarG7Coverage() {
  return Object.fromEntries(CONCILIAR_PRECHECK_KINDS.map(kind=>[kind,{population:0,green:0,checked:0,amber:0,red:0}])) as Record<ConciliarProjectionSource['kind'],G7ClassCount>
}
export function concludeConciliarG7Coverage(classes:ReturnType<typeof newConciliarG7Coverage>) {
  const values=Object.values(classes),totalGreen=values.reduce((sum,item)=>sum+item.green,0),checkedGreen=values.reduce((sum,item)=>sum+item.checked,0)
  const noGreensSkipped=values.every(item=>item.green===item.checked)
  const classesWithoutPopulation=Object.entries(classes).filter(([,item])=>item.population===0).map(([kind])=>kind)
  const allClassesPopulated=classesWithoutPopulation.length===0
  return {ok:totalGreen>0 && noGreensSkipped && allClassesPopulated,totalGreen,checkedGreen,noGreensSkipped,allClassesPopulated,classes,classesWithoutPopulation}
}
export function assertConciliarG7GreenDecision(result:ConciliarPrecheck) {
  if(!result.confirmable) throw new Error('AREA3_G7_GREEN_NOT_CONFIRMABLE')
}
