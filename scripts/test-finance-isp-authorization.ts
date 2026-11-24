import assert from 'node:assert/strict'
import test from 'node:test'
import {authorizeP2ActorInTx} from '../lib/finanzas/sync-jobs/assembly'
import {buildIspScope} from '../lib/finanzas/sync-jobs/isp-sync-scope'
const scope=buildIspScope(new Date('2026-11-06T12:00:00Z'),2026)
const tx=(rol:string,activo=true)=>({usuarioAdmin:{findUnique:async()=>({id:3,rol,activo})}}) as never

test('a live superadmin can request an explicit annual manual job',async()=>{await authorizeP2ActorInTx({actorId:3,source:'ISP',operation:'create',scope,trigger:'MANUAL'},tx('SUPER_ADMIN'))})
test('an annual job is revalidated inside apply after actor deactivation',async()=>{await assert.rejects(authorizeP2ActorInTx({actorId:3,source:'ISP',operation:'apply',scope,trigger:'MANUAL'},tx('SUPER_ADMIN',false)),/SYNC_ACTOR_INACTIVE/)})
test('revoked administrator role never obtains annual authority through an area permission',async()=>{await assert.rejects(authorizeP2ActorInTx({actorId:3,source:'ISP',operation:'create',scope,trigger:'MANUAL'},tx('CONTABILIDAD')),/ISP_YEAR_ADMIN_REQUIRED/)})
test('an annual scope cannot execute as a daily cron, even with a superadmin system actor',async()=>{await assert.rejects(authorizeP2ActorInTx({actorId:3,source:'ISP',operation:'apply',scope,trigger:'DAILY_UTC'},tx('SUPER_ADMIN')),/ISP_YEAR_ADMIN_REQUIRED/)})
test('no implicit/null actor can create or apply ISP work',async()=>{await assert.rejects(authorizeP2ActorInTx({actorId:null,source:'ISP',operation:'create',scope,trigger:'MANUAL'},tx('SUPER_ADMIN')),/SYNC_ACTOR_REQUIRED/)})
