/* Detalle documental: pruebas puras sintéticas; sin Prisma, red, PDF ni datos reales. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'
import { classifyPrisma5RawSqlStatement } from '../lib/prisma'
import {
  buildConfirmingDocumentDetail,
  buildCollectionProposalDocumentDetail,
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

function propuestaDetalle(lines: ReadonlyArray<Record<string, unknown>>, overrides: Partial<Parameters<typeof buildCollectionProposalDocumentDetail>[0]> = {}) {
  return buildCollectionProposalDocumentDetail({
    rowId,
    fechaAbono: '2026-10-28',
    banco: 'Banco sintético',
    cuenta: 'Cuenta sintética',
    importeBancoCentimos: 10_000,
    proposalCount: 1,
    compositionShapeValid: true,
    compositionCount: lines.length,
    lines: lines as never,
    ...overrides,
  })
}

test('cobro propuesto claro separa nominal, importe incluido y saldo B4 vigente', () => {
  const detail = parseConciliarDocumentDetail(propuestaDetalle([{
    ordinal: 1, facturaEmitidaId: 'factura-sintetica-1', importePropuestoTexto: '10000', numeroFactura: 'INST26/4', cliente: 'Cliente sintético',
    fechaEmision: '2026-03-01', fechaVencimiento: null, nominalCentimos: 10_000, activeWrapperCount: 1, objetivoCentimos: 10_000,
    activeLinkCount: 0, validLinkCount: 0, asignadoCentimos: 0, remittanceReceiptCount: 0,
  }]))
  assert.equal(detail.kind, 'COBRO_PROPUESTA')
  assert.equal(detail.pdfHref, null)
  assert.equal(detail.cuadreExacto, true)
  assert.equal(detail.sumaPropuestaCentimos, 10_000)
  assert.equal(detail.sumaSaldosPendientesActualesCentimos, 10_000)
  assert.deepEqual(detail.lineas[0], {
    numero: 'INST26/4', cliente: 'Cliente sintético', fechaEmision: '2026-03-01', fechaVencimiento: null, nominalCentimos: 10_000,
    importePropuestoCentimos: 10_000, saldoPendienteActualCentimos: 10_000, estadoSaldo: 'COINCIDE',
  })
})

test('cobro propuesto descuadrado queda ámbar y nunca presenta la propuesta como saldo actual', () => {
  const detail = propuestaDetalle([{
    ordinal: 1, facturaEmitidaId: 'factura-sintetica-1', importePropuestoTexto: '10000', numeroFactura: 'INST26/6', cliente: 'Cliente sintético',
    fechaEmision: '2026-03-01', fechaVencimiento: null, nominalCentimos: 10_000, activeWrapperCount: 1, objetivoCentimos: 10_000,
    activeLinkCount: 1, validLinkCount: 1, asignadoCentimos: 2_000, remittanceReceiptCount: 0,
  }])
  assert.equal(detail.cuadreExacto, false)
  assert.equal(detail.lineas[0]?.importePropuestoCentimos, 10_000)
  assert.equal(detail.lineas[0]?.saldoPendienteActualCentimos, 8_000)
  assert.equal(detail.lineas[0]?.estadoSaldo, 'NO_COINCIDE')
  assert.equal(detail.sumaSaldosPendientesActualesCentimos, 8_000)
  assert.equal(detail.diferenciaSaldosPendientesBancoCentimos, -2_000)
  assert(detail.avisos.some(value => value.includes('no coincide; actualice antes de confirmar')))
  assert(detail.avisos.some(value => value.includes('Revisión requerida')))
})

test('cobro propuesto con fuente ausente se cierra sin detalle parcial ni saldo inventado', () => {
  assert.throws(() => propuestaDetalle([{
    ordinal: 1, facturaEmitidaId: 'factura-ausente', importePropuestoTexto: '10000', numeroFactura: null, cliente: null,
    fechaEmision: null, fechaVencimiento: null, nominalCentimos: null, activeWrapperCount: 0, objetivoCentimos: null,
    activeLinkCount: 0, validLinkCount: 0, asignadoCentimos: 0,
  }]), (error: unknown) => {
    assert.equal((error as { code?: unknown }).code, 'DETALLE_PROPUESTA_INCOMPLETO')
    return true
  })
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
