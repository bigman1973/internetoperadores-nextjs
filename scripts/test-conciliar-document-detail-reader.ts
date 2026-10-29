/* Detalle documental: pruebas puras sintéticas; sin Prisma, red, PDF ni datos reales. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import {
  buildConfirmingDocumentDetail,
  buildRemittanceDocumentDetail,
} from '../lib/finanzas/conciliar-document-detail'
import { parseConciliarDocumentDetail } from '../lib/finanzas/conciliar-document-detail-contract'

const root = new URL('../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')
const rowId = 'fila_sintetica_detalle'
const nominal = 10_000
const intereses = 100
const comision = 20
const iva = 4
const neto = nominal - intereses - comision - iva

function confirming(overrides: Partial<Parameters<typeof buildConfirmingDocumentDetail>[0]> = {}) {
  return buildConfirmingDocumentDetail({
    rowId,
    importeBancoCentimos: neto,
    pdfHref: `/api/admin/finanzas/conciliar/archivo/${rowId}`,
    banco: 'CAIXABANK',
    cuentaAbono: 'Cuenta sintética',
    proveedor: 'Proveedor sintético',
    fechaLiquidacion: '2026-10-28',
    nominalCentimos: nominal,
    interesesCentimos: intereses,
    comisionCentimos: comision,
    ivaComisionCentimos: iva,
    netoDocumentoCentimos: neto,
    estadoDocumental: 'CUADRA',
    snapshotExplicito: true,
    numeroLiquidacionExplicito: null,
    referenciaDocumento: 'liquidacion-sintetica.pdf',
    lineas: [{ numero: 'SINT/001', cliente: 'Cliente sintético', fechaEmision: '2026-10-01', fechaVencimiento: '2026-10-28', nominalCentimos: nominal }],
    ...overrides,
  })
}

test('confirming conserva importes explícitos, fechas y cliente; no convierte el archivo en número', () => {
  const detail = parseConciliarDocumentDetail(confirming())
  assert.equal(detail.kind, 'CONFIRMING')
  assert.equal(detail.bancoEmisor, 'CaixaBank')
  assert.equal(detail.numeroLiquidacion, null)
  assert.equal(detail.referenciaDocumento, 'liquidacion-sintetica.pdf')
  assert.equal(detail.fechaLiquidacion, '2026-10-28')
  assert.deepEqual(detail.lineas, [{ numero: 'SINT/001', cliente: 'Cliente sintético', fechaEmision: '2026-10-01', fechaVencimiento: '2026-10-28', nominalCentimos: nominal }])
  assert.equal(detail.cuadreExacto, true)
  assert(detail.avisos.some(value => value.includes('No se ha declarado un número')))
})

test('confirming ámbar publica faltas textuales y no fuerza el cuadre si cambia el neto documental', () => {
  const detail = confirming({ netoDocumentoCentimos: neto + 1, interesesCentimos: null, snapshotExplicito: false })
  assert.equal(detail.cuadreExacto, false)
  assert.equal(detail.interesesCentimos, null)
  assert(detail.avisos.some(value => value.includes('interés explícito')))
  assert(detail.avisos.some(value => value.includes('snapshot explícito')))
  assert(detail.avisos.some(value => value.includes('no coincide exactamente')))
})

test('confirming queda ámbar si el desglose explícito o las líneas no acreditan el nominal', () => {
  const deductionsMismatch = confirming({ comisionCentimos: comision + 1 })
  assert.equal(deductionsMismatch.cuadreExacto, false)
  assert(deductionsMismatch.avisos.some(value => value.includes('deducciones y neto')))

  const linesMismatch = confirming({ lineas: [{ numero: 'SINT/001', cliente: 'Cliente sintético', fechaEmision: '2026-10-01', fechaVencimiento: '2026-10-28', nominalCentimos: nominal - 1 }] })
  assert.equal(linesMismatch.cuadreExacto, false)
  assert(linesMismatch.avisos.some(value => value.includes('facturas documentales no coincide')))

  const review = confirming({ estadoDocumental: 'REQUIERE_REVISION_DOCUMENTAL' })
  assert.equal(review.cuadreExacto, false)
  assert(review.avisos.some(value => value.includes('revisión documental')))
})

test('remesa sólo cierra cuando la composición íntegra suma el abono concreto', () => {
  const complete = buildRemittanceDocumentDetail({
    rowId,
    fechaAbono: '2026-10-28',
    banco: 'Banco sintético',
    cuenta: 'Cuenta sintética',
    importeBancoCentimos: nominal,
    lineas: [
      { numero: 'SINT/R1', cliente: 'Cliente A', fechaEmision: '2026-10-01', fechaVencimiento: null, nominalCentimos: 4_000 },
      { numero: 'SINT/R2', cliente: 'Cliente B', fechaEmision: '2026-10-02', fechaVencimiento: null, nominalCentimos: 6_000 },
    ],
    avisos: [],
  })
  assert.equal(complete.cuadreExacto, true)
  assert.equal(complete.lineas.length, 2)

  const incomplete = buildRemittanceDocumentDetail({
    rowId,
    fechaAbono: '2026-10-28',
    banco: 'Banco sintético',
    cuenta: 'Cuenta sintética',
    importeBancoCentimos: nominal,
    lineas: null,
    avisos: ['La fuente persistida no está disponible.'],
  })
  assert.equal(incomplete.cuadreExacto, false)
  assert.equal(incomplete.lineas.length, 0)
  assert(incomplete.avisos.some(value => value.includes('composición íntegra persistida')))
})

test('la ruta aplica runtime, permiso efectivo, rowId opaco y DTO plano sin operaciones de escritura', () => {
  const route = source('app/api/admin/finanzas/conciliar/detalle/[id]/route.ts')
  assert.match(route, /assertConciliarRuntime\(\)/)
  assert.match(route, /requireB4FinanceAccess\('lectura', await getServerSession\(authOptions\)\)/)
  assert.match(route, /CONCILIAR_DOCUMENT_DETAIL_ROW_ID\.test\(id\)/)
  assert.match(route, /parseConciliarDocumentDetail\(await readConciliarDocumentDetail\(id, access\.actor\.id\)\)/)
  assert.doesNotMatch(route, /\$executeRaw|\.create\(|\.update\(|\.delete\(|fetch\(|Graph|rebuild/i)
})

test('el lector selecciona desde conciliar_proyecciones y no importa Graph, PDF ni una mutación', () => {
  const reader = source('lib/finanzas/conciliar-document-detail.ts')
  assert.match(reader, /SELECT id,movimiento_id,fecha,concepto,banco,cuenta,importe_centimos/)
  assert.match(reader, /FROM conciliar_proyecciones\s+WHERE id=\$\{rowId\}\s+LIMIT 1/)
  assert.match(reader, /liquidaciones_confirming_documentales/)
  assert.match(reader, /NOT EXISTS \(\s*SELECT 1\s*FROM liquidaciones_confirming_documentales l2/)
  assert.doesNotMatch(reader, /ROW_NUMBER\s*\(/)
  assert.match(reader, /json_agg\(row_to_json\(document\)/)
  assert.match(reader, /json_agg\(row_to_json\(line\)/)
  assert.match(reader, /FROM documentos_liquidacion_confirming d/)
  assert.match(reader, /FROM lineas_liquidacion_confirming lc/)
  assert.match(reader, /WITH candidatos AS \(/)
  assert.match(reader, /FROM recibos_cobro_remesa_b7 r/)
  assert.match(reader, /COUNT\(\*\)::integer AS total FROM candidatos/)
  assert.match(reader, /receiptCount/)
  assert.match(reader, /LIMIT \$\{MAX_DETAIL_LINES \+ 1\}/)
  assert.doesNotMatch(reader, /readEasyCollectionsRemittanceDetail|\$executeRaw|\.create\(|\.update\(|\.delete\(|descargarGraph|downloadGraph|fetch\(|rebuildConciliarProjection/i)
})

test('la consulta C11 consolidada de última versión pasa el clasificador SQL de actuación', () => {
  const filename = 'lib/finanzas/conciliar-document-detail.ts'
  const reader = source(filename)
  const ast = ts.createSourceFile(filename, reader, ts.ScriptTarget.Latest, true)
  let queryStrings: string[] | null = null
  const visit = (node: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(node) && node.tag.getText(ast) === 'Prisma.sql') {
      const strings = ts.isNoSubstitutionTemplateLiteral(node.template)
        ? [node.template.text]
        : [node.template.head.text, ...node.template.templateSpans.map(span => span.literal.text)]
      const sql = strings.join('?')
      if (sql.includes('FROM liquidaciones_confirming_documentales l') && sql.includes('l2.version>l.version')
        && sql.includes('json_agg(row_to_json(document)') && sql.includes('json_agg(row_to_json(line)')) queryStrings = strings
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert(queryStrings, 'no se encontró la consulta C11 de última versión')
  assert.equal(classifyPrisma5RawSqlStatement([{ strings: queryStrings }]), 'read_only')
})
