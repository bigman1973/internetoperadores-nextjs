import type { GraphFile, InvoiceLibrary, OneDriveReadPort } from './graph-read'
import type {
  DocumentPrivateMetadata,
  ReconciliationProtection,
} from '@/lib/finanzas/finance-document-lifecycle-core'
import type {
  DedupePlan,
  ExistingSource,
  Location,
  NewInvoiceInput,
  NewReviewInput,
  OcrInvoice,
  OcrPort,
  OcrValidation,
  OneDriveDomainPort,
  RegisteredConfirmingSupport,
} from './provider'

export type FakeFolder = { files?: GraphFile[]; error?: Error }

/** Test/staging-only fixture reader. It has no fetch, credentials or mutation API. */
export class FakeOneDriveReadPort implements OneDriveReadPort {
  downloads = 0
  readonly requestedFolders: string[] = []

  constructor(
    private readonly library: InvoiceLibrary,
    private readonly folders: Record<string, FakeFolder>,
    private readonly contents: Record<string, Uint8Array> = {},
  ) {}

  async resolveInvoiceLibrary(): Promise<InvoiceLibrary> { return { ...this.library } }

  async listFolderContents(_driveId: string, folderPath: string, _recursive: boolean): Promise<GraphFile[]> {
    this.requestedFolders.push(folderPath)
    const fixture = this.folders[folderPath]
    if (!fixture) return []
    if (fixture.error) throw fixture.error
    return (fixture.files || []).map(file => ({ ...file, file: file.file ? { ...file.file } : undefined }))
  }

  async downloadFile(_driveId: string, itemId: string, maxBytes: number): Promise<Uint8Array> {
    this.downloads += 1
    const content = this.contents[itemId]
    if (!content || content.byteLength > maxBytes) throw new Error('FAKE_DOWNLOAD_REJECTED')
    return content.slice()
  }
}

/** In-memory domain port proving what the provider asks to mutate, not Prisma behavior. */
export class FakeOneDriveDomainPort implements OneDriveDomainPort<object> {
  readonly sources = new Map<string, ExistingSource>()
  readonly confirmingSupports = new Map<string, RegisteredConfirmingSupport>()
  /** Una declaración revocada es invisible para el worker y debe fallar cerrada. */
  readonly revokedConfirmingSupportKeys = new Set<string>()
  readonly confirmingSupportVersions: Array<{ source: RegisteredConfirmingSupport; version: { lifecycleId: string; snapshotId: string; versionDocumento: number; archivoControladoId: string; sourceHash: string }; actorId: number }> = []
  readonly appliedLocations: Array<{ itemId: string; location: Location }> = []
  readonly invoices: NewInvoiceInput[] = []
  readonly reviews: NewReviewInput[] = []
  readonly calls = { read: 0, lock: 0, location: 0, dedupe: 0, legacy: 0, invoice: 0, review: 0 }
  legacyMatch = false
  dedupe: DedupePlan = { canonicalId: null, conflict: false }
  /** Optional lifecycle ports are set only by the P2 lifecycle mock cases. */
  readB4Protection?: (_tx: object, _source: ExistingSource) => Promise<ReconciliationProtection>
  readPrivateMetadata?: (_tx: object, _source: ExistingSource) => Promise<DocumentPrivateMetadata | null>

  async readSource(itemId: string): Promise<ExistingSource | null> {
    this.calls.read += 1
    return this.sources.get(itemId) || null
  }

  async lockSource(_tx: object, itemId: string): Promise<ExistingSource | null> {
    this.calls.lock += 1
    return this.sources.get(itemId) || null
  }

  async readConfirmingSupport(driveId: string, itemId: string): Promise<RegisteredConfirmingSupport | null> {
    const key = `${driveId}:${itemId}`
    return this.revokedConfirmingSupportKeys.has(key) ? null : this.confirmingSupports.get(key) ?? null
  }

  async lockConfirmingSupport(_tx: object, driveId: string, itemId: string): Promise<RegisteredConfirmingSupport | null> {
    const key = `${driveId}:${itemId}`
    return this.revokedConfirmingSupportKeys.has(key) ? null : this.confirmingSupports.get(key) ?? null
  }

  async registerConfirmingSupportVersion(_tx: object, source: RegisteredConfirmingSupport, version: { lifecycleId: string; snapshotId: string; versionDocumento: number; archivoControladoId: string; sourceHash: string }, actorId: number): Promise<boolean> {
    this.confirmingSupportVersions.push({ source, version, actorId })
    return true
  }

  async updateLocation(_tx: object, source: ExistingSource, location: Location, _actorId: number | null): Promise<boolean> {
    this.calls.location += 1
    this.appliedLocations.push({ itemId: source.id, location })
    this.sources.set(source.id, { ...source, oneDriveDriveId: location.oneDriveDriveId, location })
    return true
  }

  async lockedDedupePlan(_tx: object, _canonKey: string): Promise<DedupePlan> { this.calls.dedupe += 1; return this.dedupe }
  async hasLegacyExactCanonicalMatch(_tx: object, _ocr: OcrInvoice, _canonKey: string): Promise<boolean> { this.calls.legacy += 1; return this.legacyMatch }

  async createInvoice(_tx: object, input: NewInvoiceInput, _actorId: number | null): Promise<void> {
    this.calls.invoice += 1
    this.invoices.push(input)
    this.sources.set(input.itemId, { kind: 'INVOICE', id: input.itemId, oneDriveDriveId: input.location.oneDriveDriveId, location: input.location })
  }

  async createReview(_tx: object, input: NewReviewInput, _actorId: number | null): Promise<void> {
    this.calls.review += 1
    this.reviews.push(input)
    this.sources.set(input.itemId, { kind: 'REVIEW', id: input.itemId, oneDriveDriveId: input.location.oneDriveDriveId, location: input.location })
  }
}

export class FakeOcrPort implements OcrPort {
  calls = 0
  constructor(private readonly result: OcrInvoice, private readonly resultValidation: OcrValidation) {}
  async extract(_base64: string, _mime: string, _fileName: string): Promise<OcrInvoice> { this.calls += 1; return structuredClone(this.result) }
  validateNew(_ocr: OcrInvoice): OcrValidation { return structuredClone(this.resultValidation) }
}
