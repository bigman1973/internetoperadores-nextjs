import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The real pre-change configuration, not an invented runtime or financial fixture.
const reference = {
  version: 2, framework: 'nextjs', cleanUrls: true,
  crons: [
    { path: '/api/cron/abandoned-carts', schedule: '*/10 * * * *' },
    { path: '/api/cron/recordatorio-wizard', schedule: '0 9,15,21 * * *' },
    { path: '/api/cron/keep-supabase-alive', schedule: '0 8 */3 * *' },
    { path: '/api/cron/finance-sync-worker', schedule: '*/5 * * * *' },
    { path: '/api/cron/finance-sync-daily', schedule: '0 1 * * *' },
    { path: '/api/cron/asistente-informe', schedule: '0 6,7 * * *' },
  ],
}
const current = JSON.parse(readFileSync('vercel.json', 'utf8'))
const keys = [
  'app/api/admin/finanzas/conciliar/route.ts',
  'app/api/admin/finanzas/conciliar/**/route.ts',
  'app/admin/finanzas/conciliar/page.tsx',
  'app/admin/finanzas/para-pedir/page.tsx',
]
assert.deepEqual(Object.keys(current.functions).sort(), [...keys].sort())
for (const key of keys) assert.deepEqual(current.functions[key], { regions: ['sfo1'] })
const { functions: _functions, ...other } = current
assert.deepEqual(other, reference, 'Nothing outside four area3 function patterns may change')
assert.ok(!Object.hasOwn(current, 'regions'), 'Global regions stay unchanged')
assert.ok(!Object.hasOwn(current, 'functionFailoverRegions'), 'No failover/global routing is added')
assert.ok(!Object.hasOwn(current, 'env') && !Object.hasOwn(current, 'build'), 'No environment or build override')
assert.deepEqual(current.crons, reference.crons, 'No cron is created or reconfigured')
assert.ok(keys.every(key => !key.includes('actuar-como') && !key.includes('/altas/') && !key.includes('/usuarios/') && !key.includes('/asistente/')))
console.log('Conciliar per-function region scope: PASS')
