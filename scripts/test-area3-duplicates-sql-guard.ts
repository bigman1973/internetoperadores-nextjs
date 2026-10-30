import assert from 'node:assert/strict'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import { area3ReceivedDocumentHashSql } from '../lib/finanzas/area3-document-fingerprints-db'

for (const statement of [
  area3ReceivedDocumentHashSql.duplicateCountForTests(),
  area3ReceivedDocumentHashSql.duplicateProjectionForTests({ page: 1, limit: 50 }),
  area3ReceivedDocumentHashSql.duplicateProjectionForTests({ page: 2, limit: 50 }),
]) assert.equal(classifyPrisma5RawSqlStatement([statement]), 'read_only', 'La consulta debe respetar la guarda existente de Lorena sin ampliar funciones.')

const projection = area3ReceivedDocumentHashSql.duplicateProjectionForTests({ page: 2, limit: 50 })
for (const key of ['groupOrdinal', 'documentCount', 'visibleDocumentCount', 'documentPosition']) {
  assert.ok(projection.text.includes(`AS "${key}"`), `PostgreSQL debe devolver la clave exacta ${key}.`)
}
assert.ok(!projection.text.includes('ROW_NUMBER'), 'No usar funciones de ventana fuera de la guarda existente.')
console.log('PASS: avisos de duplicados en ambas páginas admitidos por la guarda SQL real; alias exactos, sin ampliar permisos.')
