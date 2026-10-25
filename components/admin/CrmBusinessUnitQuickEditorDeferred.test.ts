import assert from 'node:assert/strict'
import { canEditCrmBusinessUnits, mergeCrmBusinessUnitOptions } from './crmBusinessUnitQuickEditorDeferred.helpers'

const standardOptions = [{ value: 'VENTAS', label: 'Ventas' }]

assert.deepEqual(
  mergeCrmBusinessUnitOptions(standardOptions, ['VENTAS', 'SOPORTE']),
  [{ value: 'VENTAS', label: 'Ventas' }, { value: 'SOPORTE', label: 'SOPORTE' }],
  'Mantiene opciones conocidas y añade sólo unidades históricas ausentes.',
)

assert.equal(canEditCrmBusinessUnits({ editable: true, isViewingAs: false, isSuperAdmin: false, hasAreaAccess: true }), true)
assert.equal(canEditCrmBusinessUnits({ editable: false, isViewingAs: false, isSuperAdmin: true, hasAreaAccess: true }), false)
assert.equal(canEditCrmBusinessUnits({ editable: true, isViewingAs: true, isSuperAdmin: true, hasAreaAccess: true }), false)
assert.equal(canEditCrmBusinessUnits({ editable: true, isViewingAs: false, isSuperAdmin: false, hasAreaAccess: false }), false)
assert.equal(canEditCrmBusinessUnits({ editable: true, isViewingAs: false, isSuperAdmin: true, hasAreaAccess: false }), true)

console.log('CrmBusinessUnitQuickEditorDeferred: synthetic permission and option tests passed')
