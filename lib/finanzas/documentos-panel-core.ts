import { createHash, randomUUID } from 'node:crypto'
import { claveCanonicaFactura, esFechaDocumentoIso, esImporteCentimosFinito, fechaDocumentoUtc, totalCuadraEnCentimos } from './invoice-quality'

export const DOCUMENTOS_PANEL_ROOT = 'STAGING_FINANZAS_NO_CONTABILIZAR/DocumentosPanel'
export const DOCUMENTOS_PANEL_SCOPE = 'DOCUMENTOS_PANEL_V1'
export const DOCUMENTOS_PANEL_SCHEMA = 'documentos-panel/v1'
export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const MAX_JSON_BYTES = 16 * 1024
export const MAX_UPLOAD_BYTES = MAX_FILE_BYTES + 16 * 1024
export const METADATA_FIELDS = ['fecha', 'proveedor', 'cif', 'numFactura', 'base', 'tipoIva', 'importeIva', 'tipoIrpf', 'importeIrpf', 'total'] as const
export type Metadata = Record<(typeof METADATA_FIELDS)[number], string | number | null>
export type DocumentType = 'FACTURA_RECIBIDA' | 'CONFIRMING' | 'NOMINA' | 'OTRO'
export type EstadoPanel = 'SUBIDA_RESERVADA' | 'PENDIENTE_REVISION' | 'VALIDADA_PENDIENTE_ARCHIVO' | 'ARCHIVADA'
export type FileInput = { bytes: Buffer; nombreOriginal: string; mime: 'application/pdf' | 'image/jpeg' | 'image/png'; extension: 'pdf' | 'jpg' | 'png'; hash: string; tipo: DocumentType; solicitudId: string }
export type Location = { driveId: string; itemId: string; parentId: string; nombre: string; ruta: string; hash: string }
export type Snapshot = { schema: typeof DOCUMENTOS_PANEL_SCHEMA; hash: string; estado: EstadoPanel; tipo: DocumentType; nombreOriginal: string; mime: FileInput['mime']; extension: FileInput['extension']; storageName: string; lectura: { texto: string; aviso: string; campos: Metadata }; original: Location | null; actual: Location | null; solicitudSubida: string; solicitudValidacion?: string; huellaValidacion?: string; archivo?: { nombre: string; solicitudId: string; huella: string; token: string; leaseUntil: number }; error?: string | null }
export class DocumentosPanelError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
export function fail(status: number, code: string, message: string): never { throw new DocumentosPanelError(status, code, message) }
export const hashBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const hashJson = (value: unknown) => hashBytes(Buffer.from(JSON.stringify(value)))
export function emptyMetadata(): Metadata { return Object.fromEntries(METADATA_FIELDS.map(key => [key, null])) as Metadata }
export function safeOriginalName(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 180 || /[\/\\\u0000-\u001f\u007f]/.test(value) || value.includes('..') || /%(?:2f|5c|00|2e)/i.test(value)) fail(400, 'NOMBRE_INVALIDO', 'Nombre de archivo no permitido; no se admiten rutas.')
  return value
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) fail(400, 'SOLICITUD_INVALIDA', 'solicitudId debe ser UUID v4.')
  return value.toLowerCase()
}
export async function readBoundedBytes(req: Pick<Request, 'headers' | 'body'>, max: number): Promise<Buffer> {
  const length = req.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > max)) fail(/^\d+$/.test(length) ? 413 : 400, 'BODY_LIMIT', 'Cuerpo excedido o Content-Length inválido.')
  const reader = req.body?.getReader()
  if (!reader) fail(400, 'BODY_REQUIRED', 'Cuerpo obligatorio.')
  const chunks: Buffer[] = []; let total = 0
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; if (total > max) fail(413, 'BODY_LIMIT', 'Cuerpo demasiado grande.'); chunks.push(Buffer.from(value)) }
    if (length !== null && Number(length) !== total) fail(400, 'BODY_LENGTH', 'Content-Length no coincide.')
    return Buffer.concat(chunks, total)
  } catch (error) { await reader.cancel().catch(() => undefined); throw error } finally { reader.releaseLock() }
}
export async function readPanelJson(req: Request): Promise<Record<string, unknown>> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'JSON_REQUIRED', 'Se requiere JSON.')
  const bytes = await readBoundedBytes(req, MAX_JSON_BYTES)
  let value: unknown
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { fail(400, 'JSON_INVALIDO', 'JSON inválido.') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'JSON_INVALIDO', 'Objeto JSON obligatorio.')
  return value as Record<string, unknown>
}
export async function readPanelMultipart(req: Request): Promise<FileInput> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data;\s*boundary=(?:"[^"\r\n]{1,100}"|[^;\s]{1,100})$/i.test(contentType)) fail(415, 'MULTIPART_REQUIRED', 'Formulario multipart requerido.')
  // Materialize ONLY after stream bounds; never req.formData() on an unbounded body.
  const bytes = await readBoundedBytes(req, MAX_UPLOAD_BYTES)
  let form: FormData
  try { form = await new Response(new Uint8Array(bytes), { headers: { 'content-type': contentType } }).formData() } catch { fail(400, 'MULTIPART_INVALIDO', 'Formulario inválido.') }
  const accepted = ['archivo', 'tipo', 'solicitudId', 'confirmacionHumana']; const seen = new Set<string>()
  for (const [key, value] of form.entries()) { if (!accepted.includes(key) || seen.has(key)) fail(400, 'MULTIPART_FIELDS', 'Campos desconocidos o repetidos.'); seen.add(key); if (typeof value === 'string' && Buffer.byteLength(value) > 300) fail(413, 'FIELD_LIMIT', 'Campo excedido.') }
  if (seen.size !== accepted.length || form.get('confirmacionHumana') !== 'true') fail(422, 'CONFIRMACION_REQUERIDA', 'Confirme manualmente la incorporación del original.')
  const file = form.get('archivo'); const tipo = form.get('tipo')
  if (!file || typeof file === 'string' || !file.size || file.size > MAX_FILE_BYTES) fail(413, 'FILE_LIMIT', 'Un archivo no vacío de hasta 4 MiB.')
  if (!['FACTURA_RECIBIDA', 'CONFIRMING', 'NOMINA', 'OTRO'].includes(String(tipo))) fail(400, 'TIPO_INVALIDO', 'Tipo de documento inválido.')
  return validateFile(Buffer.from(await file.arrayBuffer()), file.name, file.type, tipo as DocumentType, uuid(form.get('solicitudId')))
}
export function validateFile(bytes: Buffer, name: string, declaredMime: string, tipo: DocumentType, solicitudId: string): FileInput {
  safeOriginalName(name); uuid(solicitudId)
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > MAX_FILE_BYTES) fail(413, 'FILE_LIMIT', 'Archivo vacío o excedido.')
  if (tipo === 'NOMINA') fail(403, 'NOMINA_CANAL_PROTEGIDO', 'Las nóminas requieren su canal y permiso protegido. No se admiten en este mínimo Facturas/B4.')
  const mime = bytes.subarray(0, 5).equals(Buffer.from('%PDF-')) ? 'application/pdf' : bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'image/png' : bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : null
  const ext = name.split('.').pop()?.toLowerCase()
  if (!mime || declaredMime !== mime || (mime === 'application/pdf' ? ext !== 'pdf' : mime === 'image/png' ? ext !== 'png' : !['jpg', 'jpeg'].includes(ext ?? ''))) fail(415, 'FILE_SIGNATURE', 'Firma, MIME y extensión deben coincidir: PDF, JPEG o PNG.')
  if (!['FACTURA_RECIBIDA', 'CONFIRMING', 'NOMINA', 'OTRO'].includes(tipo)) fail(400, 'TIPO_INVALIDO', 'Tipo inválido.')
  return { bytes, nombreOriginal: name, mime, extension: mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg', hash: hashBytes(bytes), tipo, solicitudId: uuid(solicitudId) }
}
export async function parseLocalDocument(file: FileInput): Promise<Snapshot['lectura']> {
  const campos = emptyMetadata(); let texto = ''
  if (file.mime === 'application/pdf') {
    try {
      const { readDocumentosPanelPdfText } = await import('./documentos-panel-parser')
      texto = await readDocumentosPanelPdfText(file.bytes)
    } catch { return { texto: '', campos, aviso: 'Lectura manual requerida: PDF ilegible o lectura local fallida.' } }
  }
  if (!texto.trim()) return { texto: '', campos, aviso: 'Lectura manual requerida: imagen o PDF escaneado sin texto. Sin OCR externo.' }
  const match = (re: RegExp) => texto.match(re)?.[1]?.trim() ?? null
  campos.proveedor = match(/(?:Proveedor|Emisor)\s*:\s*([^\n]{1,180})/i)
  campos.cif = match(/(?:CIF|NIF)\s*:\s*([A-Z0-9 .-]{7,25})/i)
  campos.numFactura = match(/(?:N[uú]mero factura|Factura n[ºo°]?|Num\. factura)\s*:\s*([^\n]{1,100})/i)
  const fecha = match(/Fecha\s*:\s*(\d{4}-\d{2}-\d{2})/i); campos.fecha = fecha && esFechaDocumentoIso(fecha) ? fecha : null
  for (const [key, label] of [['base','Base'],['importeIva','Importe IVA'],['importeIrpf','Importe IRPF'],['total','Total'],['tipoIva','Tipo IVA'],['tipoIrpf','Tipo IRPF']] as const) {
    const value = match(new RegExp(`${label}\\s*:\\s*(-?\\d+(?:[.,]\\d{1,2})?)(?![\\d.,])`, 'i'))
    if (value !== null) { const n = Number(value.replace(',', '.')); if (esImporteCentimosFinito(n)) campos[key] = n }
  }
  return { texto, campos, aviso: 'Texto local y sugerencias NO fiables. Revisar el original y confirmar TODOS los campos; no se crean facturas automáticamente.' }
}
export function parseMetadata(input: unknown, complete: boolean): Metadata {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'METADATA_INVALIDA', 'Metadatos requeridos.')
  const row = input as Record<string, unknown>; if (Object.keys(row).some(k => !(METADATA_FIELDS as readonly string[]).includes(k))) fail(400, 'METADATA_FIELDS', 'Campos de metadatos desconocidos.')
  const out = emptyMetadata()
  for (const key of METADATA_FIELDS) {
    const value = row[key]
    if (value === null || value === undefined || value === '') { if (complete) fail(422, 'CAMPOS_INCOMPLETOS', `Falta ${key}. No se aplican valores por defecto.`); continue }
    if (['proveedor', 'cif', 'numFactura', 'fecha'].includes(key)) {
      if (typeof value !== 'string' || value.trim().length > 300 || /[\u0000-\u001f\u007f]/.test(value)) fail(422, 'CAMPO_INVALIDO', `Campo ${key} inválido.`)
      const text = value.normalize('NFKC').trim(); if (!text || (key === 'proveedor' && /^(ERROR_OCR|DESCONOCIDO)$/i.test(text))) fail(422, 'CAMPO_INVALIDO', `Campo ${key} inválido.`)
      if (key === 'fecha' && !esFechaDocumentoIso(text)) fail(422, 'FECHA_INVALIDA', 'Fecha documental inválida.')
      out[key] = text
    } else {
      if (!esImporteCentimosFinito(value) || (['tipoIva', 'tipoIrpf'].includes(key) && (value < 0 || value > 100))) fail(422, 'IMPORTE_INVALIDO', `${key} debe ser número exacto en céntimos; tipos 0–100.`)
      out[key] = value
    }
  }
  if (complete) {
    if (!claveCanonicaFactura(out.cif, out.numFactura)) fail(422, 'IDENTIDAD_INCOMPLETA', 'CIF y número no forman identidad canónica.')
    if (!totalCuadraEnCentimos(out.base as number, out.importeIva as number, out.importeIrpf as number, out.total as number)) fail(422, 'TOTAL_NO_CUADRA', 'Base + IVA − IRPF debe cuadrar exactamente en céntimos.')
  }
  return out
}
export function standardizedName(metadata: Metadata, extension: FileInput['extension'], hash: string): string {
  const checked = parseMetadata(metadata, true)
  const clean = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 65) || 'documento'
  if (!/^[a-f0-9]{64}$/.test(hash)) fail(400, 'HASH_INVALIDO', 'Hash inválido.')
  // Hash suffix prevents distinct originals colliding after lossy name sanitizing.
  return `${checked.fecha}_${clean(checked.proveedor as string)}_${clean(checked.numFactura as string)}_${hash.slice(0, 16)}.${extension}`
}
export function snapshotOf(row: any): Snapshot {
  let s: Snapshot
  try { s = JSON.parse(row.datosOcrRaw) } catch { fail(409, 'LEDGER_INVALIDO', 'Snapshot del panel no válido.') }
  if (row.motivoRevision !== DOCUMENTOS_PANEL_SCOPE || s.schema !== DOCUMENTOS_PANEL_SCHEMA || !/^[0-9a-f]{64}$/.test(s.hash)) fail(404, 'DOCUMENTO_NO_ENCONTRADO', 'No es un documento del panel.')
  if (s.tipo === 'NOMINA') fail(403, 'NOMINA_CANAL_PROTEGIDO', 'Documento protegido: no se devuelve texto, metadatos ni original por permiso Facturas/B4.')
  return s
}
export function publicDocument(row: any) {
  const s = snapshotOf(row); const campos = emptyMetadata()
  for (const key of METADATA_FIELDS) campos[key] = key === 'fecha' && row.fecha ? new Date(row.fecha).toISOString().slice(0,10) : row[key] ?? null
  return { id: row.id, version: row.version, hash: s.hash, estado: s.estado, tipo: s.tipo, nombreOriginal: s.nombreOriginal, nombreActual: s.actual?.nombre ?? null, rutaActual: s.actual?.ruta ?? null, originalDisponible: !!s.original, campos, lectura: s.lectura, facturaId: row.facturaResueltaId ?? null, error: s.error ?? null }
}
// The real service is exercised with fake DB/provider. No Prisma/provider imported here.
export type PanelDeps = { db: any; guard: (write: boolean, confirm: boolean, tx?: any) => Promise<number>; lock: (tx: any, key: string) => Promise<void>; canonical: (tx: any, key: string) => Promise<any[]>; provider: { upload: (file: FileInput, name: string) => Promise<Location>; original: (location: Location, file: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }) => Promise<Buffer>; archive: (location: Location, name: string, file: { hash: string; mime: FileInput['mime']; extension: FileInput['extension'] }) => Promise<Location> }; parse?: typeof parseLocalDocument; now?: () => number }
export function createDocumentosPanelService(deps: PanelDeps) {
  const now = deps.now ?? Date.now
  const txRun = <T>(fn: (tx: any, actorId: number) => Promise<T>, confirm = false): Promise<T> => deps.db.$transaction(async (tx: any) => fn(tx, await deps.guard(true, confirm, tx)), { isolationLevel: 'Serializable', maxWait: 5000, timeout: 10000 })
  const audit = (tx: any, row: any, actorId: number, accion: string, solicitudId: string | null, detalle: any) => tx.auditoriaCalidadFactura.create({ data: { revisionId: row.id, facturaId: row.facturaResueltaId ?? null, actorId, accion: `DOCUMENTOS_PANEL_${accion}`, solicitudId, huellaSolicitud: hashJson(detalle), detalle } })
  const load = async (tx: any, id: string) => { uuid(id); await deps.lock(tx, `documentos-panel:id:${id}`); const row = await tx.revisionLecturaFacturaRecibida.findUnique({ where: { id } }); if (!row) fail(404, 'DOCUMENTO_NO_ENCONTRADO', 'Documento inexistente.'); snapshotOf(row); return row }
  const update = async (tx: any, row: any, s: Snapshot, extra: any = {}) => {
    const saved = await tx.revisionLecturaFacturaRecibida.updateMany({ where: { id: row.id, version: row.version }, data: { ...extra, datosOcrRaw: JSON.stringify(s), estadoCarpeta: s.estado, version: { increment: 1 } } })
    if (saved.count !== 1) fail(409, 'VERSION_CONFLICT', 'El documento cambió; vuelva a cargarlo.')
    return { ...row, ...extra, datosOcrRaw: JSON.stringify(s), estadoCarpeta: s.estado, version: row.version + 1 }
  }
  const metadataData = (m: Metadata) => ({ ...m, fecha: m.fecha ? fechaDocumentoUtc(m.fecha as string) : null })
  const guardVersion = (row: any, value: unknown) => { if (!Number.isSafeInteger(value) || value !== row.version) fail(409, 'VERSION_CONFLICT', 'Version desactualizada; recargue el documento.') }
  return {
    async list(offset = 0, limit = 40) {
      await deps.guard(false, false)
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail(400, 'PAGINACION_INVALIDA', 'Paginación inválida.')
      const rows = await deps.db.revisionLecturaFacturaRecibida.findMany({ where: { motivoRevision: DOCUMENTOS_PANEL_SCOPE }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit + 1 })
      return { documentos: rows.slice(0, limit).map(publicDocument), nextOffset: rows.length > limit ? offset + limit : null }
    },
    async get(id: string, original = false) {
      await deps.guard(false, false); uuid(id)
      const row = await deps.db.revisionLecturaFacturaRecibida.findUnique({ where: { id } }); if (!row) fail(404, 'DOCUMENTO_NO_ENCONTRADO', 'Documento inexistente.')
      const s = snapshotOf(row)
      if (!original) return publicDocument(row)
      if (!s.original || !s.actual) fail(409, 'ORIGINAL_NO_DISPONIBLE', 'La subida no se ha verificado.')
      await deps.guard(false, false)
      const bytes = await deps.provider.original(s.actual, s)
      if (hashBytes(bytes) !== s.hash) fail(409, 'HASH_CONFLICT', 'El original no coincide con su hash.')
      return { bytes, mime: s.mime, nombre: s.nombreOriginal }
    },
    async upload(file: FileInput) {
      // Revalidate even when service is invoked without the HTTP parser.
      file = validateFile(file.bytes, file.nombreOriginal, file.mime, file.tipo, file.solicitudId)
      await deps.guard(true, false)
      const lectura = await (deps.parse ?? parseLocalDocument)(file)
      const reservation = await txRun(async (tx, actorId) => {
        await deps.lock(tx, `documentos-panel:hash:${file.hash}`)
        const rows = await tx.revisionLecturaFacturaRecibida.findMany({ where: { motivoRevision: DOCUMENTOS_PANEL_SCOPE, datosOcrRaw: { contains: `"hash":"${file.hash}"` } }, take: 2 })
        if (rows.length > 1) fail(409, 'HASH_LEDGER_CONFLICT', 'Más de una reserva para este hash: revisión requerida.')
        if (rows[0]) { const s = snapshotOf(rows[0]); if (s.hash !== file.hash) fail(409, 'HASH_LEDGER_CONFLICT', 'Reserva de hash incoherente.'); await audit(tx, rows[0], actorId, 'HASH_REPETIDO', file.solicitudId, { hash: file.hash, estado: s.estado }); return { row: rows[0], repetido: true } }
        const storageName = `${file.hash}.${file.extension}`
        const s: Snapshot = { schema: DOCUMENTOS_PANEL_SCHEMA, hash: file.hash, estado: 'SUBIDA_RESERVADA', tipo: file.tipo, nombreOriginal: file.nombreOriginal, mime: file.mime, extension: file.extension, storageName, lectura, original: null, actual: null, solicitudSubida: file.solicitudId }
        const row = await tx.revisionLecturaFacturaRecibida.create({ data: { ...metadataData(lectura.campos), motivoRevision: DOCUMENTOS_PANEL_SCOPE, datosOcrRaw: JSON.stringify(s), estadoCarpeta: s.estado } })
        await audit(tx, row, actorId, 'RESERVAR_SUBIDA', file.solicitudId, { hash: s.hash, estado: s.estado, nombreOriginal: file.nombreOriginal }); return { row, repetido: false }
      })
      const s = snapshotOf(reservation.row)
      // A repeated hash ALWAYS reuses its draft; never launches a second file/invoice.
      // For unfinished upload, explicit re-upload with SAME original solicitudId retries safely by hash filename.
      if (reservation.repetido && (s.original || s.solicitudSubida !== file.solicitudId)) return { ...publicDocument(reservation.row), repetido: true, aviso: 'Hash repetido: se reutiliza el documento. Si la subida quedó reservada, requiere reintento con la solicitud original.' }
      await deps.guard(true, false)
      const location = await deps.provider.upload(file, s.storageName)
      if (location.hash !== file.hash || location.nombre !== s.storageName || location.ruta !== `${DOCUMENTOS_PANEL_ROOT}/Pendientes/${s.storageName}`) fail(502, 'UPLOAD_NO_VERIFICADO', 'Graph no verificó la ubicación y hash del original.')
      const row = await txRun(async (tx, actorId) => {
        const row = await load(tx, reservation.row.id); const current = snapshotOf(row)
        if (current.original) return row
        const next: Snapshot = { ...current, original: location, actual: location, estado: 'PENDIENTE_REVISION', error: null }
        const saved = await update(tx, row, next, { oneDriveItemId: location.itemId, oneDriveDriveId: location.driveId, oneDriveRutaActual: location.ruta, archivoOneDrive: location.ruta, carpetaOrigen: `${DOCUMENTOS_PANEL_ROOT}/Pendientes` })
        await audit(tx, saved, actorId, 'ORIGINAL_VERIFICADO', file.solicitudId, { hash: file.hash, estado: next.estado, ubicacion: location }); return saved
      })
      return { ...publicDocument(row), repetido: reservation.repetido }
    },
    async action(id: string, body: Record<string, unknown>) {
      const action = body.action
      if (!['GUARDAR', 'VALIDAR', 'ARCHIVAR'].includes(String(action)) || Object.keys(body).some(k => !['action','version','solicitudId','confirmacionHumana','campos'].includes(k))) fail(400, 'ACTION_INVALIDA', 'Acción o campos no admitidos.')
      const solicitudId = uuid(body.solicitudId); const confirm = action !== 'GUARDAR'
      if (confirm && body.confirmacionHumana !== true) fail(422, 'CONFIRMACION_REQUERIDA', 'Confirmación humana explícita obligatoria.')
      if (action === 'ARCHIVAR' && body.campos !== undefined) fail(400, 'ARCHIVO_METADATA', 'Archivar usa sólo los metadatos ya validados en servidor.')
      const campos = action === 'ARCHIVAR' ? null : parseMetadata(body.campos, action === 'VALIDAR')
      const huella = hashJson({ action, campos }); await deps.guard(true, confirm)
      if (action !== 'ARCHIVAR') return txRun(async (tx, actorId) => {
        const row = await load(tx, id); const s = snapshotOf(row)
        if (action === 'VALIDAR' && s.solicitudValidacion === solicitudId) { if (s.huellaValidacion !== huella) fail(409, 'IDEMPOTENCY_CONFLICT', 'Solicitud reutilizada con cambios.'); if (!row.facturaResueltaId) fail(409, 'VALIDACION_INCOMPLETA', 'No existe factura validada.'); return publicDocument(row) }
        const replay = await tx.auditoriaCalidadFactura.findMany({ where: { revisionId: id, solicitudId, accion: { in: ['DOCUMENTOS_PANEL_GUARDAR', 'DOCUMENTOS_PANEL_VALIDAR'] } }, take: 2 })
        if (replay.length) { if (replay.length !== 1 || replay[0].detalle.huella !== huella) fail(409, 'IDEMPOTENCY_CONFLICT', 'Solicitud reutilizada con cambios.'); return publicDocument(row) }
        guardVersion(row, body.version)
        if (!s.original || s.estado !== 'PENDIENTE_REVISION') fail(409, 'ESTADO_INVALIDO', 'Sólo un original incorporado pendiente admite correcciones/validación.')
        if (action === 'VALIDAR' && s.tipo !== 'FACTURA_RECIBIDA') fail(422, 'TIPO_NO_FACTURA', 'Confirming/nómina/otros permanecen pendientes; no se convierten en factura.')
        let facturaId: string | null = null
        if (action === 'VALIDAR') {
          const canonKey = claveCanonicaFactura(campos!.cif, campos!.numFactura)!
          const existing = await deps.canonical(tx, canonKey)
          if (existing.length) fail(409, 'IDENTIDAD_EXISTENTE', 'Ya existe esta identidad canónica; no se crea una segunda factura.')
          const factura = await tx.facturaRecibida.create({ data: { ...metadataData(campos!), estado: 'VALIDADA', calidad: 'VALIDA', canonKey, fechaProvenancia: 'DOCUMENTO', naturalezaDocumento: 'FACTURA_RECIBIDA', ocrCompletado: false, datosOcrRaw: JSON.stringify({ schema: DOCUMENTOS_PANEL_SCHEMA, hash: s.hash, correccionManual: true, fechaProvenancia: 'DOCUMENTO', revisionId: id }), oneDriveItemId: s.actual!.itemId, oneDriveDriveId: s.actual!.driveId, archivoOneDrive: s.actual!.ruta, oneDriveRutaActual: s.actual!.ruta, carpetaOrigen: `${DOCUMENTOS_PANEL_ROOT}/Pendientes`, estadoCarpeta: 'VALIDADA_PENDIENTE_ARCHIVO' } })
          facturaId = factura.id
        }
        const next: Snapshot = action === 'VALIDAR' ? { ...s, estado: 'VALIDADA_PENDIENTE_ARCHIVO', solicitudValidacion: solicitudId, huellaValidacion: huella } : s
        const saved = await update(tx, row, next, { ...metadataData(campos!), ...(facturaId ? { facturaResueltaId: facturaId, resueltaAt: new Date(now()) } : {}) })
        await audit(tx, saved, actorId, action as string, solicitudId, { hash: s.hash, estado: next.estado, huella, versionAnterior: row.version, versionResultante: saved.version, antes: publicDocument(row).campos, campos, facturaId }); return publicDocument(saved)
      }, confirm)
      const reservation = await txRun(async (tx, actorId) => {
        const row = await load(tx, id); const s = snapshotOf(row)
        if (!row.facturaResueltaId || !s.actual || s.tipo !== 'FACTURA_RECIBIDA') fail(409, 'VALIDACION_REQUERIDA', 'Debe validar humanamente la factura antes de archivar.')
        if (s.estado === 'ARCHIVADA') { if (s.archivo?.solicitudId !== solicitudId) guardVersion(row, body.version); return { row, completed: true } }
        if (s.estado !== 'VALIDADA_PENDIENTE_ARCHIVO') fail(409, 'ESTADO_INVALIDO', 'Estado no archivable.')
        const name = standardizedName(publicDocument(row).campos, s.extension, s.hash)
        if (s.archivo && s.archivo.solicitudId !== solicitudId && s.archivo.leaseUntil > now()) fail(409, 'ARCHIVO_EN_CURSO', 'Hay un archivado reservado; espere y recargue.')
        if (s.archivo?.leaseUntil && s.archivo.leaseUntil > now()) fail(409, 'ARCHIVO_EN_CURSO', 'Archivado en curso; no se repite la llamada externa.')
        if (!s.archivo || s.archivo.solicitudId !== solicitudId) guardVersion(row, body.version)
        if (s.archivo?.solicitudId === solicitudId && s.archivo.huella !== huella) fail(409, 'IDEMPOTENCY_CONFLICT', 'Solicitud de archivado modificada.')
        const next = { ...s, archivo: { nombre: name, solicitudId, huella, token: randomUUID(), leaseUntil: now() + 120000 }, error: null }
        const saved = await update(tx, row, next)
        await audit(tx, saved, actorId, 'RESERVAR_ARCHIVO', solicitudId, { hash: s.hash, estado: next.estado, origen: s.actual, nombre: name, token: next.archivo.token }); return { row: saved, completed: false }
      }, true)
      if (reservation.completed) return publicDocument(reservation.row)
      const reserved = snapshotOf(reservation.row)
      try {
        await deps.guard(true, true)
        const location = await deps.provider.archive(reserved.actual!, reserved.archivo!.nombre, reserved)
        if (location.itemId !== reserved.actual!.itemId || location.driveId !== reserved.actual!.driveId || location.hash !== reserved.hash || location.nombre !== reserved.archivo!.nombre || location.ruta !== `${DOCUMENTOS_PANEL_ROOT}/Archivadas/${reserved.archivo!.nombre}`) fail(502, 'ARCHIVO_NO_VERIFICADO', 'Graph no verificó destino/nombre/hash.')
        return await txRun(async (tx, actorId) => {
          const row = await load(tx, id); const s = snapshotOf(row)
          if (s.estado === 'ARCHIVADA') return publicDocument(row)
          if (s.archivo?.token !== reserved.archivo!.token) fail(409, 'RESERVA_CONFLICT', 'Reserva de archivado cambiada.')
          const next = { ...s, actual: location, estado: 'ARCHIVADA' as const, archivo: { ...s.archivo!, leaseUntil: 0 }, error: null }
          await tx.facturaRecibida.update({ where: { id: row.facturaResueltaId }, data: { oneDriveRutaActual: location.ruta, archivoOneDrive: location.ruta, estadoCarpeta: next.estado } })
          await tx.historialUbicacionFacturaRecibida.create({ data: { facturaId: row.facturaResueltaId, autorId: actorId, motivo: 'DOCUMENTOS_PANEL_ARCHIVAR_HUMANO', anterior: s.actual, actual: location } })
          const saved = await update(tx, row, next, { oneDriveRutaActual: location.ruta, archivoOneDrive: location.ruta })
          await audit(tx, saved, actorId, 'ARCHIVADA', solicitudId, { hash: s.hash, estado: next.estado, anterior: s.actual, actual: location }); return publicDocument(saved)
        }, true)
      } catch (error) {
        // No false ARCHIVADA. Provider may have moved the same item already;
        // retry resolves its server-owned ID and verifies the exact target/hash.
        try { await txRun(async (tx, actorId) => { const row = await load(tx, id); const s = snapshotOf(row); if (s.estado !== 'ARCHIVADA' && s.archivo?.token === reserved.archivo!.token) { const saved = await update(tx, row, { ...s, archivo: { ...s.archivo, leaseUntil: 0 }, error: 'Archivado no confirmado. Reintentar con la misma solicitud.' }); await audit(tx, saved, actorId, 'ARCHIVO_FALLO', solicitudId, { hash: s.hash, estado: 'VALIDADA_PENDIENTE_ARCHIVO', codigo: error instanceof DocumentosPanelError ? error.code : 'PROVIDER_OR_DB_FAILURE' }) } }, true) } catch { /* Reservation remains pending; lease expires. Never forge a receipt. */ }
        throw error
      }
    },
  }
}
