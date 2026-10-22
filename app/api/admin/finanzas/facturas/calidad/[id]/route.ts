import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { assertFinanceStagingIsolated } from '@/lib/finanzas/staging-safety'
import { esFechaDocumentoIso, esImporteCentimosFinito, fechaDocumentoUtc, claveCanonicaFactura, totalCuadraEnCentimos } from '@/lib/finanzas/invoice-quality'
import { UUID_V4_RE, auditarCambioB2, buscarIdentidadBloqueada, huellaSolicitud, jsonPrivado, planDeduplicacion, readBoundedJsonB2, requireFacturaAccess, serializeFacturaCalidad } from '@/lib/finanzas/invoice-quality-db'

export const dynamic = 'force-dynamic'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f-]{27,40}$/i
const allowed = new Set(['solicitudId', 'version', 'proveedor', 'cif', 'numFactura', 'fecha', 'base', 'tipoIva', 'importeIva', 'tipoIrpf', 'importeIrpf', 'total', 'concepto'])
type Correccion = { solicitudId: string; version: number; proveedor: string; cif: string; numFactura: string; fecha: string; base: number; tipoIva: number; importeIva: number; tipoIrpf: number; importeIrpf: number; total: number; concepto: string | null }
function text(value: unknown, required: boolean) {
  if (typeof value !== 'string') return null
  const result = value.normalize('NFKC').trim()
  if ((required && !result) || result.length > 300 || /[\u0000-\u001F\u007F]/.test(result)) return null
  return result || null
}
function parse(body: unknown): Correccion | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const value = body as Record<string, unknown>
  if (Object.keys(value).some(key => !allowed.has(key))) return null
  const solicitudId = value.solicitudId, version = value.version, fecha = value.fecha
  const proveedor = text(value.proveedor, true), cif = text(value.cif, true), numFactura = text(value.numFactura, true), concepto = text(value.concepto ?? '', false)
  if (typeof solicitudId !== 'string' || typeof version !== 'number' || !UUID_V4_RE.test(solicitudId) || !Number.isSafeInteger(version) || version < 1 || !proveedor || /^(ERROR_OCR|DESCONOCIDO)$/i.test(proveedor) || !cif || !numFactura || !esFechaDocumentoIso(fecha)) return null
  const numero = (name: string): number | null => esImporteCentimosFinito(value[name]) ? value[name] as number : null
  const base = numero('base'), tipoIva = numero('tipoIva'), importeIva = numero('importeIva'), tipoIrpf = numero('tipoIrpf'), importeIrpf = numero('importeIrpf'), total = numero('total')
  if (base === null || tipoIva === null || importeIva === null || tipoIrpf === null || importeIrpf === null || total === null) return null
  if (tipoIva < 0 || tipoIva > 100 || tipoIrpf < 0 || tipoIrpf > 100 || !totalCuadraEnCentimos(base, importeIva, importeIrpf, total)) return null
  return { solicitudId, version, proveedor, cif, numFactura, fecha, base, tipoIva, importeIva, tipoIrpf, importeIrpf, total, concepto }
}
function mismosDatos(a: { base: number; importeIva: number; importeIrpf: number; total: number; fecha: Date }, b: Correccion) {
  return a.base === b.base && a.importeIva === b.importeIva && a.importeIrpf === b.importeIrpf && a.total === b.total && a.fecha.toISOString().slice(0, 10) === b.fecha
}
function economico(f: any) {
  return { proveedor: f.proveedor, cif: f.cif, numFactura: f.numFactura, fecha: f.fecha, base: f.base, tipoIva: f.tipoIva, importeIva: f.importeIva, tipoIrpf: f.tipoIrpf, importeIrpf: f.importeIrpf, total: f.total, concepto: f.concepto, estado: f.estado, calidad: f.calidad, canonKey: f.canonKey, copiaDeId: f.copiaDeId, versionCalidad: f.versionCalidad, datosOcrRaw: f.datosOcrRaw }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    if (!UUID_RE.test(id)) return jsonPrivado({ error: 'Identificador de revisión no válido' }, 400)
    const access = await requireFacturaAccess(true)
    if ('error' in access) return access.error
    if (req.headers.get('origin') !== req.nextUrl.origin) return jsonPrivado({ error: 'Origen de la solicitud no válido' }, 403)
    if (req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return jsonPrivado({ error: 'El contenido debe ser JSON' }, 415)
    const read = await readBoundedJsonB2(req)
    if (read.status) return jsonPrivado({ error: read.status === 413 ? 'Solicitud demasiado grande' : 'JSON no válido' }, read.status)
    const correction = parse(read.body)
    if (!correction) return jsonPrivado({ error: 'Corrección inválida; se requieren campos completos y un total exacto en céntimos' }, 400)
    const canonKey = claveCanonicaFactura(correction.cif, correction.numFactura)
    if (!canonKey) return jsonPrivado({ error: 'IDENTIDAD_INCOMPLETA' }, 400)
    await assertFinanceStagingIsolated()
    const fingerprint = huellaSolicitud({ revisionId: id, correction })
    const response = await prisma.$transaction(async tx => {
      const prior = await tx.auditoriaCalidadFactura.findFirst({ where: { actorId: access.userId, solicitudId: correction.solicitudId }, orderBy: { createdAt: 'desc' } })
      if (prior) {
        const mismoDestino = prior.accion === 'RESOLVER_CUARENTENA' ? prior.revisionId === id : prior.accion === 'RESOLVER_HISTORICA' && prior.facturaId === id
        if (prior.huellaSolicitud !== fingerprint || !mismoDestino || !prior.facturaId) throw new Error('IDEMPOTENCY_CONFLICT')
        const factura = await tx.facturaRecibida.findUnique({ where: { id: prior.facturaId } })
        if (!factura) throw new Error('IDEMPOTENCY_INCOMPLETE')
        return { factura: serializeFacturaCalidad(factura), repetida: true, calidad: factura.calidad }
      }
      const locked = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`SELECT id, version FROM "revisiones_lectura_facturas_recibidas" WHERE id = ${id} FOR UPDATE`)
      const revision = locked[0] ? await tx.revisionLecturaFacturaRecibida.findUnique({ where: { id } }) : null
      if (!revision) {
        const historicaLock = await tx.$queryRaw<Array<{ id: string; version: number }>>(Prisma.sql`SELECT id, version_calidad AS version FROM "facturas_recibidas" WHERE id = ${id} FOR UPDATE`)
        if (!historicaLock[0]) throw new Error('NOT_FOUND')
        if (historicaLock[0].version !== correction.version) throw new Error('VERSION_CONFLICT')
        const historica = await tx.facturaRecibida.findUnique({ where: { id } })
        if (!historica || historica.calidad !== 'REVISAR_LECTURA') throw new Error('ALREADY_RESOLVED')
        const sameIdentity = (await buscarIdentidadBloqueada(tx, canonKey)).filter(row => row.id !== id)
        const plan = sameIdentity.length ? planDeduplicacion(sameIdentity) : null
        if (plan?.canonica && !mismosDatos(plan.canonica, correction)) throw new Error('IDENTITY_CONFLICT')
        const actualizada = await tx.facturaRecibida.update({ where: { id }, data: {
          proveedor: correction.proveedor, cif: correction.cif, numFactura: correction.numFactura, fecha: fechaDocumentoUtc(correction.fecha), base: correction.base, tipoIva: correction.tipoIva, importeIva: correction.importeIva, tipoIrpf: correction.tipoIrpf, importeIrpf: correction.importeIrpf, total: correction.total, concepto: correction.concepto,
          calidad: plan?.canonica ? 'COPIA' : 'VALIDA', copiaDeId: plan?.canonica?.id || null, canonKey, fechaProvenancia: 'DOCUMENTO', conflictoIdentidad: Boolean(plan?.conflicto), versionCalidad: { increment: 1 }, estado: 'PENDIENTE_REVISION',
          datosOcrRaw: JSON.stringify({ correccionManual: true, ...correction, solicitudId: undefined }),
        } })
        const audit = await auditarCambioB2(tx, { facturaId: id, actorId: access.userId, accion: 'RESOLVER_HISTORICA', solicitudId: correction.solicitudId, huellaSolicitud: fingerprint, detalle: JSON.parse(JSON.stringify({ antes: economico(historica), despues: economico(actualizada), versionLeida: correction.version })) })
        return { factura: serializeFacturaCalidad(actualizada), repetida: false, calidad: actualizada.calidad, auditoriaId: audit.id }
      }
      if (locked[0].version !== correction.version) throw new Error('VERSION_CONFLICT')
      if (revision.resueltaAt || revision.facturaResueltaId) throw new Error('ALREADY_RESOLVED')
      const sameIdentity = await buscarIdentidadBloqueada(tx, canonKey)
      const plan = sameIdentity.length ? planDeduplicacion(sameIdentity) : null
      if (plan?.canonica && !mismosDatos(plan.canonica, correction)) throw new Error('IDENTITY_CONFLICT')
      const factura = plan?.canonica ? await tx.facturaRecibida.findUnique({ where: { id: plan.canonica.id } }) : await tx.facturaRecibida.create({ data: {
        proveedor: correction.proveedor, cif: correction.cif, numFactura: correction.numFactura, fecha: fechaDocumentoUtc(correction.fecha), base: correction.base, tipoIva: correction.tipoIva, importeIva: correction.importeIva, tipoIrpf: correction.tipoIrpf, importeIrpf: correction.importeIrpf, total: correction.total, concepto: correction.concepto,
        estado: 'PENDIENTE_REVISION', calidad: 'VALIDA', canonKey, fechaProvenancia: 'DOCUMENTO', oneDriveItemId: revision.oneDriveItemId, oneDriveDriveId: revision.oneDriveDriveId, oneDriveRutaActual: revision.oneDriveRutaActual, archivoOneDrive: revision.archivoOneDrive, carpetaOrigen: revision.carpetaOrigen, estadoCarpeta: revision.estadoCarpeta,
        ocrCompletado: false, ocrConfianza: revision.ocrConfianza, datosOcrRaw: JSON.stringify({ correccionManual: true, ...correction, solicitudId: undefined }), deducibleIva: true,
      } })
      if (!factura) throw new Error('INCOMPLETE')
      const changed = await tx.revisionLecturaFacturaRecibida.updateMany({ where: { id, version: correction.version, resueltaAt: null, facturaResueltaId: null }, data: { resueltaAt: new Date(), facturaResueltaId: factura.id, version: { increment: 1 } } })
      if (changed.count !== 1) throw new Error('VERSION_CONFLICT')
      const audit = await auditarCambioB2(tx, { facturaId: factura.id, revisionId: id, actorId: access.userId, accion: 'RESOLVER_CUARENTENA', solicitudId: correction.solicitudId, huellaSolicitud: fingerprint, detalle: JSON.parse(JSON.stringify({ versionLeida: correction.version, canonKey, correccion: correction, originalCuarentena: revision })) })
      return { factura: serializeFacturaCalidad(factura), repetida: false, calidad: factura.calidad, auditoriaId: audit.id }
    }, { maxWait: 10_000, timeout: 20_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    return jsonPrivado(response, response.repetida ? 200 : 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'REVIEW_FAILED'
    const conflictoDB = error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)
    const conflict = ['VERSION_CONFLICT', 'ALREADY_RESOLVED', 'IDEMPOTENCY_CONFLICT', 'IDENTIDAD_INCOMPLETA', 'IDENTITY_CONFLICT'].includes(message) || conflictoDB
    const status = message === 'NOT_FOUND' ? 404 : conflict ? 409 : 500
    const errorText = message === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : message === 'ALREADY_RESOLVED' ? 'La revisión ya fue resuelta' : message === 'IDEMPOTENCY_CONFLICT' ? 'La solicitud ya se usó para otra revisión o contenido' : message === 'IDENTITY_CONFLICT' ? 'La identidad coincide con otra factura pero su fecha o importes difieren; el documento sigue en revisión' : conflictoDB ? 'La factura ha cambiado o su identidad ya existe; recarga antes de guardar' : message === 'STAGING_ISOLATION_REQUIRED' ? 'Staging aislado no verificado' : 'No se pudo guardar la corrección B2'
    return jsonPrivado({ error: errorText }, status)
  }
}
