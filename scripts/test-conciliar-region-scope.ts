import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// This is the canonical main configuration. Conciliar must not recreate the
// former Vercel per-function staging routing contract.
const canonicalVercelJson = `{
  "version": 2,
  "framework": "nextjs",
  "cleanUrls": true,
  "crons": [
    {
      "path": "/api/cron/abandoned-carts",
      "schedule": "*/10 * * * *"
    },
    {
      "path": "/api/cron/recordatorio-wizard",
      "schedule": "0 9,15,21 * * *"
    },
    {
      "path": "/api/cron/keep-supabase-alive",
      "schedule": "0 8 */3 * *"
    },
    {
      "path": "/api/cron/finance-sync-worker",
      "schedule": "*/5 * * * *"
    },
    {
      "path": "/api/cron/finance-sync-daily",
      "schedule": "0 1 * * *"
    },
    {
      "path": "/api/cron/asistente-informe",
      "schedule": "0 6,7 * * *"
    }
  ]
}
`

const vercelJson = readFileSync('vercel.json', 'utf8')
assert.equal(vercelJson, canonicalVercelJson, 'vercel.json must remain byte-for-byte aligned with main')

const conciliarRoute = readFileSync('app/api/admin/finanzas/conciliar/route.ts', 'utf8')
const conciliarPage = readFileSync('app/admin/finanzas/conciliar/page.tsx', 'utf8')
const paraPedirPage = readFileSync('app/admin/finanzas/para-pedir/page.tsx', 'utf8')

// Region placement is segment-owned in main, rather than a Vercel functions glob.
assert.match(conciliarRoute, /export const preferredRegion = 'sfo1'/)
assert.match(conciliarPage, /export const preferredRegion = 'sfo1'/)

// Negative: Para Pedir must not acquire the old copied Conciliar region policy.
assert.doesNotMatch(paraPedirPage, /export const preferredRegion\s*=/)

console.log('Conciliar segment-owned region scope: PASS')
