import assert from 'node:assert/strict'
import { Prisma } from '@prisma/client'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
const q='fixture-sintetica-no-identificativa'
const pattern='%'+q+'%'
const oldFilter=Prisma.sql`(p.id=${q} OR p.concepto ILIKE ${pattern} ESCAPE '\\')`
const safeFilter=Prisma.sql`(p.id=${q} OR p.concepto ILIKE ${pattern})`
const wrap=(filter:Prisma.Sql)=>Prisma.sql`SELECT p.* FROM conciliar_proyecciones p WHERE p.tab=${'COBROS'} AND ${filter} ORDER BY abs(p.importe_centimos::bigint) DESC,p.id ASC LIMIT ${50} OFFSET ${0}`
const previous=classifyPrisma5RawSqlStatement([wrap(oldFilter)])
const current=classifyPrisma5RawSqlStatement([wrap(safeFilter)])
assert.equal(previous,'unknown','la regresión debe reproducir el rechazo de la consulta compuesta antigua')
assert.equal(current,'read_only')
console.log(JSON.stringify({oldComposedQuery:previous,newComposedQuery:current,databaseQueries:0}))
