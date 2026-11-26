import 'server-only'
import { createHash } from 'node:crypto'
import { fail } from './documentos-panel-core'
import { DOCUMENTOS_PRODUCTION_ROOT, documentosPanelProductionPins } from './documentos-panel-runtime'
import { COMPARACION_LIMITS, type DocumentoInventarioComparacion, type ProveedorComparacionReadOnly } from './documentos-panel-comparacion'
import { createSelectedTransport, parseSelectedSourceRoots, selectedCredential, type SelectedDependencies, type SelectedRoot } from './documentos-production-selected'

type Env = Record<string, string | undefined>
/** Uses the existing pure matcher/DB provider. Production has its own Selected-ID
 * traversal adapter; it never calls the legacy root-path resolver/listing adapter.
 * Known labels are local namespace metadata only; Graph paths always use item IDs. */
export function crearComparacionProductionSelected(options: {
  knownLegacyRoot: string; guard: () => Promise<unknown>; scopeReady: () => boolean;
  protectedReferences?: Set<string>; selectedForHash?: Set<string>; downloadOnly?: boolean;
  env?: Env; destinationDependencies?: Omit<SelectedDependencies,'guard'>; sourceDependencies?: Omit<SelectedDependencies,'guard'>;
}) {
  const env = options.env ?? process.env
  const protectedReferences = options.protectedReferences ?? new Set<string>(), selectedForHash = options.selectedForHash ?? new Set<string>()
  const access = async () => { await options.guard(); if (!options.scopeReady()) fail(503, 'FINANCE_SCOPE_NOT_VERIFIED', 'Registro nativo no completo; no se consultan fuentes Graph.') }
  let destination: ReturnType<typeof createSelectedTransport> | undefined
  let source: ReturnType<typeof createSelectedTransport> | undefined
  let sourceRoots: readonly SelectedRoot[] | undefined
  const destinationRoot = (): SelectedRoot => {
    const pins = documentosPanelProductionPins(env)
    if (!pins) fail(503, 'DOCUMENTOS_SELECTED_PIN_MISSING', 'Faltan pins Production documentales.')
    return { ...pins, relativeLabel: DOCUMENTOS_PRODUCTION_ROOT }
  }
  const legacy = () => {
    if (!source) {
      const dest = destinationRoot()
      const credential = selectedCredential(env, 'FINANCE_DOCUMENTOS_COMPARACION_GRAPH')
      // Even a correctly shaped source credential may not reuse the write app.
      const writeClientId = env.FINANCE_DOCUMENTOS_GRAPH_CLIENT_ID?.toLowerCase()
      if (credential.clientId === writeClientId) fail(503, 'DOCUMENTOS_SELECTED_SOURCE_APP_NOT_SEPARATE', 'La lectura legacy requiere una aplicación dedicada separada del destino write.')
      sourceRoots = parseSelectedSourceRoots(env, options.knownLegacyRoot, dest)
      source = createSelectedTransport(credential, sourceRoots, true, { ...options.sourceDependencies, guard: access }, [dest])
    }
    return { transport: source, roots: sourceRoots! }
  }
  const manual = () => {
    if (!destination) {
      const root = destinationRoot()
      destination = createSelectedTransport(selectedCredential(env, 'FINANCE_DOCUMENTOS_GRAPH'), [root], true,
        { ...options.destinationDependencies, guard: access }, sourceRoots ?? [])
    }
    return { transport: destination, roots: [destinationRoot()] }
  }
  const authorized = new Map<string, ReturnType<typeof createSelectedTransport>>()
  let hashFiles = 0, hashBytes = 0
  const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().slice(0,10) : null
  const providers: ProveedorComparacionReadOnly[] = (['carpetas','manual'] as const).map(providerKey => {
    const scope = providerKey === 'carpetas' ? options.knownLegacyRoot : DOCUMENTOS_PRODUCTION_ROOT
    const read: ProveedorComparacionReadOnly['read'] = async range => {
      await access()
      const { transport, roots } = providerKey === 'carpetas' ? legacy() : manual()
      // Materialize only after every root and descendant succeeds: no partial
      // inventory or download capabilities survive a failed later page/root.
      const listed: Array<{ item: any; driveId: string }> = []
      const seen = new Set<string>()
      for (const root of roots) {
        const files = await transport.listRoot(root)
        for (const item of files) {
          const ref = `${root.driveId}\u0000${item.id}`
          if (seen.has(ref)) fail(502, 'DOCUMENTOS_SELECTED_SCOPES_OVERLAP', 'El mismo objeto aparece en raíces Selected distintas.')
          seen.add(ref)
          if (listed.length >= COMPARACION_LIMITS.graphFilesPerRoot) fail(502, 'DOCUMENTOS_SELECTED_FILE_CAP', 'Inventario Selected excede límite agregado.')
          listed.push({ item, driveId: root.driveId })
        }
      }
      const documents: DocumentoInventarioComparacion[] = []; let withheld = 0
      for (const { item, driveId } of listed) {
        const ref = `${driveId}\u0000${item.id}`
        if (protectedReferences.has(ref)) { withheld += 1; continue }
        let sha256: string | null = null, provenance: DocumentoInventarioComparacion['hashProvenancia'] = 'NO_DISPONIBLE'
        const incidencias: string[] = [], modified = day(item.lastModifiedDateTime)
        if (!modified) incidencias.push('SIN_MODIFIED_AT_GRAPH')
        // Production hashes are byte evidence, never a metadata substitute.
        if (!options.downloadOnly && ((modified && modified >= range.from && modified <= range.to) || selectedForHash.has(ref))) {
          if (!Number.isSafeInteger(item.size) || item.size <= 0 || item.size > COMPARACION_LIMITS.hashBytesPerFile) incidencias.push('HASH_NO_VERIFICABLE_TAMANO')
          else if (hashFiles >= COMPARACION_LIMITS.hashFiles || hashBytes + item.size > COMPARACION_LIMITS.hashBytesTotal) incidencias.push('HASH_CAP: no certificar cobertura de hashes')
          else {
            hashFiles += 1; hashBytes += item.size
            try {
              const bytes = await transport.download(driveId, item.id, COMPARACION_LIMITS.hashBytesPerFile)
              if (bytes.length !== item.size) throw Error('GRAPH_SIZE_CHANGED')
              sha256 = createHash('sha256').update(bytes).digest('hex'); provenance = 'BYTES_GRAPH'
            } catch { incidencias.push('HASH_READ_FAILED: archivo ilegible/cambió/no autorizado') }
          }
        }
        documents.push({ id: item.id, nombre: item.name, referencia: { driveId, itemId: item.id, path: item.fullPath }, sha256, hashProvenancia: provenance,
          fechaFactura: null, fechaFacturaProvenancia: null, modifiedAt: item.lastModifiedDateTime ?? null, createdAt: item.createdDateTime ?? null, origen: providerKey, incidencias })
      }
      await access()
      if (!withheld) for (const document of documents) authorized.set(`${document.referencia!.driveId}\u0000${document.id}`, transport)
      return { key: providerKey, scope, completo: withheld === 0, truncado: false, documentos: documents,
        incidencias: [...roots.map(root => `RAIZ_SELECTED_DECLARADA: ${root.relativeLabel}`),
          ...(withheld ? ['SCOPE_PROTEGIDO_EXCLUIDO: no nombres, bytes ni metadatos de nóminas; inventario incompleto.'] : [])] }
    }
    return { key: providerKey, scope, async read(range) {
      try { return await read(range) } catch (error) {
        // Never return raw provider errors, IDs, credential or token text. Keep
        // exact internal closure causes so missing config isn't fake readiness.
        const code = (error as any)?.code
        if (typeof code !== 'string' || !/^DOCUMENTOS_SELECTED_[A-Z_]+$/.test(code)) throw error
        return { key: providerKey, scope, completo: false, truncado: /_CAP$/.test(code), documentos: [], incidencias: [`${code}: fuente Selected no verificable; sin inventario parcial.`] }
      }
    } }
  })
  return { providers, async readBytes(driveId: string, itemId: string, maxBytes: number) {
    await access()
    const transport = authorized.get(`${driveId}\u0000${itemId}`)
    if (!transport) fail(403, 'DOCUMENTOS_SELECTED_OUTSIDE_ROOT', 'Archivo fuera del inventario Selected completo de esta petición.')
    return transport.download(driveId, itemId, maxBytes)
  } }
}
