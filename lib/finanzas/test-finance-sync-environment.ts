import test from 'node:test';
import assert from 'node:assert/strict';
import { financeSyncEnabled } from './finance-sync-environment';

test('OneDrive queda bloqueado por defecto y exige exactamente 1', () => {
  assert.equal(financeSyncEnabled({}, 'onedrive'), false);
  assert.equal(financeSyncEnabled({ oneDriveSyncEnabled: '0' }, 'onedrive'), false);
  assert.equal(financeSyncEnabled({ oneDriveSyncEnabled: 'true' }, 'onedrive'), false);
  assert.equal(financeSyncEnabled({ oneDriveSyncEnabled: '1' }, 'onedrive'), true);
});

test('ISP queda bloqueado por defecto y exige exactamente 1', () => {
  assert.equal(financeSyncEnabled({}, 'isp'), false);
  assert.equal(financeSyncEnabled({ ispSyncEnabled: '0' }, 'isp'), false);
  assert.equal(financeSyncEnabled({ ispSyncEnabled: 'true' }, 'isp'), false);
  assert.equal(financeSyncEnabled({ ispSyncEnabled: '1' }, 'isp'), true);
});

test('un flag no habilita el otro proveedor', () => {
  assert.equal(financeSyncEnabled({ oneDriveSyncEnabled: '1' }, 'isp'), false);
  assert.equal(financeSyncEnabled({ ispSyncEnabled: '1' }, 'onedrive'), false);
});
