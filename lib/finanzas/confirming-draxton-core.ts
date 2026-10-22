import crypto from 'node:crypto'

/**
 * C9 — núcleo puro de clasificación confirming Draxton.
 *
 * No importa OCR, no descarga Graph, no toca Prisma y no acepta importes. Un
 * confirming acredita únicamente que existe una comunicación de abono/cesión
 * potencialmente asociable por una persona a un movimiento bancario ya existente.
 */
export const CARPETA_CONFIRMING_DRAXTON_2026 = '3. Confirming Draxton 2026' as const
export const NATURALEZA_SOPORTE_CONFIRMING_CLIENTE = 'SOPORTE_CONFIRMING_CLIENTE' as const
export const TIPO_SOPORTE_CONFIRMING_CESION_DRAXTON = 'CONFIRMING_CESION_DRAXTON' as const

type Resultado<T> = { ok: true; value: T } | { ok: false; codigo: string; mensaje: string }
const ok = <T>(value: T): Resultado<T> => ({ ok: true, value })
const fail = <T = never>(codigo: string, mensaje: string): Resultado<T> => ({ ok: false, codigo, mensaje })

export type UbicacionConfirmingDraxton = Readonly<{
  carpetaOrigen?: string | null
  archivoOneDrive?: string | null
  oneDriveRutaActual?: string | null
}>

export type EvidenciaRutaConfirmingDraxton = Readonly<{
  actual: boolean
  historica: boolean
  rutasActuales: readonly string[]
  rutasHistoricas: readonly string[]
}>

function textoRuta(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.normalize('NFKC').trim()
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null
  return text
}

/** Coincide con el segmento de carpeta canónico, no con una heurística "confirming". */
export function esRutaConfirmingDraxton2026(value: unknown): boolean {
  const text = textoRuta(value)
  if (!text) return false
  return text.split(/[\\/]+/).some((segment) =>
    segment.trim().toLocaleLowerCase('es-ES') === CARPETA_CONFIRMING_DRAXTON_2026.toLocaleLowerCase('es-ES'),
  )
}

function rutasDeUbicacion(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const row = value as Record<string, unknown>
  return ['carpetaOrigen', 'archivoOneDrive', 'oneDriveRutaActual']
    .map((key) => textoRuta(row[key]))
    .filter((path): path is string => path !== null && esRutaConfirmingDraxton2026(path))
}

/**
 * El historial se recibe ya leído por el adaptador. Sólo inspecciona snapshots
 * anterior/actual de B1 para no perder documentos que hayan sido movidos.
 */
export function evidenciaRutaConfirmingDraxton(
  actual: UbicacionConfirmingDraxton,
  historial: readonly Readonly<{ anterior: unknown; actual: unknown }>[] = [],
): EvidenciaRutaConfirmingDraxton {
  const rutasActuales = [...new Set(rutasDeUbicacion(actual))].sort()
  const rutasHistoricas = [...new Set(historial.flatMap((evento) => [
    ...rutasDeUbicacion(evento.anterior),
    ...rutasDeUbicacion(evento.actual),
  ]))].sort()
  return {
    actual: rutasActuales.length > 0,
    historica: rutasHistoricas.length > 0,
    rutasActuales,
    rutasHistoricas,
  }
}

export type PropuestaClasificacionConfirmingDraxton = Readonly<{
  facturaRecibidaId: string
  naturalezaDocumento: typeof NATURALEZA_SOPORTE_CONFIRMING_CLIENTE
  tipoSoporteFinanciero: typeof TIPO_SOPORTE_CONFIRMING_CESION_DRAXTON
  evidenciaRuta: EvidenciaRutaConfirmingDraxton
  fuenteHash: string
}>

export type FuenteDocumentoConfirming = Readonly<{
  facturaRecibidaId: string
  oneDriveItemId: string | null
  oneDriveDriveId: string | null
  carpetaOrigen: string | null
  archivoOneDrive: string | null
  oneDriveRutaActual: string | null
}>

function textoOpcional(value: unknown, max = 2000): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKC').trim()
  return normalized && normalized.length <= max && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null
}

function canon(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canon).join(',')}]`
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>
    return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canon(row[key])}`).join(',')}}`
  }
  throw new Error('C9_CANONICAL_VALUE_INVALID')
}

export function hashFuenteConfirmingDraxton(fuente: FuenteDocumentoConfirming): string {
  const snapshot = {
    facturaRecibidaId: textoOpcional(fuente.facturaRecibidaId, 160),
    oneDriveItemId: textoOpcional(fuente.oneDriveItemId, 300),
    oneDriveDriveId: textoOpcional(fuente.oneDriveDriveId, 300),
    carpetaOrigen: textoOpcional(fuente.carpetaOrigen),
    archivoOneDrive: textoOpcional(fuente.archivoOneDrive),
    oneDriveRutaActual: textoOpcional(fuente.oneDriveRutaActual),
  }
  if (!snapshot.facturaRecibidaId) throw new Error('C9_FUENTE_SIN_ID')
  return crypto.createHash('sha256').update(canon(snapshot)).digest('hex')
}

/** No genera propuesta sin ID ni evidencia de la carpeta actual o histórica. */
export function proponerClasificacionConfirmingDraxton(input: Readonly<{
  fuente: FuenteDocumentoConfirming
  historial?: readonly Readonly<{ anterior: unknown; actual: unknown }>[]
}>): Resultado<PropuestaClasificacionConfirmingDraxton> {
  const facturaRecibidaId = textoOpcional(input.fuente.facturaRecibidaId, 160)
  if (!facturaRecibidaId) return fail('FACTURA_RECIBIDA_ID_INVALIDO', 'La fuente documental no tiene un identificador válido.')
  const evidenciaRuta = evidenciaRutaConfirmingDraxton(input.fuente, input.historial ?? [])
  if (!evidenciaRuta.actual && !evidenciaRuta.historica) {
    return fail('SIN_EVIDENCIA_RUTA_CONFIRMING_DRAXTON', 'La clasificación C9 exige la carpeta exacta de confirming Draxton actual o en el historial B1.')
  }
  return ok({
    facturaRecibidaId,
    naturalezaDocumento: NATURALEZA_SOPORTE_CONFIRMING_CLIENTE,
    tipoSoporteFinanciero: TIPO_SOPORTE_CONFIRMING_CESION_DRAXTON,
    evidenciaRuta,
    fuenteHash: hashFuenteConfirmingDraxton(input.fuente),
  })
}

export type SolicitudConfirmacionSoporteConfirmingDraxton = Readonly<{
  facturaRecibidaId: string
  movimientoId: string
  versionDocumento: number // optimistic versionNaturalezaDocumento C9
  idempotencyKey: string
  confirmar: true
}>

function idSeguro(value: unknown, label: string): Resultado<string> {
  const text = textoOpcional(value, 160)
  return text ? ok(text) : fail('VALIDATION_ERROR', `${label} no es válido.`)
}

/**
 * Contrato de mutación: intencionadamente no admite importe, factura emitida,
 * B4, estado de cobro ni datos OCR. El adaptador debe bloquear/leer de nuevo la
 * fuente, comprobar fuenteHash y pedir confirmación humana antes del INSERT.
 */
export function parseSolicitudConfirmacionSoporteConfirmingDraxton(raw: unknown): Resultado<SolicitudConfirmacionSoporteConfirmingDraxton> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const body = raw as Record<string, unknown>
  const allowed = ['facturaRecibidaId', 'movimientoId', 'versionDocumento', 'idempotencyKey', 'confirmar']
  if (Object.keys(body).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(body, key)) || Object.keys(body).some((key) => !allowed.includes(key))) {
    return fail('VALIDATION_ERROR', 'El cuerpo C9 usa exactamente facturaRecibidaId, movimientoId, versionDocumento, idempotencyKey y confirmar.')
  }
  const facturaRecibidaId = idSeguro(body.facturaRecibidaId, 'facturaRecibidaId')
  if ('codigo' in facturaRecibidaId) return fail(facturaRecibidaId.codigo, facturaRecibidaId.mensaje)
  const movimientoId = idSeguro(body.movimientoId, 'movimientoId')
  if ('codigo' in movimientoId) return fail(movimientoId.codigo, movimientoId.mensaje)
  const idempotencyKey = idSeguro(body.idempotencyKey, 'idempotencyKey')
  if ('codigo' in idempotencyKey) return fail(idempotencyKey.codigo, idempotencyKey.mensaje)
  if (!Number.isInteger(body.versionDocumento) || (body.versionDocumento as number) < 1) return fail('VALIDATION_ERROR', 'versionDocumento debe ser un entero positivo.')
  if (body.confirmar !== true) return fail('CONFIRMACION_HUMANA_REQUERIDA', 'La asociación confirming requiere confirmar explícitamente que se revisó la comunicación y el abono bancario.')
  return ok({ facturaRecibidaId: facturaRecibidaId.value, movimientoId: movimientoId.value, versionDocumento: body.versionDocumento as number, idempotencyKey: idempotencyKey.value, confirmar: true })
}

export function hashSolicitudConfirmacionSoporte(input: SolicitudConfirmacionSoporteConfirmingDraxton): string {
  return crypto.createHash('sha256').update(canon(input)).digest('hex')
}

export function comprobarReplaySoporteConfirming(
  previo: Readonly<{ payloadHash: string; snapshot: unknown }> | null,
  payloadHash: string,
): Resultado<Readonly<{ replay: boolean; snapshot: unknown | null }>> {
  if (previo === null) return ok({ replay: false, snapshot: null })
  if (previo.payloadHash !== payloadHash) return fail('IDEMPOTENCY_PAYLOAD_MISMATCH', 'La clave idempotente C9 ya se utilizó con otra solicitud.')
  return ok({ replay: true, snapshot: previo.snapshot })
}

export function validarRevocacionSoporteConfirming(raw: unknown): Resultado<Readonly<{ soporteId: string; version: number; idempotencyKey: string; motivo: string }>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON.')
  const body = raw as Record<string, unknown>
  const allowed = ['soporteId', 'version', 'idempotencyKey', 'motivo']
  if (Object.keys(body).length !== allowed.length || allowed.some((key) => !Object.prototype.hasOwnProperty.call(body, key)) || Object.keys(body).some((key) => !allowed.includes(key))) return fail('VALIDATION_ERROR', 'La revocación C9 usa exactamente soporteId, version, idempotencyKey y motivo.')
  const soporteId = idSeguro(body.soporteId, 'soporteId')
  if ('codigo' in soporteId) return fail(soporteId.codigo, soporteId.mensaje)
  const idempotencyKey = idSeguro(body.idempotencyKey, 'idempotencyKey')
  if ('codigo' in idempotencyKey) return fail(idempotencyKey.codigo, idempotencyKey.mensaje)
  const motivo = textoOpcional(body.motivo, 2000)
  if (!motivo) return fail('MOTIVO_REVOCACION_REQUERIDO', 'La revocación C9 requiere un motivo humano no vacío.')
  if (!Number.isInteger(body.version) || (body.version as number) < 1) return fail('VALIDATION_ERROR', 'version debe ser un entero positivo.')
  return ok({ soporteId: soporteId.value, version: body.version as number, idempotencyKey: idempotencyKey.value, motivo })
}
