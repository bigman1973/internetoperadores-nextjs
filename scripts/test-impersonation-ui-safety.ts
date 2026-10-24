import assert from 'node:assert/strict'
import test from 'node:test'
import { parseActuationState, parseAuditEvents, safeInternalRedirect, retryExitAttempt, createExitAttempt } from '../components/impersonation/contract'

test('acepta la identidad string de NextAuth y la convierte sin cambiar sus permisos',()=>{
  const parsed=parseActuationState({enabled:true,canStart:false,active:{sessionId:'test',actorName:'Actor',targetName:'Destino',targetId:'7',expiresAt:'2026-10-24T18:00:00Z'}})
  assert.equal(parsed.active?.targetId,7)
  assert.equal(parsed.canStart,false)
  assert.throws(()=>parseActuationState({enabled:true,canStart:true,active:{sessionId:'test',actorName:'Actor',targetName:'Destino',targetId:'7x',expiresAt:'2026-10-24T18:00:00Z'}}))
})

test('el registro conserva actor, destino e IP sin retener cuerpos o tokens',()=>{
  const parsed=parseAuditEvents({events:[{id:'test',at:'2026-10-24T18:00:00Z',kind:'START',actorName:'Actor',targetName:'Destino',ip:'192.0.2.1',outcome:'SUCCESS',cookie:'secret-not-retained'}],total:1})
  assert.equal(parsed.events[0].ip,'192.0.2.1')
  assert.equal(parsed.events[0].actorName,'Actor')
  assert.equal(parsed.events[0].targetName,'Destino')
  assert.equal('cookie' in parsed.events[0],false)
})

test('los reintentos de salida mantienen la misma solicitud y las redirecciones son internas',()=>{
  const attempt=createExitAttempt(()=> 'fixed-key-123456789')
  assert.equal(retryExitAttempt(attempt),attempt)
  assert.equal(safeInternalRedirect('https://example.invalid'),'/admin')
  assert.equal(safeInternalRedirect('//example.invalid'),'/admin')
  assert.equal(safeInternalRedirect('/\\example.invalid'),'/admin')
  assert.equal(safeInternalRedirect('/admin/finanzas/modo-facil'),'/admin/finanzas/modo-facil')
})
