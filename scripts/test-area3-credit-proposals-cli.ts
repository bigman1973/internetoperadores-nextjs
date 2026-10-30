import assert from 'node:assert/strict'
import test from 'node:test'
import { runArea3CreditProposalCli } from './area3-propose-credit-notes'

const tracked = ['DATABASE_URL', 'FINANCE_STAGING_SANDBOX', 'VERCEL_ENV', 'FINANCE_MODEL_PRODUCTION_ENABLED', 'AREA3_CREDIT_PROPOSALS_STAGING_APPLY', 'AREA3_CREDIT_PROPOSALS_LOCAL_ROLLBACK'] as const
const saved = Object.fromEntries(tracked.map((key) => [key, process.env[key]]))
function reset(): void {
  for (const key of tracked) {
    const value = saved[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}
function url(host: string, database: string, role = 'io_staging_finanzas'): string {
  return `postgresql://${role}:private@${host}:34880/${database}`
}
function noConnect(): never { throw new Error('CONNECTION_MUST_NOT_OPEN') }

test('CLI rechaza producción antes de abrir conexión', async () => {
  try {
    process.env.DATABASE_URL = url('yamanote.proxy.rlwy.net', 'railway', 'postgres')
    process.env.VERCEL_ENV = 'production'
    await assert.rejects(() => runArea3CreditProposalCli({ args: [], createClient: noConnect }), /AREA3_PRODUCTION_FORBIDDEN/)
  } finally { reset() }
})

test('CLI rechaza --apply staging sin opt-in explícito antes de abrir conexión', async () => {
  try {
    process.env.DATABASE_URL = url('yamanote.proxy.rlwy.net', 'io_staging_finanzas')
    process.env.FINANCE_STAGING_SANDBOX = '1'
    process.env.VERCEL_ENV = 'preview'
    delete process.env.AREA3_CREDIT_PROPOSALS_STAGING_APPLY
    await assert.rejects(() => runArea3CreditProposalCli({ args: ['--apply'], createClient: noConnect }), /AREA3_STAGING_APPLY_OPT_IN_REQUIRED/)
  } finally { reset() }
})

test('CLI rechaza host remoto no permitido y ensayo local sin bandera rollback', async () => {
  try {
    process.env.DATABASE_URL = url('other.example.invalid', 'io_staging_finanzas')
    process.env.FINANCE_STAGING_SANDBOX = '1'
    process.env.VERCEL_ENV = 'preview'
    await assert.rejects(() => runArea3CreditProposalCli({ args: [], createClient: noConnect }), /AREA3_STAGING_TARGET_INVALID/)

    process.env.DATABASE_URL = 'postgresql://local:private@127.0.0.1:5432/io_restore_area3_20261030_1411'
    delete process.env.AREA3_CREDIT_PROPOSALS_LOCAL_ROLLBACK
    await assert.rejects(() => runArea3CreditProposalCli({ args: ['--apply', '--local-rollback'], createClient: noConnect }), /AREA3_LOCAL_ROLLBACK_OPT_IN_REQUIRED/)
  } finally { reset() }
})

test('CLI sólo acepta sus flags finitos', async () => {
  try {
    process.env.DATABASE_URL = url('yamanote.proxy.rlwy.net', 'io_staging_finanzas')
    await assert.rejects(() => runArea3CreditProposalCli({ args: ['--yes'], createClient: noConnect }), /AREA3_ARGUMENT_INVALID/)
    await assert.rejects(() => runArea3CreditProposalCli({ args: ['--local-rollback'], createClient: noConnect }), /AREA3_LOCAL_ROLLBACK_REQUIRES_APPLY/)
  } finally { reset() }
})

console.log('OK: Area 3c CLI guard tests reject unsafe targets before connecting; no DB, DML, Graph, OCR, B4 or human confirmation.')
