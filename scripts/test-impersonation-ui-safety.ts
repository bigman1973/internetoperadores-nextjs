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
test('la página de bloqueo escapa el nombre, mantiene la banda y sólo sustituye navegaciones de documento',async()=>{
  const { renderActingDeniedPage, isDocumentNavigation, escapeHtml } = await import('../lib/impersonation-denied-page')
  const html=renderActingDeniedPage('<img src=x onerror=alert(1)> "Ana"')
  assert.equal(html.includes('<img src=x'),false)
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &quot;Ana&quot;'))
  assert.ok(html.includes('Estás actuando como'))
  assert.ok(html.includes('Volver a mi usuario'))
  assert.ok(html.includes("'x-io-actuation-csrf':state.csrfToken"),'la salida usa el token CSRF del servidor')
  assert.ok(html.includes("action:'salir'"))
  assert.equal(escapeHtml(`&<>"'`),'&amp;&lt;&gt;&quot;&#39;')
  const doc=new Headers({accept:'text/html,application/xhtml+xml'})
  assert.equal(isDocumentNavigation('/admin/usuarios','GET',doc),true)
  assert.equal(isDocumentNavigation('/api/admin/usuarios','GET',doc),false,'las APIs siguen en JSON')
  assert.equal(isDocumentNavigation('/admin/usuarios','POST',doc),false)
  assert.equal(isDocumentNavigation('/admin/usuarios','GET',new Headers({accept:'text/html',rsc:'1'})),false,'RSC sigue en JSON')
  assert.equal(isDocumentNavigation('/admin/usuarios','GET',new Headers({accept:'application/json'})),false)
})
