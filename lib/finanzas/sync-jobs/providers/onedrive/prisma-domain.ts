/*
 * Production merge adapter for the Next/Prisma repository.
 *
 * Copy into `lib/finanzas/sync-p2/onedrive-prisma-domain.ts` (or adjust the
 * aliases below during the parent merge). It never opens `$transaction`; every
 * mutation uses the worker-supplied TransactionClient, preserving its lease and
 * cancellation check in the same transaction as domain and item-state writes.
 */
import { Prisma, type PrismaClient } from '@prisma/client'
import { aCentimosExactos, esFechaDocumentoIso, esImporteCentimosFinito, fechaDocumentoUtc, normalizarCif, normalizarNumeroFactura } from '@/lib/finanzas/invoice-quality'
import { facturaEconomicaSQL } from '@/lib/finanzas/invoice-economic-filter'
import { auditarCambioB2, buscarIdentidadBloqueada, planDeduplicacion } from '@/lib/finanzas/invoice-quality-db'
import type {
  DedupePlan,
  ExistingSource,
  Location,
  NewInvoiceInput,
  NewReviewInput,
  OcrInvoice,
  OneDriveDomainPort,
} from './provider'

const locationSelect = {
  id: true, oneDriveItemId: true, carpetaOrigen: true, archivoOneDrive: true,
  oneDriveDriveId: true, oneDriveRutaActual: true, estadoCarpeta: true,
  etiquetaMateriales: true,
} as const

type Tx = Prisma.TransactionClient
type SourceRow = Prisma.FacturaRecibidaGetPayload<{ select: typeof locationSelect }>

type RevisionRow = {
  id: string
  oneDriveItemId: string | null
  oneDriveDriveId: string | null
  oneDriveRutaActual: string | null
  archivoOneDrive: string | null
  carpetaOrigen: string | null
  estadoCarpeta: string | null
}

function invoiceLocation(row: SourceRow): Location {
  return {
    carpetaOrigen: row.carpetaOrigen || '', oneDriveDriveId: row.oneDriveDriveId || '',
    oneDriveRutaActual: row.oneDriveRutaActual || '', archivoOneDrive: row.archivoOneDrive || '',
    estadoCarpeta: row.estadoCarpeta || '', etiquetaMateriales: Boolean(row.etiquetaMateriales),
  }
}

function reviewLocation(row: RevisionRow): Location {
  return {
    carpetaOrigen: row.carpetaOrigen || '', oneDriveDriveId: row.oneDriveDriveId || '',
    oneDriveRutaActual: row.oneDriveRutaActual || '', archivoOneDrive: row.archivoOneDrive || '',
    estadoCarpeta: row.estadoCarpeta || '', etiquetaMateriales: false,
  }
}

function locationChanged(a: Location, b: Location): boolean {
  return a.carpetaOrigen !== b.carpetaOrigen || a.oneDriveDriveId !== b.oneDriveDriveId ||
    a.oneDriveRutaActual !== b.oneDriveRutaActual || a.archivoOneDrive !== b.archivoOneDrive ||
    a.estadoCarpeta !== b.estadoCarpeta || a.etiquetaMateriales !== b.etiquetaMateriales
}

function safeOcrString(ocr: OcrInvoice, field: keyof OcrInvoice): string | null {
  const value = ocr[field]
  return typeof value === 'string' && value.length <= 20_000 ? value : null
}
function safeOcrNumber(ocr: OcrInvoice, field: keyof OcrInvoice): number | null {
  const value = ocr[field]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function privateText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001F\u007F]/.test(normalized) ? normalized : null
}

function privateInvoiceMetadata(input: Readonly<{
  archivoOneDrive: string | null
  numFactura: string | null
  fecha: Date | null
  total: number | null
  cif: string | null
}>): import('@/lib/finanzas/finance-document-lifecycle-core').DocumentPrivateMetadata {
  const number = privateText(input.numFactura, 512)
  const cif = normalizarCif(input.cif)
  return {
    originalFileName: privateText(input.archivoOneDrive?.split(/[\\/]/).pop() ?? null, 1024),
    documentNumber: number,
    documentDate: input.fecha instanceof Date && !Number.isNaN(input.fecha.getTime()) ? input.fecha.toISOString().slice(0, 10) : null,
    totalCents: esImporteCentimosFinito(input.total) ? aCentimosExactos(input.total) : null,
    invoiceFiscalIdentity: cif && number ? `CIF:${cif}|NUM:${normalizarNumeroFactura(number) ?? number}` : null,
    partyRole: 'PROVEEDOR',
    documentClass: null,
    referencedOriginalReference: null,
    currencyCode: null,
    upstreamVersionRef: null,
  }
}

async function lockItemRows(tx: Tx, itemId: string): Promise<void> {
  // Same source ID must be serialised across invoice and B2-review tables.
  await tx.$queryRaw(Prisma.sql`SELECT id FROM facturas_recibidas WHERE "onedrive_item_id" = ${itemId} FOR UPDATE`)
  await tx.$queryRaw(Prisma.sql`SELECT id FROM revisiones_lectura_facturas_recibidas WHERE "onedrive_item_id" = ${itemId} FOR UPDATE`)
}

async function sourceByItem(client: Pick<PrismaClient, 'facturaRecibida' | 'revisionLecturaFacturaRecibida'> | Tx, itemId: string): Promise<ExistingSource | null> {
  const invoice = await client.facturaRecibida.findUnique({ where: { oneDriveItemId: itemId }, select: locationSelect })
  if (invoice) return { kind: 'INVOICE', id: invoice.id, oneDriveDriveId: invoice.oneDriveDriveId, location: invoiceLocation(invoice) }
  const review = await client.revisionLecturaFacturaRecibida.findUnique({
    where: { oneDriveItemId: itemId },
    select: { id: true, oneDriveItemId: true, oneDriveDriveId: true, oneDriveRutaActual: true, archivoOneDrive: true, carpetaOrigen: true, estadoCarpeta: true },
  })
  if (review) return { kind: 'REVIEW', id: review.id, oneDriveDriveId: review.oneDriveDriveId, location: reviewLocation(review) }
  return null
}

/** Binds the generic provider to the existing B2/location persistence primitives. */
export function createPrismaOneDriveDomain(prisma: PrismaClient): OneDriveDomainPort<Tx> {
  return {
    readSource(itemId) { return sourceByItem(prisma, itemId) },

    async lockSource(tx, itemId) {
      await lockItemRows(tx, itemId)
      return sourceByItem(tx, itemId)
    },

    async updateLocation(tx, source, location, actorId) {
      if (!locationChanged(source.location, location)) return false
      if (source.kind === 'INVOICE') {
        const current = await tx.facturaRecibida.findUnique({ where: { id: source.id }, select: locationSelect })
        if (!current) return false
        if (current.oneDriveDriveId && current.oneDriveDriveId !== location.oneDriveDriveId) return false
        const before = invoiceLocation(current)
        if (!locationChanged(before, location)) return false
        await tx.facturaRecibida.update({ where: { id: current.id }, data: location })
        const motivo = current.oneDriveDriveId ? 'LECTURA_ONEDRIVE_P2' : 'VERIFICACION_BIBLIOTECA_HISTORICA_P2'
        // Legacy location history has a non-null FK actor. Manual jobs retain
        // that UI history. Daily/background jobs use the B2 audit below, whose
        // actor is intentionally nullable, rather than inventing a system user.
        if (actorId !== null) await tx.historialUbicacionFacturaRecibida.create({
          data: { facturaId: current.id, autorId: actorId, motivo, anterior: before, actual: location },
        })
        await auditarCambioB2(tx, { facturaId: current.id, actorId, accion: 'UBICACION_ONEDRIVE_P2', detalle: { motivo, anterior: before, actual: location } })
        return true
      }
      const current = await tx.revisionLecturaFacturaRecibida.findUnique({ where: { id: source.id } })
      if (!current) return false
      if (current.oneDriveDriveId && current.oneDriveDriveId !== location.oneDriveDriveId) return false
      const before = reviewLocation(current)
      if (!locationChanged(before, location)) return false
      // Reviews have no `etiquetaMateriales`; no OCR, financial, state, quality,
      // manual-decision or resolution field is included in this update.
      const { etiquetaMateriales: _notStoredOnReview, ...reviewLocationOnly } = location
      await tx.revisionLecturaFacturaRecibida.update({ where: { id: current.id }, data: { ...reviewLocationOnly, version: { increment: 1 } } })
      await auditarCambioB2(tx, { revisionId: current.id, actorId, accion: 'UBICACION_CUARENTENA_B2_P2', detalle: { anterior: before, actual: reviewLocationOnly } })
      return true
    },

    async lockedDedupePlan(tx, canonKey): Promise<DedupePlan> {
      const rows = await buscarIdentidadBloqueada(tx, canonKey)
      const plan = rows.length ? planDeduplicacion(rows) : null
      return { canonicalId: plan?.canonica?.id || null, conflict: Boolean(plan?.conflicto) }
    },

    async readB4Protection(tx, source) {
      if (source.kind !== 'INVOICE') return { status: 'NONE' as const }
      // This query is deliberately limited to the exact existing invoice source.
      // It only answers whether an active, applied B4 documentary link exists;
      // it neither reads money values nor writes/reconciles anything.
      const rows = await tx.$queryRaw<Array<{ confirmed: boolean; pending: boolean }>>(Prisma.sql`
        SELECT EXISTS(
          SELECT 1
          FROM documentos_conciliables d
          JOIN vinculos_movimiento_documento v
            ON v.documento_conciliable_id=d.id
           AND v.activo
           AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
          JOIN operaciones_justificacion_b4 o
            ON o.id=v.operacion_creacion_id
           AND o.estado='APLICADA'::"EstadoOperacionB4"
          WHERE d.factura_recibida_id=${source.id}
            AND d.activo
        ) AS confirmed,
        EXISTS(
          SELECT 1
          FROM documentos_conciliables d
          JOIN vinculos_movimiento_documento v
            ON v.documento_conciliable_id=d.id
           AND v.activo
           AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo"
          JOIN operaciones_justificacion_b4 o
            ON o.id=v.operacion_creacion_id
           AND o.estado IN ('PENDIENTE_APROBACION'::"EstadoOperacionB4",'APROBADA'::"EstadoOperacionB4")
          WHERE d.factura_recibida_id=${source.id}
            AND d.activo
        ) AS pending
        LIMIT 1
      `)
      if (rows[0]?.confirmed === true) return { status: 'CONFIRMED' as const }
      return rows[0]?.pending === true ? { status: 'PENDING' as const } : { status: 'NONE' as const }
    },

    async readPrivateMetadata(tx, source) {
      if (source.kind !== 'INVOICE') return null
      const invoice = await tx.facturaRecibida.findUnique({
        where: { id: source.id },
        select: { archivoOneDrive: true, numFactura: true, fecha: true, total: true, cif: true },
      })
      return invoice ? privateInvoiceMetadata(invoice) : null
    },

    async hasLegacyExactCanonicalMatch(tx, ocr, canonKey): Promise<boolean> {
      // P1 backfill will fill canonKey. Until then, only exact current-B2
      // normalizers on separately stored CIF and number can suppress an import.
      // No filename/provider/date/amount/fuzzy query appears here.
      const cif = normalizarCif(ocr.cif)
      const numero = normalizarNumeroFactura(ocr.numFactura)
      if (!cif || !numero) return false
      const rows = await tx.facturaRecibida.findMany({
        where: { canonKey: null, cif: { not: null }, numFactura: { not: null } },
        select: { cif: true, numFactura: true },
      })
      return rows.some(row => normalizarCif(row.cif) === cif && normalizarNumeroFactura(row.numFactura) === numero && canonKey === `CIF:${cif}|NUM:${numero}`)
    },

    async createInvoice(tx, input, actorId) {
      // Item source lock/re-read already happened in `lockSource`. The unique
      // oneDriveItemId remains a DB backstop against cross-worker delivery.
      const invoice = await tx.facturaRecibida.create({ data: {
        proveedor: safeOcrString(input.ocr, 'proveedor') || 'DESCONOCIDO',
        cif: safeOcrString(input.ocr, 'cif'), domicilioProveedor: safeOcrString(input.ocr, 'domicilioProveedor'),
        numFactura: safeOcrString(input.ocr, 'numFactura'), fecha: fechaDocumentoUtc(String(input.ocr.fecha)),
        base: safeOcrNumber(input.ocr, 'base')!, tipoIva: safeOcrNumber(input.ocr, 'tipoIva')!,
        importeIva: safeOcrNumber(input.ocr, 'importeIva')!, tipoIrpf: safeOcrNumber(input.ocr, 'tipoIrpf')!,
        importeIrpf: safeOcrNumber(input.ocr, 'importeIrpf')!, total: safeOcrNumber(input.ocr, 'total')!,
        concepto: safeOcrString(input.ocr, 'concepto'), estado: 'PENDIENTE_REVISION',
        calidad: input.dedupe.canonicalId ? 'COPIA' : 'VALIDA', canonKey: input.identity,
        copiaDeId: input.dedupe.canonicalId, fechaProvenancia: 'DOCUMENTO',
        conflictoIdentidad: input.dedupe.conflict, duplicadoExterno: input.dedupe.conflict,
        ...input.location, oneDriveItemId: input.itemId, ocrCompletado: true,
        ocrConfianza: safeOcrNumber(input.ocr, 'confianza'), datosOcrRaw: input.ocrRaw,
        deducibleIva: true, esInternacional: input.ocr.esInternacional === true,
        paisOrigen: safeOcrString(input.ocr, 'paisOrigen'), telefonoServicio: safeOcrString(input.ocr, 'telefonoServicio'),
      } })
      // Sólo registra una referencia de fuente económica nueva: jamás vincula banco.
      const registered = await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
        INSERT INTO documentos_conciliables (id,tipo,importe_objetivo_centimos,factura_recibida_id,updated_at)
        SELECT gen_random_uuid(),'FACTURA_RECIBIDA'::"TipoDocumentoConciliable",
          CASE WHEN b4_importe_bancario_centimos(f.total)=-2147483648 THEN NULL
               ELSE -NULLIF(b4_importe_bancario_centimos(f.total),0) END,f.id,NOW()
        FROM facturas_recibidas f WHERE f.id=${invoice.id} AND ${facturaEconomicaSQL('f')}
        ON CONFLICT DO NOTHING RETURNING id
      `)
      if (registered.length) await auditarCambioB2(tx, {facturaId:invoice.id,actorId,accion:'REGISTRAR_REFERENCIA_DOCUMENTAL_P2',detalle:{documentoConciliableId:registered[0].id,sinVinculoBancario:true}})
      await tx.historialUbicacionFacturaRecibida.create({
        data: { facturaId: invoice.id, autorId: actorId, motivo: input.dedupe.canonicalId ? 'ALTA_ONEDRIVE_COPIA_B2_P2' : 'ALTA_ONEDRIVE_P2', anterior: {}, actual: input.location },
      })
      await auditarCambioB2(tx, {
        facturaId: invoice.id, actorId, accion: input.dedupe.canonicalId ? 'ALTA_ONEDRIVE_COPIA_B2_P2' : 'ALTA_ONEDRIVE_B2_P2',
        detalle: { canonKey: input.identity, calidad: input.dedupe.canonicalId ? 'COPIA' : 'VALIDA', copiaDeId: input.dedupe.canonicalId, conflictoIdentidad: input.dedupe.conflict, fuente: 'P2_ONEDRIVE' },
      })
    },

    async createReview(tx, input, actorId) {
      // This is reached only after source lock/re-read found no row. It is
      // deliberately `create`, never `upsert`: a P2002 race is retried by the
      // worker and then takes its existing-source audit-only branch. Thus this
      // provider never writes OCR/manual/financial fields of any existing review.
      const { etiquetaMateriales: _notStoredOnReview, ...reviewLocationOnly } = input.location
      const row = await tx.revisionLecturaFacturaRecibida.create({
        data: {
          oneDriveItemId: input.itemId, ...reviewLocationOnly, proveedor: safeOcrString(input.ocr, 'proveedor'), cif: safeOcrString(input.ocr, 'cif'), numFactura: safeOcrString(input.ocr, 'numFactura'),
          fecha: typeof input.ocr.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.ocr.fecha) ? fechaDocumentoUtc(input.ocr.fecha) : null,
          base: safeOcrNumber(input.ocr, 'base'), tipoIva: safeOcrNumber(input.ocr, 'tipoIva'), importeIva: safeOcrNumber(input.ocr, 'importeIva'),
          tipoIrpf: safeOcrNumber(input.ocr, 'tipoIrpf'), importeIrpf: safeOcrNumber(input.ocr, 'importeIrpf'), total: safeOcrNumber(input.ocr, 'total'),
          concepto: safeOcrString(input.ocr, 'concepto'), ocrConfianza: safeOcrNumber(input.ocr, 'confianza'), datosOcrRaw: input.ocrRaw, motivoRevision: input.reason,
        },
      })
      await auditarCambioB2(tx, { revisionId: row.id, actorId, accion: 'CUARENTENA_ONEDRIVE_B2_P2', detalle: { motivo: input.reason, fuente: 'P2_ONEDRIVE' } })
    },
  }
}
