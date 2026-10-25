import assert from 'node:assert/strict'
import {test} from 'node:test'
import {easyOnlyRequestAllowed as allowed} from '../lib/finanzas/easy-access-core'
import {hasLiveEasyAutomationCapability} from '../lib/finanzas/easy-access-profile'
test('sólo dos pantallas, sin acceso general ni prefijos engañosos',()=>{
 assert(allowed('/admin/finanzas/modo-facil','GET'));assert(allowed('/admin/finanzas/para-pedir','GET'))
 for(const p of ['/admin','/admin/usuarios','/admin/finanzas/conciliacion-v2','/admin/finanzas/modo-facil/automaticas','/admin/finanzas/reparto-clientes'])assert.equal(allowed(p,'GET'),false)
})
test('las excepciones manuales no autorizan reglas automáticas ni cambios de permiso',()=>{
 assert(allowed('/api/admin/finanzas/modo-facil','POST'));assert(allowed('/api/admin/finanzas/modo-facil/foto','POST'))
 assert(allowed('/api/admin/finanzas/modo-facil/reglas','POST')) // handler sólo acepta SOLO_PROPONER
 assert(allowed('/api/admin/finanzas/modo-facil/terceros/bloque','GET'));assert(allowed('/api/admin/finanzas/modo-facil/terceros/bloque','POST'))
 assert(allowed('/api/admin/finanzas/modo-facil/cobros','GET'));assert(allowed('/api/admin/finanzas/modo-facil/cobros','POST'))
 assert.equal(allowed('/api/admin/finanzas/modo-facil/terceros/bloque','DELETE'),false)
 assert.equal(allowed('/api/admin/finanzas/modo-facil/cobros','DELETE'),false)
 assert.equal(allowed('/api/admin/finanzas/modo-facil/automaticas/tramos','GET'),false)
 for(const p of ['/api/admin/finanzas/modo-facil/automaticas','/api/admin/finanzas/conciliacion-v2','/api/admin/finanzas/sync-jobs','/api/admin/permisos'])assert.equal(allowed(p,'POST'),false)
 assert.equal(allowed('/api/admin/finanzas/modo-facil','DELETE'),false)
})
test('descargas sólo privadas y de lectura, permisos sólo propios',()=>{
 assert(allowed('/api/admin/finanzas/modo-facil/documentos/abc/archivo','GET'))
 assert(allowed('/api/admin/finanzas/movimientos/abc/archivos','GET',new URLSearchParams('archivoId=ADJUNTO_B5:xyz')))
 assert.equal(allowed('/api/admin/finanzas/movimientos/abc/archivos','GET'),false)
 assert.equal(allowed('/api/admin/finanzas/modo-facil/documentos/abc/archivo','POST'),false)
 assert(allowed('/api/admin/permisos','GET',new URLSearchParams('action=usuario&usuarioId=10'),10))
 assert.equal(allowed('/api/admin/permisos','GET',new URLSearchParams('action=todos'),10),false)
 assert.equal(allowed('/api/admin/permisos','GET',new URLSearchParams('action=usuario&usuarioId=11'),10),false)
})


test('la capacidad de automatización sólo nace del perfil vivo no restringido',()=>{
 assert.equal(hasLiveEasyAutomationCapability({activo:true,rol:'GERENTE',easyOnly:false}),true)
 assert.equal(hasLiveEasyAutomationCapability({activo:true,rol:'SUPER_ADMIN',easyOnly:false}),true)
 assert.equal(hasLiveEasyAutomationCapability({activo:false,rol:'GERENTE',easyOnly:false}),false)
 assert.equal(hasLiveEasyAutomationCapability({activo:true,rol:'CONTABILIDAD',easyOnly:false}),false)
 assert.equal(hasLiveEasyAutomationCapability({activo:true,rol:'GERENTE',easyOnly:true}),false,'MODO_FACIL_ONLY no recibe gestión con rol heredado')
 assert.equal(hasLiveEasyAutomationCapability({activo:true,rol:'SUPER_ADMIN',easyOnly:true}),false,'MODO_FACIL_ONLY no recibe gestión con superadmin heredado')
})
