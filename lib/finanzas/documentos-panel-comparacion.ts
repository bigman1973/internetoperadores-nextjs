import { createHash } from 'node:crypto'

/** Comparación documental de staging. Ninguna dependencia de Prisma/Graph con efectos al importar.
 * El registry sólo admite lecturas; los adaptadores reales se suministran en la ruta autorizada. */
export const COMPARACION_VERSION = 'documentos-comparacion/v1' as const
export const MANUAL_ROOT_COMPARACION = 'STAGING_FINANZAS_NO_CONTABILIZAR/DocumentosPanel'
// Raíz EXISTENTE en lib/microsoft-graph.ts y app/api/admin/empleados/[id]/documentos.
// No se descubre otra biblioteca ni se infiere una raíz de nombres de archivos.
export const NOMINAS_ROOT_CONOCIDA = '4. Recursos Humanos/3. Nóminas'
export const DEFAULT_COMPARACION_RANGE = { from: '2026-11-30', to: '2026-12-04' } as const
export const COMPARACION_LIMITS = { dbPage: 200, dbRowsPerModel: 5000, graphFilesPerRoot: 5000, hashFiles: 40, hashBytesPerFile: 4 * 1024 * 1024, hashBytesTotal: 40 * 1024 * 1024 } as const
export type RangoComparacion = Readonly<{ from: string; to: string }>
export class RangoComparacionError extends Error {}
function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const stamp = Date.parse(`${value}T00:00:00.000Z`)
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value
}
export function parseRangoComparacion(from?: string | null, to?: string | null): RangoComparacion {
  if (from == null && to == null) return { ...DEFAULT_COMPARACION_RANGE }
  if (!validDay(from) || !validDay(to) || from > to
    || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 >= 31) {
    throw new RangoComparacionError('Use from/to ISO válidos, ordenados y un rango inclusivo de hasta 31 días.')
  }
  return { from, to }
}
function day(value: unknown): string | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : null
  if (typeof value !== 'string') return null
  if (validDay(value)) return value
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return null
  return new Date(value).toISOString().slice(0, 10)
}
function inRange(value: unknown, range: RangoComparacion) { const d = day(value); return !!d && d >= range.from && d <= range.to }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null }
function hash(value: unknown): string | null { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null }
function object(value: unknown): Record<string, any> {
  if (typeof value === 'string') { try { return object(JSON.parse(value)) } catch { return {} } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}
function safeName(value: unknown): string { return (text(value) ?? 'Documento sin nombre').split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180) }
export type ReferenciaDocumento = Readonly<{ driveId: string; itemId: string; path: string | null }>
export type DocumentoInventarioComparacion = Readonly<{
  id: string; nombre: string; referencia: ReferenciaDocumento | null; sha256: string | null;
  hashProvenancia: 'BYTES_GRAPH' | 'JSON_PANEL' | 'AUDITORIA' | 'DB_METADATA' | 'GRAPH_METADATA' | 'NO_DISPONIBLE';
  fechaFactura: string | null; fechaFacturaProvenancia: string | null; modifiedAt: string | null;
  createdAt: string | null; origen: string; incidencias: readonly string[];
}>
export type InventarioComparacion = Readonly<{
  key: 'panel' | 'carpetas' | 'manual' | 'nominas'; scope: string;
  completo: boolean; truncado: boolean; documentos: readonly DocumentoInventarioComparacion[];
  incidencias: readonly string[];
}>
export type ProveedorComparacionReadOnly = Readonly<{
  key: InventarioComparacion['key']; scope: string; read: (range: RangoComparacion) => Promise<InventarioComparacion>;
}>
export type FilaDocumentoComparacion = Readonly<{
  id: string; nombre: string; origen: string; archivoUrlPrivada: string | null;
  fechaFactura: string | null; fechaFacturaProvenancia: string | null; modifiedAt: string | null;
  createdAt: string | null; seleccion: 'FECHA_DOCUMENTO' | 'MODIFICACION_ARCHIVO' | 'AMBAS' | 'NO_VERIFICABLE' | 'FUERA_RANGO';
  hashDisponible: boolean; hashProvenancia: DocumentoInventarioComparacion['hashProvenancia'];
  contraparteIds: readonly string[]; evidencia: 'REFERENCIA_ID' | 'SHA256' | 'NAME_MATCH_NO_VERIFICADO' | 'NINGUNA';
  motivos: readonly string[];
}>
export type ResultadoDocumentosComparacion = Readonly<{
  version: typeof COMPARACION_VERSION; rango: RangoComparacion; readAt: string; soloLectura: true;
  inventoryCompleteness: readonly { proveedor: string; scope: string; completo: boolean; truncado: boolean; documentos: number; incidencias: readonly string[] }[];
  inventarioCompleto: boolean; hashesCompletos: boolean; alcanceSinFaltas: boolean; semanaCompleta: false;
  estado: 'INCOMPLETO' | 'DIFERENCIAS' | 'SIN_DIFERENCIAS_EN_ALCANCE';
  faltanEnPanel: readonly FilaDocumentoComparacion[]; faltanEnCarpetas: readonly FilaDocumentoComparacion[];
  copiasHuella: readonly { id: string; documentos: readonly FilaDocumentoComparacion[]; aviso: string }[];
  cambiosFuera: readonly FilaDocumentoComparacion[]; NO_VERIFICABLE: readonly FilaDocumentoComparacion[];
  coincidencias: readonly FilaDocumentoComparacion[]; fueraRango: number; avisos: readonly string[];
  businessWrites: 0; graphMutations: 0; imports: 0;
}>
function refKey(d: DocumentoInventarioComparacion) { return d.referencia ? `${d.referencia.driveId}\u0000${d.referencia.itemId}` : null }
export function opaqueDocumentoId(provider: string, document: DocumentoInventarioComparacion): string {
  return createHash('sha256').update(`DOC_COMPARACION_V1\u0000${provider}\u0000${document.id}\u0000${refKey(document) ?? ''}`).digest('hex').slice(0, 32)
}
/** Pure matcher: IDs referencian un objeto, SHA256 acredita bytes, el nombre NUNCA acredita igualdad. */
export function compararInventariosDocumentales(range: RangoComparacion, inventories: readonly InventarioComparacion[], readAt: string): ResultadoDocumentosComparacion {
  parseRangoComparacion(range.from, range.to)
  const all = inventories.flatMap(inv => inv.documentos.map(d => ({ provider: inv.key, d })))
  const panels = all.filter(x => x.provider === 'panel')
  const folders = all.filter(x => x.provider === 'carpetas' || x.provider === 'nominas')
  const graphFiles = all.filter(x => x.provider !== 'panel')
  const indexed = new Map<typeof all, { refs: Map<string, typeof all>; hashes: Map<string, typeof all>; names: Map<string, typeof all> }>()
  const index = (targets: typeof all) => {
    let value = indexed.get(targets)
    if (!value) {
      value = { refs: new Map(), hashes: new Map(), names: new Map() }
      const add = (map: Map<string, typeof all>, key: string | null, x: typeof all[number]) => { if (key) { const rows = map.get(key) ?? []; rows.push(x); map.set(key, rows) } }
      for (const x of targets) { add(value.refs, refKey(x.d), x); add(value.hashes, x.d.sha256, x); add(value.names, x.d.nombre.normalize('NFKC').toLowerCase(), x) }
      indexed.set(targets, value)
    }
    return value
  }
  const counterpart = (x: typeof all[number], targets: typeof all) => {
    const lookup = index(targets)
    const ids = lookup.refs.get(refKey(x.d) ?? '') ?? []
    if (ids.length) return { matches: ids, evidencia: 'REFERENCIA_ID' as const }
    const hashes = lookup.hashes.get(x.d.sha256 ?? '') ?? []
    if (hashes.length) return { matches: hashes, evidencia: 'SHA256' as const }
    const names = lookup.names.get(x.d.nombre.normalize('NFKC').toLowerCase()) ?? []
    return { matches: names, evidencia: names.length ? 'NAME_MATCH_NO_VERIFICADO' as const : 'NINGUNA' as const }
  }
  const selectionCache = new Map<typeof all[number], FilaDocumentoComparacion['seleccion']>()
  const selection = (x: typeof all[number]): FilaDocumentoComparacion['seleccion'] => {
    const cached = selectionCache.get(x); if (cached) return cached
    const related = x.provider === 'panel' ? index(graphFiles).refs.get(refKey(x.d) ?? '') ?? []
      : counterpart(x, panels).matches.filter(y => (x.d.sha256 !== null && y.d.sha256 === x.d.sha256) || (refKey(x.d) !== null && refKey(y.d) === refKey(x.d)))
    const documentDate = [x, ...related].some(y => y.d.fechaFacturaProvenancia === 'DOCUMENTO' && inRange(y.d.fechaFactura, range))
    const modified = [x, ...related].some(y => inRange(y.d.modifiedAt, range))
    const known = [x, ...related].some(y => day(y.d.modifiedAt) || (y.d.fechaFacturaProvenancia === 'DOCUMENTO' && day(y.d.fechaFactura)))
    // createdAt nunca es una fecha de ingreso/documento ni demuestra cobertura semanal.
    const selected = documentDate && modified ? 'AMBAS' : documentDate ? 'FECHA_DOCUMENTO' : modified ? 'MODIFICACION_ARCHIVO' : known ? 'FUERA_RANGO' : 'NO_VERIFICABLE'
    selectionCache.set(x, selected); return selected
  }
  const row = (x: typeof all[number], targets: typeof all = [], motivos: string[] = []): FilaDocumentoComparacion => {
    const c = counterpart(x, targets); const id = opaqueDocumentoId(x.provider, x.d)
    return { id, nombre: x.d.nombre, origen: x.d.origen,
      archivoUrlPrivada: x.d.referencia ? `/api/admin/finanzas/documentos/comparacion?from=${range.from}&to=${range.to}&archivo=${id}` : null,
      fechaFactura: x.d.fechaFactura, fechaFacturaProvenancia: x.d.fechaFacturaProvenancia,
      modifiedAt: x.d.modifiedAt, createdAt: x.d.createdAt, seleccion: selection(x), hashDisponible: !!x.d.sha256,
      hashProvenancia: x.d.hashProvenancia, contraparteIds: c.matches.map(y => opaqueDocumentoId(y.provider, y.d)), evidencia: c.evidencia,
      motivos: [...x.d.incidencias, ...motivos] }
  }
  const selected = all.filter(x => selection(x) !== 'FUERA_RANGO')
  const missingPanel: FilaDocumentoComparacion[] = [], missingFolders: FilaDocumentoComparacion[] = [], changes: FilaDocumentoComparacion[] = []
  const uncertain: FilaDocumentoComparacion[] = [], matches: FilaDocumentoComparacion[] = []
  for (const x of selected) {
    const targets = x.provider === 'panel' ? folders : panels
    const c = counterpart(x, targets)
    const proven = c.evidencia === 'REFERENCIA_ID' || c.evidencia === 'SHA256'
    const reasons: string[] = []
    if (!x.d.referencia) reasons.push('SIN_REFERENCIA_GRAPH_PRIVADA')
    if (!x.d.sha256) reasons.push('SIN_SHA256: identidad de bytes no verificada')
    if (selection(x) === 'NO_VERIFICABLE') reasons.push('SIN_FECHA_DOCUMENTAL_O_MODIFICACION: createdAt no demuestra ingreso')
    if (c.evidencia === 'NAME_MATCH_NO_VERIFICADO') reasons.push('NAME_MATCH: sólo aviso, no igualdad')
    if (x.d.incidencias.length || reasons.length) uncertain.push(row(x, targets, reasons))
    if (x.provider === 'carpetas' || x.provider === 'nominas') {
      if (!proven) missingPanel.push(row(x, panels, ['No hay referencia ID ni SHA256 en el registro panel leído; ausencia limitada al alcance.']))
      else matches.push(row(x, panels))
    } else if (x.provider === 'panel') {
      if (!proven) missingFolders.push(row(x, folders, ['No hay ID ni SHA256 en carpetas legacy; conservar sólo en namespace manual no significa pérdida.']))
      else matches.push(row(x, folders))
    } else if (!proven) uncertain.push(row(x, panels, ['Archivo manual sin referencia verificada en el registro panel.']))
  }
  // Deriva cambios sin importar el rango: drift externo de un puntero registrado.
  for (const p of panels) {
    const current = index(graphFiles).refs.get(refKey(p.d) ?? '') ?? []
    for (const g of current) {
      const reasons: string[] = []
      if (p.d.referencia?.path && g.d.referencia?.path && p.d.referencia.path !== g.d.referencia.path) reasons.push('RUTA_DIFIERE_DEL_PUNTERO_PANEL')
      if (p.d.sha256 && g.d.sha256 && p.d.sha256 !== g.d.sha256) reasons.push('SHA256_DIFIERE: posible cambio externo de contenido')
      if (reasons.length) changes.push(row(g, [p], reasons))
    }
  }
  const copies: ResultadoDocumentosComparacion['copiasHuella'][number][] = []
  const hashGroups = new Map<string, typeof all>()
  for (const x of all) if (x.d.sha256) { const group = hashGroups.get(x.d.sha256) ?? []; group.push(x); hashGroups.set(x.d.sha256, group) }
  for (const [sha, group] of hashGroups) {
    const distinct = new Map<string, typeof all[number]>()
    for (const x of group) { const key = refKey(x.d) ?? `${x.provider}:${x.d.id}`; if (!distinct.has(key) || x.provider !== 'panel') distinct.set(key, x) }
    if (distinct.size > 1 && group.some(x => selection(x) !== 'FUERA_RANGO')) copies.push({ id: createHash('sha256').update(`COPIA:${sha}`).digest('hex').slice(0, 32), documentos: [...distinct.values()].map(x => row(x)), aviso: 'SHA256 repetido en objetos distintos: revisar copias; no borrar, deduplicar ni importar.' })
  }
  const required = ['panel', 'carpetas', 'manual']
  const complete = required.every(key => inventories.some(i => i.key === key && i.completo && !i.truncado)) && inventories.every(i => i.completo && !i.truncado)
  const uniqUncertain = [...new Map(uncertain.map(r => [r.id, r])).values()]
  const hashesComplete = complete && selected.every(x => !!x.d.sha256)
  const noDifferences = complete && hashesComplete && !missingPanel.length && !missingFolders.length && !copies.length && !changes.length && !uniqUncertain.length
  return { version: COMPARACION_VERSION, rango: range, readAt, soloLectura: true,
    inventoryCompleteness: inventories.map(i => ({ proveedor: i.key, scope: i.scope, completo: i.completo, truncado: i.truncado, documentos: i.documentos.length, incidencias: i.incidencias })),
    inventarioCompleto: complete, hashesCompletos: hashesComplete, alcanceSinFaltas: noDifferences, semanaCompleta: false,
    estado: !complete || !hashesComplete || uniqUncertain.length ? 'INCOMPLETO' : noDifferences ? 'SIN_DIFERENCIAS_EN_ALCANCE' : 'DIFERENCIAS',
    faltanEnPanel: missingPanel, faltanEnCarpetas: missingFolders, copiasHuella: copies, cambiosFuera: changes,
    NO_VERIFICABLE: uniqUncertain, coincidencias: matches, fueraRango: all.length - selected.length,
    avisos: ['Selección = fechaFactura con provenancia DOCUMENTO o modificación del archivo en UTC. No equivale a fecha de recepción.',
      'Inventario completo sólo describe páginas y descendientes de las raíces declaradas; no todos los documentos que debieran haberse recibido.',
      'Semana completa NO certificada. Correo administración, ausencia global, atascos de Lorena y A3 noviembre requieren evidencias independientes.',
      'Convivencia 30/11–4/12: carpetas siguen RW. No se ejecuta corte 9/12, cambio de permisos ni auditoría nocturna.'],
    businessWrites: 0, graphMutations: 0, imports: 0 }
}
export async function ejecutarComparacionDocumental(range: RangoComparacion, registry: readonly ProveedorComparacionReadOnly[], readAt = new Date().toISOString()) {
  const inventories: InventarioComparacion[] = []
  for (const provider of registry) {
    try {
      const result = await provider.read(range)
      if (result.key !== provider.key || result.scope !== provider.scope) throw new Error('PROVIDER_CONTRACT')
      inventories.push(result)
    } catch { inventories.push({ key: provider.key, scope: provider.scope, completo: false, truncado: false, documentos: [], incidencias: ['PROVIDER_READ_FAILED: raíz/páginas/descendientes no verificables; no se devuelven hijos parciales.'] }) }
  }
  return { resultado: compararInventariosDocumentales(range, inventories, readAt), inventarios: inventories }
}

/** Adaptación SELECT-only nativa. Limita todas las páginas y nunca lee importes, texto OCR ni credenciales para el DTO. */
export type ComparisonDbReader = {
  facturaRecibida: { findMany: (args: any) => Promise<any[]> };
  revisionLecturaFacturaRecibida: { findMany: (args: any) => Promise<any[]> };
  auditoriaCalidadFactura: { findMany: (args: any) => Promise<any[]> };
  nominaDocumento?: { findMany: (args: any) => Promise<any[]> };
  documentoEmpleado?: { findMany: (args: any) => Promise<any[]> };
}
async function readPages(model: { findMany: (args: any) => Promise<any[]> }, select: Record<string, boolean>, where: Record<string, any> = {}) {
  const rows: any[] = []; let exhausted = false
  for (let skip = 0; skip < COMPARACION_LIMITS.dbRowsPerModel; skip += COMPARACION_LIMITS.dbPage) {
    const page = await model.findMany({ select, where, orderBy: { id: 'asc' }, skip, take: COMPARACION_LIMITS.dbPage })
    if (!Array.isArray(page) || page.length > COMPARACION_LIMITS.dbPage) throw new Error('DB_PROVIDER_CONTRACT')
    rows.push(...page)
    if (page.length < COMPARACION_LIMITS.dbPage) { exhausted = true; break }
  }
  if (!exhausted) {
    const probe = await model.findMany({ select: { id: true }, where, orderBy: { id: 'asc' }, skip: COMPARACION_LIMITS.dbRowsPerModel, take: 1 })
    exhausted = Array.isArray(probe) && probe.length === 0
  }
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('DB_PAGINATION_CHANGED')
  return { rows, completo: exhausted }
}
export function documentoDesdeFilaNativa(row: any, model: string, audits: readonly any[] = []): DocumentoInventarioComparacion {
  const raw = object(row.datosOcrRaw); const panel = raw.schema === 'documentos-panel/v1'
  // huellaSolicitud/huellaValidacion son hashes de solicitudes, NUNCA hashes del archivo.
  const fileAudits = audits.filter(a => a.facturaId === row.id || a.revisionId === row.id).map(a => object(a.detalle))
  const latestFileAudit = fileAudits.find(a => hash(a.hash) || hash(a.sha256))
  const rawHash = hash(raw.hash) ?? hash(raw.sha256)
  const sha256 = rawHash ?? hash(row.sha256) ?? hash(latestFileAudit?.hash) ?? hash(latestFileAudit?.sha256)
  const location = object(raw.actual)
  const driveId = text(row.oneDriveDriveId) ?? text(location.driveId), itemId = text(row.oneDriveItemId) ?? text(row.driveItemId) ?? text(location.itemId)
  const path = text(row.oneDriveRutaActual) ?? text(row.archivoOneDrive) ?? text(location.ruta)
  const dateProvenance = text(row.fechaProvenancia) ?? text(raw.fechaProvenancia) ?? (panel && ['VALIDADA_PENDIENTE_ARCHIVO', 'ARCHIVADA'].includes(raw.estado) ? 'DOCUMENTO' : null)
  const incidencias: string[] = []
  if (panel && raw.estado === 'SUBIDA_RESERVADA') incidencias.push('SUBIDA_RESERVADA: original no verificado')
  if (panel && location.itemId && row.oneDriveItemId && location.itemId !== row.oneDriveItemId) incidencias.push('PUNTEROS_JSON_DB_INCOHERENTES')
  if (panel && location.hash && sha256 && location.hash !== sha256) incidencias.push('HASH_JSON_UBICACION_INCOHERENTE')
  if (fileAudits.some(a => (hash(a.hash) ?? hash(a.sha256)) && sha256 && (hash(a.hash) ?? hash(a.sha256)) !== sha256)) incidencias.push('HASH_AUDITORIA_DIFIERE_DEL_REGISTRO')
  return { id: `${model}:${row.id}`, nombre: safeName(path ?? row.nombre ?? raw.nombreOriginal ?? row.archivoNombre),
    referencia: driveId && itemId ? { driveId, itemId, path } : null, sha256,
    hashProvenancia: rawHash ? 'JSON_PANEL' : hash(row.sha256) ? 'DB_METADATA' : sha256 ? 'AUDITORIA' : 'NO_DISPONIBLE',
    fechaFactura: day(row.fecha), fechaFacturaProvenancia: dateProvenance,
    modifiedAt: text(raw.modifiedAt) ?? text(raw.lastModifiedDateTime), createdAt: day(row.createdAt), origen: model, incidencias }
}
export function crearProveedorPanelComparacion(db: ComparisonDbReader, includePayroll = false, configuredDriveId?: string, protectedReferences = new Set<string>(), selectedForHash = new Set<string>()): ProveedorComparacionReadOnly {
  const scope = 'Registro nativo FacturaRecibida + RevisionLecturaFacturaRecibida; auditoría hash documental' + (includePayroll ? ' + NominaDocumento/DocumentoEmpleado' : '; nóminas no autorizadas/no incluidas')
  return { key: 'panel', scope, async read(range) {
    const select = { id: true, oneDriveItemId: true, oneDriveDriveId: true, oneDriveRutaActual: true, archivoOneDrive: true, fecha: true, datosOcrRaw: true, createdAt: true }
    const invoices = await readPages(db.facturaRecibida, { ...select, fechaProvenancia: true })
    const revisions = await readPages(db.revisionLecturaFacturaRecibida, select)
    const audits = await readPages(db.auditoriaCalidadFactura, { id: true, facturaId: true, revisionId: true, detalle: true }, { accion: { startsWith: 'DOCUMENTOS_PANEL_' } })
    const sortedAudits = [...audits.rows].reverse()
    let withheld = 0
    const allowed = (row: any) => {
      const raw = object(row.datosOcrRaw)
      if (!includePayroll && raw.tipo === 'NOMINA') {
        withheld += 1
        const d = documentoDesdeFilaNativa(row, 'PROTEGIDO')
        if (refKey(d)) protectedReferences.add(refKey(d)!)
        return false
      }
      return true
    }
    const documents = [...invoices.rows.filter(allowed).map(r => documentoDesdeFilaNativa(r, 'FacturaRecibida', sortedAudits)), ...revisions.rows.filter(allowed).map(r => documentoDesdeFilaNativa(r, 'RevisionLecturaFacturaRecibida', sortedAudits))]
    let complete = invoices.completo && revisions.completo && audits.completo && withheld === 0
    if (includePayroll && db.nominaDocumento && db.documentoEmpleado) {
      const payroll = await readPages(db.nominaDocumento, { id: true, driveItemId: true, nombre: true, createdAt: true })
      const employee = await readPages(db.documentoEmpleado, { id: true, driveItemId: true, nombre: true, sha256: true, createdAt: true })
      documents.push(...payroll.rows.map(r => documentoDesdeFilaNativa({ ...r, oneDriveDriveId: configuredDriveId }, 'NominaDocumento')), ...employee.rows.map(r => documentoDesdeFilaNativa({ ...r, oneDriveDriveId: configuredDriveId }, 'DocumentoEmpleado')))
      complete = complete && payroll.completo && employee.completo
    } else if (includePayroll) complete = false
    for (const d of documents) if (d.fechaFacturaProvenancia === 'DOCUMENTO' && inRange(d.fechaFactura, range) && refKey(d)) selectedForHash.add(refKey(d)!)
    return { key: 'panel', scope, completo: complete, truncado: !complete, documentos: documents, incidencias: complete ? [] : ['DB_CAP_OR_METADATA_PROVIDER: no afirmar ausencia fuera de las páginas leídas.'] }
  } }
}
export type GraphComparacionReadOnly = {
  resolveInvoiceLibrary: () => Promise<{ driveId: string; rootPath: string }>;
  listFolderContents: (driveId: string, root: string, recursive: boolean) => Promise<any[]>;
  readBytes?: (driveId: string, itemId: string, maxBytes: number) => Promise<Buffer>;
}
/** Reutiliza el resolver B1 exacto y listFolderContents(..., true), que agota páginas
 * y rechaza íntegramente cualquier fallo de un hijo. No replica Graph pagination. */
export function crearProveedoresGraphComparacion(graph: GraphComparacionReadOnly, legacyRoot: string, includePayroll = false, protectedReferences = new Set<string>(), selectedForHash = new Set<string>()): ProveedorComparacionReadOnly[] {
  let libraryPromise: ReturnType<GraphComparacionReadOnly['resolveInvoiceLibrary']> | undefined
  const library = () => libraryPromise ??= graph.resolveInvoiceLibrary()
  let hashFiles = 0, hashBytes = 0
  const specs: Array<{ key: InventarioComparacion['key']; scope: string; enabled: boolean }> = [
    { key: 'carpetas', scope: legacyRoot, enabled: true }, { key: 'manual', scope: MANUAL_ROOT_COMPARACION, enabled: true },
    { key: 'nominas', scope: NOMINAS_ROOT_CONOCIDA, enabled: includePayroll },
  ]
  return specs.map(spec => ({ key: spec.key, scope: spec.scope, async read(range) {
    if (!spec.enabled) return { key: spec.key, scope: spec.scope, completo: false, truncado: false, documentos: [], incidencias: ['NOMINAS_SCOPE_NO_AUTORIZADO: raíz conocida, no consultada sin permiso V nóminas.'] }
    const lib = await library()
    if (lib.rootPath !== legacyRoot) throw new Error('GRAPH_ROOT_MISMATCH')
    // Un único listado recursivo incluye confirming y TODAS las subcarpetas del namespace manual.
    const listed = await graph.listFolderContents(lib.driveId, spec.scope, true)
    if (!Array.isArray(listed)) throw new Error('GRAPH_PROVIDER_CONTRACT')
    const rootPrefix = `${spec.scope}/`
    if (listed.some(x => !text(x.id) || !text(x.name) || !text(x.fullPath)?.startsWith(rootPrefix))) throw new Error('GRAPH_SCOPE_METADATA_INVALID')
    if (new Set(listed.map(x => x.id)).size !== listed.length) throw new Error('GRAPH_DUPLICATE_ID')
    const truncated = listed.length > COMPARACION_LIMITS.graphFilesPerRoot
    const documents: DocumentoInventarioComparacion[] = []
    let withheld = 0
    for (const item of listed.slice(0, COMPARACION_LIMITS.graphFilesPerRoot)) {
      if (item.folder) throw new Error('GRAPH_RECURSIVE_NOT_EXHAUSTIVE')
      if (protectedReferences.has(`${lib.driveId}\u0000${item.id}`)) { withheld += 1; continue }
      let sha256 = hash(item.file?.hashes?.sha256Hash), provenance: DocumentoInventarioComparacion['hashProvenancia'] = sha256 ? 'GRAPH_METADATA' : 'NO_DISPONIBLE'
      const incidencias: string[] = []
      const modified = text(item.lastModifiedDateTime)
      if (!day(modified)) incidencias.push('SIN_MODIFIED_AT_GRAPH')
      const size = Number(item.size)
      // Bytes sólo de la selección por modificación o fecha documental del puntero
      // panel; no OCR, parseo ni descarga masiva de documentos históricos.
      if (!sha256 && (inRange(modified, range) || selectedForHash.has(`${lib.driveId}\u0000${item.id}`)) && graph.readBytes) {
        if (!Number.isSafeInteger(size) || size <= 0 || size > COMPARACION_LIMITS.hashBytesPerFile) incidencias.push('HASH_NO_VERIFICABLE_TAMANO')
        else if (hashFiles >= COMPARACION_LIMITS.hashFiles || hashBytes + size > COMPARACION_LIMITS.hashBytesTotal) incidencias.push('HASH_CAP: no certificar cobertura de hashes')
        else {
          hashFiles += 1; hashBytes += size
          try {
            const bytes = await graph.readBytes(lib.driveId, item.id, Math.min(COMPARACION_LIMITS.hashBytesPerFile, COMPARACION_LIMITS.hashBytesTotal - hashBytes + size))
            if (bytes.length !== size) throw new Error('GRAPH_SIZE_CHANGED')
            sha256 = createHash('sha256').update(bytes).digest('hex'); provenance = 'BYTES_GRAPH'
          } catch { incidencias.push('HASH_READ_FAILED: archivo ilegible/cambió/no autorizado') }
        }
      }
      documents.push({ id: item.id, nombre: safeName(item.name), referencia: { driveId: lib.driveId, itemId: item.id, path: item.fullPath }, sha256, hashProvenancia: provenance,
        fechaFactura: null, fechaFacturaProvenancia: null, modifiedAt: modified, createdAt: text(item.createdDateTime), origen: spec.key, incidencias })
    }
    return { key: spec.key, scope: spec.scope, completo: !truncated && withheld === 0, truncado: truncated, documentos: documents,
      incidencias: [...(truncated ? ['GRAPH_FILE_CAP: listado exhaustivo obtenido pero salida limitada; inventario NO completo.'] : []),
        ...(withheld ? ['SCOPE_PROTEGIDO_EXCLUIDO: sin nombres, texto, bytes ni metadatos de nóminas en el MVP.'] : [])] }
  } }))
}
export function comparacionDocumentosCsv(result: ResultadoDocumentosComparacion): string {
  const cell = (value: unknown) => { const s = String(value ?? '').replace(/[\r\n\u0000]/g, ' '); return `"${(/^[\s]*[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` }
  const rows: unknown[][] = [
    ['tipo', 'id_opaco', 'nombre', 'origen', 'fecha_factura', 'provenancia_fecha', 'modified_at_archivo', 'created_at_registro_no_ingreso', 'seleccion', 'evidencia', 'hash_disponible', 'motivos', 'from', 'to', 'inventario_completo', 'semana_completa'],
    ['RESUMEN', '', '', '', '', '', '', '', '', '', result.hashesCompletos, result.avisos.join(' | '), result.rango.from, result.rango.to, result.inventarioCompleto, false],
  ]
  const append = (kind: string, row: FilaDocumentoComparacion) => rows.push([kind, row.id, row.nombre, row.origen, row.fechaFactura, row.fechaFacturaProvenancia, row.modifiedAt, row.createdAt, row.seleccion, row.evidencia, row.hashDisponible, row.motivos.join(' | '), result.rango.from, result.rango.to, result.inventarioCompleto, false])
  for (const [kind, group] of [['FALTA_PANEL', result.faltanEnPanel], ['FALTA_CARPETAS', result.faltanEnCarpetas], ['CAMBIO_FUERA', result.cambiosFuera], ['NO_VERIFICABLE', result.NO_VERIFICABLE], ['COINCIDENCIA', result.coincidencias]] as const) for (const r of group) append(kind, r)
  for (const group of result.copiasHuella) for (const r of group.documentos) append('COPIA_HUELLA_AVISO', r)
  for (const inv of result.inventoryCompleteness) rows.push(['PROVEEDOR', '', inv.proveedor, inv.scope, '', '', '', '', '', '', '', inv.incidencias.join(' | '), result.rango.from, result.rango.to, inv.completo, false])
  return '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n'
}
