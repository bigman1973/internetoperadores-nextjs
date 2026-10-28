import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'
import { counterpartyCandidateHash } from '../lib/finanzas/easy-counterparty-core'

type Candidate = { seed: unknown; etiqueta: string; autoIdentify: boolean }
const source = readFileSync(resolve(__dirname, '../lib/finanzas/easy-counterparty-db.ts'), 'utf8')
const actualFunction = source.match(/function addCandidate\([\s\S]*?\n}\n/)?.[0]
assert(actualFunction)
let hashes = 0
const addCandidate = vm.runInNewContext(ts.transpileModule(actualFunction, {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText + '\naddCandidate;', {
  counterpartyCandidateHash: (seed: Parameters<typeof counterpartyCandidateHash>[0]) => { hashes += 1; return counterpartyCandidateHash(seed) },
}) as (target: Candidate[], movement: string, type: string, origin: string, identity: string | null, label: string, auto: boolean, seen?: Set<string>) => void
const oldPath: Candidate[] = [], indexed: Candidate[] = []
const index = new Set<string>()
for (let i = 0; i < 220; i++) {
  const id = i % 200
  const args = ['synthetic-movement', 'CLIENTE', 'ENTIDAD_FISCAL', `EF:synthetic-${id}`, `First label ${i}`, i % 2 === 0] as const
  addCandidate(oldPath, ...args)
  addCandidate(indexed, ...args, index)
}
assert.equal(JSON.stringify(indexed), JSON.stringify(oldPath), 'same candidates, same first label, same autoIdentify, same order and exact seeds')
assert.equal(indexed.length, 200)
assert.equal(index.size, 200)
const nextRequest: Candidate[] = [], independent = new Set<string>()
addCandidate(nextRequest, 'synthetic-other-movement', 'CLIENTE', 'ENTIDAD_FISCAL', 'EF:synthetic-0', 'New request', false, independent)
assert.equal(nextRequest.length, 1)
assert.equal(independent.size, 1)
const large: Candidate[] = [], largeIndex = new Set<string>()
hashes = 0
for (let i = 0; i < 2000; i++) addCandidate(large, 'synthetic-movement', 'CLIENTE', 'ENTIDAD_FISCAL', `EF:synthetic-${i}`, 'Synthetic', false, largeIndex)
assert.equal(hashes, 2000, 'exactly one candidate hash per insertion, no quadratic rehashing')
assert.equal(large.length, 2000)
const before = hashes
addCandidate(large, 'synthetic-movement', 'CLIENTE', 'ENTIDAD_FISCAL', null, 'Missing identity', true, largeIndex)
assert.equal(hashes, before)
assert.equal(large.length, 2000)
const catalogue = source.slice(source.indexOf('async function stableSearchCandidatesTx'), source.indexOf('export async function searchEasyCounterparties'))
assert.equal((catalogue.match(/false, seenHashes\)/g) ?? []).length, 4, 'all four stable source kinds use the same per-call index')
assert.match(catalogue, /const seenHashes = new Set<string>\(\)/)
console.log('OK: exact candidate equivalence, first-entry semantics, independent per-call indexes, 2,000 insertions = 2,000 hashes')
