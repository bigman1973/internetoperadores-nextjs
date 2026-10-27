#!/usr/bin/env npx tsx
import assert from 'node:assert/strict'
import fs from 'node:fs'
const files=['app/admin/finanzas/conciliar/page.tsx','app/api/admin/finanzas/conciliar/route.ts']
for(const file of files){
 const s=fs.readFileSync(file,'utf8')
 assert.match(s,/export const preferredRegion = 'sfo1'/)
 assert.ok(s.includes('await assertPrototypeStaging()'))
 assert.ok(s.includes('requireB4FinanceAccess'))
}
assert.ok(fs.readFileSync('node_modules/next/dist/build/segment-config/app/app-segment-config.js','utf8').includes('preferredRegion:'))
assert.ok(!('functions' in JSON.parse(fs.readFileSync('vercel.json','utf8'))))
const page=fs.readFileSync(files[0],'utf8')
assert.ok(page.includes('process.env.VERCEL_REGION'))
assert.ok(page.includes('executionRegion'))
assert.ok(page.includes("process.env.FINANCE_STAGING_SANDBOX === '1'"))
console.log('PASS: región de segmento reconocida por Next instalado; sólo Conciliar; aislamiento y ACL intactos. Efecto en Vercel pendiente de medición, no inferido por este test.')
